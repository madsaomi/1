import importlib.util
import io
import secrets
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path

from django.conf import settings
from django.contrib import admin
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase
from django.urls import reverse
from django_otp.oath import totp
from django_otp.plugins.otp_totp.models import TOTPDevice

from .management.commands.import_content import read_content
from .models import (AdmissionsTelegram, CashbackRule, CashbackTier, Contacts, Course, Location, MapLink, Phone,
                     SiteSettings, StudentResult, Teacher)
from .serialization import build_content, write_content
from .validators import photo_extension_validator, photo_size_validator

CONTENT_FIXTURE = Path(__file__).resolve().parent / 'fixtures' / 'site-content.js'
PASSWORD = 'correct-horse-battery-9'
PSYCOPG_AVAILABLE = importlib.util.find_spec('psycopg') is not None
PRODUCTION_ENV = {
    'DJANGO_LOCAL': '0',
    'ADMIN_PATH': 'studio-7f3k2q9x/',
    'DJANGO_ALLOWED_HOSTS': 'cms.example.org',
    'DJANGO_CSRF_TRUSTED_ORIGINS': 'https://cms.example.org',
    'POSTGRES_DB': 'cms',
    'POSTGRES_USER': 'cms',
    'POSTGRES_PASSWORD': 'cms-local-check',
    'POSTGRES_HOST': 'localhost',
    'POSTGRES_PORT': '5432',
}


@contextmanager
def content_path():
    """A throwaway content file, including in containers with read-only source mounts."""
    handle, name = tempfile.mkstemp(prefix='.test-content-', suffix='.js')
    os.close(handle)
    path = Path(name)
    path.unlink()
    try:
        yield path
    finally:
        path.unlink(missing_ok=True)


def manage(*args, **env):
    """Run manage.py in a clean process so settings are evaluated from the given environment.

    A value of None removes that variable, which keeps the fail-fast tests deterministic on CI where the job
    already exports POSTGRES_*.
    """
    clean = {key: value for key, value in os.environ.items() if not key.startswith(('DJANGO_', 'ADMIN_PATH'))}
    clean['PYTHONIOENCODING'] = 'utf-8'  # Russian settings errors would otherwise be decoded from the console codepage
    for key, value in env.items():
        if value is None:
            clean.pop(key, None)
        else:
            clean[key] = str(value)
    return subprocess.run([sys.executable, 'manage.py', *args], cwd=settings.BASE_DIR, env=clean,
                          capture_output=True, text=True, encoding='utf-8')


