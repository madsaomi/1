import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { readContent, validateContent, generate, renderContacts, renderLocations, renderCourses, renderFilters, renderPrices, renderHero, escapeHTML } from '../build.mjs';

const data = readContent();
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('every root COPY input is present in the default-deny Docker build context', () => {
  const dockerfile = fs.readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  const rules = fs.readFileSync(new URL('../.dockerignore', import.meta.url), 'utf8').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  assert.equal(rules[0], '**', 'This check enforces the repository default-deny context contract');
  const inputs = [...dockerfile.matchAll(/^COPY\s+(.+)$/gm)].flatMap(match => match[1].trim().split(/\s+/).slice(0, -1));
  assert(inputs.length, 'Dockerfile must declare its production files');
  for (const input of inputs) {
    const path = new URL(`../${input}`, import.meta.url);
    assert(fs.existsSync(path), `Missing Docker COPY input: ${input}`);
    if (fs.statSync(path).isDirectory()) continue;
    assert(!input.includes('/'), 'Root-file context test must be extended for nested COPY inputs');
    const matching = rules.filter(rule => ['**', '*', input, `!${input}`].includes(rule));
    assert.equal(matching.at(-1), `!${input}`, `Docker context excludes COPY input: ${input}`);
  }
});

test('generated HTML is current, complete without JS, and generation is idempotent', () => {
  const output = generate(html, data);
  assert.equal(output, html);
  assert.equal(generate(output, data), output);
  assert.equal((html.match(/data-course-id=/g) || []).length, data.courses.length);
  const prices = html.split('<!-- PRICES_START -->')[1].split('<!-- PRICES_END -->')[0];
  assert.equal((prices.match(/<tr><th scope="row">/g) || []).length, data.courses.length);
});

test('course IDs preserve the distinction between English teaching languages', () => {
  assert.doesNotThrow(() => validateContent(data));
  const english = data.courses.filter(course => course.name === 'General English');
  assert.equal(english.length, 2);
  assert.notEqual(english[0].id, english[1].id);
  const broken = structuredClone(data);
  broken.courses[1].id = broken.courses[0].id;
  assert.throws(() => validateContent(broken), /unique/);
});

test('unverified contacts never produce actionable links', () => {
  const contacts = { ...contactFixture(), verified: false };
  for (const options of [{}, { compact: true }]) {
    const output = renderContacts(contacts, options);
    assert(!output.includes('href='));
    assert(output.includes('Запись временно недоступна'));
  }
  assert.equal(renderLocations(contacts), '');
});

test('verified channels are constrained and require at least one usable channel', () => {
  const configured = structuredClone(data);
  configured.contacts = contactFixture({ phones: ['+998900000000'], telegrams: [], hrTelegram: '', instagram: '', locations: [] });
  assert.doesNotThrow(() => validateContent(configured));
  assert(renderContacts(configured.contacts).includes('href="tel:+998900000000"'));
  configured.contacts.telegrams = ['javascript:alert(1)'];
  assert.throws(() => validateContent(configured), /Telegram/);
  configured.contacts = contactFixture({ phones: [], telegrams: ['https://t.me/stanford_nukus'] });
  assert.doesNotThrow(() => validateContent(configured));
  configured.contacts = contactFixture({ phones: [], telegrams: [] });
  assert.throws(() => validateContent(configured), /channel/);
});

function contactFixture(overrides = {}) {
  return {
    verified: true,
    phones: ['+998913036001', '+998994576001'],
    telegrams: ['https://t.me/stanford_nukus', 'https://t.me/Nukus_Stanford'],
    hrTelegram: 'https://t.me/hrstanfordlc',
    instagram: 'https://www.instagram.com/stanford_nukus/',
    locations: [{
      id: 'location-test', name: 'Точка центра', address: 'Адрес для проверки',
      maps: [
        { provider: 'google', url: 'https://maps.app.goo.gl/BDncqNjjgFkNAMUFA' },
        { provider: 'yandex', url: 'https://yandex.uz/maps/-/CXbaBC64' }
      ]
    }],
    ...overrides
  };
}

test('published contacts expose both admissions phones and Telegram accounts without unavailable placeholders', () => {
  assert.equal(data.contacts.verified, true);
  assert.deepEqual(Array.from(data.contacts.phones), ['+998913036001', '+998994576001']);
  assert.deepEqual(Array.from(data.contacts.telegrams), ['https://t.me/stanford_nukus', 'https://t.me/Nukus_Stanford']);
  assert.equal(data.contacts.hrTelegram, 'https://t.me/hrstanfordlc');
  assert.equal(data.contacts.instagram, 'https://www.instagram.com/stanford_nukus/');
  assert.equal(data.site.city, 'Нукус');
  const enroll = html.split('<!-- CONTACT_START:enroll -->')[1].split('<!-- CONTACT_END:enroll -->')[0];
  const dialog = html.split('<!-- CONTACT_START:dialog -->')[1].split('<!-- CONTACT_END:dialog -->')[0];
  for (const output of [enroll, dialog]) {
    for (const phone of data.contacts.phones) assert(output.includes(`href="tel:${phone}"`));
    for (const telegram of data.contacts.telegrams) assert(output.includes(`href="${telegram}"`));
  }
  assert(enroll.includes(`href="${data.contacts.hrTelegram}"`));
  assert(enroll.includes(`href="${data.contacts.instagram}"`));
  assert(!dialog.includes(data.contacts.hrTelegram));
  assert(!dialog.includes(data.contacts.instagram));
  assert(!dialog.includes('maps.app.goo.gl'));
  assert(!dialog.includes('yandex.uz/maps'));
  assert(!/<iframe\b/i.test(dialog));
  assert(!/Запись временно недоступна|Контакты уточняются/.test(html));
});

