// Browser tests: build a demo copy of the site in a temporary folder and serve it the way Caddy does
// (short addresses, the branded 404, the same Content-Security-Policy). Nothing in the project changes.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const port = Number(process.env.E2E_PORT || 4310);
const site = fs.mkdtempSync(path.join(os.tmpdir(), 'stanford-e2e-'));

const copy = name => fs.cpSync(path.join(root, name), path.join(site, name), { recursive: true });
for (const name of ['build.mjs', 'index.html', 'results.html', 'teachers.html', 'career.html', 'privacy.html', 'feedback.html',
  'script.js', 'results.js', 'career.js', 'feedback.js', 'theme-init.js', 'style.css', 'assets', 'templates']) copy(name);

// Demo data: the real content plus sample people and events (marked «Пример» by demo mode).
const context = { window: {} };
const vm = await import('node:vm');
vm.runInNewContext(fs.readFileSync(path.join(root, 'content.js'), 'utf8'), context);
const data = context.window.schoolContent;
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/content.json'), 'utf8'));
const photo = 'assets/og-image.png';
const day = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
data.site = { ...data.site, demoMode: true, demoLabels: true, holiday: { mode: 'off' },
  // Optional Cloudflare test key (for example 1x00000000000000000000AA) to see the «not a robot» check.
  ...(process.env.E2E_TURNSTILE_KEY ? { turnstileSiteKey: process.env.E2E_TURNSTILE_KEY } : {}) };
data.stats = fixture.stats;
data.teachers = fixture.teachers.map((teacher, index) => ({ ...teacher,
  ...(index === 0 ? { media: [{ type: 'image', src: photo, alt: 'Пример: портрет' }, { type: 'image', src: photo, alt: 'Пример: на уроке' }] } : {}) }));
data.results = fixture.results.map((result, index) => ({ ...result, consent: true,
  ...(index === 0 ? { media: [{ type: 'image', src: photo, alt: 'Пример: сертификат' }] } : {}) }));
data.events = Array.from({ length: 8 }, (_, index) => ({
  title: `Пример: событие ${index + 1}`, startsAt: `${day(index + 2)}T18:00:00+05:00`, description: 'Пример события для проверки.' }));
// One event that is already over: the page removes it by itself (assets/ui.js).
data.events.unshift({ title: 'Пример: прошедшее событие', startsAt: `${day(-5)}T18:00:00+05:00`, description: 'Уже прошло.' });
fs.writeFileSync(path.join(site, 'content.js'), `window.schoolContent = ${JSON.stringify(data, null, 2)};\n`);
const build = spawnSync(process.execPath, ['build.mjs'], { cwd: site, encoding: 'utf8' });
if (build.status !== 0) {
  console.error(build.stdout, build.stderr);
  process.exit(1);
}

// The production Content-Security-Policy, read from the Caddyfile so both stay the same.
const csp = fs.readFileSync(path.join(root, 'Caddyfile'), 'utf8').match(/Content-Security-Policy "([^"]+)"/)[1];
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.mp4': 'video/mp4' };
const file = url => {
  const clean = decodeURIComponent(url.split('?')[0]);
  const target = path.join(site, clean);
  if (!target.startsWith(site)) return null;
  for (const candidate of [target, `${target}.html`, path.join(target, 'index.html')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
};
http.createServer((request, response) => {
  const headers = { 'Content-Security-Policy': csp, 'Cache-Control': 'no-store' };
  if (request.method === 'POST') {
    // Form submissions are answered «not configured»; the tests replace the answer when they need another one.
    response.writeHead(503, { ...headers, 'Content-Type': 'application/json' });
    response.end('{"ok":false,"error":"not_configured"}');
    return;
  }
  const found = file(request.url);
  if (!found) {
    response.writeHead(404, { ...headers, 'Content-Type': types['.html'] });
    fs.createReadStream(path.join(site, 'assets/errors/404.html')).pipe(response);
    return;
  }
  // Text files are compressed like Caddy's «encode zstd gzip», so speed measurements match the real site.
  const type = types[path.extname(found)] || 'application/octet-stream';
  if (/^(?:text\/|application\/json|image\/svg)/.test(type) && /\bgzip\b/.test(request.headers['accept-encoding'] || '')) {
    response.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    fs.createReadStream(found).pipe(zlib.createGzip()).pipe(response);
    return;
  }
  response.writeHead(200, { ...headers, 'Content-Type': type });
  fs.createReadStream(found).pipe(response);
}).listen(port, '127.0.0.1', () => console.log(`e2e site on http://127.0.0.1:${port} (${site})`));

const cleanup = () => { fs.rmSync(site, { recursive: true, force: true }); process.exit(0); };
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
