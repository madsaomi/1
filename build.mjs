import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('.', import.meta.url));
export const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const money = value => new Intl.NumberFormat('ru-RU').format(value);

// Decorative inline icons: shared stroke, no external icon/font dependency.
export function svgIcon(name) {
  const paths = {
    external: 'M15 3h6v6 M10 14 21 3 M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5',
    'arrow-right': 'M5 12h14 M12 5l7 7-7 7',
    check: 'm5 12 4 4L19 6',
    plus: 'M12 5v14 M5 12h14',
    camera: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
    telegram: 'm22 2-7 20-4-9-9-4Z M22 2 11 13',
    'map-pin': 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    instagram: 'M17 2H7a5 5 0 0 0-5 5v10a5 5 0 0 0 5 5h10a5 5 0 0 0 5-5V7a5 5 0 0 0-5-5Zm-5 15a5 5 0 1 1 5-5 5 5 0 0 1-5 5Zm5.5-9.8a1.2 1.2 0 1 1 1.2-1.2 1.2 1.2 0 0 1-1.2 1.2Z',
    award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z M8.2 13.9 7 22l5-3 5 3-1.2-8.1'
  };
  return `<svg class="icon icon-${name}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${paths[name]}"/></svg>`;
}

export function readContent() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(new URL('./content.js', import.meta.url), 'utf8'), context, { timeout: 1000 });
  return context.window.schoolContent;
}

const photoPattern = /^assets\/[a-z0-9/_-]+\.(?:jpe?g|webp|png)$/;
function validatePhoto(photo, message) {
  if (photo !== undefined && (typeof photo !== 'string' || !photoPattern.test(photo) || !fs.existsSync(new URL(photo, import.meta.url)))) throw new Error(message);
}
const text = (value, max) => typeof value === 'string' && value.trim() !== '' && value.length <= max;
const optionalText = (value, max) => value === undefined || text(value, max);
const courseCategories = new Set(['languages', 'kids', 'subjects', 'exam']);

