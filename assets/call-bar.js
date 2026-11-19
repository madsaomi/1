// Phone bar «Позвонить / Telegram»: steps out of the way while the visitor scrolls down to read and comes back as
// soon as they scroll up, reach the end of the page or move the keyboard focus into it.
(() => {
  if (typeof document === 'undefined') return;
  const bar = document.querySelector('.call-bar');
  if (!bar) return;
  let last = window.scrollY;
  let waiting = false;
  const update = () => {
    waiting = false;
    const y = window.scrollY;
    const delta = y - last;
    if (Math.abs(delta) < 8) return;
    const atEnd = window.innerHeight + y >= document.documentElement.scrollHeight - 96;
    bar.classList.toggle('is-tucked', delta > 0 && y > 160 && !atEnd && !bar.contains(document.activeElement));
    last = y;
  };
  window.addEventListener('scroll', () => {
    if (waiting) return;
    waiting = true;
    requestAnimationFrame(update);
  }, { passive: true });
  bar.addEventListener('focusin', () => bar.classList.remove('is-tucked'));
})();
