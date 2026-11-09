"""Settings for the hidden content admin (PLAN-044). Production values come from Railway variables."""
import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from django.templatetags.static import static
from django.urls import reverse_lazy

try:  # WhiteNoise comes from requirements.txt; the offline sandbox may not have it installed.
    import whitenoise  # noqa: F401
except ImportError:
    WHITENOISE_AVAILABLE = False
else:
    WHITENOISE_AVAILABLE = True

BASE_DIR = Path(__file__).resolve().parent.parent
SITE_ROOT = BASE_DIR.parent  # the static site whose content.js the admin publishes

# Fail closed. DJANGO_LOCAL=1 enables local-preview conveniences (default key and path, SQLite, plain HTTP);
# Django's technical error pages (DEBUG) need their own explicit DJANGO_TRACEBACKS=1 — they reveal URLs and code.
LOCAL = os.environ.get('DJANGO_LOCAL') == '1'
if LOCAL and (os.environ.get('RAILWAY_ENVIRONMENT') or os.environ.get('RAILWAY_PROJECT_ID')):
    raise ImproperlyConfigured('DJANGO_LOCAL=1 запрещен на Railway: локальный режим отключает HTTPS-защиту.')
DEBUG = os.environ.get('DJANGO_TRACEBACKS') == '1'
if DEBUG and not LOCAL:
    raise ImproperlyConfigured('DJANGO_TRACEBACKS разрешен только вместе с DJANGO_LOCAL=1: технические страницы '
                               'раскрывают пути и код.')
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY') or ('local-dev-only-key' if LOCAL else None)
if not SECRET_KEY:
    raise ImproperlyConfigured('DJANGO_SECRET_KEY must be set outside local development')
# The admin lives on a secret path in production; the default is only for local preview.
ADMIN_PATH = os.environ.get('ADMIN_PATH') or ('admin/' if LOCAL else '')
if not LOCAL and (not ADMIN_PATH.endswith('/') or ADMIN_PATH in {'/', 'admin/'} or len(ADMIN_PATH) < 12):
    raise ImproperlyConfigured('ADMIN_PATH must be a secret path (12+ characters, ending with "/") outside local development')
# Outside local preview every production dependency must be explicit: a silent fallback to SQLite or an empty
# ALLOWED_HOSTS would produce either a broken or an insecure deployment. POSTGRES_PORT has a sane default.
PRODUCTION_ENV = ('DJANGO_ALLOWED_HOSTS', 'DJANGO_CSRF_TRUSTED_ORIGINS',
                  'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST')
if not LOCAL:
    missing = [name for name in PRODUCTION_ENV if not os.environ.get(name)]
    if missing:
        raise ImproperlyConfigured('Не заданы обязательные переменные прода: ' + ', '.join(missing))
ALLOWED_HOSTS = [host for host in os.environ.get('DJANGO_ALLOWED_HOSTS', '127.0.0.1,localhost' if LOCAL else '').split(',') if host]
if not LOCAL:
    # The container healthcheck calls http://127.0.0.1:$PORT/healthz.
    ALLOWED_HOSTS += [host for host in ('127.0.0.1', 'localhost') if host not in ALLOWED_HOSTS]
CSRF_TRUSTED_ORIGINS = [origin for origin in os.environ.get('DJANGO_CSRF_TRUSTED_ORIGINS', '').split(',') if origin]

INSTALLED_APPS = [
    'unfold.apps.BasicAppConfig',  # templates and styles; the admin site itself comes from config.apps
    'config.apps.AdminConfig',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django_otp',
    'django_otp.plugins.otp_totp',
    'axes',
    'content',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'config.middleware.NoIndexMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.locale.LocaleMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django_otp.middleware.OTPMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'axes.middleware.AxesMiddleware',  # must be last
]
if WHITENOISE_AVAILABLE and not LOCAL:
    # Production serves collected static files itself (gunicorn has no static server);
    # local preview keeps Django's explicit static view from config/urls.py.
    MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')

