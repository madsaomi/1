# Админка содержимого (PLAN-044)

Скрытая админка Django 6.1 + Unfold. Публичный сайт остается статикой; админка хранит данные в Postgres и (этап 4) публикует `content.js`.

## Локальный просмотр
```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # Linux/macOS: .venv/bin/pip
DJANGO_DEBUG=1 .venv/Scripts/python manage.py migrate
DJANGO_DEBUG=1 .venv/Scripts/python manage.py import_content          # данные из ../content.js
DJANGO_DEBUG=1 .venv/Scripts/python manage.py createsuperuser
DJANGO_DEBUG=1 .venv/Scripts/python manage.py enable_2fa <логин>     # QR в .local-2fa/ → Google Authenticator
DJANGO_DEBUG=1 .venv/Scripts/python manage.py runserver
```
Вход: http://127.0.0.1:8000/admin/ — логин, пароль и 6-значный код из приложения. Без `DJANGO_DEBUG=1` админка не запустится без серверных переменных — это намеренно.

## Сервер (Railway, этап 5)
Обязательные переменные: `DJANGO_SECRET_KEY` (длинный случайный), `ADMIN_PATH` (секретный путь, 12+ символов, с `/` в конце), `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS` (`https://…`), `POSTGRES_DB/USER/PASSWORD/HOST/PORT`, `MEDIA_ROOT` (том Railway).
Подключить аутентификатор владельцу: `python manage.py enable_2fa <логин> --print` в своем терминале Railway — ссылку видит только он.

## Защита
Код из приложения обязателен (django-otp); 5 неверных паролей — блокировка логина на 15 минут (django-axes); HTTPS, HSTS, secure cookies, сессия 8 часов, `X-Robots-Tag: noindex`; фото — только JPG/PNG/WebP до 5 МБ.

## Проверки
```bash
DJANGO_DEBUG=1 .venv/Scripts/python manage.py test content
```
В CI — те же тесты на Postgres и `check --deploy --fail-level WARNING` с серверными настройками.
