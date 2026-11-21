"""Preview of the site from the current drafts, before «Опубликовать».

The site is built exactly like a publication (same data, photos, dictionaries and build.mjs) into a private folder
and shown inside the admin, behind the same password and one-time code. Nothing is sent to GitHub or written to the
public site. The analytics counter and the «not a robot» check are left out: they belong to the public address.
"""
import mimetypes
import shutil
import tempfile
from pathlib import Path

from django.conf import settings
from django.db import transaction

from .publish import (PublicationAssets, PublishError, allowed_media, find_node, github_client, media_paths,
                      publication_lock, publish_target, run_site_build, site_available, stage_sources,
                      write_small_variants)
from .serialization import TRANSLATION_LANGUAGES, build_content, build_translation_strings, validate_content

LANGUAGE_PREFIXES = ('uz/', 'kaa/', 'en/')


def preview_root():
    return Path(tempfile.gettempdir()) / 'stanford-preview'


def build_preview():
    """Build the preview into preview_root(); the previous preview is replaced only after a successful build."""
    if not site_available():
        raise PublishError('Предпросмотр недоступен: публикация не настроена (см. cms/README.md).')
    node = find_node()
    if not node:
        raise PublishError('Не найден Node.js. Установите его или задайте SITE_NODE_BINARY.')
    with publication_lock():
        with transaction.atomic():
            photos = PublicationAssets()
            data = build_content(photo_files=photos)
            validate_content(data)
            translations = {language: build_translation_strings(language) for language in TRANSLATION_LANGUAGES}
        for key in ('analyticsToken', 'turnstileSiteKey'):
            data['site'].pop(key, None)
        paths = media_paths(data) - photos.keys()
        if any(not allowed_media(path) for path in paths):
            raise PublishError('Небезопасный путь фото или видео.')
        root = preview_root()
        stage = Path(tempfile.mkdtemp(prefix='stanford-preview-build-'))
        try:
            client = github_client() if publish_target() == 'github' else None
            stage_sources(stage, data, photos, translations, paths, client)
            write_small_variants(stage, data)
            run_site_build(node, stage)
            shutil.rmtree(root, ignore_errors=True)
            shutil.move(str(stage), str(root))
        finally:
            shutil.rmtree(stage, ignore_errors=True)
    return root


def resolve(path):
    """The preview file for an address of the site (clean addresses like Caddy), or None."""
    root = preview_root().resolve()
    target = (root / path).resolve()
    if not target.is_relative_to(root):
        return None
    for candidate in (target, target.with_name(target.name + '.html'), target / 'index.html'):
        if candidate.is_file():
            return candidate
    return None


def fallback(path):
    """Shared files the preview does not contain (styles, scripts, fonts): from the local site, if there is one."""
    if not settings.LOCAL:
        return None
    root = settings.SITE_ROOT.resolve()
    target = (root / path).resolve()
    return target if target.is_relative_to(root) and target.is_file() else None


BANNER = (
    '<div style="position:sticky;top:0;z-index:1000;display:flex;flex-wrap:wrap;gap:8px 16px;justify-content:center;'
    'align-items:center;padding:8px 16px;background:#070707;color:#fafafa;font:600 14px/1.4 system-ui,sans-serif">'
    '<span>Предпросмотр — ещё не опубликовано</span>{links}</div>'
    '<style>.lang-toggle,.lang-menu{{display:none!important}}</style>'
)


def mark_page(html, path):
    """Banner on top of every page; the language switch is replaced by links that stay inside the preview."""
    depth = path.count('/')
    base = '../' * depth
    page = path.split('/', 1)[1] if path.startswith(LANGUAGE_PREFIXES) else path
    links = ''.join(f'<a href="{base}{prefix}{page}" style="color:#ffb703">{label}</a>'
                    for prefix, label in (('', 'RU'), ('uz/', 'UZ'), ('kaa/', 'QQ'), ('en/', 'EN')))
    banner = BANNER.format(links=links)
    head_end = html.find('>', html.find('<body'))
    if head_end < 0:
        return banner + html
    # Saved language choice must not send the preview to the public site.
    html = html.replace('rel="alternate" hreflang=', 'rel="preview-alternate" data-hreflang=')
    head_end = html.find('>', html.find('<body'))
    return html[:head_end + 1] + banner + html[head_end + 1:]


def content_type(file):
    guessed = mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
    return f'{guessed}; charset=utf-8' if guessed.startswith('text/') or guessed.endswith('javascript') else guessed
