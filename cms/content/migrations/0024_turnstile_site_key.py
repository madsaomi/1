import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('content', '0023_teacher_photo_hint'),
    ]

    operations = [
        migrations.AddField(
            model_name='sitesettings',
            name='turnstile_site_key',
            field=models.CharField(blank=True, help_text='Невидимая проверка «я не робот» в анкете и жалобах. Cloudflare → Turnstile → виджет → Site Key. Секретный ключ (Secret Key) вписывается только в Railway, в сервис форм: TURNSTILE_SECRET_KEY. Пусто — проверки нет. Задавайте оба ключа вместе.', max_length=70, validators=[django.core.validators.RegexValidator('^[0-3]x[0-9A-Za-z_-]{16,64}$', 'Ключ сайта из Cloudflare Turnstile, например 0x4AAAA….')], verbose_name='Ключ сайта Cloudflare Turnstile'),
        ),
    ]
