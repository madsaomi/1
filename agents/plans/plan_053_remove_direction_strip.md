# 📐 План реализации: PLAN-053 — Убрать полосу направлений под первым экраном

> **Статус:** ✅ COMPLETED (не закоммичено)
> **Дата создания:** 2026-11-06
> **Автор / Агент:** Claude Code (Opus 5.5)
> **Связанная задача:** [PLAN-053](file:///agents/tasks/active_task.md)
> **Целевая ветка / Ревизия:** рабочая копия на `experiment/gsap`, не закоммичено (правка не зависит от GSAP — при желании переносится на main)

---

## 1. 🎯 Цель
Владелец прислал текст полосы («Языки / IELTS и SAT / Английский для детей / Математика») и написал: «это не нужно убери». После PLAN-051 полоса только дублирует фильтры раздела «Курсы и цены».

## 2. 🔍 Затронутые файлы
- `[MODIFY]` `build.mjs` — удалить `renderHero` и `replaceBlock(html, 'HERO', …)`.
- `[MODIFY]` `index.html` — удалить `<div class="directions wrap">…<!-- HERO_END --></nav></div>`; `style.css?v=70`, `script.js?v=46`.
- `[MODIFY]` `script.js` — удалить обработчик `[data-goal]` (фильтр по клику на полосу).
- `[MODIFY]` `style.css` — удалить `.directions`, `.hero-programs`, `.hero-program*` (база, 768, 1024).
- `[MODIFY]` `tests/site.test.mjs` — импорт `renderHero` и тест полосы заменить проверкой, что полосы нет.
- `[MODIFY]` `agents/testing/plan_030_baseline.json` — эталон каркаса (уходит `aria-label` полосы).

## 3. 📝 Шаги
- [x] 1. План.
- [x] 2. Правки build.mjs, index.html, script.js, style.css.
- [x] 3. Тесты, baseline.
- [x] 4. Браузер 1280/375.
- [x] 5. Документация.

## 4. 🛡️ Риски и откат
- Кнопка «Выбрать курс» на первом экране по-прежнему ведет к `#courses`, фильтры — в разделе.
- Откат: `git checkout -- build.mjs index.html script.js style.css tests/ agents/testing/plan_030_baseline.json`.

## 5. ✅ Итог (2026-11-06)
- Полоса удалена; под первым экраном сразу блок цифр (отступ 16px), без прокрутки вбок на 1280 и 375, консоль чистая.
- Тесты 56/56 (тест полосы заменен проверкой ее отсутствия), validate PASS, `--check` OK; baseline: текст каркаса не изменился, обновлен индекс ссылок.
