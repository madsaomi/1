import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const implementations = ['script.js', 'assets/i18n/language.js'];

test('default UI and text attributes from all four pages are covered in UZ and QQ', () => {
  // A stable UI catalogue keeps owner-authored copy free to use the Russian fallback.
  const defaults = JSON.parse(read('tests/fixtures/public-ui.json'));
  assert(defaults.length >= 250, 'Coverage includes page copy, forms, confirmations and metadata');
  for (const code of ['uz', 'kaa']) {
    const context = {window:{}};
    vm.runInNewContext(read(`assets/i18n/${code}.js`), context, {timeout:1000});
    const pack = Object.values(context.window)[0];
    const translate = value => {
      const normalized = value.trim().replace(/\s+/g, ' ');
      if (pack.strings[normalized] !== undefined) return pack.strings[normalized];
      for (const [pattern, build] of pack.patterns) {
        const match = normalized.match(pattern);
        if (match) return build(match, translate);
      }
      return value;
    };
    for (const source of defaults) {
      const translated = translate(source);
      assert(translated.trim(), `${code}: empty translation for ${source}`);
      assert(!/[А-Яа-яЁё]/.test(translated), `${code}: untranslated default UI: ${source}`);
    }
  }
});

test('published Uzbek and Karakalpak packs contain valid Latin translations and dynamic patterns', () => {
  for (const [file, name] of [['uz', 'stanfordUz'], ['kaa', 'stanfordKaa']]) {
    const context = { window: {} };
    vm.runInNewContext(read(`assets/i18n/${file}.js`), context, { timeout: 1000 });
    const pack = context.window[name];
    assert(pack && typeof pack === 'object');
    assert(pack.strings && typeof pack.strings === 'object' && !Array.isArray(pack.strings));
    for (const [key, value] of Object.entries(pack.strings)) {
      assert(key.trim(), 'Translation keys must not be empty');
      assert.equal(typeof value, 'string');
      assert(value.trim(), 'Translation must not be empty');
      assert(!/[А-Яа-яЁё]/.test(value), `${file} translations must use Latin letters: ${key}`);
    }
    assert(Array.isArray(pack.patterns) && pack.patterns.length);
    for (const [pattern, build] of pack.patterns) {
      assert.equal(Object.prototype.toString.call(pattern), '[object RegExp]');
      assert.equal(typeof build, 'function');
    }
  }
});

const element = (tagName, values = {}, childNodes = []) => {
  const attributes = new Map(Object.entries(values));
  return { nodeType: 1, tagName, childNodes,
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value) };
};
const text = data => ({ nodeType: 3, data });

function languageHarness(name, { saved = 'ru', blockedStorage = false, observe = true } = {}) {
  const known = text('Кнопка');
  const unknown = text('Новый текст владельца без перевода');
  const field = element('INPUT', { placeholder: 'Имя' });
  const root = element('HTML', {}, [known, unknown, field]);
  const select = element('SELECT', { 'aria-label': 'Язык сайта' });
  const handlers = {};
  select.addEventListener = (type, callback) => { handlers[type] = callback; };
  root.childNodes.push(select);
  let notify;
  let stored;
  const source = read(name);
  const from = source.indexOf('function setupLanguage()');
  const to = source.indexOf('setupLanguage();', from) + 'setupLanguage();'.length;
  assert(from >= 0 && to > from);
  vm.runInNewContext(source.slice(from, to), {
    window: {
      stanfordUz: { strings: { 'Кнопка': 'Tugma', 'Имя': 'Ism', 'Новый текст': 'Yangi matn', 'Язык сайта': 'Sayt tili' }, patterns: [] },
      stanfordKaa: { strings: { 'Кнопка': 'Túyme', 'Имя': 'Atı', 'Новый текст': 'Jańa tekst', 'Язык сайта': 'Sayt tili' }, patterns: [] }
    },
    document: { documentElement: root, querySelector: () => select },
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    MutationObserver: observe ? class { constructor(callback) { notify = callback; } observe() {} takeRecords() {} } : undefined,
    localStorage: {
      getItem() { if (blockedStorage) throw new Error('blocked'); return saved; },
      setItem(key, value) { if (blockedStorage) throw new Error('blocked'); stored = [key, value]; }
    }
  });
  return { root, known, unknown, field, select,
    choose(value) { select.value = value; handlers.change(); },
    notify(records) { notify(records); },
    stored: () => stored };
}

