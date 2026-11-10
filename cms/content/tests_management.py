"""Owner-facing editing and publication assets, without touching the real database or media files."""
import io
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image, PngImagePlugin
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.conf import settings
from django.test import TestCase, override_settings
from django.urls import reverse

from .models import AdmissionsTelegram, Contacts, Course, CourseSkill, Location, Phone, SiteSettings, StudentResult, Teacher
from .serialization import build_content, collect_photo_files, read_content, sync_page_texts, write_content
from .tests import AdminTestCase, CONTENT_FIXTURE


class ManualEditingTests(AdminTestCase):
    def test_course_add_generates_a_stable_unique_identifier(self):
        self.login()
        payload = {'name': 'Новый курс', 'category': 'languages', 'description': 'Описание новой программы.',
                   'price': '500000', 'order': '0', 'is_published': 'on',
                   'skills-TOTAL_FORMS': '1', 'skills-INITIAL_FORMS': '0',
                   'skills-0-text': 'Первый пункт программы', 'skills-0-order': '0'}
        response = self.client.post(reverse('admin:content_course_add'), payload)
        self.assertEqual(response.status_code, 302, response.context and response.context['adminform'].errors)
        course = Course.objects.get(name='Новый курс')
        self.assertRegex(course.slug, r'^[a-z0-9-]+$')
        old_slug = course.slug
        course.name = 'Другое название'
        course.save()
        self.assertEqual(course.slug, old_slug)
        response = self.client.post(reverse('admin:content_course_add'), payload)
        self.assertEqual(response.status_code, 302)
        self.assertEqual(Course.objects.filter(name='Новый курс').count(), 1)
        self.assertNotEqual(Course.objects.get(name='Новый курс').slug, old_slug)

    def test_new_course_requires_a_programme_point(self):
        self.login()
        response = self.client.post(reverse('admin:content_course_add'), {
            'name': 'Без программы', 'category': 'languages', 'description': 'Описание курса.',
            'price': '500000', 'order': '0', 'is_published': 'on',
            'skills-TOTAL_FORMS': '0', 'skills-INITIAL_FORMS': '0'})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Добавьте хотя бы одну запись')
        self.assertFalse(Course.objects.filter(name='Без программы').exists())

    def test_deleting_every_programme_point_is_rejected(self):
        self.login()
        course = Course.objects.first()
        skills = list(course.skills.all())
        payload = {'name': course.name, 'subtitle': course.subtitle, 'category': course.category,
                   'description': course.description, 'price': course.price, 'order': course.order,
                   'is_published': 'on', 'skills-TOTAL_FORMS': len(skills), 'skills-INITIAL_FORMS': len(skills)}
        for index, skill in enumerate(skills):
            payload.update({f'skills-{index}-id': skill.pk, f'skills-{index}-course': course.pk,
                            f'skills-{index}-text': skill.text, f'skills-{index}-order': skill.order,
                            f'skills-{index}-DELETE': 'on'})
        response = self.client.post(reverse('admin:content_course_change', args=[course.pk]), payload)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Добавьте хотя бы одну запись')
        self.assertEqual(course.skills.count(), len(skills))

    def test_branch_add_generates_identifier_and_requires_map(self):
        self.login()
        payload = {'name': 'Новый филиал', 'address': 'Адрес для теста', 'order': '0',
                   'maps-TOTAL_FORMS': '0', 'maps-INITIAL_FORMS': '0'}
        url = reverse('admin:content_location_add')
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Добавьте хотя бы одну запись')
        payload.update({'maps-TOTAL_FORMS': '1', 'maps-0-provider': 'google',
                        'maps-0-url': 'https://maps.app.goo.gl/test123', 'maps-0-order': '0'})
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, 302, response.context and response.context['adminform'].errors)
        self.assertRegex(Location.objects.get(name='Новый филиал').slug, r'^[a-z0-9-]+$')

    def test_contacts_can_be_verified_while_adding_the_first_phone(self):
        self.login()
        Phone.objects.all().delete()
        AdmissionsTelegram.objects.all().delete()
        Contacts.objects.filter(pk=1).update(verified=False)
        response = self.client.post(reverse('admin:content_contacts_change', args=[1]), {
            'verified': 'on', 'phones-TOTAL_FORMS': '1', 'phones-INITIAL_FORMS': '0',
            'phones-0-number': '+998901234567', 'phones-0-order': '0',
            'telegrams-TOTAL_FORMS': '0', 'telegrams-INITIAL_FORMS': '0'})
        self.assertEqual(response.status_code, 302, response.context and response.context['adminform'].errors)
        self.assertTrue(Contacts.load().verified)
        self.assertEqual(Phone.objects.get().number, '+998901234567')

    def test_deleting_last_contact_is_rejected(self):
        self.login()
        AdmissionsTelegram.objects.all().delete()
        Phone.objects.all().delete()
        phone = Phone.objects.create(contacts=Contacts.load(), number='+998901234567')
        response = self.client.post(reverse('admin:content_contacts_change', args=[1]), {
            'verified': 'on', 'phones-TOTAL_FORMS': '1', 'phones-INITIAL_FORMS': '1',
            'phones-0-id': phone.pk, 'phones-0-contacts': '1', 'phones-0-number': phone.number,
            'phones-0-order': '0', 'phones-0-DELETE': 'on',
            'telegrams-TOTAL_FORMS': '0', 'telegrams-INITIAL_FORMS': '0'})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Добавьте хотя бы один телефон')
        self.assertTrue(Phone.objects.filter(pk=phone.pk).exists())

    def test_hr_telegram_cannot_match_a_new_inline_channel(self):
        self.login()
        AdmissionsTelegram.objects.all().delete()
        response = self.client.post(reverse('admin:content_contacts_change', args=[1]), {
            'verified': 'on', 'hr_telegram': 'https://t.me/new_channel',
            'phones-TOTAL_FORMS': '0', 'phones-INITIAL_FORMS': '0',
            'telegrams-TOTAL_FORMS': '1', 'telegrams-INITIAL_FORMS': '0',
            'telegrams-0-url': 'https://t.me/new_channel', 'telegrams-0-order': '0'})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'должен отличаться')

    def test_real_published_result_requires_consent_in_the_form(self):
        SiteSettings.objects.filter(pk=1).update(demo_mode=False)
        result = StudentResult.objects.first()
        with self.assertRaisesMessage(ValidationError, 'нужно согласие'):
            result.full_clean()
        result.is_published = False
        result.full_clean()

    def test_disabling_demo_mode_requires_consent_for_existing_public_results(self):
        settings = SiteSettings.load()
        settings.demo_mode = False
        with self.assertRaisesMessage(ValidationError, 'Сначала подтвердите согласие'):
            settings.full_clean()
        StudentResult.objects.filter(is_published=True).update(consent=True)
        settings.full_clean()


