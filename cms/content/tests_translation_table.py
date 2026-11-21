"""The translation table: every Russian text with its UZ / QQ / EN, saved in one go."""
from django.urls import reverse

from .models import Faq, PageText, Translation
from .tests import AdminTestCase
from .translation_table import filter_rows, table_rows


class TranslationTableTests(AdminTestCase):
    def setUp(self):
        super().setUp()
        self.url = reverse('admin:translations')
        Faq.objects.get_or_create(question='Тестовый вопрос?', defaults={'answer': 'Тестовый ответ.', 'question_uz': 'Test savol?'})
        Translation.objects.get_or_create(source='Тестовая надпись', defaults={'uz': 'Test yozuvi', 'en': 'Test label'})

    def test_only_signed_in_editors_open_the_table(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response['Location'].startswith(self.login_url))

    def test_table_lists_page_texts_questions_translations_and_texts_still_without_one(self):
        rows = table_rows()
        kinds = {row.kind for row in rows}
        self.assertTrue({'page', 'faq-question', 'faq-answer', 'translation'} <= kinds)
        page = PageText.objects.first()
        page.uz = 'Sinov matni'
        page.save()
        rows = table_rows()
        self.assertTrue(any(row.key == f'p{page.pk}' and row.uz == page.uz for row in rows))
        missing_uz = filter_rows(rows, missing='uz')
        self.assertTrue(missing_uz and all(not row.uz.strip() for row in missing_uz))
        self.login()
        response = self.client.get(self.url, {'missing': 'uz'})
        self.assertContains(response, 'Таблица переводов')
        self.assertContains(response, 'name="row"')

    def test_saving_updates_each_kind_and_converts_uzbek_to_the_2026_alphabet(self):
        self.login()
        page = PageText.objects.first()
        faq = Faq.objects.first()
        translation = Translation.objects.first()
        Translation.objects.filter(source='Пример нового текста').delete()
        rows = table_rows()
        new = next((row for row in rows if row.kind == 'new'), None)
        data = {'row': [f'p{page.pk}', f'q{faq.pk}', f't{translation.pk}'],
                f'p{page.pk}-uz': 'Oʻquv markazi', f'p{page.pk}-kaa': page.kaa, f'p{page.pk}-en': page.en,
                f'q{faq.pk}-uz': faq.question_uz, f'q{faq.pk}-kaa': 'Jańa soraw', f'q{faq.pk}-en': faq.question_en,
                f't{translation.pk}-uz': translation.uz, f't{translation.pk}-kaa': translation.kaa, f't{translation.pk}-en': 'New label'}
        if new:
            data['row'].append(new.key)
            data.update({f'{new.key}-uz': '', f'{new.key}-kaa': '', f'{new.key}-en': 'Brand new'})
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, 302)
        page.refresh_from_db()
        faq.refresh_from_db()
        translation.refresh_from_db()
        self.assertEqual(page.uz, 'Öquv markazi', 'Old Uzbek spelling is converted to the 2026 alphabet')
        self.assertEqual(faq.question_kaa, 'Jańa soraw')
        self.assertEqual(translation.en, 'New label')
        if new:
            self.assertEqual(Translation.objects.get(source=new.source).en, 'Brand new')

    def test_a_translation_left_completely_empty_is_removed_and_too_long_text_is_refused(self):
        self.login()
        translation = Translation.objects.first()
        key = f't{translation.pk}'
        self.client.post(self.url, {'row': [key], f'{key}-uz': '', f'{key}-kaa': '', f'{key}-en': ''})
        self.assertFalse(Translation.objects.filter(pk=translation.pk).exists())
        faq = Faq.objects.first()
        before = faq.question_uz
        response = self.client.post(self.url, {'row': [f'q{faq.pk}'], f'q{faq.pk}-uz': 'x' * 200,
                                               f'q{faq.pk}-kaa': faq.question_kaa, f'q{faq.pk}-en': faq.question_en}, follow=True)
        self.assertContains(response, 'длиннее 160 символов')
        faq.refresh_from_db()
        self.assertEqual(faq.question_uz, before)

    def test_admin_home_links_to_the_table(self):
        self.login()
        self.assertContains(self.client.get(self.index_url), reverse('admin:translations'))
