import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/course-flip.js', import.meta.url), 'utf8');
function view({ partial = false, observer = true } = {}) {
  let active;
  const observers = [];
  const node = () => {
    const classes = new Set();
    return {
      hidden: false, inert: false, attributes: {}, handlers: {},
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, handler) { this.handlers[name] = handler; },
      focus() { active = this; },
    };
  };
  const cards = Array.from({ length: 2 }, () => {
    const card = node();
    const parts = { front: node(), back: node(), trigger: node(), button: node(), heading: node() };
    card.querySelector = selector => ({
      '.course-front': parts.front, '.course-back': parts.back,
      '[data-flip-open]': parts.trigger, '[data-flip-close]': parts.button,
      '.course-back-title': partial ? null : parts.heading,
    })[selector];
    return { card, ...parts };
  });
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
  }
  vm.runInNewContext(source, {
    document: { querySelectorAll: () => cards.map(item => item.card) },
    ...(observer ? { MutationObserver: Observer } : {}),
  });
  const fire = (target, type, key) => {
    const event = { key, prevented: false, preventDefault() { this.prevented = true; } };
    target.handlers[type]?.(event);
    return event;
  };
  return { cards, fire, active: () => active, hide(item) {
    item.card.hidden = true;
    observers.forEach(itemObserver => itemObserver.callback([{ target: item.card }]));
  } };
}

test('course flips expose only the visible face and restore keyboard focus on Escape', () => {
  const ui = view();
  const item = ui.cards[0];
  assert.equal(item.back.inert, true);
  assert.equal(item.back.attributes['aria-hidden'], 'true');
  assert.equal(item.front.inert, false);
  assert.equal(ui.fire(item.trigger, 'click').prevented, true);
  assert.equal(item.card.classList.contains('is-flipped'), true);
  assert.equal(item.trigger.attributes['aria-expanded'], 'true');
  assert.equal(item.front.inert, true);
  assert.equal(item.back.inert, false);
  assert.equal(ui.active(), item.heading);
  assert.equal(ui.fire(item.card, 'keydown', 'Escape').prevented, true);
  assert.equal(item.trigger.attributes['aria-expanded'], 'false');
  assert.equal(item.front.inert, false);
  assert.equal(item.back.inert, true);
  assert.equal(ui.active(), item.trigger);
});

test('Space opens a card and opening another card closes its neighbour without stealing focus', () => {
  const ui = view({ observer: false });
  const [first, second] = ui.cards;
  assert.equal(ui.fire(first.trigger, 'keydown', ' ').prevented, true);
  ui.fire(second.trigger, 'click');
  assert.equal(first.card.classList.contains('is-flipped'), false);
  assert.equal(first.trigger.attributes['aria-expanded'], 'false');
  assert.equal(ui.active(), second.heading);
  ui.fire(second.button, 'click');
  assert.equal(ui.active(), second.trigger);
  assert.equal(second.back.inert, true);
});

test('filtering a flipped card resets its state and incomplete markup keeps the static fallback', () => {
  const ui = view();
  const item = ui.cards[0];
  ui.fire(item.trigger, 'click');
  ui.hide(item);
  assert.equal(item.card.classList.contains('is-flipped'), false);
  assert.equal(item.back.inert, true);
  assert.equal(item.front.inert, false);
  const incomplete = view({ partial: true });
  assert.equal(incomplete.cards[0].card.classList.contains('is-flip-ready'), false);
  assert.equal(incomplete.cards[0].back.inert, false);
  assert.equal(incomplete.cards[0].trigger.handlers.click, undefined);
});
