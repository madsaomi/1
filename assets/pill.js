// Sliding highlight behind the chosen tab or filter: one pill glides to the pressed button instead of the colour
// jumping. Works for any group marked data-pill="<button selector>" whose active button has the class «active».
// Without JS (or before it loads) each active button keeps its own background, so nothing is lost.
(() => {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-pill]').forEach(group => {
    const buttons = [...group.querySelectorAll(group.dataset.pill || 'button')];
    if (buttons.length < 2) return;
    const pill = document.createElement('span');
    pill.className = 'pill-indicator is-instant';
    pill.setAttribute('aria-hidden', 'true');
    group.prepend(pill);
    group.classList.add('has-pill');
    let ready = false;
    let frame = 0;
    const place = () => {
      frame = 0;
      const active = buttons.find(button => button.classList.contains('active') && button.offsetParent !== null);
      pill.classList.toggle('is-empty', !active);
      if (!active) return;
      pill.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
      pill.style.width = `${active.offsetWidth}px`;
      pill.style.height = `${active.offsetHeight}px`;
      if (!ready) {
        // The first position is set without a glide; later changes animate.
        ready = true;
        requestAnimationFrame(() => pill.classList.remove('is-instant'));
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
    buttons.forEach(button => new MutationObserver(schedule).observe(button, { attributes: true, attributeFilter: ['class', 'hidden'] }));
    window.addEventListener('resize', schedule);
    document.fonts?.ready?.then(schedule);
    place();
  });
})();
