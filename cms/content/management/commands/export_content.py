"""Write the canonical content.js from the database (PLAN-044 stage 3).

Runs without Node: it only serializes the database into the `window.schoolContent = {…};` structure that
build.mjs consumes. Publication through the GitHub API (stage 4) is not implemented here: the owner's
token has to be configured first. Photos are not exported — see content/serialization.py.
"""
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from content.serialization import build_content, validate_content, write_content


class Command(BaseCommand):
    help = 'Экспорт содержимого базы в канонический content.js (--output задает путь).'

    def add_arguments(self, parser):
        parser.add_argument('--output', default=str(settings.SITE_ROOT / 'content.js'),
                            help='Куда записать content.js (по умолчанию ../content.js).')

    def handle(self, *args, output, **options):
        try:
            with transaction.atomic():
                data = build_content()
                validate_content(data)
                write_content(data, output)
        except CommandError:
            raise
        except OSError as error:
            raise CommandError(f'Не удалось записать {output}: {error.strerror or error}') from error
        path = Path(output)
        try:
            shown = path.resolve().relative_to(settings.BASE_DIR)
        except ValueError:
            shown = path
        self.stdout.write(self.style.SUCCESS(
            f'Экспортировано: курсов {len(data["courses"])}, преподавателей {len(data["teachers"])}, '
            f'результатов {len(data["results"])}, филиалов {len(data["contacts"]["locations"])}, '
            f'ступеней кэшбэка {sum(len(data.get("cashback", {}).get(exam, [])) for exam in ("ielts", "sat"))}.'))
        self.stdout.write(f'Файл: {shown}')
        self.stdout.write('Проверка публикации: node build.mjs (этап 4 — коммит через GitHub API — еще не реализован).')
