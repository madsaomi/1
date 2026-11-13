import content.validators
import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('content', '0010_practice'),
    ]

    operations = [
        migrations.AlterField(
            model_name='location',
            name='photo',
            field=models.ImageField(blank=True, help_text='JPG, PNG или WebP до 5 МБ.', upload_to='branches/', validators=[django.core.validators.FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp'], 'Загрузите фото в формате JPG, PNG или WebP.'), content.validators.photo_size_validator, content.validators.photo_content_validator], verbose_name='Фото входа'),
        ),
        migrations.AlterField(
            model_name='practice',
            name='photo',
            field=models.ImageField(blank=True, help_text='JPG, PNG или WebP до 5 МБ. Обложка 16:10. Фото сжимается автоматически.', upload_to='practice/', validators=[django.core.validators.FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp'], 'Загрузите фото в формате JPG, PNG или WebP.'), content.validators.photo_size_validator, content.validators.photo_content_validator], verbose_name='Реальное фото занятия'),
        ),
        migrations.AlterField(
            model_name='teacher',
            name='photo',
            field=models.ImageField(blank=True, help_text='Вертикальное 4:5, JPG/PNG/WebP до 5 МБ. Фото сжимается автоматически. Без фото — логотип Stanford.', upload_to='teachers/', validators=[django.core.validators.FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp'], 'Загрузите фото в формате JPG, PNG или WebP.'), content.validators.photo_size_validator, content.validators.photo_content_validator], verbose_name='Фото'),
        ),
    ]
