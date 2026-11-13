import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generate, readContent, renderDirectoryResults, renderDirectoryTeachers, renderPractices, validateContent} from '../build.mjs';

test('practice cards publish the selected real photo, safe alternative text and no invented imagery', () => {
  const card = {id: 'speaking-club', title: 'Speaking Club', description: 'Разговорная практика.', photo: 'assets/stanford-logo.png', photoAlt: 'Участники обсуждают тему <в группе>'};
  const output = renderPractices([card]);
  assert.match(output, /practice-media--photo/);
  assert.match(output, /src="assets\/stanford-logo.png"/);
  assert.match(output, /alt="Участники обсуждают тему &lt;в группе&gt;"/);
  assert(!output.includes('assets/practice/speaking.svg'));
  assert.match(renderPractices([{...card, photo: undefined}]), /assets\/practice\/speaking.svg/);
  assert.match(renderPractices([{...card, id: 'constructor', photo: undefined}]), /src="assets\/stanford-icon.svg"/);
  const data = structuredClone(readContent());
  validateContent({...data, practices: [card]});
  for (const changes of [{photo: 'https://external.example/photo.jpg'}, {id: '../escape'}, {description: ''}]) {
    assert.throws(() => validateContent({...data, practices: [{...card, ...changes}]}));
  }
});

test('empty lists stay honest and compact and resume displaying after a real entry is published', () => {
  const data = {...structuredClone(readContent()), teachers: [], results: [], stats: []};
  assert.match(renderDirectoryTeachers([]), /Информация о преподавателях пока не опубликована/);
  assert.match(renderDirectoryResults([]), /Результаты пока не опубликованы/);
  const template = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const empty = generate(template, {...data, practices: [], events: []});
  assert.match(empty, /<section\b[^>]*id="clubs"[^>]*hidden/);
  assert.match(empty, /<section\b[^>]*id="teachers"[^>]*hidden/);
  const restored = generate(empty, {...data, teachers: [{name:'Настоящий преподаватель', role:'Английский'}]});
  assert(!/<section\b[^>]*id="teachers"[^>]*hidden/.test(restored));
  assert.match(restored, /Все преподаватели/);
});
