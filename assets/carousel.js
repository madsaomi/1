// Sideways row of cards with arrows and dots (planned events). Without JS the row still scrolls by swipe or Shift+wheel.
(() => {
  if (typeof document === 'undefined') return;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('[data-carousel]').forEach(root => {
    const track = root.querySelector('[data-carousel-track]');
    const nav = root.querySelector('[data-carousel-nav]');
    const prev = root.querySelector('[data-carousel-prev]');
    const next = root.querySelector('[data-carousel-next]');
    const dotsBox = root.querySelector('[data-carousel-dots]');
    if (!track || !nav || !prev || !next || !dotsBox) return;
    const items = [...track.children];
    if (items.length < 2) return;
    const position = index => items[index].offsetLeft - items[0].offsetLeft;
    const go = index => track.scrollTo({ left: position(Math.max(0, Math.min(items.length - 1, index))), behavior: reduce ? 'auto' : 'smooth' });
    // Many slides: a «3 / 10» counter instead of a row of dots that is hard to hit with a finger.
    const counter = items.length > 6 ? document.createElement('span') : null;
    if (counter) {
      counter.className = 'carousel-count';
      counter.setAttribute('aria-live', 'polite');
      dotsBox.append(counter);
    }
    const dots = counter ? [] : items.map((item, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'carousel-dot';
      dot.setAttribute('aria-label', `${index + 1} / ${items.length}`);
      dot.addEventListener('click', () => go(index));
      dotsBox.append(dot);
      return dot;
    });
    const current = () => {
      let best = 0;
      items.forEach((item, index) => {
        if (Math.abs(position(index) - track.scrollLeft) < Math.abs(position(best) - track.scrollLeft)) best = index;
      });
      return best;
    };
    const update = () => {
      const end = track.scrollWidth - track.clientWidth;
      // Everything fits: no arrows or dots needed.
      nav.hidden = end <= 1;
      const atEnd = track.scrollLeft >= end - 1;
      const active = atEnd ? items.length - 1 : current();
      if (counter) counter.textContent = `${active + 1} / ${items.length}`;
      dots.forEach((dot, index) => {
        if (index === active) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
      prev.disabled = track.scrollLeft <= 1;
      next.disabled = atEnd;
    };
    prev.addEventListener('click', () => go(current() - 1));
    next.addEventListener('click', () => go(current() + 1));
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; update(); });
    };
    track.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    update();
  });
})();
