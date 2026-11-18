// 404 page: show the language switch, open in the language of the missing address and keep links in that language.
(() => {
  document.documentElement.dataset.enhanced = 'true';
  const fromPath = (location.pathname.match(/^\/(uz|kaa|en)(?:\/|$)/) || [])[1];
  if (fromPath) {
    // language.js starts with the saved choice; an address inside /uz/ or /kaa/ wins over it.
    try { localStorage.setItem('stanford-lang', fromPath); } catch { /* Without storage the page stays Russian. */ }
  }
  const update = () => {
    const select = document.querySelector('#lang-toggle');
    const folder = select && ['uz', 'kaa', 'en'].includes(select.value) ? `/${select.value}/` : '/';
    const home = document.querySelector('[data-error-home]');
    const courses = document.querySelector('[data-error-courses]');
    if (home) home.href = folder;
    if (courses) courses.href = `${folder}#courses`;
  };
  document.querySelector('#lang-toggle')?.addEventListener('change', update);
  // language.js runs after this file and sets the language synchronously.
  window.addEventListener('DOMContentLoaded', update);
})();