test('RU → UZ → QQ → RU always uses Russian originals and retains owner copy without translations', () => {
  for (const name of implementations) {
    const page = languageHarness(name);
    page.choose('uz');
    assert.equal(page.known.data, 'Tugma');
    assert.equal(page.field.getAttribute('placeholder'), 'Ism');
    page.choose('kaa');
    assert.equal(page.root.lang, 'kaa');
    assert.equal(page.select.value, 'kaa');
    assert.equal(page.known.data, 'Túyme');
    assert.equal(page.field.getAttribute('placeholder'), 'Atı');
    assert.equal(page.unknown.data, 'Новый текст владельца без перевода');
    assert.deepEqual(page.stored(), ['stanford-lang', 'kaa']);
    page.choose('ru');
    assert.equal(page.known.data, 'Кнопка');
    assert.equal(page.field.getAttribute('placeholder'), 'Имя');
    assert.equal(page.select.getAttribute('aria-label'), 'Язык сайта');
    page.choose('kaa');
    page.choose('uz');
    assert.equal(page.known.data, 'Tugma');
  }
});

test('new content and changed attributes translate in QQ and restore their current source when switching', () => {
  for (const name of implementations) {
    const page = languageHarness(name, { saved: 'kaa' });
    const added = element('P', {}, [text('Новый текст')]);
    page.root.childNodes.push(added);
    page.notify([{ type: 'childList', addedNodes: [added] }]);
    assert.equal(added.childNodes[0].data, 'Jańa tekst');
    page.field.setAttribute('placeholder', 'Новый текст');
    page.notify([{ type: 'attributes', target: page.field, attributeName: 'placeholder' }]);
    assert.equal(page.field.getAttribute('placeholder'), 'Jańa tekst');
    page.known.data = 'Новый текст';
    page.notify([{ type: 'characterData', target: page.known }]);
    assert.equal(page.known.data, 'Jańa tekst');
    page.choose('uz');
    assert.equal(page.known.data, 'Yangi matn');
    assert.equal(added.childNodes[0].data, 'Yangi matn');
    assert.equal(page.field.getAttribute('placeholder'), 'Yangi matn');
    page.known.data = 'Owner edit in Latin';
    page.choose('ru');
    assert.equal(page.known.data, 'Owner edit in Latin');
    assert.equal(added.childNodes[0].data, 'Новый текст');
    assert.equal(page.field.getAttribute('placeholder'), 'Новый текст');
  }
});

test('saved QQ is restored while invalid settings and unavailable storage keep the selector usable', () => {
  for (const name of implementations) {
    const saved = languageHarness(name, { saved: 'kaa' });
    assert.equal(saved.root.lang, 'kaa');
    assert.equal(saved.known.data, 'Túyme');
    for (const value of ['invalid', '__proto__', 'constructor']) {
      const invalid = languageHarness(name, { saved: value });
      assert.equal(invalid.root.lang, 'ru');
      assert.equal(invalid.select.value, 'ru');
      assert.equal(invalid.known.data, 'Кнопка');
    }
    const blocked = languageHarness(name, { blockedStorage: true, observe: false });
    blocked.choose('kaa');
    assert.equal(blocked.known.data, 'Túyme');
    blocked.choose('ru');
    assert.equal(blocked.known.data, 'Кнопка');
  }
});

test('all pages and the reusable template offer a labelled native three-language selector', () => {
  for (const name of ['index.html', 'results.html', 'teachers.html', 'career.html', 'templates/page.html']) {
    const page = read(name);
    assert.match(page, /<select\b[^>]*\bid="lang-toggle"[^>]*aria-label="Язык сайта"/);
    for (const [value, label] of [['ru', 'RU'], ['uz', 'UZ'], ['kaa', 'QQ']]) {
      assert.match(page, new RegExp(`<option value="${value}" lang="${value}">${label}</option>`));
    }
    assert.match(page, /<script src="assets\/i18n\/uz\.js\?v=\d+"><\/script>/);
    assert.match(page, /<script src="assets\/i18n\/kaa\.js\?v=\d+"><\/script>/);
  }
});
