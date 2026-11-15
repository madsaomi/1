"""Mixed-media export, restore and atomic publication in isolated files/databases only."""
import base64
import hashlib
import io
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from django.core.files.base import ContentFile
from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings
from PIL import Image

from .github import GitHubClient, GitHubError, SOURCE_FILES, allowed_media, blob_sha
from .models import MediaItem, Practice, SiteSettings, StudentResult, Teacher
from .publish import (PublicationAssets, PublishError, cleanup_public_photos, media_paths, publish_local, publish_site,
                      validate_release_media_size)
from .serialization import build_content, collect_photo_files, validate_content, validate_gallery, write_content
from .tests import CONTENT_FIXTURE


IMAGE = 'assets/uploads/' + 'a' * 64 + '.jpg'
VIDEO = 'assets/uploads/' + 'b' * 64 + '.mp4'
POSTER = 'assets/uploads/' + 'c' * 64 + '.jpg'


class GalleryShapeTests(SimpleTestCase):
    def test_portable_media_accepts_ordered_mixed_slides_and_rejects_urls_traversal_and_type_confusion(self):
        validate_gallery([{'type': 'video', 'src': VIDEO, 'poster': POSTER, 'alt': 'Занятие'},
                          {'type': 'image', 'src': IMAGE}])
        for path in ('https://example.org/a.mp4', '//example.org/a.jpg', '../a.mp4', 'assets/../a.mp4',
                     'assets/a.svg', 'assets/a.mp4?private=1', 'assets/a.webm', 'assets/a.MP4', 'assets\\a.mp4'):
            self.assertFalse(allowed_media(path), path)
            with self.assertRaises(CommandError):
                validate_gallery([{'type': 'video', 'src': path}])
        for item in ({'type': 'image', 'src': VIDEO}, {'type': 'video', 'src': IMAGE},
                     {'type': 'image', 'src': IMAGE, 'poster': POSTER},
                     {'type': 'video', 'src': VIDEO, 'poster': VIDEO},
                     {'type': [], 'src': IMAGE}, {'type': 'image', 'src': IMAGE, 'onload': 'bad'},
                     {'type': 'image', 'src': IMAGE, 'alt': 'x' * 161}):
            with self.assertRaises(CommandError):
                validate_gallery([item])
        with self.assertRaises(CommandError):
            validate_gallery([{'type': 'image', 'src': IMAGE}] * 9)
        with self.assertRaises(CommandError):
            validate_gallery([{'type': 'video', 'src': VIDEO}] * 3)

    def test_every_media_reference_including_hero_results_and_posters_is_retained(self):
        data = {'site': {'heroMedia': [{'type': 'video', 'src': VIDEO, 'poster': POSTER}]},
                'teachers': [{'photo': IMAGE}], 'results': [{'media': [{'type': 'image', 'src': 'assets/student.jpg'}]}],
                'practices': [{'media': [{'type': 'image', 'src': 'assets/practice.png'}]}],
                'contacts': {'locations': [{'photo': 'assets/branch.webp'}]}}
        self.assertEqual(media_paths(data), {VIDEO, POSTER, IMAGE, 'assets/student.jpg', 'assets/practice.png', 'assets/branch.webp'})

    def test_publication_collection_limits_memory_and_deduplicates_content_paths(self):
        files = PublicationAssets()
        with mock.patch('content.publish.MAX_RELEASE_BYTES', 6):
            files[IMAGE] = b'1234'
            files[IMAGE] = b'1234'
            self.assertEqual(files.total_bytes, 4)
            with self.assertRaises(PublishError):
                files[VIDEO] = b'567'
            self.assertNotIn(VIDEO, files)
            files[IMAGE] = b'1'
            files[VIDEO] = b'23456'
            self.assertEqual(files.total_bytes, 6)

    def test_release_budget_counts_imported_video_together_with_new_uploads(self):
        with tempfile.TemporaryDirectory() as temporary:
            stage = Path(temporary)
            (stage / VIDEO).parent.mkdir(parents=True)
            (stage / VIDEO).write_bytes(b'1234')
            (stage / IMAGE).write_bytes(b'5678')
            data = {'site': {'heroMedia': [{'type': 'video', 'src': VIDEO}, {'type': 'image', 'src': IMAGE}]}}
            with mock.patch('content.publish.MAX_RELEASE_BYTES', 8):
                validate_release_media_size(stage, data)
            with mock.patch('content.publish.MAX_RELEASE_BYTES', 7), self.assertRaises(PublishError):
                validate_release_media_size(stage, data)

    def test_mp4_and_poster_cleanup_preserves_current_previous_and_recent_assets(self):
        with tempfile.TemporaryDirectory() as temporary, override_settings(SITE_ROOT=Path(temporary)):
            root = Path(temporary)
            retained = {VIDEO, POSTER}
            stale = 'assets/uploads/' + 'd' * 64 + '.mp4'
            recent = 'assets/uploads/' + 'e' * 64 + '.mp4'
            unmanaged = 'assets/uploads/owner.mp4'
            for name in (VIDEO, POSTER, stale, recent, unmanaged):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b'media')
                os.utime(path, (0, 0))
            os.utime(root / recent, (200000, 200000))
            self.assertEqual(cleanup_public_photos(retained, now=200001), 1)
            self.assertFalse((root / stale).exists())
            self.assertTrue(all((root / name).exists() for name in (VIDEO, POSTER, recent, unmanaged)))

    def test_video_publication_rolls_back_new_video_and_poster_when_page_replacement_fails(self):
        with tempfile.TemporaryDirectory() as temporary, override_settings(SITE_ROOT=Path(temporary)):
            root = Path(temporary)
            (root / 'index.html').write_bytes(b'old page')
            (root / 'results.html').write_bytes(b'old results')
            real_replace = os.replace

            def fail(source, destination):
                if Path(destination) == root / 'results.html':
                    raise OSError('temporary disk failure')
                return real_replace(source, destination)

            with mock.patch('content.publish.os.replace', side_effect=fail):
                with self.assertRaises(PublishError):
                    publish_local({VIDEO: b'new video', POSTER: b'poster', 'index.html': b'new page', 'results.html': b'new results'})
            self.assertFalse((root / VIDEO).exists())
            self.assertFalse((root / POSTER).exists())
            self.assertEqual((root / 'index.html').read_bytes(), b'old page')
            self.assertEqual((root / 'results.html').read_bytes(), b'old results')

    def test_github_uses_one_atomic_non_forced_commit_for_video_poster_and_stale_removal(self):
        client = GitHubClient('owner/site', 'main', 'test-token')
        stale = 'assets/uploads/' + 'd' * 64 + '.mp4'
        snapshot = {'parent': 'parent', 'tree': 'tree', 'entries': {stale: {'sha': 'old'}}}
        responses = [{'sha': 'video-blob'}, {'sha': 'poster-blob'}, {'sha': 'new-tree'}, {'sha': 'commit'}, {}]
        with mock.patch.object(client, 'head', return_value='parent'), \
                mock.patch.object(client, 'request', side_effect=responses) as request:
            self.assertEqual(client.publish(snapshot, {VIDEO: b'video', POSTER: b'poster'}, [stale])['commit'], 'commit')
        self.assertEqual(request.call_args_list[-1].args,
                         ('PATCH', '/git/refs/heads/main', {'sha': 'commit', 'force': False}))
        self.assertIn({'path': stale, 'mode': '100644', 'type': 'blob', 'sha': None},
                      request.call_args_list[-3].args[2]['tree'])

    def test_github_pinned_snapshot_downloads_mp4_and_caps_aggregate_size_before_fetching_blobs(self):
        client = GitHubClient('owner/site', 'main', 'test-token')
        files = {name: name.encode() for name in SOURCE_FILES}
        files[VIDEO] = b'normalized mp4'
        entries = [{'path': name, 'sha': blob_sha(value), 'size': len(value), 'type': 'blob', 'mode': '100644'}
                   for name, value in files.items()]

        def request(method, path, data=None):
            if path == '/git/commits/parent':
                return {'tree': {'sha': 'tree'}}
            if path == '/git/trees/tree?recursive=1':
                return {'tree': entries}
            value = next(value for value in files.values() if blob_sha(value) == path.rsplit('/', 1)[-1])
            return {'encoding': 'base64', 'content': base64.b64encode(value).decode()}

        with tempfile.TemporaryDirectory() as temporary, mock.patch.object(client, 'head', return_value='parent'), \
                mock.patch.object(client, 'request', side_effect=request):
            client.snapshot(Path(temporary), [VIDEO])
            self.assertEqual((Path(temporary) / VIDEO).read_bytes(), files[VIDEO])
        with tempfile.TemporaryDirectory() as temporary, mock.patch.object(client, 'head', return_value='parent'), \
                mock.patch.object(client, 'request', side_effect=request) as api, \
                mock.patch('content.github.MAX_RELEASE_BYTES', 1):
            with self.assertRaises(GitHubError):
                client.snapshot(Path(temporary), [VIDEO])
            self.assertTrue(all('/git/blobs/' not in call.args[1] for call in api.call_args_list))