class ProductionSettingsTests(SimpleTestCase):
    def test_debug_is_off_and_secret_required_without_explicit_local_flag(self):
        result = manage('check')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('DJANGO_SECRET_KEY', result.stderr)

    def test_production_requires_a_secret_admin_path(self):
        for path in ('', 'admin/', 'short/', 'no-trailing-slash-path'):
            result = manage('check', DJANGO_SECRET_KEY='x' * 50, ADMIN_PATH=path)
            self.assertNotEqual(result.returncode, 0, path)
            self.assertIn('ADMIN_PATH', result.stderr)

    def test_local_flag_is_refused_on_railway(self):
        result = manage('check', DJANGO_LOCAL='1', RAILWAY_ENVIRONMENT='production')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Railway', result.stderr)
        self.assertIn('DJANGO_LOCAL', result.stderr)

    def test_tracebacks_need_the_local_flag(self):
        result = manage('check', DJANGO_SECRET_KEY='x' * 50, ADMIN_PATH='studio-7f3k2q9x/', DJANGO_TRACEBACKS='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('DJANGO_TRACEBACKS', result.stderr)

    def test_production_requires_https_and_database_variables(self):
        result = manage('check', DJANGO_SECRET_KEY='x' * 50, ADMIN_PATH='studio-7f3k2q9x/',
                        POSTGRES_DB=None, POSTGRES_USER=None, POSTGRES_PASSWORD=None, POSTGRES_HOST=None)
        self.assertNotEqual(result.returncode, 0)
        for name in ('DJANGO_ALLOWED_HOSTS', 'DJANGO_CSRF_TRUSTED_ORIGINS', 'POSTGRES_DB'):
            self.assertIn(name, result.stderr)

    def test_missing_postgres_database_is_named(self):
        env = dict(PRODUCTION_ENV, DJANGO_SECRET_KEY='x' * 50, POSTGRES_DB=None)
        result = manage('check', **env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('POSTGRES_DB', result.stderr)
        self.assertNotIn('DJANGO_ALLOWED_HOSTS', result.stderr)

    @unittest.skipUnless(PSYCOPG_AVAILABLE, 'psycopg не установлен в локальной песочнице')
    def test_production_settings_pass_the_django_deploy_check(self):
        result = manage('check', '--deploy', '--fail-level', 'WARNING',
                        **dict(PRODUCTION_ENV, DJANGO_SECRET_KEY=secrets.token_urlsafe(60)))
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(PSYCOPG_AVAILABLE and settings.WHITENOISE_AVAILABLE, 'нет psycopg/whitenoise локально')
    def test_production_serves_static_files_with_whitenoise(self):
        result = manage('shell', '-c',
                        'from django.conf import settings; print("whitenoise.middleware.WhiteNoiseMiddleware" in '
                        'settings.MIDDLEWARE); print(settings.STORAGES["staticfiles"]["BACKEND"])',
                        **dict(PRODUCTION_ENV, DJANGO_SECRET_KEY='x' * 50))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('True', result.stdout)
        self.assertIn('whitenoise.storage.CompressedStaticFilesStorage', result.stdout)


class ContentValidationTests(TestCase):
    def assertInvalid(self, obj):
        with self.assertRaises(ValidationError):
            obj.full_clean()

    def test_contact_formats_match_the_site_generator(self):
        contacts = Contacts.load()
        Phone(contacts=contacts, number='+998913036001').full_clean()
        self.assertInvalid(Phone(contacts=contacts, number='913036001'))
        self.assertInvalid(Phone(contacts=contacts, number='+79161234567'))
        self.assertInvalid(AdmissionsTelegram(contacts=contacts, url='https://t.me/ab'))
        self.assertInvalid(AdmissionsTelegram(contacts=contacts, url='https://example.org/stanford_nukus'))

    def test_verified_contacts_need_an_admissions_channel_and_hr_stays_separate(self):
        contacts = Contacts(verified=False)
        contacts.save()
        contacts.verified = True
        self.assertInvalid(contacts)
        Phone.objects.create(contacts=contacts, number='+998913036001')
        contacts.full_clean()
        contacts.hr_telegram = 'https://t.me/stanford_nukus'
        AdmissionsTelegram.objects.create(contacts=contacts, url='https://t.me/stanford_nukus')
        self.assertInvalid(contacts)
        contacts.hr_telegram = 'https://t.me/hrstanfordlc'
        contacts.full_clean()

    def test_legacy_family_price_does_not_restrict_the_active_monthly_price(self):
        for special_price in (100, 200):
            Course(slug='x', name='X', category='languages', description='d', price=100,
                   special_price=special_price).full_clean()
        Course(slug='x', name='X', category='languages', description='d', price=100, special_price=99).full_clean()

    def test_course_fields_must_be_publishable(self):
        for field, value in (('price', 0), ('special_price', 0), ('name', '   '), ('description', ' '),
                             ('category', 'other')):
            course = Course(slug='x', name='X', category='languages', description='d', price=100)
            setattr(course, field, value)
            self.assertInvalid(course)
        Course(slug='x', name='X', category='exam', description='d', price=100).full_clean()

    def test_site_url_is_https_only_and_clean(self):
        for url in ('http://example.org', 'https://user:pass@example.org', 'https://example.org/?a=1',
                    'https://example.org/#top'):
            self.assertInvalid(SiteSettings(site_url=url))
        for url in ('https://example.org', 'https://example.org/cms', ''):
            SiteSettings(site_url=url).full_clean()

    def test_cashback_tiers_and_rules_are_validated(self):
        for tier in (CashbackTier(exam='ielts', score='7.0', reward=0),
                     CashbackTier(exam='toefl', score='7.0', reward=1),
                     CashbackTier(exam='ielts', score='7.0', reward=100, label='x' * 41)):
            self.assertInvalid(tier)
        CashbackTier(exam='sat', score='1600', reward=100, label='100 сум', hero=True).full_clean()
        self.assertInvalid(CashbackRule(title='', text='t'))
        CashbackRule(title='Шаг', text='Условие').full_clean()

    def test_map_links_must_match_their_provider_and_coordinates_come_in_pairs(self):
        location = Location.objects.create(slug='a', name='A', address='Addr')
        self.assertInvalid(MapLink(location=location, provider='google', url='https://yandex.uz/maps/-/CXbaBL5l'))
        MapLink(location=location, provider='yandex', url='https://yandex.uz/maps/-/CXbaBL5l').full_clean()
        MapLink(location=location, provider='google', url='https://www.google.com/maps/search/?api=1&query=42.455094%2C59.62766').full_clean()
        self.assertInvalid(MapLink(location=location, provider='google', url='https://www.google.com.evil.example/maps/search/?api=1&query=42,59'))
        self.assertInvalid(MapLink(location=location, provider='google', url='https://www.google.com/maps/search/?api=1&query=42,59&redirect=https://evil.example'))
        self.assertInvalid(Location(slug='b', name='B', address='Addr', longitude=59.6))

    @unittest.skipUnless(settings.MAX_UPLOAD_BYTES == 5 * 1024 * 1024, 'размер загрузки переопределен')
    def test_photos_are_limited_by_format(self):
        with self.assertRaises(ValidationError):
            photo_extension_validator(SimpleUploadedFile('animation.gif', b'GIF89a'))

    def test_photos_are_limited_by_size(self):
        from django.test import override_settings
        with override_settings(MAX_UPLOAD_BYTES=10):
            with self.assertRaises(ValidationError):
                photo_size_validator(SimpleUploadedFile('big.jpg', b'x' * 11))
            photo_size_validator(SimpleUploadedFile('ok.jpg', b'x' * 10))


class ImportContentTests(TestCase):
    def setUp(self):
        self.output = io.StringIO()
        self.content_path = CONTENT_FIXTURE

    def import_content(self, *args, **options):
        return call_command('import_content', *args, stdout=self.output, **options)

    def test_import_loads_every_section_of_the_published_content(self):
        self.import_content(str(self.content_path))
        data = read_content(self.content_path)
        self.assertEqual(Course.objects.count(), len(data['courses']))
        self.assertEqual(Teacher.objects.count(), len(data['teachers']))
        self.assertEqual(StudentResult.objects.count(), len(data['results']))
        self.assertEqual(Location.objects.count(), len(data['contacts']['locations']))
        self.assertEqual(SiteSettings.load().demo_mode, data['site']['demoMode'])
        self.assertEqual(CashbackTier.objects.count(),
                         sum(len(data['cashback'][exam]) for exam in ('ielts', 'sat')))
        self.assertEqual(CashbackRule.objects.count(), len(data['cashback'].get('rules', [])))
        first = data['courses'][0]
        course = Course.objects.get(slug=first['id'])
        self.assertEqual((course.price, course.special_price), (first['price'], first.get('specialPrice')))
        self.assertEqual(list(course.skills.values_list('text', flat=True)), first['skills'])
        # Every imported record passes the same validation the admin forms apply.
        for model in (Course, Teacher, StudentResult, Location, MapLink, Phone, AdmissionsTelegram, CashbackTier,
                      CashbackRule):
            for obj in model.objects.all():
                obj.full_clean()

    def test_missing_demo_mode_defaults_to_release_and_cannot_publish_samples_without_consent(self):
        data = read_content(self.content_path)
        data['site'].pop('demoMode', None)
        with content_path() as path:
            write_content(data, path)
            with self.assertRaises(CommandError):
                self.import_content(str(path))
            data['results'] = []
            write_content(data, path)
            self.import_content(str(path))
        self.assertFalse(SiteSettings.load().demo_mode)

    def test_import_refuses_a_non_empty_database_without_force(self):
        self.import_content(str(self.content_path))
        with self.assertRaises(CommandError) as caught:
            self.import_content(str(self.content_path))
        self.assertIn('--force', str(caught.exception))
        self.assertEqual(Course.objects.count(), len(read_content(self.content_path)['courses']))

    def test_force_replaces_the_existing_content(self):
        self.import_content(str(self.content_path))
        self.import_content(str(self.content_path), '--force')
        self.assertEqual(Course.objects.count(), len(read_content(self.content_path)['courses']))

    def test_dry_run_reports_without_writing(self):
        self.import_content(str(self.content_path), '--dry-run')
        self.assertEqual(Course.objects.count(), 0)
        self.assertEqual(CashbackTier.objects.count(), 0)
        self.assertIn('Пробный прогон', self.output.getvalue())

    def test_dry_run_on_a_filled_database_keeps_the_data(self):
        self.import_content(str(self.content_path))
        course_ids = list(Course.objects.values_list('pk', flat=True))
        self.import_content(str(self.content_path), '--dry-run', '--force')
        self.assertEqual(list(Course.objects.values_list('pk', flat=True)), course_ids)

    def test_invalid_file_is_rejected_and_nothing_is_saved(self):
        data = read_content(self.content_path)
        data['courses'][0]['price'] = 0
        with content_path() as path:
            write_content(data, path)
            with self.assertRaises(CommandError) as caught:
                self.import_content(str(path))
        self.assertIn('не прошли проверку', str(caught.exception))
        self.assertEqual(Course.objects.count(), 0)

    def test_import_export_round_trip_keeps_the_content(self):
        original = read_content(self.content_path)
        original.setdefault('practices', [])
        for course in original['courses']:
            course.pop('specialPrice', None)
        self.import_content(str(self.content_path))
        with content_path() as exported_path:
            call_command('export_content', '--output', str(exported_path), stdout=io.StringIO())
            exported = read_content(exported_path)
            text = exported_path.read_text(encoding='utf-8')
            self.assertEqual(exported, original)
            self.assertIn('window.schoolContent = {', text)
            self.assertIn('\n  "site": {', text)
            self.assertNotIn('photo', text)
            # Re-importing the exported file restores exactly the same database content.
            self.import_content(str(exported_path), '--force')
        self.assertEqual(build_content(), original)


class ExportContentTests(TestCase):
    def setUp(self):
        self.output = io.StringIO()
        call_command('import_content', str(CONTENT_FIXTURE), stdout=self.output)

    def test_export_fails_when_published_contacts_have_no_channel(self):
        Phone.objects.all().delete()
        AdmissionsTelegram.objects.all().delete()
        with content_path() as path:
            with self.assertRaises(CommandError) as caught:
                call_command('export_content', '--output', str(path), stdout=io.StringIO())
            self.assertIn('не пройдет публикацию', str(caught.exception))
            self.assertFalse(path.exists())

    def test_export_uses_the_default_path_relative_to_the_site_root(self):
        # --output is what tests use; the default is documented in README (../content.js) and not touched here.
        from content.management.commands.export_content import Command
        parser = Command().create_parser('manage.py', 'export_content')
        self.assertEqual(parser.parse_args([]).output, str(settings.SITE_ROOT / 'content.js'))


class ExportEmptyDatabaseTests(TestCase):
    def test_export_refuses_an_empty_database_and_creates_nothing(self):
        with content_path() as path:
            with self.assertRaises(CommandError) as caught:
                call_command('export_content', '--output', str(path), stdout=io.StringIO())
            self.assertIn('import_content', str(caught.exception))
            self.assertFalse(path.exists())
        self.assertEqual(SiteSettings.objects.count(), 0)
        self.assertEqual(Contacts.objects.count(), 0)


class HealthCheckTests(TestCase):
    def test_healthz_is_plain_ok_without_login(self):
        response = self.client.get('/healthz')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'ok')
        self.assertTrue(response['Content-Type'].startswith('text/plain'))
        self.assertEqual(response['X-Robots-Tag'], 'noindex, nofollow')


class AdminTestCase(TestCase):
    """Password + one-time code login, shared by the access and form-saving tests."""

    def setUp(self):
        call_command('import_content', str(CONTENT_FIXTURE), stdout=io.StringIO())
        self.user = User.objects.create_superuser('owner', 'owner@example.org', PASSWORD)
        self.device = TOTPDevice.objects.create(user=self.user, name='Authenticator', confirmed=True)
        self.login_url = reverse('admin:login')
        self.index_url = reverse('admin:index')

    def code(self):
        token = totp(self.device.bin_key, step=self.device.step, t0=self.device.t0, digits=self.device.digits, drift=self.device.drift)
        return str(token).zfill(self.device.digits)

    def login(self, password=PASSWORD, otp_token=None):
        return self.client.post(self.login_url, {'username': 'owner', 'password': password,
                                                 'otp_token': self.code() if otp_token is None else otp_token})

    def assertNoAccess(self):
        response = self.client.get(self.index_url)
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response['Location'].startswith(self.login_url))


