# 📐 План реализации: PLAN-002 — Единый CLI brain.py, Antigravity Skill, Git Hooks и Open-Source оформление

> **Статус:** ✅ COMPLETED  
> **Дата создания:** 2026-09-20  
> **Автор / Агент:** Gemini (Antigravity)  
> **Связанная задача:** [TASK-002](file:///agents/tasks/active_task.md)  
> **Целевая ветка / Ревизия:** main  

---

## 1. 🎯 Цель и контекст
- **Проблема / Задача:** В текущем виде для работы со Вторым Мозгом разработчику приходится запускать разрозненные скрипты (`check_integrity.py`, `new_plan.py`, `end_session.py`). Отсутствуют автоматические генераторы для баг-репортов (`BUG-XXX`), архитектурных решений (`ADR-XXX`) и карточек задач (`TASK-XXX`). Также отсутствует защита от коммита сломанного состояния (Git hooks), нативный скилл для Antigravity и открытая лицензия с бейджами.
- **Ожидаемый результат:** 
  1. Единая точка входа `python agents/tools/brain.py <команда>` (status, plan, bug, adr, task, check, dump, end).
  2. Красивый цветной терминальный дашборд `brain.py status`.
  3. Установщик Git pre-commit хука `python agents/tools/install_hooks.py`.
  4. Нативный Antigravity Skill `.agents/skills/second_brain/SKILL.md`.
  5. Проверка целостности внутренних ссылок в `check_integrity.py`.
  6. Файл `LICENSE` (MIT) и бейджи в `README.md`.

---

## 2. 🔍 Анализ и затронутые компоненты

### Затронутые файлы:
- `[NEW]` `agents/tools/brain.py` — единый CLI-инструмент управления Вторым Мозгом.
- `[NEW]` `brain.py` — корневой ярлык запуска единого инструмента.
- `[NEW]` `agents/tools/install_hooks.py` — установщик Git pre-commit хука.
- `[NEW]` `.agents/skills/second_brain/SKILL.md` — нативный манифест скилла для Antigravity IDE.
- `[NEW]` `LICENSE` — лицензия MIT.
- `[MODIFY]` `agents/tools/check_integrity.py` — добавление валидации внутренних ссылок markdown.
- `[MODIFY]` `README.md` — добавление бейджей и инструкций по `brain.py`.
- `[MODIFY]` `agents/AGENT_GUIDE.md` — обновление документации и карты инструментов.
- `[MODIFY]` `agents/tasks/active_task.md` — активный чек-лист TASK-002.

---

## 3. 📝 Пошаговый план реализации (Atomic Steps)

- [x] **Этап 1: Разработка единого CLI-комбайна `brain.py`**
  - [x] Шаг 1.1: Создать диспетчер команд и парсер аргументов для `brain.py`.
  - [x] Шаг 1.2: Реализовать генераторы сущностей `brain.py bug`, `brain.py adr`, `brain.py task`.
  - [x] Шаг 1.3: Реализовать цветной терминальный дашборд `brain.py status` (статус, активные задачи, метрики).
  - [x] Шаг 1.4: Интегрировать существующие команды (`plan`, `check`, `dump`, `end`).
- [x] **Этап 2: Нативный Antigravity Skill**
  - [x] Шаг 2.1: Создать `.agents/skills/second_brain/SKILL.md` с описанием возможностей и регламентов.
- [x] **Этап 3: Защита целостности в Git (Pre-commit Hook)**
  - [x] Шаг 3.1: Создать `agents/tools/install_hooks.py` для установки pre-commit хука.
- [x] **Этап 4: Валидация Markdown ссылок в `check_integrity.py`**
  - [x] Шаг 4.1: Добавить функцию поиска и проверки локальных ссылок в `check_integrity.py`.
- [x] **Этап 5: Open-Source оформление**
  - [x] Шаг 5.1: Создать файл `LICENSE` (MIT).
  - [x] Шаг 5.2: Добавить бейджи и примеры `brain.py` в `README.md`.
- [x] **Этап 6: Тестирование, верификация и сдача**
  - [x] Шаг 6.1: Проверить работу всех подкоманд `brain.py`.
  - [x] Шаг 6.2: Запустить `check_integrity.py` и проверить pre-commit хук.
  - [x] Шаг 6.3: Оформить отчет о сессии и walkthrough.

---

## 4. 🛡️ Риски и план отката
- **Риски:** Конфликты путей или зависимостей. Все скрипты реализуются строго на стандартной библиотеке Python без сторонних пакетов.
- **План отката:** Откат изменений через git в случае сбоя.

---

## 5. 🧪 Критерии готовности (Definition of Done)
- [x] Все команды `brain.py` отрабатывают без ошибок.
- [x] `check_integrity.py` успешно валидирует проект и ссылки.
- [x] `install_hooks.py` успешно настраивает `.git/hooks/pre-commit`.
