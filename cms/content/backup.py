"""Full backup of the admin: the database (portable Django JSON) and every uploaded file in MEDIA_ROOT.

The public site lives in GitHub; these two parts are what exists only on the admin server. A nightly GitHub
workflow downloads them through config.views.backup, encrypts them and sends them to the backup Telegram bot.
`manage.py restore_backup` puts them back on a new server.
"""
import gzip
import hashlib
import io
import tarfile
from pathlib import Path

from django.conf import settings
from django.core.management import call_command

# Logs and data Django rebuilds by itself are left out; users, 2FA devices and all content are kept.
EXCLUDE = ['contenttypes', 'auth.permission', 'sessions', 'admin.logentry', 'axes']
SKIP_DIRS = {'tmp', '.tmp', 'cache'}


def dump_database():
    """All data as gzip-compressed JSON with natural keys, readable by loaddata on any database."""
    out = io.StringIO()
    call_command('dumpdata', exclude=EXCLUDE, natural_foreign=True, natural_primary=True, indent=None, stdout=out)
    return gzip.compress(out.getvalue().encode('utf-8'), mtime=0)


def media_files():
    root = Path(settings.MEDIA_ROOT)
    if not root.is_dir():
        return []
    files = []
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if path.is_file() and not path.is_symlink() and not SKIP_DIRS & set(relative.parts[:-1]):
            files.append((relative.as_posix(), path))
    return files


def media_manifest():
    """A fingerprint of all uploads: it changes only when a file is added, removed or replaced."""
    digest = hashlib.sha256()
    total = 0
    files = media_files()
    for name, path in files:
        size = path.stat().st_size
        total += size
        digest.update(f'{name}\0{size}\0'.encode())
        with path.open('rb') as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                digest.update(chunk)
    return {'hash': digest.hexdigest(), 'files': len(files), 'bytes': total}


def write_media_tar(target):
    """Write every upload into an uncompressed tar (photos and videos are already compressed)."""
    with tarfile.open(fileobj=target, mode='w') as archive:
        for name, path in media_files():
            archive.add(path, arcname=f'media/{name}', recursive=False)


def restore_media(archive_path):
    """Unpack a media tar into MEDIA_ROOT, refusing anything outside it (links, absolute or ../ paths)."""
    root = Path(settings.MEDIA_ROOT).resolve()
    root.mkdir(parents=True, exist_ok=True)
    count = 0
    with tarfile.open(archive_path, mode='r:*') as archive:
        for member in archive.getmembers():
            if not member.isfile() or not member.name.startswith('media/'):
                continue
            target = (root / member.name[len('media/'):]).resolve()
            if not target.is_relative_to(root):
                raise ValueError(f'Небезопасный путь в архиве: {member.name}')
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(member) as source, target.open('wb') as output:
                while chunk := source.read(1024 * 1024):
                    output.write(chunk)
            count += 1
    return count
