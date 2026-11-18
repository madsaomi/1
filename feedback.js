// Complaints page: official (name, phone, consent) or anonymous (no personal data at all).
// The HR service checks everything again and sends the text to the complaints bot; nothing is stored.
(() => {
  const form = document.querySelector('#feedback-form');
  if (!form) return;
  const endpoint = (document.querySelector('meta[name="feedback-endpoint"]')?.content || '/feedback').trim();
  const contacts = form.querySelector('#fb-contacts');
  const note = form.querySelector('#fb-anonymous-note');
  const status = form.querySelector('#fb-status');
  const submit = form.querySelector('#fb-submit');
  const message = form.querySelector('#fb-message');
  const count = form.querySelector('#fb-count');
  const result = document.querySelector('#fb-result');
  const contactFields = [...contacts.querySelectorAll('input')];
  const kind = () => form.querySelector('input[name="kind"]:checked')?.value || 'official';

  const show = text => { status.textContent = text; };
  const markInvalid = (field, text) => {
    field?.setAttribute('aria-invalid', 'true');
    field?.focus();
    show(text);
  };

  const updateKind = () => {
    const anonymous = kind() === 'anonymous';
    contacts.hidden = anonymous;
    note.hidden = !anonymous;
    // Disabled fields are not sent and not validated: an anonymous complaint carries no contacts.
    contactFields.forEach(field => { field.disabled = anonymous; });
    show('');
  };
  form.querySelectorAll('input[name="kind"]').forEach(input => input.addEventListener('change', updateKind));
  const words = text => text.split(/\s+/u).filter(Boolean).length;
  const links = text => (text.match(/https?:\/\/|www\.|t\.me\//gi) || []).length;
  message.addEventListener('input', () => { count.textContent = String(words(message.value)); });
  // A Telegram username is Latin only: anything else is removed while typing.
  const telegram = form.elements.telegram;
  telegram.addEventListener('input', () => {
    telegram.value = telegram.value.replace(/[^A-Za-z0-9_@]/g, '').replace(/(?!^)@/g, '');
  });
  form.addEventListener('input', event => event.target.removeAttribute?.('aria-invalid'));
  const phone = form.querySelector('#fb-phone');
  phone.addEventListener('input', () => { phone.value = phone.value.replace(/\D/g, '').slice(0, 9); });

  const collect = () => {
    const body = {
      kind: kind(),
      topic: form.elements.topic.value,
      branch: form.elements.branch.value,
      message: message.value.trim(),
      company: form.elements.company.value
    };
    if (body.kind === 'official') {
      body.name = form.elements.name.value.trim();
      body.phone = `+998${form.elements.phone.value.trim()}`;
      if (form.elements.telegram.value.trim()) body.telegram = form.elements.telegram.value.trim();
      body.consent = form.elements.consent.checked;
    }
    return body;
  };

  const check = body => {
    if (!body.topic) return markInvalid(form.elements.topic, 'Выберите тему обращения.'), false;
    if (body.message.length < 20) return markInvalid(message, 'Опишите ситуацию подробнее: минимум 20 символов.'), false;
    if (words(body.message) > 250) return markInvalid(message, 'Слишком длинно: не больше 250 слов.'), false;
    if (links(body.message) > 2) return markInvalid(message, 'Не больше 2 ссылок в тексте.'), false;
    if (body.kind === 'official') {
      if (!/^[\p{L}\s'’.-]{2,60}$/u.test(body.name)) return markInvalid(form.elements.name, 'Укажите имя буквами.'), false;
      if (!/^\+998\d{9}$/.test(body.phone)) return markInvalid(form.elements.phone, 'Телефон: 9 цифр после +998.'), false;
      if (body.telegram && !/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(body.telegram)) return markInvalid(form.elements.telegram, 'Telegram: username от 5 до 32 символов.'), false;
      if (!body.consent) return markInvalid(form.elements.consent, 'Нужно согласие на обработку данных.'), false;
    }
    return true;
  };

  // Optional «not a robot» check (Cloudflare Turnstile); the token is single-use.
  const guard = form.querySelector('[data-turnstile]');
  const guardToken = () => (guard ? form.querySelector('[name="cf-turnstile-response"]')?.value || '' : '');
  const resetGuard = () => { try { if (guard && window.turnstile) window.turnstile.reset(guard); } catch { /* The next page load renders a new check. */ } };

  const errors = {
    captcha: 'Проверка «я не робот» не пройдена. Обновите страницу и попробуйте ещё раз.',
    captcha_unavailable: 'Проверка «я не робот» временно недоступна. Попробуйте через несколько минут.',
    rate_limited: 'Слишком много обращений подряд. Попробуйте через полчаса.',
    not_configured: 'Приём обращений пока не настроен. Позвоните в центр.',
    delivery_failed: 'Не получилось доставить обращение. Попробуйте ещё раз через несколько минут.',
    too_large: 'Текст слишком длинный.'
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const body = collect();
    if (!check(body)) return;
    if (guard) {
      body.turnstileToken = guardToken();
      if (!body.turnstileToken) return show('Подождите пару секунд: идёт проверка «я не робот».');
    }
    submit.disabled = true;
    show('Отправляем…');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-career-request': '1' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.ok) {
        form.hidden = true;
        result.querySelector('#fb-success-official').hidden = body.kind !== 'official';
        result.querySelector('#fb-success-anonymous').hidden = body.kind === 'official';
        result.hidden = false;
        result.querySelector('#fb-success-title').focus();
        return;
      }
      if (payload.error === 'validation') {
        const field = payload.field && form.elements[payload.field];
        markInvalid(field instanceof Element ? field : null, 'Проверьте поля формы.');
      } else {
        show(errors[payload.error] || 'Не получилось отправить. Попробуйте позже или позвоните в центр.');
      }
    } catch {
      show('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
    } finally {
      submit.disabled = false;
      resetGuard();
    }
  });
  updateKind();
})();
