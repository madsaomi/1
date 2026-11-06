# 📐 План реализации: PLAN-045 — P1 аудита 2026-11-06: защита админки, noindex в демо-режиме, коммит

> **Статус:** ✅ COMPLETED (запушено)
> **Дата создания:** 2026-11-06
> **Автор / Агент:** Claude Code (Opus 5.5)
> **Связанная задача:** [PLAN-045](file:///agents/tasks/active_task.md) · аудит: `agents/walkthroughs/audit_2026-11-06.md` · основа: PLAN-044 этап 2
> **Целевая ветка / Ревизия:** main

---

## 1. 🎯 Цель
Владелец: «Исправить P1». P1 аудита:
1. Прод отстает — закоммитить и запушить этап 1 PLAN-044 и прототип cms.
2. Защитить админку до деплоя: DEBUG выключен по умолчанию; 2FA (TOTP); защита от перебора; HSTS/SSL redirect/proxy header/CSRF origins; лимиты загрузок; секретный ADMIN_PATH без значения по умолчанию; requirements.txt; тесты cms и job в CI.
3. Пока включен демо-режим — `noindex` на сайте.

## 2. 🔍 Решения и версии (проверено 2026-11-06)
- django-otp 1.7.5 (Django ≥4.2) + TOTP; django-axes 9.0.0 (30.10.2026, Django 5.2–6.1); qrcode 8.2; psycopg 3.3.8 (Postgres в CI).
- Unfold подключается как `unfold.apps.BasicAppConfig`; сайт админки — `StanfordAdminSite(UnfoldAdminSite)` через свой `AdminConfig.default_site`: форма входа с кодом (OTPAdminAuthenticationForm), доступ только `is_verified()`; шаблон входа — копия Unfold + поле «Код из приложения», подзаголовок на русском (заодно P3 «Welcome back to»).
- Axes: блокировка по имени пользователя (за прокси Railway REMOTE_ADDR общий; django-ipware не ставим), 5 попыток, 15 минут.
- Подключение аутентификатора: команда `enable_2fa <user>` — создает TOTP-устройство и сохраняет QR (PNG) и otpauth-ссылку в файл (локально `cms/.local-2fa/`, в .gitignore) или печатает их владельцу в его терминале (`--print`).
- Продакшн (DEBUG=0): обязательны DJANGO_SECRET_KEY, ADMIN_PATH (не `admin/`), DJANGO_ALLOWED_HOSTS; SECURE_SSL_REDIRECT, SECURE_PROXY_SSL_HEADER, HSTS 1 год, secure cookies, сессия 8 ч; `X-Robots-Tag: noindex` на всех ответах cms.
- Загрузки: только jpg/jpeg/png/webp, до 5 МБ.
- Сайт: блок `ROBOTS` в `<head>` — `<meta name="robots" content="noindex, nofollow">` пока `site.demoMode`.

## 3. 📝 Шаги
- [x] 1. Версии и план.
- [x] 2. settings: безопасные значения по умолчанию.
- [x] 3. 2FA + axes + шаблон входа + `enable_2fa`.
- [x] 4. Валидаторы загрузок (+ миграция), requirements.txt.
- [x] 5. Тесты cms (настройки прод, модели, загрузки, импорт, 2FA, блокировка, noindex-заголовок, смоук всех страниц) + job `cms` в CI (Postgres-сервис, `check --deploy --fail-level WARNING`).
- [x] 6. Сайт: ROBOTS-блок + тест.
- [x] 7. Проверки (сайт 51+, cms тесты, deploy check, браузер: вход с кодом), документация, коммит и пуш.

## 4. 🛡️ Риски
- `noindex` уберет сайт из поиска, пока включен демо-режим — осознанно (образцы не должны индексироваться); выключение демо-режима вернет индексацию.
- Потеря телефона с аутентификатором: повторный `enable_2fa` владельцем через терминал Railway.
- Откат: `git revert`.

## 5. ✅ Итог (2026-11-06)
- settings: DEBUG только при `DJANGO_DEBUG=1`; без секрета/секретного `ADMIN_PATH` (12+ символов) админка не стартует; HTTPS-redirect, proxy header, HSTS 1 год (+subdomains), secure cookies, сессия 8 ч, Referrer-Policy; `X-Robots-Tag: noindex` (NoIndexMiddleware). `check --deploy --fail-level WARNING` — 0 (заглушены с пояснением axes.W006 и security.W021).
- 2FA: `StanfordAdminSite(UnfoldAdminSite)` через `config.apps.AdminConfig`; форма с «Код из приложения» (единственное устройство подставляется автоматически — django-otp 1.7.5 требует явного устройства); доступ только `is_verified()`; шаблон входа на русском, без «Return to site» (`UNFOLD.SITE_URL=None`).
- axes 9.0.0: 5 попыток, 15 минут, по имени пользователя.
- Фото: jpg/jpeg/png/webp до 5 МБ (миграция 0002). `requirements.txt`, `cms/README.md`, команда `enable_2fa`.
- Тесты cms 13/13 (настройки прод через subprocess, валидация, загрузки, импорт, 2FA, блокировка, noindex, смоук всех страниц); CI job `cms` на Postgres 17.
- Сайт: блок ROBOTS — noindex, пока demoMode; тест; 51/51.
- Браузер: вход логин+пароль+код → админка; страница входа: поле кода, заголовки noindex/DENY/same-origin.
