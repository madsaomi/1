# 📐 План реализации: PLAN-036 — site.url и SEO (canonical/og)

> **Статус:** 🔵 IN_PROGRESS
> **Дата создания:** 2026-10-31
> **Автор / Агент:** ZCode (GLM)

---

## 1. 🎯 Цель
Production-домен подтвержден владельцем: **https://1-production-8f16.up.railway.app** (владелец ответил «да» на вписывание). Включить canonical/og:url/og:image по документированному процессу README («Когда известен production-домен, заполнить site.url…»).

## 2. 🔍 Затронутые файлы
- `[MODIFY]` `content.js` — site.url (ЗАЩИЩЕННЫЙ файл; изменение одобрено владельцем явно). og:image = assets/stanford-logo.png — это официальный логотип брендбука, менять не нужно.
- `[MODIFY]` `index.html` — SEO-блок заполнен вручную ТОЧНО по логике generate() (node локально недоступен; CI build --check проверит посимвольно):
  canonical + og:url = домен; og:image = {домен}/assets/stanford-logo.png (new URL с завершающим слэшем).
- `[MODIFY]` `agents/testing/plan_030_baseline.json` — protected SHA256 content.js обновлен (LF-нормализованный хэш нового файла; test допускает EOL-варианты), index перегенерирован (text не изменится — meta не дают текста), само-проверка репликации обязательна.
- JS/стили/Docker-файлы — не трогаются.

## 3. 📝 Шаги
- [ ] Шаг 1: План.
- [ ] Шаг 2: content.js site.url + SEO-блок index.html.
- [ ] Шаг 3: Baseline (protected hash content.js + index) с само-проверкой.
- [ ] Шаг 4: validate_html.py, commit, push, CI-статус, проверка живого canonical/og после деплоя.
- [ ] Шаг 5: Память (STATUS/active_task/история).

## 4. 🛡️ Риски и откат
- Риск: SEO-блок не совпадет с generate() → CI build --check упадет с «stale». Митигация: блок выведен из исходника build.mjs дословно; при падении — сверка diff.
- Риск: защищенный хэш. Митигация: обновление baseline задокументировано как владелец-одобренное изменение; EOL-варианты теста учтены.
- Откат: git revert двух файлов + baseline из git.

## 5. 🧪 Критерии
- CI success; на живом сайте в <head> появляются canonical/og:url/og:image; Telegram/соцсети получат логотип брендбука.
