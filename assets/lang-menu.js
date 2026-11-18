// Language switch with flags. A native <select> cannot show pictures in its list, so the select stays
// as the source of truth (script.js / language.js listen to it) and this menu only drives it.
(() => {
  if (typeof document === 'undefined') return;
  const select = document.querySelector('#lang-toggle');
  if (!select || select.dataset.langMenu) return;
  select.dataset.langMenu = 'ready';
  const names = { ru: 'Русский', uz: 'Oʻzbekcha', kaa: 'Qaraqalpaqsha', en: 'English' };
  const options = [...select.options].map(option => ({ value: option.value, code: option.textContent.trim() }));

  const root = document.createElement('div');
  root.className = 'lang-menu';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lang-menu-button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<span class="lang-flag" aria-hidden="true"></span><span class="lang-menu-code"></span><span class="sr-only">Язык сайта</span>'
    + '<svg class="icon lang-menu-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>';
  const list = document.createElement('ul');
  list.className = 'lang-menu-list';
  list.setAttribute('role', 'listbox');
  list.tabIndex = -1;
  list.hidden = true;
  list.id = 'lang-menu-list';
  button.setAttribute('aria-controls', list.id);
  const items = options.map(({ value, code }) => {
    const item = document.createElement('li');
    item.setAttribute('role', 'option');
    item.id = `lang-menu-${value}`;
    item.dataset.value = value;
    item.lang = value;
    item.innerHTML = `<span class="lang-flag" data-flag="${value}" aria-hidden="true"></span><span class="lang-menu-code">${code}</span><span class="lang-menu-name">${names[value] || ''}</span>`;
    list.append(item);
    return item;
  });
  root.append(button, list);
  select.after(root);
  select.classList.add('is-replaced');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  let active = 0;
  const sync = () => {
    const current = items.findIndex(item => item.dataset.value === select.value);
    const index = current < 0 ? 0 : current;
    button.querySelector('.lang-flag').dataset.flag = options[index].value;
    button.querySelector('.lang-menu-code').textContent = options[index].code;
    items.forEach((item, position) => item.setAttribute('aria-selected', String(position === index)));
  };
  const highlight = index => {
    active = (index + items.length) % items.length;
    items.forEach((item, position) => item.classList.toggle('is-active', position === active));
    list.setAttribute('aria-activedescendant', items[active].id);
  };
  const open = () => {
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    highlight(Math.max(0, items.findIndex(item => item.getAttribute('aria-selected') === 'true')));
    list.focus();
  };
  const close = (focusButton = true) => {
    if (list.hidden) return;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (focusButton) button.focus();
  };
  const choose = index => {
    const { value } = items[index].dataset;
    close();
    if (value === select.value) return;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    sync();
  };

  button.addEventListener('click', () => (list.hidden ? open() : close()));
  button.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(); }
  });
  list.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); highlight(active + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); highlight(active - 1); }
    else if (event.key === 'Home') { event.preventDefault(); highlight(0); }
    else if (event.key === 'End') { event.preventDefault(); highlight(items.length - 1); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); }
    else if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'Tab') close(false);
  });
  items.forEach((item, index) => {
    item.addEventListener('click', () => choose(index));
    item.addEventListener('mousemove', () => highlight(index));
  });
  document.addEventListener('click', event => { if (!root.contains(event.target)) close(false); });
  // The page scripts set the language without an event (saved choice, translated copies): follow <html lang>.
  if (typeof MutationObserver !== 'undefined') new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  select.addEventListener('change', sync);
  sync();
})();
