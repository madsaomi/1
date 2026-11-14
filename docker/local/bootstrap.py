"""Local-only setup. Credentials and OTP files stay outside the served site."""
import os
import secrets
import sys
from pathlib import Path

sys.path.insert(0, '/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.conf import settings
from django.core.management import call_command
from django.contrib.auth import get_user_model
from content.models import Course

if not settings.LOCAL or os.environ.get('SITE_PUBLISH_TARGET') != 'local':
    raise RuntimeError('This bootstrap is only for the isolated local installation.')
call_command('migrate', interactive=False)
if not Course.objects.exists():
    call_command('import_content', '/site/content.js')
else:
    call_command('sync_page_texts')
call_command('sync_translations')
from content.publish import publish_site
publish_site()
state = Path('/local-state')
state.mkdir(parents=True, exist_ok=True)
User = get_user_model()
if not User.objects.filter(username='admin').exists():
    password = secrets.token_urlsafe(18)
    User.objects.create_superuser('admin', '', password)
    call_command('enable_2fa', 'admin', output=state)
    (state / 'access.txt').write_text(
        'Site: http://localhost:8080\nAdmin: http://localhost:8000/admin/\n'
        'Login: admin\nPassword: ' + password + '\n'
        'Scan admin-qr.png with your authenticator app.\n', encoding='utf-8')
print('Local admin ready. Login instructions: .cache/docker-local/access.txt')
