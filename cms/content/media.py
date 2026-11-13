"""Bounded image storage and conservative garbage collection for CMS uploads.

Original uploads are never persisted: ImageField pre-save writes a metadata-free,
content-addressed JPEG. Database rollbacks may leave a new normalized file behind;
the age-protected audit command collects those only after a later successful save.
"""
import hashlib
import io
import logging
import os
import time
import warnings
from pathlib import Path, PurePosixPath

from django.apps import apps
from django.conf import settings
from django.core.exceptions import ValidationError, SuspiciousFileOperation
from django.core.files.base import ContentFile
from django.db import models, transaction
from PIL import Image, ImageOps, UnidentifiedImageError

logger = logging.getLogger(__name__)
PHOTO_MAX_EDGE = 1600
PHOTO_MAX_BYTES = 250 * 1024
PHOTO_MAX_PIXELS = 16_000_000
PHOTO_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}


def normalize_image(raw):
    """Return a JPEG no larger than 250 KiB/1600 px, preserving orientation only."""
    if not raw or len(raw) > settings.MAX_UPLOAD_BYTES:
        raise ValidationError('Загрузите фото до 5 МБ.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as probe:
                if (probe.format not in {'JPEG', 'PNG', 'WEBP'}
                        or probe.width * probe.height > PHOTO_MAX_PIXELS
                        or getattr(probe, 'is_animated', False)):
                    raise ValueError('Unsupported image.')
                probe.verify()
            with Image.open(io.BytesIO(raw)) as source:
                source.load()
                image = ImageOps.exif_transpose(source)
                image.thumbnail((PHOTO_MAX_EDGE, PHOTO_MAX_EDGE), Image.Resampling.LANCZOS)
                if image.mode in {'RGBA', 'LA'} or 'transparency' in image.info:
                    rgba = image.convert('RGBA')
                    clean = Image.new('RGB', image.size, 'white')
                    clean.paste(rgba, mask=rgba.getchannel('A'))
                else:
                    clean = Image.new('RGB', image.size)
                    clean.paste(image.convert('RGB'))
                # A fresh image has no EXIF, ICC profile, comments or source metadata.
                while True:
                    for quality in (84, 76, 68, 60):
                        output = io.BytesIO()
                        clean.save(output, 'JPEG', quality=quality, optimize=True)
                        encoded = output.getvalue()
                        if len(encoded) <= PHOTO_MAX_BYTES:
                            return encoded
                    # High-noise photographs also get a strict byte ceiling.
                    clean.thumbnail((max(1, int(clean.width * .85)), max(1, int(clean.height * .85))),
                                    Image.Resampling.LANCZOS)
    except (OSError, ValueError, SyntaxError, UnidentifiedImageError,
            Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise ValidationError('Не удалось прочитать фото. Выберите обычный JPG, PNG или WebP до 5 МБ '
                              'и не более 16 мегапикселей. Анимация не поддерживается.') from error


def image_fields(model):
    return [field for field in model._meta.fields if isinstance(field, models.ImageField)]


def referenced_media(using='default'):
    """Current references from every CMS ImageField, including draft records."""
    names = set()
    for model in apps.get_app_config('content').get_models():
        for field in image_fields(model):
            names.update(value for value in model._default_manager.using(using)
                         .exclude(**{field.name: ''}).values_list(field.name, flat=True) if value)
    return names


def _is_link(path):
    return path.is_symlink() or (hasattr(path, 'is_junction') and path.is_junction())


def media_root():
    root = Path(settings.MEDIA_ROOT).absolute()
    if root == root.parent or any(_is_link(part) for part in (root, *root.parents)):
        raise ValueError('MEDIA_ROOT must be a dedicated directory without symbolic links.')
    return root.resolve()


def safe_media_path(name, storage=None):
    """Never follow symlinks or delete outside the explicitly configured MEDIA_ROOT."""
    try:
        relative = PurePosixPath(str(name))
        if relative.is_absolute() or '..' in relative.parts or '\\' in str(name):
            return None
        root = media_root()
        candidate = Path(storage.path(name)) if storage is not None else root.joinpath(*relative.parts)
        candidate = candidate.absolute()
        if not candidate.is_relative_to(root) or candidate == root:
            return None
        if any(_is_link(part) for part in (candidate, *candidate.parents)):
            return None
        resolved = candidate.resolve()
        return resolved if resolved.is_relative_to(root) else None
    except (OSError, ValueError, NotImplementedError, SuspiciousFileOperation):
        return None


def delete_unreferenced(name, storage, using='default'):
    if not name or name in referenced_media(using):
        return False
    path = safe_media_path(name, storage)
    if path is None or not path.is_file():
        return False
    path.unlink(missing_ok=True)
    return True


def prepare_instance_images(sender, instance, using='default', raw=False, **kwargs):
    if raw or sender._meta.app_label != 'content':
        return
    fields = image_fields(sender)
    old = sender._default_manager.using(using).filter(pk=instance.pk).first() if instance.pk and fields else None
    instance._old_content_images = [(getattr(old, field.name).name, field.storage)
                                    for field in fields if old and getattr(old, field.name)]
    for field in fields:
        upload = getattr(instance, field.name)
        if not upload:
            continue
        incoming_stored_name = upload.name if upload._committed else ''
        # Unchanged or deliberately shared stored photos do not get re-encoded.
        if incoming_stored_name and incoming_stored_name in referenced_media(using):
            continue
        upload.seek(0)
        raw_bytes = upload.read(settings.MAX_UPLOAD_BYTES + 1)
        upload.seek(0)
        try:
            encoded = normalize_image(raw_bytes)
        except ValidationError:
            upload.close()
            if incoming_stored_name:
                delete_unreferenced(incoming_stored_name, field.storage, using)
            raise
        upload.close()
        name = field.generate_filename(instance, hashlib.sha256(encoded).hexdigest() + '.jpg')
        # Repeated uploads of the same photograph reuse the normalized bytes.
        if not field.storage.exists(name):
            name = field.storage.save(name, ContentFile(encoded))
        else:
            # A concurrent collector must treat a reused orphan as a new in-flight upload.
            existing = safe_media_path(name, field.storage)
            if existing is not None and existing.is_file():
                os.utime(existing, None)
        if incoming_stored_name and incoming_stored_name != name:
            delete_unreferenced(incoming_stored_name, field.storage, using)
        upload.name = name
        upload._committed = True
        upload._file = None
        if hasattr(upload, '_dimensions_cache'):
            del upload._dimensions_cache
        # ImageField cached dimensions must describe the stored JPEG.
        if isinstance(field, models.ImageField):
            field.update_dimension_fields(instance, force=True)


def saved_instance_images(sender, instance, using='default', **kwargs):
    if sender._meta.app_label != 'content':
        return
    for name, storage in getattr(instance, '_old_content_images', ()):
        transaction.on_commit(lambda name=name, storage=storage: delete_unreferenced(name, storage, using),
                              using=using, robust=True)
    instance._old_content_images = ()


def deleted_instance_images(sender, instance, using='default', **kwargs):
    if sender._meta.app_label != 'content':
        return
    for field in image_fields(sender):
        photo = getattr(instance, field.name)
        if photo:
            transaction.on_commit(lambda name=photo.name, storage=field.storage:
                                  delete_unreferenced(name, storage, using), using=using, robust=True)


def audit_media(*, apply=False, min_age_hours=24, using='default', now=None):
    """Report/collect only orphaned image files older than the grace period."""
    if min_age_hours < 1:
        raise ValueError('Минимальный возраст файлов — 1 час.')
    root = media_root()
    references = referenced_media(using)
    cutoff = (time.time() if now is None else now) - min_age_hours * 3600
    files, total = [], 0
    if not root.exists():
        return {'files': files, 'bytes': total, 'applied': apply}
    for candidate in root.rglob('*'):
        if candidate.suffix.lower() not in PHOTO_EXTENSIONS:
            continue
        name = candidate.relative_to(root).as_posix()
        path = safe_media_path(name)
        if path is None or not path.is_file() or name in references:
            continue
        stat = path.stat()
        if stat.st_mtime > cutoff:
            continue
        # Re-read references immediately before a destructive cleanup.
        if apply and name in referenced_media(using):
            continue
        files.append(name)
        total += stat.st_size
        if apply:
            path.unlink(missing_ok=True)
    return {'files': files, 'bytes': total, 'applied': apply}