AUTHENTICATION_BACKENDS = [
    'axes.backends.AxesStandaloneBackend',  # must be first
    'django.contrib.auth.backends.ModelBackend',
]
# Brute-force protection: behind Railway's proxy REMOTE_ADDR is shared, so lock by username, not IP.
AXES_FAILURE_LIMIT = 5
AXES_COOLOFF_TIME = timedelta(minutes=15)
AXES_LOCKOUT_PARAMETERS = ['username']
AXES_RESET_ON_SUCCESS = True
AXES_LOCKOUT_TEMPLATE = 'lockout.html'
# W006 warns that User-Agent/cookie rotation evades IP-less lockouts; a username lockout is not evaded that way,
# and an IP lockout would lock every visitor sharing the proxy address.
# W021: a *.up.railway.app host cannot join the browser HSTS preload list.
SILENCED_SYSTEM_CHECKS = ['axes.W006', 'security.W021']
OTP_TOTP_ISSUER = 'Stanford admin'

ROOT_URLCONF = 'config.urls'
# No slash-appending redirects: «/secret-path» → «/secret-path/» would confirm that a path exists.
APPEND_SLASH = False
WSGI_APPLICATION = 'config.wsgi.application'

TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [BASE_DIR / 'templates'],
    'APP_DIRS': True,
    'OPTIONS': {'context_processors': [
        'django.template.context_processors.request',
        'django.contrib.auth.context_processors.auth',
        'django.contrib.messages.context_processors.messages',
    ]},
}]

# Local preview uses SQLite; Railway provides Postgres through POSTGRES_* variables (stage 5).
if os.environ.get('POSTGRES_DB'):
    DATABASES = {'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ['POSTGRES_DB'],
        'USER': os.environ.get('POSTGRES_USER', ''),
        'PASSWORD': os.environ.get('POSTGRES_PASSWORD', ''),
        'HOST': os.environ.get('POSTGRES_HOST', ''),
        'PORT': os.environ.get('POSTGRES_PORT', '5432'),
    }}
elif LOCAL:
    DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': BASE_DIR / 'db.sqlite3'}}
else:
    raise ImproperlyConfigured('POSTGRES_DB is required outside local development')

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 12}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
]

LANGUAGE_CODE = 'ru'
TIME_ZONE = 'Asia/Tashkent'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
# Public site assets (logo, favicon). The directory is absent when the image is built from cms/ alone, which is
# fine: collectstatic then simply has nothing extra to copy. No prefix — prefixes break on Windows.
SITE_ASSETS = SITE_ROOT / 'assets'
STATICFILES_DIRS = [SITE_ASSETS] if SITE_ASSETS.is_dir() else []
# The brand icon/favicon come from assets/; a cms-only image (Railway builds from cms/) has no assets directory,
# so fall back to Unfold's default symbol instead of linking to a missing file.
BRAND_ASSETS = {name for name in ('stanford-icon.svg', 'favicon.svg') if (SITE_ASSETS / name).is_file()}
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}
if WHITENOISE_AVAILABLE:
    # Compressed (but not manifest-hashed) files: WhiteNoise serves them with long-lived caching, and a missing
    # referenced asset can never abort a deployment. This admin is the only consumer of these files.
    STORAGES['staticfiles'] = {'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage'}
MEDIA_URL = 'media/'
MEDIA_ROOT = Path(os.environ.get('MEDIA_ROOT', BASE_DIR / 'media'))
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# All logs to stdout: Railway collects them; security and lockout events are called out by name.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {'plain': {'format': '{asctime} {levelname} {name}: {message}', 'style': '{'}},
    'handlers': {'console': {'class': 'logging.StreamHandler', 'formatter': 'plain'}},
    'root': {'handlers': ['console'], 'level': 'INFO'},
    'loggers': {
        'django.security': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
        'axes': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
    },
}

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = not LOCAL
SESSION_COOKIE_AGE = 8 * 60 * 60
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
CSRF_COOKIE_SECURE = not LOCAL
X_FRAME_OPTIONS = 'DENY'
SECURE_REFERRER_POLICY = 'same-origin'
SECURE_CONTENT_TYPE_NOSNIFF = True
if not LOCAL:
    # Railway terminates TLS and forwards the original scheme.
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = True
    SECURE_REDIRECT_EXEMPT = [r'^healthz$']
    SECURE_HSTS_SECONDS = 365 * 24 * 60 * 60
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True  # the admin host has no subdomains of its own

