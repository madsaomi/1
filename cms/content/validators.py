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
