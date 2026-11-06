from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator

photo_extension_validator = FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp'], 'Загрузите фото в формате JPG, PNG или WebP.')


def photo_size_validator(upload):
    if upload.size > settings.MAX_UPLOAD_BYTES:
        raise ValidationError(f'Фото больше {settings.MAX_UPLOAD_BYTES // (1024 * 1024)} МБ — уменьшите его перед загрузкой.')


PHOTO_VALIDATORS = [photo_extension_validator, photo_size_validator]
