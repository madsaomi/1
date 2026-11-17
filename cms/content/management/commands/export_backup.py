"""Save a full admin backup into a folder: database.json.gz and media.tar (the same files the nightly bot sends)."""
from pathlib import Path

from django.core.management.base import BaseCommand

from content.backup import dump_database, media_manifest, write_media_tar


class Command(BaseCommand):
    help = 'Сохранить полный бэкап админки (база и загруженные файлы) в папку.'

    def add_arguments(self, parser):
        parser.add_argument('folder', help='Куда сохранить database.json.gz и media.tar')

    def handle(self, folder, **options):
        target = Path(folder)
        target.mkdir(parents=True, exist_ok=True)
        (target / 'database.json.gz').write_bytes(dump_database())
        with (target / 'media.tar').open('wb') as archive:
            write_media_tar(archive)
        manifest = media_manifest()
        self.stdout.write(self.style.SUCCESS(
            f'Бэкап сохранён в {target}: база и {manifest["files"]} файлов ({manifest["bytes"] // 1024} КБ).'))