class AdminAccessTests(AdminTestCase):
    def test_login_page_asks_for_the_code_and_is_not_indexed(self):
        response = self.client.get(self.login_url)
        self.assertContains(response, 'name="otp_token"')
        self.assertContains(response, 'Код из приложения')
        self.assertContains(response, 'name="next"')
        self.assertEqual(response['X-Robots-Tag'], 'noindex, nofollow')

    def test_password_alone_or_a_wrong_code_does_not_open_the_admin(self):
        self.login(otp_token='')
        self.assertNoAccess()
        self.login(otp_token='000000' if self.code() != '000000' else '111111')
        self.assertNoAccess()
        self.client.force_login(self.user)  # authenticated but not OTP-verified
        self.assertNoAccess()

    def test_password_and_code_open_every_admin_page(self):
        response = self.login()
        self.assertEqual(response.status_code, 302, response.context and response.context['form'].errors)
        self.assertEqual(self.client.get(self.index_url).status_code, 200)
        for model, model_admin in admin.site._registry.items():
            info = (model._meta.app_label, model._meta.model_name)
            changelist = self.client.get(reverse('admin:%s_%s_changelist' % info), follow=True)
            self.assertEqual(changelist.status_code, 200, info)
            obj = model.objects.first()
            if obj is not None:
                self.assertEqual(self.client.get(reverse('admin:%s_%s_change' % info, args=[obj.pk])).status_code, 200, info)

    def test_five_wrong_passwords_lock_the_account_even_for_the_right_one(self):
        for _ in range(settings.AXES_FAILURE_LIMIT):
            self.login(password='wrong-password')
        response = self.login()
        self.assertEqual(response.status_code, 429)
        self.assertContains(response, 'Слишком много попыток входа', status_code=429)
        self.assertNotContains(response, 'owner', status_code=429)
        self.assertNoAccess()


