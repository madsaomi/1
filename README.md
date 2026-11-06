# Stanford Language Center

Лендинг языкового центра в Нукусе: статический HTML, CSS и Vanilla JS. Раздает Caddy в Docker на Railway. Светлая и темная темы, фирменный желтый `#FFB703`. Правила работы над проектом — в [`CLAUDE.md`](CLAUDE.md).

## Как поменять курсы, цены и контакты
1. Отредактировать `content.js` (у каждой программы уникальный стабильный `id`).
2. Выполнить `node build.mjs` — он вставит готовый HTML в помеченные блоки `index.html`. Эти блоки руками не править.
3. Выполнить `npm run check`.

Позже это будет делать закрытая админка в `cms/` (см. [`cms/README.md`](cms/README.md)).

### Контакты и карты
- `contacts.phones` — международные номера; `contacts.telegrams` — ссылки `https://t.me/…`. `hrTelegram` и `instagram` отделены от записи.
- `locations` — филиалы: `id`, `name`, `address`, `maps` (Google/Яндекс), необязательные `coordinates: [долгота, широта]` и `googleEmbed` (только код из Google Maps → Share → Embed a map, параметр `pb` не править).
- Контакты публикуются только при `contacts.verified: true` — после подтверждения владельцем.

## SEO
`site.url` сейчас — технический адрес Railway; по нему строятся canonical, og:url и og:image. Когда будет свой домен — заменить `site.url` и пересобрать. Адреса и LocalBusiness не выдумывать.

## Локальный запуск
```sh
node build.mjs
python -m http.server 8080
```
Открыть http://localhost:8080. Нужны Node.js 22+ и Python 3.11+, npm-зависимостей нет. Заголовки безопасности Caddy (CSP) локальный сервер не воспроизводит.

## Проверки
```sh
npm run check
```
Синтаксис JS, актуальность сгенерированного HTML, тесты Node и проверка HTML/палитры. Эталон текста страницы — `tests/page_baseline.json`; после намеренных изменений текста или ссылок: `python tests/update_baseline.py`, затем `--write`. CI на GitHub дополнительно собирает Docker-образ и тестирует админку на Postgres.

## Деплой
```sh
docker build -t stanford-landing .
docker run -p 8080:8080 stanford-landing
```
Healthcheck: `/healthz`, порт по умолчанию 8080 (переменная `PORT`). Railway использует `railway.json`. CSP разрешает только собственные скрипты, стили и шрифты, а в iframe — только карты Google и Яндекса.

## Структура
- `index.html` — страница со сгенерированными блоками; `content.js` — данные; `build.mjs` — генерация и проверка данных.
- `script.js`, `theme-init.js`, `style.css` — поведение, ранняя настройка темы, стили.
- `assets/` — логотип, иконки, шрифт Inter (лицензия `assets/fonts/OFL.txt`).
- `tests/` — тесты и эталон текста страницы.
- `cms/` — закрытая админка (Django).

## Перед запуском рекламы
Домен, реальные преподаватели, результаты и фото вместо демо-блоков «Пример», проверка программ и цен, проверка HTTPS/CSP и скорости на боевом сайте.
