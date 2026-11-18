// Cloudflare Turnstile: an optional invisible «not a robot» check in the HR and complaints forms.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readContent, renderTurnstile, validateContent } from '../build.mjs';

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('without a site key the forms have no check; with one each form gets its own widget', () => {
  assert.equal(renderTurnstile({}, 'career'), '');
  const widget = renderTurnstile({ turnstileSiteKey: '1x00000000000000000000AA' }, 'feedback');
  assert.match(widget, /class="cf-turnstile form-turnstile" data-turnstile data-sitekey="1x00000000000000000000AA" data-action="feedback"/);
  assert(widget.includes('<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>'));
  const data = readContent();
  for (const key of ['', 'not a key', '0x"><script>', `0x${'a'.repeat(80)}`]) {
    assert.throws(() => validateContent({ ...data, site: { ...data.site, turnstileSiteKey: key } }), /turnstileSiteKey/, key);
  }
});

test('the generated forms carry the widget only when the admin has a key, and the CSP lets Cloudflare in', () => {
  const key = readContent().site.turnstileSiteKey;
  for (const page of ['career.html', 'feedback.html']) {
    const html = read(page);
    assert(html.includes('<!-- TURNSTILE_START -->'), page);
    assert.equal(html.includes('data-turnstile'), Boolean(key), page);
  }
  const csp = read('Caddyfile').match(/Content-Security-Policy "([^"]+)"/)[1];
  assert.match(csp, /script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
  assert.match(csp, /frame-src [^;]*https:\/\/challenges\.cloudflare\.com/);
  // Both forms send the single-use token and start a new check after every attempt.
  for (const script of ['career.js', 'feedback.js']) {
    const source = read(script);
    assert(source.includes('turnstileToken') && source.includes('turnstile.reset'), script);
  }
});