class AdminFormSaveTests(AdminTestCase):
    """The admin must save valid content and reject what build.mjs would refuse to publish."""

    def test_settings_are_saved_through_the_admin_form(self):
        self.login()
        url = reverse('admin:content_sitesettings_change', args=[1])
        response = self.client.post(url, {'demo_mode': 'on', 'site_url': 'https://cms.example.org/cms',
                                          'city': 'Нукус'})
        self.assertEqual(response.status_code, 302, response.context and response.context['adminform'].form.errors)
        saved = SiteSettings.load()
        self.assertEqual(saved.site_url, 'https://cms.example.org/cms')
        self.assertTrue(saved.demo_mode)

    def test_admin_rejects_an_http_site_url(self):
        self.login()
        response = self.client.post(reverse('admin:content_sitesettings_change', args=[1]),
                                    {'demo_mode': 'on', 'site_url': 'http://cms.example.org', 'city': 'Нукус'})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Только https://')
        self.assertEqual(SiteSettings.load().site_url, 'https://1-production-8f16.up.railway.app')

    def test_admin_edits_only_the_monthly_price_and_ignores_posted_legacy_discounts(self):
        self.login()
        course = Course.objects.get(slug='general-english')
        url = reverse('admin:content_course_change', args=[course.pk])
        old_legacy_price = course.special_price
        self.assertNotContains(self.client.get(url), 'name="special_price"')
        data = {'name': course.name, 'subtitle': course.subtitle, 'category': course.category,
                'description': course.description, 'price': '700000', 'special_price': '650000',
                'target': course.target, 'slug': course.slug, 'is_published': 'on', 'order': str(course.order),
                'skills-TOTAL_FORMS': '0', 'skills-INITIAL_FORMS': '0', 'skills-MIN_NUM_FORMS': '0',
                'skills-MAX_NUM_FORMS': '1000'}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, 302, response.context and response.context['adminform'].form.errors)
        course.refresh_from_db()
        self.assertEqual((course.price, course.special_price), (700000, old_legacy_price))
        response = self.client.post(url, dict(data, price='400000', special_price='800000'))
        self.assertEqual(response.status_code, 302)
        course.refresh_from_db()
        self.assertEqual(course.price, 400000)
        self.assertEqual(course.special_price, old_legacy_price)


