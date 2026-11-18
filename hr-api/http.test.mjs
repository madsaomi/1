import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import http from 'node:http';
import sharp from 'sharp';

const directory = fileURLToPath(new URL('.', import.meta.url));
const origin = 'http://127.0.0.1:8080';

async function startApi(t, overrides = {}) {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: directory,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', HR_DRY_RUN: '1',
      TELEGRAM_BOT_TOKEN: '', TELEGRAM_HR_CHAT_ID: '', ALLOWED_ORIGIN: origin,
      HR_TRUST_PROXY_HOPS: '0', ...overrides },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  });
  return await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('HR API did not start')); }, 15000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('HR API exited before startup')); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/hr-api listening on (\d+)/);
      if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
}

function submit(base, headers = {}, body = '{}') {
  return fetch(`${base}/career`, { method: 'POST', headers: {
    origin, 'content-type': 'application/json', 'x-career-request': '1', ...headers
  }, body });
}

test('a malformed absolute request target returns 400 without terminating the API process', async t => {
  const base = new URL(await startApi(t));
  const response = await new Promise((resolve, reject) => {
    const request = http.request({ hostname: base.hostname, port: base.port, path: 'http://[', method: 'GET' }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
    request.end();
  });
  assert.equal(response.status, 400);
  assert.equal(JSON.parse(response.body).error, 'invalid_url');
  assert.equal((await fetch(new URL('/healthz', base))).status, 200);
});

test('intake fails closed without origin or delivery configuration, while health remains available', async t => {
  for (const overrides of [
    { ALLOWED_ORIGIN: '' },
    { ALLOWED_ORIGIN: `${origin}/unexpected-path` },
    { HR_DRY_RUN: '0', TELEGRAM_BOT_TOKEN: 'unused-test-token', TELEGRAM_HR_CHAT_ID: '' },
    { HR_DRY_RUN: '0', TELEGRAM_BOT_TOKEN: '', TELEGRAM_HR_CHAT_ID: 'unused-test-chat' }
  ]) {
    const base = await startApi(t, overrides);
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    const response = await submit(base);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'not_configured');
    assert.equal((await fetch(`${base}/career`, { method: 'OPTIONS', headers: {
      origin, 'access-control-request-method': 'POST'
    } })).status, 503);
  }
});

test('CORS preflight checks origin, method and requested headers; invalid clients cannot consume the rate limit', async t => {
  const base = await startApi(t);
  const preflight = headers => fetch(`${base}/career`, { method: 'OPTIONS', headers: {
    origin, 'access-control-request-method': 'POST',
    'access-control-request-headers': 'Content-Type, X-Career-Request', ...headers
  } });
  const allowed = await preflight({});
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
  assert.equal(allowed.headers.get('vary'), 'Origin');
  for (const headers of [{ origin: 'https://other.example' },
    { 'access-control-request-method': 'DELETE' },
    { 'access-control-request-headers': 'authorization' }]) {
    assert.equal((await preflight(headers)).status, 403);
  }
  const rejected = await submit(base, { origin: 'https://other.example' });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal((await submit(base, { 'x-career-request': '' })).status, 403);
  }
  assert.equal((await submit(base)).status, 400);
  assert.equal((await fetch(`${base}/missing`)).status, 404);
});

