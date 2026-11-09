// Results page: theme switch and a phone carousel, no content editing logic.
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

  // Phones: the result cards rotate one by one; desktop keeps the full grid.
  const grid = document.querySelector('.results-grid-page');
  if (!grid) return;
  const items = [...grid.children];
  const phone = matchMedia('(max-width: 767px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let timer = null;
  let index = 0;
  let paused = false;
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  const advance = () => {
    if (!phone.matches || reduced.matches || paused || items.length < 2) return;
    index = (index + 1) % items.length;
    const item = items[index];
    const left = item.getBoundingClientRect().left - grid.getBoundingClientRect().left + grid.scrollLeft;
    grid.scrollTo({ left, behavior: 'smooth' });
  };
  const start = () => {
    stop();
    if (!phone.matches || reduced.matches || items.length < 2) return;
    timer = setInterval(advance, 4500);
  };
  grid.addEventListener('pointerdown', () => { paused = true; stop(); });
  grid.addEventListener('pointerup', () => { paused = false; });
  grid.addEventListener('focusin', () => { paused = true; stop(); });
  grid.addEventListener('focusout', () => { paused = false; start(); });
  phone.addEventListener('change', () => { index = 0; start(); });
  reduced.addEventListener('change', start);
  start();
})();