LEAKS = ('admin', 'Django', 'Traceback', 'urlpatterns', 'URLconf', 'DEBUG', 'settings')


class ErrorPageTests(TestCase):
    """Error pages must not reveal paths, the framework, settings or stack traces."""

    def assertNeutral(self, response, status, heading):
        self.assertEqual(response.status_code, status)
        body = response.content.decode()
        self.assertIn(heading, body)
        self.assertIn('noindex', body)
        for leak in LEAKS:
            self.assertNotIn(leak, body, f'{status} page reveals {leak!r}')

    def test_unknown_paths_get_a_neutral_404(self):
        for url in ('/', '/wp-admin/', '/admin', '/.env', '/static/missing.css', '/media/missing.jpg'):
            self.assertNeutral(self.client.get(url), 404, 'Страница не найдена')

    def test_path_traversal_gets_a_neutral_400(self):
        self.assertNeutral(self.client.get('/static/../config/settings.py'), 400, 'Некорректный запрос')
        # Anonymous media requests disclose neither files nor their existence.
        self.assertNeutral(self.client.get('/media/../db.sqlite3'), 404, 'Страница не найдена')

    def test_bad_host_gets_a_neutral_400(self):
        self.assertNeutral(self.client.get(reverse('admin:login'), HTTP_HOST='evil.example'), 400, 'Некорректный запрос')

    def test_missing_csrf_token_gets_a_neutral_403(self):
        client = self.client_class(enforce_csrf_checks=True)
        self.assertNeutral(client.post(reverse('admin:login'), {'username': 'x', 'password': 'y'}), 403, 'Сессия устарела')

    def test_server_error_gets_a_neutral_500(self):
        from django.test import RequestFactory
        from django.views.defaults import server_error
        self.assertNeutral(server_error(RequestFactory().get('/')), 500, 'Что-то пошло не так')

    def test_local_preview_never_turns_on_technical_error_pages(self):
        result = manage('shell', '-c', 'from django.conf import settings; print(settings.DEBUG, settings.LOCAL)', DJANGO_LOCAL='1')
        self.assertEqual(result.stdout.split()[-2:], ['False', 'True'], result.stderr)