test('dry-run HTTP intake validates the application and builds its PDF without Telegram credentials', async t => {
  const base = await startApi(t);
  assert.equal((await submit(base, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await submit(base, {}, '{')).status, 400);
  const rejected = await submit(base);
  assert.equal((await rejected.json()).error, 'validation');
  const photo = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#ffb703' } })
    .jpeg().toBuffer();
  const response = await submit(base, {}, JSON.stringify({
    name: 'Тестовый Кандидат', phone: '+998 90 123 45 67', telegram: '@test_candidate',
    position: 'Преподаватель английского', experience: '1–3 года', level: 'B2',
    education: 'НГПИ, английский язык', certificates: 'IELTS 7.5',
    about: 'Хочу работать в сильной команде и готовить учеников к экзаменам.',
    consent: true, photo: `data:image/jpeg;base64,${photo.toString('base64')}`
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('untrusted X-Forwarded-For cannot rotate the default rate-limit key', async t => {
  const base = await startApi(t);
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await submit(base, { 'x-forwarded-for': `198.51.100.${attempt + 1}` });
    assert.equal(response.status, attempt < 4 ? 400 : 429);
  }
});

test('explicit proxy trust counts from the nearest hop and ignores forged leftmost addresses', async t => {
  const base = await startApi(t, { HR_TRUST_PROXY_HOPS: '1' });
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await submit(base, {
      'x-forwarded-for': `198.51.100.${attempt + 1}, 203.0.113.8`
    });
    assert.equal(response.status, attempt < 4 ? 400 : 429);
  }
  assert.equal((await submit(base, { 'x-forwarded-for': '203.0.113.9' })).status, 400);
});

test('one form accepts at most the hourly ceiling from all visitors together; the other form is not affected', async t => {
  const base = await startApi(t, { HR_FORM_LIMIT_PER_HOUR: '3', HR_TRUST_PROXY_HOPS: '1' });
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await submit(base, { 'x-forwarded-for': `198.51.100.${attempt + 1}` });
    assert.equal(response.status, attempt < 3 ? 400 : 429, `attempt ${attempt + 1}`);
  }
  const complaint = await fetch(`${base}/feedback`, { method: 'POST', headers: {
    origin, 'content-type': 'application/json', 'x-career-request': '1' }, body: '{}' });
  assert.equal(complaint.status, 400, 'Complaints keep their own ceiling');
});

test('invalid proxy hop settings prevent startup', async () => {
  for (const hops of ['-1', '1.5', '11', 'true']) {
    const child = spawn(process.execPath, ['server.mjs'], { cwd: directory,
      env: { ...process.env, PORT: '0', HOST: '127.0.0.1', TELEGRAM_BOT_TOKEN: '',
        TELEGRAM_HR_CHAT_ID: '', HR_TRUST_PROXY_HOPS: hops },
      stdio: ['ignore', 'ignore', 'pipe'] });
    let errorOutput = '';
    child.stderr.on('data', chunk => { errorOutput += chunk; });
    const [code] = await once(child, 'exit');
    assert.notEqual(code, 0);
    assert.match(errorOutput, /HR_TRUST_PROXY_HOPS must be an integer from 0 to 10/);
  }
});

test('complaints: anonymous ones carry no contacts, official ones need name, phone and consent', async t => {
  // Each server allows 4 submissions per 30 minutes from one address, so the checks use two of them.
  let base = await startApi(t);
  const post = body => fetch(`${base}/feedback`, { method: 'POST', headers: {
    origin, 'content-type': 'application/json', 'x-career-request': '1' }, body: JSON.stringify(body) });
  const message = 'Преподаватель часто опаздывает на занятия, просим разобраться.';
  const anonymous = await post({ kind: 'anonymous', topic: 'Обучение и преподаватель', branch: 'Филиал на Сараева', message });
  assert.equal(anonymous.status, 200);
  assert.equal((await post({ kind: 'anonymous', topic: 'Другое', message, name: 'Анна' })).status, 400, 'Anonymous must not accept a name');
  assert.equal((await post({ kind: 'official', topic: 'Другое', message, name: 'Анна', phone: '+998901234567' })).status, 400, 'Consent is required');
  base = await startApi(t);
  const official = await post({ kind: 'official', topic: 'Оплата и документы', message, name: 'Анна Иванова', phone: '+998 90 123 45 67', consent: true });
  assert.equal(official.status, 200);
  assert.equal((await post({ kind: 'official', topic: 'Неизвестно', message, name: 'Анна', phone: '+998901234567', consent: true })).status, 400);
  assert.equal((await fetch(`${base}/feedback`, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json', 'x-career-request': '1' }, body: '{}' })).status, 403);
});

async function fakeCloudflare(t) {
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      const form = new URLSearchParams(body);
      const [token, action] = (form.get('response') || '').split(':');
      response.writeHead(token === 'down' ? 500 : 200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ success: form.get('secret') === 'test-secret' && token === 'good', action }));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}/siteverify`;
}

test('with the Turnstile secret every form needs a valid token of its own form; without it the token is ignored', async t => {
  const verify = await fakeCloudflare(t);
  const message = 'Преподаватель часто опаздывает на занятия, просим разобраться.';
  const complaint = token => JSON.stringify({ kind: 'anonymous', topic: 'Другое', message, ...(token === undefined ? {} : { turnstileToken: token }) });
  const post = (base, path, body) => fetch(`${base}${path}`, { method: 'POST', headers: {
    origin, 'content-type': 'application/json', 'x-career-request': '1' }, body });
  let base = await startApi(t, { TURNSTILE_SECRET_KEY: 'test-secret', TURNSTILE_VERIFY_URL: verify });
  assert.equal((await post(base, '/feedback', complaint('good:feedback'))).status, 200);
  for (const token of [undefined, 'bad:feedback', 'good:career']) {
    const response = await post(base, '/feedback', complaint(token));
    assert.equal(response.status, 403, String(token));
    assert.equal((await response.json()).error, 'captcha');
  }
  base = await startApi(t, { TURNSTILE_SECRET_KEY: 'test-secret', TURNSTILE_VERIFY_URL: verify });
  const down = await post(base, '/feedback', complaint('down:feedback'));
  assert.equal(down.status, 503);
  assert.equal((await down.json()).error, 'captcha_unavailable');
  const career = await post(base, '/career', JSON.stringify({ turnstileToken: 'good:career' }));
  assert.equal((await career.json()).error, 'validation', 'A valid token leads on to the usual form checks');
  // Without the secret the forms work as before, even when the page sends a token.
  base = await startApi(t);
  assert.equal((await post(base, '/feedback', complaint('anything'))).status, 200);
});

test('complaint text for Telegram is plain and the anonymous one says no contacts were given', async () => {
  const { formatFeedback } = await import('./feedback.mjs');
  const text = formatFeedback({ kind: 'anonymous', topic: 'Другое', branch: '', message: '<b>Текст</b>' }, '18.11.2026, 10:00');
  assert(text.startsWith('🕶 Анонимная жалоба') && text.includes('Филиал: не указан') && text.includes('<b>Текст</b>'));
  assert(!/Имя|Телефон/.test(text));
});
