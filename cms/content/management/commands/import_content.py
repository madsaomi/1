"""Load content.js into the database: first launch, restore after data loss, or the export round trip.

Without --force the command refuses to overwrite a non-empty database. --dry-run validates a file and
shows what would be imported inside a transaction that is always rolled back, so nothing is saved.
"""
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, transaction
from django.utils.dateparse import parse_datetime
from django.utils import timezone

from pathlib import Path

from content.models import (AdmissionsTelegram, CashbackRule, CashbackTier, Contacts, Course, CourseSkill, Event, Faq,
                            Location, MapLink, PageText, Phone, Practice, SiteSettings, Stat, StudentResult, Teacher)
from content.serialization import (CONTENT_MODELS, TRANSLATION_LANGUAGES, build_content, build_translation_strings,
                                   load_translation_strings, read_content, read_translation_strings,
                                   sync_page_texts, validate_content)


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
        parser.add_argument('--uz', default=None,
                            help='Словарь узбекского (по умолчанию assets/i18n/uz.js рядом с content.js, если есть).')
        parser.add_argument('--kaa', default=None,
                            help='Словарь каракалпакского (по умолчанию assets/i18n/kaa.js рядом с content.js, если есть).')

    def handle(self, *args, path, dry_run=False, force=False, uz=None, kaa=None, **options):
        data = read_content(path)
        incoming = {}
        for language, explicit in (('uz', uz), ('kaa', kaa)):
            dictionary = Path(explicit) if explicit else Path(path).resolve().parent / 'assets' / 'i18n' / f'{language}.js'
            if explicit or dictionary.is_file():
                incoming[language] = read_translation_strings(dictionary)
        has_content = any(model.objects.exists() for model in CONTENT_MODELS)
        if has_content and not force and not dry_run:
            raise CommandError('В базе уже есть содержимое. Ничего не изменено: используйте --force для замены '
                               'или --dry-run для проверки файла.')
        try:
            with transaction.atomic():
                # A content-only restore must not discard translations in the other language.
                preserved = {language: build_translation_strings(language) for language in TRANSLATION_LANGUAGES}
                summary = self._replace(data)
                sync_page_texts(Path(path).resolve().parent)
                summary['texts'] = PageText.objects.count()
                validate_content(build_content())
                for language, strings in preserved.items():
                    load_translation_strings(strings, language)
                for language, strings in incoming.items():
                    summary[language] = load_translation_strings(strings, language)
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
        for language, label in (('uz', 'Узбекский'), ('kaa', 'Каракалпакский')):
            if language in summary:
                self.stdout.write(f"{label}: текстов страницы с переводом {summary[language]['page_texts']}, "
                                  f"общих переводов {summary[language]['translations']}.")
        self.stdout.write(f'Источник: {path}')

    @staticmethod
    def _summary_text(summary):
        return (f"текстов страницы {summary['texts']}, вопросов {summary['faq']}, "
                f"курсов {summary['courses']}, преподавателей {summary['teachers']}, "
                f"результатов {summary['results']}, филиалов {summary['locations']}, "
                f"ступеней кэшбэка {summary['cashback']}, событий {summary['events']}, занятий {summary['practices']}.")

    @staticmethod
    def _save(obj):
        """full_clean() mirrors build.mjs validation: the database must never hold unpublishable content."""
        obj.full_clean()
        obj.save()
        return obj

    def _replace(self, data):
        practices = data.get('practices', [])
        if not isinstance(practices, list) or len(practices) > 100:
            raise ValueError('Практика вне уроков должна быть списком до 100 занятий.')
        # Children are listed before their parents; see CONTENT_MODELS.
        for model in CONTENT_MODELS:
            model.objects.all().delete()

        site = data.get('site') or {}
        self._save(SiteSettings(demo_mode=site.get('demoMode', False), demo_labels=site.get('demoLabels', True),
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
                               qualification=item.get('qualification') or '', experience=item.get('experience') or '',
                               featured=bool(item.get('featured')), photo_path=item.get('photo') or ''))

        for order, item in enumerate(data.get('results') or []):
            self._save(StudentResult(order=order, score=item['score'], exam=item['exam'],
                                     level=item.get('level') or '', quote=item['quote'], student=item['student'],
                                     course=item.get('course') or '', featured=bool(item.get('featured')),
                                     consent=item.get('consent', False)))

        for order, item in enumerate(data.get('events') or []):
            starts_at = parse_datetime(item['startsAt'])
            if starts_at is None or timezone.is_naive(starts_at):
                raise ValueError('У события нужна дата startsAt с часовым поясом.')
            self._save(Event(order=order, title=item['title'], description=item.get('description') or '',
                             starts_at=starts_at, url=item.get('url') or ''))

        for order, item in enumerate(practices):
            self._save(Practice(order=order, slug=item['id'], title=item['title'], description=item['description'],
                                label=item.get('label') or '', photo_path=item.get('photo') or '',
                                photo_alt=item.get('photoAlt') or '', is_published=True))

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
                                           google_embed=item.get('googleEmbed') or '', photo_path=item.get('photo') or ''))
            for map_order, link in enumerate(item.get('maps') or []):
                self._save(MapLink(location=location, order=map_order, provider=link['provider'], url=link['url']))

        for order, item in enumerate(data.get('faq') or []):
            self._save(Faq(order=order, question=item['question'], answer=item['answer']))
        for order, (key, value) in enumerate((data.get('texts') or {}).items()):
            self._save(PageText(order=order, key=key, text=value))

        return {
            'texts': PageText.objects.count(),
            'faq': Faq.objects.count(),
            'courses': Course.objects.count(),
            'teachers': Teacher.objects.count(),
            'results': StudentResult.objects.count(),
            'locations': Location.objects.count(),
            'cashback': cashback_tiers,
            'events': Event.objects.count(),
            'practices': Practice.objects.count(),
        }