class EnableTwoFactorTests(TestCase):
    def test_command_replaces_the_device_and_writes_qr_and_link(self):
        user = User.objects.create_superuser('owner', 'owner@example.org', PASSWORD)
        TOTPDevice.objects.create(user=user, name='old', confirmed=True)
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        output = Path(temporary.name) / 'two-factor'
        try:
            call_command('enable_2fa', 'owner', output=output, stdout=io.StringIO())
            self.assertEqual(TOTPDevice.objects.filter(user=user).count(), 1)
            self.assertTrue((output / 'owner-qr.png').stat().st_size > 0)
            self.assertTrue((output / 'owner-link.txt').read_text(encoding='utf-8').startswith('otpauth://totp/'))
        finally:
            for file in output.glob('*'):
                file.unlink()
            output.rmdir()

    def test_print_mode_warns_about_the_secret_in_logs(self):
        User.objects.create_superuser('owner', 'owner@example.org', PASSWORD)
        stdout, stderr = io.StringIO(), io.StringIO()
        call_command('enable_2fa', 'owner', print=True, stdout=stdout, stderr=stderr)
        self.assertIn('otpauth://totp/', stdout.getvalue())
        self.assertIn('секрет', stderr.getvalue().lower())
        self.assertIn('логи', stderr.getvalue().lower())


