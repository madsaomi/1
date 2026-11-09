import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('index.html');
const cyrillic = /[А-Яа-яЁё]/;

// The dictionary is a plain browser script: run it like the page does and read the global.
const context = { window: {} };
vm.runInNewContext(read('assets/i18n/uz.js'), context, { timeout: 1000 });
const pack = context.window.stanfordUz;

const decode = text => text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code) => {
  if (!code.startsWith('#')) return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[code.toLowerCase()];
  const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
  return value <= 0x10ffff ? String.fromCodePoint(value) : entity;
});

// Admin-managed blocks hold content.js data; the Uzbek contract covers the static frame around them.
const staticFrame = source => source
  .replace(/<!-- ([A-Z]+)_START -->[\s\S]*?<!-- \1_END -->/g, '')
  .replace(/<!-- CONTACT_START:([a-z]+) -->[\s\S]*?<!-- CONTACT_END:\1 -->/g, '');

// Same fragment rules as setupLanguage() in script.js: every text node plus the translatable attributes.
function cyrillicFragments(source) {
  const fragments = [];
  let rawText = 0;
  const tokens = source.match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>|[^<]+/gi) || [];
  for (const token of tokens) {
    if (token.startsWith('<!')) continue;
    if (token.startsWith('</')) {
      if (/^<\/(?:script|style)\b/i.test(token)) rawText = Math.max(0, rawText - 1);
      continue;
    }
    if (token.startsWith('<')) {
      if (/^<(?:script|style)\b/i.test(token)) rawText++;
      if (rawText) continue;
      const tag = token.match(/^<([\w-]+)/)[1].toLowerCase();
      const attributes = Object.fromEntries([...token.slice(tag.length + 1).matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
        .map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4] ?? '')]));
      for (const name of ['aria-label', 'alt', 'title', 'placeholder', 'content']) {
        if (attributes[name] && cyrillic.test(attributes[name])) fragments.push(attributes[name]);
      }
      continue;
    }
    if (rawText) continue;
    const text = decode(token);
    if (cyrillic.test(text)) fragments.push(text);
  }
  return fragments;
}

test('Uzbek dictionary is a complete Latin-script translation pack', () => {
  assert(pack && typeof pack === 'object', 'assets/i18n/uz.js must define window.stanfordUz');
  assert(pack.strings && typeof pack.strings === 'object' && !Array.isArray(pack.strings), 'strings must be an object');
  const entries = Object.entries(pack.strings);
  assert(entries.length >= 150, `Expected at least 150 translated strings, got ${entries.length}`);
  for (const [key, value] of entries) {
    assert(key.trim(), 'Translation keys must not be empty');
    assert.equal(typeof value, 'string', `Translation must be a string: ${key}`);
    assert(value.trim(), `Translation must not be empty: ${key}`);
    assert(!cyrillic.test(value), `Translation must stay in Latin Uzbek: ${key} -> ${value}`);
  }
  assert(Array.isArray(pack.patterns) && pack.patterns.length, 'patterns must be a non-empty array');
  for (const entry of pack.patterns) {
    assert(Array.isArray(entry) && entry.length === 2, 'Every pattern must be a [RegExp, builder] pair');
    const [pattern, build] = entry;
    assert.equal(Object.prototype.toString.call(pattern), '[object RegExp]', 'Pattern entries must start with a regular expression');
    assert(pattern.source.length, 'Pattern regular expressions must not be empty');
    assert.equal(typeof build, 'function', 'Every pattern needs a builder function');
    assert.doesNotThrow(() => pattern.test('Проверка'), 'Pattern regular expressions must be valid');
  }
});

test('every static Cyrillic fragment of index.html has an Uzbek translation', () => {
  const fragments = cyrillicFragments(staticFrame(html));
  assert(fragments.length > 0, 'The static frame must contain Russian text to translate');
  // Same lookup order as script.js: whole normalized string first, then the numeric patterns.
  const translated = value => {
    const raw = value.trim();
    if (!raw) return true;
    if (Object.hasOwn(pack.strings, raw.replace(/\s+/g, ' '))) return true;
    return pack.patterns.some(([pattern]) => pattern.test(raw));
  };
  const missing = fragments.filter(fragment => !translated(fragment)).map(fragment => fragment.trim().replace(/\s+/g, ' '));
  assert.deepEqual(missing, [], `Missing Uzbek translations: ${missing.join(' | ')}`);
});

test('the page ships the Uzbek dictionary behind a cache version and offers the switch', () => {
  assert.match(html, /<button\b[^>]*\bid="lang-toggle"/, 'The #lang-toggle control must stay in the header');
  assert.match(html, /<script src="assets\/i18n\/uz\.js\?v=\d+"><\/script>/, 'assets/i18n/uz.js must be loaded with a cache version');
  const script = read('script.js');
  assert.match(script, /window\.stanfordUz/, 'script.js must read the Uzbek dictionary');
  assert.match(script, /setupLanguage\(\)/, 'The language switch must be initialized');
});
