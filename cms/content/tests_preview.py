"""Preview of the site from the drafts: owner only, built like a publication, nothing published."""
import os
import shutil
import tempfile
from pathlib import Path
from unittest import mock

from django.conf import settings
from django.test import override_settings
from django.urls import reverse

from .tests import AdminTestCase

SITE_FILES = ('build.mjs', 'content.js', 'index.html', 'results.html', 'career.html', 'teachers.html', 'privacy.html',
              'feedback.html', 'script.js', 'results.js', 'career.js', 'feedback.js', 'theme-init.js', 'style.css')


class PreviewTests(AdminTestCase):
    def copy_site(self, root):
        site = root / 'site'
        site.mkdir()
        for name in SITE_FILES:
            shutil.copyfile(settings.SITE_ROOT / name, site / name)
        for folder in ('assets', 'templates'):
            shutil.copytree(settings.SITE_ROOT / folder, site / folder)
        return site

    def test_only_the_signed_in_owner_sees_the_preview(self):
        for url in (reverse('admin:preview'), reverse('admin:preview_file', args=['teachers'])):
            response = self.client.get(url)
            self.assertEqual(response.status_code, 302)
            self.assertTrue(response['Location'].startswith(self.login_url))
        self.assertEqual(self.client.post(reverse('admin:preview_build')).status_code, 302)

    def test_preview_is_built_from_the_drafts_and_publishes_nothing(self):
        node = shutil.which('node')
        if not node:
            self.skipTest('Node.js is needed to build the site')
        self.login()
        with tempfile.TemporaryDirectory() as temporary, \
                mock.patch('content.preview.preview_root', return_value=Path(temporary) / 'preview'):
            site = self.copy_site(Path(temporary))
            before = (site / 'index.html').read_bytes()
            with override_settings(SITE_ROOT=site, LOCAL=True), \
                    mock.patch.dict(os.environ, {'SITE_PUBLISH_TARGET': 'local', 'SITE_NODE_BINARY': node}):
                response = self.client.post(reverse('admin:preview_build'))
                self.assertEqual(response.status_code, 302, response.content[:300])
                self.assertEqual(response['Location'], reverse('admin:preview'))
                home = self.client.get(reverse('admin:preview'))
                self.assertEqual(home.status_code, 200)
                page = home.content.decode('utf-8')
                self.assertIn('Предпросмотр — ещё не опубликовано', page)
                self.assertIn('href="uz/"', page, 'Language links stay inside the preview')
                self.assertNotIn('rel="alternate" hreflang=', page, 'A saved language choice cannot leave the preview')
                self.assertIn('noindex', home['X-Robots-Tag'])
                teachers = self.client.get(reverse('admin:preview_file', args=['uz/teachers']))
                self.assertEqual(teachers.status_code, 200)
                self.assertIn('href="../teachers"', teachers.content.decode('utf-8'))
                style = self.client.get(reverse('admin:preview_file', args=['style.css']))
                self.assertEqual(style.status_code, 200)
                style.close()
                # Nothing outside the preview (or the site's own files) can be read through it.
                from content.preview import fallback, resolve
                for escape in ('../../etc/passwd', '../site/../../cms/db.sqlite3'):
                    self.assertIsNone(resolve(escape))
                    self.assertIsNone(fallback(escape))
            self.assertEqual((site / 'index.html').read_bytes(), before, 'The published site is not touched')
