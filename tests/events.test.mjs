import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generate, readContent, renderEvents, validateContent } from '../build.mjs';

test('events have an accessible static date, escaped text and an optional countdown without fake defaults', () => {
  assert.equal(renderEvents(), '');
  const html = renderEvents([{title: '<Speaking>', startsAt: '2027-01-05T18:00:00+05:00', description: '<script>', url: 'https://example.com/event'}]);
  assert.match(html, /&lt;Speaking&gt;/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<time datetime="2027-01-05T18:00:00\+05:00">/);
  assert.match(html, /18:00/);
  assert.match(html, /data-unit="seconds"/);
  assert.doesNotMatch(html, /aria-live/);
  assert.match(html, /<h3[^>]*>Запланированные события<\/h3>/);
  assert.doesNotMatch(html, /<section\b/);
});

test('planned events and their countdowns are generated inside the practice section', () => {
  const template = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const data = readContent();
  const event = {title: 'Тестовое событие', startsAt: '2027-01-05T18:00:00+05:00'};
  const output = generate(template, {...data, events: [event]});
  const start = output.indexOf('id="clubs"');
  const end = output.indexOf('</section>', start);
  const practice = output.slice(start, end);
  assert.match(practice, /class="practice-list"/);
  assert.match(practice, /id="events"/);
  assert.match(practice, /data-countdown="2027-01-05T18:00:00\+05:00"/);
  assert(practice.indexOf('id="events"') > practice.indexOf('<!-- PRACTICES_END -->'));
  const withoutEvents = generate(template, {...data, events: []});
  assert(!withoutEvents.includes('id="events"'));
  assert(!withoutEvents.includes('Запланированные события'));
});

test('event publication rejects unsafe links and ambiguous or invalid dates', () => {
  const data = readContent();
  const event = {title: 'Проверка', startsAt: '2027-01-05T18:00:00+05:00'};
  assert.doesNotThrow(() => validateContent({...data, events: [event]}));
  for (const startsAt of ['2027-01-05T18:00:00', 'invalid', '2027-99-05T18:00:00Z']) {
    assert.throws(() => validateContent({...data, events:[{...event, startsAt}]}));
  }
  for (const url of ['javascript:alert(1)', 'https://user:pass@example.com', 'http://example.com']) {
    assert.throws(() => validateContent({...data, events:[{...event, url}]}));
  }
});
