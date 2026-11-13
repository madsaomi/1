"""Event publication keeps the exact instant and never publishes drafts or unsafe links."""
import io
import tempfile
from datetime import datetime, timezone as dt_timezone
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils.dateparse import parse_datetime

from .models import Event
from .serialization import build_content, validate_content, write_content
from .tests import AdminTestCase, CONTENT_FIXTURE


class EventPublicationTests(TestCase):
    def setUp(self):
        call_command('import_content', str(CONTENT_FIXTURE), stdout=io.StringIO())

    def test_export_preserves_instant_and_excludes_unpublished_events(self):
        starts_at = parse_datetime('2030-02-03T18:30:00+05:00')
        Event.objects.create(title='Speaking Club', starts_at=starts_at, order=2)
        Event.objects.create(title='Черновик', starts_at=starts_at, is_published=False)
        Event.objects.create(title='Пробный экзамен', starts_at=starts_at, order=1,
                             description='Практика заданий', url='https://example.org/register?event=one')
        events = build_content()['events']
        self.assertEqual([item['title'] for item in events], ['Пробный экзамен', 'Speaking Club'])
        self.assertEqual(parse_datetime(events[0]['startsAt']), starts_at)
        self.assertEqual(events[0]['url'], 'https://example.org/register?event=one')

    def test_import_export_round_trip_and_legacy_import_remains_supported(self):
        data = build_content()
        data['events'] = [{'title': 'Открытый урок', 'startsAt': '2030-02-03T18:30:00+05:00'}]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'content.js'
            write_content(data, path)
            call_command('import_content', str(path), '--force', stdout=io.StringIO())
        self.assertEqual(Event.objects.count(), 1)
        self.assertEqual(parse_datetime(build_content()['events'][0]['startsAt']),
                         parse_datetime(data['events'][0]['startsAt']))
        call_command('import_content', str(CONTENT_FIXTURE), '--force', stdout=io.StringIO())
        self.assertNotIn('events', build_content())

    def test_invalid_import_rolls_back_existing_events(self):
        event = Event.objects.create(title='Сохранённое событие', starts_at=datetime(2030, 1, 1, tzinfo=dt_timezone.utc))
        data = build_content()
        data['events'][0]['startsAt'] = '2030-02-03T18:30:00'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'content.js'
            write_content(data, path)
            with self.assertRaises(CommandError):
                call_command('import_content', str(path), '--force', stdout=io.StringIO())
        self.assertTrue(Event.objects.filter(pk=event.pk).exists())

    def test_model_and_publication_reject_missing_timezone_and_unsafe_url(self):
        with self.assertRaises(ValidationError):
            Event(title='Урок', starts_at=datetime(2030, 1, 1)).full_clean()
        for url in ('javascript:alert(1)', 'http://example.org/', 'https://user:secret@example.org/'):
            with self.subTest(url=url), self.assertRaises(ValidationError):
                Event(title='Урок', starts_at=datetime(2030, 1, 1, tzinfo=dt_timezone.utc), url=url).full_clean()
        data = build_content()
        data['events'] = [{'title': 'Урок', 'startsAt': 'not-a-date'}]
        with self.assertRaises(CommandError):
            validate_content(data)


class EventAdminTests(AdminTestCase):
    def test_owner_can_create_event_using_local_nukus_time(self):
        self.login()
        response = self.client.post('/admin/content/event/add/', {
            'title': 'Speaking Club', 'description': 'Практика', 'starts_at_0': '2030-02-03',
            'starts_at_1': '18:30:00', 'url': '', 'is_published': 'on', 'order': '0',
        })
        self.assertEqual(response.status_code, 302, response.context and response.context['adminform'].errors)
        self.assertEqual(Event.objects.get().starts_at, parse_datetime('2030-02-03T18:30:00+05:00'))
