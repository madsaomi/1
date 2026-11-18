// Compares the computed style of every element with two stylesheets (clean-ups must not change the look):
// node tests/e2e/serve.mjs &  then  node tests/css-diff.mjs http://127.0.0.1:4310 old.css new.css
// Pages × phone/desktop × light/dark, animations off. Prints every difference; exit code 1 if there is any.
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const [base, oldFile, newFile] = process.argv.slice(2);
const sheets = { old: fs.readFileSync(oldFile, 'utf8'), new: fs.readFileSync(newFile, 'utf8') };
const pages = ['/', '/results', '/teachers', '/career', '/privacy', '/feedback', '/courses/ielts', '/courses/general-english-kaa', '/uz/', '/en/feedback', '/no-such-page'];
const browser = await chromium.launch({ channel: 'chrome' });
let differences = 0;

async function snapshot(context, css, path, theme) {
  const page = await context.newPage();
  await page.route(/\/style\.css(\?|$)/, route => route.fulfill({ status: 200, contentType: 'text/css', body: css }));
  await page.addInitScript(value => { try { localStorage.setItem('stanford-theme', value); } catch {} }, theme);
  await page.goto(base + path, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  // Flip one course card and one directory card so their back faces are compared too.
  await page.evaluate(() => { document.querySelector('[data-flip-open]')?.click(); });
  await page.waitForTimeout(300);
  const result = await page.evaluate(() => {
    const out = [];
    const all = [document.documentElement, ...document.querySelectorAll('body, body *')];
    all.forEach((element, index) => {
      if (element.closest('svg') && element.tagName.toLowerCase() !== 'svg') return;
      const style = getComputedStyle(element);
      const values = [];
      for (let i = 0; i < style.length; i++) {
        const name = style[i];
        if (name.startsWith('--')) continue;
        values.push(`${name}:${style.getPropertyValue(name)}`);
      }
      for (const pseudo of ['::before', '::after']) {
        const p = getComputedStyle(element, pseudo);
        if (p.content && p.content !== 'none' && p.content !== 'normal') values.push(`${pseudo}:${p.content}|${p.display}|${p.width}|${p.height}|${p.backgroundColor}|${p.color}|${p.transform}`);
      }
      const box = element.getBoundingClientRect();
      values.push(`box:${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)},${Math.round(box.height)}`);
      out.push([`${index}:${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}.${String(element.className?.baseVal ?? element.className).trim().split(/\s+/).join('.')}`, values]);
    });
    return out;
  });
  await page.close();
  return result;
}

for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 900 }]) {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', colorScheme: theme });
    for (const path of pages) {
      const before = await snapshot(context, sheets.old, path, theme);
      const after = await snapshot(context, sheets.new, path, theme);
      if (before.length !== after.length) { console.log(`${path} ${viewport.width} ${theme}: element count ${before.length} → ${after.length}`); differences++; continue; }
      let shown = 0;
      before.forEach(([name, values], index) => {
        const next = after[index][1];
        const changed = values.filter((value, i) => value !== next[i]);
        if (changed.length || values.length !== next.length) {
          differences++;
          if (shown++ < 8) console.log(`${path} ${viewport.width} ${theme} ${name}: ${changed.slice(0, 4).map((value, i) => `${value} → ${next[values.indexOf(value)]}`).join('; ')}`);
        }
      });
    }
    await context.close();
  }
}
await browser.close();
console.log(differences ? `${differences} differences` : 'No differences: every element looks exactly the same.');
process.exitCode = differences ? 1 : 0;
