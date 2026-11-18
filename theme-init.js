// Runs before styles to avoid flashing the wrong theme; storage is optional.
(() => {
  let choice;
  try { choice = localStorage.getItem('stanford-theme'); } catch { /* Private storage can be unavailable. */ }
  const dark = choice === 'dark' || (choice !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  // The first screen animates in only when the visitor allows motion; set before paint to avoid a flash.
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.dataset.motion = 'on';
  // A visitor who chose UZ, QQ or EN goes straight to the translated copy of this page (no Russian flash).
  try {
    const lang = localStorage.getItem('stanford-lang');
    const root = document.documentElement;
    if (['uz', 'kaa', 'en'].includes(lang) && !root.dataset.langPage && document.querySelector(`link[rel="alternate"][hreflang="${lang}"]`)) {
      const cut = location.pathname.lastIndexOf('/') + 1;
      location.replace(`${location.pathname.slice(0, cut)}${lang}/${location.pathname.slice(cut)}${location.search}${location.hash}`);
    }
  } catch { /* Without storage the page stays as it is. */ }
})();
