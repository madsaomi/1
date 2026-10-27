# BUG-022 — Обязательные COPY-файлы исключены из Docker context

Дата: 2026-10-27. Автор: Codex. Статус: ИСПРАВЛЕНО В КОНТЕКСТЕ СБОРКИ, PLAN-032.

## Симптом
Pre-push review обнаружил: существующий Dockerfile копирует theme-init.js и robots.txt, но .dockerignore использует `**` и не разрешает эти2файла. Чистая Docker/Railway сборка не сможет разрешить COPY. Реальный локальный docker build пока не выполнен: Docker/Caddy отсутствуют.

## Причина
При добавлении bootstrap темы и robots в COPY не были синхронизированы default-deny правила build context. Обычный fs.existsSync на рабочей папке и Node/browser-проверки не моделируют исключения Docker context.

## Решение
Добавлены только `!theme-init.js` и `!robots.txt` в .dockerignore; Dockerfile/Caddyfile/Railway не менялись в этом проходе. Новый regression выводит все root-file COPY inputs из Dockerfile и проверяет их существование и явно разрешенный default-deny контекст. Baseline PLAN-030 не переписан: protected-test удаляет ровно2документированныхдобавления из текущего .dockerignore и требует прежний SHA256; все остальные protected-файлы сравниваются без исключений.

## Предотвращение
При каждом новом COPY-файле сверять .dockerignore; CI должен выполнять реальный docker build. Новый тест предназначен для существующего root-file allowlist-контракта, не является полным интерпретатором Docker ignore semantics. В .gitignore также исключены локальные .playwright-mcp/ и Python bytecode/cache — это подготовка чистого commit, файлы локально не удалены.
