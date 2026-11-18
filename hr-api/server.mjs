import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { ValidationError, validateApplication } from './validation.mjs';
import { sanitizePhoto } from './photo.mjs';
import { buildResume } from './pdf.mjs';
import { sendResume, sendText } from './telegram.mjs';
import { formatFeedback, validateFeedback } from './feedback.mjs';

const PORT = Number(process.env.PORT || 8787);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
// One or more HR chats, comma-separated: every one of them gets the resume.
const HR_CHATS = (process.env.TELEGRAM_HR_CHAT_ID || '').split(',').map(chat => chat.trim()).filter(Boolean);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
// Complaints go to a separate bot and chat(s), so HR never sees them.
const FEEDBACK_BOT_TOKEN = process.env.FEEDBACK_BOT_TOKEN || '';
const FEEDBACK_CHATS = (process.env.FEEDBACK_CHAT_ID || '').split(',').map(chat => chat.trim()).filter(Boolean);
const DRY_RUN = process.env.HR_DRY_RUN === '1';
const HOST = process.env.HOST || '0.0.0.0';
// «Not a robot» check: with the secret key every form submission needs a valid Turnstile token.
// Tests may point the check at a local stand-in, but only in dry run: real intake always asks Cloudflare.
const TURNSTILE_SECRET = (process.env.TURNSTILE_SECRET_KEY || '').trim();
const TURNSTILE_URL = DRY_RUN && process.env.TURNSTILE_VERIFY_URL ? process.env.TURNSTILE_VERIFY_URL : '';
const proxyHopsValue = process.env.HR_TRUST_PROXY_HOPS || '0';
if (!/^\d+$/.test(proxyHopsValue) || Number(proxyHopsValue) > 10) {
  throw new Error('HR_TRUST_PROXY_HOPS must be an integer from 0 to 10');
}
const TRUST_PROXY_HOPS = Number(proxyHopsValue);
let originConfigured = false;
if (ALLOWED_ORIGIN) {
  try {
    const origin = new URL(ALLOWED_ORIGIN);
    originConfigured = ['https:', 'http:'].includes(origin.protocol) && origin.origin === ALLOWED_ORIGIN
      && !origin.username && !origin.password;
  } catch { /* An invalid configured origin cannot enable intake. */ }
}
const INTAKE_CONFIGURED = originConfigured && (DRY_RUN || Boolean(BOT_TOKEN.trim() && HR_CHATS.length));
const FEEDBACK_CONFIGURED = originConfigured && (DRY_RUN || Boolean(FEEDBACK_BOT_TOKEN.trim() && FEEDBACK_CHATS.length));
const configured = path => (path === '/feedback' ? FEEDBACK_CONFIGURED : INTAKE_CONFIGURED);
const MAX_BODY = 3.5 * 1024 * 1024;
const RATE_WINDOW = 30 * 60 * 1000;
const RATE_LIMIT = 4;

const attempts = new Map();

function clientIp(request) {
  const remote = request.socket.remoteAddress || 'unknown';
  if (TRUST_PROXY_HOPS === 0) return remote;
  // Count from the nearest proxy. A supplied leftmost XFF must never select the rate-limit key.
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',').map(value => value.trim());
  const chain = [...forwarded, remote];
  if (forwarded.some(value => !isIP(value)) || chain.length <= TRUST_PROXY_HOPS) return remote;
  return chain[chain.length - 1 - TRUST_PROXY_HOPS];
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
  if (!originConfigured || origin !== ALLOWED_ORIGIN) return {};
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

// Cloudflare Turnstile: checks the single-use «not a robot» token that the HR and complaints forms send.
// The visitor's address is not passed on; Cloudflare already sees it when the check runs in the browser.
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

