import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { validateApplication, ValidationError } from './validation.mjs';
import { sanitizePhoto } from './photo.mjs';
import { buildResume } from './pdf.mjs';

const base = {
  name: 'Тестовый Кандидат',
  phone: '+998 90 123 45 67',
  telegram: '@test_candidate',
  position: 'Преподаватель английского',
  experience: '1–3 года',
  level: 'B2',
  education: 'НГПИ, английский язык',
  certificates: 'TKT, IELTS 7.5',
  about: 'Хочу работать в сильной команде и готовить учеников к экзаменам.',
  consent: true,
  photo: 'data:image/jpeg;base64,placeholder'
};

test('valid application is normalized', () => {
  const application = validateApplication(base);
  assert.equal(application.phone, '+998901234567');
  assert.equal(application.telegram, '@test_candidate');
  assert.equal(application.name, 'Тестовый Кандидат');
});

test('unknown fields, markup, bad phone and missing consent are rejected', () => {
  assert.throws(() => validateApplication({ ...base, extra: 'x' }), ValidationError);
  assert.throws(() => validateApplication({ ...base, company: 'bot' }), ValidationError);
  assert.throws(() => validateApplication({ ...base, consent: false }), ValidationError);
  assert.throws(() => validateApplication({ ...base, phone: '123' }), ValidationError);
  assert.throws(() => validateApplication({ ...base, position: 'Директор' }), ValidationError);
  assert.throws(() => validateApplication({ ...base, about: 'коротко' }), ValidationError);
  const cleaned = validateApplication({ ...base, name: 'Иван <script>Петров' });
  assert.equal(cleaned.name, 'Иван scriptПетров');
});

test('photo is re-encoded and capped', async () => {
  const source = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#ffb703' } }).jpeg({ quality: 95 }).toBuffer();
  const dataUrl = `data:image/jpeg;base64,${source.toString('base64')}`;
  const output = await sanitizePhoto(dataUrl);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.ok(metadata.width <= 900 && metadata.height <= 900);
  assert.ok(output.length < 700 * 1024);
  await assert.rejects(() => sanitizePhoto('data:image/png;base64,AAAA'), ValidationError);
});

test('resume PDF is generated in memory', async () => {
  const source = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#ffb703' } }).jpeg().toBuffer();
  const photo = await sanitizePhoto(`data:image/jpeg;base64,${source.toString('base64')}`);
  const application = validateApplication(base);
  const pdf = await buildResume({ ...application, date: '01.01.2026' }, photo);
  assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF');
  assert.ok(pdf.length > 2000);
});
