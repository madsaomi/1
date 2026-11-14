// Progressive enhancement: both course faces stay readable when JavaScript is unavailable.
(() => {
  if (typeof document === 'undefined') return;
  const states = [];
  const directory = document.body?.classList?.contains('directory-page') === true;
  const showFace = (face, visible) => {
    face.inert = !visible;
    face.setAttribute('aria-hidden', String(!visible));
  };
  const close = (state, restoreFocus = false) => {
    state.open = false;
    state.card.classList.remove('is-flipped');
    state.trigger.setAttribute('aria-expanded', 'false');
    showFace(state.front, true);
    if (restoreFocus && !state.card.hidden) state.trigger.focus({ preventScroll: true });
    showFace(state.back, false);
  };
  const open = state => {
    if (state.card.hidden || !state.enabled) return;
    states.forEach(other => { if (other !== state && other.open) close(other); });
    state.open = true;
    showFace(state.back, true);
    state.card.classList.add('is-flipped');
    state.trigger.setAttribute('aria-expanded', 'true');
    // Move focus before making its former parent inert; only the visible side receives Tab.
    state.heading.focus({ preventScroll: true });
    showFace(state.front, false);
  };
  document.querySelectorAll('[data-course-flip]').forEach(card => {
    const front = card.querySelector('.course-front');
    const back = card.querySelector('.course-back');
    const trigger = card.querySelector('[data-flip-open]');
    const backButton = card.querySelector('[data-flip-close]');
    const heading = card.querySelector('.course-back-title');
    if (!front || !back || !trigger || !backButton || !heading) return;
    const state = { card, front, back, trigger, heading, open: false, enabled: true };
    states.push(state);
    close(state);
    trigger.setAttribute('role', 'button');
    trigger.addEventListener('click', event => { event.preventDefault(); open(state); });
    trigger.addEventListener('keydown', event => {
      if (event.key !== ' ' || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      open(state);
    });
    backButton.addEventListener('click', () => close(state, true));
    card.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !state.open || !state.enabled) return;
      event.preventDefault();
      close(state, true);
    });
    card.classList.add('is-flip-ready');
  });
  if (directory) {
    const syncMode = () => {
      const normal = document.body.dataset.directoryView === 'normal';
      states.forEach(state => {
        state.enabled = !normal;
        if (normal) {
          // Do not briefly hide an active back face: both sides form the readable normal view.
          state.open = false;
          state.card.classList.remove('is-flipped');
          state.card.classList.remove('is-flip-ready');
          state.trigger.setAttribute('aria-expanded', 'false');
          showFace(state.front, true);
          showFace(state.back, true);
        } else {
          close(state);
          state.card.classList.add('is-flip-ready');
        }
      });
    };
    document.addEventListener('directory-view-change', syncMode);
    syncMode();
  }
  if (states.length && typeof MutationObserver !== 'undefined') {
    try {
      const observer = new MutationObserver(records => {
        records.forEach(record => {
          const state = states.find(item => item.card === record.target);
          if (state?.card.hidden && state.open && state.enabled) close(state);
        });
      });
      states.forEach(({ card }) => observer.observe(card, { attributes: true, attributeFilter: ['hidden'] }));
    } catch { /* Incomplete observer support does not prevent button or keyboard operation. */ }
  }
})();
