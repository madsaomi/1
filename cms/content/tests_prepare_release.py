"""Upgrade an isolated legacy database without ever touching real files or GitHub."""
import io
import json
import shutil
import tempfile
from pathlib import Path
from unittest import mock

from django.apps import apps
from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from .models import Location, MapLink, PageText, Practice, SiteSettings, Stat, StudentResult, Teacher, Translation
from .release import BRANCH_TEXTS, LEGACY_RESULTS, LEGACY_TEACHERS, content_snapshot
from .serialization import read_content, write_content
from .tests import CONTENT_FIXTURE


class PrepareReleaseTests(TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.site = self.root / 'site'
        self.site.mkdir()
        self.media = self.root / 'private-media'
        settings = override_settings(MEDIA_ROOT=self.media)
        settings.enable()
        self.addCleanup(settings.disable)
        # First import is only a fixture for the isolated test DB; the release
        # command itself must never replace populated production content.
        call_command('import_content', str(CONTENT_FIXTURE), stdout=io.StringIO())
        data = read_content(CONTENT_FIXTURE)
        data['site'].update(demoMode=False, demoLabels=False)
        data['teachers'] = data['results'] = []
        data['practices'] = [dict(id='speaking-club', title='Speaking Club', label='Speaking',
                                  description='Разговорная практика и обсуждение тем на английском.')]
        for key in tuple(data['texts']):
            if key.startswith('clubs.') and key not in {'clubs.title1', 'clubs.text1'}:
                del data['texts'][key]
        data['texts']['career.test_release'] = 'Новый текст страницы'
        data['texts']['courses.text1'] = 'Стоимость в месяц и программа — в каждой карточке.'
        data['texts'].pop('courses.text2', None)
        write_content(data, self.site / 'content.js')
        (self.site / 'index.html').write_text(
            '<p data-text="page.new_release">Новый текст разметки</p>', encoding='utf-8')
        dictionaries = self.site / 'assets' / 'i18n'
        dictionaries.mkdir(parents=True)
        for language in ('uz', 'kaa'):
            strings = {
                'Speaking Club': f'{language} speaking', 'Новый текст страницы': f'{language} new',
                'Новый текст разметки': f'{language} markup', 'Новая общая строка': f'{language} general',
                'Два филиала': f'{language} two', 'На Сараева и на Абдирова.': f'{language} address',
                'Языки, IELTS, SAT и математика. Программы, цены и два филиала Stanford.': f'{language} meta',
                'Стоимость в месяц и программа — в каждой карточке.': f'{language} course price',
            }
            (dictionaries / f'{language}.js').write_text(
                'window.pack = {\n  strings: {\n' + ',\n'.join(
                    f'    {json.dumps(key, ensure_ascii=False)}: {json.dumps(value, ensure_ascii=False)}'
                    for key, value in strings.items()) + '\n  },\n  patterns: []\n};\n', encoding='utf-8')
        self.branch = Location.objects.create(slug='youth-center', name='Филиал «Жазлар ораый»',
                                              address='Центр молодёжи')
        MapLink.objects.create(location=self.branch, provider='yandex', url='https://yandex.uz/maps/-/test123')
        for key, (old, _new) in BRANCH_TEXTS.items():
            PageText.objects.filter(key=key).update(text=old, uz='Перевод старой строки', kaa='Old QQ')
        Stat.objects.filter(label='филиала').update(value='3')

    def run_command(self, **options):
        output = io.StringIO()
        call_command('prepare_release', site_root=str(self.site), stdout=output, **options)
        return output.getvalue()

    def backups(self):
        return list(self.media.glob('release-backups/*.json'))

    def test_default_and_explicit_dry_run_change_neither_database_nor_media(self):
        before = content_snapshot()
        for options in ({}, {'dry_run': True}):
            output = self.run_command(**options)
            self.assertIn('ничего не сохранено', output)
            self.assertEqual(content_snapshot(), before)
            self.assertFalse(self.media.exists())

    def test_empty_database_requires_first_import_without_partially_seeding_records(self):
        for model in apps.get_app_config('content').get_models():
            model.objects.all().delete()
        with self.assertRaisesMessage(CommandError, 'нужен первый импорт'):
            self.run_command(apply=True)
        self.assertEqual(content_snapshot(), [])
        self.assertFalse(self.media.exists())

    def test_apply_archives_all_affected_content_and_is_idempotent(self):
        User.objects.create_user('unrelated-account', password='test-only-unused')
        before = content_snapshot()
        output = self.run_command(apply=True)
        self.assertIn('Резервная копия', output)
        self.assertEqual(Teacher.objects.count(), 0)
        self.assertEqual(StudentResult.objects.count(), 0)
        self.assertFalse(Location.objects.filter(slug='youth-center').exists())
        self.assertEqual(Stat.objects.get(label='филиала').value, '2')
        self.assertFalse(Stat.objects.exclude(label='филиала').exists())
        self.assertFalse(SiteSettings.objects.get(pk=1).demo_mode)
        self.assertTrue(Practice.objects.get(slug='speaking-club').is_published)
        self.assertEqual(PageText.objects.get(key='career.test_release').kaa, 'kaa new')
        self.assertEqual(PageText.objects.get(key='page.new_release').uz, 'uz markup')
        self.assertEqual(PageText.objects.get(key='why.title5').text, 'Два филиала')
        self.assertEqual(PageText.objects.get(key='why.title5').uz, 'uz two')
        self.assertEqual(Translation.objects.get(source='Три филиала').uz, 'Перевод старой строки')
        backup = json.loads(self.backups()[0].read_text(encoding='utf-8'))
        self.assertEqual(backup['objects'], before)
        self.assertTrue(all(item['model'].startswith('content.') for item in backup['objects']))
        self.assertIn('content.maplink', {item['model'] for item in backup['objects']})
        self.assertIn('content.teacher', {item['model'] for item in backup['objects']})
        self.assertEqual(User.objects.filter(username='unrelated-account').count(), 1)
        after = content_snapshot()
        self.assertIn('Изменения: 0', self.run_command(apply=True))
        self.assertEqual(content_snapshot(), after)
        self.assertEqual(len(self.backups()), 1)

    def test_owner_edits_consent_drafts_and_nonempty_translations_survive(self):
        teacher = Teacher.objects.get(name=LEGACY_TEACHERS[0]['name'])
        teacher.role = 'Реальный преподаватель'
        teacher.save()
        photo_teacher = Teacher.objects.get(name=LEGACY_TEACHERS[1]['name'])
        photo_teacher.photo_path = 'assets/teachers/real.jpg'
        photo_teacher.save()
        confirmed = StudentResult.objects.get(student=LEGACY_RESULTS[0]['student'])
        confirmed.consent = True
        confirmed.save()
        hidden = StudentResult.objects.get(student=LEGACY_RESULTS[1]['student'])
        hidden.quote = 'Реальный отзыв владельца'
        hidden.is_published = False
        hidden.save()
        PageText.objects.filter(key='why.title5').update(text='Наши филиалы', uz='Свой UZ', kaa='Свой QQ')
        PageText.objects.create(key='career.test_release', text='Новый текст страницы', uz='Перевод владельца')
        Translation.objects.create(source='Новая общая строка', uz='Общий UZ владельца', kaa='Общий QQ владельца')
        Translation.objects.create(source='Speaking Club', uz='Свой клуб', kaa='Своя практика')
        PageText.objects.filter(key='clubs.title2').update(uz='Мой клуб', kaa='Менин клубым')
        existing = Practice.objects.create(slug='speaking-club', title='Настоящее занятие',
                                           description='Описание владельца', is_published=False)
        self.run_command(apply=True)
        self.assertEqual(set(Teacher.objects.values_list('pk', flat=True)), {teacher.pk, photo_teacher.pk})
        self.assertEqual(set(StudentResult.objects.values_list('pk', flat=True)), {confirmed.pk, hidden.pk})
        existing.refresh_from_db()
        self.assertEqual(existing.title, 'Настоящее занятие')
        self.assertFalse(existing.is_published)
        self.assertEqual(PageText.objects.get(key='why.title5').text, 'Наши филиалы')
        self.assertEqual(PageText.objects.get(key='why.title5').kaa, 'Свой QQ')
        new_slot = PageText.objects.get(key='career.test_release')
        self.assertEqual((new_slot.uz, new_slot.kaa), ('Перевод владельца', 'kaa new'))
        self.assertEqual(Translation.objects.get(source='Новая общая строка').uz, 'Общий UZ владельца')
        self.assertEqual(Translation.objects.get(source='Speaking Club').kaa, 'Своя практика')
        self.assertFalse(PageText.objects.filter(key='clubs.title2').exists())

    def test_retired_club_translations_are_kept_as_general_dictionary(self):
        PageText.objects.filter(key='clubs.title2').update(uz='Клуб владельца', kaa='QQ владельца')
        self.run_command(apply=True)
        translation = Translation.objects.get(source='Speaking Club')
        self.assertEqual((translation.uz, translation.kaa), ('Клуб владельца', 'QQ владельца'))

    def test_legacy_discount_copy_is_retired_without_losing_saved_translations(self):
        discount = PageText.objects.get(key='courses.text2')
        discount.uz, discount.kaa = 'Мой старый UZ', 'Мой старый QQ'
        discount.save()
        title = PageText.objects.get(key='courses.text1')
        old_text = title.text
        title.uz = 'Свой старый заголовок'
        title.save()
        self.run_command(apply=True)
        title.refresh_from_db()
        self.assertEqual(title.text, 'Стоимость в месяц и программа — в каждой карточке.')
        self.assertEqual((title.uz, title.kaa), ('uz course price', 'kaa course price'))
        self.assertFalse(PageText.objects.filter(key='courses.text2').exists())
        self.assertEqual(Translation.objects.get(source=old_text).uz, 'Свой старый заголовок')
        archived = Translation.objects.get(source=discount.text)
        self.assertEqual((archived.uz, archived.kaa), ('Мой старый UZ', 'Мой старый QQ'))

    def test_custom_course_copy_is_preserved(self):
        PageText.objects.filter(key='courses.text1').update(text='Программа и цена владельца',
                                                         uz='Мой UZ', kaa='Мой QQ')
        self.run_command(apply=True)
        slot = PageText.objects.get(key='courses.text1')
        self.assertEqual((slot.text, slot.uz, slot.kaa), ('Программа и цена владельца', 'Мой UZ', 'Мой QQ'))

    def test_unknown_unconsented_result_cancels_every_change_and_backup(self):
        StudentResult.objects.create(score='8.5', exam='IELTS', quote='Реальный отзыв без согласия',
                                     student='Новый ученик', consent=False)
        before = content_snapshot()
        with self.assertRaisesMessage(CommandError, 'без согласия'):
            self.run_command(apply=True)
        self.assertEqual(content_snapshot(), before)
        self.assertFalse(self.media.exists())
        self.assertTrue(SiteSettings.objects.get(pk=1).demo_mode)

    def test_backup_write_failure_rolls_back_every_change(self):
        before = content_snapshot()
        with mock.patch('content.release.write_release_backup', side_effect=OSError('disk full')):
            with self.assertRaises(CommandError):
                self.run_command(apply=True)
        self.assertEqual(content_snapshot(), before)

    def test_modified_third_branch_and_its_maps_are_preserved(self):
        self.branch.address = 'Реальный новый адрес'
        self.branch.save()
        self.run_command(apply=True)
        self.branch.refresh_from_db()
        self.assertEqual(self.branch.address, 'Реальный новый адрес')
        self.assertEqual(self.branch.maps.count(), 1)
        self.assertEqual(PageText.objects.get(key='why.title5').text, 'Три филиала')

    def test_old_branch_count_and_copy_are_fixed_after_an_earlier_branch_removal(self):
        self.branch.delete()
        self.run_command(apply=True)
        self.assertEqual(Stat.objects.get(label='филиала').value, '2')
        self.assertEqual(PageText.objects.get(key='why.title5').text, 'Два филиала')
        self.assertEqual(PageText.objects.get(key='why.text5').text, 'На Сараева и на Абдирова.')

    def test_a_different_pair_of_real_branches_does_not_trigger_legacy_copy_replacement(self):
        self.branch.delete()
        Location.objects.filter(slug='abdirova').update(slug='new-real-branch')
        self.run_command(apply=True)
        self.assertEqual(Stat.objects.get(label='филиала').value, '3')
        self.assertEqual(PageText.objects.get(key='why.title5').text, 'Три филиала')

    def test_github_uses_client_snapshot_without_logging_credentials(self):
        client = mock.Mock(repository='owner/site', branch='main', token='private-token-never-output')

        def snapshot(root):
            shutil.copytree(self.site, root, dirs_exist_ok=True)
            return {'parent': 'a' * 40}

        client.snapshot.side_effect = snapshot
        output = io.StringIO()
        with mock.patch('content.management.commands.prepare_release.github_client', return_value=client):
            call_command('prepare_release', from_github=True, apply=True, stdout=output)
        client.snapshot.assert_called_once()
        self.assertNotIn(client.token, output.getvalue())
        backup = json.loads(self.backups()[0].read_text(encoding='utf-8'))
        self.assertEqual(backup['source'], dict(kind='github', repository='owner/site', branch='main', commit='a' * 40))
        self.assertNotIn(client.token, json.dumps(backup))
