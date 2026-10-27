# PLAN-031 — Второй проход: результат и границы приемки

Дата: 2026-10-27. Агент: Codex. Статус: КОД И ПРОВЕРКА ПУБЛИЧНЫХ КАРТ ГОТОВЫ; BROWSER-ПРИЕМКА САЙТА ОТКРЫТА.

## Изменения по замечаниям
1. Шапка полностью непрозрачная в обеих темах, фон продолжается на поля без расширения layout. Border1px, blur12 сохранен. Anchor-offset81+16px у секций, курсов, экзаменов, скидок и mobile map-status. Нет двойного полного offset через scroll-padding.
2. Карта и переключатель JS не менялись. Отдельно проверены6публичныхembed, см. ниже.
3. Live-счетчик имеет sr-only, role=status и aria-live=polite сохранены, JS продолжает объявлять результат фильтра.
4. Все course-card — flex-column, footer margin-top:auto. На2колонках h3 min-height64, описание min-height96 на планшете/72 на десктопе, flex:1 у описания убран. Skills16px с inline SVG-check; ни line-clamp, ни жесткого обрезания. Min-height проверен чтением для текущего контента; при zoom/другом шрифте точное равенство строк не гарантируется без рендера.
5. Muted светлой темы #5B5B5B, основные описания/списки/FAQ/dialog16px; небольшие подписи14px. Текущие semantic-пары AA обеих тем проходят; marker/hover дополнительно рассчитаны.
6. Обычные секции64px padding-block на мобильном/планшете,96px от1024. Section-intro всегда под H2.
7. В обучении короткая вводная фраза выделена32px на планшете/десктопе,24px на телефоне, остальной текст20px. Копирайт полностью сохранен. У трех условий декоративные номера01–03, пояснения16px.
8. Speaking Club/Movie Club/пробные экзамены — три нейтральные карточки с единым SVG-контуром на желтой подложке.
9. Прайс ограничен960px; desktop колонки48/26/26, мобильные44/28/28. Числа16px, строки реагируют на hover/focus-within, внутренние ссылки имеют arrow-right, включая мобильную версию.
10. Hero-accent использует ровный marker #FFB703 с alpha89/255≈.35, underline удален.

Изменены style.css, index.html, build.mjs, tests/site.test.mjs и память проекта. script.js и theme-init.js byte-identical относительно начала прохода; content.js, Dockerfile, Caddyfile, railway.json, .dockerignore, package.json совпадают с защищенным baseline PLAN-030. Зависимости не добавлены. Отзывы/фото/результаты учеников не выдумывались, ранее удаленные разделы/плавающие CTA не восстановлены.

## Независимая критика исходников и исправления
Проверка compact_audit подтвердила причины title/subtitle/flex-описаний. Убрана специальная grid-компоновка последней карточки, противоречащая общему flex-подходу. При повторном чтении обнаружена пропущенная программная цель #map-status: ее mobile scrollIntoView после снятия global scroll-padding мог скрыть подпись под шапкой. Offset добавлен без JS-правки. Первоначальная формула full-bleed inset исправлена на paint-only shadow/clip до сдачи. Это source-review, не запрошенные реальные screenshot-итерации.

## Публичные карты: реально проверено Playwright
Google требует iframe-контекст: прямое открытие embed возвращает штатное пояснение, а не ошибку ссылки. Проверка Google выполнена в отдельном изолированном iframe900×540, только URL из content.js; ни HTML/CSS/JS/ассеты проекта туда не переносились. Яндекс открыт как публичный map-widget. Наши2диагностическиевкладки закрыты, пользовательские не менялись.

| Филиал | Google | Яндекс |
|---|---|---|
| Сараева | Загрузился: Stanford Language Center, красная метка и controls | Загрузился: улицы/Stanford/синяя метка |
| Абдирова | Загрузилась координатная точка; карточка Stanford не утверждается | Загрузился |
| «Жазлар ораый» | Загрузился Jaslar orayı, карточка/метка/controls | Загрузился |

Все6показывают естественные цвета провайдеров. Первая загрузка Google Сараева имела net::ERR_NAME_NOT_RESOLVED у maps.googleapis.com, последующая загрузка успешна, финальные console errors0/networkfailed0. Яндекс Сараева сначала22ошибкиDNStile/style, после чего успешный fallbackvmap3/tiles200 и полный рендер. У остальных Яндекс console errors0. Это сетевые сбои окружения, оснований менять script.js не обнаружено. Эти результаты не доказывают интеграцию в сайт, его CSP, переключение или отсутствие browser-console ошибок самого сайта.

Снимки провайдеров, не снимки сайта:
- Google Сараева: `.playwright-mcp/page-2026-10-27T12-00-34-243Z.jpeg`
- Google Абдирова: `.playwright-mcp/page-2026-10-27T12-01-00-872Z.jpeg`
- Google «Жазлар ораый»: `.playwright-mcp/page-2026-10-27T11-59-57-180Z.jpeg`
- Яндекс Сараева: `.playwright-mcp/page-2026-10-27T11-56-26-243Z.jpeg`
- Яндекс Абдирова: `.playwright-mcp/page-2026-10-27T11-57-54-966Z.jpeg`
- Яндекс «Жазлар ораый»: `.playwright-mcp/page-2026-10-27T11-58-10-097Z.jpeg`

## Автоматические проверки
-48/48 Node tests: точный контент/ссылки/ARIA/SHA256, map-provider sync/fallback, filters/menu/dialog/theme, fonts/reveal/AA. Это статические/NodeVM-проверки, не browser-сценарии.
- build.mjs generation/idempotency/current, syntax build/script/theme-init, HTML nesting/IDs/anchors/resources/labels/palette, Second Brain integrity и git diff --check проходят.
- Дополнительный sRGB alpha-расчет: light marker14.18:1, muted/hover-surface6.07:1, primary-hover11.54:1; dark marker7.85:1, muted/hover-surface6.69:1, primary-hover8.12:1. Это выбранные пары, не полная browser-AA сертификация.

## Матрица страницы сайта — НЕ выполнена
Предыдущий инструмент явно отклонил локальный file:// доступ с запретом обхода. localhost/другой браузер/новый MCP не использовались для обхода. Новый Playwright доступен, перезапуск больше не нужен. У владельца запрошен публичный HTTP(S)-адрес именно этого Stanford; на вопрос «какой сайт» дано пояснение, адрес пока не предоставлен. Production URL в content не настроен.

| Ширина | Светлая | Темная | Еще2цикла критики/исправлений |
|---|---|---|---|
|375px|Не выполнено|Не выполнено|Не выполнено|
|768px|Не выполнено|Не выполнено|Не выполнено|
|1440px|Не выполнено|Не выполнено|Не выполнено|

На разрешенном стенде проверить sticky/anchors, firstscreen, контраст и200%текст, pair alignment/filters/last row, FAQ, menu keyboard, dialog/focus/scroll,3филиала×2провайдера, console/network/no-JS/reduced-motion. Не считать эту приемку завершенной по6скриншотам публичных карт или source-review.
