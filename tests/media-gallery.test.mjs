import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  generate, readContent, renderMediaGallery, renderPractices, renderTeachers,
  renderResultCards, renderResultProfiles, renderDirectoryTeachers, renderDirectoryResults, responsiveAttributes
} from '../build.mjs';

const image = { type: 'image', src: 'assets/stanford-logo.png', alt: 'Реальное занятие' };
const video = { type: 'video', src: 'assets/uploads/test-clip.mp4', poster: image.src, alt: 'Запись занятия' };
const media = [video, image];
const teacher = { name: 'Тестовый преподаватель', role: 'Английский', qualification: 'C1', featured: true };
const result = { student: 'Тестовый ученик', score: '8.0', exam: 'IELTS', quote: 'Тестовый отзыв.', consent: true, featured: true };
const practice = { id: 'speaking-club', title: 'Speaking Club', description: 'Описание занятия.' };

// Validate actual file existence in an isolated build root, never by placing fake
// media in the checkout (other test workers inspect every shipped asset).
let isolated;
let temporary;
test.before(async () => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stanford-gallery-test-'));
  fs.copyFileSync(new URL('../build.mjs', import.meta.url), path.join(temporary, 'build.mjs'));
  fs.mkdirSync(path.join(temporary, 'assets'));
  fs.copyFileSync(new URL('../assets/stanford-logo.png', import.meta.url), path.join(temporary, 'assets', 'photo.png'));
  fs.writeFileSync(path.join(temporary, 'assets', 'clip.mp4'), Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex'));
  isolated = await import(pathToFileURL(path.join(temporary, 'build.mjs')).href);
});
test.after(() => {
  if (!temporary) return;
  for (const name of ['photo.png', 'clip.mp4']) fs.unlinkSync(path.join(temporary, 'assets', name));
  fs.rmdirSync(path.join(temporary, 'assets'));
  fs.unlinkSync(path.join(temporary, 'build.mjs'));
  fs.rmdirSync(temporary);
});

const baseContent = () => ({
  site: { demoMode: false }, contacts: { verified: false }, teachers: [], results: [], practices: [],
  courses: [{ id: 'test-course', name: 'Тестовый курс', category: 'languages', description: 'Описание курса.',
    skills: ['Тестовая программа'], price: 1, target: '#prices' }]
});
const localImage = { type: 'image', src: 'assets/photo.png' };
const localVideo = { type: 'video', src: 'assets/clip.mp4', poster: localImage.src };

test('mixed galleries keep the admin order and expose native video controls without autoplay', () => {
  const output = renderMediaGallery(media, 'Speaking Club');
  assert(output.indexOf('<video ') < output.indexOf('<img '), 'The selected first video must remain first');
  assert.match(output, /<video controls playsinline preload="none" poster="assets\/stanford-logo\.png"/);
  assert.match(output, /src="assets\/uploads\/test-clip\.mp4"/);
  assert.match(output, /<a href="assets\/uploads\/test-clip\.mp4">Открыть видео<\/a>/);
  assert(!/\bautoplay\b/.test(output));
  assert.equal((output.match(/data-gallery-slide/g) || []).length, 2);
  assert.match(output, /data-gallery-controls hidden/);
  assert.match(output, /data-gallery-prev aria-label="Предыдущий слайд"/);
  assert.match(output, /data-gallery-next aria-label="Следующий слайд"/);
  assert.match(output, /data-gallery-status role="status" aria-live="polite" aria-atomic="true">1 \/ 2/);
  const reversed = renderMediaGallery([...media].reverse(), 'Speaking Club');
  assert(reversed.indexOf('<img ') < reversed.indexOf('<video '), 'The renderer must not force videos ahead of owner order');
});