test('compact contacts keep admissions channels while the full view separates HR and social links', () => {
  const contacts = contactFixture();
  const full = renderContacts(contacts);
  const compact = renderContacts(contacts, { compact: true });
  for (const output of [full, compact]) {
    for (const phone of contacts.phones) assert.equal(output.split(`href="tel:${phone}"`).length - 1, 1);
    for (const telegram of contacts.telegrams) assert.equal(output.split(`href="${telegram}"`).length - 1, 1);
    assert(!/iframe|<form\b|mailto:/i.test(output));
    for (const tag of output.match(/<a\b[^>]*href="https:[^"]*"[^>]*>/g) || []) {
      assert(tag.includes('target="_blank"'));
      assert.match(tag, /rel="[^"]*\bnoopener\b[^\"]*\bnoreferrer\b[^"]*"/);
    }
  }
  assert(full.includes(`href="${contacts.hrTelegram}"`));
  assert(full.includes(`href="${contacts.instagram}"`));
  assert.match(full, /HR|ваканси|работ/iu);
  assert(!compact.includes(contacts.hrTelegram));
  assert(!compact.includes(contacts.instagram));
  for (const output of [full, compact]) {
    for (const map of contacts.locations[0].maps) assert(!output.includes(map.url));
  }
});

test('locations expose every supplied map as a safe link and escape names and addresses', () => {
  const contacts = contactFixture();
  contacts.locations[0].name = '<img src=x onerror="alert(1)">';
  contacts.locations[0].address = 'Дом & <script>alert(1)</script>';
  const output = renderLocations(contacts);
  assert(output.includes(escapeHTML(contacts.locations[0].name)));
  assert(output.includes(escapeHTML(contacts.locations[0].address)));
  assert(!/<img\b|<script\b|<iframe\b|<embed\b/i.test(output));
  for (const { url } of contacts.locations[0].maps) {
    assert.equal(output.split(`href="${url}"`).length - 1, 1);
    const tag = output.match(/<a\b[^>]*>/g).find(link => link.includes(`href="${url}"`));
    assert(tag.includes('target="_blank"'));
    assert.match(tag, /rel="[^"]*\bnoopener\b[^\"]*\bnoreferrer\b[^"]*"/);
  }
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
  const dialog = html.split('<!-- CONTACT_START:dialog -->')[1].split('<!-- CONTACT_END:dialog -->')[0];
  assert(data.contacts.locations.length > 0, 'Published locations must be configured');
  for (const location of data.contacts.locations) {
    for (const { url } of location.maps) {
      assert.equal(html.split(`href="${url}"`).length - 1, 1, `Map link must appear once: ${url}`);
      assert(main.includes(`href="${url}"`));
      assert(!dialog.includes(url));
    }
  }
  assert.equal(renderLocations(contactFixture({ locations: [] })), '');
});

test('every configured phone must use E164 rather than only validating the first entry', () => {
  for (const phone of ['998913036001', '+998 91 303 60 01', '+01234567890', '+1234567890123456', 'javascript:alert(1)']) {
    const configured = structuredClone(data);
    configured.contacts = contactFixture({ phones: ['+998913036001', phone] });
    assert.throws(() => validateContent(configured), undefined, `Accepted invalid phone ${phone}`);
  }
});

test('Telegram and Instagram reject non-profile URLs and HR cannot masquerade as admissions', () => {
  for (const telegram of [
    'javascript:alert(1)', 'https://t.me.evil.example/stanford_nukus',
    'https://name:pass@t.me/stanford_nukus', 'https://t.me/four',
    `https://t.me/${'a'.repeat(33)}`, 'https://t.me/stanford_nukus?start=x',
    'https://t.me/stanford_nukus#chat', 'https://t.me/stanford_nukus/extra'
  ]) {
    const configured = structuredClone(data);
    configured.contacts = contactFixture({ telegrams: ['https://t.me/stanford_nukus', telegram] });
    assert.throws(() => validateContent(configured), undefined, `Accepted invalid Telegram ${telegram}`);
    configured.contacts = contactFixture({ hrTelegram: telegram });
    assert.throws(() => validateContent(configured), undefined, `Accepted invalid HR Telegram ${telegram}`);
  }
  const duplicateHR = structuredClone(data);
  duplicateHR.contacts = contactFixture({ hrTelegram: 'https://t.me/STANFORD_NUKUS' });
  assert.throws(() => validateContent(duplicateHR));
  for (const instagram of [
    'http://www.instagram.com/stanford_nukus/', 'https://www.instagram.com.evil.example/stanford_nukus/',
    'https://name:pass@www.instagram.com/stanford_nukus/',
    'https://www.instagram.com/stanford_nukus/?ref=test',
    'https://www.instagram.com/stanford_nukus/#profile',
    'https://www.instagram.com/stanford_nukus/extra/'
  ]) {
    const configured = structuredClone(data);
    configured.contacts = contactFixture({ instagram });
    assert.throws(() => validateContent(configured), undefined, `Accepted invalid Instagram ${instagram}`);
  }
});

