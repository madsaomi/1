"""Validate and build a complete release in isolation before publishing."""
import os
import shutil
import subprocess
import tempfile
import logging
import time
from contextlib import contextmanager
from pathlib import Path

from django.conf import settings
from django.core.management.base import CommandError
from django.db import connection, transaction

from .github import GitHubClient, GitHubError, MANAGED_PHOTO, OUTPUT_FILES, SOURCE_FILES, allowed_photo
from .serialization import (TRANSLATION_LANGUAGES, build_content, build_translation_strings, missing_translations,
                            read_content, validate_content, write_content, write_translation_strings)
from .media import audit_media

logger = logging.getLogger(__name__)


class PublishError(Exception):
    pass


def publish_target():
    return os.environ.get('SITE_PUBLISH_TARGET', 'local' if settings.LOCAL else '').strip()


def github_client():
    return GitHubClient(os.environ.get('SITE_GITHUB_REPOSITORY', ''), os.environ.get('SITE_GITHUB_BRANCH', ''),
                        os.environ.get('SITE_GITHUB_TOKEN', ''))


def site_available():
    if publish_target() == 'github':
        return all(os.environ.get(name) for name in ('SITE_GITHUB_REPOSITORY', 'SITE_GITHUB_BRANCH', 'SITE_GITHUB_TOKEN'))
    return (publish_target() == 'local' and settings.LOCAL and
            all((settings.SITE_ROOT / path).is_file() for path in SOURCE_FILES))


def find_node():
    configured = os.environ.get('SITE_NODE_BINARY')
    return (configured if Path(configured).is_file() else None) if configured else shutil.which('node')


@contextmanager
def publication_lock():
    """The OS releases the cross-worker lock if a worker exits."""
    lock_path = settings.BASE_DIR / '.cache' / 'publish.lock'
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open('a+b') as handle:
        if handle.seek(0, os.SEEK_END) == 0:
            handle.write(b'0')
            handle.flush()
        handle.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            raise PublishError('Публикация уже выполняется. Дождитесь завершения и повторите.') from None
        try:
            yield
        finally:
            if os.name == 'nt':
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)


def photo_paths(data):
    return {item['photo'] for item in [*data.get('teachers', []), *data.get('practices', []), *data.get('contacts', {}).get('locations', [])]
            if item.get('photo')}


def cleanup_public_photos(keep, *, now=None):
    """Only old hashed exports; current and previous releases remain available for rollback."""
    root = settings.SITE_ROOT.resolve()
    directory = root / 'assets' / 'uploads'
    if not directory.exists() or any(path.is_symlink() for path in (directory, directory.parent)):
        return 0
    cutoff = (time.time() if now is None else now) - 24 * 3600
    removed = 0
    for path in directory.iterdir():
        relative = path.relative_to(root).as_posix()
        if (not MANAGED_PHOTO.fullmatch(relative) or relative in keep or path.is_symlink()
                or not path.is_file() or not path.resolve().is_relative_to(root) or path.stat().st_mtime > cutoff):
            continue
        path.unlink(missing_ok=True)
        removed += 1
    return removed


def copy_local_sources(stage, paths):
    root = settings.SITE_ROOT.resolve()
    for path in set(SOURCE_FILES) | set(paths):
        source = (root / path).resolve()
        if not source.is_relative_to(root) or not source.is_file():
            raise PublishError('Не найден исходник сайта или фотография. Проверьте файлы проекта.')
        target = stage / path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)


def atomic_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix='.publish-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(content)
        # These are public site assets, also read by Caddy and the unprivileged CMS process.
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def publish_local(files):
    root = settings.SITE_ROOT.resolve()
    backup, written = {}, []
    for name in files:
        path = (root / name).resolve()
        if not path.is_relative_to(root):
            raise PublishError('Небезопасный путь публикации.')
        backup[path] = path.read_bytes() if path.is_file() else None
    recovery = Path(tempfile.mkdtemp(prefix='.publish-', dir=root))
    ready, saved = {}, {}
    try:
        # Prepare both the new files and rollback copies on the same filesystem.
        # Disk exhaustion here cannot affect the live pages.
        for index, ((path, old), content) in enumerate(zip(backup.items(), files.values())):
            if old == content:
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            ready[path] = recovery / f'new-{index}'
            atomic_write(ready[path], content)
            if old is not None:
                saved[path] = recovery / f'old-{index}'
                atomic_write(saved[path], old)
        for path, prepared in ready.items():
            os.replace(prepared, path)
            written.append(path)
    except OSError:
        try:
            for path in reversed(written):
                if backup[path] is None:
                    path.unlink(missing_ok=True)
                else:
                    os.replace(saved[path], path)
        except OSError:
            raise PublishError(f'Не удалось полностью восстановить сайт. Резервные файлы сохранены: {recovery.name}. '
                               'Обратитесь к администратору.') from None
        shutil.rmtree(recovery, ignore_errors=True)
        raise PublishError('Не удалось записать сайт. Предыдущие файлы восстановлены.') from None
    shutil.rmtree(recovery, ignore_errors=True)
    return {'changed': bool(written)}


