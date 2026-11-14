"""Seed dictionaries after a language is introduced, preserving every saved owner translation."""
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from content.serialization import (TRANSLATION_LANGUAGES, load_translation_strings, read_translation_strings)


class Command(BaseCommand):
    help = 'Добавить недостающие переводы из словарей сайта, сохранив существующие переводы и черновики.'

    def add_arguments(self, parser):
        parser.add_argument('--language', choices=TRANSLATION_LANGUAGES)
        parser.add_argument('--site-root', default=str(settings.SITE_ROOT))

    def handle(self, *args, language=None, site_root=None, **options):
        languages = (language,) if language else TRANSLATION_LANGUAGES
        with transaction.atomic():
            for code in languages:
                path = Path(site_root) / 'assets' / 'i18n' / f'{code}.js'
                if not path.is_file():
                    continue
                summary = load_translation_strings(read_translation_strings(path), code, overwrite=False)
                self.stdout.write(f"{code}: текстов страницы {summary['page_texts']}, общих переводов {summary['translations']}; "
                                  'сохранённые переводы не перезаписаны.')
