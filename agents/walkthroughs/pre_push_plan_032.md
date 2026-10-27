# PLAN-032 — Проверка перед commit/push

Дата: 2026-10-27. Автор: Codex. Репозиторий: https://github.com/madsaomi/1.git, текущая ветка main. Владелец разрешил проверку и push.

## Проверено и исправлено
- Независимый review runtime: блокирующих регрессий в index/style/script/theme-init/build/content не найдено. Проверены точные данные, anchors, ресурсы, dialog/fallback, фильтры и контакты.
- Независимый deployment review выявил2пропущенныхDocker context исключения. Добавлены только !theme-init.js и !robots.txt в .dockerignore, существующие Dockerfile/Caddyfile/railway.json в этом проходе не изменялись. Регрессия COPY/context покрыта тестом (BUG-022).
- Исходный content.js содержит166CRLF, Git attributes хранят LF. Protected fingerprint теперь принимает только LF/CRLF эквивалентность, исходный PLAN-030 baseline не изменен. Помимо этого допустим только точный .dockerignore fix; все прочие изменения данных/config нарушают hash (BUG-023).
- .gitignore исключает .playwright-mcp/, __pycache__/ и *.py[cod]. Кэши и снимки локально сохранены, в staged их нет. Включены все необходимые новые generator/theme/fonts/tests/CI и память.
- Устаревший deployment runbook с FastAPI/Compose заменен инструкцией реального статического стека; README актуализирован.

## Результаты
49/49 Node tests, syntax script/content/theme-init/build, build.mjs --check, validate_html.py (HTML/IDs/anchors/resources/labels/palette), Python compile tools и Second Brain integrity проходят на чистом экспорте Git index в .cache/pre-push-plan-032. Экспорт использует только staged-файлы с Git LF и не включает untracked/cache. Это не запуск локального сайта в браузере и не обход file-доступа. Повторять весь runtime-набор после документационных правок не требуется.

Secret-scan кандидата commit: не найдено типовых GitHub/OpenAI/AWS/Slack токенов или приватных ключей.5совпадений credential-URL находятся только в отрицательных test fixtures для проверки запрета credentials; значения не выводились. .env.example содержит placeholder, .env/private config не включены. Это ограниченный поиск известных шаблонов, не обещание полного security-аудита.

Полный staged whitespace check отмечает существующие Markdown hard breaks и пробелы шаблонов/истории. Историю не переписывали ради косметики. Содержательные проверки кода проходят; служебные whitespace-предупреждения не являются runtime-ошибкой.

## Ограничения и отправка
Docker/Caddy локально не установлены: реальный контейнерный build не выполнялся. CI настроен на npm check/docker build/integrity, его результат нельзя заявлять до отправки. Browser375/768/1440 обе темы и2дополнительныхцикла PLAN-031 остаются открытыми по прежнему отказу локального доступа. Публичные6map embed просмотрены в предыдущем проходе, это не browser QA сайта.

Remote main не удалось прочитать: Git в sandbox и require_escalated сообщает Could not resolve host github.com; Python DNS github.com/api.github.com также11001. GitHub connector get_repo — Unknown tool. Это подтвержденное сетевое ограничение, не проблема пароля или проекта (BUG-024). Подготовить локальный commit и выполнить обычный git push origin main; не force. Успешную отправку/remote SHA/CI не заявлять без подтверждения. При отказе сети локальный commit готов к повтору того же push после восстановления DNS.

Фактическое завершение: создан commit ba2f5a6,182файла/9239добавленных/1445удаленныхстрок; проверка staged manifest не нашла .cache/.playwright-mcp/__pycache__/bytecode/.env. Обычный `git push origin main` с разрешенным выходом из sandbox завершился exit1: Could not resolve host github.com. Remote SHA, GitHub Actions и Railway деплой не подтверждены. Итог этой попытки сохранен отдельным документационным коммитом; разрешение на push сохраняется, для повтора нужна исправная сеть.

Повторная отправка по следующему запросу владельца успешна: exit0, c6aa4ad..0ac979a main→main. Независимый ls-remote подтвердил0ac979ab26ccf8d398e4257a61145083ef99139e. Отправлены ba2f5a6 и0ac979a; runtime-файлы после49проверок не менялись. Сетевые настройки и remote не менялись. CI/Railway и browser-приемка не подтверждаются одним push и учитываются отдельно. Эта запись и новая сессия фиксируются отдельным документационным коммитом.
