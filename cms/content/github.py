"""Publish static content with one non-forced GitHub ref update."""
import base64
import hashlib
import json
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, build_opener, HTTPRedirectHandler


class GitHubError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


SOURCE_FILES = ('build.mjs', 'content.js', 'index.html', 'results.html', 'career.html', 'assets/i18n/uz.js')
OUTPUT_FILES = frozenset(('content.js', 'index.html', 'results.html', 'career.html', 'assets/i18n/uz.js'))
PHOTO_PATH = re.compile(r'assets/[a-z0-9/_-]+\.(?:jpe?g|webp|png)\Z')


def allowed_photo(path):
    return isinstance(path, str) and bool(PHOTO_PATH.fullmatch(path)) and '..' not in path.split('/')


def blob_sha(content):
    return hashlib.sha1(b'blob ' + str(len(content)).encode('ascii') + b'\0' + content).hexdigest()


class GitHubClient:
    def __init__(self, repository, branch, token):
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository or ''):
            raise GitHubError('Задайте SITE_GITHUB_REPOSITORY в формате владелец/репозиторий.')
        if (not branch or len(branch) > 200 or branch.startswith(('/', '.')) or branch.endswith(('/', '.'))
                or any(part in ('', '.', '..') for part in branch.split('/'))
                or re.search(r'[\s~^:?*\[\\\x00-\x1f\x7f]|\.\.|@\{|//', branch)):
            raise GitHubError('Задайте корректную ветку SITE_GITHUB_BRANCH.')
        if not token:
            raise GitHubError('Не задан SITE_GITHUB_TOKEN для публикации.')
        self.repository, self.branch, self.token = repository, branch, token
        self.base = f'https://api.github.com/repos/{repository}'
        self.opener = build_opener(NoRedirect())
        self.deadline = time.monotonic() + 210

    def request(self, method, path, data=None):
        body = json.dumps(data).encode('utf-8') if data is not None else None
        request = Request(self.base + path, data=body, method=method, headers={
            'Authorization': f'Bearer {self.token}', 'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'Stanford-Content-Admin',
            'Content-Type': 'application/json',
        })
        try:
            remaining = self.deadline - time.monotonic()
            if remaining < 1:
                raise GitHubError('Превышено время публикации. Проверьте статус ветки перед повтором.')
            with self.opener.open(request, timeout=min(20, remaining)) as response:
                raw = response.read(24 * 1024 * 1024 + 1)
            if len(raw) > 24 * 1024 * 1024:
                raise GitHubError('Ответ GitHub слишком большой.')
            return json.loads(raw)
        except HTTPError as error:
            if error.code in (409, 422):
                raise GitHubError('Ветка изменилась или GitHub отклонил публикацию. Обновите страницу и повторите.') from None
            if error.code in (401, 403, 404):
                raise GitHubError('GitHub недоступен: проверьте репозиторий, ветку и права токена Contents: read/write.') from None
            raise GitHubError(f'GitHub временно недоступен (HTTP {error.code}). Повторите позже.') from None
        except (URLError, TimeoutError, OSError, ValueError):
            raise GitHubError('Не удалось связаться с GitHub. Проверьте статус ветки перед повторной публикацией.') from None

    def head(self):
        return self.request('GET', '/git/ref/heads/' + quote(self.branch, safe='/'))['object']['sha']

    def snapshot(self, directory, photo_paths=()):
        """Fetch build inputs from one pinned commit, including current templates."""
        parent = self.head()
        commit = self.request('GET', f'/git/commits/{parent}')
        tree_sha = commit['tree']['sha']
        tree = self.request('GET', f'/git/trees/{tree_sha}?recursive=1')
        if tree.get('truncated'):
            raise GitHubError('GitHub вернул неполный список файлов. Публикация остановлена.')
        entries = {item['path']: item for item in tree['tree'] if item.get('type') == 'blob' and item.get('mode') == '100644'}
        paths = set(SOURCE_FILES)
        for path in photo_paths:
            if not allowed_photo(path):
                raise GitHubError('Небезопасный путь фотографии. Выберите фото в админке заново.')
            paths.add(path)
        total = 0
        for path in sorted(paths):
            self.download(directory, entries, path)
            total += entries[path].get('size', 0)
            if total > 24 * 1024 * 1024:
                raise GitHubError('Исходники превышают допустимый размер.')
        return {'parent': parent, 'tree': tree_sha, 'entries': entries}

    def download(self, directory, entries, path):
        if path not in SOURCE_FILES and not allowed_photo(path):
            raise GitHubError('Недопустимый исходник сайта.')
        entry = entries.get(path)
        if not entry or entry.get('size', 0) > 8 * 1024 * 1024:
            raise GitHubError(f'В выбранной ветке отсутствует или слишком велик файл {path}.')
        blob = self.request('GET', f"/git/blobs/{entry['sha']}")
        if blob.get('encoding') != 'base64':
            raise GitHubError('Неподдерживаемый формат файла в GitHub.')
        content = base64.b64decode(blob['content'])
        if len(content) > 8 * 1024 * 1024 or blob_sha(content) != entry['sha']:
            raise GitHubError('Размер или целостность исходника не прошли проверку.')
        destination = directory / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)

    def publish(self, snapshot, files):
        changed = {}
        for path, content in files.items():
            if path not in OUTPUT_FILES and not (path.startswith('assets/uploads/') and allowed_photo(path)):
                raise GitHubError('Публикация содержит файл вне разрешённого списка.')
            if snapshot['entries'].get(path, {}).get('sha') != blob_sha(content):
                changed[path] = content
        if self.head() != snapshot['parent']:
            raise GitHubError('Ветка изменилась во время сборки. Повторите публикацию с актуальными исходниками.')
        if not changed:
            return {'commit': snapshot['parent'], 'changed': False}
        entries = []
        for path, content in changed.items():
            blob = self.request('POST', '/git/blobs', {'encoding': 'base64', 'content': base64.b64encode(content).decode('ascii')})
            entries.append({'path': path, 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})
        tree = self.request('POST', '/git/trees', {'base_tree': snapshot['tree'], 'tree': entries})
        commit = self.request('POST', '/git/commits', {'message': 'Publish site content from Stanford admin',
                              'tree': tree['sha'], 'parents': [snapshot['parent']]})
        try:
            self.request('PATCH', '/git/refs/heads/' + quote(self.branch, safe='/'), {'sha': commit['sha'], 'force': False})
        except GitHubError:
            if self.head() != commit['sha']:
                raise
        return {'commit': commit['sha'], 'changed': True}
