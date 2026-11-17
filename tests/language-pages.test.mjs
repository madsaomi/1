import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LANGUAGES, generateLanguagePage, readContent, renderSitemap, translatePage } from '../build.mjs';

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const PAGES = ['index.html', 'results.html', 'teachers.html', 'career.html', 'privacy.html'];
const pack = { strings: { 'Курсы и цены': 'Kurslar va narxlar', 'Язык сайта': 'Sayt tili', 'Фото: Анна': 'Foto: Anna', 'Курсы & цены': 'Kurslar & narxlar' },
  patterns: [[/^Подробнее: (.+)$/, (m, t) => `Batafsil: ${t(m[1])}`]] };

test('a page is translated at build time: text, labels and alt, with paths one folder deeper', () => {
  const html = '<html lang="ru"><head><link rel="stylesheet" href="style.css?v=1"><script src="content.js?v=2"></script>'
    + '<script type="application/ld+json">{"name":"Курсы и цены"}</script></head><body>'
    + '<a href="results.html#top"> Курсы и цены </a><a href="#faq">Курсы и цены</a><a href="https://t.me/x" aria-label="Подробнее: Курсы и цены">x</a>'
    + '<img src="assets/a.jpg" srcset="assets/a-800.webp 800w, assets/a.jpg 1600w" alt="Фото: Анна"><p>Курсы &amp; цены</p><p>Без перевода</p>'
    + '<!-- Курсы и цены --><a href="tel:+998">t</a><a href="/career">c</a></body></html>';
  const out = translatePage(html, 'uz', pack);
  assert.match(out, /^<html lang="uz" data-lang-page="uz">/);
  assert(out.includes('<a href="results.html#top"> Kurslar va narxlar </a>'), 'Links between pages stay inside the language');
  assert(out.includes('<a href="#faq">Kurslar va narxlar</a>'));
  assert(out.includes('aria-label="Batafsil: Kurslar va narxlar"'));
  assert(out.includes('href="../style.css?v=1"') && out.includes('src="../content.js?v=2"'));
  assert(out.includes('<img src="../assets/a.jpg" srcset="../assets/a-800.webp 800w, ../assets/a.jpg 1600w" alt="Foto: Anna">'));
  assert(out.includes('<p>Kurslar &amp; narxlar</p>') && out.includes('<p>Без перевода</p>'), 'Entities decode; missing strings stay Russian');
  assert(out.includes('{"name":"Курсы и цены"}') && out.includes('<!-- Курсы и цены -->'), 'Scripts and comments are untouched');
  assert(out.includes('href="tel:+998"') && out.includes('href="/career"') && out.includes('href="https://t.me/x"'));
  assert.equal(translatePage('<p>&lt;Курс&gt;</p>', 'uz', { strings: { '<Курс>': '<Kurs>' } }), '<p>&lt;Kurs&gt;</p>', 'Translated text is escaped again');
});

test('every public page has current /uz/ and /kaa/ copies with their own address and all language links', () => {
  const data = readContent();
  for (const lang of LANGUAGES) {
    for (const page of PAGES) {
      const copy = read(`${lang}/${page}`);
      assert.equal(copy, generateLanguagePage(read(page), data, lang, page), `${lang}/${page} must be rebuilt`);
      assert.match(copy, new RegExp(`<html lang="${lang}" data-lang-page="${lang}">`));
      if (data.site.url) {
        const own = new URL(`${lang}/${page === 'index.html' ? '' : page.replace(/\.html$/, '')}`, `${data.site.url.replace(/\/$/, '')}/`).href;
        assert(copy.includes(`<link rel="canonical" href="${own}">`), `${lang}/${page} canonical`);
        for (const code of ['ru', 'uz', 'kaa', 'x-default']) assert(copy.includes(`hreflang="${code}"`));
      }
      // Every local file the copy needs exists one folder up.
      for (const [, url] of copy.matchAll(/\s(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
        if (/^(?:[a-z]+:|\/)/.test(url) || /^(?:\.\/|(?:index|results|teachers|career|privacy)(?:\.html)?)$/.test(url)) continue;
        assert(url.startsWith('../'), `${lang}/${page}: ${url} must point one folder up`);
        assert(fs.existsSync(new URL(`../${lang}/${url}`, import.meta.url)), `${lang}/${page}: missing ${url}`);
      }
    }
  }
});

test('the sitemap offers each page in all three languages, never in demo mode', () => {
  const site = { url: 'https://school.example' };
  const map = renderSitemap(site);
  assert.equal((map.match(/<loc>/g) || []).length, 12);
  assert(map.includes('<loc>https://school.example/uz/</loc>') && map.includes('<loc>https://school.example/kaa/career</loc>'));
  assert.equal((renderSitemap({ ...site, demoMode: true }).match(/<loc>/g) || []).length, 0);
});
