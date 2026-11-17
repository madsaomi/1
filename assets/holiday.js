// Holiday decoration: shows the greeting whose dates include today (Nukus time) and marks <html> so CSS
// can add the garland, the hat on the logo and snow. Purely decorative: the page works the same without it.
(() => {
  if (typeof document === 'undefined') return;
  const banners = [...document.querySelectorAll('[data-holiday]')];
  if (!banners.length) return;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', month: '2-digit', day: '2-digit' })
    .format(new Date()).replace('/', '-');
  const inRange = (from, to) => (from <= to ? today >= from && today <= to : today >= from || today <= to);
  const banner = banners.find(item => item.dataset.holidayForced === 'true')
    || banners.find(item => inRange(item.dataset.from, item.dataset.to));
  if (!banner) return;
  const name = banner.dataset.holiday;
  const year = new Date().getFullYear();
  const key = `stanford-holiday-${name}-${today < '06-01' && name === 'newyear' ? year - 1 : year}`;
  document.documentElement.dataset.holidayActive = name;
  let closed = false;
  try { closed = localStorage.getItem(key) === 'closed'; } catch { /* Storage is optional. */ }
  if (!closed) banner.hidden = false;
  banner.querySelector('[data-holiday-close]')?.addEventListener('click', () => {
    banner.hidden = true;
    try { localStorage.setItem(key, 'closed'); } catch { /* Hidden for this visit only. */ }
  });
  if (name === 'newyear') {
    const snow = document.createElement('div');
    snow.className = 'holiday-snow';
    snow.setAttribute('aria-hidden', 'true');
    document.body.append(snow);
  }
})();
