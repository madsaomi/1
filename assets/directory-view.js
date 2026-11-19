// Long directories open in portions: the first cards are shown, «Показать ещё» reveals the next ones.
// Without JS every card stays visible in the static HTML.
(() => {
  if (typeof document === 'undefined') return;
  const page = document.body;
  const more = document.querySelector('[data-directory-more]');
  if (!page?.classList.contains('directory-page') || !more) return;
  const cards = [...document.querySelectorAll('.profile-card')];
  const step = 9;
  if (cards.length <= step) return;
  const button = more.querySelector('button');
  let shown = 0;
  const reveal = () => {
    const first = cards[shown];
    shown = Math.min(cards.length, shown + step);
    cards.forEach((card, index) => { card.hidden = index >= shown; });
    more.hidden = shown >= cards.length;
    return first;
  };
  reveal();
  // «Подробнее» on the home page links to one student (#student-12): show enough cards to reach it.
  const hash = globalThis.location?.hash || '';
  const linked = hash.length > 1 && document.getElementById?.(decodeURIComponent(hash.slice(1)));
  if (linked && cards.includes(linked)) {
    while (linked.hidden && shown < cards.length) reveal();
    linked.scrollIntoView();
  }
  button.addEventListener('click', () => {
    const first = reveal();
    // Keyboard users continue from the first new card instead of jumping back to the top.
    const target = first?.querySelector('[data-flip-open], a, button');
    target?.focus({ preventScroll: false });
  });
})();
