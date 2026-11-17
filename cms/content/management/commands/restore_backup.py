"""Put a full admin backup back on a new, migrated server. Everything currently in the database is replaced."""
from pathlib import Path

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from content.backup import restore_media


class Command(BaseCommand):
    help = ('Восстановить бэкап: --db database.json.gz и/или --media media.tar. Сначала выполните migrate. '
            'Текущие данные базы будут заменены данными из бэкапа.')

    def add_arguments(self, parser):
        parser.add_argument('--db', help='Расшифрованный database.json.gz')
        parser.add_argument('--media', help='Расшифрованный media.tar')
        parser.add_argument('--yes', action='store_true', help='Не спрашивать подтверждение')

    def handle(self, db=None, media=None, yes=False, **options):
        if not db and not media:
            raise CommandError('Укажите --db и/или --media.')
        for path in filter(None, (db, media)):
            if not Path(path).is_file():
                raise CommandError(f'Файл не найден: {path}')
        if db and not db.endswith('.json.gz'):
            raise CommandError('Файл базы должен называться *.json.gz (как его присылает бот после расшифровки).')
        if not yes and input('Данные админки будут заменены бэкапом. Продолжить? [y/N] ').strip().lower() != 'y':
            raise CommandError('Отменено.')
        if db:
            with transaction.atomic():
                call_command('flush', interactive=False, verbosity=0)
                call_command('loaddata', db, verbosity=0)
            self.stdout.write(self.style.SUCCESS('База восстановлена.'))
        if media:
            count = restore_media(media)
            self.stdout.write(self.style.SUCCESS(f'Файлы восстановлены: {count}.'))
