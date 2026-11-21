"""A student result can name its teacher; only a published teacher reaches the site."""
from django.test import TestCase
from django.urls import reverse

from .models import StudentResult, Teacher
from .serialization import _results_data
from .tests import AdminTestCase


class ResultTeacherTests(TestCase):
    def test_published_teacher_is_exported_and_a_hidden_or_deleted_one_is_not(self):
        teacher = Teacher.objects.create(name='Тест Учитель', role='IELTS', is_published=True)
        result = StudentResult.objects.create(score='8.0', exam='IELTS', quote='Отзыв.', student='Тест У.',
                                              teacher=teacher, is_published=True)
        item = next(entry for entry in _results_data() if entry['student'] == 'Тест У.')
        self.assertEqual(item['teacher'], 'Тест Учитель')

        teacher.is_published = False
        teacher.save()
        item = next(entry for entry in _results_data() if entry['student'] == 'Тест У.')
        self.assertNotIn('teacher', item)

        teacher.delete()
        result.refresh_from_db()
        self.assertIsNone(result.teacher, 'Deleting a teacher keeps the result')


class ResultTeacherAdminTests(AdminTestCase):
    def test_teacher_is_picked_from_a_list_on_the_form_and_right_in_the_list_of_results(self):
        Teacher.objects.create(name='Тест Учитель', role='IELTS', is_published=True)
        Teacher.objects.create(name='Скрытый Учитель', role='SAT', is_published=False)
        result = StudentResult.objects.create(score='8.0', exam='IELTS', quote='Отзыв.', student='Тест У.', is_published=True)
        self.login()
        form = self.client.get(reverse('admin:content_studentresult_add'))
        self.assertContains(form, 'Тест Учитель — IELTS')
        self.assertContains(form, 'Скрытый Учитель — SAT (скрыт на сайте)')
        self.assertContains(form, '— не указан —')
        listing = self.client.get(reverse('admin:content_studentresult_changelist'))
        self.assertContains(listing, f'name="form-0-teacher"')
        self.assertIsNotNone(result.pk)