export function validateContent(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Content must be an object');
  if (data.practices !== undefined && (!Array.isArray(data.practices) || data.practices.length > 50)) throw new Error('Practices must be an array with up to 50 items');
  const practiceIds = new Set();
  for (const practice of data.practices ?? []) {
    if (!practice || !/^[a-z0-9-]{1,40}$/.test(practice.id) || practiceIds.has(practice.id)) throw new Error('Practice IDs must be unique slugs');
    practiceIds.add(practice.id);
    if (!text(practice.title, 120) || !text(practice.description, 400) || !optionalText(practice.label, 40) || !optionalText(practice.photoAlt, 160)) throw new Error('Invalid practice text');
    validatePhoto(practice.photo, 'Use an existing local practice photo');
  }
  if (data.events !== undefined && (!Array.isArray(data.events) || data.events.length > 100)) throw new Error('Events must be an array with up to 100 items');
  for (const event of data.events ?? []) {
    if (!event || !text(event.title, 120) || !optionalText(event.description, 400)) throw new Error('Invalid event text');
    if (typeof event.startsAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(event.startsAt) || !Number.isFinite(Date.parse(event.startsAt))) throw new Error('Event date needs an explicit timezone');
    if (event.url !== undefined) {
      let url;
      try { url = new URL(event.url); } catch { throw new Error('Invalid event URL'); }
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use an HTTPS event URL without credentials');
    }
  }
  if (!Array.isArray(data.courses) || !data.courses.length) throw new Error('Courses must be a non-empty array');
  const ids = new Set();
  for (const course of data.courses) {
    if (!/^[a-z0-9-]+$/.test(course.id) || ids.has(course.id)) throw new Error('Course IDs must be unique slugs');
    ids.add(course.id);
    if (!text(course.name, 80)) throw new Error(`Invalid course name: ${course.id}`);
    if (!optionalText(course.subtitle, 80)) throw new Error(`Invalid course subtitle: ${course.id}`);
    if (!text(course.description, 400)) throw new Error(`Invalid course description: ${course.id}`);
    if (!courseCategories.has(course.category)) throw new Error(`Invalid course category: ${course.id}`);
    if (!Array.isArray(course.skills) || !course.skills.length || course.skills.some(skill => !text(skill, 200))) throw new Error(`Invalid course skills: ${course.id}`);
    if (!Number.isFinite(course.price) || course.price <= 0) throw new Error(`Invalid price: ${course.id}`);
    if (!/^#[a-z0-9-]+$/.test(course.target)) throw new Error(`Invalid course target: ${course.id}`);
  }
  if (!data.contacts || typeof data.contacts !== 'object' || Array.isArray(data.contacts)) throw new Error('Contacts must be an object');
  if (data.contacts.verified) {
    const { phones = [], telegrams = [], hrTelegram = '', instagram = '', locations = [] } = data.contacts;
    if (!Array.isArray(phones) || !Array.isArray(telegrams)) throw new Error('Contact channels must be arrays');
    if (!phones.length && !telegrams.length) throw new Error('Verified contact must have an admissions channel');
    if (phones.some(phone => typeof phone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(phone))) throw new Error('Use an international phone number');
    const telegramPattern = /^https:\/\/t\.me\/[a-zA-Z0-9_]{5,32}$/;
    if (telegrams.some(url => typeof url !== 'string' || !telegramPattern.test(url)) || (hrTelegram && !telegramPattern.test(hrTelegram))) throw new Error('Use a direct Telegram account URL');
    if (new Set(phones).size !== phones.length || new Set(telegrams.map(url => url.toLowerCase())).size !== telegrams.length) throw new Error('Contact channels must be unique');
    if (hrTelegram && telegrams.some(url => url.toLowerCase() === hrTelegram.toLowerCase())) throw new Error('HR Telegram must be separate from admissions');
    if (instagram && !/^https:\/\/www\.instagram\.com\/[a-zA-Z0-9_.]{1,30}\/?$/.test(instagram)) throw new Error('Use a direct Instagram profile URL');
    if (!Array.isArray(locations)) throw new Error('Locations must be an array');
    const locationIds = new Set();
    for (const location of locations) {
      if (!/^[a-z0-9-]+$/.test(location.id) || locationIds.has(location.id)) throw new Error('Location IDs must be unique slugs');
      locationIds.add(location.id);
      if (typeof location.name !== 'string' || !location.name.trim() || typeof location.address !== 'string' || !location.address.trim()) throw new Error('Location must have a name and address');
      if (location.coordinates !== undefined && (!Array.isArray(location.coordinates) || location.coordinates.length !== 2 || !Number.isFinite(location.coordinates[0]) || !Number.isFinite(location.coordinates[1]) || Math.abs(location.coordinates[0]) > 180 || Math.abs(location.coordinates[1]) > 90)) throw new Error('Use valid map coordinates: longitude, latitude');
      if (location.googleEmbed !== undefined) {
        let embed;
        try { embed = new URL(location.googleEmbed); } catch { throw new Error('Use an approved Google embed URL'); }
        if (typeof location.googleEmbed !== 'string' || embed.origin !== 'https://www.google.com' || embed.username || embed.password || embed.pathname !== '/maps/embed' || embed.hash || embed.searchParams.size !== 1 || !embed.searchParams.get('pb')) throw new Error('Use an approved Google embed URL');
      }
      validatePhoto(location.photo, 'Use an existing local branch photo');
      if (!Array.isArray(location.maps) || !location.maps.length) throw new Error('Location must have a map link');
      for (const map of location.maps) {
        const patterns = {
          google: /^https:\/\/(?:maps\.app\.goo\.gl\/[a-zA-Z0-9_-]+\/?|www\.google\.com\/maps\/search\/\?api=1&query=-?\d+(?:\.\d+)?(?:%2[Cc]|,)-?\d+(?:\.\d+)?)$/,
          yandex: /^https:\/\/yandex\.(?:uz|com|ru)\/maps\/(?:-\/[a-zA-Z0-9_-]+|org\/[a-zA-Z0-9_-]+\/\d+)\/?$/
        };
        if (!Object.hasOwn(patterns, map.provider) || typeof map.url !== 'string' || !patterns[map.provider].test(map.url)) throw new Error('Use an approved HTTPS map URL for its provider');
      }
    }
  }
  if (data.site !== undefined && (!data.site || typeof data.site !== 'object' || Array.isArray(data.site))) throw new Error('Site settings must be an object');
  const demo = data.site?.demoMode;
  if (demo !== undefined && typeof demo !== 'boolean') throw new Error('demoMode must be true or false');
  if (data.site?.demoLabels !== undefined && typeof data.site.demoLabels !== 'boolean') throw new Error('demoLabels must be true or false');
  const { stats = [], teachers = [], results = [] } = data;
  if (![stats, teachers, results].every(Array.isArray)) throw new Error('Stats, teachers and results must be arrays');
  for (const stat of stats) if (!text(stat.value, 12) || !text(stat.label, 40)) throw new Error('Stat needs a short value and label');
  for (const teacher of teachers) {
    if (!text(teacher.name, 60) || !text(teacher.role, 80) || !optionalText(teacher.qualification, 40) || !optionalText(teacher.experience, 40)) throw new Error('Teacher needs a name, role and short optional details');
    if (teacher.featured !== undefined && typeof teacher.featured !== 'boolean') throw new Error('Teacher featured must be true or false');
    validatePhoto(teacher.photo, 'Use an existing local teacher photo');
  }
  for (const result of results) {
    if (!text(result.score, 8) || !text(result.exam, 20) || !optionalText(result.level, 20) || !text(result.quote, 240) || !text(result.student, 40) || !optionalText(result.course, 60)) throw new Error('Result needs a score, exam, quote and student');
    if (result.featured !== undefined && typeof result.featured !== 'boolean') throw new Error('Result featured must be true or false');
    // Real student results are published only with the student's consent; demo samples are announced as examples instead.
    if (!demo && result.consent !== true) throw new Error('Publish a real student result only with consent');
  }
  if (data.cashback !== undefined) {
    const { cashback } = data;
    for (const exam of cashbackExams) {
      const tiers = cashback[exam.key] ?? [];
      if (!Array.isArray(tiers)) throw new Error(`Cashback ${exam.label} must be an array`);
      for (const tier of tiers) if (!text(tier.score, 8) || !Number.isSafeInteger(tier.reward) || tier.reward <= 0 || !optionalText(tier.label, 40) || (tier.hero !== undefined && typeof tier.hero !== 'boolean')) throw new Error('Cashback tier needs a score and a positive whole reward');
    }
    if (!Array.isArray(cashback.rules ?? [])) throw new Error('Cashback rules must be an array');
    for (const rule of cashback.rules ?? []) if (!text(rule.title, 60) || !text(rule.text, 200)) throw new Error('Cashback rule needs a title and text');
  }
  if (data.faq !== undefined) {
    if (!Array.isArray(data.faq)) throw new Error('FAQ must be an array');
    for (const item of data.faq) if (!text(item.question, 160) || !text(item.answer, 800)) throw new Error('FAQ entry needs a question and an answer');
  }
  if (data.texts !== undefined) {
    if (!data.texts || typeof data.texts !== 'object' || Array.isArray(data.texts)) throw new Error('Texts must be an object');
    for (const [key, value] of Object.entries(data.texts)) if (!/^[a-z0-9._-]+$/.test(key) || !text(value, 800)) throw new Error(`Text ${key} must be a non-empty string up to 800 characters`);
  }
  if (data.site?.url) {
    let url;
    try { url = new URL(data.site.url); } catch { throw new Error('Site URL must be a valid public HTTPS address'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Use a public HTTPS site URL without credentials, query or hash');
  }
}

function displayPhone(phone) {
  const parts = phone.match(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/);
  return parts ? `+998 ${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]}` : phone;
}

export function renderContacts(contacts, { compact = false } = {}) {
  if (!contacts.verified) return '<p class="contact-unavailable"><strong>Контакты уточняются.</strong><br>Запись временно недоступна. Подтвержденные телефон и Telegram появятся здесь.</p>';
  const heading = compact ? 'p' : 'h3';
  const groups = [];
  if (contacts.phones?.length) groups.push(`<div class="contact-group"><${heading} class="contact-label">Позвонить</${heading}><ul class="contact-list">${contacts.phones.map(phone => `<li><a class="contact-channel" href="tel:${escapeHTML(phone)}" aria-label="Позвонить: ${escapeHTML(displayPhone(phone))}">${svgIcon('phone')}<span>${escapeHTML(displayPhone(phone))}</span></a></li>`).join('')}</ul></div>`);
  if (!compact && contacts.telegrams?.length) groups.push(`<div class="contact-group"><${heading} class="contact-label">Написать в Telegram</${heading}><ul class="contact-list">${contacts.telegrams.map(url => `<li><a class="contact-channel" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" aria-label="Написать в Telegram: @${escapeHTML(url.split('/').pop())}">${svgIcon('telegram')}<span>@${escapeHTML(url.split('/').pop())}</span>${svgIcon('external')}</a></li>`).join('')}</ul></div>`);
  const extras = [];
  if (!compact && contacts.instagram) extras.push(`<a href="${escapeHTML(contacts.instagram)}" target="_blank" rel="noopener noreferrer">${svgIcon('instagram')}<span>Instagram</span>${svgIcon('external')}</a>`);
  // HR no longer gets messages directly from this block: candidates fill the career form instead.
  if (!compact) extras.push(`<a class="contact-extras-link" href="career.html">${svgIcon('check')}<span>Заполнить анкету</span>${svgIcon('arrow-right')}</a>`);
  // The course dialog is where the visitor signs up: send them to the branch addresses instead of a messenger.
  const jump = compact ? `<p class="contact-jump"><a class="text-link" href="#enroll" data-dialog-jump>Приходите в центр: адреса филиалов${svgIcon('arrow-right')}</a></p>` : '';
  return `<div class="contact-channels">${groups.join('')}</div>${extras.length ? `<div class="contact-extras">${extras.join('')}</div>` : ''}${jump}`;
}

const demoTag = site => showDemo(site) ? ' <span class="demo-tag">Пример</span>' : '';
// demoLabels=false keeps the sample data private to the team: no «Пример» banners while the owner prepares real content.
const showDemo = site => Boolean(site?.demoMode && site?.demoLabels !== false);

// Samples must not be indexed: while demo mode is on, search engines are asked to skip the page.
export function renderRobots(site) {
  return site?.demoMode ? '<meta name="robots" content="noindex, nofollow">' : '';
}

export function renderMetadata(site, page = '') {
  if (!site?.url) return '';
  const base = site.url.endsWith('/') ? site.url : `${site.url}/`;
  const canonical = page ? new URL(page, base).href : site.url;
  return `<link rel="canonical" href="${escapeHTML(canonical)}">\n<meta property="og:url" content="${escapeHTML(canonical)}">\n<meta property="og:image" content="${escapeHTML(new URL('assets/stanford-logo.png', base).href)}">`;
}

// A publication changes these URLs whenever the data or translations change, even if the old files are cached.
export function versionContentAssets(html, data, dictionary = fs.readFileSync(new URL('./assets/i18n/uz.js', import.meta.url)), karakalpakDictionary = fs.readFileSync(new URL('./assets/i18n/kaa.js', import.meta.url))) {
  const version = value => parseInt(createHash('sha256').update(value).digest('hex').slice(0, 12), 16).toString();
  const versions = { 'content.js': version(JSON.stringify(data)), 'assets/i18n/uz.js': version(dictionary), 'assets/i18n/kaa.js': version(karakalpakDictionary) };
  return html.replace(/\b(src|href)="(content\.js|assets\/i18n\/(?:uz|kaa)\.js)(?:\?v=[^"]*)?"/g,
    (_, attribute, file) => `${attribute}="${file}?v=${versions[file]}"`);
}

export function renderDemoBanner(site) {
  return showDemo(site) ? '<p class="demo-banner">Демо-версия: блоки «Пример» — образцы</p>' : '';
}

export function renderStats(stats = [], site) {
  if (!stats.length) return '';
  const items = stats.map(stat => `<div><dt>${escapeHTML(stat.label)}</dt><dd>${escapeHTML(stat.value)}</dd></div>`).join('');
  return `<section class="wrap stats-strip" aria-label="Stanford в цифрах${showDemo(site) ? ' (пример)' : ''}">${showDemo(site) ? '<span class="demo-tag">Пример</span>' : ''}<dl>${items}</dl></section>`;
}

export function renderPractices(practices = []) {
  if (!practices.length) return '';
  const artwork = { 'speaking-club': 'speaking', 'movie-club': 'movie', 'mock-exams': 'exams' };
  return `<div class="practice-list">${practices.map(practice => {
    const fallback = Object.hasOwn(artwork, practice.id) ? artwork[practice.id] : undefined;
    const image = practice.photo || (fallback ? `assets/practice/${fallback}.svg` : 'assets/stanford-icon.svg');
    const kind = practice.photo ? ' practice-media--photo' : fallback ? '' : ' practice-media--brand';
    const alt = practice.photo ? practice.photoAlt || practice.title : '';
    return `<article class="practice-card"><div class="practice-media${kind}"><img src="${escapeHTML(image)}" alt="${escapeHTML(alt)}" width="640" height="400" loading="lazy" decoding="async"></div><div class="practice-body">${practice.label ? `<span class="practice-kicker">${escapeHTML(practice.label)}</span>` : ''}<h3>${escapeHTML(practice.title)}</h3><p>${escapeHTML(practice.description)}</p></div></article>`;
  }).join('')}</div>`;
}

function toggleEmptySection(html, id, visible) {
  return html.replace(new RegExp(`<section\\b[^>]*\\bid="${id}"[^>]*>`), tag => {
    const clean = tag.replace(/\s+hidden(?=\s|>)/g, '');
    return visible ? clean : clean.replace(/>$/, ' hidden>');
  });
}

export function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
}

export function renderTeachers(teachers = [], site, { featuredOnly = false, heading = true, profile = false } = {}) {
  const head = heading ? `<div class="section-top"><h2 id="teachers-title">Преподаватели${demoTag(site)}</h2></div>\n` : '';
  // Featured (admin-configured tops) come first; the original order is kept inside each group.
  const sorted = [...teachers].sort((a, b) => (b.featured === true) - (a.featured === true));
  let shown = sorted;
  if (featuredOnly) {
    const featured = sorted.filter(teacher => teacher.featured === true);
    // Graceful fallback: with no featured teacher configured the section keeps showing everyone.
    shown = featured.length ? featured : sorted;
  }
  if (!teachers.length) return heading ? `${head}` : '';
  const cards = shown.map(teacher => {
    const name = escapeHTML(teacher.name);
    const portrait = teacher.photo
      ? `<img class="teacher-photo" src="${escapeHTML(teacher.photo)}" alt="Фото: ${name}" width="600" height="750" loading="lazy" decoding="async">`
      : '<div class="teacher-initials" aria-hidden="true"><img class="teacher-brand" src="assets/stanford-icon.svg" alt="" width="48" height="48"></div>';
    const chipIcons = {
      qualification: '<svg class="icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="9" r="5"/><path d="M8.5 13.5 7 21l5-2.8L17 21l-1.5-7.5"/></svg>',
      experience: '<svg class="icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
    };
    const chips = [teacher.qualification && `<li class="teacher-chip-key">${chipIcons.qualification}${escapeHTML(teacher.qualification)}</li>`, teacher.experience && `<li>${chipIcons.experience}${escapeHTML(teacher.experience)}</li>`].filter(Boolean).join('');
    // The full list uses the tilt card of assets/ui.js; the home section keeps the plain card.
    return `<article class="teacher-card"${profile ? ' data-tilt' : ''}>${profile ? '<span class="result-shine" aria-hidden="true"></span>' : ''}${portrait}<div class="teacher-body"><h3>${name}</h3><p>${escapeHTML(teacher.role)}</p>${chips ? `<ul class="teacher-chips">${chips}</ul>` : ''}</div></article>`;
  }).join('');
  const more = featuredOnly ? `\n<a class="text-link results-more" href="teachers.html">Все преподаватели${svgIcon('arrow-right')}</a>` : '';
  return `${head}<div class="team-grid">${cards}</div>${more}`;
}

// One card per published student result; reused by the home section and the full results page.
export function renderResultCards(results = []) {
  return results.map(result => `<article class="result-card"><div class="result-score"><strong>${escapeHTML(result.score)}</strong><span>${escapeHTML(result.exam)}</span>${result.level ? `<small>${escapeHTML(result.level)}</small>` : ''}</div><blockquote>«${escapeHTML(result.quote)}»</blockquote><p class="result-name">${escapeHTML([result.student, result.course].filter(Boolean).join(' · '))}</p></article>`).join('');
}

export function renderResults(results = [], site, { featuredOnly = false } = {}) {
  if (!results.length) return '';
  // Featured (admin-configured tops) come first; the original order is kept inside each group.
  const sorted = [...results].sort((a, b) => (b.featured === true) - (a.featured === true));
  let shown = sorted;
  if (featuredOnly) {
    const featured = sorted.filter(result => result.featured === true);
    // Graceful fallback: with no featured result configured the section keeps showing everything.
    shown = featured.length ? featured : sorted;
  }
  return `<section data-reveal class="section wrap results-section" id="results" aria-labelledby="results-title">
<div class="section-top"><h2 id="results-title">Результаты студентов${demoTag(site)}</h2></div>
<div class="results-grid">${renderResultCards(shown)}</div>
<a class="text-link results-more" href="results.html">Все результаты${svgIcon('arrow-right')}</a>
</section>`;
}

export function renderLocations(contacts, { demo = false } = {}) {
  if (!contacts.verified || !contacts.locations?.length) return '';
  const providers = { google: 'Google Maps', yandex: 'Яндекс Карты' };
  // Only Google embeds are shown: the Yandex widget displays ads, so Yandex stays a link.
  const first = contacts.locations.find(location => location.googleEmbed);
  const cards = contacts.locations.map(location => {
    const name = escapeHTML(location.name);
    const address = escapeHTML(location.address);
    const select = location.googleEmbed ? `<button type="button" class="location-select" data-map-location="${escapeHTML(location.id)}" data-map-src="${escapeHTML(location.googleEmbed)}" data-map-title="Карта: ${name}" data-map-label="${name} — ${address}" aria-label="Показать на карте: ${name}" aria-pressed="${location === first}" aria-controls="branch-map"><span class="sr-only">Показать на карте: ${name}</span>${svgIcon('arrow-right')}</button>` : '';
    const mapPin = `<svg class="icon icon-map-pin" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><defs><linearGradient id="map-pin-${escapeHTML(location.id)}" x1="0" y1="0" x2="1" y2="1"><stop class="map-brand-red" offset="0"/><stop class="map-brand-blue" offset=".35"/><stop class="map-brand-green" offset=".7"/><stop class="map-brand-yellow" offset="1"/></linearGradient></defs><path fill="url(#map-pin-${escapeHTML(location.id)})" fill-rule="evenodd" stroke="none" d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8Zm0 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/></svg>`;
    const yandexIcon = '<svg class="icon icon-yandex-maps" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="2" y="2" width="20" height="20" rx="6" fill="var(--map-red)" stroke="none"/><path fill="var(--on-dark)" fill-rule="evenodd" stroke="none" d="M16 5h-4c-3.3 0-5 1.6-5 4.2 0 2.1 1.2 3.4 2.8 4.1L6.5 19h3l3-5.2h1V19H16V5Zm-2.5 2.1v4.5H12c-1.6 0-2.4-.7-2.4-2.2s.8-2.3 2.4-2.3h1.5Z"/></svg>';
    const links = location.maps.map(map => `<a class="map-icon-link" href="${escapeHTML(map.url)}" target="_blank" rel="noopener noreferrer" aria-label="${providers[map.provider]}: ${name}, ${address}">${map.provider === 'google' ? mapPin : yandexIcon}</a>`).join('');
    // Until the owner sends entrance photos, each branch shows a tagged placeholder.
    const photo = location.photo
      ? `<img class="location-photo" src="${escapeHTML(location.photo)}" alt="Вход: ${name}" width="640" height="360" loading="lazy" decoding="async">`
      : !demo ? '' : `<div class="location-photo location-photo-demo" role="img" aria-label="Пример: место для фото входа, ${name}">${svgIcon('camera')}<span>Фото входа</span><span class="demo-tag">Пример</span></div>`;
    return `<article class="location-card"><h4>${name}</h4><p>${address}</p>${photo}${select}<div class="map-links">${links}</div></article>`;
  }).join('');
  const map = first ? `<div class="branch-map-panel"><div class="map-toolbar"><p id="map-status" class="map-status" tabindex="-1" aria-live="polite">${escapeHTML(`${first.name} — ${first.address}`)}</p></div><iframe id="branch-map" class="branch-map" src="${escapeHTML(first.googleEmbed)}" title="${escapeHTML(`Карта: ${first.name}`)}" width="1100" height="360" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>` : '';
  return `<div class="contact-locations"><h3>Как добраться</h3><div class="location-map-layout"><div class="location-grid">${cards}</div>${map}</div></div>`;
}

// Both faces are static HTML: the programme remains readable without JavaScript.
export function renderCourses(courses) {
  return courses.map(course => {
    const id = escapeHTML(course.id);
    const name = escapeHTML([course.name, course.subtitle].filter(Boolean).join(' '));
    return `<article class="course-card" id="course-${id}" tabindex="-1" data-category="${escapeHTML(course.category)}" data-course-id="${id}" data-course-flip>
<div class="course-flip-inner">
<div class="course-face course-front"><div class="course-front-brand" aria-hidden="true"><img src="assets/stanford-icon.svg" alt="" width="32" height="32"><span>Stanford</span></div><div class="course-head"><h3>${escapeHTML(course.name)}${course.subtitle ? `<span class="course-subtitle">${escapeHTML(course.subtitle)}</span>` : ''}</h3><p class="course-price"><strong>${money(course.price)}</strong> сум / месяц</p></div>
<a class="course-enroll-btn course-flip-toggle" href="#course-details-${id}" data-flip-open aria-controls="course-details-${id}" aria-expanded="false" aria-label="Подробнее: ${name}">Подробнее${svgIcon('arrow-right')}</a></div>
<div class="course-face course-back" id="course-details-${id}"><h4 class="course-back-title" tabindex="-1">${name}</h4><p class="course-description">${escapeHTML(course.description)}</p>
<ul class="course-details" aria-label="В программе">${course.skills.map(skill => `<li>${svgIcon('check')}<span>${escapeHTML(skill)}</span></li>`).join('')}</ul>
<button class="button-outline course-flip-back" type="button" data-flip-close aria-label="Назад: ${name}">Назад${svgIcon('arrow-right')}</button></div>
</div>
</article>`;
  }).join('\n');
}

const cashbackExams = [{ key: 'ielts', label: 'IELTS' }, { key: 'sat', label: 'SAT' }];
const rewardLabel = tier => tier.label || `${money(tier.reward)} сум`;
const shortReward = reward => reward % 1000000 === 0 ? `${money(reward / 1000000)} млн` : `${money(reward)} сум`;

// Without JS both exam tables stay visible; script.js turns them into tabs.
export function renderCashback(cashback) {
  if (!cashback) return '';
  const exams = cashbackExams.filter(exam => cashback[exam.key]?.length);
  const tabs = exams.map((exam, index) => `    <button type="button" role="tab" class="cashback-tab${index ? '' : ' active'}" id="tab-${exam.key}" aria-selected="${index ? 'false' : 'true'}" aria-controls="panel-${exam.key}"${index ? ' tabindex="-1"' : ''}>${exam.label}</button>`).join('\n');
  const panels = exams.map(exam => {
    const tiers = cashback[exam.key];
    const top = Math.max(...tiers.map(tier => tier.reward));
    const cards = tiers.map(tier => {
      const max = tier.reward === top ? '-max' : '';
      return `<article class="cashback-card${max ? ' cashback-card-max' : ''}">
<div class="cashback-score"><strong>${escapeHTML(tier.score)}</strong><span>${exam.label}</span></div>
<p class="cashback-amount${max ? ' cashback-amount-max' : ''}">${escapeHTML(rewardLabel(tier))}</p>
</article>`;
    }).join('\n');
    return `  <div class="cashback-grid" id="panel-${exam.key}" aria-label="Кэшбэк за ${exam.label}">
${cards}
  </div>`;
  }).join('\n');
  return `<div class="cashback-container">
<div class="cashback-toolbar">
  <div class="cashback-tabs" role="tablist" aria-label="Направления кэшбэка">
${tabs}
  </div>
</div>
<div class="cashback-panels">
${panels}
</div></div>`;
}

// Hero teaser: the same tiers as the cashback section, so amounts are edited in one place.
export function renderHeroReward(cashback) {
  if (!cashback) return '';
  const all = cashbackExams.flatMap(exam => (cashback[exam.key] || []).map(tier => ({ ...tier, exam: exam.label })));
  if (!all.length) return '';
  const top = all.reduce((best, tier) => tier.reward > best.reward ? tier : best);
  const pills = cashbackExams.flatMap(exam => all.filter(tier => tier.exam === exam.label && tier.hero).sort((a, b) => b.reward - a.reward))
    .map(tier => `<span>${escapeHTML(`${tier.exam} ${tier.score} · ${shortReward(tier.reward)}`)}</span>`).join('');
  return `<a class="hero-reward-banner" href="#cashback"><div class="hero-reward-header"><span class="hero-reward-tag">${svgIcon('award')}Кэшбэк за результат</span><strong class="hero-reward-val">до ${escapeHTML(rewardLabel(top))}</strong></div>${pills ? `<div class="hero-reward-pills">${pills}</div>` : ''}<p class="hero-reward-sub">Выплачиваем деньги за официальные баллы</p></a>`;
}

// Trial-lesson CTA lives on the same page: sign-up happens at the centre, not in a messenger.
export function renderNavCta(contacts) {
  return `<a class="button nav-cta" href="#enroll" aria-label="Записаться в центре: адреса филиалов">Записаться в центре${svgIcon('arrow-right')}</a>`;
}

// Floating shortcut to the branch addresses, always within thumb reach on phones.
export function renderContactFab(contacts) {
  if (!contacts.verified) return '';
  return `<a class="contact-fab" href="#enroll" aria-label="Записаться в центре: адреса филиалов">${svgIcon('map-pin')}</a>`;
}

export function renderCTA(contacts) {
  const phone = contacts.verified ? contacts.phones?.[0] : '';
  // Sign-up is a visit to the centre; the phone stays as a fallback line under the buttons.
  const trial = `<a class="button" href="#enroll" aria-label="Записаться в центре: адреса филиалов">Записаться в центре${svgIcon('map-pin')}</a>`;
  const note = phone
    ? `Приходите в центр — подскажем программу и поможем с записью. Или позвоните: <a href="tel:${escapeHTML(phone)}">${escapeHTML(displayPhone(phone))}</a>`
    : 'Приходите в центр — подскажем программу и поможем с записью. Адреса филиалов — в контактах.';
  return `<div class="actions">${trial}<a class="text-link" href="#courses">Выбрать курс${svgIcon('arrow-right')}</a></div>\n<p class="hero-footnote">${note}</p>`;
}

export function renderFilters(courses) {
  const labels = { all: 'Все программы', languages: 'Языки', kids: 'Для детей', subjects: 'Математика', exam: 'IELTS и SAT' };
  return Object.entries(labels).map(([category, label]) => {
    const count = courses.filter(course => category === 'all' || course.category === category).length;
    return `<button type="button" data-filter="${category}" data-filter-label="${label}" class="${category === 'all' ? 'active' : ''}" aria-pressed="${category === 'all'}" aria-label="${label}: ${count}">${label}<span class="filter-count" aria-hidden="true">${count}</span></button>`;
  }).join('\n');
}

// Plain FAQ entries come from the admin; numbers are CSS counters, so the exam entries after them stay in order.
export function renderFaq(faq = []) {
  return faq.map(item => `          <details name="stanford-faq"><summary><span class="faq-num" aria-hidden="true"></span>${escapeHTML(item.question)}${svgIcon('plus')}</summary><p>${escapeHTML(item.answer)}</p></details>`).join('\n');
}

// Editable page texts: every element marked data-text="key" gets the text stored under that key in content.js.
// A slot without a stored text keeps what is already in the HTML, so a missing key never blanks the page.
const escapeText = value => String(value).replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
export function applyTexts(html, texts = {}) {
  html = html.replace(/<[a-z][a-z0-9]*\b[^<>]*>/g, opening => {
    for (const [, attribute, key] of opening.matchAll(/\sdata-text-(placeholder|title|aria-label|alt)="([a-z0-9._-]+)"/g)) {
      if (!Object.hasOwn(texts, key)) continue;
      const pattern = new RegExp(`\\s${attribute}="[^"]*"`);
      const replacement = ` ${attribute}="${escapeHTML(texts[key])}"`;
      opening = pattern.test(opening) ? opening.replace(pattern, () => replacement) : opening.replace(/>$/, () => `${replacement}>`);
    }
    return opening;
  });
  return html.replace(/<([a-z][a-z0-9]*)\b([^>]*?)\sdata-text="([a-z0-9._-]+)"([^>]*)>(?:([^<]*)(<\/\1>))?/g, (match, tag, before, key, after, inner, close) => {
    if (!Object.hasOwn(texts, key)) return match;
    if (tag === 'meta') return `<meta${before.replace(/\scontent="[^"]*"/, '')} data-text="${key}"${after.replace(/\scontent="[^"]*"/, '')} content="${escapeHTML(texts[key])}">`;
    if (close === undefined) return match;
    const leading = inner.match(/^\s*/)[0];
    const trailing = inner.match(/\s*$/)[0];
    return `<${tag}${before} data-text="${key}"${after}>${leading}${escapeText(texts[key].trim())}${trailing}${close}`;
  });
}

function replaceBlock(html, name, body) {
  const pattern = new RegExp(`<!-- ${name}_START -->[\\s\\S]*?<!-- ${name}_END -->`);
  if (!pattern.test(html)) throw new Error(`Missing generated block: ${name}`);
  return html.replace(pattern, () => `<!-- ${name}_START -->\n${body}\n<!-- ${name}_END -->`);
}

// Optional: no published events means no empty section or invented countdown.
export function renderEvents(events = []) {
  if (!events.length) return '';
  const formatter = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tashkent', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const units = [['days', 'Дней'], ['hours', 'Часов'], ['minutes', 'Минут'], ['seconds', 'Секунд']];
  return `<div class="events-section planned-events" id="events"><div class="section-top"><h3 id="events-title" data-text="events.heading">Запланированные события</h3></div><div class="events-grid">${events.map(event => `<article class="event-card"><h4>${escapeHTML(event.title)}</h4><time datetime="${escapeHTML(event.startsAt)}">${escapeHTML(formatter.format(new Date(event.startsAt)))} · Нукус</time>${event.description ? `<p>${escapeHTML(event.description)}</p>` : ''}<div class="event-countdown" data-countdown="${escapeHTML(event.startsAt)}" aria-label="До начала события">${units.map(([unit, label]) => `<div><span data-unit="${unit}">—</span><small>${label}</small></div>`).join('')}</div><p data-countdown-status></p>${event.url ? `<a class="text-link" href="${escapeHTML(event.url)}" target="_blank" rel="noopener noreferrer">Подробнее${svgIcon('external')}</a>` : ''}</article>`).join('')}</div></div>`;
}

export function generate(html, data) {
  html = html.replace(/\r\n/g, '\n');
  validateContent(data);
  html = replaceBlock(html, 'COURSES', renderCourses(data.courses));
  html = replaceBlock(html, 'CTA', renderCTA(data.contacts));
  html = replaceBlock(html, 'FILTERS', renderFilters(data.courses));
  html = replaceBlock(html, 'LOCATIONS', renderLocations(data.contacts, { demo: showDemo(data.site) }));
  html = replaceBlock(html, 'ROBOTS', renderRobots(data.site));
  html = replaceBlock(html, 'BANNER', renderDemoBanner(data.site));
  html = replaceBlock(html, 'STATS', renderStats(data.stats, data.site));
  html = replaceBlock(html, 'TEACHERS', renderTeachers(data.teachers, data.site, { featuredOnly: true }));
  html = replaceBlock(html, 'RESULTS', renderResults(data.results, data.site, { featuredOnly: true }));
  html = replaceBlock(html, 'CASHBACK', renderCashback(data.cashback));
  html = replaceBlock(html, 'REWARD', renderHeroReward(data.cashback));
  html = replaceBlock(html, 'FAB', renderContactFab(data.contacts));
  html = replaceBlock(html, 'NAVCTA', renderNavCta(data.contacts));
  html = replaceBlock(html, 'FAQ', renderFaq(data.faq));
  html = replaceBlock(html, 'EVENTS', renderEvents(data.events));
  html = replaceBlock(html, 'PRACTICES', renderPractices(data.practices));
  html = toggleEmptySection(html, 'clubs', Boolean(data.practices?.length || data.events?.length));
  html = toggleEmptySection(html, 'teachers', Boolean(data.teachers?.length));
  html = html.replace(/<a\b[^>]*\bhref="#teachers"[^>]*>/g, tag => {
    const clean = tag.replace(/\s+hidden(?=\s|>)/g, '');
    return data.teachers?.length ? clean : clean.replace(/>$/, ' hidden>');
  });
  html = applyTexts(html, data.texts);
  html = replaceBlock(html, 'OPTIONS', data.courses.map(course => `<option value="${escapeHTML(course.id)}">${escapeHTML([course.name, course.subtitle].filter(Boolean).join(' '))}</option>`).join(''));
  html = replaceBlock(html, 'SEO', renderMetadata(data.site));
  html = html.replace(/<!-- CONTACT_START:([a-z]+) -->[\s\S]*?<!-- CONTACT_END:\1 -->/g, (_, key) => `<!-- CONTACT_START:${key} -->\n${renderContacts(data.contacts, { compact: key === 'dialog' })}\n<!-- CONTACT_END:${key} -->`);
  html = replaceBlock(html, 'ASSET_VERSIONS', '<script src="content.js"></script><script src="assets/i18n/uz.js"></script><script src="assets/i18n/kaa.js"></script>');
  return versionContentAssets(html, data);
}

// The full results page grows with the admin data: every published result becomes a card.
// --- Results page showcase -------------------------------------------------------------------------------------------
// Everything here is derived from the published results, so the page never states a figure the list does not contain.
const numericScore = result => Number(String(result.score).replace(',', '.'));
function bestByExam(results = []) {
  const best = new Map();
  for (const result of results) {
    const value = numericScore(result);
    if (!Number.isFinite(value)) continue;
    if (!best.has(result.exam) || value > numericScore(best.get(result.exam))) best.set(result.exam, result);
  }
  return [...best.values()];
}
const scoreLabels = results => [...new Set(results.map(result => `${result.exam} ${result.score}`))];

// Profile cards of the full list: the same texts as the home cards plus an initials avatar and a highlight layer.
export function renderResultProfiles(results = []) {
  return results.map(result => `<article class="result-card" data-tilt><span class="result-shine" aria-hidden="true"></span><div class="result-score"><strong>${escapeHTML(result.score)}</strong><span>${escapeHTML(result.exam)}</span>${result.level ? `<small>${escapeHTML(result.level)}</small>` : ''}</div><blockquote>«${escapeHTML(result.quote)}»</blockquote><div class="result-person"><span class="result-avatar" aria-hidden="true">${escapeHTML(initials(result.student))}</span><p class="result-name">${escapeHTML([result.student, result.course].filter(Boolean).join(' · '))}</p></div></article>`).join('');
}

function directoryCard({ id, name, subtitle = '', cover, details, type }) {
  const label = escapeHTML(name);
  return `<article class="profile-card profile-card-${type}" data-course-flip><div class="course-flip-inner"><div class="course-face course-front"><div class="profile-cover">${cover}</div><div class="profile-identity"><h3>${label}</h3>${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ''}</div><a class="button profile-more" href="#${id}" data-flip-open aria-controls="${id}" aria-expanded="false" aria-label="Подробнее: ${label}">Подробнее${svgIcon('arrow-right')}</a></div><div class="course-face course-back" id="${id}"><h3 class="course-back-title" tabindex="-1">${label}</h3><div class="profile-details">${details}</div><button class="button-outline course-flip-back" type="button" data-flip-close aria-label="Назад: ${label}">Назад${svgIcon('arrow-right')}</button></div></div></article>`;
}

export function renderDirectoryTeachers(teachers = []) {
  if (!teachers.length) return '<p class="directory-empty" data-text="teachers.empty">Информация о преподавателях пока не опубликована.</p>';
  const sorted = [...teachers].sort((a, b) => (b.featured === true) - (a.featured === true));
  return `<div class="team-grid">${sorted.map((teacher, index) => directoryCard({
    id: `teacher-details-${index + 1}`, name: teacher.name, subtitle: teacher.role, type: 'teacher',
    cover: teacher.photo ? `<img class="profile-photo" src="${escapeHTML(teacher.photo)}" alt="Фото: ${escapeHTML(teacher.name)}" width="600" height="750" loading="lazy" decoding="async">` : '<span class="profile-initials" aria-hidden="true"><img class="profile-brand" src="assets/stanford-icon.svg" alt="" width="88" height="88"></span>',
    details: `<p class="profile-back-role">${escapeHTML(teacher.role)}</p><dl class="profile-facts">${teacher.qualification ? `<div><dt>Квалификация</dt><dd>${escapeHTML(teacher.qualification)}</dd></div>` : ''}${teacher.experience ? `<div><dt>Опыт</dt><dd>${escapeHTML(teacher.experience)}</dd></div>` : ''}</dl>`
  })).join('')}</div>`;
}

export function renderDirectoryResults(results = []) {
  if (!results.length) return '<p class="directory-empty" data-text="results.empty">Результаты пока не опубликованы.</p>';
  return results.map((result, index) => directoryCard({
    id: `student-details-${index + 1}`, name: result.student, subtitle: result.course, type: 'result',
    cover: '<span class="profile-initials" aria-hidden="true"><img class="profile-brand" src="assets/stanford-icon.svg" alt="" width="88" height="88"></span>',
    details: `<div class="profile-result-score"><strong>${escapeHTML(result.score)}</strong><span>${escapeHTML(result.exam)}${result.level ? ` · ${escapeHTML(result.level)}` : ''}</span></div><blockquote>«${escapeHTML(result.quote)}»</blockquote>`
  })).join('');
}

// Decorative line of scores that take turns (assets/ui.js); the cards below carry the same facts for everyone.
function loopMarkup(labels) {
  if (!labels.length) return '';
  return `<p class="text-loop" data-loop aria-hidden="true">${labels.map((label, index) => `<span${index ? '' : ' class="is-active"'}>${escapeHTML(label)}</span>`).join('')}</p>`;
}
export function renderResultLoop(results = []) {
  return loopMarkup(scoreLabels(results));
}

// Best published score per exam, as rolling counters.
export function renderResultSummary(results = []) {
  const best = bestByExam(results);
  if (!best.length) return '';
  return `<dl class="score-tiles">${best.map(result => `<div><dt>${escapeHTML(result.exam)}</dt><dd data-roll>${escapeHTML(result.score)}</dd></div>`).join('')}</dl>`;
}

export function renderResultBadge(results = []) {
  const top = results[0];
  return top ? `<span class="lanyard-score">${escapeHTML(`${top.exam} ${top.score}`)}</span>` : '';
}

export function renderLanyard() {
  return '<div class="lanyard lanyard-yellow" data-swing aria-hidden="true"><span class="lanyard-strap"></span><span class="lanyard-clip"></span><div class="lanyard-card"><span class="lanyard-hole"></span><span class="lanyard-logo"><img src="assets/stanford-icon.svg" alt="" width="48" height="48"></span><strong>Stanford</strong><small>language center</small></div></div>';
}

// Two rows that move only while the page scrolls: large labels, then brand marks between short labels.
function bandMarkup(large, small) {
  if (!large.length || !small.length) return '';
  const fill = (items, minimum) => Array.from({ length: Math.max(minimum, items.length) }, (_, index) => items[index % items.length]);
  const first = fill(large, 8).map(label => `<span>${escapeHTML(label)}</span>`).join('');
  const second = fill(small, 8).map(label => `<span class="band-mark"><img src="assets/stanford-icon.svg" alt="" width="32" height="32"></span><span>${escapeHTML(label)}</span>`).join('');
  // Each track holds its content twice, so the row can loop without a visible seam.
  return `<div class="scroll-band" data-scroll-band aria-hidden="true"><div class="scroll-row"><div class="scroll-track scroll-track-scores">${first}${first}</div></div><div class="scroll-row"><div class="scroll-track scroll-track-marks">${second}${second}</div></div></div>`;
}
export function renderResultBand(results = []) {
  return bandMarkup(scoreLabels(results), [...new Set(results.map(result => result.exam))]);
}

// Teachers page: the same decoration built from the published qualifications (e.g. «IELTS 8.5», «CELTA»).
const qualifications = teachers => [...new Set(teachers.map(teacher => teacher.qualification).filter(Boolean))];
export function renderTeacherLoop(teachers = []) {
  return loopMarkup(qualifications(teachers));
}
export function renderTeacherBand(teachers = []) {
  const labels = qualifications(teachers);
  return bandMarkup(labels, [...labels].reverse());
}

export function generateResults(html, data) {
  html = html.replace(/\r\n/g, '\n');
  validateContent(data);
  html = replaceBlock(html, 'RESULTS_LIST', renderDirectoryResults(data.results));
  html = replaceBlock(html, 'LOOP', '');
  html = replaceBlock(html, 'SUMMARY', renderResultSummary(data.results));
  html = replaceBlock(html, 'BADGE', data.results?.length ? renderLanyard() : '');
  html = replaceBlock(html, 'BAND', '');
  html = replaceBlock(html, 'ROBOTS', renderRobots(data.site));
  html = replaceBlock(html, 'SEO', renderMetadata(data.site, 'results.html'));
  return versionContentAssets(applyTexts(html, data.texts), data);
}

// The teachers page lists everyone (featured first); the home page shows only the admin-configured tops.
export function generateTeachers(html, data) {
  html = html.replace(/\r\n/g, '\n');
  validateContent(data);
  html = replaceBlock(html, 'TEACHERS', renderDirectoryTeachers(data.teachers));
  html = replaceBlock(html, 'BADGE', data.teachers?.length ? renderLanyard() : '');
  html = replaceBlock(html, 'LOOP', '');
  html = replaceBlock(html, 'BAND', '');
  html = replaceBlock(html, 'ROBOTS', renderRobots(data.site));
  html = replaceBlock(html, 'SEO', renderMetadata(data.site, 'teachers.html'));
  return versionContentAssets(applyTexts(html, data.texts), data);
}

export function generateCareer(html, data) {
  html = html.replace(/\r\n/g, '\n');
  validateContent(data);
  html = replaceBlock(html, 'ROBOTS', renderRobots(data.site));
  html = replaceBlock(html, 'SEO', renderMetadata(data.site, 'career.html'));
  return versionContentAssets(applyTexts(html, data.texts), data);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const data = readContent();
  const pages = [
    { file: new URL('./index.html', import.meta.url), build: generate, label: 'index.html' },
    { file: new URL('./results.html', import.meta.url), build: generateResults, label: 'results.html' },
    { file: new URL('./teachers.html', import.meta.url), build: generateTeachers, label: 'teachers.html' },
    { file: new URL('./career.html', import.meta.url), build: generateCareer, label: 'career.html' }
  ];
  let stale = false;
  const generated = pages.map(page => {
    const source = fs.readFileSync(page.file, 'utf8');
    return { ...page, source, output: page.build(source, data) };
  });
  for (const { file, source, output, label } of generated) {
    if (process.argv.includes('--check')) {
      if (output !== source) { console.error(`Generated ${label} is stale. Run node build.mjs`); stale = true; }
    } else {
      fs.writeFileSync(file, output);
    }
  }
  if (process.argv.includes('--check')) {
    if (stale) process.exitCode = 1;
    else console.log('Generated HTML is current.');
  } else {
    console.log('Static courses, prices, direct contacts and the results page generated.');
  }
}
