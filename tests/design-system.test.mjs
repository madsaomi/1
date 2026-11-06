import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const baseline = JSON.parse(read('agents/testing/plan_030_baseline.json'));
const html = read('index.html');
const css = read('style.css');
const script = read('script.js');
const normalize = text => text.replace(/[↗↘↙↖↑↓←→☰×◐☀\uFE0E]/gu, '').replace(/\s+/gu, ' ').trim();

function decode(text) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code) => {
    if (!code.startsWith('#')) return entities[code.toLowerCase()];
    const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return value <= 0x10ffff ? String.fromCodePoint(value) : entity;
  });
}

// A narrow source-HTML reader is sufficient for this static page. Raw script/style
// blocks are removed before tokenizing; no browser or third-party parser is used.
function page(source) {
  const nodes = [], words = [], stack = [];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  source = source.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const tokens = source.match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>|[^<]+/gi) || [];
  for (const token of tokens) {
    if (token.startsWith('<!')) continue;
    if (token.startsWith('</')) {
      const tag = token.match(/^<\/([\w-]+)/)[1].toLowerCase();
      const index = stack.findLastIndex(item => item.tag === tag);
      if (index !== -1) stack.length = index;
    } else if (token.startsWith('<')) {
      const tag = token.match(/^<([\w-]+)/)[1].toLowerCase();
      const attributes = Object.fromEntries([...token.slice(tag.length + 1).matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
        .map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4] ?? '')]));
      const ignored = stack.some(item => item.ignored) || tag === 'svg' || attributes['aria-hidden'] === 'true'
        || ['theme-toggle', 'modal-close'].includes(attributes.id) || (attributes.class || '').split(/\s+/).includes('menu');
      const node = { tag, attributes, ignored, revealAncestor: stack.some(item => Object.hasOwn(item.attributes, 'data-reveal')) };
      nodes.push(node);
      if (!voidTags.has(tag) && !token.endsWith('/>')) stack.push(node);
    } else if (!stack.some(item => item.ignored)) words.push(decode(token));
  }
  return { nodes, text: normalize(words.join(' ')) };
}

function counts(values) {
  const result = new Map();
  for (const value of values) result.set(value, (result.get(value) || 0) + 1);
  return result;
}

test('protected inputs match the visual baseline except the exact PLAN-032 Docker context fix', () => {
  for (const [path, expected] of Object.entries(baseline.protected)) {
    let bytes = fs.readFileSync(new URL(`../${path}`, import.meta.url));
    if (path === '.dockerignore') {
      // PLAN-032: existing Docker COPY requires these two runtime files. Removing
      // exactly the documented additions must recover the original fingerprint.
      const source = bytes.toString('utf8');
      for (const name of ['theme-init.js', 'robots.txt']) assert.equal(source.split(/\r?\n/).filter(line => line === `!${name}`).length, 1);
      bytes = Buffer.from(source.replace(/^!(?:theme-init\.js|robots\.txt)\r?\n/gm, ''), 'utf8');
    }
    // .gitattributes stores LF, while the original Windows snapshot captured
    // content.js as CRLF. Permit only EOL equivalence across clean checkouts.
    const lf = bytes.toString('utf8').replace(/\r\n/g, '\n');
    const versions = [bytes, Buffer.from(lf), Buffer.from(lf.replace(/\n/g, '\r\n'))];
    const matches = versions.some(value => crypto.createHash('sha256').update(value).digest('hex') === expected);
    assert(matches, `${path} differs from its approved baseline beyond EOL normalization and the declared packaging fix`);
  }
});

// PLAN-044: generated blocks hold admin-managed data; the copy contract covers the static frame around them.
const staticFrame = source => source
  .replace(/<!-- ([A-Z]+)_START -->[\s\S]*?<!-- \1_END -->/g, '')
  .replace(/<!-- CONTACT_START:([a-z]+) -->[\s\S]*?<!-- CONTACT_END:\1 -->/g, '');

test('all static page copy survives redesigns; admin-managed blocks are excluded', () => {
  assert.equal(page(staticFrame(baseline.index)).text, normalize(baseline.text), 'Baseline extraction must agree with the independently captured HTMLParser text');
  assert.equal(page(staticFrame(html)).text, normalize(baseline.text));
});