# Photos only: small, common formats (see content.validators); requests stay modest.
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024


def changelist(model):
    return reverse_lazy(f'admin:content_{model}_changelist')


def singleton(model):
    return reverse_lazy(f'admin:content_{model}_change', args=[1])


UNFOLD = {
    'SITE_TITLE': 'Stanford — админка',
    'SITE_HEADER': 'Stanford',
    'SITE_SUBHEADER': 'Language Center',
    'SITE_SYMBOL': 'school',
    'SITE_URL': None,  # no «Return to site» link: the admin has no site of its own
    'SITE_ICON': (lambda request: static('stanford-icon.svg')) if 'stanford-icon.svg' in BRAND_ASSETS else None,
    'SITE_FAVICONS': ([{'rel': 'icon', 'type': 'image/svg+xml',
                        'href': lambda request: static('favicon.svg')}]
                      if 'favicon.svg' in BRAND_ASSETS else []),
    'SHOW_HISTORY': True,
    'SHOW_VIEW_ON_SITE': False,
    'BORDER_RADIUS': '12px',
    # Brand #FFB703 (oklch 82.5% .171 79.9). Unfold puts white text on primary-600 (buttons),
    # so 600+ are deep amber steps that keep white text readable.
    'COLORS': {
        'primary': {
            '50': 'oklch(98.5% .02 80)', '100': 'oklch(96.5% .05 80)', '200': 'oklch(93% .09 80)',
            '300': 'oklch(89% .13 80)', '400': 'oklch(86% .16 80)', '500': 'oklch(82.5% .171 79.9)',
            '600': 'oklch(50% .12 68)', '700': 'oklch(43% .1 66)', '800': 'oklch(37% .085 64)',
            '900': 'oklch(31% .07 62)', '950': 'oklch(23% .05 60)',
        },
    },
    'SIDEBAR': {
        'show_search': False,
        'show_all_applications': False,
        'navigation': [
            {'title': 'Сайт', 'items': [
                {'title': 'Настройки и демо-режим', 'icon': 'tune', 'link': singleton('sitesettings')},
                {'title': 'Цифры', 'icon': 'bar_chart', 'link': changelist('stat')},
            ]},
            {'title': 'Обучение', 'items': [
                {'title': 'Курсы и цены', 'icon': 'menu_book', 'link': changelist('course')},
                {'title': 'Кэшбэк за баллы', 'icon': 'payments', 'link': changelist('cashbacktier')},
                {'title': 'Условия кэшбэка', 'icon': 'checklist', 'link': changelist('cashbackrule')},
            ]},
            {'title': 'Люди', 'items': [
                {'title': 'Преподаватели', 'icon': 'group', 'link': changelist('teacher')},
                {'title': 'Результаты студентов', 'icon': 'emoji_events', 'link': changelist('studentresult')},
            ]},
            {'title': 'Связь', 'items': [
                {'title': 'Контакты', 'icon': 'call', 'link': singleton('contacts')},
                {'title': 'Филиалы и карты', 'icon': 'location_on', 'link': changelist('location')},
            ]},
            {'title': 'Доступ', 'separator': True, 'items': [
                {'title': 'Учетная запись', 'icon': 'person', 'link': reverse_lazy('admin:auth_user_changelist'),
                 'permission': lambda request: request.user.is_superuser},
            ]},
        ],
    },
}