test('gallery captions and labels are escaped and only the first hero photo loads eagerly', () => {
  const output = renderMediaGallery([{ ...image, alt: 'Фото "A&B" <съёмка>' }, image], 'Команда <A&B>', { eager: true });
  assert.match(output, /aria-label="Фото и видео: Команда &lt;A&amp;B&gt;"/);
  assert.match(output, /alt="Фото &quot;A&amp;B&quot; &lt;съёмка&gt;"/);
  assert.equal((output.match(/loading="eager"/g) || []).length, 1);
  assert.equal((output.match(/loading="lazy"/g) || []).length, 1);
  assert(!output.includes('<съёмка>'));
  assert(!renderMediaGallery([image], 'Команда').includes('loading="eager"'));
  assert(!renderMediaGallery([video], 'Команда').includes('poster="undefined"'));
  assert(!renderMediaGallery([{ ...video, poster: undefined }], 'Команда').includes(' poster='));
});

test('the same gallery is rendered in practice, teacher and student cards on home and directory pages', () => {
  const cards = [
    renderPractices([{ ...practice, media }]),
    renderTeachers([{ ...teacher, media }]),
    renderResultCards([{ ...result, media }]),
    renderResultProfiles([{ ...result, media }]),
    renderDirectoryTeachers([{ ...teacher, media }]),
    renderDirectoryResults([{ ...result, media }])
  ];
  for (const output of cards) {
    assert.match(output, /data-media-gallery/);
    assert.equal((output.match(/<video /g) || []).length, 1);
    assert.equal((output.match(/data-gallery-slide/g) || []).length, 2);
    assert(!/<(?:a|button)\b[^>]*>\s*<div class="media-gallery"/.test(output), 'Media controls must not be nested inside another interactive control');
  }
  assert.match(cards[0], /practice-media--gallery/);
  assert.match(cards[4], /profile-cover--gallery/);
  assert.match(cards[5], /profile-cover--gallery/);
});

test('legacy single photos and branded placeholders stay unchanged when the gallery is absent or empty', () => {
  for (const [render, row] of [
    [renderPractices, { ...practice, photo: image.src }],
    [renderTeachers, { ...teacher, photo: image.src }],
    [renderDirectoryTeachers, { ...teacher, photo: image.src }],
    [renderDirectoryResults, result], [renderResultCards, result], [renderResultProfiles, result]
  ]) {
    assert.equal(render([row]), render([{ ...row, media: [] }]));
  }
  assert.equal(renderMediaGallery(), '');
  assert.equal(renderMediaGallery([]), '');
  assert.match(renderPractices([practice]), /assets\/practice\/speaking\.svg/);
  assert(!renderPractices([{ ...practice, photo: image.src, media }]).includes('practice-media--photo'));
  assert(!renderDirectoryTeachers([{ ...teacher, photo: image.src, media }]).includes('class="profile-photo"'));
});

test('content validation accepts ordered image and video media for all four supported owners', () => {
  const data = baseContent();
  data.site.heroMedia = [localVideo, localImage];
  data.teachers = [{ ...teacher, media: [localImage, localVideo] }];
  data.results = [{ ...result, media: [localVideo] }];
  data.practices = [{ ...practice, media: [localImage] }];
  assert.doesNotThrow(() => isolated.validateContent(data));
  assert.doesNotThrow(() => isolated.validateMediaGallery(Array.from({ length: 8 }, () => localImage)));
  assert.doesNotThrow(() => isolated.validateMediaGallery([localVideo, localVideo]));
  data.results[0].consent = false;
  assert.throws(() => isolated.validateContent(data), /consent/, 'A video gallery cannot bypass student consent');
});

