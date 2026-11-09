"""Load content.js into the database: first launch, restore after data loss, or the export round trip.

Without --force the command refuses to overwrite a non-empty database. --dry-run validates a file and
shows what would be imported inside a transaction that is always rolled back, so nothing is saved.
"""
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, transaction

from content.models import (AdmissionsTelegram, CashbackRule, CashbackTier, Contacts, Course, CourseSkill, Location,
                            MapLink, Phone, SiteSettings, Stat, StudentResult, Teacher)
from content.serialization import CONTENT_MODELS, read_content


def _format_errors(error):
    if hasattr(error, 'message_dict'):
        return '; '.join(f'{field}: {"; ".join(messages)}' for field, messages in error.message_dict.items())
    return '; '.join(error.messages)


class Command(BaseCommand):
    help = 'Импорт content.js в базу админки (--force заменяет текущие данные, --dry-run только проверяет).'

    def add_arguments(self, parser):
        parser.add_argument('path', nargs='?', default=str(settings.SITE_ROOT / 'content.js'),
                            help='Путь к content.js (по умолчанию ../content.js).')
        parser.add_argument('--dry-run', action='store_true', help='Проверить файл и показать итог, ничего не сохраняя.')
        parser.add_argument('--force', action='store_true', help='Заменить уже загруженное содержимое.')

    def handle(self, *args, path, dry_run=False, force=False, **options):
        data = read_content(path)
        has_content = any(model.objects.exists() for model in CONTENT_MODELS)
        if has_content and not force and not dry_run:
            raise CommandError('В базе уже есть содержимое. Ничего не изменено: используйте --force для замены '
                               'или --dry-run для проверки файла.')
        try:
            with transaction.atomic():
                summary = self._replace(data)
                if dry_run:
                    transaction.set_rollback(True)
        except ValidationError as error:
            raise CommandError(f'Данные не прошли проверку: {_format_errors(error)}') from error
        except IntegrityError as error:
            raise CommandError(f'Конфликт уникальности в данных: {error}') from error
        except (KeyError, TypeError, ValueError) as error:
            raise CommandError(f'Структура content.js не совпадает с ожидаемой: {error}') from error

        prefix = 'Пробный прогон (ничего не сохранено): ' if dry_run else 'Импортировано: '
        message = prefix + self._summary_text(summary)
        self.stdout.write(self.style.WARNING(message) if dry_run else self.style.SUCCESS(message))
        self.stdout.write(f'Источник: {path}')

    @staticmethod
    def _summary_text(summary):
        return (f"курсов {summary['courses']}, преподавателей {summary['teachers']}, "
                f"результатов {summary['results']}, филиалов {summary['locations']}, "
                f"ступеней кэшбэка {summary['cashback']}.")

    @staticmethod
    def _save(obj):
        """full_clean() mirrors build.mjs validation: the database must never hold unpublishable content."""
        obj.full_clean()
        obj.save()
        return obj

    def _replace(self, data):
        # Children are listed before their parents; see CONTENT_MODELS.
        for model in CONTENT_MODELS:
            model.objects.all().delete()

        site = data.get('site') or {}
        self._save(SiteSettings(demo_mode=site.get('demoMode', True), demo_labels=site.get('demoLabels', True),
                                site_url=site.get('url') or '', city=site.get('city') or ''))

        for order, stat in enumerate(data.get('stats') or []):
            self._save(Stat(order=order, value=stat['value'], label=stat['label']))

        cashback = data.get('cashback') or {}
        cashback_tiers = 0
        for exam, _label in CashbackTier.EXAMS:
            for order, tier in enumerate(cashback.get(exam) or []):
                self._save(CashbackTier(exam=exam, order=order, score=tier['score'], reward=tier['reward'],
                                        label=tier.get('label') or '', hero=tier.get('hero', False)))
                cashback_tiers += 1
        for order, rule in enumerate(cashback.get('rules') or []):
            self._save(CashbackRule(order=order, title=rule['title'], text=rule['text']))

        for order, item in enumerate(data.get('courses') or []):
            course = self._save(Course(order=order, slug=item['id'], name=item['name'],
                                       subtitle=item.get('subtitle') or '', category=item['category'],
                                       description=item['description'], price=item['price'],
                                       special_price=item.get('specialPrice'), target=item['target']))
            for skill_order, skill in enumerate(item.get('skills') or []):
                self._save(CourseSkill(course=course, order=skill_order, text=skill))

        for order, item in enumerate(data.get('teachers') or []):
            self._save(Teacher(order=order, name=item['name'], role=item['role'],
                               qualification=item.get('qualification') or '', experience=item.get('experience') or ''))

        for order, item in enumerate(data.get('results') or []):
            self._save(StudentResult(order=order, score=item['score'], exam=item['exam'],
                                     level=item.get('level') or '', quote=item['quote'], student=item['student'],
                                     course=item.get('course') or '', consent=item.get('consent', False)))

        source = data.get('contacts') or {}
        contacts = Contacts(verified=source.get('verified', False), hr_telegram=source.get('hrTelegram') or '',
                            instagram=source.get('instagram') or '')
        contacts.save()
        for order, number in enumerate(source.get('phones') or []):
            self._save(Phone(contacts=contacts, order=order, number=number))
        for order, url in enumerate(source.get('telegrams') or []):
            self._save(AdmissionsTelegram(contacts=contacts, order=order, url=url))
        # Channel-dependent checks (verified needs a channel, HR Telegram is separate) run after the inlines exist.
        contacts.full_clean()

        for order, item in enumerate(source.get('locations') or []):
            if item.get('coordinates'):
                longitude, latitude = (Decimal(str(value)) for value in item['coordinates'])
            else:
                longitude, latitude = None, None
            location = self._save(Location(order=order, slug=item['id'], name=item['name'], address=item['address'],
                                           longitude=longitude, latitude=latitude,
                                           google_embed=item.get('googleEmbed') or ''))
            for map_order, link in enumerate(item.get('maps') or []):
                self._save(MapLink(location=location, order=map_order, provider=link['provider'], url=link['url']))

        return {
            'courses': Course.objects.count(),
            'teachers': Teacher.objects.count(),
            'results': StudentResult.objects.count(),
            'locations': Location.objects.count(),
            'cashback': cashback_tiers,
        }
