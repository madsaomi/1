# 📐 План реализации: PLAN-001 — Комплексная модернизация экосистемы «Второй Мозг»

> **Статус:** ✅ COMPLETED  
> **Дата создания:** 2026-09-19  
> **Автор / Агент:** Gemini (Antigravity)  
> **Связанная задача:** [TASK-001](file:///agents/tasks/active_task.md)  
> **Целевая ветка / Ревизия:** main  

---

## 1. 🎯 Цель и контекст
- **Проблема / Задача:** В текущем состоянии экосистемы Второго Мозга присутствуют рассинхронизации между правилами для разных AI-ассистентов (Plan-First отсутствовал в Cursor и Claude), отсутствуют критически важные шаблоны (Walkthrough, PR), в скриптах есть недочеты (хардкод таймзоны UTC+5 в `end_session.py`, перезапись переменных в шаблонах при `init_project.py`, отсутствие захвата плана в `dump_context.py`), а также отсутствует автоматизация создания планов.
- **Ожидаемый результат:** 
  1. 100% согласованность регламента Plan-First для всех агентов (Cursor, Claude, Windsurf, Copilot, Antigravity).
  2. Наличие всех шаблонов жизненного цикла: `template_walkthrough.md` и `template_pull_request.md`.
  3. Надежные и удобные скрипты автоматизации в `agents/tools/` (включая `new_plan.py` и `--fix` в `check_integrity.py`).
  4. Автоматическая CI-валидация целостности через GitHub Actions.

---

## 2. 🔍 Анализ и затронутые компоненты

### Затронутые файлы:
- `[MODIFY]` `.cursorrules` — добавление строгого правила Plan-First.
- `[MODIFY]` `CLAUDE.md` — добавление строгого правила Plan-First.
- `[NEW]` `.windsurfrules` — правила для редактора Windsurf (Cascade).
- `[NEW]` `.cursor/rules/second-brain.mdc` — поддержка современного формата правил Cursor.
- `[NEW]` `agents/templates/template_walkthrough.md` — бланк отчета о сдаче фичи (Walkthrough).
- `[NEW]` `agents/templates/template_pull_request.md` — бланк оформления PR.
- `[NEW]` `.github/pull_request_template.md` — GitHub PR template.
- `[MODIFY]` `agents/tools/init_project.py` — пропуск `agents/templates/` при автозамене.
- `[MODIFY]` `agents/tools/end_session.py` — динамическая таймзона и автопарсинг `[x]` задач.
- `[MODIFY]` `agents/tools/dump_context.py` — авто-упаковка активного плана.
- `[MODIFY]` `agents/tools/check_integrity.py` — валидация `template_walkthrough.md`, конфигов агентов и опция `--fix`.
- `[NEW]` `agents/tools/new_plan.py` — CLI утилита создания нового плана.
- `[NEW]` `.github/workflows/integrity.yml` — GitHub Actions workflow для проверки целостности.

---

## 3. 📝 Пошаговый план реализации (Atomic Steps)

- [x] **Этап 1: Синхронизация правил AI-ассистентов**
  - [x] Шаг 1.1: Обновить `.cursorrules` с внедрением правила Plan-First.
  - [x] Шаг 1.2: Обновить `CLAUDE.md` с внедрением правила Plan-First.
  - [x] Шаг 1.3: Создать `.windsurfrules`.
  - [x] Шаг 1.4: Создать `.cursor/rules/second-brain.mdc`.
- [x] **Этап 2: Новые шаблоны документов**
  - [x] Шаг 2.1: Создать `agents/templates/template_walkthrough.md`.
  - [x] Шаг 2.2: Создать `agents/templates/template_pull_request.md` и `.github/pull_request_template.md`.
- [x] **Этап 3: Улучшение утилит автоматизации (`agents/tools/`)**
  - [x] Шаг 3.1: Защитить `agents/templates/` в `init_project.py`.
  - [x] Шаг 3.2: Исправить таймзону и добавить парсинг `[x]` задач в `end_session.py`.
  - [x] Шаг 3.3: Добавить поддержку активного плана в `dump_context.py`.
  - [x] Шаг 3.4: Создать скрипт `new_plan.py`.
  - [x] Шаг 3.5: Добавить валидацию walkthrough и флаг `--fix` в `check_integrity.py`.
- [x] **Этап 4: CI/CD интеграция**
  - [x] Шаг 4.1: Создать `.github/workflows/integrity.yml`.
- [x] **Этап 5: Тестирование и верификация**
  - [x] Шаг 5.1: Проверить синтаксис всех Python файлов (`py_compile`).
  - [x] Шаг 5.2: Запустить `check_integrity.py` и протестировать `new_plan.py`.
  - [x] Шаг 5.3: Обновить `agents/STATUS.md` и `agents/tasks/active_task.md`.

---

## 4. 🛡️ Риски и план отката
- **Риски:** Нарушение обратной совместимости существующих скриптов.
- **План отката:** Использование стандартной библиотеки Python (без внешних зависимостей), проверка `git status` и `git diff`.

---

## 5. 🧪 Критерии готовности (Definition of Done)
- [ ] Все Python скрипты компилируются и работают без ошибок.
- [ ] `check_integrity.py` завершается успешно со всеми [OK].
- [ ] Все AI-манифесты согласованы по правилу Plan-First.