class PhotoPublicationTests(TestCase):
    def setUp(self):
        call_command('import_content', str(CONTENT_FIXTURE), stdout=io.StringIO())

    @override_settings(STORAGES={'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
                                 'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}})
    def test_upload_becomes_a_hashed_jpeg_without_metadata_or_disk_writes(self):
        source = io.BytesIO()
        info = PngImagePlugin.PngInfo()
        info.add_text('Private note', 'must not be published')
        Image.new('RGB', (2200, 1600), 'yellow').save(source, 'PNG', pnginfo=info)
        teacher = Teacher.objects.first()
        teacher.photo.save('private-name.png', ContentFile(source.getvalue()))
        photos = {}
        data = build_content(photo_files=photos)
        path = data['teachers'][0]['photo']
        self.assertRegex(path, r'^assets/uploads/[0-9a-f]{64}\.jpg$')
        self.assertEqual(collect_photo_files(), photos)
        with Image.open(io.BytesIO(photos[path])) as result:
            self.assertEqual(result.format, 'JPEG')
            self.assertLessEqual(max(result.size), 1600)
            self.assertFalse(result.getexif())
            self.assertNotIn('Private note', result.info)
        self.assertNotIn(b'private-name', photos[path])

    @override_settings(STORAGES={'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
                                 'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}})
    def test_file_with_image_extension_but_invalid_bytes_cannot_be_published(self):
        teacher = Teacher.objects.first()
        teacher.photo.save('fake.jpg', ContentFile(b'not an image'))
        with self.assertRaisesMessage(CommandError, 'Не удалось подготовить фото'):
            build_content()

    def test_imported_asset_paths_survive_the_export_round_trip(self):
        data = build_content()
        data['teachers'][0]['photo'] = 'assets/portraits/teacher.webp'
        data['contacts']['locations'][0]['photo'] = 'assets/branches/one.jpg'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'content.js'
            write_content(data, path)
            call_command('import_content', str(path), '--force', stdout=io.StringIO())
        self.assertEqual(build_content(), data)

    def test_import_rejects_unsafe_photo_paths(self):
        for path in ('../photo.jpg', 'assets/../private.jpg', 'https://evil.example/photo.jpg', 'assets/foo.svg'):
            teacher = Teacher(name='Имя', role='Предмет', photo_path=path)
            with self.assertRaises(ValidationError):
                teacher.full_clean()


class PageTextDiscoveryTests(TestCase):
    def test_sync_reads_three_pages_and_attributes_but_preserves_saved_drafts(self):
        from .models import PageText
        PageText.objects.create(key='hero.title1', text='Черновик владельца', uz='Tarjima')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'index.html').write_text('<h1 data-text="hero.title1">Старый заголовок</h1>', encoding='utf-8')
            (root / 'results.html').write_text('<title data-text="results.title">Результаты</title>', encoding='utf-8')
            (root / 'career.html').write_text('<input data-text-placeholder="career.name" placeholder="Ваше имя">', encoding='utf-8')
            call_command('sync_page_texts', '--site-root', str(root), stdout=io.StringIO())
            self.assertEqual(sync_page_texts(root), 0)
        self.assertEqual(PageText.objects.get(key='hero.title1').text, 'Черновик владельца')
        self.assertEqual(PageText.objects.get(key='hero.title1').uz, 'Tarjima')
        self.assertEqual(PageText.objects.get(key='career.name').text, 'Ваше имя')
        self.assertEqual(PageText.objects.get(key='results.title').section, 'results')


class PublishedContentContractTests(TestCase):
    def test_current_public_content_imports_and_exports_without_fixed_business_values(self):
        from .serialization import validate_content
        call_command('import_content', stdout=io.StringIO())
        validate_content(build_content())


@unittest.skipUnless(shutil.which('node'), 'Node.js is required for the real publication build')
@override_settings(STORAGES={'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
                             'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}})
class FullPublicationIntegrationTests(TestCase):
    def setUp(self):
        call_command('import_content', str(CONTENT_FIXTURE), stdout=io.StringIO())

    def copy_site(self, root):
        site = root / 'site'
        site.mkdir()
        for name in ('build.mjs', 'content.js', 'index.html', 'results.html', 'career.html',
                     'script.js', 'results.js', 'career.js', 'theme-init.js', 'style.css', 'robots.txt'):
            shutil.copyfile(settings.SITE_ROOT / name, site / name)
        shutil.copytree(settings.SITE_ROOT / 'assets', site / 'assets')
        return site

    def edit_draft_and_upload_photo(self):
        from .models import PageText
        PageText.objects.filter(key='hero.text1').update(text='Текст интеграционного теста публикации')
        image = io.BytesIO()
        Image.new('RGB', (640, 800), 'yellow').save(image, 'PNG')
        teacher = Teacher.objects.first()
        teacher.photo.save('upload-only-in-memory.png', ContentFile(image.getvalue()))
        return teacher

    def test_real_node_build_publishes_owner_text_and_sanitized_uploaded_photo(self):
        from .publish import publish_site
        teacher = self.edit_draft_and_upload_photo()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            site = self.copy_site(root)
            with override_settings(SITE_ROOT=site, BASE_DIR=root / 'cms', LOCAL=True), \
                    mock.patch.dict(os.environ, {'SITE_PUBLISH_TARGET': 'local', 'SITE_NODE_BINARY': shutil.which('node')}):
                result = publish_site()
            self.assertTrue(result['changed'])
            data = read_content(site / 'content.js')
            self.assertEqual(data['texts']['hero.text1'], 'Текст интеграционного теста публикации')
            self.assertIn('Текст интеграционного теста публикации', (site / 'index.html').read_text(encoding='utf-8'))
            photo = next(item['photo'] for item in data['teachers'] if item['name'] == teacher.name)
            self.assertRegex(photo, r'^assets/uploads/[0-9a-f]{64}\.jpg$')
            self.assertTrue((site / photo).is_file())
            self.assertIn(photo, (site / 'index.html').read_text(encoding='utf-8'))
            with Image.open(site / photo) as uploaded:
                self.assertEqual(uploaded.format, 'JPEG')
                self.assertEqual(uploaded.size, (640, 800))

    def test_failed_real_build_keeps_every_source_page_script_and_photo_unchanged(self):
        from .publish import PublishError, publish_site
        teacher = self.edit_draft_and_upload_photo()
        with teacher.photo.open('rb') as uploaded:
            media_before = uploaded.read()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            site = self.copy_site(root)
            builder = site / 'build.mjs'
            builder.write_text(builder.read_text(encoding='utf-8') + '\nthrow new Error("integration-build-failure");\n',
                               encoding='utf-8')
            before = {path.relative_to(site).as_posix(): path.read_bytes() for path in site.rglob('*') if path.is_file()}
            with override_settings(SITE_ROOT=site, BASE_DIR=root / 'cms', LOCAL=True), \
                    mock.patch.dict(os.environ, {'SITE_PUBLISH_TARGET': 'local', 'SITE_NODE_BINARY': shutil.which('node')}):
                with self.assertRaisesMessage(PublishError, 'integration-build-failure'):
                    publish_site()
            after = {path.relative_to(site).as_posix(): path.read_bytes() for path in site.rglob('*') if path.is_file()}
            self.assertEqual(after, before)
        with teacher.photo.open('rb') as uploaded:
            self.assertEqual(uploaded.read(), media_before)
