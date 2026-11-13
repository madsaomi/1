// One preference for both directories; static HTML remains fully readable without this enhancement.
(() => {
  if (typeof document === 'undefined') return;
  const page = document.body;
  const controls = document.querySelector('[data-directory-view-controls]');
  if (!page?.classList.contains('directory-page') || !controls) return;
  if (!document.querySelectorAll('[data-course-flip]').length) return;
  const buttons = [...controls.querySelectorAll('[data-directory-mode]')];
  const valid = mode => mode === 'cards' || mode === 'normal';
  if (!['cards', 'normal'].every(mode => buttons.some(button => button.dataset.directoryMode === mode))) return;
  const setMode = mode => {
    page.dataset.directoryView = mode;
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.directoryMode === mode)));
    document.dispatchEvent(new CustomEvent('directory-view-change', { detail: { mode } }));
  };
  let saved;
  try { saved = localStorage.getItem('stanford-directory-view'); } catch { /* Preference is optional. */ }
  setMode(valid(saved) ? saved : 'cards');
  buttons.forEach(button => button.addEventListener('click', () => {
    const mode = button.dataset.directoryMode;
    if (!valid(mode)) return;
    setMode(mode);
    try { localStorage.setItem('stanford-directory-view', mode); } catch { /* Use the mode for this visit. */ }
  }));
  controls.hidden = false;
})();
