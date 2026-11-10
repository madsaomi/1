"""Initial content import from the explicitly configured publication branch."""
import tempfile
from pathlib import Path

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from content.github import GitHubError
from content.publish import github_client
from content.serialization import sync_page_texts


class Command(BaseCommand):
    help = 'Первый импорт данных из SITE_GITHUB_REPOSITORY/BRANCH; заполненная база защищена от перезаписи.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--sync-texts', action='store_true',
                            help='Только добавить новые места текста после обновления шаблонов, сохранив текущие записи.')

    def handle(self, *args, **options):
        try:
            with tempfile.TemporaryDirectory(prefix='stanford-import-') as temporary:
                root = Path(temporary)
                github_client().snapshot(root)
                if options['sync_texts']:
                    from django.db import transaction
                    with transaction.atomic():
                        count = sync_page_texts(root)
                        if options['dry_run']:
                            transaction.set_rollback(True)
                    self.stdout.write(f'Новые места текста: {count}. Существующие записи сохранены.')
                else:
                    call_command('import_content', str(root / 'content.js'), dry_run=options['dry_run'],
                                 stdout=self.stdout, stderr=self.stderr)
        except GitHubError as error:
            raise CommandError(str(error)) from None
