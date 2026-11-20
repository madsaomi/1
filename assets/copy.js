// «Copy» buttons next to the phones, Telegram and e-mail in the contacts: one click copies the value and the icon
// turns into a check for a moment. Shown only where the browser can copy; the links themselves work as before.
(() => {
  if (typeof document === 'undefined' || !navigator.clipboard?.writeText) return;
  const buttons = [...document.querySelectorAll('[data-copy]')];
  if (!buttons.length) return;
  const announce = document.createElement('span');
  announce.className = 'sr-only';
  announce.setAttribute('role', 'status');
  document.body.append(announce);
  buttons.forEach(button => {
    let timer = 0;
    button.hidden = false;
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
      } catch {
        return;
      }
      button.classList.add('is-copied');
      announce.textContent = 'Скопировано';
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.classList.remove('is-copied');
        announce.textContent = '';
      }, 1600);
    });
  });
})();
