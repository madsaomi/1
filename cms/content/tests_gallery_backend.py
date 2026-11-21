"""Mixed gallery uploads, boundaries and deletion use only an isolated test database."""
import io
import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from unittest import mock

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.forms import modelform_factory
from django.forms.models import inlineformset_factory
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from PIL import Image

from .admin import MediaGalleryFormSet, MediaItemForm
from .media import audit_media, referenced_media
from .media_video import VIDEO_MAX_BYTES, normalize_video, normalized_video_upload
from .models import MediaItem, Practice, SiteSettings, Teacher
from .tests import AdminTestCase


def picture():
    output = io.BytesIO()
    Image.new('RGB', (80, 60), 'yellow').save(output, 'PNG')
    return SimpleUploadedFile('source.png', output.getvalue(), content_type='image/png')


class GalleryModelTests(TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        settings = override_settings(MEDIA_ROOT=self.root)
        settings.enable()
        self.addCleanup(settings.disable)
        self.teacher = Teacher.objects.create(name='Gallery test teacher', role='English')

    def test_database_and_model_both_require_exactly_one_owner_and_source(self):
        site = SiteSettings.load()
        for item in (MediaItem(source_path='assets/test.jpg'),
                     MediaItem(teacher=self.teacher, site_settings=site, source_path='assets/test.jpg'),
                     MediaItem(teacher=self.teacher),
                     MediaItem(teacher=self.teacher, photo='gallery/test.jpg', source_path='assets/test.jpg')):
            with self.assertRaises(ValidationError):
                item.clean()
            with self.assertRaises(IntegrityError), transaction.atomic():
                MediaItem.objects.bulk_create([item])

    def test_every_gallery_has_independent_order_and_bounded_slide_and_video_counts(self):
        for number in range(8):
            MediaItem.objects.create(teacher=self.teacher, source_path=f'assets/{number}.jpg', order=8 - number)
        self.assertEqual([item.order for item in self.teacher.media_items.all()], list(range(1, 9)))
        with self.assertRaisesMessage(ValidationError, '8 фото'):
            MediaItem.objects.create(teacher=self.teacher, source_path='assets/ninth.jpg')
        practice = Practice.objects.create(title='Practice', description='A real description')
        MediaItem.objects.create(practice=practice, source_path='assets/one.mp4')
        MediaItem.objects.create(practice=practice, source_path='assets/two.mp4')
        with self.assertRaisesMessage(ValidationError, '2 видео'):
            MediaItem.objects.create(practice=practice, source_path='assets/three.mp4')
        MediaItem.objects.create(practice=practice, source_path='assets/another.jpg')
        with self.assertRaises(ValidationError):
            MediaItem(teacher=self.teacher, source_path='https://external.example/file.mp4').full_clean()

    def test_gallery_photo_compression_and_referenced_file_deletion(self):
        first = MediaItem.objects.create(teacher=self.teacher, photo=picture())
        self.assertRegex(first.photo.name, r'gallery/photos/[0-9a-f]{64}\.jpg$')
        self.assertIn(first.photo.name, referenced_media())
        second = MediaItem.objects.create(teacher=self.teacher, photo=first.photo.name)
        path = Path(first.photo.path)
        with self.captureOnCommitCallbacks(execute=True):
            first.delete()
        self.assertTrue(path.exists())
        with self.captureOnCommitCallbacks(execute=True):
            second.delete()
        self.assertTrue(path.exists())
        audit_media(apply=True, now=time.time() + 25 * 3600)
        self.assertFalse(path.exists())

    def test_inline_final_composition_enforces_max_videos(self):
        formset_class = inlineformset_factory(Teacher, MediaItem, fk_name='teacher', form=MediaItemForm,
                                             formset=MediaGalleryFormSet, extra=0,
                                             fields=['photo', 'video', 'source_path', 'poster_path', 'alt', 'order', 'is_published'])
        payload = {'media_items-TOTAL_FORMS': '3', 'media_items-INITIAL_FORMS': '0'}
        for number in range(3):
            payload.update({f'media_items-{number}-source_path': f'assets/clip{number}.mp4',
                            f'media_items-{number}-order': str(number), f'media_items-{number}-is_published': 'on'})
        formset = formset_class(payload, instance=self.teacher, prefix='media_items')
        self.assertFalse(formset.is_valid())
        self.assertIn('2 видео', str(formset.non_form_errors()))

    def test_too_many_uploaded_videos_are_rejected_before_any_transcode(self):
        formset_class = inlineformset_factory(Teacher, MediaItem, fk_name='teacher', form=MediaItemForm,
                                             formset=MediaGalleryFormSet, extra=0, fields=['photo', 'video', 'order'])
        data = {'media_items-TOTAL_FORMS': '3', 'media_items-INITIAL_FORMS': '0'}
        files = {}
        for index in range(3):
            data[f'media_items-{index}-order'] = str(index)
            files[f'media_items-{index}-video'] = SimpleUploadedFile(f'clip{index}.mp4', b'input')
        with mock.patch('content.media_video.normalize_video') as normalize:
            formset = formset_class(data, files, instance=self.teacher, prefix='media_items')
            self.assertFalse(formset.is_valid())
            self.assertTrue(all('2 видео' in str(form.errors.get('video', '')) for form in formset.forms))
            normalize.assert_not_called()

    def test_imported_slide_can_be_replaced_by_a_photo_without_manually_clearing_paths(self):
        item = MediaItem.objects.create(teacher=self.teacher, source_path='assets/old.mp4', poster_path='assets/old.jpg')
        form_class = modelform_factory(MediaItem, form=MediaItemForm,
                                      fields=['photo', 'video', 'alt', 'order', 'is_published'])
        form = form_class({'order': '0', 'is_published': 'on'}, files={'photo': picture()}, instance=item)
        self.assertTrue(form.is_valid(), form.errors)
        saved = form.save()
        self.assertFalse(saved.source_path or saved.poster_path or saved.video or saved.poster)
        self.assertTrue(saved.photo)

    def test_orphan_collection_includes_video_but_keeps_fresh_files_and_backups(self):
        stale, fresh, backup = self.root / 'old.mp4', self.root / 'new.mp4', self.root / 'backup.json'
        for path in (stale, fresh, backup):
            path.write_bytes(b'isolated test data')
        old = time.time() - 48 * 3600
        os.utime(stale, (old, old))
        os.utime(backup, (old, old))
        report = audit_media()
        self.assertEqual(report['files'], ['old.mp4'])
        self.assertTrue(stale.exists())
        audit_media(apply=True)
        self.assertFalse(stale.exists())
        self.assertTrue(fresh.exists() and backup.exists())


class VideoBoundaryTests(SimpleTestCase):
    def test_bad_extensions_size_and_probe_metadata_are_rejected_before_transcoding(self):
        with mock.patch('content.media_video._run') as run:
            for filename in ('playlist.m3u8', 'script.svg', 'video.mp4/evil'):
                with self.assertRaises(ValidationError):
                    normalize_video(b'input', filename)
            with mock.patch('content.media_video.VIDEO_MAX_UPLOAD_BYTES', 4):
                with self.assertRaises(ValidationError):
                    normalize_video(b'12345', 'video.mp4')
            run.assert_not_called()
        for duration, width, streams in [('NaN', 100, 1), ('91', 100, 1), ('1', 99999, 1), ('1', 100, 9)]:
            data = {'format': {'duration': duration}, 'streams': [dict(codec_type='video', width=width, height=100)] * streams}
            with mock.patch('content.media_video._run', return_value=mock.Mock(stdout=json.dumps(data).encode())) as run:
                with self.assertRaises(ValidationError):
                    normalize_video(b'not executable input', 'video.mp4')
                self.assertEqual(run.call_count, 1)
                args = run.call_args.args[0]
                self.assertIn('file,pipe', args)
                self.assertIn('mov,matroska,webm', args)
                self.assertEqual(args[args.index('-enable_drefs') + 1], '0')

    def test_form_validation_caches_transcode_and_preserves_upload_position(self):
        upload = SimpleUploadedFile('clip.mp4', b'raw source')
        upload.seek(2)
        with mock.patch('content.media_video.normalize_video', return_value=(b'mp4', b'jpeg')) as normalize:
            self.assertEqual(normalized_video_upload(upload), (b'mp4', b'jpeg'))
            self.assertEqual(upload.tell(), 2)
            normalized_video_upload(upload)
            normalize.assert_called_once_with(b'raw source', 'clip.mp4')

    def test_subprocess_timeout_or_missing_binary_is_a_safe_form_error(self):
        from .media_video import _run
        for error in (FileNotFoundError(), subprocess.TimeoutExpired('ffmpeg', 1),
                      subprocess.CalledProcessError(1, 'ffmpeg', stderr=b'private source metadata')):
            with mock.patch('content.media_video.subprocess.run', side_effect=error):
                with self.assertRaises(ValidationError) as caught:
                    _run(['ffmpeg', 'local-input'], timeout=1)
                self.assertNotIn('private source metadata', str(caught.exception))

    def test_output_size_or_truncated_duration_never_publishes_a_partial_clip(self):
        def output(arguments, **kwargs):
            Path(arguments[-1]).write_bytes(b'123456789')
            return mock.Mock()
        with mock.patch('content.media_video._probe', return_value=1), \
                mock.patch('content.media_video._run', side_effect=output), \
                mock.patch('content.media_video.VIDEO_MAX_BYTES', 8):
            with self.assertRaisesMessage(ValidationError, 'больше 8 МБ'):
                normalize_video(b'source', 'source.mp4')
        with mock.patch('content.media_video._probe', side_effect=[45, 40]), \
                mock.patch('content.media_video._run', side_effect=output):
            with self.assertRaisesMessage(ValidationError, 'целиком'):
                normalize_video(b'source', 'source.mp4')


@override_settings(DATA_UPLOAD_MAX_MEMORY_SIZE=10 * 1024 * 1024)
class GalleryAdminTests(AdminTestCase):
    def setUp(self):
        super().setUp()
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        settings = override_settings(MEDIA_ROOT=Path(self.temporary.name))
        settings.enable()
        self.addCleanup(settings.disable)

    def test_all_four_parent_forms_offer_ordered_photo_and_video_uploads(self):
        self.login()
        routes = ['content_teacher_add', 'content_studentresult_add', 'content_practice_add']
        for route in routes:
            response = self.client.get(reverse('admin:' + route))
            self.assertContains(response, 'media_items-TOTAL_FORMS')
            self.assertContains(response, 'media_items-__prefix__-photo')
            self.assertContains(response, 'media_items-__prefix__-video')
        response = self.client.get(reverse('admin:content_sitesettings_change', args=[1]))
        self.assertContains(response, 'Главный экран')
        self.assertContains(response, 'media_items-TOTAL_FORMS')

    def test_gallery_upload_saves_with_a_new_teacher_and_template_copy_drops_the_gallery(self):
        self.login()
        response = self.client.post(reverse('admin:content_teacher_add'), {
            'name': 'New gallery teacher', 'role': 'English', 'qualification': '', 'experience': '', 'photo_path': '',
            'order': '0', 'media_items-TOTAL_FORMS': '1', 'media_items-INITIAL_FORMS': '0',
            'media_items-0-photo': picture(), 'media_items-0-alt': 'A test photograph',
            'media_items-0-order': '0', 'media_items-0-is_published': 'on'})
        self.assertEqual(response.status_code, 302, response.context and response.context.get('errors'))
        teacher = Teacher.objects.get(name='New gallery teacher')
        slide = teacher.media_items.get()
        self.assertTrue(slide.photo.name.endswith('.jpg'))
        response = self.client.post(reverse('admin:content_teacher_change', args=[teacher.pk]), {
            'name': 'Copied teacher', 'role': 'English', 'qualification': '', 'experience': '', 'photo_path': '',
            'is_published': 'on', 'featured': 'on', 'order': '0', '_saveasnew': '1',
            'media_items-TOTAL_FORMS': '1', 'media_items-INITIAL_FORMS': '1',
            'media_items-0-id': str(slide.pk), 'media_items-0-order': '0', 'media_items-0-is_published': 'on'})
        self.assertEqual(response.status_code, 302, response.context and response.context.get('errors'))
        copied = Teacher.objects.get(name='Copied teacher')
        self.assertFalse(copied.media_items.exists())
        self.assertFalse(copied.is_published or copied.featured)
        self.assertTrue(teacher.media_items.filter(pk=slide.pk).exists())


@override_settings()
class RealVideoTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
            raise __import__('unittest').SkipTest('FFmpeg binaries are not installed in this test environment')
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'source.mov'
            subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
                            '-f', 'lavfi', '-i', 'color=c=yellow:s=160x120:r=12',
                            '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '0.7',
                            '-c:v', 'mpeg4', '-c:a', 'aac', '-metadata', 'title=private original metadata',
                            '-threads', '1', str(path)], check=True, capture_output=True, timeout=20)
            cls.raw = path.read_bytes()

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        settings = override_settings(MEDIA_ROOT=self.root)
        settings.enable()
        self.addCleanup(settings.disable)
        self.teacher = Teacher.objects.create(name='Video test teacher', role='English')

    def video(self):
        return SimpleUploadedFile('source.mov', self.raw, content_type='video/quicktime')

    def test_real_movie_becomes_h264_aac_with_private_metadata_removed_and_jpeg_poster(self):
        encoded, poster = normalize_video(self.raw, 'source.mov')
        self.assertLessEqual(len(encoded), VIDEO_MAX_BYTES)
        self.assertNotIn(b'private original metadata', encoded)
        self.assertLess(encoded.index(b'moov'), encoded.index(b'mdat'))
        with Image.open(io.BytesIO(poster)) as image:
            self.assertEqual(image.format, 'JPEG')
            self.assertLessEqual(max(image.size), 1600)
            self.assertFalse(image.getexif())
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'clean.mp4'
            path.write_bytes(encoded)
            info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', str(path)]))
            self.assertEqual({stream['codec_name'] for stream in info['streams']}, {'h264', 'aac'})
            video = next(stream for stream in info['streams'] if stream['codec_type'] == 'video')
            self.assertLessEqual(max(video['width'], video['height']), 1280)

    def test_form_and_save_share_one_transcode_and_store_no_original(self):
        form_class = modelform_factory(MediaItem, fields=['teacher', 'photo', 'video', 'alt'])
        with mock.patch('content.media_video.normalize_video', wraps=normalize_video) as normalize:
            form = form_class({'teacher': self.teacher.pk, 'alt': 'Test clip'}, files={'video': self.video()})
            self.assertTrue(form.is_valid(), form.errors)
            item = form.save()
            self.assertEqual(normalize.call_count, 1)
        self.assertRegex(item.video.name, r'gallery/videos/[0-9a-f]{64}\.mp4$')
        self.assertTrue(item.poster.name.endswith('.jpg'))
        paths = [path for path in self.root.rglob('*') if path.is_file()]
        self.assertEqual(len(paths), 2)
        self.assertFalse(list(self.root.rglob('*.mov')))
        self.assertEqual(referenced_media(), {item.video.name, item.poster.name})

    def test_shared_video_and_poster_survive_last_reference_and_retention_grace(self):
        first = MediaItem.objects.create(teacher=self.teacher, video=self.video())
        second = MediaItem.objects.create(teacher=self.teacher, video=first.video.name, poster=first.poster.name)
        paths = [Path(first.video.path), Path(first.poster.path)]
        with self.captureOnCommitCallbacks(execute=True):
            first.delete()
        self.assertTrue(all(path.exists() for path in paths))
        with self.captureOnCommitCallbacks(execute=True):
            second.delete()
        self.assertTrue(all(path.exists() for path in paths))
        audit_media(apply=True, now=time.time() + 25 * 3600)
        self.assertFalse(any(path.exists() for path in paths))

    def test_replacing_a_photo_with_video_and_back_retains_the_old_media_for_backups(self):
        item = MediaItem.objects.create(teacher=self.teacher, photo=picture())
        old_photo = Path(item.photo.path)
        form_class = modelform_factory(MediaItem, form=MediaItemForm,
                                      fields=['photo', 'video', 'alt', 'order', 'is_published'])
        with self.captureOnCommitCallbacks(execute=True):
            form = form_class({'order': '0', 'is_published': 'on'}, files={'video': self.video()}, instance=item)
            self.assertTrue(form.is_valid(), form.errors)
            item = form.save()
            self.assertTrue(old_photo.exists())
            self.assertFalse(item.photo)
        self.assertTrue(old_photo.exists())
        old_files = [Path(item.video.path), Path(item.poster.path)]
        with self.captureOnCommitCallbacks(execute=True):
            form = form_class({'order': '0', 'is_published': 'on'}, files={'photo': picture()}, instance=item)
            self.assertTrue(form.is_valid(), form.errors)
            item = form.save()
            self.assertTrue(all(path.exists() for path in old_files))
            self.assertFalse(item.video or item.poster)
        self.assertTrue(all(path.exists() for path in old_files))
        audit_media(apply=True, now=time.time() + 25 * 3600)
        # Identical photo uploads reuse the previous hash, which now belongs to the row again.
        self.assertTrue(old_photo.exists())
        self.assertFalse(any(path.exists() for path in old_files))

    def test_disguised_playlist_is_not_accepted_as_mp4(self):
        with self.assertRaises(ValidationError):
            normalize_video(b'#EXTM3U\nhttp://127.0.0.1/private\n', 'video.mp4')

    def test_webm_is_accepted_and_normalized_to_mp4(self):
        with tempfile.TemporaryDirectory() as temporary:
            source, webm = Path(temporary) / 'source.mov', Path(temporary) / 'source.webm'
            source.write_bytes(self.raw)
            subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
                            '-c:v', 'libvpx', '-c:a', 'libopus', '-threads', '1', str(webm)],
                           check=True, capture_output=True, timeout=20)
            encoded, poster = normalize_video(webm.read_bytes(), 'source.webm')
            self.assertIn(b'ftyp', encoded[:32])
            self.assertTrue(poster.startswith(b'\xff\xd8'))


class EventGalleryTests(TestCase):
    def test_an_event_owns_its_own_gallery_and_publishes_it(self):
        from datetime import timedelta
        from django.utils import timezone
        from .models import Event
        from .serialization import _gallery_data
        event = Event.objects.create(title='Speaking Club', starts_at=timezone.now() + timedelta(days=3))
        MediaItem.objects.create(event=event, source_path='assets/uploads/demo/event.jpg', alt='Афиша')
        practice = Practice.objects.create(title='Practice', description='A real description')
        with self.assertRaises(ValidationError):
            MediaItem(event=event, practice=practice, source_path='assets/one.jpg').full_clean()
        self.assertEqual(_gallery_data(event, None), [{'type': 'image', 'src': 'assets/uploads/demo/event.jpg', 'alt': 'Афиша'}])
