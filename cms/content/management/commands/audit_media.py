"""Inspect/clean only old, unreferenced uploads in this installation's MEDIA_ROOT."""
from django.core.management.base import BaseCommand, CommandError

from content.media import audit_media


class Command(BaseCommand):
    help = 'Показать старые непривязанные фото. Для удаления добавьте --apply; новые файлы сохраняются 24 часа.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true')
        parser.add_argument('--min-age-hours', type=float, default=24)

    def handle(self, *args, apply=False, min_age_hours=24, **options):
        try:
            report = audit_media(apply=apply, min_age_hours=min_age_hours)
        except ValueError as error:
            raise CommandError(str(error)) from error
        self.stdout.write(('Удалено' if apply else 'Найдено (без удаления)')
                          + f": {len(report['files'])} фото, {report['bytes']} байт.")
        for name in report['files']:
            self.stdout.write(name)
