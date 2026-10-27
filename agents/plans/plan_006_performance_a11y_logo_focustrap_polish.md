# 📐 План: Оптимизация производительности, доступности (a11y Focus Trap), логотипа и мобильного UX

**ID плана:** PLAN-006  
**Связанная задача:** TASK-007  
**Статус:** В работе (In Progress)  
**Дата создания:** 2026-10-24  
**Автор:** Antigravity (Gemini)  

---

## 1. 🎯 Цель и контекст

По результатам аудита фронтенда и дизайнера устраняются ключевые узкие места (P0 и P1):
1. **P0.1: Оптимизация тяжелого логотипа (`assets/stanford-logo.png`):**
   - Уменьшение исходного PNG с `5785×3403 px` (178 KB) до веб-разрешения 640px ширины с компрессией и генерацией WebP.
   - Снижение веса ассета на ~90% (до 15–20 KB) для улучшения мобильного LCP (Largest Contentful Paint).
   - Обновление корректных атрибутов `width` и `height` в `index.html`.
2. **P0.2: WCAG AAA Focus Trap в модальном окне (`#enroll-modal`):**
   - Зацикливание клавиши `Tab` и `Shift+Tab` внутри модального окна между первым (`#modal-close`) и последним элементом формы (`.form-submit`).
   - Сохранение `document.activeElement` перед открытием окна и возврат фокуса на вызвавший элемент при закрытии.
3. **P1.1: Тактильный отклик для мобильных устройств (Active Touch States):**
   - Добавление плавного микро-сжатия `:active { transform: scale(0.97); }` на кнопках, фильтрах, слотах расписания и филиалах.
4. **P1.2: Корректное скрытие Floating Island у футера:**
   - Предотвращение наложения плавающего острова на ссылки и копирайт в самом низу страницы.
5. **P1.3: Системный font-stack fallback:**
   - Обеспечение плавного рендеринга шрифтов без смещения макета (CLS).

---

## 2. 📂 Затронутые файлы

- [`assets/stanford-logo.png`](file:///c:/Users/madsaomi/Desktop/1/assets/stanford-logo.png): Оптимизированное веб-изображение.
- [`assets/stanford-logo.webp`](file:///c:/Users/madsaomi/Desktop/1/assets/stanford-logo.webp): Современная легковесная WebP-версия.
- [`index.html`](file:///c:/Users/madsaomi/Desktop/1/index.html): Использование тега `<picture>` с fallback или обновленного логотипа с актуальными атрибутами `width="160"` / `height="94"`.
- [`script.js`](file:///c:/Users/madsaomi/Desktop/1/script.js):
  - Реализация Focus Trap и восстановления фокуса при открытии/закрытии `#enroll-modal`.
  - Улучшение логики скролла в `initFloatingIsland()` для скрытия у футера.
- [`style.css`](file:///c:/Users/madsaomi/Desktop/1/style.css):
  - Стили `:active` для мобильного тактильного отклика.
  - Уточнение системного font-stack.

---

## 3. 🪜 Пошаговый алгоритм реализации

### Шаг 1: Оптимизация графики через Python Pillow
- Сделать бэкап исходника в `assets/stanford-logo-orig.png`.
- Пересохранить `assets/stanford-logo.png` с шириной 640px (пропорциональная высота ~376px) с оптимизацией палитры.
- Сгенерировать современный `assets/stanford-logo.webp` (качество 88).
- Проверить экономию размера в KB.

### Шаг 2: Внедрение Focus Trap в `script.js`
- В `openModal()` сохранять `lastFocusedElement = document.activeElement`.
- Навесить слушатель `keydown` на `enrollModal`:
  - Найти все интерактивные элементы (`button, input, select, textarea, [tabindex]:not([tabindex="-1"])`).
  - Если `e.key === 'Tab'`: перенаправлять фокус с последнего элемента на первый (и наоборот при `Shift+Tab`).
- В `closeModal()` возвращать фокус `lastFocusedElement?.focus()`.

### Шаг 3: Доработка скрытия Floating Island у футера
- В `initFloatingIsland()` рассчитывать дистанцию до конца документа:
  `const isNearFooter = (scrollTop + window.innerHeight) >= (document.documentElement.scrollHeight - 160);`
- Если `isNearFooter === true`, убирать класс `.is-visible`.

### Шаг 4: Стилизация тактильного отклика и типографики в `style.css`
- Добавить `:active { transform: scale(0.97); }` на `.button`, `.sch-branch-btn`, `.sch-shift-btn`, `.filters button`, `.branches button`.
- Обновить fallback в `font-family`.

### Шаг 5: Проверка и фиксация в Second Brain
- Проверить `python brain.py check`.
- Зафиксировать результат в `agents/history/` и обновить `STATUS.md`.
