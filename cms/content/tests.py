import json
import secrets
import os
import subprocess
import sys

from django.conf import settings
from django.contrib import admin
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from django_otp.oath import totp
from django_otp.plugins.otp_totp.models import TOTPDevice

from .management.commands.import_content import read_content
from .models import AdmissionsTelegram, Contacts, Course, Location, MapLink, Phone, StudentResult, Teacher
from .validators import photo_extension_validator, photo_size_validator

PASSWORD = 'correct-horse-battery-9'


def manage(*args, **env):
    """Run manage.py in a clean process so settings are evaluated from the given environment."""
    clean = {key: value for key, value in os.environ.items() if not key.startswith(('DJANGO_', 'ADMIN_PATH'))}
    clean.update(env)
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

    def test_production_settings_pass_the_django_deploy_check(self):
        result = manage('check', '--deploy', '--fail-level', 'WARNING', DJANGO_SECRET_KEY=secrets.token_urlsafe(60),
                        ADMIN_PATH='studio-7f3k2q9x/', DJANGO_ALLOWED_HOSTS='cms.example.org',
                        DJANGO_CSRF_TRUSTED_ORIGINS='https://cms.example.org')
        self.assertEqual(result.returncode, 0, result.stderr)


class ContentValidationTests(TestCase):
    def assertInvalid(self, obj):
        with self.assertRaises(ValidationError):
            obj.full_clean()

    def test_contact_formats_match_the_site_generator(self):
        contacts = Contacts.load()
        Phone(contacts=contacts, number='+998913036001').full_clean()
        self.assertInvalid(Phone(contacts=contacts, number='913036001'))
        self.assertInvalid(AdmissionsTelegram(contacts=contacts, url='https://t.me/ab'))
        self.assertInvalid(AdmissionsTelegram(contacts=contacts, url='https://example.org/stanford_nukus'))

    def test_family_price_cannot_exceed_the_standard_price(self):
        self.assertInvalid(Course(slug='x', name='X', category='languages', description='d', price=100, special_price=200))

    def test_map_links_must_match_their_provider_and_coordinates_come_in_pairs(self):
        location = Location.objects.create(slug='a', name='A', address='Addr')
        self.assertInvalid(MapLink(location=location, provider='google', url='https://yandex.uz/maps/-/CXbaBL5l'))
        MapLink(location=location, provider='yandex', url='https://yandex.uz/maps/-/CXbaBL5l').full_clean()
        self.assertInvalid(Location(slug='b', name='B', address='Addr', longitude=59.6))

    @override_settings(MAX_UPLOAD_BYTES=10)
    def test_photos_are_limited_by_size_and_format(self):
        with self.assertRaises(ValidationError):
            photo_size_validator(SimpleUploadedFile('big.jpg', b'x' * 11))
        photo_size_validator(SimpleUploadedFile('ok.jpg', b'x' * 10))
        with self.assertRaises(ValidationError):
            photo_extension_validator(SimpleUploadedFile('animation.gif', b'GIF89a'))


class ImportContentTests(TestCase):
    def test_import_loads_every_section_of_the_published_content(self):
        call_command('import_content', stdout=open(os.devnull, 'w', encoding='utf-8'))
        data = read_content(settings.SITE_ROOT / 'content.js')
        self.assertEqual(Course.objects.count(), len(data['courses']))
        self.assertEqual(Teacher.objects.count(), len(data['teachers']))
        self.assertEqual(StudentResult.objects.count(), len(data['results']))
        self.assertEqual(Location.objects.count(), len(data['contacts']['locations']))
        first = data['courses'][0]
        course = Course.objects.get(slug=first['id'])
        self.assertEqual((course.price, course.special_price), (first['price'], first.get('specialPrice')))
        self.assertEqual(list(course.skills.values_list('text', flat=True)), first['skills'])
        # Every imported record passes the same validation the admin forms apply.
        for model in (Course, Teacher, StudentResult, Location, MapLink, Phone, AdmissionsTelegram):
            for obj in model.objects.all():
                obj.full_clean()


class AdminAccessTests(TestCase):
    def setUp(self):
        call_command('import_content', stdout=open(os.devnull, 'w', encoding='utf-8'))
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

    def test_login_page_asks_for_the_code_and_is_not_indexed(self):
        response = self.client.get(self.login_url)
        self.assertContains(response, 'name="otp_token"')
        self.assertContains(response, 'Код из приложения')
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
        for url in ('/static/../config/settings.py', '/media/../db.sqlite3'):
            self.assertNeutral(self.client.get(url), 400, 'Некорректный запрос')

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
        output = settings.BASE_DIR / '.local-2fa-test'
        try:
            call_command('enable_2fa', 'owner', output=output, stdout=open(os.devnull, 'w', encoding='utf-8'))
            self.assertEqual(TOTPDevice.objects.filter(user=user).count(), 1)
            self.assertTrue((output / 'owner-qr.png').stat().st_size > 0)
            self.assertTrue((output / 'owner-link.txt').read_text(encoding='utf-8').startswith('otpauth://totp/'))
        finally:
            for file in output.glob('*'):
                file.unlink()
            output.rmdir()
