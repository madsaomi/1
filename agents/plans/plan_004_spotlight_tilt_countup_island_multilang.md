# 📐 План: Реализация Spotlight Glow, Count-Up, Floating Island, Multilingual (RU/UZ/QR) и 3D-Tilt Hero

**ID плана:** PLAN-004  
**Связанная задача:** TASK-005  
**Статус:** В работе (In Progress)  
**Дата создания:** 2026-10-24  
**Автор:** Antigravity (Gemini)  

---

## 1. 🎯 Цель и контекст

По запросу пользователя реализуется комплекс из 5 передовых frontend/дизайн-функций:
1. **Spotlight Hover Glow (Пункт 1):** Интерактивная радиальная подсветка карточек (`.course-card`, `.review-card`, `.benefits-grid article`, `.club-card`), следующая за курсором мыши через CSS-переменные `--mouse-x` и `--mouse-y`.
2. **Count-Up Numbers Animation (Пункт 3):** Плавное нарастание чисел при скролле (филиалы `03`, пробный урок `0`, макс. группа `13`, результаты IELTS) с использованием `IntersectionObserver` и `requestAnimationFrame`.
3. **Dynamic Floating Island (Пункт 4):** Плавающий «остров» внизу экрана с полосой прогресса скролла страницы, индикатором свободных мест и кнопкой быстрой записи (`#enroll-modal`) / Telegram.
4. **Multilingual Switcher RU / UZ / QR (Пункт 7):** Мультиязычность для трёх языков региона (Русский, O'zbekcha, Qaraqalpaqsha) с переключателем в шапке, сохранением в `localStorage` и переводом ключевых элементов интерфейса.
5. **3D-Tilt Effect on Hero Monolith (Пункт 8):** Физичный 3D-наклон стеклянного монолита `.glass-slab` с динамическим бликом (glare), реагирующий на курсор в `.hero-scene` с проверкой `prefers-reduced-motion`.

---

## 2. 📂 Затронутые файлы

- [`content.js`](file:///c:/Users/madsaomi/Desktop/1/content.js): Добавление словаря локализации `i18n` (ru, uz, qr) для текстов, навигации, кнопок и карточек.
- [`index.html`](file:///c:/Users/madsaomi/Desktop/1/index.html):
  - Переключатель языков в `<header class="header wrap">`.
  - Атрибуты `data-i18n` и `data-counter` для анимируемых чисел в секции `.about-facts`.
  - Разметка плавающего острова `#floating-island` с прогресс-баром и CTA.
- [`style.css`](file:///c:/Users/madsaomi/Desktop/1/style.css):
  - Стили Spotlight Hover Glow (`.spotlight-card`, радиальный градиент по `--mouse-x`, `--mouse-y`).
  - Стили плавающего острова `#floating-island` (Glassmorphism 2.0, адаптивность, показ при скролле).
  - Стили переключателя языков (`.lang-switcher`, активные табы).
  - Стили 3D-Tilt и динамического светового блика для `.hero-scene` и `.glass-slab`.
- [`script.js`](file:///c:/Users/madsaomi/Desktop/1/script.js):
  - Модуль отслеживания курсора для карточек (Spotlight).
  - Модуль `CounterAnimator` (`IntersectionObserver` + lerp/raf).
  - Модуль плавающего острова (Scroll progress bar + threshold visibility).
  - Модуль локализации `i18n` (`setLanguage(lang)` + `localStorage`).
  - Модуль 3D-Tilt для Hero (`pointermove`, `pointerleave`, расчет углов и блика).

---

## 3. 🪜 Пошаговый алгоритм реализации

### Шаг 1: Подготовка данных мультиязычности в `content.js`
- Создать объект `i18n` с переводами для:
  - Навигации (Курсы, О центре, Клуб, Отзывы, Тест, Контакты)
  - Hero (заголовок, подзаголовок, бейдж, кнопки)
  - Плавающего острова (статус, кнопка записи)
  - Секций About, Quiz, Reviews, Footer

### Шаг 2: Разметка в `index.html`
- Добавить `<div class="lang-switcher" role="radiogroup" aria-label="Выбор языка">` в шапку рядом с кнопкой темы.
- Добавить `data-counter="3"`, `data-counter="0"`, `data-counter="13"` в `.about-facts`.
- Разместить `#floating-island` перед закрывающим тегом `</body>`.
- Проставить атрибуты `data-i18n="key"` для синхронизации перевода.

### Шаг 3: Стилизация в `style.css`
- Стили переключателя языков (`.lang-switcher` и кнопки `lang-btn`).
- Стили Spotlight Glow (`.spotlight-card::before` с `radial-gradient(circle at var(--mouse-x) var(--mouse-y), rgba(212, 160, 23, 0.15), transparent 60%)`).
- Стили 3D-наклон Hero (`perspective: 1000px`, `transform-style: preserve-3d`, glare overlay).
- Стили `#floating-island` (фиксированное позиционирование, адаптивные медиа-запросы, индикатор прогресса скролла).

### Шаг 4: Интерактивная логика в `script.js`
- Инициализация `initSpotlight()` с поддержкой `pointermove`.
- Инициализация `initCounters()` с анимацией чисел от 0 до целевого значения.
- Инициализация `initFloatingIsland()` с расчетом прогресса скролла и кнопкой открытия модалки.
- Инициализация `initLanguage()` с переключением текста и сохранением в `localStorage`.
- Инициализация `initHeroTilt()` с плавным возвратом при выходе курсора.

### Шаг 5: Валидация и обновление артефактов
- Запуск тестов целостности проекта (`check_integrity.py`).
- Обновление интерактивного дизайн-превью `design_preview.html`.
- Запись сессии в `agents/history/` и обновление статуса в `agents/STATUS.md`.

---

## 4. 🔒 Меры предосторожности и доступность (a11y)
- Строго соблюдать `prefers-reduced-motion: reduce`: отключать 3D-наклон и мгновенно показывать финальные числа счетчиков.
- Все кнопки переключения языков имеют атрибуты `aria-pressed` / `role="radio"`.
- Плавающий остров не должен перекрывать контент на мобильных устройствах (`bottom: max(16px, env(safe-area-inset-bottom))`, компактный вид).
