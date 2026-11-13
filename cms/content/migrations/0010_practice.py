import content.validators
import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('content', '0009_karakalpak_translations')]

    operations = [
        migrations.AlterField(
            model_name='sitesettings', name='demo_mode',
            field=models.BooleanField(default=False, help_text='Включен: на сайте плашка «Демо-версия» и метки «Пример». Выключите, когда все данные реальные.', verbose_name='Демо-режим'),
        ),
        migrations.AlterField(
            model_name='teacher', name='photo',
            field=models.ImageField(blank=True, help_text='Вертикальное 4:5, JPG/PNG/WebP до 5 МБ. Фото сжимается автоматически. Без фото — логотип Stanford.', upload_to='teachers/', validators=[django.core.validators.FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp'], 'Загрузите фото в формате JPG, PNG или WebP.'), content.validators.photo_size_validator], verbose_name='Фото'),
        ),
        migrations.AlterField(
            model_name='teacher', name='featured',
            field=models.BooleanField(default=False, help_text='Отмеченные показываются в секции «Преподаватели» на главной; полный список — на странице преподавателей.', verbose_name='Топ'),
        ),
        migrations.CreateModel(
            name='Practice',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('order', models.PositiveIntegerField(db_index=True, default=0, verbose_name='Порядок')),
                ('slug', models.CharField(blank=True, max_length=40, unique=True, validators=[django.core.validators.RegexValidator('^[a-z0-9-]+$', 'Только строчные латинские буквы, цифры и дефис.')], verbose_name='Код')),
                ('title', models.CharField(max_length=120, verbose_name='Название занятия')),
                ('description', models.TextField(max_length=400, verbose_name='Описание')),
                ('label', models.CharField(blank=True, help_text='Например: Speaking, Movie или Exams. Можно оставить пустым.', max_length=40, verbose_name='Короткая подпись')),
                ('photo', models.ImageField(blank=True, help_text='JPG, PNG или WebP до 5 МБ. Обложка 16:10. Фото сжимается автоматически.', upload_to='practice/', validators=[django.core.validators.FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp'], 'Загрузите фото в формате JPG, PNG или WebP.'), content.validators.photo_size_validator], verbose_name='Реальное фото занятия')),
                ('photo_path', models.CharField(blank=True, help_text='Сохраняется при импорте. Загруженное фото имеет приоритет.', max_length=240, validators=[django.core.validators.RegexValidator(r'^assets/(?:[a-z0-9_-]+/)*[a-z0-9_-]+\.(?:jpg|jpeg|png|webp)$', 'Допустим только локальный путь assets/… к JPG, PNG или WebP.')], verbose_name='Фото из файлов сайта')),
                ('photo_alt', models.CharField(blank=True, help_text='Кратко опишите, что изображено. Например: участники обсуждают тему в группе.', max_length=160, verbose_name='Описание фотографии')),
                ('is_published', models.BooleanField(default=False, verbose_name='Показывать на сайте')),
            ],
            options={'verbose_name': 'Занятие вне уроков', 'verbose_name_plural': 'Практика вне уроков и фото', 'ordering': ['order', 'pk']},
        ),
    ]