test('gallery validation rejects unsafe paths, unknown types, missing files and excessive galleries', () => {
  const invalid = [null, {}, 'video', [null], [[]], [Object.create({ type: 'image', src: localImage.src })],
    [{ type: 'constructor', src: localImage.src }], [{ src: localImage.src }],
    [{ ...localImage, src: 'https://example.org/photo.png' }],
    [{ ...localImage, src: 'assets/../secret.png' }],
    [{ ...localImage, src: 'assets/%2e%2e/secret.png' }],
    [{ ...localImage, src: '/assets/photo.png' }],
    [{ ...localImage, src: 'assets/missing.png' }],
    [{ ...localImage, src: 'assets/clip.mp4' }],
    [{ ...localImage, poster: localImage.src }],
    [{ ...localImage, alt: 'a'.repeat(161) }],
    [{ ...localVideo, src: 'assets/clip.webm' }],
    [{ ...localVideo, src: 'javascript:alert(1)' }],
    [{ ...localVideo, src: 'assets/missing.mp4' }],
    [{ ...localVideo, poster: 'assets/clip.mp4' }],
    [{ ...localVideo, poster: 'https://example.org/poster.png' }],
    Array.from({ length: 9 }, () => localImage), [localVideo, localVideo, localVideo]];
  for (const value of invalid) assert.throws(() => isolated.validateMediaGallery(value));
  const setters = [
    (data, value) => { data.site.heroMedia = value; },
    (data, value) => { data.teachers = [{ ...teacher, media: value }]; },
    (data, value) => { data.results = [{ ...result, media: value }]; },
    (data, value) => { data.practices = [{ ...practice, media: value }]; }
  ];
  for (const set of setters) {
    const data = baseContent();
    set(data, [{ ...localImage, src: 'assets/../outside.png' }]);
    assert.throws(() => isolated.validateContent(data));
  }
});

test('hero media precedes the cashback teaser and leaves both the teaser and empty defaults intact', () => {
  let template = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  if (!template.includes('<!-- HERO_MEDIA_START -->')) {
    template = template.replace('<!-- REWARD_START -->', '<!-- HERO_MEDIA_START -->\n<!-- HERO_MEDIA_END -->\n<!-- REWARD_START -->');
  }
  const data = structuredClone(readContent());
  const empty = generate(template, data);
  const withGallery = generate(template, { ...data, site: { ...data.site, heroMedia: [image] } });
  assert(!/<!-- HERO_MEDIA_START -->\s*<div/.test(empty));
  assert.match(withGallery, /<!-- HERO_MEDIA_START -->\s*<div class="media-gallery"/);
  assert.match(withGallery, /loading="eager"/);
  assert(withGallery.indexOf('data-media-gallery') < withGallery.indexOf('class="hero-reward-banner"'));
  const reward = output => output.match(/<!-- REWARD_START -->[\s\S]*?<!-- REWARD_END -->/)?.[0];
  assert.equal(reward(empty), reward(withGallery), 'Adding media must not remove or rewrite the cashback facts');
  assert.equal(generate(withGallery, { ...data, site: { ...data.site, heroMedia: [image] } }), withGallery);
});

test('a published phone copy is offered through srcset only when the file exists', () => {
  const uploads = new URL('../assets/uploads/', import.meta.url);
  const created = !fs.existsSync(uploads);
  const hash = 'f'.repeat(63) + '0';
  const photo = `assets/uploads/${hash}.jpg`;
  const small = new URL(`${hash}-800.webp`, uploads);
  try {
    assert.equal(responsiveAttributes(photo), '', 'No copy yet: plain src');
    fs.mkdirSync(uploads, { recursive: true });
    fs.writeFileSync(small, 'webp');
    assert.equal(responsiveAttributes(photo), ` srcset="assets/uploads/${hash}-800.webp 800w, ${photo} 1600w" sizes="(max-width: 767px) 100vw, 400px"`);
    assert.match(renderMediaGallery([{ type: 'image', src: photo, alt: 'Фото' }], 'Тест'), /srcset="assets\/uploads\/f+0-800\.webp 800w/);
    assert.equal(responsiveAttributes('assets/stanford-logo.png'), '', 'Only admin uploads have phone copies');
    assert.equal(responsiveAttributes('assets/uploads/../x.jpg'), '');
  } finally {
    fs.rmSync(small, { force: true });
    if (created) fs.rmSync(uploads, { recursive: true, force: true });
  }
});
