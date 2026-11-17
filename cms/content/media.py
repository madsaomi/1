"""Bounded image storage and conservative garbage collection for CMS uploads.

Original uploads are never persisted: ImageField pre-save writes a metadata-free,
content-addressed JPEG. Replaced/deleted files stay for the orphan grace period so
a database backup can still collect its referenced media after an administrator edit.
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
MANAGED_MEDIA_EXTENSIONS = PHOTO_EXTENSIONS | {'.mp4', '.mov', '.webm'}
# Phones get a lighter WebP copy of every published photo wider than this; the JPEG stays for large screens.
PHOTO_SMALL_WIDTH = 800


def small_variant_path(path):
    """assets/uploads/<hash>.jpg -> assets/uploads/<hash>-800.webp (same folder, derived name)."""
    return f'{path[:-len(".jpg")]}-{PHOTO_SMALL_WIDTH}.webp'


def small_webp(jpeg):
    """Deterministic metadata-free WebP at most 800 px wide, or None for narrow or unreadable photos."""
    try:
        with Image.open(io.BytesIO(jpeg)) as source:
            if source.format != 'JPEG' or source.width <= PHOTO_SMALL_WIDTH:
                return None
            source.load()
            image = Image.new('RGB', source.size)
            image.paste(source.convert('RGB'))
        image.thumbnail((PHOTO_SMALL_WIDTH, PHOTO_MAX_EDGE), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, 'WEBP', quality=78, method=6)
        return output.getvalue()
    except (OSError, ValueError, SyntaxError, UnidentifiedImageError, Image.DecompressionBombError):
        return None


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


def file_fields(model):
    return [field for field in model._meta.fields if isinstance(field, models.FileField)]


def referenced_media(using='default'):
    """Current references from every CMS ImageField, including draft records."""
    names = set()
    for model in apps.get_app_config('content').get_models():
        for field in file_fields(model):
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


def refresh_media_grace(name, storage):
    """Start the collection grace period without following links or leaving MEDIA_ROOT."""
    path = safe_media_path(name, storage)
    if path is None or not path.is_file():
        return False
    os.utime(path, None)
    return True


def retire_unreferenced(name, storage, using='default'):
    """Retain a newly orphaned file; audit_media removes it after the grace period."""
    if not name or name in referenced_media(using):
        return False
    return refresh_media_grace(name, storage)


def delete_unreferenced(name, storage, using='default'):
    """Remove new originals, but retain a reused content-addressed upload for backups."""
    if not name or name in referenced_media(using):
        return False
    path = safe_media_path(name, storage)
    if path is None or not path.is_file():
        return False
    limit = PHOTO_MAX_BYTES if path.suffix == '.jpg' else None
    if path.suffix == '.mp4':
        from .media_video import VIDEO_MAX_BYTES
        limit = VIDEO_MAX_BYTES
    if limit and len(path.stem) == 64 and all(letter in '0123456789abcdef' for letter in path.stem):
        with path.open('rb') as source:
            raw = source.read(limit + 1)
        if len(raw) <= limit and hashlib.sha256(raw).hexdigest() == path.stem:
            # A stored path may be an orphan from an earlier DB snapshot, not a new original.
            return refresh_media_grace(name, storage)
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
        previous = getattr(old, field.name) if old else None
        if previous and (not upload or not upload._committed or upload.name != previous.name):
            # Protect it before the last DB reference disappears, then refresh again on commit.
            refresh_media_grace(previous.name, field.storage)
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
        # generate_filename() returns OS separators; stored names always use «/», as storage.save() does.
        name = field.generate_filename(instance, hashlib.sha256(encoded).hexdigest() + '.jpg').replace('\\', '/')
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


def prepare_gallery_video(sender, instance, using='default', raw=False, **kwargs):
    if raw or sender._meta.label_lower != 'content.mediaitem':
        return
    old = sender._default_manager.using(using).filter(pk=instance.pk).first() if instance.pk else None
    instance._old_content_videos = [(old.video.name, old.video.storage)] if old and old.video else []
    if old and old.video and (not instance.video or not instance.video._committed or instance.video.name != old.video.name):
        refresh_media_grace(old.video.name, old.video.storage)
    if not instance.video:
        instance.poster = ''
        return
    upload = instance.video
    incoming_name = upload.name if upload._committed else ''
    if incoming_name and incoming_name in referenced_media(using):
        return
    from .media_video import normalized_video_upload
    try:
        encoded, poster = normalized_video_upload(upload.file)
    except ValidationError:
        upload.close()
        if incoming_name:
            delete_unreferenced(incoming_name, upload.storage, using)
        raise
    upload.close()
    name = upload.field.generate_filename(instance, hashlib.sha256(encoded).hexdigest() + '.mp4').replace('\\', '/')
    if not upload.storage.exists(name):
        name = upload.storage.save(name, ContentFile(encoded))
    else:
        existing = safe_media_path(name, upload.storage)
        if existing is not None and existing.is_file():
            os.utime(existing, None)
    if incoming_name and incoming_name != name:
        delete_unreferenced(incoming_name, upload.storage, using)
    upload.name, upload._committed, upload._file = name, True, None
    instance.poster = ContentFile(poster, name=hashlib.sha256(poster).hexdigest() + '.jpg')


def saved_instance_images(sender, instance, using='default', **kwargs):
    if sender._meta.app_label != 'content':
        return
    for name, storage in getattr(instance, '_old_content_images', ()):
        transaction.on_commit(lambda name=name, storage=storage: retire_unreferenced(name, storage, using),
                              using=using, robust=True)
    instance._old_content_images = ()
    for name, storage in getattr(instance, '_old_content_videos', ()):
        transaction.on_commit(lambda name=name, storage=storage: retire_unreferenced(name, storage, using),
                              using=using, robust=True)
    instance._old_content_videos = ()


def protect_deleted_instance_images(sender, instance, **kwargs):
    if sender._meta.app_label != 'content':
        return
    for field in file_fields(sender):
        upload = getattr(instance, field.name)
        if upload:
            refresh_media_grace(upload.name, field.storage)


def deleted_instance_images(sender, instance, using='default', **kwargs):
    if sender._meta.app_label != 'content':
        return
    for field in file_fields(sender):
        photo = getattr(instance, field.name)
        if photo:
            transaction.on_commit(lambda name=photo.name, storage=field.storage:
                                  retire_unreferenced(name, storage, using), using=using, robust=True)


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
        if candidate.suffix.lower() not in MANAGED_MEDIA_EXTENSIONS:
            continue
        name = candidate.relative_to(root).as_posix()
        path = safe_media_path(name)
        if path is None or not path.is_file() or name in references:
            continue
        stat = path.stat()
        if stat.st_mtime > cutoff:
            continue
        # A save may have reused/retired it while the collector read references.
        if apply:
            if name in referenced_media(using) or path.stat().st_mtime > cutoff:
                continue
        files.append(name)
        total += stat.st_size
        if apply:
            path.unlink(missing_ok=True)
    return {'files': files, 'bytes': total, 'applied': apply}
