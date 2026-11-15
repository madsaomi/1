import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/directory-view.js', import.meta.url), 'utf8');

function pager({ count, missingButton = false } = {}) {
  let focused;
  const node = () => ({ hidden: false, handlers: {}, addEventListener(name, handler) { this.handlers[name] = handler; } });
  const button = node();
  const more = { hidden: true, querySelector: () => button };
  const cards = Array.from({ length: count }, () => {
    const card = node();
    const trigger = { focus() { focused = card; } };
    card.querySelector = () => trigger;
    return card;
  });
  const document = {
    body: { classList: { contains: name => name === 'directory-page' } },
    querySelector: () => missingButton ? null : more,
    querySelectorAll: () => cards,
  };
  vm.runInContext(source, vm.createContext({ document }));
  return { cards, more, click: () => button.handlers.click?.(), focused: () => focused };
}

const visible = cards => cards.filter(card => !card.hidden).length;

test('short directories show every card and keep the «Показать ещё» button hidden', () => {
  const ui = pager({ count: 9 });
  assert.equal(visible(ui.cards), 9);
  assert.equal(ui.more.hidden, true);
});

test('long directories open in portions of nine and move focus to the first new card', () => {
  const ui = pager({ count: 20 });
  assert.equal(visible(ui.cards), 9);
  assert.equal(ui.more.hidden, false);
  ui.click();
  assert.equal(visible(ui.cards), 18);
  assert.equal(ui.focused(), ui.cards[9]);
  ui.click();
  assert.equal(visible(ui.cards), 20);
  assert.equal(ui.more.hidden, true);
});

test('without the button markup every card stays visible', () => {
  const ui = pager({ count: 20, missingButton: true });
  assert.equal(visible(ui.cards), 20);
});

test('directory pages carry the hidden button and no longer offer a second «ordinary» view', () => {
  for (const page of ['teachers.html', 'results.html']) {
    const html = fs.readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    assert.match(html, /<p class="directory-more" data-directory-more hidden><button type="button" class="button-outline"><span data-text="(teachers|results)\.more">Показать ещё<\/span>/);
    assert(!html.includes('data-directory-view-controls'));
    assert(!html.includes('Обычный вид'));
  }
});