test('existing navigation targets, destinations, alternative text and semantic labels survive presentation changes', () => {
  const original = page(baseline.index).nodes;
  const current = page(html).nodes;
  const keys = ['id', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'alt', 'title', 'for'];
  const semantics = nodes => nodes.flatMap(({ tag, attributes }) => {
    if (tag === 'svg' || tag === 'path' || tag === 'use') return [];
    const result = keys.filter(key => attributes[key]).map(key => `${key}=${attributes[key]}`);
    if (tag === 'a' && attributes.href) result.push(`href=${attributes.href}`);
    return result;
  });
  const actual = counts(semantics(current));
  for (const [value, count] of counts(semantics(original))) assert((actual.get(value) || 0) >= count, `Lost semantic contract: ${value}`);
  const ids = current.filter(node => node.attributes.id).map(node => node.attributes.id);
  assert.equal(ids.length, new Set(ids).size, 'IDs must remain unique');
});

test('dynamic Russian course and contact copy remains unchanged when Unicode icons become SVG', () => {
  const literals = source => (source.match(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`/g) || [])
    .map(value => normalize(value.slice(1, -1))).filter(value => /[а-яё]/iu.test(value));
  const actual = counts(literals(script));
  for (const [value, count] of counts(literals(baseline.script))) assert((actual.get(value) || 0) >= count, `Dynamic copy changed: ${value}`);
});

function declarations(block) {
  return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
}

function themes() {
  const root = css.match(/:root\s*\{([^}]+)\}/);
  const dark = css.match(/html\[data-theme=["']dark["']\]\s*\{([^}]+)\}/);
  assert(root && dark, 'Both light and dark semantic token sets are required');
  const light = declarations(root[1]);
  return { light, dark: { ...light, ...declarations(dark[1]) } };
}

function resolve(name, values) {
  let value = values[name];
  assert(value, `Missing semantic color ${name}`);
  for (let depth = 0; value.includes('var(') && depth < 10; depth++) value = value.replace(/var\((--[\w-]+)\)/g, (_, token) => values[token] || '');
  return value;
}

function rgb(hex) {
  assert.match(hex, /^#[\da-f]{6}$/i, `Contrast colors must resolve to opaque sRGB values: ${hex}`);
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
}

function luminance(hex) {
  const linear = rgb(hex).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

test('semantic text colors satisfy WCAG AA in both themes, including muted text and yellow buttons', () => {
  const pairs = [
    ['--ink', '--paper'], ['--muted', '--paper'], ['--ink', '--surface'], ['--muted', '--surface'],
    ['--ink', '--surface-hover'], ['--muted', '--surface-hover'], ['--ink', '--surface-raised'], ['--muted', '--surface-raised'], ['--button-ink', '--brand'],
    ['--on-dark', '--dark-panel'], ['--on-dark-muted', '--dark-panel']
  ];
  for (const [theme, values] of Object.entries(themes())) {
    for (const [foreground, background] of pairs) {
      const ratio = contrast(resolve(foreground, values), resolve(background, values));
      assert(ratio >= 4.5, `${theme} ${foreground}/${background}: ${ratio.toFixed(2)}:1 is below 4.5:1`);
    }
    for (const background of ['--paper', '--surface']) {
      const ratio = contrast(resolve('--focus', values), resolve(background, values));
      assert(ratio >= 3, `${theme} focus ring/${background}: ${ratio.toFixed(2)}:1 is below 3:1`);
    }
  }
});

test('design tokens keep the requested type scale and brand palette with mobile-first breakpoints', () => {
  const { light } = themes();
  for (const size of [14, 16, 20, 24, 32, 48, 64]) {
    const value = light[`--text-${size}`];
    assert(value, `Missing type size ${size}`);
    const pixels = value.endsWith('rem') ? parseFloat(value) * 16 : parseFloat(value);
    assert.equal(pixels, size);
  }
  for (const width of [768, 1024, 1280]) assert(new RegExp(`@media\\s*\\(min-width:\\s*${width}px\\)`).test(css), `Missing mobile-first breakpoint ${width}`);
  for (const match of css.matchAll(/#([\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\w-])/gi)) {
    const hex = match[1].toLowerCase();
    const channels = hex.length <= 4 ? [...hex.slice(0, 3)].map(char => char + char) : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)];
    assert(channels.join('') === 'ffb703' || new Set(channels).size === 1, `Unexpected UI color #${hex}`);
  }
});

test('Inter is served as genuine local WOFF2 with a visible fallback during loading', () => {
  const faces = css.match(/@font-face\s*\{[^}]+\}/g) || [];
  assert(faces.length >= 2, 'Latin and Cyrillic faces must be available');
  for (const face of faces) {
    assert.match(face, /font-family:\s*['"]?Inter['"]?\s*;/i);
    assert.match(face, /font-display:\s*swap\s*;/i);
    assert.match(face, /font-weight:\s*100\s+900\s*;/i);
    const urls = [...face.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)].map(match => match[1]);
    assert(urls.length);
    for (const path of urls) {
      assert.match(path, /^(?:\.\/)?assets\/fonts\/[\w.-]+\.woff2$/);
      const font = fs.readFileSync(new URL(`../${path}`, import.meta.url));
      assert.equal(font.subarray(0, 4).toString('ascii'), 'wOF2', `${path} is not a WOFF2 font`);
      assert(font.length > 1000, `${path} is unexpectedly empty`);
    }
  }
});

test('map content retains natural colors and SVG icons do not add accessible text or tab stops', () => {
  const mapFrame = page(html).nodes.find(node => node.tag === 'iframe' && node.attributes.id === 'branch-map');
  assert(mapFrame && !mapFrame.revealAncestor, 'A reveal animation on an ancestor must not change the provider map colors or opacity');
  const mapRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(match => /\.(?:contact-section|contact-locations|location-map-layout|branch-map-panel|branch-map)(?![\w-])/.test(match[1]));
  for (const [, selector, block] of mapRules) {
    for (const [, property, value] of block.matchAll(/\b(filter|backdrop-filter|opacity|mix-blend-mode)\s*:\s*([^;]+);/g)) {
      assert(['none', 'normal', '1'].includes(value.trim()), `${selector.trim()} changes map appearance with ${property}:${value}`);
    }
  }
  const icons = [...`${html}\n${script}`.matchAll(/<svg\b[^>]*>/g)].map(match => match[0]);
  assert(icons.length > 0, 'SVG icons should replace decorative Unicode controls');
  for (const icon of icons) {
    assert.match(icon, /aria-hidden=["']true["']/);
    assert.match(icon, /focusable=["']false["']/);
    assert(!/tabindex=["'](?:0|[1-9]\d*)["']/.test(icon), 'Decorative SVG must not be focusable');
  }
});

function revealRuntime({ supported = true, reducedMotion = false, constructorFailure = false } = {}) {
  const calls = { observed: [], unobserved: [], warnings: [], queries: [], instances: [] };
  const nodes = Array.from({ length: 3 }, () => {
    const classes = new Set();
    return { classes, hidden: false, style: {}, classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) } };
  });
  const context = {
    document: { querySelectorAll: selector => { calls.queries.push(selector); return nodes; } },
    matchMedia: () => ({ matches: reducedMotion }),
    console: { warn: (...args) => calls.warnings.push(args) }
  };
  if (supported) context.IntersectionObserver = class {
    constructor(callback) { if (constructorFailure) throw new Error('Observer unavailable'); this.callback = callback; calls.instances.push(this); }
    observe(node) { calls.observed.push(node); }
    unobserve(node) { calls.unobserved.push(node); }
    disconnect() { this.disconnected = true; }
  };
  context.window = context;
  const start = script.indexOf('function setupReveal(');
  assert(start >= 0, 'Reveal setup must be independently guarded');
  const source = script.slice(start);
  vm.runInNewContext(source, context, { timeout: 1000 });
  return { calls, nodes };
}

test('reveal enhancement leaves content visible without IntersectionObserver or with reduced motion', () => {
  for (const [, selector, block] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/\[data-reveal\]/.test(selector)) continue;
    assert(!/\b(?:opacity\s*:\s*0(?:\s|;|$)|visibility\s*:\s*hidden|display\s*:\s*none)/.test(block), 'Opted-in content must stay visible before enhancement');
  }
  for (const options of [{ supported: false }, { reducedMotion: true }, { constructorFailure: true }]) {
    const { calls, nodes } = revealRuntime(options);
    for (const node of nodes) {
      assert.equal(node.hidden, false);
      assert.equal(node.style.opacity, undefined);
      assert(!node.classes.has('reveal-pending'), 'Fallback must not leave a hidden pending class');
    }
    assert.equal(calls.observed.length, 0);
    if (options.constructorFailure) assert(calls.warnings.length > 0, 'Observer failure must be diagnosed without hiding content');
  }
});

test('reveal observes only opted-in content and stops observing elements after their first visible entry', () => {
  const { calls, nodes } = revealRuntime();
  assert.deepEqual(calls.queries, ['[data-reveal]']);
  assert.deepEqual(calls.observed, nodes);
  assert.equal(calls.instances.length, 1);
  const observer = calls.instances[0];
  observer.callback([{ target: nodes[0], isIntersecting: false }, { target: nodes[1], isIntersecting: true }], observer);
  assert.equal(nodes[0].classes.has('is-revealed'), false);
  assert.equal(nodes[1].classes.has('is-revealed'), true);
  assert.deepEqual(calls.unobserved, [nodes[1]]);
  assert(!nodes.some(node => node.hidden || node.style.opacity === '0'));
});
