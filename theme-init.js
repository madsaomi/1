// Runs before styles to avoid flashing the wrong theme; storage is optional.
(() => {
  let choice;
  try { choice = localStorage.getItem('stanford-theme'); } catch { /* Private storage can be unavailable. */ }
  const dark = choice === 'dark' || (choice !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
