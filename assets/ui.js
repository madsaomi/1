// Reusable page effects (patterns after React Bits, rebuilt without React or any library).
// Every effect is decoration: the content is complete without this file, nothing runs forever on its own,
// and prefers-reduced-motion switches all of it off. Opt in from HTML with the data attributes below.
//   data-roll          rolling digits for a number (Counter)
//   data-loop          words that take turns in one place (Text Loop); runs two rounds, then rests
//   data-tilt          card that leans towards the pointer with a moving highlight (Profile Card)
//   data-scroll-band   rows of large text and logos that move only while the page scrolls (Scroll Velocity, Logo Loop)
//   data-swing         hanging badge that follows the pointer a little (Lanyard)
(() => {
  if (typeof document === 'undefined') return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const each = (selector, run) => document.querySelectorAll(selector).forEach(run);
  const whenVisible = (element, run) => {
    if (typeof IntersectionObserver === 'undefined') { run(); return; }
    try {
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        run();
      }, { threshold: .4 });
      observer.observe(element);
    } catch { run(); }
  };

  // Counter: each digit rolls up to its value once the number is on screen.
  each('[data-roll]', element => {
    const value = element.textContent.trim();
    if (reduced.matches || !/\d/.test(value)) return;
    element.setAttribute('aria-label', value);
    element.textContent = '';
    element.classList.add('roll');
    const strips = [];
    for (const char of value) {
      const cell = document.createElement('span');
      cell.setAttribute('aria-hidden', 'true');
      if (/\d/.test(char)) {
        cell.className = 'roll-digit';
        const strip = document.createElement('span');
        strip.className = 'roll-strip';
        for (let digit = 0; digit <= Number(char); digit++) {
          const row = document.createElement('span');
          row.textContent = String(digit);
          strip.append(row);
        }
        cell.append(strip);
        strips.push([strip, Number(char)]);
      } else {
        cell.textContent = char;
      }
      element.append(cell);
    }
    whenVisible(element, () => requestAnimationFrame(() => strips.forEach(([strip, digit], index) => {
      strip.style.transitionDelay = `${index * 90}ms`;
      strip.style.transform = `translateY(-${digit * 1.1}em)`;
    })));
  });

  // Text Loop: one word at a time; pauses under the pointer and stops after two rounds on the first word.
  each('[data-loop]', element => {
    const items = [...element.children];
    if (reduced.matches || items.length < 2) return;
    let index = 0;
    let steps = items.length * 2;
    let paused = false;
    element.addEventListener('pointerenter', () => { paused = true; });
    element.addEventListener('pointerleave', () => { paused = false; });
    const timer = setInterval(() => {
      if (paused || document.hidden) return;
      const current = items[index];
      index = (index + 1) % items.length;
      current.classList.remove('is-active');
      current.classList.add('is-leaving');
      items[index].classList.remove('is-leaving');
      items[index].classList.add('is-active');
      setTimeout(() => current.classList.remove('is-leaving'), 500);
      if (--steps <= 0) clearInterval(timer);
    }, 2200);
  });

  // Profile Card: lean towards the pointer and move the highlight; touch screens keep the flat card.
  each('[data-tilt]', card => {
    if (reduced.matches || !fine.matches) return;
    card.addEventListener('pointermove', event => {
      const box = card.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      card.style.setProperty('--ry', `${((x - .5) * 10).toFixed(2)}deg`);
      card.style.setProperty('--rx', `${((.5 - y) * 8).toFixed(2)}deg`);
      card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      card.classList.add('is-tilting');
    });
    card.addEventListener('pointerleave', () => {
      card.classList.remove('is-tilting');
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  });

  // Scroll Velocity / Logo Loop: rows shift with the scroll position, neighbours in opposite directions.
  const bands = [...document.querySelectorAll('[data-scroll-band]')];
  if (bands.length && !reduced.matches) {
    let queued = false;
    const update = () => {
      queued = false;
      for (const band of bands) {
        band.querySelectorAll('.scroll-track').forEach((track, row) => {
          const half = track.scrollWidth / 2;
          if (!half) return;
          const travelled = (window.scrollY * (row % 2 ? .45 : .6)) % half;
          track.style.setProperty('--shift', `${-(row % 2 ? half - travelled : travelled).toFixed(1)}px`);
        });
      }
    };
    const request = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    update();
  }

  // Lanyard: the badge leans after the pointer while it is over the block.
  each('[data-swing]', badge => {
    const area = badge.parentElement;
    if (reduced.matches || !fine.matches || !area) return;
    area.addEventListener('pointermove', event => {
      const box = area.getBoundingClientRect();
      badge.style.setProperty('--swing', `${(((event.clientX - box.left) / box.width - .5) * -10).toFixed(2)}deg`);
    });
    area.addEventListener('pointerleave', () => badge.style.setProperty('--swing', '0deg'));
  });
})();
