# Карта кодовой базы — Stanford Language Center

Последнее обновление: 2026-10-31, ZCode, PLAN-033.

## Архитектура
Статический HTML/CSS/Vanilla JS. `content.js` → `node build.mjs` → готовые курсы/цены/контакты в `index.html`. `script.js` фильтрует HTML, а не создает основное содержание. API/БД и автоматической доставки заявок нет: владелец выбрал прямую связь.

| Файл | Ответственность | Проверка |
|---|---|---|
| index.html | Hero с учебным визуалом, отдельная навигация направлений, каталог, прайс, FAQ, контакты, dialog | tests/validate_html.py |
| content.js | Программы со стабильными ID, контакты, три локации с maps/coordinates[lon,lat]/googleEmbed | node build.mjs --check |
| build.mjs | Генерация HTML, валидация ID/цен/URL/координат/Google embed;3колонки прайса, LOCATIONS с одним iframe и2провайдерами | node --test |
| script.js | Фильтры, меню с focusout, тема, dialog; переходы, согласование адреса/Google/Яндекс и mobile-переход к карте | node --check, Node VM |
| theme-init.js | Тема перед загрузкой CSS, fallback при отказе storage | node --test |
| style.css | Mobile-first Inter/tokens/type/spacing8/1200px/SVG/reveal, светлая/темная темы; карта без визуальных фильтров | Contrast/HTML/palette, browser-приемка отдельно |
| tests/site.test.mjs | 39 тестов генерации, контактов/карт/CSP/HR, Google URL, координат, фильтров, якорей, цен, dialog, меню, филиала/провайдера и root COPY/default-deny context | node --test |
| tests/design-system.test.mjs | 10 проверок контента/SHA256/ARIA/AA/fonts/SVG/reveal; baseline PLAN-030, только EOL-эквивалентность и точный PLAN-032 context fix | node --test |
| tests/validate_html.py | Вложенность HTML, ID, ссылки, ресурсы, палитра | python tests/validate_html.py |
| Caddyfile, Dockerfile, railway.json | Статическая раздача, CSP, кэш, healthcheck и контейнер | CI docker build |
| robots.txt | Разрешение обхода | Проверка деплоя |
| package.json, .github/workflows/integrity.yml | Проверки приложения и Second Brain, сборка Docker | npm run check |
| assets/ | Исходные изображения; english.jpg — натюрморт hero, CSS grayscale/multiply поверх фирменного желтого; favicon.svg — фавикон по брендбуку (плашка #FFB703 + знак S #070707), stanford-icon.svg — знак в шапке | Проверка путей |
| assets/fonts/ | Локальные Inter Latin/Cyrillic WOFF2, OFL и provenance; не npm-зависимость | WOFF2/name/fvar/cmap, test |
| agents/, brain.py | Память проекта | python brain.py check |

## Удалено и отключено
Расписание, квиз, отзывы, сравнение, floating island, фиктивные биографии/карта/адреса/телефоны, частичная локализация, карусель и копирование заявки. Вместо заглушек опубликованы подтвержденные владельцем контакты (verified=true) и реальные карты филиалов. Данные посетителей не запрашиваются.

## Границы готовности
Актуально PLAN-033: фирменный чёрный владельца #070707 применен через токены style.css (--ink, --button-ink, --focus, --dark-panel в светлой теме; --paper в темной), нейтральные серые не тронуты. Добавлен assets/favicon.svg по стр. 11 брендбука (жёлтая плашка + чёрный S), link rel=icon переключен, знак в шапке stanford-icon.svg не менялся — он побайтово совпадает с Icon.svg из папки бренда. Полный лого (Logo final.svg) не подключался: текст в нем зависит от MinionPro и развалится без шрифта; шапка воспроизводит лого-блок живым текстом. Контраст измененных пар посчитан вручную — минимум 6.51:1, все ≥4.5:1; python validate_html.py PASS. Node в среде сессии недоступен: npm run check/49 тестов/build --check здесь НЕ запускались, требуется прогон в среде с Node 22+. Шрифты брендбука Minion Pro/Proxima Nova не внедрялись (коммерческие, нужен лицензионный файл) — вопрос открыт у владельца.
Повтор PLAN-032: push origin/main успешен, remote0ac979ab26ccf8d398e4257a61145083ef99139e независимо подтвержден ls-remote. Оба проверенных коммита доставлены, runtime не менялся. Описанный ниже DNS-блок относится к предыдущей попытке. CI/Railway и визуальная приемка остаются отдельными проверками.
Актуально PLAN-032:49/49проверок проходят на чистом Git index export с LF. .dockerignore разрешает2файла существующего COPY; Dockerfile/Caddyfile/Railway не изменялись в этом проходе. Git ignores локальные browser/Python артефакты, не удаляя их. Baseline content/config неизменен; protected-test разрешает только LF/CRLF эквивалентность и2документированных context-additions. Push разрешен владельцем, но DNS GitHub недоступен в обоих режимах Git и connector Unknown tool. Не заявлять отправку/CI/деплой без remote-подтверждения; runtime browser/Docker приемка остается открытой.
Актуально PLAN-031: только presentation HTML/CSS/build; script.js/theme-init.js не менялись. Статус фильтра sr-only, карточки flex-column с одинаковыми min-height title/description на2колонках, skills16+декоративные SVG, footerauto. Ритм секций64/96, opaque шапка и offset anchors включая .map-status/#discounts, marker hero, карточки практики и ограниченный прайс.48тестов сохраняют исходный baseline контента/configs и AA. Все6публичных Google/Яндекс embed просмотрены через Playwright, сетевые DNS-сбои были временными. Это не проверка страницы сайта, ее CSP и переключения провайдеров. Реальная375/768/1440 light/dark матрица остается открытой по прежнему ограничению localfile; обход через localhost/новый MCP не выполнялся. Последующие записи — история прежних планов.
Актуально PLAN-030: оформление заменено единой продуктовой дизайн-системой. Изменения build.mjs только для SVG; script.js — только отображение SVG и независимый IO, прежние сценарии проходят. Hashes и текст сравниваются с baseline начала плана. Текущие типовые text/background-пары удовлетворяют AA, это не полная browser-аудит-сертификация. Playwright зарегистрирован в пользовательском config, не добавлен как зависимость сайта; его tools еще не появились. Реальная визуальная матрица остается открытой, прежний отказ localfile не обходить.
Актуально PLAN-029: один цветной iframe может загружать Google (default) или Яндекс; sidebar адресов и карта в общей панели, на телефоне адреса прокручиваются горизонтально. Google embed получены из официального Share UI и проверяются по origin/path/pb. У Абдирова координатная карта, карточка Stanford в Google не утверждается. При отсутствии Google embed есть fallback/disabled, исходные внешние ссылки сохранены. Матовая прозрачность только у sticky-шапки; reduced transparency возвращает непрозрачность. Прайс —3семантические колонки. Визуальный рендер после изменений не подтвержден; записи прежних планов ниже описывают историю.
PLAN-028 заменяет прежний вариант «только внешние карты» одним lazy iframe https://yandex.ru/map-widget/v1/. CSP допускает только этот origin для frame-src, connect-src самой страницы остается none. Координаты проверены по источникам контактов; виджет запрашивает ресурсы третьей стороны. Для геометрии применены равные колонки hero, полноширинные контакты и общий ритм24/40px. Скриншоты владельца подтвердили прежние дефекты; локальный рендер новой версии не подтвержден.
Контакты и Нукус подтверждены; нужны production URL и данные команды. Полный почтовый адрес «Жазлар ораый» не установлен: указан подтвержденный ориентир «Центр молодёжи» и Google-карта. canonical/absolute OG генерируются только при настройке production URL. Визуальная/browser/CWV приемка и локальный Docker не подтверждены. Старые отчеты отражают историческое состояние.

PLAN-015: дублирующая quick-nav удалена; главный CTA ведет в каталог. Четыре цели, статические счетчики категорий, сброс с возвратом фокуса; dialog показывает содержание выбранной программы. Короткое открытие dialog отключается при reduced motion.

PLAN-016: стабильные якоря course-ID и ссылки из прайса, раскрытие карточки при переходе по hash, выход из dialog к каталогу с передачей фокуса. Прокрутка внутри discount-tooltip не закрывает панель.

PLAN-017 заменяет tooltip из PLAN-016 статическим details #discounts. Ссылки прайса раскрывают его с фокусом summary; спеццены генерируются из content.js. Старые записи выше отражают предыдущее состояние.

Актуально, PLAN-018: по замечанию пользователя отдельный details скидок удален. Каждая строка прайса показывает обычную и специальную цену с подписью условий. Короткая заметка #discounts видна над таблицей; JS для скидок не нужен.

Актуально PLAN-019: композиция заменена на информационный сайт учебного центра. Каталог сразу после hero; hero содержит текстовые направления и стандартную цену «от», генерируемые renderHero. Декоративные иллюстрации/плашки/бейджи, study-path, benefits-grid и дубли контактов удалены. Текстовые программы, условия обучения, практика, экзамены, открытый прайс, FAQ, один контактный раздел. CSS переписан без карточного декора. Старые записи выше исторические.

Актуально PLAN-022/023: мягкие поверхности каталога и шапки, группировка условий обучения. Карточки показывают skills без details; CTA открывает dialog, fallback — #prices. У dialog постоянная верхняя панель и отдельная .modal-body; обновление программы/открытие сбрасывает ее scrollTop. updateCourseSummary показывает обе цены и условие specialPrice; revealExam открывает details нужной панели IELTS/SAT и передает фокус при выходе из dialog. Ни прием заявок, ни неподтвержденные контакты не добавлялись.

PLAN-025: contacts.phones/telegrams — массивы; hrTelegram/instagram отдельно. contacts.locations хранит id/name/address/maps(provider,url), рендерится в LOCATIONS; renderContacts({compact:true}) для dialog выводит только связь по обучению. Все четыре исходные карты опубликованы по одному разу в main, без iframe. Источники — agents/product/contact_sources_2026-10-27.md.

PLAN-027: HERO-маркеры перенесены из правой колонки hero в отдельный nav.hero-programs под hero, генератор и data-goal сохранены. Hero использует локальную illustrative english.jpg без новых зависимостей. Основная сетка направлений 4/2/1, один контрастный блок .about-layout со scoped нейтральными токенами; обе темы и reduced motion сохранены. Механика JS не менялась.

PLAN-039 (2026-11-04): встроенная карта — только Google Maps embed (Яндекс-виджет показывал рекламу, по просьбе владельца). `mapWidgetURL` и переключатель `.map-providers` удалены; кнопки «Показать на карте» есть только у филиалов с `googleEmbed`, `data-map-src` = Google embed; `updateBranchMap(location)` без провайдера. Ссылки «Яндекс Карты» в карточках филиалов остаются. CSP `frame-src https://yandex.ru` в Caddyfile теперь лишний, но Caddyfile защищен baseline — снимать отдельным решением. tests/site.test.mjs: 48 тестов.

PLAN-044 этап 1 (2026-11-06): content.js — канонический JSON (site.demoMode, stats, courses, teachers, results, contacts), будущий экспорт админки cms. build.mjs генерирует также BANNER/STATS/TEACHERS/RESULTS (renderDemoBanner/renderStats/renderTeachers/renderResults/initials) и заглушки фото филиалов только в демо-режиме. Тест «весь текст» проверяет статический каркас вне генерируемых блоков; content.js не защищен baseline. 51 тест.

PLAN-044/045 cms/ (Django 6.1.3 + Unfold 0.110.1, Postgres на сервере, SQLite локально): config/settings.py (fail-closed прод-настройки), config/sites.py (StanfordAdminSite + OTPLoginForm), config/middleware.py (noindex), content/models.py (Course/CourseSkill, Stat, Teacher, StudentResult, Contacts/Phone/AdmissionsTelegram, Location/MapLink, SiteSettings), content/admin.py (Unfold), команды import_content и enable_2fa, content/tests.py (13). Сайт: блок ROBOTS (noindex в демо-режиме). CI: job cms.

PLAN-046: cms без технических страниц (DEBUG только при DJANGO_TRACEBACKS=1; локальный режим — DJANGO_LOCAL=1); templates/errors/base.html + 400/403/403_csrf/404/500/lockout.html; APPEND_SLASH=False; 19 тестов cms.

PLAN-051 (2026-11-06): раздел тарифов удален — цены только в карточках курсов (`renderCourses`: цена, семейная цена, программа, «Записаться»); `renderHero` без цен; блоков PRICES/TARIFFS больше нет; `#prices` — якорь-псевдоним внутри `#courses`.

PLAN-052 (ветка experiment/gsap): `assets/vendor/gsap/` — GSAP 3.15.0 (gsap, ScrollTrigger, SplitText; README с sha512 и лицензией); `assets/gsap-effects.js` — эффекты поверх готовой страницы (только при `prefers-reduced-motion: no-preference`; наклон и магнит — только мышь), подключены после `script.js`.

PLAN-053 (2026-11-06): полоса направлений под первым экраном удалена — `renderHero` и блока HERO больше нет.
