"""Three-language editing/import/export; all data lives in the isolated test database."""
import io
import tempfile
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse

from .github import OUTPUT_FILES, SOURCE_FILES
from .models import Faq, PageText, Translation
from .serialization import (build_translation_strings, load_translation_strings, read_translation_strings,
                            write_translation_strings)
from .tests import AdminTestCase, CONTENT_FIXTURE


class DictionaryLanguageTests(TestCase):
    def setUp(self):
        self.text = PageText.objects.create(key='page.title1', text='Заголовок', uz='Sarlavha', kaa='Atama')
        self.faq = Faq.objects.create(question='Вопрос?', answer='Ответ.', question_uz='Savol?',
                                     answer_uz='Javob.', question_kaa='Soraw?', answer_kaa='Juwap.')
        self.general = Translation.objects.create(source='Подробнее', uz='Batafsil', kaa='Tolıǵıraq')

    def test_import_updates_only_selected_language_and_preserves_omitted_owner_drafts(self):
        load_translation_strings({'Заголовок': 'Jańa atama', 'Вопрос?': 'Jańa soraw?',
                                  'Подробнее': 'Tolıq maǵlıwmat', 'Кнопка': 'Túyme'}, 'kaa')
        self.text.refresh_from_db()
        self.faq.refresh_from_db()
        self.general.refresh_from_db()
        self.assertEqual((self.text.uz, self.text.kaa), ('Sarlavha', 'Jańa atama'))
        self.assertEqual((self.faq.question_uz, self.faq.answer_uz, self.faq.answer_kaa),
                         ('Savol?', 'Javob.', 'Juwap.'))
        self.assertEqual((self.general.uz, self.general.kaa), ('Batafsil', 'Tolıq maǵlıwmat'))
        self.assertEqual(Translation.objects.get(source='Кнопка').kaa, 'Túyme')
        load_translation_strings({'Кнопка': 'Tugma'}, 'uz')
        self.assertEqual(Translation.objects.get(source='Кнопка').kaa, 'Túyme')
        self.assertEqual(build_translation_strings('kaa')['Ответ.'], 'Juwap.')

    def test_seeding_does_not_overwrite_existing_translation_in_any_table(self):
        load_translation_strings({'Заголовок': 'Atama 2', 'Вопрос?': 'Soraw 2', 'Подробнее': 'Basqa'},
                                 'kaa', overwrite=False)
        self.assertEqual(build_translation_strings('kaa'),
                         {'Заголовок': 'Atama', 'Вопрос?': 'Soraw?', 'Ответ.': 'Juwap.', 'Подробнее': 'Tolıǵıraq'})
        self.assertEqual(build_translation_strings('uz')['Подробнее'], 'Batafsil')

    def test_dictionary_round_trip_keeps_language_global_and_dynamic_patterns(self):
        source = ('window.stanfordKaa = {\n  strings: {\n    "Кнопка": "Túyme"\n  },\n'
                  '  patterns: [[/^(\\d+) сум$/, m => `${m[1]} som`]]\n};\n')
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'kaa.js'
            path.write_text(source, encoding='utf-8')
            self.assertEqual(read_translation_strings(path), {'Кнопка': 'Túyme'})
            write_translation_strings(path, build_translation_strings('kaa'))
            written = path.read_text(encoding='utf-8')
            self.assertIn('window.stanfordKaa', written)
            self.assertIn('patterns: [[/^(\\d+) сум$/, m => `${m[1]} som`]]', written)
            self.assertEqual(read_translation_strings(path), build_translation_strings('kaa'))

    def test_translation_requires_source_and_at_least_one_language(self):
        Translation(source='Новый текст', kaa='Jańa tekst').full_clean()
        with self.assertRaises(ValidationError):
            Translation(source='Новый текст').full_clean()
        with self.assertRaises(ValueError):
            build_translation_strings('unexpected')


class TranslationWorkflowTests(AdminTestCase):
    def test_admin_saves_karakalpak_and_uzbek_together(self):
        self.login()
        text = PageText.objects.get(key='why.title1')
        response = self.client.post(reverse('admin:content_pagetext_change', args=[text.pk]),
                                    {'text': text.text, 'uz': 'Nega biz', 'kaa': 'Ne ushın biz'})
        self.assertEqual(response.status_code, 302)
        text.refresh_from_db()
        self.assertEqual((text.uz, text.kaa), ('Nega biz', 'Ne ushın biz'))
        response = self.client.post(reverse('admin:content_translation_add'),
                                    {'source': 'Каракалпакский текст', 'uz': '', 'kaa': 'Qaraqalpaqsha tekst'})
        self.assertEqual(response.status_code, 302)
        self.assertEqual(Translation.objects.get(source='Каракалпакский текст').kaa, 'Qaraqalpaqsha tekst')

    def test_force_content_import_preserves_other_language_without_dictionary(self):
        text = PageText.objects.get(key='why.title1')
        text.kaa = 'Ne ushın biz'
        text.save()
        faq = Faq.objects.first()
        faq.question_kaa, faq.answer_kaa = 'Soraw?', 'Juwap.'
        faq.save()
        Translation.objects.create(source='Кнопка', uz='Tugma', kaa='Túyme')
        expected = build_translation_strings('kaa')
        call_command('import_content', str(CONTENT_FIXTURE), force=True, stdout=io.StringIO())
        self.assertEqual(build_translation_strings('kaa'), expected)
        self.assertEqual(Translation.objects.get(source='Кнопка').uz, 'Tugma')

    def test_sync_and_export_include_both_dictionaries_and_preserve_patterns(self):
        text = PageText.objects.get(key='why.title1')
        text.uz, text.kaa = 'Nega biz', 'Ne ushın biz'
        text.save()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            dictionaries = root / 'assets' / 'i18n'
            dictionaries.mkdir(parents=True)
            for code, global_name in (('uz', 'stanfordUz'), ('kaa', 'stanfordKaa')):
                (dictionaries / f'{code}.js').write_text(
                    f'window.{global_name} = {{\n  strings: {{\n    "Кнопка": "Seed {code}"\n  }},\n'
                    '  patterns: []\n};\n', encoding='utf-8')
            call_command('sync_translations', site_root=str(root), stdout=io.StringIO())
            call_command('export_content', output=str(root / 'content.js'), stdout=io.StringIO())
            for code, expected in (('uz', 'Nega biz'), ('kaa', 'Ne ushın biz')):
                exported = read_translation_strings(dictionaries / f'{code}.js')
                self.assertEqual(exported[text.text], expected)
                self.assertEqual(exported['Кнопка'], f'Seed {code}')
            self.assertIn('assets/i18n/kaa.js', SOURCE_FILES)
            self.assertIn('assets/i18n/kaa.js', OUTPUT_FILES)
