import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/ui.js', import.meta.url), 'utf8');
function countdown(date, now, { reduced = false } = {}) {
  const tasks = new Map();
  const listeners = new Map();
  const cells = ['days', 'hours', 'minutes', 'seconds'].map(() => ({
    textContent: '00', classList: { add() {}, remove() {} },
  }));
  const status = { textContent: 'До начала' };
  const element = {
    getAttribute: name => name === 'data-countdown' ? date : null,
    querySelector: selector => cells[['days', 'hours', 'minutes', 'seconds'].indexOf(selector.match(/"(\w+)"/)[1])],
    closest: () => ({ querySelector: () => status }), classList: { add() {} },
  };
  let instant = now;
  let nextId = 0;
  const document = {
    hidden: false,
    querySelectorAll: selector => selector === '[data-countdown]' ? [element] : [],
    addEventListener: (name, handler) => listeners.set(name, handler),
  };
  const clock = class extends Date { static now() { return instant; } };
  vm.runInNewContext(source, {
    document, Date: clock, matchMedia: () => ({ matches: reduced }),
    setTimeout: callback => { const id = ++nextId; tasks.set(id, callback); return id; },
    clearTimeout: id => tasks.delete(id),
  });
  return {
    values: () => cells.map(cell => cell.textContent), status, tasks,
    visibility(hidden, time = instant) {
      instant = time; document.hidden = hidden;
      listeners.get('visibilitychange')?.();
    },
  };
}

test('countdown uses the explicit timezone and real elapsed time after a hidden tab resumes', () => {
  const now = Date.parse('2026-11-13T10:00:00Z');
  const view = countdown('2026-11-14T16:02:03+05:00', now);
  assert.deepEqual(view.values(), ['01', '01', '02', '03']);
  assert.equal(view.tasks.size, 1);
  view.visibility(true);
  assert.equal(view.tasks.size, 0);
  view.visibility(false, now + 62_000);
  assert.deepEqual(view.values(), ['01', '01', '01', '01']);
});

test('expired events stop at zero without scheduling another tick, including reduced motion', () => {
  const view = countdown('2026-11-13T10:00:00Z', Date.parse('2026-11-13T10:00:01Z'), { reduced: true });
  assert.deepEqual(view.values(), ['00', '00', '00', '00']);
  assert.equal(view.status.textContent, 'Событие началось');
  assert.equal(view.tasks.size, 0);
  view.visibility(true);
  view.visibility(false);
  assert.equal(view.tasks.size, 0);
});

test('invalid or timezone-ambiguous dates preserve the static fallback', () => {
  for (const date of ['invalidZ', '2026-11-14T12:00:00']) {
    const view = countdown(date, Date.now());
    assert.equal(view.tasks.size, 0);
    assert.equal(view.status.textContent, 'До начала');
  }
});
