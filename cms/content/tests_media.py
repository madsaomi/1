"""Real image bytes and transaction boundaries protect storage limits and deletion safety."""
import io
import os
import tempfile
import time
from pathlib import Path
from unittest import mock

from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import transaction
from django.test import SimpleTestCase, TestCase, override_settings
from django.forms import modelform_factory
from PIL import Image, PngImagePlugin

from .media import (PHOTO_MAX_BYTES, audit_media, normalize_image, safe_media_path)
from .models import Teacher


def image_bytes(color='yellow', size=(800, 600), format='PNG', **save_options):
    output = io.BytesIO()
    Image.new('RGB', size, color).save(output, format, **save_options)
    return output.getvalue()


class ImageCompressionTests(SimpleTestCase):
    def test_oversized_dimensions_are_reported_as_a_photo_form_error_before_save(self):
        form_class = modelform_factory(Teacher, fields=['name', 'role', 'photo'])
        upload = SimpleUploadedFile('large.png', image_bytes(size=(4200, 4200)), content_type='image/png')
        form = form_class({'name': 'Преподаватель', 'role': 'English'}, files={'photo': upload})
        self.assertFalse(form.is_valid())
        self.assertIn('photo', form.errors)
        self.assertIn('16 мегапикселей', str(form.errors['photo']))

    def test_noisy_large_photo_has_a_strict_byte_and_dimension_limit(self):
        source = io.BytesIO()
        Image.effect_noise((2400, 1600), 100).convert('RGB').save(source, 'JPEG', quality=96)
        raw = source.getvalue()
        encoded = normalize_image(raw)
        self.assertLess(len(encoded), len(raw))
        self.assertLessEqual(len(encoded), PHOTO_MAX_BYTES)
        with Image.open(io.BytesIO(encoded)) as image:
            self.assertEqual(image.format, 'JPEG')
            self.assertLessEqual(max(image.size), 1600)

    def test_exif_orientation_is_applied_and_metadata_is_removed(self):
        exif = Image.Exif()
        exif[274] = 6
        exif[270] = 'private source metadata'
        encoded = normalize_image(image_bytes(size=(80, 40), format='JPEG', exif=exif))
        with Image.open(io.BytesIO(encoded)) as image:
            self.assertEqual(image.size, (40, 80))
            self.assertFalse(image.getexif())
            self.assertNotIn('exif', image.info)
            self.assertNotIn('icc_profile', image.info)
        png_info = PngImagePlugin.PngInfo()
        png_info.add_text('private', 'source metadata')
        self.assertNotIn(b'source metadata', normalize_image(image_bytes(pnginfo=png_info)))

    def test_transparency_becomes_white_without_retaining_png_payload(self):
        source = io.BytesIO()
        Image.new('RGBA', (30, 30), (255, 0, 0, 0)).save(source, 'PNG')
        with Image.open(io.BytesIO(normalize_image(source.getvalue()))) as image:
            self.assertEqual(image.mode, 'RGB')
            self.assertEqual(image.getpixel((5, 5)), (255, 255, 255))

    def test_invalid_oversized_bomb_and_animated_images_are_rejected(self):
        for source in (b'not an image', image_bytes(format='GIF')):
            with self.assertRaises(ValidationError):
                normalize_image(source)
        with override_settings(MAX_UPLOAD_BYTES=10):
            with self.assertRaises(ValidationError):
                normalize_image(image_bytes())
        with mock.patch.object(Image, 'MAX_IMAGE_PIXELS', 100):
            with self.assertRaises(ValidationError):
                normalize_image(image_bytes(size=(30, 30)))
        animated = io.BytesIO()
        Image.new('RGB', (30, 30), 'red').save(animated, 'WEBP', save_all=True,
                                             append_images=[Image.new('RGB', (30, 30), 'blue')], duration=100)
        with self.assertRaises(ValidationError):
            normalize_image(animated.getvalue())


