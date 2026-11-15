from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator

photo_extension_validator = FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp'], 'Загрузите фото в формате JPG, PNG или WebP.')


def photo_size_validator(upload):
    if upload.size > settings.MAX_UPLOAD_BYTES:
        raise ValidationError(f'Фото больше {settings.MAX_UPLOAD_BYTES // (1024 * 1024)} МБ — уменьшите его перед загрузкой.')


def photo_content_validator(upload):
    """Surface decoding and pixel-limit errors in the admin form before model.save()."""
    from .media import normalize_image
    position = upload.tell()
    try:
        upload.seek(0)
        normalize_image(upload.read(settings.MAX_UPLOAD_BYTES + 1))
    finally:
        upload.seek(position)


PHOTO_VALIDATORS = [photo_extension_validator, photo_size_validator, photo_content_validator]


video_extension_validator = FileExtensionValidator(['mp4', 'mov', 'webm'], 'Загрузите MP4, MOV или WebM.')


def video_size_validator(upload):
    from .media_video import VIDEO_MAX_UPLOAD_BYTES
    try:
        size = upload.size
    except (OSError, ValueError):
        raise ValidationError('Файл видео не найден. Загрузите его заново.') from None
    if size > VIDEO_MAX_UPLOAD_BYTES:
        raise ValidationError('Видео больше 30 МБ — сократите его перед загрузкой.')


def video_content_validator(upload):
    if getattr(upload, '_committed', False):
        return  # Existing normalized storage files are not transcoded on every text edit.
    from django.db.models.fields.files import FieldFile
    from .media_video import normalized_video_upload
    normalized_video_upload(upload.file if isinstance(upload, FieldFile) else upload)


VIDEO_VALIDATORS = [video_extension_validator, video_size_validator, video_content_validator]
