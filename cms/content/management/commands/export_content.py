"""Write the canonical content.js from the database (PLAN-044 stage 3).

Runs without Node: it only serializes the database into the `window.schoolContent = {…};` structure that
build.mjs consumes. Photo references are included; uploaded image bytes are copied by publish_site,
not this data-only command. Server publication is configured separately through SITE_PUBLISH_TARGET.
"""
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from content.serialization import build_content, build_uz_strings, validate_content, write_content, write_uz_strings


class Command(BaseCommand):
    help = 'Экспорт содержимого базы в канонический content.js (--output задает путь).'

    def add_arguments(self, parser):
        parser.add_argument('--output', default=str(settings.SITE_ROOT / 'content.js'),
                            help='Куда записать content.js (по умолчанию ../content.js).')
        parser.add_argument('--uz-output', default=None,
                            help='Какой uz.js обновить (по умолчанию assets/i18n/uz.js рядом с content.js, если есть).')

    def handle(self, *args, output, uz_output=None, **options):
        uz_path = Path(uz_output) if uz_output else Path(output).resolve().parent / 'assets' / 'i18n' / 'uz.js'
        try:
            with transaction.atomic():
                data = build_content()
                validate_content(data)
                write_content(data, output)
                if uz_output or uz_path.is_file():
                    write_uz_strings(uz_path, build_uz_strings())
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
        self.stdout.write('Для сборки страниц и переноса загруженных фото используйте кнопку публикации в админке.')
