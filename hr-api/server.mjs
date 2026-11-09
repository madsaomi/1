import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { ValidationError, validateApplication } from './validation.mjs';
import { sanitizePhoto } from './photo.mjs';
import { buildResume } from './pdf.mjs';
import { sendResume } from './telegram.mjs';

const PORT = Number(process.env.PORT || 8787);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const HR_CHAT = process.env.TELEGRAM_HR_CHAT_ID || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
const DRY_RUN = process.env.HR_DRY_RUN === '1';
const MAX_BODY = 3.5 * 1024 * 1024;
const RATE_WINDOW = 30 * 60 * 1000;
const RATE_LIMIT = 4;

const attempts = new Map();

function clientIp(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || request.socket.remoteAddress || 'unknown';
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter(time => now - time < RATE_WINDOW);
  if (recent.length >= RATE_LIMIT) {
    attempts.set(ip, recent);
    return true;
  }
  recent.push(now);
  attempts.set(ip, recent);
  if (attempts.size > 5000) {
    for (const [key, times] of attempts) if (!times.some(time => now - time < RATE_WINDOW)) attempts.delete(key);
  }
  return false;
}

function send(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(body);
}

function corsHeaders(origin) {
  if (!ALLOWED_ORIGIN || origin !== ALLOWED_ORIGIN) return {};
  return {
    'access-control-allow-origin': ALLOWED_ORIGIN,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-career-request',
    'access-control-max-age': '600'
  };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('too_large'), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function originAllowed(request) {
  const origin = request.headers.origin;
  if (!origin) return true; // curl and server-to-server checks
  return Boolean(ALLOWED_ORIGIN) && origin === ALLOWED_ORIGIN;
}

function filename() {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date()).replaceAll('-', '');
  return `Stanford-anketa-${date}-${randomBytes(3).toString('hex')}.pdf`;
}

const server = http.createServer(async (request, response) => {
  const started = Date.now();
  const url = new URL(request.url || '/', 'http://localhost');
  const cors = corsHeaders(request.headers.origin || '');
  for (const [key, value] of Object.entries(cors)) response.setHeader(key, value);

  if (request.method === 'OPTIONS' && url.pathname === '/career') {
    response.writeHead(ALLOWED_ORIGIN ? 204 : 403);
    response.end();
    return;
  }
  if (request.method === 'GET' && url.pathname === '/healthz') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    response.end('ok');
    return;
  }
  if (request.method !== 'POST' || url.pathname !== '/career') {
    send(response, 404, { ok: false, error: 'not_found' });
    return;
  }
  if (!originAllowed(request) || request.headers['x-career-request'] !== '1') {
    send(response, 403, { ok: false, error: 'forbidden' });
    return;
  }
  if (!(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    send(response, 415, { ok: false, error: 'unsupported_media_type' });
    return;
  }
  if (rateLimited(clientIp(request))) {
    send(response, 429, { ok: false, error: 'rate_limited' });
    return;
  }
  if (!BOT_TOKEN && !DRY_RUN) {
    send(response, 503, { ok: false, error: 'not_configured' });
    return;
  }

  try {
    const raw = await readBody(request);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      send(response, 400, { ok: false, error: 'invalid_json' });
      return;
    }
    const application = validateApplication(body);
    const photo = await sanitizePhoto(application.photo);
    const date = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tashkent' }).format(new Date());
    const pdf = await buildResume({ ...application, date }, photo);
    if (!DRY_RUN) await sendResume({ token: BOT_TOKEN, chatId: HR_CHAT, pdf, filename: filename(), position: application.position });
    console.log(`[career] 200 ${Date.now() - started}ms${DRY_RUN ? ' (dry run)' : ''}`);
    send(response, 200, { ok: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      send(response, 400, { ok: false, error: 'validation', field: error.field });
    } else if (error?.status === 413) {
      send(response, 413, { ok: false, error: 'too_large' });
    } else if (String(error?.message) === 'telegram_send_failed') {
      console.error(`[career] 502 telegram ${Date.now() - started}ms`);
      send(response, 502, { ok: false, error: 'delivery_failed' });
    } else {
      console.error(`[career] 500 ${Date.now() - started}ms`);
      send(response, 500, { ok: false, error: 'internal' });
    }
  }
});

server.listen(PORT, () => {
  console.log(`hr-api listening on ${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