def publish_site():
    if not site_available():
        raise PublishError('Публикация не настроена. Для сервера задайте SITE_PUBLISH_TARGET=github, '
                           'репозиторий, ветку и токен; для локальной работы нужны файлы сайта рядом с cms.')
    node = find_node()
    if not node:
        raise PublishError('Не найден Node.js. Установите его или задайте SITE_NODE_BINARY.')
    try:
        with publication_lock():
            outermost = not connection.in_atomic_block
            with transaction.atomic():
                if outermost and connection.vendor == 'postgresql':
                    with connection.cursor() as cursor:
                        cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
                photos = {}
                data = build_content(photo_files=photos)
                validate_content(data)
                translations = {language: build_translation_strings(language) for language in TRANSLATION_LANGUAGES}
                missing = {language: missing_translations(language) for language in TRANSLATION_LANGUAGES}
            paths = photo_paths(data) - photos.keys()
            if any(not allowed_photo(path) for path in paths):
                raise PublishError('Небезопасный путь фотографии.')
            target = publish_target()
            with tempfile.TemporaryDirectory(prefix='stanford-release-') as temporary:
                stage = Path(temporary)
                client = github_client() if target == 'github' else None
                snapshot = client.snapshot(stage, paths) if client else None
                if not client:
                    copy_local_sources(stage, paths)
                previous = read_content(stage / 'content.js')
                retained_photos = photo_paths(previous) | photo_paths(data)
                for path, content in photos.items():
                    destination = stage / path
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(content)
                write_content(data, stage / 'content.js')
                for language, strings in translations.items():
                    write_translation_strings(stage / f'assets/i18n/{language}.js', strings)
                result = subprocess.run([node, 'build.mjs'], cwd=stage, capture_output=True, text=True,
                                        encoding='utf-8', errors='replace', timeout=120,
                                        env={**{key: value for key, value in os.environ.items()
                                                if key.upper() in ('PATH', 'SYSTEMROOT', 'WINDIR', 'TMP', 'TEMP')},
                                             'ELECTRON_RUN_AS_NODE': '1'})
                if result.returncode:
                    lines = (result.stderr or result.stdout or '').splitlines()
                    reason = next((line.strip() for line in lines if 'Error' in line), 'проверьте содержимое в админке')
                    raise PublishError(f'Сайт не принял данные: {reason[:300]}')
                files = {path: (stage / path).read_bytes() for path in sorted(OUTPUT_FILES)}
                files.update(photos)
                if client:
                    obsolete = {path for path in snapshot['entries'] if MANAGED_PHOTO.fullmatch(path) and path not in retained_photos}
                    release = client.publish(snapshot, files, delete_paths=obsolete)
                else:
                    release = publish_local(files)
                    try:
                        cleanup_public_photos(retained_photos)
                    except OSError:
                        logger.warning('Published pages are valid; old exported photos could not be collected.', exc_info=True)
                try:
                    audit_media(apply=True)
                except (OSError, ValueError):
                    logger.warning('Published pages are valid; orphaned uploads could not be collected.', exc_info=True)
            return {'texts': len(data.get('texts', {})), 'courses': len(data['courses']),
                    'missing_uz': missing['uz'], 'missing_kaa': missing['kaa'],
                    'target': target, 'demo': data['site'].get('demoMode', False), **release}
    except PublishError:
        raise
    except (CommandError, GitHubError) as error:
        raise PublishError(str(error)) from None
    except (OSError, subprocess.SubprocessError):
        raise PublishError('Публикация не завершена. Проверьте доступ к файлам и повторите.') from None