test('map providers enforce their own HTTPS short-link host and path without query or credentials', () => {
  const valid = structuredClone(data);
  valid.contacts = contactFixture();
  assert.doesNotThrow(() => validateContent(valid));
  for (const map of [
    { provider: 'google', url: 'javascript:alert(1)' },
    { provider: 'google', url: 'http://maps.app.goo.gl/BDncqNjjgFkNAMUFA' },
    { provider: 'google', url: 'https://maps.app.goo.gl.evil.example/BDncqNjjgFkNAMUFA' },
    { provider: 'google', url: 'https://user:pass@maps.app.goo.gl/BDncqNjjgFkNAMUFA' },
    { provider: 'google', url: 'https://maps.app.goo.gl/BDncqNjjgFkNAMUFA?ref=x' },
    { provider: 'google', url: 'https://maps.app.goo.gl/BDncqNjjgFkNAMUFA#map' },
    { provider: 'google', url: 'https://maps.app.goo.gl/BDncqNjjgFkNAMUFA/extra' },
    { provider: 'google', url: 'https://yandex.uz/maps/-/CXbaBC64' },
    { provider: 'yandex', url: 'https://maps.app.goo.gl/BDncqNjjgFkNAMUFA' },
    { provider: 'yandex', url: 'https://yandex.uz.evil.example/maps/-/CXbaBC64' },
    { provider: 'yandex', url: 'https://user:pass@yandex.uz/maps/-/CXbaBC64' },
    { provider: 'yandex', url: 'https://yandex.uz/maps/-/CXbaBC64?ref=x' },
    { provider: 'yandex', url: 'https://yandex.uz/maps/-/CXbaBC64#map' },
    { provider: 'yandex', url: 'https://yandex.uz/maps/-/CXbaBC64/extra' },
    { provider: 'yandex', url: 'https://yandex.uz/other/CXbaBC64' },
    { provider: 'other', url: 'https://maps.app.goo.gl/BDncqNjjgFkNAMUFA' },
    { provider: '__proto__', url: 'https://maps.app.goo.gl/BDncqNjjgFkNAMUFA' },
    { provider: 'constructor', url: 'https://maps.app.goo.gl/BDncqNjjgFkNAMUFA' }
  ]) {
    const configured = structuredClone(data);
    configured.contacts = contactFixture();
    configured.contacts.locations[0].maps = [map];
    assert.throws(() => validateContent(configured), /approved HTTPS map URL/, `Accepted ${map.provider}: ${map.url}`);
  }
});

test('map coordinates are optional, finite longitude/latitude pairs within geographic bounds', () => {
  const configured = structuredClone(data);
  configured.contacts = contactFixture();
  assert.doesNotThrow(() => validateContent(configured));
  for (const coordinates of [undefined, [-180, -90], [180, 90], [0, 0], [59.617, 42.47]]) {
    configured.contacts.locations[0].coordinates = coordinates;
    assert.doesNotThrow(() => validateContent(configured));
  }
  for (const coordinates of [null, '59,42', {}, [], [59], Array(2), [59, ,], [59, 42, 1], ['59', 42], [59, NaN], [Infinity, 42], [-Infinity, 42], [-180.01, 42], [180.01, 42], [59, -90.01], [59, 90.01]]) {
    configured.contacts.locations[0].coordinates = coordinates;
    assert.throws(() => validateContent(configured), /coordinates/i, `Accepted malformed coordinates ${String(coordinates)}`);
  }
});

