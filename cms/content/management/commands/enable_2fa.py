"""Connect an authenticator app (Google Authenticator) to an admin account.

The secret is shown only to whoever runs the command: saved as a QR image + link file (default),
or printed to that person's own terminal with --print. It is never logged elsewhere.
"""
from pathlib import Path

import qrcode
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django_otp.plugins.otp_totp.models import TOTPDevice


class Command(BaseCommand):
    help = 'Подключить приложение-аутентификатор к учетной записи (заменяет прежнее устройство).'

    def add_arguments(self, parser):
        parser.add_argument('username')
        parser.add_argument('--output', default=settings.BASE_DIR / '.local-2fa', help='Папка для QR-кода и ссылки.')
        parser.add_argument('--print', action='store_true', help='Показать ссылку в терминале вместо файла.')

    def handle(self, *args, username, output, **options):
        try:
            user = get_user_model().objects.get(username=username)
        except get_user_model().DoesNotExist as error:
            raise CommandError(f'Нет пользователя {username}') from error
        TOTPDevice.objects.filter(user=user).delete()
        device = TOTPDevice.objects.create(user=user, name='Authenticator', confirmed=True)
        if options['print']:
            self.stderr.write(self.style.WARNING(
                'Внимание: ссылка содержит секрет для входа. Вывод терминала может попасть в логи сервиса '
                '(например, Railway), поэтому не публикуйте его и очистите логи после подключения.'))
            self.stdout.write('Отсканируйте эту ссылку в приложении (или введите ее вручную):')
            self.stdout.write(device.config_url)
            return
        folder = Path(output)
        folder.mkdir(parents=True, exist_ok=True)
        qrcode.make(device.config_url).save(folder / f'{username}-qr.png')
        (folder / f'{username}-link.txt').write_text(device.config_url + '\n', encoding='utf-8')
        self.stdout.write(self.style.SUCCESS(f'Готово: отсканируйте {folder / f"{username}-qr.png"} в Google Authenticator.'))
