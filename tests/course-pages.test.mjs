// One page per course: /courses/<code> and the copies /uz/courses/<code> …, built from templates/course.html.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LANGUAGES, buildCoursePages, renderCourseList, courseResults, courseTeachers, deeperPaths, readContent, renderCourseData, renderCoursePage, renderSitemap } from '../build.mjs';

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const fixture = JSON.parse(read('tests/fixtures/content.json'));
const course = { id: 'ielts', name: 'IELTS', category: 'exam', description: 'Подготовка к IELTS.', skills: ['Listening'], price: 800000 };

test('every course has a current page in Russian and in each translation, and removed courses leave no page', () => {
  const data = readContent();
  const pages = buildCoursePages(data);
  assert.equal(pages.size, data.courses.length * (1 + LANGUAGES.length));
  for (const [label, html] of pages) assert.equal(read(label), html, `${label} must be rebuilt with node build.mjs`);
  for (const folder of ['courses', ...LANGUAGES.map(lang => `${lang}/courses`)]) {
    for (const name of fs.readdirSync(new URL(`../${folder}/`, import.meta.url))) assert(pages.has(`${folder}/${name}`), `${folder}/${name} has no course`);
  }
  // The home card leads to the course page; translated copies keep the link inside their language.
  assert(read('index.html').includes('href="courses/ielts"'));
  assert(read('uz/index.html').includes('href="courses/ielts"'));
});

test('course pages are one folder deeper: shared files and other pages are reached through ../', () => {
  const ru = read('courses/ielts.html');
  assert(ru.includes('href="../style.css?v=') && ru.includes('src="../theme-init.js?v=') && ru.includes('href="../#courses"') && ru.includes('href="../courses/sat"'));
  const uz = read('uz/courses/ielts.html');
  assert.match(uz, /<html lang="uz" data-lang-page="uz">/);
  assert(uz.includes('href="../../style.css?v=') && uz.includes('src="../../assets/i18n/uz.js?v=') && uz.includes('href="../"') && uz.includes('href="../courses/sat"'));
  assert(uz.includes('<title>IELTS — Nukusdagi kurs | Stanford</title>'));
  assert.equal(deeperPaths('<a href="./">x</a><a href="#a">y</a><img src="/a.png" srcset="assets/a.webp 800w, assets/b.jpg 1600w"><a href="tel:+998">t</a>'),
    '<a href="../">x</a><a href="#a">y</a><img src="/a.png" srcset="../assets/a.webp 800w, ../assets/b.jpg 1600w"><a href="tel:+998">t</a>');
});

test('a course shows results of its own students, and the best results of the centre when it has none yet', () => {
  const results = [
    { score: '8.0', exam: 'IELTS', quote: 'a', student: 'A', course: 'IELTS, 4 месяца' },
    { score: '1500', exam: 'SAT', quote: 'b', student: 'B', course: 'SAT' },
    { score: 'B2', exam: 'CEFR', quote: 'c', student: 'C', course: 'General English, 6 месяцев', featured: true }
  ];
  assert.deepEqual(courseResults(course, results).map(result => result.student), ['A']);
  assert.deepEqual(courseResults({ ...course, id: 'general-english', name: 'General English' }, results).map(result => result.student), ['C']);
  const data = { site: {}, contacts: { verified: false }, courses: [course, { ...course, id: 'math', name: 'Математика' }], results, teachers: fixture.teachers, texts: {} };
  const own = renderCoursePage(course, data);
  assert.equal((own.match(/class="result-card result-card--compact"/g) || []).length, 1, 'Only IELTS results on the IELTS page');
  assert(own.includes('href="results#student-1"'), '«Подробнее» leads to this student on the results page');
  const fallback = renderCoursePage(data.courses[1], data);
  assert.equal((fallback.match(/class="result-card result-card--compact"/g) || []).length, 3, 'A course without own results shows the centre results');
  assert(fallback.indexOf('<strong>B2</strong>') < fallback.indexOf('<strong>8.0</strong>'), 'Featured results come first');
  assert(!renderCoursePage(course, { ...data, results: [] }).includes('course-results-title'), 'No results — no empty section');
  assert.deepEqual(courseTeachers(course, fixture.teachers).map(teacher => teacher.name), fixture.teachers.filter(teacher => /IELTS/.test(teacher.role)).map(teacher => teacher.name));
});

test('a course page uses only published facts and escapes everything from the admin', () => {
  const data = { site: { url: 'https://school.example' }, contacts: { verified: false }, courses: [{ ...course, name: '<IELTS>' }], results: [], teachers: [], texts: {} };
  const html = renderCoursePage(data.courses[0], data);
  assert(html.includes('&lt;IELTS&gt;') && !html.includes('<IELTS>'));
  assert(!html.includes('tel:') && !html.includes('t.me'), 'Unverified contacts give no call or Telegram buttons');
  assert(!html.includes('Семья или 2 курса'), 'A course without a family price shows only the monthly price');
  const [ld, trail] = renderCourseData(course, data.site).split('\n').map(block => JSON.parse(block.replace(/^<script type="application\/ld\+json">|<\/script>$/g, '')));
  assert.equal(trail['@type'], 'BreadcrumbList');
  assert.deepEqual(trail.itemListElement.map(item => item.item), ['https://school.example', 'https://school.example/#courses', 'https://school.example/courses/ielts']);
  assert.equal(ld['@type'], 'Course');
  assert.equal(ld.url, 'https://school.example/courses/ielts');
  assert.deepEqual(ld.offers, { '@type': 'Offer', category: 'Paid', price: 800000, priceCurrency: 'UZS' });
  assert.equal(renderCourseData(course, {}), '', 'No site address — no data block');
});

test('the sitemap lists every course page in all four languages', () => {
  const map = renderSitemap({ url: 'https://school.example' }, [course]);
  assert.equal((map.match(/<loc>/g) || []).length, 20);
  assert(map.includes('<loc>https://school.example/courses/ielts</loc>') && map.includes('<loc>https://school.example/kaa/courses/ielts</loc>'));
});

test('the home pages list every course page for search engines, each in its own language', () => {
  const data = readContent();
  if (!data.site.url) return;
  const list = html => JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"ItemList"[^<]*)<\/script>/)[1]);
  const ru = list(read('index.html'));
  assert.equal(ru.itemListElement.length, data.courses.length);
  assert(ru.itemListElement[0].url.endsWith(`/courses/${data.courses[0].id}`));
  assert(list(read('uz/index.html')).itemListElement.every(item => item.url.includes('/uz/courses/')));
  assert(read('kaa/index.html').includes('"@type":"EducationalOrganization"'), 'Translated home pages keep the centre card');
  assert.equal(renderCourseList({ url: 'https://school.example' }, data.courses.slice(0, 2)), '', 'Google asks for at least three courses');
});