function htmlAttributes(tag) {
  return Object.fromEntries([...tag.matchAll(/\b([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
}

const googleEmbedFixture = 'https://www.google.com/maps/embed?pb=fixture';

test('Google embed URLs permit only the exact maps embed endpoint and one nonempty pb parameter', () => {
  const configured = structuredClone(data);
  configured.contacts = contactFixture();
  assert.doesNotThrow(() => validateContent(configured));
  configured.contacts.locations[0].googleEmbed = googleEmbedFixture;
  assert.doesNotThrow(() => validateContent(configured));
  for (const googleEmbed of [
    null, '', 123, {}, 'javascript:alert(1)',
    'http://www.google.com/maps/embed?pb=fixture',
    'https://www.google.com.evil.example/maps/embed?pb=fixture',
    'https://google.com/maps/embed?pb=fixture',
    'https://user:pass@www.google.com/maps/embed?pb=fixture',
    'https://www.google.com/maps/embed/',
    'https://www.google.com/maps/embed?pb=',
    'https://www.google.com/maps/embed?other=fixture',
    'https://www.google.com/maps/embed?pb=fixture&other=value',
    'https://www.google.com/maps/embed?pb=fixture&pb=second',
    'https://www.google.com/maps/embed?pb=fixture#map',
    'https://www.google.com/maps/place?pb=fixture'
  ]) {
    configured.contacts.locations[0].googleEmbed = googleEmbed;
    assert.throws(() => validateContent(configured), /Google.*embed|embed.*Google/i, `Accepted invalid Google embed ${String(googleEmbed)}`);
  }
});

test('one lazy Google map has a static initial selection, accessible controls and escaped titles', () => {
  const contacts = structuredClone(data.contacts);
  const locations = contacts.locations.filter(location => location.googleEmbed);
  assert(locations.length > 1, 'The published map must include the confirmed branches');
  locations[0].googleEmbed = googleEmbedFixture;
  locations[0].name = '<img src=x onerror="alert(1)">';
  locations[0].address = 'Адрес & <script>alert(1)</script>';
  const output = renderLocations(contacts);
  const iframes = output.match(/<iframe\b[^>]*>/g) || [];
  assert.equal(iframes.length, 1);
  const frame = htmlAttributes(iframes[0]);
  assert.equal(frame.id, 'branch-map');
  assert(frame.class.split(/\s+/).includes('branch-map'));
  assert.equal(frame.src, escapeHTML(googleEmbedFixture));
  assert.equal(frame['data-map-provider'], undefined);
  assert.equal(frame.title, escapeHTML(`Карта: ${locations[0].name}`));
  assert.equal(frame.loading, 'lazy');
  assert.equal(frame.width, '1100');
  assert.equal(frame.height, '360');
  assert.equal(frame.referrerpolicy, 'strict-origin-when-cross-origin');
  assert.equal((output.match(/class="location-card"/g) || []).length, contacts.locations.length);
  assert.equal((output.match(/class="location-map-layout"/g) || []).length, 1);
  assert(output.indexOf('class="location-map-layout"') < output.indexOf('class="location-grid"'));
  assert(output.indexOf('class="location-grid"') < output.indexOf('class="branch-map-panel"'));
  const buttons = (output.match(/<button\b[^>]*\bdata-map-location="[^"]*"[^>]*>/g) || []).map(htmlAttributes);
  assert.equal(buttons.length, locations.length);
  assert.equal(new Set(buttons.map(button => button['aria-label'])).size, buttons.length);
  for (const [index, location] of locations.entries()) {
    const button = buttons.find(item => item['data-map-location'] === location.id);
    assert(button, `Missing branch selector: ${location.id}`);
    assert.equal(button.type, 'button');
    assert.equal(button['aria-controls'], 'branch-map');
    assert.equal(button['aria-label'], escapeHTML(`Показать на карте: ${location.name}`));
    assert.equal(button['aria-pressed'], String(index === 0));
    assert.equal(button['data-map-src'], escapeHTML(location.googleEmbed));
    assert.equal(button['data-map-title'], escapeHTML(`Карта: ${location.name}`));
    assert.equal(button['data-map-label'], escapeHTML(`${location.name} — ${location.address}`));
  }
  const status = output.match(/<p\b[^>]*\bid="map-status"[^>]*>([\s\S]*?)<\/p>/);
  assert(status);
  assert.equal(htmlAttributes(status[0])['aria-live'], 'polite');
  assert.equal(htmlAttributes(status[0]).tabindex, '-1');
  assert(status[1].includes(escapeHTML(locations[0].name)));
  assert(status[1].includes(escapeHTML(locations[0].address)));
  // The Yandex widget shows ads: it is never embedded, and no provider switch is offered.
  assert(!/map-providers|data-map-provider|yandex\.ru\/map-widget/.test(output));
  assert(!/<script\b|<img\b|<embed\b/i.test(output));
  const partial = structuredClone(contacts);
  delete partial.locations[0].googleEmbed;
  const partialOutput = renderLocations(partial);
  assert(!partialOutput.includes(`data-map-location="${partial.locations[0].id}"`), 'A branch without a Google embed has no map selector');
  assert(partialOutput.includes(`href="${partial.locations[0].maps[0].url}"`), 'Its map links remain');
  assert.equal(htmlAttributes(partialOutput.match(/<iframe\b[^>]*>/)[0]).src, escapeHTML(partial.locations[1].googleEmbed));
  const withoutEmbeds = renderLocations(contactFixture());
  assert(!/<iframe\b|data-map-location=/.test(withoutEmbeds));
  for (const { url } of contactFixture().locations[0].maps) assert(withoutEmbeds.includes(`href="${url}"`));
  assert.equal((html.match(/<iframe\b/g) || []).length, 1);
  assert(html.includes('Яндекс Карты'), 'Yandex remains available as a link');
});

test('CSP permits the map iframe origin while retaining restrictions on parent-page connections', () => {
  const caddy = fs.readFileSync(new URL('../Caddyfile', import.meta.url), 'utf8');
  const policy = caddy.match(/header Content-Security-Policy "([^"]+)"/)[1];
  const directives = new Map(policy.split(';').map(item => item.trim()).filter(Boolean).map(item => {
    const [name, ...values] = item.split(/\s+/);
    return [name, values];
  }));
  assert.deepEqual([...directives.get('frame-src')].sort(), ['https://www.google.com', 'https://yandex.ru']);
  assert.deepEqual(directives.get('connect-src'), ["'none'"]);
  assert.deepEqual(directives.get('object-src'), ["'none'"]);
  assert.deepEqual(directives.get('frame-ancestors'), ["'none'"]);
  assert.deepEqual(directives.get('script-src'), ["'self'"]);
});

test('rendered content escapes markup instead of injecting it', () => {
  assert.equal(escapeHTML('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
  const course = { ...data.courses[0], name: '<script>alert(1)</script>' };
  const output = renderCourses([course]);
  assert(!output.includes('<script>'));
  assert(output.includes('&lt;script&gt;'));
});

test('metadata is emitted only for a configured real HTTPS URL', () => {
  if (!data.site.url) assert(!html.includes('rel="canonical"'));
  const configured = structuredClone(data);
  configured.site.url = 'https://example.org/';
  assert(generate(html, configured).includes('content="https://example.org/assets/stanford-logo.png"'));
  configured.site.url = 'javascript:alert(1)';
  assert.throws(() => generate(html, configured), /HTTPS/);
});

test('public HTML has no invented biographies, contacts or unfinished translations', () => {
  assert(!/Lorem Johnson|Ipsum Williams|Долор Сит|Лорем Ипсум|Адиписцинг|123-45-67|stanford_central|Ташкент \/ Нукус/.test(html));
  assert(!html.includes('lang-switcher'));
  assert(!html.includes('enroll-form'));
  assert(!/<script>([\s\S]*?)<\/script>/.test(html));
  assert(!/style="/.test(html));
});

test('native modal, no lead-copy flow, and no automatic content motion beyond the sanctioned teachers marquee', () => {
  assert(html.includes('<dialog '));
  assert(!html.includes('prepared-message'));
  const js = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8');
  assert(js.includes('dialog.showModal()'));
  assert(!/cloneNode|faculty-loop|pointermove|FormData|clipboard/.test(js));
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  // PLAN-035: the owner sanctioned exactly one infinite loop — the teachers marquee.
  // It pauses on hover/focus and collapses to a static grid under reduced motion.
  const lines = css.split('\n');
  const marqueeLines = lines.filter(line => line.includes('team-marquee') && /\binfinite\b/.test(line));
  const otherInfinite = lines.filter(line => /\binfinite\b/.test(line) && !line.includes('team-marquee'));
  assert(marqueeLines.length === 1, 'The teachers marquee is the only sanctioned infinite animation');
  assert(otherInfinite.length === 0, 'No other infinite animations are allowed');
  // PLAN-037 (WCAG 2.2.2): touch users get a no-JS control that stops the marquee.
  assert(/<input type="checkbox" id="team-pause" aria-label="[^"]+">/.test(html), 'The marquee needs a labelled pause control');
  assert(css.includes('#teachers:has(#team-pause:checked) .team-track { display: contents; }'), 'Pausing must show the static grid');
});

test('theme initializes even when browser storage is blocked', () => {
  const context = { document: { documentElement: { dataset: {} } }, localStorage: { getItem() { throw new Error('blocked'); } }, matchMedia: () => ({ matches: true }) };
  vm.runInNewContext(fs.readFileSync(new URL('../theme-init.js', import.meta.url), 'utf8'), context);
  assert.equal(context.document.documentElement.dataset.theme, 'dark');
});

function runtime({ mapPresent = true, reducedMotion = false, viewportWidth = 1440, locations = data.contacts.locations } = {}) {
  function element(dataset = {}) {
    return {
      dataset, hidden: false, disabled: false, style: {}, attributes: {}, attributeWrites: [], handlers: {}, isConnected: true,
      children: [], scrollTop: 0, scrollCalls: 0, focusCalls: 0,
      classList: { toggle() {}, add() {}, remove() {} }, textContent: '',
      setAttribute(key, value) { this.attributes[key] = value; this.attributeWrites.push([key, value]); },
      getAttribute(key) { return this.attributes[key]; },
      addEventListener(type, handler) { this.handlers[type] = handler; },
      querySelectorAll() { return []; }, querySelector() { return null; },
      contains(node) { return node === this || this.children.some(child => typeof child === 'object' && child?.contains?.(node)); },
      replaceChildren() { this.children = []; },
      append(...nodes) { this.children = [...(this.children || []), ...nodes]; },
      scrollIntoView(options) { this.scrolled = true; this.scrollOptions = options; this.scrollCalls++; },
      focus(options) { this.focused = true; this.focusOptions = options; this.focusCalls++; document.activeElement = this; }
    };
  }
  const filters = ['all', 'languages', 'exam', 'kids', 'subjects'].map(filter => Object.assign(element({ filter }), { textContent: filter }));
  const cards = data.courses.map(course => element({ category: course.category, courseId: course.id }));
  const select = Object.assign(element(), { value: data.courses[0].id });
  const dialog = element();
  dialog.showModal = function () { this.open = true; };
  dialog.close = function () { this.open = false; this.handlers.close(); };
  const mapLocations = locations.filter(location => location.googleEmbed);
  const mapButtons = mapLocations.map((location, index) => {
    const button = element({
      mapLocation: location.id, mapSrc: location.googleEmbed,
      mapTitle: `Карта: ${location.name}`, mapLabel: `${location.name} — ${location.address}`
    });
    button.attributes['aria-pressed'] = String(index === 0);
    button.attributes['aria-controls'] = 'branch-map';
    return button;
  });
  const mapFrame = element();
  for (const key of ['src', 'title']) {
    Object.defineProperty(mapFrame, key, {
      get() { return this.getAttribute(key); },
      set(value) { this.setAttribute(key, value); }
    });
  }
  if (mapButtons.length) {
    mapFrame.attributes.src = mapButtons[0].dataset.mapSrc;
    mapFrame.attributes.title = mapButtons[0].dataset.mapTitle;
  }
  const mapStatus = element();
  mapStatus.textContent = mapButtons[0]?.dataset.mapLabel || '';
  const nodes = {
    '#course-filter-status': element(), '.menu': element(), '#navigation': element(),
    '#theme-toggle': element(), '#enroll-modal': dialog, '#contact-course': select,
    '#selected-course': element(), '#modal-close': element(), '.modal-body': element(),
    '#branch-map': mapPresent ? mapFrame : null, '#map-status': mapPresent ? mapStatus : null
  };
  const navigationLinks = [element(), element()];
  nodes['#navigation'].children = navigationLinks;
  nodes['#navigation'].querySelector = selector => selector === 'a' ? navigationLinks[0] : null;
  nodes['#navigation'].querySelectorAll = selector => selector === 'a' ? navigationLinks : [];
  for (const id of ['ielts', 'sat']) {
    const details = element();
    details.open = false;
    nodes[`#${id}`] = element();
    nodes[`#${id}`].querySelector = selector => selector === 'details' ? details : null;
  }
  nodes['#reset-filter'] = element();
  const documentHandlers = {};
  const document = {
    documentElement: { dataset: {} }, body: { style: { overflow: 'auto' } }, activeElement: null,
    querySelector: selector => nodes[selector],
    querySelectorAll: selector => {
      if (selector === '[data-filter]') return filters;
      if (selector === '[data-course-id]') return cards;
      if (selector === '[data-map-location]') return mapButtons;
      return [];
    },
    createElement: tag => Object.assign(element(), { tagName: tag.toUpperCase() }),
    addEventListener(type, handler) { documentHandlers[type] = handler; }
  };
  const windowHandlers = {};
  const context = {
    window: { schoolContent: { ...data, contacts: { ...data.contacts, locations } }, addEventListener(type, handler) { windowHandlers[type] = handler; } }, document, Intl,
    localStorage: { getItem() { throw new Error('blocked'); } },
    matchMedia: query => ({
      matches: query.includes('prefers-reduced-motion') ? reducedMotion : /max-width:\s*(\d+)px/.test(query) ? viewportWidth <= Number(query.match(/max-width:\s*(\d+)px/)[1]) : false,
      addEventListener() {}
    })
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8'), context);
  return { context, cards, nodes, element, document, filters, mapButtons, mapFrame, navigationLinks, windowHandlers, documentHandlers };
}

test('branch selection switches the Google map, preserves desktop focus and ignores unknown buttons', () => {
  const { context, nodes, mapButtons, mapFrame, document, element } = runtime();
  const srcWrites = () => mapFrame.attributeWrites.filter(([name]) => name === 'src').length;
  assert.equal(mapFrame.src, mapButtons[0].dataset.mapSrc);
  assert.match(mapFrame.src, /^https:\/\/www\.google\.com\/maps\/embed\?pb=/);
  mapButtons[0].focus();
  mapButtons[0].handlers.click();
  assert.equal(srcWrites(), 0, 'Reselecting the shown branch must not reload the map');
  const status = nodes['#map-status'];
  assert.equal(document.activeElement, mapButtons[0]);
  assert.equal(status.focusCalls, 0);
  assert.equal(status.scrollCalls, 0);
  const chosen = mapButtons[1];
  chosen.focus();
  chosen.handlers.click();
  assert.equal(mapFrame.src, chosen.dataset.mapSrc);
  assert.equal(mapFrame.title, chosen.dataset.mapTitle);
  assert.equal(status.textContent, chosen.dataset.mapLabel);
  assert.equal(document.activeElement, chosen);
  for (const button of mapButtons) assert.equal(button.getAttribute('aria-pressed'), String(button === chosen));
  const writesAfterSelection = srcWrites();
  chosen.handlers.click();
  assert.equal(srcWrites(), writesAfterSelection);
  const unrelated = element({ mapLocation: 'unknown', mapSrc: 'https://example.org/unsafe-map' });
  context.updateBranchMap(unrelated);
  assert.equal(mapFrame.src, chosen.dataset.mapSrc);
  assert.equal(status.textContent, chosen.dataset.mapLabel);
  assert.equal(srcWrites(), writesAfterSelection);
  mapButtons[2].handlers.click();
  assert.equal(mapFrame.src, mapButtons[2].dataset.mapSrc);
  mapButtons[0].handlers.click();
  assert.equal(mapFrame.src, mapButtons[0].dataset.mapSrc);
  const withoutFrame = runtime({ mapPresent: false });
  assert.doesNotThrow(() => withoutFrame.mapButtons[1].handlers.click());
  assert.equal(withoutFrame.document.documentElement.dataset.enhanced, 'true');
  const mobile = runtime({ viewportWidth: 390 });
  mobile.mapButtons[1].handlers.click();
  assert.equal(mobile.nodes['#map-status'].focused, true);
  assert.equal(mobile.nodes['#map-status'].focusOptions.preventScroll, true);
  assert.equal(mobile.nodes['#map-status'].scrollOptions.block, 'start');
  assert.equal(mobile.nodes['#map-status'].scrollOptions.behavior, 'smooth');
  const mobileWrites = mobile.mapFrame.attributeWrites.filter(([name]) => name === 'src').length;
  const mobileFocusCalls = mobile.nodes['#map-status'].focusCalls;
  mobile.mapButtons[1].handlers.click();
  assert.equal(mobile.mapFrame.attributeWrites.filter(([name]) => name === 'src').length, mobileWrites);
  assert.equal(mobile.nodes['#map-status'].focusCalls, mobileFocusCalls + 1);
  const motionReduced = runtime({ reducedMotion: true, viewportWidth: 390 });
  motionReduced.mapButtons[1].handlers.click();
  assert.equal(motionReduced.nodes['#map-status'].scrollOptions.behavior, 'auto');
});

test('keyboard menu closes when focus leaves the navigation while internal moves and the menu button keep it open', () => {
  const { nodes, navigationLinks, element, document } = runtime({ viewportWidth: 765 });
  const menu = nodes['.menu'];
  const navigation = nodes['#navigation'];
  menu.handlers.click({ detail: 0 });
  assert.equal(menu.getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement, navigationLinks[0]);
  navigation.handlers.focusout({ relatedTarget: navigationLinks[1] });
  assert.equal(menu.getAttribute('aria-expanded'), 'true');
  navigation.handlers.focusout({ relatedTarget: menu });
  assert.equal(menu.getAttribute('aria-expanded'), 'true');
  navigation.handlers.focusout({ relatedTarget: element() });
  assert.equal(menu.getAttribute('aria-expanded'), 'false');
  assert.equal(menu.getAttribute('aria-label'), 'Открыть меню');
  menu.handlers.click({ detail: 0 });
  navigation.handlers.focusout({ relatedTarget: null });
  assert.equal(menu.getAttribute('aria-expanded'), 'false');
});

function nodeText(node) {
  if (typeof node === 'string') return node;
  return `${node.textContent || ''}${(node.children || []).map(nodeText).join(' ')}`;
}

function descendantTags(node, tag) {
  return (node.children || []).flatMap(child => typeof child === 'string' ? [] : [
    ...(child.tagName === tag.toUpperCase() ? [child] : []),
    ...descendantTags(child, tag)
  ]);
}

test('catalog exposes each program condition without a disclosure and labels its full details', () => {
  for (const course of data.courses) {
    const output = renderCourses([course]);
    assert(!/<details\b/.test(output));
    const conditions = output.match(/<ul\b[^>]*\bclass="course-details"[^>]*>([\s\S]*?)<\/ul>/);
    assert(conditions, `Missing visible conditions: ${course.id}`);
    const items = [...conditions[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(match => match[1]);
    assert.deepEqual(items.map(item => item.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '')), Array.from(course.skills, escapeHTML));
    for (const item of items) assert.match(item, /<svg\b[^>]*aria-hidden="true"[^>]*focusable="false"/);
    assert.equal((conditions[1].match(/<li>/g) || []).length, course.skills.length);
    assert(output.includes('Программа и цены'));
    assert.match(output, new RegExp(`<a\\b[^>]*href="#prices"[^>]*data-open-course="${course.id}"`));
  }
});

test('course dialog shows both eligible prices and clears the discount when switching to IELTS', () => {
  const { context, nodes, element } = runtime();
  const course = data.courses.find(item => item.id === 'general-english');
  context.openModal(course.id, element());
  const summary = nodes['#selected-course'];
  assert.equal(summary.children[0].textContent, course.name);
  assert.equal(summary.children[1].textContent, course.description);
  assert.equal(summary.children[3].tagName, 'UL');
  assert.equal(summary.children[4].href, `#course-${course.id}`);
  const [prices] = descendantTags(summary.children[2], 'dl');
  assert(prices, 'Expected semantic price list');
  assert.equal(descendantTags(prices, 'dt').length, 2);
  assert.equal(descendantTags(prices, 'dd').length, 2);
  const pricesText = nodeText(prices);
  assert(pricesText.includes(new Intl.NumberFormat('ru-RU').format(course.price)));
  assert(pricesText.includes(new Intl.NumberFormat('ru-RU').format(course.specialPrice)));
  assert.match(pricesText, /обычн/iu);
  assert.match(pricesText, /семья\s*\/\s*два курса/iu);
  assert.match(nodeText(summary.children[2]), /подтверд|уточн/iu);
  nodes['#contact-course'].value = 'ielts';
  nodes['#contact-course'].handlers.change();
  const ielts = data.courses.find(item => item.id === 'ielts');
  const [ieltsPrices] = descendantTags(summary.children[2], 'dl');
  assert.equal(descendantTags(ieltsPrices, 'dt').length, 1);
  assert.equal(descendantTags(ieltsPrices, 'dd').length, 1);
  assert(nodeText(ieltsPrices).includes(new Intl.NumberFormat('ru-RU').format(ielts.price)));
  assert(!nodeText(summary.children[2]).includes(new Intl.NumberFormat('ru-RU').format(course.specialPrice)));
  assert(!/семья\s*\/\s*два курса/iu.test(nodeText(summary.children[2])));
});

test('dialog opens and switches courses at the top of its own scroll area, restoring page state on close', () => {
  const { context, nodes, document, element } = runtime();
  const trigger = element();
  const body = nodes['.modal-body'];
  body.scrollTop = 240;
  context.openModal('general-english', trigger);
  assert.equal(body.scrollTop, 0);
  assert.equal(document.body.style.overflow, 'hidden');
  body.scrollTop = 180;
  nodes['#contact-course'].value = 'sat';
  nodes['#contact-course'].handlers.change();
  assert.equal(body.scrollTop, 0);
  nodes['#enroll-modal'].close();
  assert.equal(document.body.style.overflow, 'auto');
  assert.equal(trigger.focused, true);
  body.scrollTop = 120;
  context.openModal('ielts', element());
  assert.equal(body.scrollTop, 0);
});

test('unsupported dialog falls back to static prices without locking page scroll or changing focus', () => {
  const { context, nodes, document, element } = runtime();
  const trigger = element();
  context.location = { hash: '' };
  nodes['#enroll-modal'].showModal = undefined;
  context.openModal('sat', trigger);
  assert.equal(context.location.hash, 'prices');
  assert.equal(document.body.style.overflow, 'auto');
  assert.equal(nodes['#enroll-modal'].open, undefined);
  assert.equal(trigger.focused, undefined);
});

test('exam details navigation validates IDs, opens the matching panel and transfers focus out of dialog', () => {
  for (const id of ['ielts', 'sat']) {
    const { context, nodes, document, element, documentHandlers } = runtime();
    const trigger = element();
    context.openModal(id, trigger);
    const examLink = nodes['#selected-course'].children.find(child => child.dataset?.examDetails === id);
    assert(examLink, `Missing exam details link: ${id}`);
    assert.equal(examLink.href, `#${id}`);
    context.revealExam('does-not-exist');
    context.revealExam('general-english');
    assert.equal(nodes['#enroll-modal'].open, true);
    assert.equal(nodes[`#${id}`].querySelector('details').open, false);
    assert.equal(nodes[`#${id}`].focused, undefined);
    assert.equal(document.body.style.overflow, 'hidden');
    const event = {
      target: { closest: selector => selector === '[data-exam-details]' ? examLink : null },
      preventDefault() { this.defaultPrevented = true; }
    };
    documentHandlers.click(event);
    assert.equal(nodes['#enroll-modal'].open, false);
    assert.equal(document.body.style.overflow, 'auto');
    assert.equal(trigger.focused, undefined);
    const panel = nodes[`#${id}`];
    assert.equal(panel.querySelector('details').open, true);
    assert.equal(panel.focused, true);
    assert.equal(panel.focusOptions.preventScroll, true);
    const other = nodes[id === 'ielts' ? '#sat' : '#ielts'];
    assert.equal(other.querySelector('details').open, false);
  }
});

test('whole client initializes without storage and filters the static cards', () => {
  const { context, cards, document, nodes } = runtime();
  assert.equal(document.documentElement.dataset.enhanced, 'true');
  context.filterCourses('exam', 'Экзамены');
  assert.equal(cards.filter(card => !card.hidden).length, 2);
  assert(nodes['#course-filter-status'].textContent.includes('2'));
  context.filterCourses('all', 'Все');
  assert.equal(cards.filter(card => !card.hidden).length, data.courses.length);
});

test('native modal selects the exact course and restores scroll and trigger focus', () => {
  const { context, nodes, element, document } = runtime();
  const trigger = element();
  context.openModal('general-english-kaa', trigger);
  assert.equal(nodes['#contact-course'].value, 'general-english-kaa');
  assert.equal(nodes['#enroll-modal'].open, true);
  assert.equal(document.body.style.overflow, 'hidden');
  assert(nodes['#selected-course'].children[0].textContent.includes('каракалпакском'));
  assert.equal(nodes['#selected-course'].children[3].children.length, data.courses.find(course => course.id === 'general-english-kaa').skills.length);
  nodes['#enroll-modal'].close();
  assert.equal(document.body.style.overflow, 'auto');
  assert.equal(trigger.focused, true);
});

test('filter counts match actual categories and are hidden from duplicate screen-reader text', () => {
  const output = renderFilters(data.courses);
  for (const category of ['all', 'languages', 'kids', 'subjects', 'exam']) {
    const count = data.courses.filter(course => category === 'all' || course.category === category).length;
    const button = output.match(new RegExp(`<button[^>]*data-filter="${category}"[\\s\\S]*?</button>`))[0];
    assert(button.includes(`aria-hidden="true">${count}</span>`));
    assert(button.includes(`: ${count}"`));
  }
});

test('reset reveals every course and restores focus to the all-programs filter', () => {
  const { context, nodes, cards, filters } = runtime();
  assert.equal(nodes['#reset-filter'].hidden, true);
  context.filterCourses('kids', 'Для детей');
  assert.equal(nodes['#reset-filter'].hidden, false);
  assert.equal(cards.filter(card => !card.hidden).length, 1);
  nodes['#reset-filter'].handlers.click();
  assert.equal(nodes['#reset-filter'].hidden, true);
  assert.equal(cards.filter(card => !card.hidden).length, data.courses.length);
  assert.equal(filters[0].focused, true);
});

test('each program has a static anchor and a matching link in the price list', () => {
  for (const course of data.courses) {
    assert(html.includes(`id="course-${course.id}" tabindex="-1"`));
    assert(html.includes(`href="#course-${course.id}" data-reveal-course="${course.id}"`));
  }
});

test('price navigation reveals a filtered course, but an unknown ID leaves the filter intact', () => {
  const { context, cards } = runtime();
  context.filterCourses('kids', 'Для детей');
  assert.equal(context.revealCourse('does-not-exist'), false);
  assert.equal(cards.filter(card => !card.hidden).length, 1);
  assert.equal(context.revealCourse('sat'), true);
  assert.equal(cards.filter(card => !card.hidden).length, data.courses.length);
  assert.equal(cards.find(card => card.dataset.courseId === 'sat').focused, true);
});

test('explicit navigation out of dialog keeps focus on the course instead of the old trigger', () => {
  const { context, nodes, cards, element, document } = runtime();
  const trigger = element();
  context.openModal('ielts', trigger);
  assert.equal(nodes['#selected-course'].children[4].href, '#course-ielts');
  context.revealCourse('ielts');
  assert.equal(nodes['#enroll-modal'].open, false);
  assert.equal(document.body.style.overflow, 'auto');
  assert.equal(trigger.focused, undefined);
  assert.equal(cards.find(card => card.dataset.courseId === 'ielts').focused, true);
});

test('hash navigation reveals and scrolls to a course after a conflicting filter', () => {
  const { context, cards } = runtime();
  context.filterCourses('kids', 'Для детей');
  context.window.location = { hash: '#course-general-english-kaa' };
  context.revealCourseFromHash();
  const card = cards.find(item => item.dataset.courseId === 'general-english-kaa');
  assert.equal(card.hidden, false);
  assert.equal(card.scrolled, true);
});

test('standard and eligible family prices appear together in each static table row', () => {
  const prices = renderPrices(data.courses);
  for (const course of data.courses) {
    const row = prices.split('<tr>').find(part => part.includes(`data-reveal-course="${course.id}"`));
    assert(row, `Missing static price row: ${course.id}`);
    assert.equal((row.match(/<th\b/g) || []).length, 1);
    const cells = [...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)];
    assert.equal(cells.length, 2);
    for (const cell of cells) assert.equal(htmlAttributes(`<td${cell[1]}>`).class, 'price-amount');
    assert(cells[0][2].includes(`<span class="price-standard">${new Intl.NumberFormat('ru-RU').format(course.price)}</span>`));
    if (course.specialPrice) {
      assert(cells[1][2].includes(`<span class="price-special"><strong>${new Intl.NumberFormat('ru-RU').format(course.specialPrice)}</strong></span>`));
      assert(!cells[1][2].includes('price-empty'));
    } else {
      assert.match(cells[1][2], /class="price-empty"/);
      assert.match(cells[1][2], /aria-label="Специальная цена не предусмотрена"/);
      assert(cells[1][2].includes('—'));
      assert(!cells[1][2].includes('price-special'));
    }
    assert(!/<small\b|обычная цена|семья \/ два курса/i.test(row));
  }
  const priceTable = [...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/g)]
    .find(match => (htmlAttributes(`<table${match[1]}>`).class || '').split(/\s+/).includes('price-table'));
  const tableHead = priceTable?.[2].match(/<thead>([\s\S]*?)<\/thead>/)?.[1];
  assert(tableHead);
  const headings = [...tableHead.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(match => match[1].replace(/<[^>]*>/g, ' '));
  assert.equal(headings.length, 3);
  assert.match(headings[1], /обычн/i);
  assert.match(headings[2], /семья|специальн/i);
});

test('discount conditions are visible without a popup, disclosure or JavaScript', () => {
  assert(html.includes('<p class="discount-note" id="discounts">'));
  assert(!html.includes('discount-explainer'));
  assert(!html.includes('data-open-discounts'));
  assert(!html.includes('discount-tooltip'));
});

test('hero starting prices use standard program prices and omit unavailable categories', () => {
  const english = data.courses.filter(course => course.name === 'General English');
  const output = renderHero(english);
  const lowestStandard = Math.min(...english.map(course => course.price));
  const lowestSpecial = Math.min(...english.map(course => course.specialPrice));
  assert(output.includes(new Intl.NumberFormat('ru-RU').format(lowestStandard)));
  assert(!output.includes(new Intl.NumberFormat('ru-RU').format(lowestSpecial)));
  assert(output.includes('data-goal="languages"'));
  assert(!output.includes('data-goal="exam"'));
  assert.equal(renderHero([]), '');
});
