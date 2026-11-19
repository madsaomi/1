// Home rows of teachers and student results drift slowly sideways in an endless loop (owner's choice).
// The row stops under the mouse, while a finger or the keyboard is on it, after an arrow press, when the row is off
// screen or the tab is hidden, and for good with the pause button. With reduced motion nothing moves: the row stays
// an ordinary swipeable carousel. Without JavaScript the cards are a plain row as well.
(() => {
  if (typeof document === 'undefined' || typeof matchMedia !== 'function') return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const SPEED = 28; // pixels per second
  document.querySelectorAll('[data-marquee]').forEach(root => {
    const track = root.querySelector('[data-carousel-track]');
    const toggle = root.querySelector('[data-marquee-toggle]');
    if (!track) return;
    const items = [...track.children];
    if (items.length < 2 || track.scrollWidth <= track.clientWidth + 1) return;
    // A second copy of the cards makes the loop seamless; screen readers and the keyboard never reach it.
    for (const item of items) {
      const copy = item.cloneNode(true);
      copy.removeAttribute('id');
      copy.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
      copy.setAttribute('aria-hidden', 'true');
      copy.inert = true;
      copy.classList.add('is-marquee-copy');
      track.append(copy);
    }
    root.classList.add('is-marquee');
    let stopped = false;
    let hovering = false;
    let focused = false;
    let resting = 0;
    let visible = true;
    let offset = track.scrollLeft;
    let last = 0;
    const rest = () => { resting = performance.now() + 2500; };
    const span = () => track.children[items.length].offsetLeft - items[0].offsetLeft;
    const moving = time => !stopped && !hovering && !focused && time > resting && visible && !document.hidden;
    const step = time => {
      const elapsed = last ? Math.min(64, time - last) : 0;
      last = time;
      if (moving(time)) {
        offset += SPEED * elapsed / 1000;
        const length = span();
        if (length > 0 && offset >= length) offset -= length;
        track.scrollLeft = offset;
      } else {
        // A swipe or an arrow moved the row: continue from where the visitor left it.
        offset = track.scrollLeft;
      }
      requestAnimationFrame(step);
    };
    track.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') hovering = true; });
    track.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') hovering = false; });
    track.addEventListener('pointerdown', rest);
    track.addEventListener('pointerup', rest);
    track.addEventListener('wheel', rest, { passive: true });
    track.addEventListener('focusin', () => { focused = true; });
    track.addEventListener('focusout', event => { focused = track.contains(event.relatedTarget); });
    root.querySelectorAll('[data-carousel-prev], [data-carousel-next]').forEach(button => button.addEventListener('click', rest));
    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); }).observe(track);
    }
    if (toggle) {
      const playing = toggle.querySelector('[data-marquee-playing]');
      const paused = toggle.querySelector('[data-marquee-paused]');
      toggle.hidden = false;
      toggle.addEventListener('click', () => {
        stopped = !stopped;
        toggle.setAttribute('aria-pressed', String(stopped));
        if (playing) playing.hidden = stopped;
        if (paused) paused.hidden = !stopped;
      });
    }
    requestAnimationFrame(step);
  });
})();
