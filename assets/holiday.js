// Holiday decoration: shows the greeting whose dates include today (Nukus time) and marks <html> so CSS
// can add the holiday's garland and the little picture on the logo; snow for the new year, falling petals for
// 8 March and Navruz (three rounds, then still). Purely decorative: the page works the same without it.
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
  const falling = { newyear: 'holiday-snow', march8: 'holiday-petals', navruz: 'holiday-petals' }[name];
  if (falling) {
    const layer = document.createElement('div');
    layer.className = falling;
    layer.setAttribute('aria-hidden', 'true');
    document.body.append(layer);
  }
})();
