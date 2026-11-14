import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL(`../assets/${name}`, import.meta.url), 'utf8');
const directorySource = read('directory-view.js');
const flipSource = read('course-flip.js');

function view({ store = new Map(), blockedStorage = false, reverseOrder = false, missingControls = false, empty = false } = {}) {
  let active;
  const node = (dataset = {}) => {
    const classes = new Set();
    return {
      dataset, hidden: false, inert: false, attributes: {}, handlers: {},
      classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, handler) { this.handlers[name] = handler; },
      focus() { active = this; },
    };
  };
  const page = node();
  page.classList.add('directory-page');
  const buttons = ['cards', 'normal'].map(mode => node({ directoryMode: mode }));
  const controls = node();
  controls.hidden = true;
  controls.querySelectorAll = () => buttons;
  const cards = Array.from({ length: empty ? 0 : 2 }, () => {
    const card = node();
    const parts = { front: node(), back: node(), trigger: node(), button: node(), heading: node() };
    card.querySelector = selector => ({
      '.course-front': parts.front, '.course-back': parts.back,
      '[data-flip-open]': parts.trigger, '[data-flip-close]': parts.button,
      '.course-back-title': parts.heading,
    })[selector];
    return { card, ...parts };
  });
  const handlers = new Map();
  const document = {
    body: page,
    querySelector: () => missingControls ? null : controls,
    querySelectorAll: () => cards.map(item => item.card),
    addEventListener(name, handler) {
      handlers.set(name, [...(handlers.get(name) || []), handler]);
    },
    dispatchEvent(event) { handlers.get(event.type)?.forEach(handler => handler(event)); },
  };
  class Event { constructor(type, { detail }) { this.type = type; this.detail = detail; } }
  const context = vm.createContext({
    document, CustomEvent: Event,
    localStorage: {
      getItem(key) { if (blockedStorage) throw new Error('blocked'); return store.get(key); },
      setItem(key, value) { if (blockedStorage) throw new Error('blocked'); store.set(key, value); },
    },
  });
  for (const source of reverseOrder ? [flipSource, directorySource] : [directorySource, flipSource]) vm.runInContext(source, context);
  const click = target => target.handlers.click?.({ preventDefault() {} });
  return { page, controls, buttons, cards, click, active: () => active };
}

test('empty directories retain their static message without exposing redundant view controls', () => {
  const ui = view({empty: true});
  assert.equal(ui.controls.hidden, true);
  assert.equal(ui.page.dataset.directoryView, undefined);
});

test('directory starts with flip cards, then ordinary view exposes all details and resets flipped faces', () => {
  const ui = view();
  assert.equal(ui.page.dataset.directoryView, 'cards');
  assert.equal(ui.controls.hidden, false);
  assert.deepEqual(ui.buttons.map(button => button.attributes['aria-pressed']), ['true', 'false']);
  const first = ui.cards[0];
  ui.click(first.trigger);
  assert.equal(first.front.inert, true);
  ui.click(ui.buttons[1]);
  assert.equal(ui.page.dataset.directoryView, 'normal');
  assert.deepEqual(ui.buttons.map(button => button.attributes['aria-pressed']), ['false', 'true']);
  for (const item of ui.cards) {
    assert.equal(item.card.classList.contains('is-flip-ready'), false);
    assert.equal(item.card.classList.contains('is-flipped'), false);
    assert.equal(item.front.inert, false);
    assert.equal(item.back.inert, false);
    assert.equal(item.back.attributes['aria-hidden'], 'false');
  }
  ui.click(first.trigger);
  assert.equal(first.card.classList.contains('is-flipped'), false);
  ui.click(ui.buttons[0]);
  assert.equal(first.card.classList.contains('is-flip-ready'), true);
  assert.equal(first.back.inert, true);
  ui.click(first.trigger);
  assert.equal(first.card.classList.contains('is-flipped'), true);
});

test('directory preference survives a page reload, including loading the view script after flip behaviour', () => {
  const store = new Map();
  const first = view({ store });
  first.click(first.buttons[1]);
  assert.equal(store.get('stanford-directory-view'), 'normal');
  for (const reverseOrder of [false, true]) {
    const reloaded = view({ store, reverseOrder });
    assert.equal(reloaded.page.dataset.directoryView, 'normal');
    assert.equal(reloaded.cards[0].back.inert, false);
    assert.equal(reloaded.cards[0].card.classList.contains('is-flip-ready'), false);
  }
});

test('blocked or invalid storage keeps the switch usable, and missing controls do not partially initialize it', () => {
  const blocked = view({ blockedStorage: true });
  blocked.click(blocked.buttons[1]);
  assert.equal(blocked.page.dataset.directoryView, 'normal');
  blocked.click(blocked.buttons[0]);
  assert.equal(blocked.page.dataset.directoryView, 'cards');
  const invalid = view({ store: new Map([['stanford-directory-view', '<script>']]) });
  assert.equal(invalid.page.dataset.directoryView, 'cards');
  const absent = view({ missingControls: true });
  assert.equal(absent.page.dataset.directoryView, undefined);
  assert.equal(absent.controls.hidden, true);
});
