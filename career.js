// Career form: theme, client-side photo compression, strict validation
// and one PDF resume delivered to the HR service.
(() => {
  document.documentElement.dataset.enhanced = 'true';

  const button = document.querySelector('#theme-toggle');
  const setTheme = dark => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    if (button) {
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
    }
  };
  let choice;
  try { choice = localStorage.getItem('stanford-theme'); } catch { /* Storage is optional. */ }
  if (!['light', 'dark'].includes(choice)) choice = null;
  setTheme(choice ? choice === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  button?.addEventListener('click', () => {
    choice = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(choice === 'dark');
    try { localStorage.setItem('stanford-theme', choice); } catch { /* Keep the session choice. */ }
  });

  const form = document.querySelector('#career-form');
  const result = document.querySelector('#career-result');
  const status = document.querySelector('#career-status');
  const submit = document.querySelector('#career-submit');
  const about = document.querySelector('#cf-about');
  const aboutCount = document.querySelector('#about-count');
  const photoInput = document.querySelector('#cf-photo');
  const photoImage = document.querySelector('#photo-image');
  const photoEmpty = document.querySelector('#photo-empty');
  const photoRemove = document.querySelector('#photo-remove');
  const endpointMeta = document.querySelector('meta[name="career-endpoint"]');
  if (!form || !result) return;

  let photoData = '';
  let sending = false;

  const value = name => {
    const field = form.elements[name];
    return field ? String(field.value || '').trim() : '';
  };

  const setStatus = (text, kind = '') => {
    if (!status) return;
    status.textContent = text;
    status.dataset.kind = kind;
  };

  const clearPhoto = () => {
    photoData = '';
    if (photoImage) {
      photoImage.removeAttribute('src');
      photoImage.hidden = true;
    }
    if (photoEmpty) photoEmpty.hidden = false;
    if (photoRemove) photoRemove.hidden = true;
    if (photoInput) {
      photoInput.value = '';
      photoInput.setCustomValidity('');
    }
  };

  // Canvas re-encode: caps the longest side and strips EXIF before the file leaves the browser.
  const compressPhoto = file => new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      reject(new Error('type'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error('size'));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const max = 800;
      const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(200, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(200, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) { reject(new Error('image')); return; }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.75;
      let data = canvas.toDataURL('image/jpeg', quality);
      while (data.length > 250 * 1024 && quality > 0.4) {
        quality -= 0.08;
        data = canvas.toDataURL('image/jpeg', quality);
      }
      if (data.length < 100 || data.length > 350 * 1024) {
        reject(new Error('image'));
        return;
      }
      resolve(data);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image'));
    };
    image.src = url;
  });

  photoInput?.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    if (!file) { clearPhoto(); return; }
    setStatus('Обрабатываем фото…');
    try {
      photoData = await compressPhoto(file);
      if (photoImage) {
        photoImage.src = photoData;
        photoImage.hidden = false;
      }
      if (photoEmpty) photoEmpty.hidden = true;
      if (photoRemove) photoRemove.hidden = false;
      photoInput.setCustomValidity('');
      setStatus('');
    } catch (error) {
      clearPhoto();
      photoInput.setCustomValidity('Не удалось прочитать фото. Выберите JPG, PNG или WebP до 10 МБ.');
      photoInput.reportValidity();
      setStatus('Не удалось обработать фото. Выберите другое.', 'error');
    }
  });
  photoRemove?.addEventListener('click', clearPhoto);

  const wordLimits = { name: 6, education: 12, certificates: 12, about: 60 };
  form.elements.phone?.addEventListener('paste', event => {
    event.preventDefault();
    let digits = (event.clipboardData?.getData('text') || '').replace(/\D/g, '');
    if (digits.length > 9 && digits.startsWith('998')) digits = digits.slice(3);
    form.elements.phone.value = digits.slice(0, 9);
    validateField(form.elements.phone);
  });
  const validateField = field => {
    const text = field.value.trim();
    let message = '';
    if (wordLimits[field.name]) {
      if (text && !/\p{L}/u.test(text)) message = 'Введите текст, а не только цифры.';
      if (text.split(/\s+/u).filter(Boolean).length > wordLimits[field.name]) message = `Максимум ${wordLimits[field.name]} слов.`;
    }
    if (field.name === 'phone' && text && !/^\d{9}$/.test(text)) message = 'Введите номер +998 и 9 цифр.';
    if (field.name === 'telegram' && text && !/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(text)) message = 'Введите @username: 5–32 символа, первая — буква.';
    field.setCustomValidity(message);
  };
  ['name', 'phone', 'telegram', 'education', 'certificates', 'about'].forEach(name => {
    const field = form.elements[name];
    field?.addEventListener('input', () => {
      if (name === 'name') field.value = field.value.replace(/[^\p{L}\s'’.\-]/gu, '');
      if (name === 'phone') {
        let digits = field.value.replace(/\D/g, '');
        if (digits.length > 9 && digits.startsWith('998')) digits = digits.slice(3);
        field.value = digits.slice(0, 9);
      }
      if (name === 'telegram') field.value = field.value.replace(/[^A-Za-z0-9_@]/g, '').replace(/(?!^)@/g, '');
      validateField(field);
    });
  });

  about?.addEventListener('input', () => {
    if (aboutCount) aboutCount.textContent = String(about.value.length);
  });

  const showResult = () => {
    document.querySelector('.career-head')?.setAttribute('hidden', '');
    form.hidden = true;
    result.hidden = false;
    result.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    document.querySelector('#career-success-title')?.focus();
  };

  const payload = () => ({
    name: value('name'),
    phone: '+998' + value('phone'),
    telegram: value('telegram'),
    position: value('position'),
    experience: value('experience'),
    level: value('level'),
    education: value('education'),
    certificates: value('certificates'),
    about: value('about'),
    consent: form.elements.consent?.checked === true,
    company: value('company'),
    photo: photoData
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;
    if (!photoData) {
      photoInput?.setCustomValidity('Добавьте фото — это обязательное поле.');
      photoInput?.reportValidity();
      setStatus('Добавьте фото.', 'error');
      return;
    }
    ['name', 'phone', 'telegram', 'education', 'certificates', 'about'].forEach(name => validateField(form.elements[name]));
    if (!form.reportValidity()) return;
    sending = true;
    submit?.setAttribute('disabled', '');
    const label = submit?.innerHTML || '';
    if (submit) submit.textContent = 'Отправляем…';
    setStatus('Отправляем анкету…');
    try {
      const endpoint = (endpointMeta?.content || '/career').trim();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Career-Request': '1' },
        body: JSON.stringify(payload()),
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) {
        const code = response.status;
        if (code === 429) throw new Error('rate');
        if (code === 413) throw new Error('size');
        if (code === 503) throw new Error('unavailable');
        if (code === 400) throw new Error('validation');
        throw new Error('delivery');
      }
      setStatus('');
      showResult();
    } catch (error) {
      const message = {
        rate: 'Слишком много попыток. Попробуйте позже.',
        size: 'Фото слишком большое. Выберите другое.',
        validation: 'Проверьте поля анкеты и попробуйте ещё раз.',
        unavailable: 'Отправка временно недоступна. Попробуйте позже.',
        delivery: 'Не удалось отправить анкету. Попробуйте позже.'
      }[error.message] || 'Не удалось отправить анкету. Проверьте интернет и попробуйте снова.';
      setStatus(message, 'error');
    } finally {
      sending = false;
      submit?.removeAttribute('disabled');
      if (submit) submit.innerHTML = label;
    }
  });
})();
