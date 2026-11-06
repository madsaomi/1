// PLAN-052 (experiment/gsap): GSAP effects on top of the finished static page.
// Presentation only: without GSAP, with reduced motion, or after an error the page stays exactly as script.js left it.
(() => {
  const { gsap, ScrollTrigger, SplitText } = window;
  if (!gsap || !ScrollTrigger || !SplitText) return;

  // Section headings rise word by word from under a mask; "Пример" tags stay whole.
  function setupHeadings() {
    document.querySelectorAll('main h2').forEach(heading => {
      SplitText.create(heading, {
        type: 'words', mask: 'words', wordsClass: 'split-word', ignore: '.demo-tag', autoSplit: true,
        onSplit: self => gsap.from(self.words, {
          yPercent: 110, duration: .8, ease: 'expo.out', stagger: .06,
          scrollTrigger: { trigger: heading, start: 'top 88%', once: true },
        }),
      });
    });
  }

  // First screen: the logo sinks and shrinks, the rings turn while the hero scrolls away.
  function setupHero() {
    const scrub = () => ({ trigger: '.hero', start: 'top top', end: 'bottom top', scrub: .6 });
    gsap.to('.hero-logo img', { yPercent: 18, scale: .9, ease: 'none', scrollTrigger: scrub() });
    gsap.to('.hero-rings', { rotation: 60, scale: 1.25, ease: 'none', scrollTrigger: scrub() });
  }

  // Mouse only: course cards tilt toward the cursor. Tweens are created on first hover,
  // so the CSS stagger entrance keeps control of transform until then.
  function setupTilt() {
    return [...document.querySelectorAll('.course-card')].map(card => {
      let rotateX, rotateY, lift;
      const enter = () => {
        if (!rotateX) {
          card.classList.add('gsap-tilt');
          gsap.set(card, { transformPerspective: 900 });
          rotateX = gsap.quickTo(card, 'rotationX', { duration: .5, ease: 'power3' });
          rotateY = gsap.quickTo(card, 'rotationY', { duration: .5, ease: 'power3' });
          lift = gsap.quickTo(card, 'y', { duration: .4, ease: 'power3' });
        }
        lift(-6);
      };
      const move = event => {
        if (!rotateX) return;
        const box = card.getBoundingClientRect();
        rotateY(((event.clientX - box.left) / box.width - .5) * 8);
        rotateX(((event.clientY - box.top) / box.height - .5) * -8);
      };
      const leave = () => { if (rotateX) { rotateX(0); rotateY(0); lift(0); } };
      card.addEventListener('pointerenter', enter);
      card.addEventListener('pointermove', move);
      card.addEventListener('pointerleave', leave);
      return () => {
        card.removeEventListener('pointerenter', enter);
        card.removeEventListener('pointermove', move);
        card.removeEventListener('pointerleave', leave);
        card.classList.remove('gsap-tilt');
      };
    });
  }

  // Mouse only: first-screen buttons lean toward the cursor.
  function setupMagnet() {
    return [...document.querySelectorAll('.hero .actions a')].map(button => {
      button.classList.add('gsap-tilt');
      const x = gsap.quickTo(button, 'x', { duration: .4, ease: 'power3' });
      const y = gsap.quickTo(button, 'y', { duration: .4, ease: 'power3' });
      const move = event => {
        const box = button.getBoundingClientRect();
        x((event.clientX - box.left - box.width / 2) * .25);
        y((event.clientY - box.top - box.height / 2) * .35);
      };
      const leave = () => { x(0); y(0); };
      button.addEventListener('pointermove', move);
      button.addEventListener('pointerleave', leave);
      return () => {
        button.removeEventListener('pointermove', move);
        button.removeEventListener('pointerleave', leave);
        button.classList.remove('gsap-tilt');
      };
    });
  }

  try {
    gsap.registerPlugin(ScrollTrigger, SplitText);
    // matchMedia reverts every split, tween and inline style when a condition stops matching.
    gsap.matchMedia().add({ motion: '(prefers-reduced-motion: no-preference)', mouse: '(hover: hover) and (pointer: fine)' }, ({ conditions }) => {
      if (!conditions.motion) return;
      setupHeadings();
      setupHero();
      const cleanups = conditions.mouse ? [...setupTilt(), ...setupMagnet()] : [];
      return () => cleanups.forEach(cleanup => cleanup());
    });
  } catch (error) {
    console.warn('GSAP effects unavailable; content remains visible.', error);
  }
})();
