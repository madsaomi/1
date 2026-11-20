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

test('field types and word limits reject numeric prose and malformed contacts', () => {
  for (const patch of [
    { education: '23112123' }, { about: '1'.repeat(30) },
    { name: 'Имя '.repeat(7).trim() }, { about: 'я '.repeat(61).trim() },
    { phone: '+998901234567abc' }, { telegram: '21321312213' }
  ]) assert.throws(() => validateApplication({ ...base, ...patch }), ValidationError);
});

test('resume PDF is generated in memory', async () => {
  const source = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#ffb703' } }).jpeg().toBuffer();
  const photo = await sanitizePhoto(`data:image/jpeg;base64,${source.toString('base64')}`);
  const application = validateApplication(base);
  const pdf = await buildResume({ ...application, date: '01.01.2026' }, photo);
  assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF');
  assert.ok(pdf.length > 2000);
});

test('every HR chat gets the resume; one failing chat does not lose the application', async () => {
  const { sendResume } = await import('./telegram.mjs');
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, { body }) => {
    const chat = body.get('chat_id');
    seen.push(chat);
    const ok = chat !== 'blocked';
    return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 403 });
  };
  const quiet = console.error;
  console.error = () => {};
  try {
    const args = { token: 't', pdf: Buffer.from('%PDF'), filename: 'a.pdf', position: 'Teacher' };
    assert.equal(await sendResume({ ...args, chatIds: ['111', 'blocked'] }), true);
    assert.deepEqual(seen, ['111', 'blocked']);
    await assert.rejects(sendResume({ ...args, chatIds: ['blocked'] }), /telegram_send_failed/);
  } finally {
    globalThis.fetch = original;
    console.error = quiet;
  }
});

test('separate Telegram status buttons update both complaint copies and ignore stale clicks', async t => {
  const { formatFeedback } = await import('./feedback.mjs');
  const { createFeedbackStatusHandler, sendFeedback } = await import('./telegram.mjs');
  const text = formatFeedback({
    kind: 'anonymous', topic: 'Предложение', branch: '', message: 'Добавьте вечернюю группу.'
  }, '19.11.2026, 14:08');
  const sends = [];
  const keyboards = new Map();
  const answers = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body);
    const method = new URL(url).pathname.split('/').at(-1);
    if (method === 'sendMessage') {
      sends.push(body);
      return Response.json({ ok: true, result: { message_id: Number(body.chat_id) + 1 } });
    }
    if (method === 'editMessageReplyMarkup') {
      assert.equal(body.message_id, Number(body.chat_id) + 1);
      keyboards.set(body.chat_id, body.reply_markup);
    } else if (method === 'answerCallbackQuery') {
      answers.push(body.text);
    } else {
      assert.fail(`Unexpected Telegram API method: ${method}`);
    }
    return Response.json({ ok: true, result: true });
  });

  const config = { token: 'test-token', chatIds: ['111', '222'] };
  await sendFeedback({ ...config, text });
  assert.deepEqual(sends.map(message => message.chat_id), config.chatIds);
  for (const message of sends) {
    assert.equal(message.parse_mode, 'HTML');
    assert.equal(message.text, text);
    assert.equal(message.disable_web_page_preview, true);
  }
  const button = (chat, status) => keyboards.get(chat).inline_keyboard[status][0];
  const labels = chat => keyboards.get(chat).inline_keyboard.map(([item]) => item.text);
  const callback = (chat, status, data = button(chat, status).callback_data, actor = Number(chat)) => ({
    id: 'test-callback',
    data,
    from: { id: actor },
    message: { chat: { id: Number(chat), type: 'private' }, message_id: Number(chat) + 1, reply_markup: keyboards.get(chat) }
  });
  assert.deepEqual(labels('111'), ['✓ Новая', 'В работе', 'Решено']);
  const old = callback('111', 1);
  const handle = createFeedbackStatusHandler(config);
  await handle(callback('111', 1, 'f2:0:0:1:112:223:0000000000000000'));
  await handle(callback('111', 1, undefined, 333));
  assert.equal(answers.length, 0);
  await handle(callback('222', 2));
  assert.equal(button('111', 2).text, '✓ Решено');
  assert.equal(button('111', 2).style, 'success');
  assert.deepEqual(keyboards.get('111'), keyboards.get('222'));
  await handle(old);
  assert.equal(button('111', 2).text, '✓ Решено');

  const restarted = createFeedbackStatusHandler(config);
  const reopen = callback('222', 0);
  await restarted(reopen);
  assert.deepEqual(labels('111'), ['✓ Новая', 'В работе', 'Решено']);
  await restarted(old);
  assert.equal(button('222', 0).text, '✓ Новая');
  await restarted(callback('111', 1));
  assert.equal(button('222', 1).style, 'primary');
  assert.deepEqual(labels('222'), ['Новая', '✓ В работе', 'Решено']);
  assert.equal(answers.at(-1), 'Текущий статус: В работе');
});