class StoredImageTests(TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.settings_override = override_settings(MEDIA_ROOT=self.root)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

    def teacher(self, color='yellow'):
        return Teacher.objects.create(name='Test teacher', role='English',
                                      photo=SimpleUploadedFile('private-source.png', image_bytes(color)))

    def test_admin_upload_stores_only_a_normalized_jpeg_and_identical_uploads_reuse_it(self):
        teacher = self.teacher()
        self.assertRegex(teacher.photo.name, r'/[0-9a-f]{64}\.jpg$')
        paths = [path for path in self.root.rglob('*') if path.is_file()]
        self.assertEqual(len(paths), 1)
        self.assertLessEqual(paths[0].stat().st_size, PHOTO_MAX_BYTES)
        second = self.teacher()
        self.assertEqual(teacher.photo.name, second.photo.name)
        self.assertEqual(len([path for path in self.root.rglob('*') if path.is_file()]), 1)

    def test_manual_field_save_also_replaces_the_original_without_leaving_a_copy(self):
        teacher = Teacher.objects.create(name='Manual upload', role='English')
        teacher.photo.save('raw-original.png', ContentFile(image_bytes(size=(2200, 1600))))
        self.assertTrue(teacher.photo.name.endswith('.jpg'))
        self.assertEqual(len([path for path in self.root.rglob('*') if path.is_file()]), 1)
        with Image.open(teacher.photo.path) as image:
            self.assertLessEqual(max(image.size), 1600)

    def test_replacement_removes_the_previous_photo_only_after_commit(self):
        teacher = self.teacher()
        old_path = Path(teacher.photo.path)
        with self.captureOnCommitCallbacks(execute=True):
            teacher.photo = SimpleUploadedFile('new.png', image_bytes('blue'))
            teacher.save()
            self.assertTrue(old_path.exists())
        self.assertFalse(old_path.exists())
        self.assertTrue(Path(teacher.photo.path).exists())

    def test_rollback_retains_the_database_photo_and_leaves_only_a_small_collectable_orphan(self):
        teacher = self.teacher()
        old_name, old_path = teacher.photo.name, Path(teacher.photo.path)
        with self.captureOnCommitCallbacks(execute=True):
            try:
                with transaction.atomic():
                    teacher.photo = SimpleUploadedFile('new.png', image_bytes('blue'))
                    teacher.save()
                    raise ValueError('rollback')
            except ValueError:
                pass
        teacher.refresh_from_db()
        self.assertEqual(teacher.photo.name, old_name)
        self.assertTrue(old_path.exists())
        self.assertTrue(all(path.stat().st_size <= PHOTO_MAX_BYTES for path in self.root.rglob('*.jpg')))

    def test_shared_photo_survives_until_its_last_record_is_deleted(self):
        first = self.teacher()
        path = Path(first.photo.path)
        second = Teacher.objects.create(name='Shared', role='English', photo=first.photo.name)
        with self.captureOnCommitCallbacks(execute=True):
            first.delete()
        self.assertTrue(path.exists())
        with self.captureOnCommitCallbacks(execute=True):
            second.delete()
        self.assertFalse(path.exists())

    def test_bad_upload_does_not_create_a_file_or_a_record(self):
        with self.assertRaises(ValidationError):
            Teacher.objects.create(name='Bad', role='English',
                                   photo=SimpleUploadedFile('fake.jpg', b'not an image'))
        self.assertFalse(Teacher.objects.exists())
        self.assertFalse(any(self.root.rglob('*')))

    def test_audit_is_dry_by_default_and_preserves_live_recent_and_unrelated_files(self):
        teacher = self.teacher()
        old = self.root / 'old.jpg'
        old.write_bytes(image_bytes())
        recent = self.root / 'recent.jpg'
        recent.write_bytes(image_bytes())
        unrelated = self.root / 'README.txt'
        unrelated.write_text('retain')
        past = time.time() - 48 * 3600
        os.utime(old, (past, past))
        os.utime(teacher.photo.path, (past, past))
        report = audit_media()
        self.assertEqual(report['files'], ['old.jpg'])
        self.assertTrue(old.exists())
        output = io.StringIO()
        call_command('audit_media', stdout=output)
        self.assertIn('без удаления', output.getvalue())
        self.assertTrue(old.exists())
        audit_media(apply=True)
        self.assertFalse(old.exists())
        self.assertTrue(Path(teacher.photo.path).exists())
        self.assertTrue(recent.exists())
        self.assertTrue(unrelated.exists())

    def test_audit_never_deletes_outside_root_or_through_symlinks(self):
        self.assertIsNone(safe_media_path('../outside.jpg'))
        self.assertIsNone(safe_media_path('C:\\outside.jpg'))
        with override_settings(MEDIA_ROOT=Path(self.root.anchor)):
            with self.assertRaises(ValueError):
                audit_media(apply=True)
        with self.assertRaises(ValueError):
            audit_media(apply=True, min_age_hours=0)
        outside = self.root.parent / (self.root.name + '-outside.jpg')
        outside.write_bytes(image_bytes())
        self.addCleanup(lambda: outside.unlink(missing_ok=True))
        link = self.root / 'linked.jpg'
        try:
            link.symlink_to(outside)
        except OSError:
            return  # Windows may deny symlink creation; path-traversal checks above still run.
        past = time.time() - 48 * 3600
        os.utime(outside, (past, past))
        self.assertIsNone(safe_media_path('linked.jpg'))
        audit_media(apply=True)
        self.assertTrue(outside.exists())
