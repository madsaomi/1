## Что изменено и зачем

## Как проверено
- [ ] `npm run check` (build --check, node --test, validate_html)
- [ ] Админка: `cd cms && DJANGO_LOCAL=1 python manage.py test content` (если менялась `cms/`)
- [ ] Браузер: 375 и 1280 px, обе темы, консоль без ошибок
- [ ] Нет секретов и токенов в коде
