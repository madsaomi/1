"""Draft media access checks; all files and accounts belong to an isolated test database."""
import tempfile
from pathlib import Path

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.urls import reverse
from django_otp.oath import totp
from django_otp.plugins.otp_totp.models import TOTPDevice


class PrivateMediaTests(TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name) / 'media'
        self.root.mkdir()
        (self.root / 'portrait.jpg').write_bytes(b'private draft image')
        self.settings_override = override_settings(MEDIA_ROOT=self.root)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.user = User.objects.create_superuser('media-owner', '', 'test-media-password-742')
        self.device = TOTPDevice.objects.create(user=self.user, name='Authenticator', confirmed=True)

    def login_verified(self):
        code = str(totp(self.device.bin_key, step=self.device.step, t0=self.device.t0,
                        digits=self.device.digits, drift=self.device.drift)).zfill(self.device.digits)
        response = self.client.post(reverse('admin:login'), {
            'username': self.user.username, 'password': 'test-media-password-742', 'otp_token': code})
        self.assertEqual(response.status_code, 302)

    def test_anonymous_and_password_only_sessions_cannot_read_draft_photos(self):
        for authenticate in (False, True):
            if authenticate:
                self.client.force_login(self.user)
            response = self.client.get('/media/portrait.jpg')
            self.assertEqual(response.status_code, 404)
            self.assertNotContains(response, 'private draft image', status_code=404)

    def test_verified_staff_can_preview_uploads_without_public_cache(self):
        self.login_verified()
        response = self.client.get('/media/portrait.jpg')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b''.join(response.streaming_content), b'private draft image')
        # The test client's streaming wrapper closes the response on exhaustion.
        # A second close emits request_finished outside that wrapper and closes
        # PostgreSQL while TestCase still owns its surrounding transaction.
        self.assertTrue(response.closed)
        self.assertIn('private', response['Cache-Control'])
        self.assertIn('no-store', response['Cache-Control'])
        self.assertEqual(response['X-Robots-Tag'], 'noindex, nofollow')
        self.user.is_staff = False
        self.user.save(update_fields=['is_staff'])
        self.assertEqual(self.client.get('/media/portrait.jpg').status_code, 404)

    def test_verified_session_cannot_escape_media_root_or_list_directories(self):
        self.login_verified()
        (self.root.parent / 'outside.jpg').write_bytes(b'outside image')
        for path in ('/media/../outside.jpg', '/media/%2e%2e/outside.jpg', '/media/'):
            self.assertEqual(self.client.get(path).status_code, 404, path)

    def test_verified_session_cannot_follow_a_symlink_outside_media_root(self):
        outside = self.root.parent / 'outside.jpg'
        outside.write_bytes(b'outside image')
        try:
            (self.root / 'linked.jpg').symlink_to(outside)
        except OSError:
            self.skipTest('Creating symlinks is unavailable on this host')
        self.login_verified()
        self.assertEqual(self.client.get('/media/linked.jpg').status_code, 404)
