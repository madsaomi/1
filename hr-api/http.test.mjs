import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
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
