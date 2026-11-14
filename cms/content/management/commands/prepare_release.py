"""Explicit, reversible content upgrade for an already populated CMS."""
import tempfile
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError

from content.github import GitHubError
from content.publish import github_client
from content.release import prepare_release


class Command(BaseCommand):
    help = 'После migrate: безопасно подготовить существующую базу. По умолчанию только dry-run; запись через --apply.'

    def add_arguments(self, parser):
        source = parser.add_mutually_exclusive_group(required=True)
        source.add_argument('--site-root', help='Каталог актуального сайта с content.js и обоими словарями.')
        source.add_argument('--from-github', action='store_true',
                            help='Снимок явно заданных SITE_GITHUB_REPOSITORY и SITE_GITHUB_BRANCH.')
        mode = parser.add_mutually_exclusive_group()
        mode.add_argument('--apply', action='store_true', help='Записать изменения с приватной JSON-копией до коммита.')
        mode.add_argument('--dry-run', action='store_true', help='Проверить изменения без записи (по умолчанию).')

    def handle(self, *args, **options):
        try:
            if options['from_github']:
                with tempfile.TemporaryDirectory(prefix='stanford-release-') as temporary:
                    root = Path(temporary)
                    client = github_client()
                    snapshot = client.snapshot(root)
                    result = prepare_release(root, apply=options['apply'], source={
                        'kind': 'github', 'repository': client.repository, 'branch': client.branch,
                        'commit': snapshot['parent']})
            else:
                root = Path(options['site_root']).resolve()
                result = prepare_release(root, apply=options['apply'], source={'kind': 'local'})
        except GitHubError as error:
            raise CommandError(str(error)) from None
        except (OSError, ValidationError, IntegrityError, TypeError, KeyError, ValueError):
            # Neither external response bodies nor source strings/credentials belong
            # in release logs. A failure always rolls back the database transaction.
            raise CommandError('Подготовка релиза не завершена. Проверьте исходники, миграции и доступность '
                               'приватного каталога резервных копий. База не изменена.') from None
        prefix = 'Применено' if options['apply'] else 'Пробный прогон, ничего не сохранено'
        self.stdout.write(f'{prefix}. Изменения: {int(result["changed"])}.')
        self.stdout.write(', '.join(f'{key}: {value}' for key, value in result['counts'].items()))
        if result['backup']:
            self.stdout.write(f'Резервная копия (MEDIA_ROOT): {result["backup"]}')
