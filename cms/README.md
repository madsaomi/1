# Админка содержимого (PLAN-044)

Скрытая админка Django 6.1 + Unfold. Публичный сайт остается статикой; админка хранит данные в Postgres и
(этап 4) будет публиковать `../content.js`.

## Локальный просмотр
```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # Linux/macOS: .venv/bin/pip
DJANGO_LOCAL=1 .venv/Scripts/python manage.py migrate
DJANGO_LOCAL=1 .venv/Scripts/python manage.py import_content          # данные из ../content.js
DJANGO_LOCAL=1 .venv/Scripts/python manage.py createsuperuser
DJANGO_LOCAL=1 .venv/Scripts/python manage.py enable_2fa <логин>     # QR в .local-2fa/ → Google Authenticator
DJANGO_LOCAL=1 .venv/Scripts/python manage.py runserver
```
Вход: http://127.0.0.1:8000/admin/ — логин, пароль и 6-значный код из приложения. Без `DJANGO_LOCAL=1` админка
не запустится без серверных переменных — это намеренно (см. ниже). Технические страницы ошибок Django выключены
всегда; для отладки — осознанно добавить `DJANGO_TRACEBACKS=1` (только вместе с `DJANGO_LOCAL=1`).

Песочница без `pip` (как в этом окружении): пакеты лежат в `cms/.venv/site`, запускать так:
```powershell
$env:PYTHONPATH="C:\Users\madsaomi\Desktop\1\cms\.venv\site"; $env:DJANGO_LOCAL="1"
.\.venv\Scripts\python.exe manage.py test content
```

## Импорт и экспорт content.js
- `import_content [путь]` — по умолчанию `../content.js`. Без `--force` в непустую базу не пишет и просит
  `--force`; `--dry-run` проверяет файл и показывает итог, но всегда откатывает изменения (можно запускать и
  поверх заполненной базы). Импорт прогоняет `full_clean()` через валидаторы моделей, поэтому в базу не попадает
  то, что потом не пройдет `node build.mjs`.
- `export_content [--output ../content.js]` — собирает канонический `window.schoolContent = {…};` из базы
  (2 пробела, стабильный порядок, первая строка-комментарий). Node не нужен. Экспортируются только
  опубликованные курсы/преподаватели/результаты; контакты без канала при `verified=True` считаются ошибкой.
- **Фото не участвуют в content.js** (`Location.photo`, `Teacher.photo` — загрузки админки). Их перенос в
  `assets/` и ссылки на них — этап 4 вместе с публикацией через GitHub API; в этом репозитории этап 4 еще не
  реализован (нужен токен владельца).
- Кэшбэк (`cashback` в content.js) редактируется в разделах «Кэшбэк за баллы» и «Условия кэшбэка».
- После экспорта/ручной правки контента прогнать `node build.mjs` и проверки сайта из корня репозитория.

## Проверки
```bash
DJANGO_LOCAL=1 .venv/Scripts/python manage.py test content
DJANGO_LOCAL=1 .venv/Scripts/python manage.py makemigrations --check --dry-run
```
В CI — те же тесты на Postgres и `check --deploy --fail-level WARNING` с серверными настройками.

Локально без `psycopg` и `whitenoise` (offline-песочница) `check --deploy` с прод-env не поднимется: Django
импортирует Postgres-драйвер даже для `check`. В CI с `pip install -r requirements.txt` это не проблема.
Для локальной проверки можно подменить только `DATABASES` временным settings-модулем (остальные прод-настройки
и fail-fast проверки при этом настоящие):
```powershell
@"
from config.settings import *  # noqa
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': BASE_DIR / 'db.sqlite3'}}
"@ | Set-Content $env:TEMP\cms_check_settings.py -Encoding UTF8
$env:PYTHONPATH="C:\Users\madsaomi\Desktop\1\cms\.venv\site;$env:TEMP"
$env:DJANGO_LOCAL="0"; $env:ADMIN_PATH="ci-secret-path-0000/"
$env:DJANGO_ALLOWED_HOSTS="cms.example.org"; $env:DJANGO_CSRF_TRUSTED_ORIGINS="https://cms.example.org"
# + POSTGRES_* и случайный DJANGO_SECRET_KEY
.\.venv\Scripts\python.exe manage.py check --settings cms_check_settings --deploy --fail-level WARNING
```