class PageTextsAndTranslationsTests(AdminTestCase):
    """Texts, FAQ and Uzbek translations edited in the admin reach content.js and uz.js."""

    def test_page_texts_and_faq_are_imported_and_exported(self):
        from .models import Faq, PageText
        data = read_content(CONTENT_FIXTURE)
        self.assertEqual(PageText.objects.count(), len(data['texts']))
        self.assertEqual(Faq.objects.count(), len(data['faq']))
        text = PageText.objects.get(key='hero.text1')
        self.assertEqual(text.section, 'hero')
        self.assertEqual(text.place(), 'Текст 1')
        text.text = 'Новый текст первого экрана'
        text.save()
        Faq.objects.create(question='Новый вопрос?', answer='Новый ответ.', order=99)
        exported = build_content()
        self.assertEqual(exported['texts']['hero.text1'], 'Новый текст первого экрана')
        self.assertEqual(exported['faq'][-1], {'question': 'Новый вопрос?', 'answer': 'Новый ответ.'})

    def test_page_texts_cannot_be_added_or_deleted_but_are_saved_through_the_form(self):
        from .models import PageText
        self.login()
        text = PageText.objects.get(key='why.title1')
        self.assertEqual(self.client.get(reverse('admin:content_pagetext_add')).status_code, 403)
        self.assertEqual(self.client.post(reverse('admin:content_pagetext_delete', args=[text.pk]), {'post': 'yes'}).status_code, 403)
        response = self.client.post(reverse('admin:content_pagetext_change', args=[text.pk]),
                                    {'text': 'Почему мы', 'uz': 'Nega biz'})
        self.assertEqual(response.status_code, 302, response.context and response.context['adminform'].errors)
        text.refresh_from_db()
        self.assertEqual((text.text, text.uz, text.key), ('Почему мы', 'Nega biz', 'why.title1'))
        response = self.client.post(reverse('admin:content_pagetext_change', args=[text.pk]), {'text': '   ', 'uz': ''})
        self.assertEqual(response.status_code, 200)  # an empty text is refused

    def test_uz_dictionary_round_trip_keeps_patterns_and_reads_both_quote_styles(self):
        from .serialization import build_uz_strings, load_uz_strings, read_uz_strings, write_uz_strings
        source = ("window.stanfordUz = {\n  strings: {\n    // comment: 'not a pair'\n"
                  "    'Курсы и цены': 'Kurslar va narxlar',\n    \"Он сказал: \\\"да\\\"\": 'U \\'ha\\' dedi',\n"
                  "    'АК': 'AK', 'ДЮ': 'DY'\n  },\n\n  // numbers\n  patterns: [\n    [/^(\\d+) сум$/, m => `${m[1]} söm`]\n  ]\n};\n")
        with content_path() as path:
            path.write_text(source, encoding='utf-8')
            strings = read_uz_strings(path)
            self.assertEqual(strings, {'Курсы и цены': 'Kurslar va narxlar', 'Он сказал: "да"': "U 'ha' dedi",
                                       'АК': 'AK', 'ДЮ': 'DY'})
            summary = load_uz_strings(strings)
            self.assertGreaterEqual(summary['page_texts'], 1)  # «Курсы и цены» is a page text
            built = build_uz_strings()
            self.assertEqual({key: built[key] for key in strings}, strings)
            write_uz_strings(path, built)
            written = path.read_text(encoding='utf-8')
            self.assertIn('patterns: [\n    [/^(\\d+) сум$/, m => `${m[1]} söm`]', written)
            self.assertEqual(read_uz_strings(path), built)

    def test_publish_needs_post_and_reports_a_missing_node_without_touching_files(self):
        from unittest import mock
        self.login()
        publish_url = reverse('admin:publish')
        self.assertEqual(self.client.get(publish_url).status_code, 405)
        content = (settings.SITE_ROOT / 'content.js').read_bytes()
        with mock.patch('content.publish.find_node', return_value=None):
            response = self.client.post(publish_url, follow=True)
        self.assertContains(response, 'Не найден Node.js')
        self.assertEqual((settings.SITE_ROOT / 'content.js').read_bytes(), content)

    def test_failed_build_restores_the_site_files(self):
        from types import SimpleNamespace
        from unittest import mock
        from .models import PageText
        from .publish import PublishError, publish_site
        PageText.objects.filter(key='hero.text1').update(text='Черновик, который не должен попасть на сайт')
        paths = [settings.SITE_ROOT / 'content.js', settings.SITE_ROOT / 'assets' / 'i18n' / 'uz.js']
        before = [path.read_bytes() for path in paths]
        failed = SimpleNamespace(returncode=1, stdout='', stderr='Error: Text hero.text1 is too long\n')
        with mock.patch('content.publish.find_node', return_value='node'), \
                mock.patch('content.publish.subprocess.run', return_value=failed):
            with self.assertRaisesMessage(PublishError, 'Text hero.text1 is too long'):
                publish_site()
        self.assertEqual([path.read_bytes() for path in paths], before)

    def test_publish_is_hidden_from_staff_who_are_not_the_owner(self):
        self.user.is_superuser = False
        self.user.save()
        self.login()
        self.assertNotContains(self.client.get(self.index_url), 'publish-form')