class GalleryExportTests(TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.media = Path(self.directory.name) / 'media'
        self.override = override_settings(MEDIA_ROOT=self.media)
        self.override.enable()
        self.addCleanup(self.override.disable)
        call_command('import_content', str(CONTENT_FIXTURE), stdout=io.StringIO())

    def slide(self, parent, **fields):
        item = MediaItem(**parent, source_path=IMAGE, **fields)
        item.full_clean()
        item.save()
        return item

    def test_ordered_galleries_round_trip_via_paths_without_media_writes_including_dry_run(self):
        site = SiteSettings.objects.get(pk=1)
        teacher = Teacher.objects.first()
        result = StudentResult.objects.first()
        result.consent = True
        result.save()
        practice = Practice.objects.create(slug='practice', title='Реальное занятие', description='Описание занятия',
                                           is_published=True)
        self.slide({'site_settings': site}, order=1, alt='Центр')
        video = MediaItem(site_settings=site, order=0, source_path=VIDEO, poster_path=POSTER, alt='Сначала видео')
        video.full_clean()
        video.save()
        self.slide({'teacher': teacher}, alt='Преподаватель')
        self.slide({'result': result}, alt='Ученик')
        self.slide({'practice': practice}, alt='Практика')
        data = build_content()
        self.assertEqual(data['site']['heroMedia'][0]['type'], 'video')
        self.assertEqual(data['site']['heroMedia'][1]['alt'], 'Центр')
        self.assertEqual(data['teachers'][0]['media'][0]['alt'], 'Преподаватель')
        self.assertEqual(data['results'][0]['media'][0]['alt'], 'Ученик')
        self.assertEqual(next(item for item in data['practices'] if item['id'] == 'practice')['media'][0]['alt'], 'Практика')
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'content.js'
            write_content(data, path)
            call_command('import_content', str(path), dry_run=True, stdout=io.StringIO())
            self.assertEqual(build_content(), data)
            self.assertFalse(self.media.exists())
            call_command('import_content', str(path), force=True, stdout=io.StringIO())
            self.assertEqual(build_content(), data)
            self.assertFalse(self.media.exists())

    def test_hidden_slides_hidden_parents_and_unconsented_result_files_stay_private_in_demo(self):
        teacher = Teacher.objects.first()
        result = StudentResult.objects.first()
        self.assertFalse(result.consent)
        self.assertTrue(SiteSettings.objects.get(pk=1).demo_mode)
        self.slide({'teacher': teacher}, is_published=False)
        self.slide({'result': result})
        self.assertNotIn('media', build_content()['teachers'][0])
        self.assertNotIn('media', build_content()['results'][0])
        result.consent = True
        result.save()
        self.assertIn('media', build_content()['results'][0])
        teacher.is_published = False
        teacher.save()
        self.assertFalse(any(item['name'] == teacher.name for item in build_content()['teachers']))
        incoming = build_content()
        incoming['results'][0]['consent'] = False
        with self.assertRaisesMessage(CommandError, 'согласие'):
            validate_content(incoming)

    def test_uploaded_images_and_stored_normalized_video_use_hashed_exports_without_private_names(self):
        teacher = Teacher.objects.first()
        photo = io.BytesIO()
        Image.new('RGB', (60, 40), 'yellow').save(photo, 'PNG')
        item = MediaItem(teacher=teacher, photo=SimpleUploadedFile('private-owner-name.png', photo.getvalue()))
        item.save()
        # The encoder/save boundary is covered separately; this fixture stands for its stored MP4 output.
        encoded = b'\x00\x00\x00\x18ftypmp42' + b'normalized-output'
        stored_name = item.video.storage.save('gallery/videos/' + hashlib.sha256(encoded).hexdigest() + '.mp4', ContentFile(encoded))
        video = self.slide({'teacher': teacher}, order=1)
        MediaItem.objects.filter(pk=video.pk).update(source_path='', video=stored_name)
        files = {}
        data = build_content(photo_files=files)
        slides = data['teachers'][0]['media']
        self.assertRegex(slides[0]['src'], r'^assets/uploads/[0-9a-f]{64}\.jpg$')
        self.assertEqual(slides[1]['src'], 'assets/uploads/' + hashlib.sha256(encoded).hexdigest() + '.mp4')
        self.assertEqual(files[slides[1]['src']], encoded)
        self.assertEqual(collect_photo_files(), files)
        self.assertNotIn('private-owner-name', str(data))
        self.assertEqual({path.suffix for path in self.media.rglob('*') if path.is_file()}, {'.jpg', '.mp4'})

    def test_unsafe_import_rolls_back_without_replacing_existing_content_or_writing_media(self):
        data = build_content()
        before = build_content()
        data['site']['heroMedia'] = [{'type': 'video', 'src': 'https://outside.example/private.mp4'}]
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'content.js'
            write_content(data, path)
            with self.assertRaises(CommandError):
                call_command('import_content', str(path), force=True, stdout=io.StringIO())
        self.assertEqual(build_content(), before)
        self.assertFalse(self.media.exists())

    @unittest.skipUnless(shutil.which('node'), 'Node.js is required for the real publication build')
    def test_real_node_publication_renders_gallery_video_and_photo_on_all_owning_pages(self):
        site_settings = SiteSettings.objects.get(pk=1)
        MediaItem.objects.create(site_settings=site_settings, source_path=VIDEO, poster_path=POSTER)
        teacher = Teacher.objects.first()
        self.slide({'teacher': teacher})
        result = StudentResult.objects.first()
        result.consent = True
        result.save()
        self.slide({'result': result})
        practice = Practice.objects.create(slug='practice', title='Практика', description='Реальное занятие',
                                           is_published=True)
        MediaItem.objects.create(practice=practice, source_path=VIDEO, poster_path=POSTER)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            site = root / 'site'
            site.mkdir()
            for relative in SOURCE_FILES:
                target = site / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(settings.SITE_ROOT / relative, target)
            image = io.BytesIO()
            Image.new('RGB', (40, 40), 'yellow').save(image, 'JPEG')
            for relative, payload in ((IMAGE, image.getvalue()), (POSTER, image.getvalue()), (VIDEO, b'normalized mp4')):
                target = site / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(payload)
            with override_settings(SITE_ROOT=site, BASE_DIR=root / 'cms', LOCAL=True), \
                    mock.patch.dict(os.environ, {'SITE_PUBLISH_TARGET': 'local', 'SITE_NODE_BINARY': shutil.which('node')}):
                release = publish_site()
            self.assertTrue(release['changed'])
            home = (site / 'index.html').read_text(encoding='utf-8')
            self.assertIn('<video', home)
            self.assertIn(VIDEO, home)
            self.assertIn(POSTER, home)
            self.assertNotIn(' autoplay', home)
            for relative in ('teachers.html', 'results.html'):
                self.assertIn(IMAGE, (site / relative).read_text(encoding='utf-8'))