## Переменные окружения
При `DJANGO_LOCAL=1` переменные не нужны (SQLite, `admin/`, plain HTTP). Вне локального режима старт падает,
если чего-то не хватает: `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `POSTGRES_DB`, `POSTGRES_USER`,
`POSTGRES_PASSWORD`, `POSTGRES_HOST`; плюс обязательные `DJANGO_SECRET_KEY` (длинный случайный) и `ADMIN_PATH`
(секретный путь, 12+ символов, с `/` в конце). `POSTGRES_PORT` по умолчанию `5432`.
`DEBUG` включается только `DJANGO_TRACEBACKS=1` и только при `DJANGO_LOCAL=1`.
`DJANGO_LOCAL=1` на Railway запрещен: если задан `RAILWAY_ENVIRONMENT` или `RAILWAY_PROJECT_ID`, старт падает.

## Деплой (Railway, этап 5)
1. Сервис с root directory `cms/`, Dockerfile `cms/Dockerfile` (python:3.13-slim, gunicorn, non-root).
2. Подключить Postgres; в сервис добавить переменные из списка выше.
3. Том Railway примонтировать в `/app/media` (фото филиалов и преподавателей). Контейнер работает под uid 10001,
   а тома Railway обычно создаются от root: если фото не загружаются, проверьте права на `MEDIA_ROOT` (том должен
   быть доступен на запись uid 10001) или смонтируйте пустой том — Railway выставит владельца при первом создании.
4. Первый запуск (Railway Shell):
   `python manage.py migrate` и, если база пустая, `python manage.py import_content`.
5. Подключить аутентификатор владельцу: `python manage.py enable_2fa <логин> --print` в его терминале Railway —
   ссылку с секретом видит только он; не публиковать вывод и очистить логи.
6. Проверка живости: `GET /healthz` → `ok` (без авторизации, без редиректа; путь исключен из SSL-редиректа и
   разрешен в `ALLOWED_HOSTS` для контейнерных healthcheck'ов).
7. Статика: при сборке `collectstatic` (WhiteNoise `CompressedStaticFilesStorage`), в прод-режиме
   `WhiteNoiseMiddleware` раздает `/static/`; `/media/` отдает Django (низкий трафик). `STATIC_ROOT` —
   `cms/staticfiles`, в git не попадает.

## Защита
Код из приложения обязателен (django-otp); 5 неверных паролей — блокировка логина на 15 минут (django-axes);
HTTPS, HSTS, secure cookies, сессия 8 часов, `X-Robots-Tag: noindex`; логи в stdout (INFO, включая
`django.security` и `axes`); фото — только JPG/PNG/WebP до 5 МБ.

## Валидация (как в build.mjs)
- `SiteSettings.site_url` — только `https://`, без логина, `?query` и `#hash`; путь после домена можно.
- `Course.price > 0`, `special_price > 0` и строго меньше `price`; `category` из
  `languages/kids/subjects/exam`; `name` и `description` не пустые (в т.ч. без одних пробелов).
- `Phone` — ровно `+998` и 9 цифр; `Contacts.verified=True` требует телефон или Telegram для записи;
  `hr_telegram` не совпадает с Telegram для записи.
- `CashbackTier`: экзамен `ielts/sat`, балл, целая выплата > 0, уникальная пара экзамен+балл;
  `CashbackRule`: непустые шаг и пояснение.
- Подтверждение контактов требует уже сохраненного канала: сначала выключите «Контакты подтверждены», добавьте
  телефон/Telegram на той же странице, сохраните, затем включите галочку.

## Еще не реализовано (этап 4)
Публикация `content.js` коммитом через GitHub API и перенос фото из `MEDIA_ROOT` в `assets/` — нужен токен
владельца (и его решение по репозиторию/ветке). Корневые `Dockerfile`/`Caddyfile`/`railway.json` и настройки
Railway эта задача не трогает.
