// A student's result can name its teacher: «Преподаватель: …» links to that teacher's card on the teachers page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDirectoryTeachers, renderResultCards, renderResultTeacher, teacherAnchor } from '../build.mjs';

const teachers = [{ name: 'Азиз Каримов', role: 'IELTS', featured: true }];
const result = { score: '8.0', exam: 'IELTS', quote: 'Отзыв.', student: 'Малика Т.', teacher: 'Азиз Каримов' };

test('a result with a published teacher links to the teacher card, which carries the same address', () => {
  const html = renderResultCards([result], { compact: true, teachers });
  const anchor = teacherAnchor('Азиз Каримов');
  assert.match(html, new RegExp(`<a class="result-mentor result-mentor--mini" href="teachers#${anchor}">.*Преподаватель:.*Азиз Каримов`));
  assert.match(html, /class="result-more" href="results#student-1"/);
  assert.match(renderDirectoryTeachers(teachers), new RegExp(`id="${anchor}"`));
});

test('an unknown teacher is shown as plain text and a result without a teacher shows nothing', () => {
  assert.doesNotMatch(renderResultTeacher(result, []), /<a /);
  assert.match(renderResultTeacher(result, []), /<p class="result-mentor">.*Преподаватель.*Азиз Каримов/);
  assert.equal(renderResultTeacher({ ...result, teacher: undefined }, teachers), '');
});
