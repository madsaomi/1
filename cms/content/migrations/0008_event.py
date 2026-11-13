from django.db import migrations, models
import content.models


class Migration(migrations.Migration):
    dependencies = [('content', '0007_featured_flags')]

    operations = [
        migrations.CreateModel(
            name='Event',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('order', models.PositiveIntegerField(db_index=True, default=0, verbose_name='Порядок')),
                ('title', models.CharField(max_length=120, verbose_name='Название события')),
                ('description', models.TextField(blank=True, max_length=400, verbose_name='Описание')),
                ('starts_at', models.DateTimeField(help_text='Время Нукуса (Asia/Tashkent, UTC+5). Счётчик остановится в момент начала.', verbose_name='Дата и время начала')),
                ('url', models.URLField(blank=True, max_length=500, validators=[content.models.validate_event_url], verbose_name='Ссылка для записи')),
                ('is_published', models.BooleanField(default=True, verbose_name='Показывать на сайте')),
            ],
            options={'verbose_name': 'Событие', 'verbose_name_plural': 'События и обратный отсчёт',
                     'ordering': ['order', 'pk'], 'abstract': False},
        ),
    ]