async function verifyTurnstile({ secret, token, action, url = VERIFY_URL }) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const response = await fetch(url, {
    method: 'POST',
    body: new URLSearchParams({ secret, response: token }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('turnstile_unavailable');
  const result = await response.json();
  // The widget of one form cannot be reused for the other one.
  return result?.success === true && (!result.action || result.action === action);
}

// Takes the token out of the form data (the forms validate only their own fields) and checks it when enabled.
async function passesTurnstile(body, action, response) {
  const token = body && typeof body === 'object' ? body.turnstileToken : undefined;
  if (body && typeof body === 'object') delete body.turnstileToken;
  if (!TURNSTILE_SECRET) return true;
  try {
    if (await verifyTurnstile({ secret: TURNSTILE_SECRET, token, action, url: TURNSTILE_URL || VERIFY_URL })) return true;
    send(response, 403, { ok: false, error: 'captcha' });
  } catch {
    console.error(`[${action}] 503 turnstile unavailable`);
    send(response, 503, { ok: false, error: 'captcha_unavailable' });
  }
  return false;
}

function filename() {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date()).replaceAll('-', '');
  return `Stanford-anketa-${date}-${randomBytes(3).toString('hex')}.pdf`;
}

const server = http.createServer(async (request, response) => {
  const started = Date.now();
  let url;
  try {
    url = new URL(request.url || '/', 'http://localhost');
  } catch {
    send(response, 400, { ok: false, error: 'invalid_url' });
    return;
  }
  const cors = corsHeaders(request.headers.origin || '');
  response.setHeader('vary', 'Origin');
  for (const [key, value] of Object.entries(cors)) response.setHeader(key, value);

  if (request.method === 'OPTIONS' && ['/career', '/feedback'].includes(url.pathname)) {
    if (!configured(url.pathname)) { send(response, 503, { ok: false, error: 'not_configured' }); return; }
    const method = request.headers['access-control-request-method'];
    const headers = String(request.headers['access-control-request-headers'] || '')
      .toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
    const allowed = request.headers.origin === ALLOWED_ORIGIN && method === 'POST'
      && headers.every(header => ['content-type', 'x-career-request'].includes(header));
    response.writeHead(allowed ? 204 : 403);
    response.end();
    return;
  }
  if (request.method === 'GET' && url.pathname === '/healthz') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    response.end('ok');
    return;
  }
  if (request.method !== 'POST' || !['/career', '/feedback'].includes(url.pathname)) {
    send(response, 404, { ok: false, error: 'not_found' });
    return;
  }
  if (!configured(url.pathname)) {
    send(response, 503, { ok: false, error: 'not_configured' });
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
  // Separate limits per form; the address is only kept in memory for the limit and never sent anywhere.
  if (rateLimited(`${url.pathname}:${clientIp(request)}`)) {
    send(response, 429, { ok: false, error: 'rate_limited' });
    return;
  }

  if (url.pathname === '/feedback') {
    await handleFeedback(request, response, started);
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
    if (!(await passesTurnstile(body, 'career', response))) return;
    const application = validateApplication(body);
    const photo = await sanitizePhoto(application.photo);
    const date = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tashkent' }).format(new Date());
    const pdf = await buildResume({ ...application, date }, photo);
    if (!DRY_RUN) await sendResume({ token: BOT_TOKEN, chatIds: HR_CHATS, pdf, filename: filename(), position: application.position });
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

async function handleFeedback(request, response, started) {
  try {
    let body;
    try {
      body = JSON.parse(await readBody(request));
    } catch (error) {
      if (error?.status === 413) throw error;
      send(response, 400, { ok: false, error: 'invalid_json' });
      return;
    }
    if (!(await passesTurnstile(body, 'feedback', response))) return;
    const feedback = validateFeedback(body);
    const date = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tashkent', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    if (!DRY_RUN) await sendText({ token: FEEDBACK_BOT_TOKEN, chatIds: FEEDBACK_CHATS, text: formatFeedback(feedback, date) });
    console.log(`[feedback] 200 ${feedback.kind} ${Date.now() - started}ms${DRY_RUN ? ' (dry run)' : ''}`);
    send(response, 200, { ok: true });
  } catch (error) {
    if (error instanceof ValidationError) send(response, 400, { ok: false, error: 'validation', field: error.field });
    else if (error?.status === 413) send(response, 413, { ok: false, error: 'too_large' });
    else if (String(error?.message) === 'telegram_send_failed') send(response, 502, { ok: false, error: 'delivery_failed' });
    else {
      console.error(`[feedback] 500 ${Date.now() - started}ms`);
      send(response, 500, { ok: false, error: 'internal' });
    }
  }
}

server.listen(PORT, HOST, () => {
  console.log(`hr-api listening on ${server.address().port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
