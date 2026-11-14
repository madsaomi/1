"""Real activity editing and safe reuse of existing content as a draft template."""
import io
import tempfile
from pathlib import Path

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.urls import reverse
from django.utils.dateparse import parse_datetime

from .models import Event, Practice, SiteSettings, StudentResult, Teacher
from .serialization import build_content, validate_content, write_content
from .tests import AdminTestCase, CONTENT_FIXTURE


class PracticeContentTests(TestCase):
    def setUp(self):
        call_command('import_content', str(CONTENT_FIXTURE), stdout=io.StringIO())

    def test_new_practice_is_a_draft_and_published_order_is_preserved(self):
        draft = Practice.objects.create(title='Черновик занятия', description='Описание')
        self.assertFalse(draft.is_published)
        self.assertEqual(build_content()['practices'], [])
        Practice.objects.create(title='Разговорный клуб', description='Практика речи', order=2, is_published=True)
        first = Practice.objects.create(title='Пробный тест', description='Проверка подготовки',
                                        photo_alt='Студенты выполняют задания', order=1, is_published=True)
        rows = build_content()['practices']
        self.assertEqual([item['title'] for item in rows], ['Пробный тест', 'Разговорный клуб'])
        self.assertEqual(rows[0]['photoAlt'], first.photo_alt)
        previous = first.slug
        first.title = 'Другое название'
        first.save()
        self.assertEqual(first.slug, previous)

    def test_practice_import_export_roundtrip_and_legacy_content(self):
        data = build_content()
        data['practices'] = [{'id': 'speaking', 'title': 'Разговорный клуб', 'description': 'Обсуждаем темы',
                              'label': 'Speaking', 'photoAlt': 'Участники клуба'}]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'content.js'
            write_content(data, path)
            call_command('import_content', str(path), '--force', stdout=io.StringIO())
        self.assertEqual(build_content()['practices'], data['practices'])
        data.pop('practices')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'content.js'
            write_content(data, path)
            call_command('import_content', str(path), '--force', stdout=io.StringIO())
        self.assertFalse(Practice.objects.exists())

    def test_invalid_practices_are_rejected_and_failed_import_keeps_drafts(self):
        existing = Practice.objects.create(title='Сохранённый черновик', description='Описание')
        data = build_content()
        data['practices'] = [{'id': 'unsafe', 'title': 'Тест', 'description': 'Описание', 'photo': 'https://example.org/private.jpg'}]
        with self.assertRaises(CommandError):
            validate_content(data)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'content.js'
            write_content(data, path)
            with self.assertRaises(CommandError):
                call_command('import_content', str(path), '--force', stdout=io.StringIO())
        self.assertTrue(Practice.objects.filter(pk=existing.pk).exists())
        data['practices'] = ''
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'content.js'
            write_content(data, path)
            with self.assertRaises(CommandError):
                call_command('import_content', str(path), '--force', stdout=io.StringIO())
        self.assertTrue(Practice.objects.filter(pk=existing.pk).exists())
        for item in ({'id': 'x', 'title': ' ', 'description': 'Описание'},
                     {'id': 'x', 'title': 'Тест', 'description': 'Описание', 'photoAlt': 'x' * 161}):
            data['practices'] = [item]
            with self.assertRaises(CommandError):
                validate_content(data)


class PracticeAdminTests(AdminTestCase):
    def test_dashboard_exposes_real_editing_routes_and_activity_photo_fields(self):
        self.login()
        response = self.client.get(reverse('admin:index'))
        self.assertContains(response, 'Быстрое добавление и шаблоны')
        self.assertContains(response, reverse('admin:content_practice_add'))
        self.assertContains(response, reverse('admin:content_teacher_add'))
        response = self.client.get(reverse('admin:content_practice_add'))
        self.assertContains(response, 'name="photo"')
        self.assertContains(response, 'name="photo_alt"')
        self.assertFalse(response.context['adminform'].form['is_published'].value())

    def test_owner_can_add_activity_then_publish_it_explicitly(self):
        self.login()
        response = self.client.post(reverse('admin:content_practice_add'), {
            'title': 'Speaking Club', 'description': 'Практика общения', 'label': 'Speaking',
            'photo_alt': '', 'photo_path': '', 'order': '0', 'is_published': 'on',
        })
        self.assertEqual(response.status_code, 302, response.context and response.context['adminform'].errors)
        practice = Practice.objects.get()
        self.assertTrue(practice.is_published)
        self.assertRegex(practice.slug, r'^[a-z0-9-]+$')

    def test_copy_of_result_cannot_reuse_publication_or_student_consent(self):
        self.login()
        SiteSettings.objects.filter(pk=1).update(demo_mode=False)
        original = StudentResult.objects.create(score='8.0', exam='IELTS', quote='Реальный отзыв',
                                                student='Студент А.', consent=True, is_published=True, featured=True)
        response = self.client.post(reverse('admin:content_studentresult_change', args=[original.pk]), {
            'score': '8.0', 'exam': 'IELTS', 'level': '', 'quote': 'Новый отзыв', 'student': 'Студент Б.',
            'course': '', 'consent': 'on', 'featured': 'on', 'is_published': 'on', 'order': '0', '_saveasnew': '1',
        })
        self.assertEqual(response.status_code, 302, response.context and response.context['adminform'].errors)
        copied = StudentResult.objects.get(student='Студент Б.')
        self.assertFalse(copied.is_published)
        self.assertFalse(copied.consent)
        self.assertFalse(copied.featured)
        original.refresh_from_db()
        self.assertTrue(original.is_published and original.consent)

    def test_copy_of_teacher_does_not_reuse_photo_or_publish_it(self):
        self.login()
        original = Teacher.objects.create(name='Учитель А.', role='English', photo_path='assets/teachers/source.jpg')
        response = self.client.post(reverse('admin:content_teacher_change', args=[original.pk]), {
            'name': 'Учитель Б.', 'role': 'English', 'qualification': '', 'experience': '',
            'photo_path': original.photo_path, 'featured': 'on', 'is_published': 'on', 'order': '0', '_saveasnew': '1',
        })
        self.assertEqual(response.status_code, 302, response.context and response.context['adminform'].errors)
        copied = Teacher.objects.get(name='Учитель Б.')
        self.assertFalse(copied.is_published or copied.featured)
        self.assertFalse(copied.photo or copied.photo_path)

    def test_event_template_keeps_the_explicit_date_but_is_never_published_as_a_copy(self):
        self.login()
        when = parse_datetime('2030-02-03T18:30:00+05:00')
        original = Event.objects.create(title='Первое событие', starts_at=when, is_published=True)
        response = self.client.post(reverse('admin:content_event_change', args=[original.pk]), {
            'title': 'Следующее событие', 'description': '', 'starts_at_0': '2030-02-04',
            'starts_at_1': '19:00:00', 'url': '', 'is_published': 'on', 'order': '0', '_saveasnew': '1',
        })
        self.assertEqual(response.status_code, 302, response.context and response.context['adminform'].errors)
        copied = Event.objects.get(title='Следующее событие')
        self.assertFalse(copied.is_published)
        self.assertEqual(copied.starts_at, parse_datetime('2030-02-04T19:00:00+05:00'))
