"""Publication tests use temporary checkouts and a fake GitHub API; no external writes."""
import base64
import shutil
import tempfile
from pathlib import Path
from unittest import mock

from django.conf import settings
from django.test import SimpleTestCase, override_settings

from .github import GitHubClient, GitHubError, SOURCE_FILES, blob_sha
from .publish import PublishError, atomic_write, publication_lock, publish_local


class GitHubPublicationTests(SimpleTestCase):
    def github(self):
        return GitHubClient('owner/site', 'main', 'test-token')

    def test_snapshot_is_pinned_and_checks_blob_integrity(self):
        client = self.github()
        content = {name: name.encode() for name in SOURCE_FILES}
        entries = [{'path': name, 'sha': blob_sha(data), 'size': len(data), 'type': 'blob', 'mode': '100644'}
                   for name, data in content.items()]
        def request(method, path, data=None):
            self.assertEqual(method, 'GET')
            if path == '/git/ref/heads/main':
                return {'object': {'sha': 'parent'}}
            if path == '/git/commits/parent':
                return {'tree': {'sha': 'tree'}}
            if path == '/git/trees/tree?recursive=1':
                return {'tree': entries}
            sha = path.rsplit('/', 1)[-1]
            if sha == 'wrong':
                return {'encoding': 'base64', 'content': base64.b64encode(b'corrupt').decode()}
            payload = next(value for value in content.values() if blob_sha(value) == sha)
            return {'encoding': 'base64', 'content': base64.b64encode(payload).decode()}
        with tempfile.TemporaryDirectory() as temporary, mock.patch.object(client, 'request', side_effect=request):
            root = Path(temporary)
            snapshot = client.snapshot(root)
            self.assertEqual(snapshot['parent'], 'parent')
            self.assertEqual((root / 'index.html').read_bytes(), b'index.html')
        entries[0]['sha'] = 'wrong'
        with tempfile.TemporaryDirectory() as temporary, mock.patch.object(client, 'request', side_effect=request):
            with self.assertRaises(GitHubError):
                client.snapshot(Path(temporary))

    def test_one_commit_and_non_forced_ref_preserve_unrelated_files(self):
        client = self.github()
        snapshot = {'parent': 'parent', 'tree': 'old-tree', 'entries': {}}
        responses = [ {'object': {'sha': 'parent'}}, {'sha': 'blob'}, {'sha': 'new-tree'}, {'sha': 'commit'}, {} ]
        with mock.patch.object(client, 'request', side_effect=responses) as request:
            result = client.publish(snapshot, {'index.html': b'new'})
        self.assertEqual(result, {'commit': 'commit', 'changed': True})
        tree_call, commit_call, ref_call = request.call_args_list[2:]
        self.assertEqual(tree_call.args[2]['base_tree'], 'old-tree')
        self.assertEqual(commit_call.args[2]['parents'], ['parent'])
        self.assertEqual(ref_call.args, ('PATCH', '/git/refs/heads/main', {'sha': 'commit', 'force': False}))

    def test_race_or_unapproved_file_cannot_update_the_branch(self):
        client = self.github()
        snapshot = {'parent': 'parent', 'tree': 'tree', 'entries': {}}
        with mock.patch.object(client, 'head', return_value='someone-elses-commit'), \
                mock.patch.object(client, 'request') as request:
            with self.assertRaises(GitHubError):
                client.publish(snapshot, {'index.html': b'new'})
            request.assert_not_called()
        for path in ('Caddyfile', '.github/workflows/ci.yml', 'assets/uploads/../../secret.png'):
            with self.assertRaises(GitHubError):
                client.publish(snapshot, {path: b'bad'})

    def test_unchanged_content_does_not_create_a_commit(self):
        client = self.github()
        snapshot = {'parent': 'parent', 'tree': 'tree', 'entries': {'index.html': {'sha': blob_sha(b'same')}}}
        with mock.patch.object(client, 'head', return_value='parent'), mock.patch.object(client, 'request') as request:
            self.assertFalse(client.publish(snapshot, {'index.html': b'same'})['changed'])
            request.assert_not_called()
        with mock.patch.object(client, 'head', return_value='advanced'):
            with self.assertRaises(GitHubError):
                client.publish(snapshot, {'index.html': b'same'})

    def test_failed_ref_response_is_read_back(self):
        client = self.github()
        snapshot = {'parent': 'parent', 'tree': 'tree', 'entries': {}}
        responses = [{'object': {'sha': 'parent'}}, {'sha': 'blob'}, {'sha': 'tree'}, {'sha': 'commit'},
                     GitHubError('timeout'), {'object': {'sha': 'commit'}}]
        with mock.patch.object(client, 'request', side_effect=responses):
            self.assertEqual(client.publish(snapshot, {'index.html': b'new'})['commit'], 'commit')


class LocalPublicationTests(SimpleTestCase):
    def test_failed_file_replacement_restores_from_prepared_disk_backups(self):
        import os
        real_replace = os.replace
        with tempfile.TemporaryDirectory() as temporary, override_settings(SITE_ROOT=Path(temporary)):
            root = Path(temporary)
            (root / 'index.html').write_bytes(b'old-index')
            (root / 'results.html').write_bytes(b'old-results')
            def fail_live_results(source, destination):
                if Path(destination) == root / 'results.html':
                    raise OSError('replacement failed')
                return real_replace(source, destination)
            with mock.patch('content.publish.os.replace', side_effect=fail_live_results):
                with self.assertRaises(PublishError):
                    publish_local({'index.html': b'new-index', 'results.html': b'new-results'})
            self.assertEqual((root / 'index.html').read_bytes(), b'old-index')
            self.assertEqual((root / 'results.html').read_bytes(), b'old-results')

    def test_write_failure_restores_every_page_and_new_assets(self):
        with tempfile.TemporaryDirectory() as temporary, override_settings(SITE_ROOT=Path(temporary)):
            root = Path(temporary)
            (root / 'index.html').write_bytes(b'old-index')
            (root / 'results.html').write_bytes(b'old-results')
            calls = 0
            def fail_third_write(path, content):
                nonlocal calls
                calls += 1
                if calls == 3:
                    raise OSError('disk full')
                atomic_write(path, content)
            with mock.patch('content.publish.atomic_write', side_effect=fail_third_write):
                with self.assertRaises(PublishError):
                    publish_local({'index.html': b'new', 'assets/uploads/new.jpg': b'photo', 'results.html': b'new'})
            self.assertEqual((root / 'index.html').read_bytes(), b'old-index')
            self.assertEqual((root / 'results.html').read_bytes(), b'old-results')
            self.assertFalse((root / 'assets/uploads/new.jpg').exists())

    def test_os_lock_refuses_a_second_publisher(self):
        with tempfile.TemporaryDirectory() as temporary, override_settings(BASE_DIR=Path(temporary)):
            with publication_lock():
                with self.assertRaises(PublishError):
                    with publication_lock():
                        self.fail('Second publisher entered')
