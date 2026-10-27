# PLAN-032 — Проверка накопленных изменений и push

Дата: 2026-10-27. Автор: Codex. Статус: ПРОВЕРЕНО, COMMIT/PUSH ГОТОВИТСЯ; GITHUB DNS НЕДОСТУПЕН. Владелец явно разрешил проверку и push.

## 1. Цель и контекст
Проверить накопленные изменения Stanford и отправить в существующий origin/main без force. Не заявлять пройденную browser-приемку: прежний отказ локального доступа сохраняется. Все48тестов уже проходят, но pre-push review обнаружил release blocker: Dockerfile ожидает theme-init.js/robots.txt, а существующий default-deny .dockerignore не включает их в build context.

## 2. Затронутые компоненты
- `[MODIFY] .dockerignore` — только2разрешающих исключения для существующего COPY, не менять Dockerfile/Caddyfile/Railway.
- `[MODIFY] .gitignore` — .playwright-mcp/ и Python bytecode/cache; файлы локально сохраняются.
- `[MODIFY] README.md`, `agents/deployment/DEPLOYMENT_RUNBOOK.md` — актуальные49проверок и команды реального статического стека вместо шаблонного FastAPI/Compose.
- `[MODIFY] tests/site.test.mjs`, `tests/design-system.test.mjs` — regression контракта COPY/default-deny context и проверка строго ограниченного изменения .dockerignore относительно неизменного PLAN-030 baseline. Не переписывать baseline ради прохождения тестов.
- Fingerprint-проверка должна принимать только EOL-эквивалентность Windows CRLF и Git LF: исходный content.js был CRLF, attributes хранят LF; проверить чистый экспорт index.
- `[NEW] agents/bugs_and_fixes/BUG_022_docker_context_bootstrap.md`, `[NEW] agents/walkthroughs/pre_push_plan_032.md`.
- `[MODIFY] STATUS, active_task, CODEBASE_MAP, QA`; новая история через end_session.py.
- Изучить и включить в commit ранее согласованные изменения сайта/ассетов/памяти/CI, не добавлять cache/secrets/tool screenshots. Только исправления подтвержденных блокеров. Никаких новых зависимостей.

## 3. Шаги
- [x] Изучить правила, статус/историю, Git remote/branch и список файлов; делегировать независимые runtime/deployment reviews.
- [x] Выполнить исходные48тестов, syntax и build --check.
- [x] Исправить build-context blocker и git hygiene, описать BUG-022 и проверить точный diff.
- [x] Проверить HTML/палитру,49тестов, syntax/build/current, Python compile/integrity, наличие секретов в кандидате commit; проверить доступность Docker/Caddy без установки.
- [x] Подготовить staged-набор, проверить чистый экспорт с LF и отсутствие артефактов; попытки чтения remote main завершились DNS-ошибкой.
- [ ] Сохранить отчет/историю, выполнить обычный push origin main; подтвердить remote SHA и проверить CI при доступности.

## 4. Риски и откат
Default-deny Docker context должен соответствовать root COPY. Разрешены толькоtheme-init.js/robots.txt, остальное сохраняется побайтно. Существующие protected Dockerfile/Caddyfile/Railway/content не менять; новый тест .dockerignore сравнивает с исходным baseline плюс строго заданный минимальный diff. Не затирать чужие commits или рабочие изменения, не force-push, не обходить denied browser. Не публиковать .env/ключи, .playwright-mcp и __pycache__. При расходящемся main безопасно согласовать историю без reset/force. Откат опубликованной версии — отдельный revert commit, только при необходимости; не делать автоматически.

## 5. Приемка
Bundled Node: syntax всех4JS/MJS, build --check, node --test. Bundled Python: validate_html.py, py_compile утилит, check_integrity.py. Проверить repository diff, staged file manifest, remote SHA после push. GitHub/Railway build является реальной проверкой контейнера, если локального Docker нет. Отсутствующие browser/Docker/CI проверки явно отделить от выполненных; не маркировать дизайн полностью принятым.
