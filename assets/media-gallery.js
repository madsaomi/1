// Native horizontal scrolling remains usable without JavaScript. Videos never autoplay.
(() => {
  if (typeof document === 'undefined') return;
  const galleries = [];
  const pause = container => container.querySelectorAll('video').forEach(video => {
    try { video.pause(); } catch { /* An unavailable decoder must not break the gallery. */ }
  });
  const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('[data-media-gallery]').forEach((gallery, galleryIndex) => {
    const track = gallery.querySelector('[data-gallery-track]');
    if (!track) return;
    const slides = [...track.querySelectorAll('[data-gallery-slide]')];
    if (!slides.length) return;
    const controls = gallery.querySelector('[data-gallery-controls]');
    const previous = gallery.querySelector('[data-gallery-prev]');
    const next = gallery.querySelector('[data-gallery-next]');
    const status = gallery.querySelector('[data-gallery-status]');
    let current = 0;
    let scrolling = false;
    let requested = null;
    const left = index => slides[index].offsetLeft - slides[0].offsetLeft;
    const activate = index => {
      current = index;
      slides.forEach((slide, position) => {
        const active = position === current;
        if (!active) pause(slide);
        slide.inert = !active;
        slide.setAttribute('aria-hidden', String(!active));
      });
      if (status) status.textContent = `${current + 1} / ${slides.length}`;
    };
    const go = index => {
      const target = (index + slides.length) % slides.length;
      requested = target;
      activate(target);
      track.scrollTo({ left: left(target), behavior: reduceMotion() ? 'auto' : 'smooth' });
    };
    if (!track.id) track.id = `media-gallery-track-${galleryIndex + 1}`;
    for (const button of [previous, next]) button?.setAttribute('aria-controls', track.id);
    if (controls) controls.hidden = slides.length < 2;
    previous?.addEventListener('click', () => go(current - 1));
    next?.addEventListener('click', () => go(current + 1));
    track.addEventListener('keydown', event => {
      // Arrow keys inside native video controls keep their volume/seek behaviour.
      if (event.target !== track || event.altKey || event.ctrlKey || event.metaKey || slides.length < 2) return;
      const destination = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: slides.length - 1 };
      if (!Object.hasOwn(destination, event.key)) return;
      event.preventDefault();
      go(destination[event.key]);
    });
    const syncScroll = () => {
      scrolling = false;
      if (requested !== null) {
        if (Math.abs(left(requested) - track.scrollLeft) <= 2) requested = null;
        else return;
      }
      let closest = 0;
      slides.forEach((slide, index) => {
        if (Math.abs(left(index) - track.scrollLeft) < Math.abs(left(closest) - track.scrollLeft)) closest = index;
      });
      if (closest !== current) activate(closest);
    };
    track.addEventListener('scroll', () => {
      if (scrolling) return;
      scrolling = true;
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(syncScroll);
      else syncScroll();
    }, { passive: true });
    for (const name of ['pointerdown', 'touchstart', 'wheel']) {
      track.addEventListener(name, () => { requested = null; }, { passive: true });
    }
    track.addEventListener('scrollend', () => { requested = null; syncScroll(); });
    gallery.querySelectorAll('video').forEach(video => {
      video.addEventListener('play', () => {
        if (video.closest('[hidden], [inert], [aria-hidden="true"]')) {
          try { video.pause(); } catch { /* No supported decoder. */ }
          return;
        }
        document.querySelectorAll('[data-media-gallery] video').forEach(other => {
          if (other !== video) try { other.pause(); } catch { /* No supported decoder. */ }
        });
      });
    });
    galleries.push(gallery);
    activate(0);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) galleries.forEach(pause);
  });
  if (galleries.length && typeof IntersectionObserver === 'function') {
    try {
      const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (!entry.isIntersecting) pause(entry.target);
      }));
      galleries.forEach(gallery => observer.observe(gallery));
    } catch { /* Controls and page-visibility pausing work without intersection observers. */ }
  }
})();
