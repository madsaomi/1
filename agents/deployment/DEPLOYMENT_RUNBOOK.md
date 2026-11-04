# Развертывание Stanford Language Center

Актуально: PLAN-032, 2026-10-27. Стек: HTML/CSS/Vanilla JS, Node-генератор, Caddy2, Docker, Railway. Внешних npm-зависимостей, API и БД нет.

## Подготовка
Требуются Node22+ и Python3.11+. После изменения content.js:

```sh
node build.mjs
npm run check
python agents/tools/check_integrity.py
```

Готовый index.html хранится в Git. Docker не запускает Node-генератор: актуальность HTML проверяет CI. npm install, requirements.txt, FastAPI и Docker Compose для этого проекта не нужны. Секреты карты/Telegram не используются; сайт открывает прямые контакты.

## Локальная проверка владельцем
```sh
python -m http.server 8080
```

Адрес http://localhost:8080. Python-сервер не воспроизводит Caddy CSP/cache/security headers. Для агента сохраняется ограничение browser-инструмента: не использовать локальный HTTP для обхода ранее отклоненного file-доступа.

## Контейнер
Если Docker установлен:

```sh
docker build -t stanford-check .
docker run --rm -p 8080:8080 stanford-check
```

Проверить /healthz (200, ok), /, /theme-init.js, /robots.txt, /style.css и локальные fonts. .dockerignore использует default-deny: каждый новый COPY-файл должен быть разрешен. PLAN-032 добавляет только theme-init.js/robots.txt, существующие Dockerfile/Caddyfile/railway.json не меняет.

Caddy слушает PORT (по умолчанию8080). Railway завершает TLS, auto_https в контейнере отключен. Docker копирует только runtime-файлы и assets; agents/tests/локальные инструменты не входят в web root. Assets кэшируются на1сутки с must-revalidate, изменяемые HTML/CSS/JS/robots имеют no-cache. CSP разрешает локальный Inter и iframe Google/Яндекс.

## GitHub и Railway
Origin: https://github.com/madsaomi/1.git, ветка main. После успешных проверок выполнить обычный push без force. Автодеплой зависит от подключения репозитория к Railway; git push сам по себе не подтверждает деплой.

railway.json выбирает Dockerfile и /healthz, timeout60s, restart ON_FAILURE с3повторами. Проверить GitHub Actions (npm check, docker build, integrity), статус Railway и внешний HTTPS. Production URL в content.js пока не указан; для canonical/OG нужен подтвержденный site.url и повторная генерация.

## Приемка и откат
На разрешенном HTTP(S)-стенде проверить375/768/1440 обе темы, menu/dialog/focus, фильтры,3филиала×2провайдера, console/network, reduced motion/no-JS. Эти browser-пункты открыты;49локальныхтестов их не заменяют. Docker/Caddy в сессии PLAN-032 отсутствуют, реальная сборка ожидает CI.

Для отката опубликованного изменения использовать отдельный согласованный revert commit. Не делать reset/force-push и не удалять Second Brain history.

PLAN-039: карта филиалов — только Google embed; при приемке проверять 3 филиала × Google-карта и ссылки «Яндекс Карты» (переключателя провайдера больше нет).
