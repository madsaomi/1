import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('index.html');
const context = { window: {} };
vm.runInNewContext(read('assets/i18n/uz.js'), context, { timeout: 1000 });
const pack = context.window.stanfordUz;

test('published Uzbek entries are valid Latin strings, while missing translations are allowed', () => {
  assert(pack && typeof pack === 'object');
  assert(pack.strings && typeof pack.strings === 'object' && !Array.isArray(pack.strings));
  for (const [key, value] of Object.entries(pack.strings)) {
    assert(key.trim(), 'Translation keys must not be empty');
    assert.equal(typeof value, 'string');
    assert(value.trim(), 'Translation must not be empty');
    assert(!/[А-Яа-яЁё]/.test(value), 'Uzbek translations must use Latin letters: ' + key);
  }
  assert(Array.isArray(pack.patterns) && pack.patterns.length);
  for (const [pattern, build] of pack.patterns) {
    assert.equal(Object.prototype.toString.call(pattern), '[object RegExp]');
    assert.equal(typeof build, 'function');
    assert.doesNotThrow(() => pattern.test('Проверка'));
  }
});

test('owner copy without a translation keeps Russian text and both language directions work', () => {
  for (const name of ['script.js', 'assets/i18n/language.js']) {
  const known = { nodeType: 3, data: 'Кнопка' };
  const unknown = { nodeType: 3, data: 'Новый текст владельца без перевода' };
  const attributes = new Map();
  const root = { nodeType: 1, tagName: 'HTML', childNodes: [known, unknown], getAttribute: () => null };
  let toggle;
  const button = { addEventListener(type, callback) { if (type === 'click') toggle = callback; },
    setAttribute(name, value) { attributes.set(name, value); } };
  const script = read(name);
  const from = script.indexOf('function setupLanguage()');
  const to = script.indexOf('setupLanguage();', from) + 'setupLanguage();'.length;
  assert(from >= 0 && to > from);
  vm.runInNewContext(script.slice(from, to), {
    window: { stanfordUz: { strings: { 'Кнопка': 'Tugma' }, patterns: [] } },
    document: { documentElement: root, querySelector: () => button },
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    MutationObserver: class { observe() {} takeRecords() {} },
    localStorage: { getItem: () => 'uz', setItem() {} }
  });
  assert.equal(root.lang, 'uz');
  assert.equal(known.data, 'Tugma');
  assert.equal(unknown.data, 'Новый текст владельца без перевода');
  toggle();
  assert.equal(root.lang, 'ru');
  assert.equal(known.data, 'Кнопка');
  assert.equal(unknown.data, 'Новый текст владельца без перевода');
  toggle();
  assert.equal(root.lang, 'uz');
  assert.equal(known.data, 'Tugma');
  }
});

test('the page ships the dictionary behind a cache version and offers the switch', () => {
  for (const name of ['index.html', 'results.html', 'career.html']) {
    const page = read(name);
    assert.match(page, /<button\b[^>]*\bid="lang-toggle"/);
    assert.match(page, /<script src="assets\/i18n\/uz\.js\?v=\d+"><\/script>/);
  }
  assert.match(read('script.js'), /window\.stanfordUz/);
});
