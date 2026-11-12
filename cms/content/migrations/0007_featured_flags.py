# Hand-written: admin-configured tops for the home page sections (build.mjs reads `featured`).
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('content', '0006_manual_content_and_photos'),
    ]

    operations = [
        migrations.AddField(
            model_name='teacher',
            name='featured',
            field=models.BooleanField(default=False, help_text='Отмеченные показываются в секции «Преподаватели» на главной; полный список — на странице результатов.', verbose_name='Топ'),
        ),
        migrations.AddField(
            model_name='studentresult',
            name='featured',
            field=models.BooleanField(default=False, help_text='Отмеченные показываются в блоке «Результаты студентов» на главной; полный список — на странице результатов.', verbose_name='Топ'),
        ),
    ]
