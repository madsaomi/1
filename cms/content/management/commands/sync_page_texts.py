"""Discover new editable slots after a site template update, without overwriting owner drafts."""
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from content.serialization import sync_page_texts


class Command(BaseCommand):
    help = 'Добавить новые места редактирования из HTML, сохранив существующие тексты и переводы.'

    def add_arguments(self, parser):
        parser.add_argument('--site-root', default=str(settings.SITE_ROOT), help='Папка с HTML-страницами сайта.')

    @transaction.atomic
    def handle(self, *args, site_root, **options):
        root = Path(site_root)
        if not (root / 'index.html').is_file():
            raise CommandError('В указанной папке нет index.html.')
        count = sync_page_texts(root)
        self.stdout.write(self.style.SUCCESS(f'Добавлено мест редактирования: {count}. Существующие тексты сохранены.'))
