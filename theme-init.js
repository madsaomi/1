// Runs before styles to avoid flashing the wrong theme; storage is optional.
(() => {
  let choice;
  try { choice = localStorage.getItem('stanford-theme'); } catch { /* Private storage can be unavailable. */ }
  const dark = choice === 'dark' || (choice !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  // The first screen animates in only when the visitor allows motion; set before paint to avoid a flash.
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.dataset.motion = 'on';
})();
