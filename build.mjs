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
    'arrow-left': 'M19 12H5 M12 5l-7 7 7 7',
    close: 'M6 6l12 12 M18 6 6 18',
    check: 'm5 12 4 4L19 6',
    plus: 'M12 5v14 M5 12h14',
    camera: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
    telegram: 'm22 2-7 20-4-9-9-4Z M22 2 11 13',
    'map-pin': 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    instagram: 'M17 2H7a5 5 0 0 0-5 5v10a5 5 0 0 0 5 5h10a5 5 0 0 0 5-5V7a5 5 0 0 0-5-5Zm-5 15a5 5 0 1 1 5-5 5 5 0 0 1-5 5Zm5.5-9.8a1.2 1.2 0 1 1 1.2-1.2 1.2 1.2 0 0 1-1.2 1.2Z',
    clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 6v6l4 2',
    mail: 'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z m18 2-10 6L2 7',
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
const videoPattern = /^assets\/[a-z0-9/_-]+\.mp4$/;

export function validateMediaGallery(items, label = 'Gallery') {
  if (items === undefined) return;
  if (!Array.isArray(items) || items.length > 8) throw new Error(`${label} needs an array with up to 8 media items`);
  let videos = 0;
  const localFile = (value, pattern) => typeof value === 'string' && pattern.test(value)
    && fs.existsSync(new URL(value, import.meta.url)) && fs.lstatSync(new URL(value, import.meta.url)).isFile();
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
        || !Object.hasOwn(item, 'type') || !Object.hasOwn(item, 'src')
        || !['image', 'video'].includes(item.type)) throw new Error(`${label} has an invalid media type`);
    if (item.alt !== undefined && (typeof item.alt !== 'string' || item.alt.length > 160)) throw new Error(`${label} needs short media alternative text`);
    if (item.type === 'image') {
      if (!localFile(item.src, photoPattern) || item.poster !== undefined) throw new Error(`${label} needs an existing local image`);
    } else {
      videos += 1;
      if (videos > 2 || !localFile(item.src, videoPattern)) throw new Error(`${label} allows up to 2 existing local MP4 videos`);
      if (item.poster !== undefined && !localFile(item.poster, photoPattern)) throw new Error(`${label} needs an existing local image poster`);
    }
  }
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
    validateMediaGallery(practice.media, 'Practice gallery');
  }
  if (data.events !== undefined && (!Array.isArray(data.events) || data.events.length > 100)) throw new Error('Events must be an array with up to 100 items');
  for (const event of data.events ?? []) {
    validateMediaGallery(event.media, 'Event gallery');
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
    if (course.specialPrice != null && (!Number.isFinite(course.specialPrice) || course.specialPrice <= 0 || course.specialPrice >= course.price)) throw new Error(`Invalid family price: ${course.id}`);
    if (!/^#[a-z0-9-]+$/.test(course.target)) throw new Error(`Invalid course target: ${course.id}`);
  }
  if (!data.contacts || typeof data.contacts !== 'object' || Array.isArray(data.contacts)) throw new Error('Contacts must be an object');
  if (data.contacts.verified) {
    const { phones = [], telegrams = [], hrTelegram = '', instagram = '', email = '', locations = [] } = data.contacts;
    if (!Array.isArray(phones) || !Array.isArray(telegrams)) throw new Error('Contact channels must be arrays');
    if (!phones.length && !telegrams.length) throw new Error('Verified contact must have an admissions channel');
    if (phones.some(phone => typeof phone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(phone))) throw new Error('Use an international phone number');
    const telegramPattern = /^https:\/\/t\.me\/[a-zA-Z0-9_]{5,32}$/;
    if (telegrams.some(url => typeof url !== 'string' || !telegramPattern.test(url)) || (hrTelegram && !telegramPattern.test(hrTelegram))) throw new Error('Use a direct Telegram account URL');
    if (new Set(phones).size !== phones.length || new Set(telegrams.map(url => url.toLowerCase())).size !== telegrams.length) throw new Error('Contact channels must be unique');
    if (hrTelegram && telegrams.some(url => url.toLowerCase() === hrTelegram.toLowerCase())) throw new Error('HR Telegram must be separate from admissions');
    if (instagram && !/^https:\/\/www\.instagram\.com\/[a-zA-Z0-9_.]{1,30}\/?$/.test(instagram)) throw new Error('Use a direct Instagram profile URL');
    if (email && (typeof email !== 'string' || email.length > 120 || !/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(email))) throw new Error('Use a valid email address');
    if (!Array.isArray(locations)) throw new Error('Locations must be an array');
    const locationIds = new Set();
    for (const location of locations) {
      if (!/^[a-z0-9-]+$/.test(location.id) || locationIds.has(location.id)) throw new Error('Location IDs must be unique slugs');
      locationIds.add(location.id);
      if (typeof location.name !== 'string' || !location.name.trim() || typeof location.address !== 'string' || !location.address.trim()) throw new Error('Location must have a name and address');
      if (location.hours !== undefined && (typeof location.hours !== 'string' || !location.hours.trim() || location.hours.length > 80)) throw new Error('Location hours must be short text');
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
  validateMediaGallery(data.site?.heroMedia, 'Hero gallery');
  const demo = data.site?.demoMode;
  if (demo !== undefined && typeof demo !== 'boolean') throw new Error('demoMode must be true or false');
  if (data.site?.demoLabels !== undefined && typeof data.site.demoLabels !== 'boolean') throw new Error('demoLabels must be true or false');
  if (data.site?.analyticsToken !== undefined && !/^[0-9a-f]{32}$/.test(data.site.analyticsToken)) throw new Error('analyticsToken must be the 32-character Cloudflare token');
  if (data.site?.holiday !== undefined) {
    const { mode, text } = data.site.holiday || {};
    if (!['auto', 'off', ...Object.keys(HOLIDAYS)].includes(mode)) throw new Error('holiday.mode must be auto, off or a known holiday');
    if (text !== undefined && (typeof text !== 'string' || !text.trim() || text.length > 120)) throw new Error('holiday.text must be short text');
  }
  const { stats = [], teachers = [], results = [] } = data;
  if (![stats, teachers, results].every(Array.isArray)) throw new Error('Stats, teachers and results must be arrays');
  for (const stat of stats) if (!text(stat.value, 12) || !text(stat.label, 40)) throw new Error('Stat needs a short value and label');
  for (const teacher of teachers) {
    if (!text(teacher.name, 60) || !text(teacher.role, 80) || !optionalText(teacher.qualification, 40) || !optionalText(teacher.experience, 40)) throw new Error('Teacher needs a name, role and short optional details');
    if (teacher.featured !== undefined && typeof teacher.featured !== 'boolean') throw new Error('Teacher featured must be true or false');
    validatePhoto(teacher.photo, 'Use an existing local teacher photo');
    validateMediaGallery(teacher.media, 'Teacher gallery');
  }
  for (const result of results) {
    if (!text(result.score, 8) || !text(result.exam, 20) || !optionalText(result.level, 20) || !text(result.quote, 240) || !text(result.student, 40) || !optionalText(result.course, 60)) throw new Error('Result needs a score, exam, quote and student');
    if (result.featured !== undefined && typeof result.featured !== 'boolean') throw new Error('Result featured must be true or false');
    validateMediaGallery(result.media, 'Student gallery');
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
  if (!compact && contacts.email) extras.push(`<a href="mailto:${escapeHTML(contacts.email)}">${svgIcon('mail')}<span>${escapeHTML(contacts.email)}</span></a>`);
  if (!compact && contacts.instagram) extras.push(`<a href="${escapeHTML(contacts.instagram)}" target="_blank" rel="noopener noreferrer">${svgIcon('instagram')}<span>Instagram</span>${svgIcon('external')}</a>`);
  // HR no longer gets messages directly from this block: candidates fill the career form instead.
  if (!compact) extras.push(`<a class="contact-extras-link" href="career">${svgIcon('check')}<span>Заполнить анкету</span>${svgIcon('arrow-right')}</a>`);
  if (!compact) extras.push(`<a class="contact-extras-link" href="feedback">${svgIcon('mail')}<span>Жалобы и предложения</span>${svgIcon('arrow-right')}</a>`);
  // The course dialog is where the visitor signs up: send them to the branch addresses instead of a messenger.
  const jump = compact ? `<p class="contact-jump"><a class="text-link" href="#enroll" data-dialog-jump>Приходите в центр: адреса филиалов${svgIcon('arrow-right')}</a></p>` : '';
  return `<div class="contact-channels">${groups.join('')}</div>${extras.length ? `<div class="contact-extras">${extras.join('')}</div>` : ''}${jump}`;
}

const demoTag = site => showDemo(site) ? ' <span class="demo-tag">Пример</span>' : '';
// demoLabels=false keeps the sample data private to the team: no «Пример» banners while the owner prepares real content.
const showDemo = site => Boolean(site?.demoMode && site?.demoLabels !== false);

// Samples must not be indexed: while demo mode is on, search engines are asked to skip the page.
// Cloudflare Web Analytics: no cookies, so no consent banner. Off in demo mode and without a token.
// Holiday greetings: dates are month-day in Nukus time (a range may cross the new year).
export const HOLIDAYS = {
  newyear: { from: '12-20', to: '01-10', text: 'С Новым годом!' },
  march8: { from: '03-06', to: '03-09', text: 'С 8 Марта!' },
  navruz: { from: '03-18', to: '03-25', text: 'С праздником Навруз!' },
  independence: { from: '08-29', to: '09-02', text: 'С Днём независимости Узбекистана!' },
  teachers: { from: '09-29', to: '10-02', text: 'С Днём учителя и наставника!' }
};
const HOLIDAY_ICONS = { independence: 'assets/flags/uz.svg' };

// «auto» renders every greeting hidden and assets/holiday.js shows today's one; a chosen holiday is always on.
export function renderHoliday(site) {
  const mode = site?.holiday?.mode || 'auto';
  if (mode === 'off') return '';
  const names = mode === 'auto' ? Object.keys(HOLIDAYS) : [mode];
  const close = `<button type="button" class="holiday-close" data-holiday-close aria-label="Скрыть поздравление">${svgIcon('close')}</button>`;
  return names.map(name => {
    const { from, to, text } = HOLIDAYS[name];
    const message = site?.holiday?.text || text;
    const icon = HOLIDAY_ICONS[name] || `assets/holiday/${name}.svg`;
    return `<div class="holiday-banner" data-holiday="${name}" data-from="${from}" data-to="${to}"${mode === 'auto' ? '' : ' data-holiday-forced="true"'} role="note" hidden><img src="${icon}" alt="" width="20" height="20"><span>${escapeHTML(message)}</span>${close}</div>`;
  }).join('');
}

export function renderAnalytics(site) {
  if (!site?.analyticsToken || site.demoMode) return '';
  return `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${site.analyticsToken}"}'></script>`;
}

export function renderRobots(site) {
  return site?.demoMode ? '<meta name="robots" content="noindex, nofollow">' : '';
}

// «Пн–Сб, 09:00–19:00» → schema.org opening hours. Any other wording is shown on the page only.
const WEEK = { 'Пн': 'Monday', 'Вт': 'Tuesday', 'Ср': 'Wednesday', 'Чт': 'Thursday', 'Пт': 'Friday', 'Сб': 'Saturday', 'Вс': 'Sunday' };
export function openingHours(hours = '') {
  const match = /^(Пн|Вт|Ср|Чт|Пт|Сб|Вс)\s*[–-]\s*(Пн|Вт|Ср|Чт|Пт|Сб|Вс),?\s+([01]\d|2[0-3]):([0-5]\d)\s*[–-]\s*([01]\d|2[0-3]):([0-5]\d)$/.exec(hours.trim());
  if (!match) return null;
  const days = Object.keys(WEEK);
  const from = days.indexOf(match[1]);
  const to = days.indexOf(match[2]);
  if (to < from) return null;
  return { '@type': 'OpeningHoursSpecification', dayOfWeek: days.slice(from, to + 1).map(day => WEEK[day]), opens: `${match[3]}:${match[4]}`, closes: `${match[5]}:${match[6]}` };
}

// Public pages listed for search engines; the career form is included, the 404 page is not.
export const SITEMAP_PAGES = ['', 'results', 'teachers', 'career'];

// robots.txt and sitemap.xml follow the site address from the admin, so a new domain needs only a republish.
// In demo mode (or without an address) the sitemap stays empty: sample pages are not offered for indexing.
export function renderRobotsTxt(site) {
  const lines = ['User-agent: *', 'Allow: /'];
  if (site?.url && !site.demoMode) lines.push('', `Sitemap: ${new URL('sitemap.xml', site.url.endsWith('/') ? site.url : `${site.url}/`).href}`);
  return `${lines.join('\n')}\n`;
}

export function renderSitemap(site) {
  const base = site?.url ? (site.url.endsWith('/') ? site.url : `${site.url}/`) : '';
  const urls = base && !site.demoMode ? ['ru', ...LANGUAGES].flatMap(lang => SITEMAP_PAGES.map(page => `  <url><loc>${escapeHTML(pageAddress(site, page, lang))}</loc></url>`)).join('\n') : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls ? `${urls}\n` : ''}</urlset>\n`;
}

// Address of one public page in one language: Russian at the root, translations in /uz/ and /kaa/.
export function pageAddress(site, page = '', lang = 'ru') {
  // Public addresses have no «.html»: Caddy serves /career from career.html.
  page = page.replace(/(?:^|\/)index\.html$/, '').replace(/\.html$/, '');
  const base = site.url.endsWith('/') ? site.url : `${site.url}/`;
  if (lang === 'ru') return page ? new URL(page, base).href : site.url;
  return new URL(`${lang}/${page}`, base).href;
}

export function renderMetadata(site, page = '', lang = 'ru') {
  if (!site?.url) return '';
  const base = site.url.endsWith('/') ? site.url : `${site.url}/`;
  const canonical = pageAddress(site, page, lang);
  // Search engines learn that the three language versions are the same page.
  const alternates = [...['ru', ...LANGUAGES].map(code => [code, pageAddress(site, page, code)]), ['x-default', pageAddress(site, page)]]
    .map(([code, href]) => `<link rel="alternate" hreflang="${code}" href="${escapeHTML(href)}">`).join('\n');
  return `<link rel="canonical" href="${escapeHTML(canonical)}">\n<meta property="og:url" content="${escapeHTML(canonical)}">\n<meta property="og:image" content="${escapeHTML(new URL('assets/og-image.png', base).href)}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n${alternates}`;
}

// ---------- Translated copies of the public pages (/uz/, /kaa/) ----------
// The same dictionaries as the language switch, applied at build time so search engines see each language.
// A string without a translation stays in Russian, exactly as in the browser.
export const LANGUAGES = ['uz', 'kaa', 'en'];
const PACK_NAMES = { uz: 'stanfordUz', kaa: 'stanfordKaa', en: 'stanfordEn' };
const TRANSLATED_ATTRIBUTES = new Set(['aria-label', 'alt', 'title', 'placeholder', 'content']);
const URL_ATTRIBUTES = new Set(['src', 'href', 'poster']);
const PAGE_LINK = /^(?:\.\/|(?:index|results|teachers|career|privacy|feedback)(?:\.html)?)(?:[?#].*)?$/;
const CYRILLIC = /[А-Яа-яЁё]/;
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };

export function loadLanguagePack(lang, source = fs.readFileSync(new URL(`./assets/i18n/${lang}.js`, import.meta.url), 'utf8')) {
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { timeout: 1000 });
  const pack = sandbox.window[PACK_NAMES[lang]];
  if (!pack?.strings) throw new Error(`Invalid language pack: ${lang}`);
  return pack;
}

const decodeEntities = text => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
  if (name[0] !== '#') return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
  return String.fromCodePoint(name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10));
});

// Mirrors translate() of the language switch: whole trimmed text, then the dynamic patterns.
export function makeTranslator(pack) {
  const translate = value => {
    const raw = value.trim();
    if (!raw) return value;
    let out = pack.strings[raw.replace(/\s+/g, ' ')];
    if (out === undefined) {
      for (const [pattern, build] of pack.patterns || []) {
        const match = raw.match(pattern);
        if (match) { out = build(match, translate); break; }
      }
    }
    if (out === undefined) return value;
    return value.match(/^\s*/)[0] + out + value.match(/\s*$/)[0];
  };
  return translate;
}

// Pages live one folder deeper: shared files get «../», links between pages stay inside the language.
const localUrl = value => (!value || /^(?:[a-z][a-z0-9+.-]*:|\/|#|\.\.\/)/i.test(value) || PAGE_LINK.test(value)) ? value : `../${value}`;
const localSrcset = value => value.split(',').map(candidate => {
  const [url, ...descriptors] = candidate.trim().split(/\s+/);
  return [localUrl(url), ...descriptors].join(' ');
}).join(', ');

function translateTag(tag, translate) {
  return tag.replace(/(\s)([a-zA-Z:-]+)="([^"]*)"/g, (whole, space, name, value) => {
    const key = name.toLowerCase();
    if (URL_ATTRIBUTES.has(key)) return `${space}${name}="${localUrl(value)}"`;
    if (key === 'srcset') return `${space}${name}="${localSrcset(value)}"`;
    if (!TRANSLATED_ATTRIBUTES.has(key) || !CYRILLIC.test(value)) return whole;
    const decoded = decodeEntities(value);
    const next = translate(decoded);
    return next === decoded ? whole : `${space}${name}="${escapeHTML(next)}"`;
  });
}

export function translatePage(html, lang, pack = loadLanguagePack(lang)) {
  const translate = makeTranslator(pack);
  const parts = html.split(/(<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<[^>]*>)/i);
  const out = parts.map((part, index) => {
    if (index % 2 === 0) {
      if (!CYRILLIC.test(part)) return part;
      const decoded = decodeEntities(part);
      const next = translate(decoded);
      return next === decoded ? part : escapeText(next);
    }
    if (part.startsWith('<!--')) return part;
    if (/^<script\b/i.test(part)) {
      const open = part.indexOf('>') + 1;
      return translateTag(part.slice(0, open), translate) + part.slice(open);
    }
    if (/^<style\b/i.test(part)) return part;
    return translateTag(part, translate);
  }).join('');
  return out.replace(/<html lang="ru">/, `<html lang="${lang}" data-lang-page="${lang}">`);
}

// One translated copy: translated text, local paths, its own canonical address and language metadata.
// The privacy page adds its long legal text from assets/i18n/privacy-<lang>.js to the shared dictionary.
export function languagePackFor(lang, page = '') {
  const read = name => fs.readFileSync(new URL(`./assets/i18n/${name}.js`, import.meta.url), 'utf8');
  return loadLanguagePack(lang, page === 'privacy.html' ? `${read(lang)}\n${read(`privacy-${lang}`)}` : read(lang));
}

export function generateLanguagePage(html, data, lang, page, pack = languagePackFor(lang, page)) {
  // Only this language's dictionary, right before the shared switch; versions follow the file content.
  const scripts = [`assets/i18n/${lang}.js`, ...(page === 'privacy.html' ? [`assets/i18n/privacy-${lang}.js`] : [])]
    .map(src => `<script src="${src}"></script>\n  `).join('');
  html = html.replace(/<script src="assets\/i18n\/language\.js/, match => `${scripts}${match}`);
  html = versionContentAssets(html, data);
  // Translations need no Cyrillic font up front; Uzbek and Karakalpak preload their small letters font instead.
  const cyrillic = '<link rel="preload" href="assets/fonts/inter-cyrillic-wght-normal.woff2" as="font" type="font/woff2" crossorigin>';
  html = html.replace(`  ${cyrillic}
`, lang === 'en' ? '' : `  ${cyrillic.replace('inter-cyrillic-wght-normal', 'inter-uz-kaa-wght-normal')}
`);
  const translated = translatePage(html, lang, pack);
  return replaceBlock(translated, 'SEO', renderMetadata(data.site, page === 'index.html' ? '' : page, lang));
}

// Machine-readable card of the centre for search engines, built only from the published, verified contacts.
// It is a data block (never executed), so the strict script-src policy is not involved.
export function renderStructuredData(site, contacts) {
  if (!site?.url || !contacts?.verified) return '';
  const base = site.url.endsWith('/') ? site.url : `${site.url}/`;
  const sameAs = [...(contacts.telegrams || []), contacts.instagram].filter(Boolean);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: 'Stanford Language Center',
    url: site.url,
    logo: new URL('assets/stanford-logo.png', base).href,
    image: new URL('assets/og-image.png', base).href,
    ...(contacts.phones?.length ? { telephone: contacts.phones } : {}),
    ...(contacts.email ? { email: contacts.email } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    location: (contacts.locations || []).map(location => ({
      '@type': 'Place',
      name: location.name,
      address: { '@type': 'PostalAddress', streetAddress: location.address, addressLocality: site.city || 'Нукус', addressCountry: 'UZ' },
      ...(openingHours(location.hours) ? { openingHoursSpecification: openingHours(location.hours) } : {}),
      ...(location.coordinates?.length === 2 ? { geo: { '@type': 'GeoCoordinates', latitude: location.coordinates[1], longitude: location.coordinates[0] } } : {})
    }))
  };
  // «<» is escaped so that no text from the admin can close the block.
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

// A publication changes these URLs whenever the data or translations change, even if the old files are cached.
export function versionContentAssets(html, data, dictionary = fs.readFileSync(new URL('./assets/i18n/uz.js', import.meta.url)), karakalpakDictionary = fs.readFileSync(new URL('./assets/i18n/kaa.js', import.meta.url)), englishDictionary = fs.readFileSync(new URL('./assets/i18n/en.js', import.meta.url))) {
  const version = value => parseInt(createHash('sha256').update(value).digest('hex').slice(0, 12), 16).toString();
  const versions = { 'content.js': version(JSON.stringify(data)), 'assets/i18n/uz.js': version(dictionary), 'assets/i18n/kaa.js': version(karakalpakDictionary), 'assets/i18n/en.js': version(englishDictionary) };
  // Policy translations get a version from their own content as well.
  const fileVersion = file => versions[file] ?? (versions[file] = version(fs.readFileSync(new URL(`./${file}`, import.meta.url))));
  return html.replace(/\b(src|href)="(content\.js|assets\/i18n\/(?:privacy-)?(?:uz|kaa|en)\.js)(?:\?v=[^"]*)?"/g,
    (_, attribute, file) => `${attribute}="${file}?v=${fileVersion(file)}"`);
}

export function renderDemoBanner(site) {
  return showDemo(site) ? '<p class="demo-banner">Демо-версия: блоки «Пример» — образцы</p>' : '';
}

export function renderStats(stats = [], site) {
  if (!stats.length) return '';
  const items = stats.map(stat => `<div><dt>${escapeHTML(stat.label)}</dt><dd>${escapeHTML(stat.value)}</dd></div>`).join('');
  return `<section class="wrap stats-strip" aria-label="Stanford в цифрах${showDemo(site) ? ' (пример)' : ''}">${showDemo(site) ? '<span class="demo-tag">Пример</span>' : ''}<dl>${items}</dl></section>`;
}

// One ordered, progressively enhanced gallery for the hero and every content card.
// Files have already passed validateContent(); all user text still stays escaped.
// Official logo on a brand panel: shown wherever a card has no photo or video yet.
export const BRAND_COVER = '<div class="brand-cover" aria-hidden="true"><img src="assets/stanford-icon.svg" alt="" width="64" height="64"></div>';

// The admin publishes a lighter phone copy next to each photo (assets/uploads/<hash>-800.webp).
// It is linked only when the file exists, so imported or hand-placed photos keep a plain src.
export const IMAGE_SIZES = { card: '(max-width: 767px) 100vw, 400px', wide: '(max-width: 1023px) 100vw, 640px', tile: '44px' };
export function responsiveAttributes(src, sizes = IMAGE_SIZES.card) {
  const match = /^assets\/uploads\/([0-9a-f]{64})\.jpg$/.exec(src || '');
  if (!match) return '';
  const small = `assets/uploads/${match[1]}-800.webp`;
  if (!fs.existsSync(new URL(small, import.meta.url))) return '';
  return ` srcset="${small} 800w, ${src} 1600w" sizes="${sizes}"`;
}

export function renderMediaGallery(items = [], label = 'Stanford', { eager = false } = {}) {
  if (!items.length) return '';
  const slides = items.map((item, index) => {
    const source = escapeHTML(item.src);
    const alt = escapeHTML(item.alt || label);
    const medium = item.type === 'video'
      ? `<video controls playsinline preload="none"${item.poster ? ` poster="${escapeHTML(item.poster)}"` : ''} aria-label="${alt}" width="1280" height="720" src="${source}"><a href="${source}">Открыть видео</a></video>`
      : `<img src="${source}"${responsiveAttributes(item.src, eager ? IMAGE_SIZES.wide : IMAGE_SIZES.card)} alt="${alt}" width="1280" height="800" loading="${eager && index === 0 ? 'eager' : 'lazy'}" decoding="async">`;
    return `<figure class="media-gallery-slide" data-gallery-slide>${medium}</figure>`;
  }).join('');
  return `<div class="media-gallery" data-media-gallery role="region" aria-label="Фото и видео: ${escapeHTML(label)}"><div class="media-gallery-track" data-gallery-track tabindex="0" aria-label="Фото и видео">${slides}</div><div class="media-gallery-controls" data-gallery-controls hidden><button type="button" data-gallery-prev aria-label="Предыдущий слайд">${svgIcon('arrow-left')}</button><span data-gallery-status role="status" aria-live="polite" aria-atomic="true">1 / ${items.length}</span><button type="button" data-gallery-next aria-label="Следующий слайд">${svgIcon('arrow-right')}</button></div></div>`;
}

export function renderPractices(practices = []) {
  if (!practices.length) return '';
  const artwork = { 'speaking-club': 'speaking', 'movie-club': 'movie', 'mock-exams': 'exams' };
  // Phones get one card at a time with arrows and dots; from 768px it is the usual grid (the nav hides itself).
  const cards = practices.map(practice => {
    const fallback = Object.hasOwn(artwork, practice.id) ? artwork[practice.id] : undefined;
    const image = practice.photo || (fallback ? `assets/practice/${fallback}.svg` : 'assets/stanford-icon.svg');
    const kind = practice.photo ? ' practice-media--photo' : fallback ? '' : ' practice-media--brand';
    const alt = practice.photo ? practice.photoAlt || practice.title : '';
    const media = practice.media?.length
      ? `<div class="practice-media practice-media--gallery">${renderMediaGallery(practice.media, practice.title)}</div>`
      : `<div class="practice-media${kind}"><img src="${escapeHTML(image)}"${responsiveAttributes(practice.photo)} alt="${escapeHTML(alt)}" width="640" height="400" loading="lazy" decoding="async"></div>`;
    return `<article class="practice-card">${media}<div class="practice-body">${practice.label ? `<span class="practice-kicker">${escapeHTML(practice.label)}</span>` : ''}<h3>${escapeHTML(practice.title)}</h3><p>${escapeHTML(practice.description)}</p></div></article>`;
  }).join('');
  return renderCarousel('practice-list practice-carousel', 'clubs-title', cards);
}

function toggleEmptySection(html, id, visible) {
  return html.replace(new RegExp(`<section\\b[^>]*\\bid="${id}"[^>]*>`), tag => {
    const clean = tag.replace(/\s+hidden(?=\s|>)/g, '');
    return visible ? clean : clean.replace(/>$/, ' hidden>');
  });
}

// Home page limit for teachers and results; «Все преподаватели» / «Все результаты» open the full lists.
export const HOME_LIMIT = 6;

export function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
}

// Arrows and dots under a sideways row (assets/carousel.js); without JS the row still scrolls.
const CAROUSEL_NAV = `<div class="carousel-nav" data-carousel-nav hidden><button type="button" class="carousel-arrow" data-carousel-prev aria-label="Предыдущий слайд">${svgIcon('arrow-left')}</button><div class="carousel-dots" data-carousel-dots></div><button type="button" class="carousel-arrow" data-carousel-next aria-label="Следующий слайд">${svgIcon('arrow-right')}</button></div>`;
export function renderCarousel(trackClass, labelledBy, items) {
  return `<div class="carousel" data-carousel><div class="${trackClass} carousel-track" data-carousel-track tabindex="0" role="region" aria-labelledby="${labelledBy}">${items}</div>${CAROUSEL_NAV}</div>`;
}

export function renderTeachers(teachers = [], site, { featuredOnly = false, heading = true, profile = false } = {}) {
  const head = heading ? `<div class="section-top"><h2 id="teachers-title">Преподаватели${demoTag(site)}</h2></div>\n` : '';
  // Featured (admin-configured tops) come first; the original order is kept inside each group.
  const sorted = [...teachers].sort((a, b) => (b.featured === true) - (a.featured === true));
  let shown = sorted;
  if (featuredOnly) {
    const featured = sorted.filter(teacher => teacher.featured === true);
    // Graceful fallback: with no featured teacher configured the section keeps showing everyone.
    shown = (featured.length ? featured : sorted).slice(0, HOME_LIMIT);
  }
  if (!teachers.length) return heading ? `${head}` : '';
  const cards = shown.map(teacher => {
    const name = escapeHTML(teacher.name);
    const portrait = teacher.media?.length ? renderMediaGallery(teacher.media, teacher.name) : teacher.photo
      ? `<img class="teacher-photo" src="${escapeHTML(teacher.photo)}"${responsiveAttributes(teacher.photo)} alt="Фото: ${name}" width="600" height="750" loading="lazy" decoding="async">`
      : BRAND_COVER;
    const chipIcons = {
      qualification: '<svg class="icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="9" r="5"/><path d="M8.5 13.5 7 21l5-2.8L17 21l-1.5-7.5"/></svg>',
      experience: '<svg class="icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
    };
    const chips = [teacher.qualification && `<li class="teacher-chip-key">${chipIcons.qualification}${escapeHTML(teacher.qualification)}</li>`, teacher.experience && `<li>${chipIcons.experience}${escapeHTML(teacher.experience)}</li>`].filter(Boolean).join('');
    // The full list uses the tilt card of assets/ui.js; the home section keeps the plain card.
    return `<article class="teacher-card"${profile ? ' data-tilt' : ''}>${profile ? '<span class="result-shine" aria-hidden="true"></span>' : ''}${portrait}<div class="teacher-body"><h3>${name}</h3><p>${escapeHTML(teacher.role)}</p>${chips ? `<ul class="teacher-chips">${chips}</ul>` : ''}</div></article>`;
  }).join('');
  const more = featuredOnly ? `\n<a class="text-link results-more" href="teachers">Все преподаватели${svgIcon('arrow-right')}</a>` : '';
  // Home: one teacher at a time on phones, two or three side by side on wider screens.
  const grid = featuredOnly && heading ? renderCarousel('team-grid home-carousel', 'teachers-title', cards) : `<div class="team-grid">${cards}</div>`;
  return `${head}${grid}${more}`;
}

// One card per published student result; reused by the home section and the full results page.
export function renderResultCards(results = []) {
  return results.map(result => `<article class="result-card">${result.media?.length ? renderMediaGallery(result.media, result.student) : BRAND_COVER}<div class="result-score"><strong>${escapeHTML(result.score)}</strong><span>${escapeHTML(result.exam)}</span>${result.level ? `<small>${escapeHTML(result.level)}</small>` : ''}</div><blockquote>«${escapeHTML(result.quote)}»</blockquote><p class="result-name">${escapeHTML([result.student, result.course].filter(Boolean).join(' · '))}</p></article>`).join('');
}

export function renderResults(results = [], site, { featuredOnly = false } = {}) {
  if (!results.length) return '';
  // Featured (admin-configured tops) come first; the original order is kept inside each group.
  const sorted = [...results].sort((a, b) => (b.featured === true) - (a.featured === true));
  let shown = sorted;
  if (featuredOnly) {
    const featured = sorted.filter(result => result.featured === true);
    // Graceful fallback: with no featured result configured the section keeps showing everything.
    shown = (featured.length ? featured : sorted).slice(0, HOME_LIMIT);
  }
  return `<section data-reveal class="section wrap results-section" id="results" aria-labelledby="results-title">
<div class="section-top"><h2 id="results-title">Результаты студентов${demoTag(site)}</h2></div>
${featuredOnly ? renderCarousel('results-grid home-carousel', 'results-title', renderResultCards(shown)) : `<div class="results-grid">${renderResultCards(shown)}</div>`}
<a class="text-link results-more" href="results">Все результаты${svgIcon('arrow-right')}</a>
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
      ? `<a class="map-icon-link location-photo-link" href="${escapeHTML(location.photo)}" data-photo-zoom aria-label="Увеличить фото: ${name}" title="Фото входа"><img class="location-photo" src="${escapeHTML(location.photo)}"${responsiveAttributes(location.photo, IMAGE_SIZES.tile)} alt="Вход: ${name}" width="640" height="360" loading="lazy" decoding="async"></a>`
      : !demo ? '' : `<div class="location-photo location-photo-demo" role="img" aria-label="Пример: место для фото входа, ${name}">${svgIcon('camera')}<span>Фото входа</span><span class="demo-tag">Пример</span></div>`;
    // A real photo is a small tile next to the map buttons; the demo placeholder keeps its own slot.
    const tile = location.photo ? photo : '';
    return `<article class="location-card"><h4>${name}</h4><p>${address}</p>${location.hours ? `<p class="location-hours">${svgIcon('clock')}<span>${escapeHTML(location.hours)}</span></p>` : ''}${tile ? '' : photo}${select}<div class="map-links">${tile}${links}</div></article>`;
  }).join('');
  const map = first ? `<div class="branch-map-panel"><div class="map-toolbar"><p id="map-status" class="map-status" tabindex="-1" aria-live="polite">${escapeHTML(`${first.name} — ${first.address}`)}</p></div><iframe id="branch-map" class="branch-map" src="${escapeHTML(first.googleEmbed)}" title="${escapeHTML(`Карта: ${first.name}`)}" width="1100" height="360" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>` : '';
  const zoom = contacts.locations.some(location => location.photo) ? `<dialog class="photo-dialog" id="photo-dialog" aria-label="Фото входа"><button type="button" class="photo-dialog-close" data-photo-close aria-label="Закрыть окно">${svgIcon('close')}</button><img src="" alt="" width="1280" height="720" data-photo-full></dialog>` : '';
  return `<div class="contact-locations"><h3>Как добраться</h3><div class="location-map-layout"><div class="location-grid">${cards}</div>${map}</div>${zoom}</div>`;
}

// Both faces are static HTML: the programme remains readable without JavaScript.
export function renderCourses(courses, contacts = {}) {
  // The back of each card ends with a way to sign up: sign-up happens by phone.
  const phone = contacts.verified ? contacts.phones?.[0] : '';
  return courses.map(course => {
    const id = escapeHTML(course.id);
    const name = escapeHTML([course.name, course.subtitle].filter(Boolean).join(' '));
    return `<article class="course-card" id="course-${id}" tabindex="-1" data-category="${escapeHTML(course.category)}" data-course-id="${id}" data-course-flip>
<div class="course-flip-inner">
<div class="course-face course-front"><div class="course-front-brand" aria-hidden="true"><img src="assets/stanford-icon.svg" alt="" width="32" height="32"><span>Stanford</span></div><div class="course-head"><h3>${escapeHTML(course.name)}${course.subtitle ? `<span class="course-subtitle">${escapeHTML(course.subtitle)}</span>` : ''}</h3><p class="course-price"><strong>${money(course.price)}</strong> сум / месяц</p>${course.specialPrice ? `<p class="course-special"><span>Семья или 2 курса</span><strong>${money(course.specialPrice)} сум</strong></p>` : ''}</div>
<a class="course-enroll-btn course-flip-toggle" href="#course-details-${id}" data-flip-open aria-controls="course-details-${id}" aria-expanded="false" aria-label="Подробнее: ${name}">Подробнее${svgIcon('arrow-right')}</a></div>
<div class="course-face course-back" id="course-details-${id}"><h4 class="course-back-title" tabindex="-1">${name}</h4><p class="course-description">${escapeHTML(course.description)}</p>
<ul class="course-details" aria-label="В программе">${course.skills.map(skill => `<li>${svgIcon('check')}<span>${escapeHTML(skill)}</span></li>`).join('')}</ul>
<div class="course-back-actions">${phone ? `<a class="button course-call" href="tel:${escapeHTML(phone)}" aria-label="Записаться: ${name}">${svgIcon('phone')}<span>Позвонить и записаться</span></a>` : ''}<button class="button-outline course-flip-back" type="button" data-flip-close aria-label="Назад: ${name}">Назад${svgIcon('arrow-right')}</button></div></div>
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
  // «до …» names the largest amount that is announced; a tier whose caption has no digits («Сумма уточняется») is skipped.
  const announced = all.filter(tier => !tier.label || /\d/.test(tier.label));
  const top = (announced.length ? announced : all).reduce((best, tier) => tier.reward > best.reward ? tier : best);
  const pills = cashbackExams.flatMap(exam => all.filter(tier => tier.exam === exam.label && tier.hero).sort((a, b) => b.reward - a.reward))
    // A caption without digits (for example «Сумма уточняется») wins over the number.
    .map(tier => `<span>${escapeHTML(`${tier.exam} ${tier.score} · ${tier.label && !/\d/.test(tier.label) ? tier.label : shortReward(tier.reward)}`)}</span>`).join('');
  return `<a class="hero-reward-banner" href="#cashback"><div class="hero-reward-header"><span class="hero-reward-tag">${svgIcon('award')}Кэшбэк за результат</span><strong class="hero-reward-val">до ${escapeHTML(rewardLabel(top))}</strong></div>${pills ? `<div class="hero-reward-pills">${pills}</div>` : ''}<p class="hero-reward-sub">Выплачиваем деньги за официальные баллы</p></a>`;
}

// Trial-lesson CTA lives on the same page: sign-up happens at the centre, not in a messenger.
export function renderNavCta(contacts) {
  return `<a class="button nav-cta" href="#enroll" aria-label="Записаться в центре: адреса филиалов">Записаться в центре${svgIcon('arrow-right')}</a>`;
}

// Phones: a bar at the bottom of the screen to call or write right away (sign-up happens by phone or in person).
export function renderContactFab(contacts) {
  if (!contacts.verified) return '';
  const phone = contacts.phones?.[0];
  const telegram = contacts.telegrams?.[0];
  if (!phone && !telegram) return '';
  const call = phone ? `<a class="call-bar-call" href="tel:${escapeHTML(phone)}">${svgIcon('phone')}<span>Позвонить</span></a>` : '';
  const write = telegram ? `<a class="call-bar-telegram" href="${escapeHTML(telegram)}" target="_blank" rel="noopener noreferrer">${svgIcon('telegram')}<span>Telegram</span></a>` : '';
  return `<nav class="call-bar" aria-label="Быстрая связь">${call}${write}</nav>`;
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
// The home page lists the ten nearest events; the row scrolls sideways instead of growing down.
export const EVENTS_LIMIT = 10;

export function renderEvents(events = []) {
  if (!events.length) return '';
  const zone = { timeZone: 'Asia/Tashkent' };
  const formatter = new Intl.DateTimeFormat('ru-RU', { ...zone, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const day = new Intl.DateTimeFormat('ru-RU', { ...zone, day: 'numeric' });
  const clock = new Intl.DateTimeFormat('ru-RU', { ...zone, hour: '2-digit', minute: '2-digit' });
  const units = [['days', 'Дней'], ['hours', 'Часов'], ['minutes', 'Минут'], ['seconds', 'Секунд']];
  // Compact card: date chip, title, link icon, countdown; an optional photo/video gallery sits above it.
  const card = event => {
    const date = new Date(event.startsAt);
    const title = escapeHTML(event.title);
    // Without a photo or video the official logo keeps every card the same shape; a gallery replaces it later.
    const media = `<div class="event-media">${event.media?.length ? renderMediaGallery(event.media, event.title) : BRAND_COVER}</div>`;
    const telegram = /^https:\/\/(t\.me|telegram\.me)\//.test(event.url || '');
    const link = event.url ? `<a class="event-link${telegram ? ' event-link--telegram' : ''}" href="${escapeHTML(event.url)}" target="_blank" rel="noopener noreferrer" aria-label="${telegram ? 'Telegram' : 'Подробнее'}: ${title}" title="${telegram ? 'Telegram' : 'Подробнее'}">${svgIcon(telegram ? 'telegram' : 'external')}</a>` : '';
    return `<article class="event-card${event.media?.length ? ' has-media' : ''}">${media}<div class="event-body"><div class="event-head"><span class="event-date" aria-hidden="true"><strong>${escapeHTML(day.format(date))}</strong><span>${escapeHTML(clock.format(date))}</span></span><div class="event-heading"><h4>${title}</h4><time datetime="${escapeHTML(event.startsAt)}">${escapeHTML(formatter.format(date))} · Нукус</time></div>${link}</div>${event.description ? `<p class="event-description">${escapeHTML(event.description)}</p>` : ''}<div class="event-countdown" data-countdown="${escapeHTML(event.startsAt)}" aria-label="До начала события">${units.map(([unit, label]) => `<div><span data-unit="${unit}">—</span><small>${label}</small></div>`).join('')}</div><p data-countdown-status></p></div></article>`;
  };
  const upcoming = [...events].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).slice(0, EVENTS_LIMIT);
  return `<div class="events-section planned-events" id="events"><div class="section-top"><h3 id="events-title" data-text="events.heading">Запланированные события</h3></div>${renderCarousel('events-grid', 'events-title', upcoming.map(card).join(''))}</div>`;
}

export function generate(html, data) {
  html = html.replace(/\r\n/g, '\n');
  validateContent(data);
  html = replaceBlock(html, 'COURSES', renderCourses(data.courses, data.contacts));
  html = replaceBlock(html, 'CTA', renderCTA(data.contacts));
  html = replaceBlock(html, 'FILTERS', renderFilters(data.courses));
  html = replaceBlock(html, 'LOCATIONS', renderLocations(data.contacts, { demo: showDemo(data.site) }));
  html = replaceBlock(html, 'ROBOTS', renderRobots(data.site));
  html = replaceBlock(html, 'ANALYTICS', renderAnalytics(data.site));
  html = replaceBlock(html, 'HOLIDAY', renderHoliday(data.site));
  html = replaceBlock(html, 'BANNER', renderDemoBanner(data.site));
  html = replaceBlock(html, 'STATS', renderStats(data.stats, data.site));
  html = replaceBlock(html, 'TEACHERS', renderTeachers(data.teachers, data.site, { featuredOnly: true }));
  html = replaceBlock(html, 'RESULTS', renderResults(data.results, data.site, { featuredOnly: true }));
  html = replaceBlock(html, 'CASHBACK', renderCashback(data.cashback));
  html = replaceBlock(html, 'HERO_MEDIA', renderMediaGallery(data.site?.heroMedia, 'Stanford', { eager: true }));
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
  html = replaceBlock(html, 'SEO', [renderMetadata(data.site), renderStructuredData(data.site, data.contacts)].filter(Boolean).join('\n'));
  html = html.replace(/<!-- CONTACT_START:([a-z]+) -->[\s\S]*?<!-- CONTACT_END:\1 -->/g, (_, key) => `<!-- CONTACT_START:${key} -->\n${renderContacts(data.contacts, { compact: key === 'dialog' })}\n<!-- CONTACT_END:${key} -->`);
  // Dictionaries are loaded only by the translated copies (/uz/, /kaa/, /en/), each its own one.
  html = replaceBlock(html, 'ASSET_VERSIONS', '<script src="content.js"></script>');
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

// Profile cards of the full list: the same texts as the home cards plus a logo avatar and a highlight layer.
export function renderResultProfiles(results = []) {
  return results.map(result => `<article class="result-card" data-tilt><span class="result-shine" aria-hidden="true"></span>${renderMediaGallery(result.media, result.student)}<div class="result-score"><strong>${escapeHTML(result.score)}</strong><span>${escapeHTML(result.exam)}</span>${result.level ? `<small>${escapeHTML(result.level)}</small>` : ''}</div><blockquote>«${escapeHTML(result.quote)}»</blockquote><div class="result-person"><span class="result-avatar" aria-hidden="true"><img src="assets/stanford-icon.svg" alt="" width="20" height="20"></span><p class="result-name">${escapeHTML([result.student, result.course].filter(Boolean).join(' · '))}</p></div></article>`).join('');
}

function directoryCard({ id, name, subtitle = '', cover, details, type, media = false }) {
  const label = escapeHTML(name);
  return `<article class="profile-card profile-card-${type}" data-course-flip><div class="course-flip-inner"><div class="course-face course-front"><div class="profile-cover${media ? ' profile-cover--gallery' : ''}">${cover}</div><div class="profile-identity"><h3>${label}</h3>${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ''}</div><a class="button profile-more" href="#${id}" data-flip-open aria-controls="${id}" aria-expanded="false" aria-label="Подробнее: ${label}">Подробнее${svgIcon('arrow-right')}</a></div><div class="course-face course-back" id="${id}"><h3 class="course-back-title" tabindex="-1">${label}</h3><div class="profile-details">${details}</div><button class="button-outline course-flip-back" type="button" data-flip-close aria-label="Назад: ${label}">Назад${svgIcon('arrow-right')}</button></div></div></article>`;
}

export function renderDirectoryTeachers(teachers = []) {
  if (!teachers.length) return '<p class="directory-empty" data-text="teachers.empty">Информация о преподавателях пока не опубликована.</p>';
  const sorted = [...teachers].sort((a, b) => (b.featured === true) - (a.featured === true));
  return `<div class="team-grid">${sorted.map((teacher, index) => directoryCard({
    id: `teacher-details-${index + 1}`, name: teacher.name, subtitle: teacher.role, type: 'teacher',
    cover: teacher.media?.length ? renderMediaGallery(teacher.media, teacher.name) : teacher.photo ? `<img class="profile-photo" src="${escapeHTML(teacher.photo)}"${responsiveAttributes(teacher.photo)} alt="Фото: ${escapeHTML(teacher.name)}" width="600" height="750" loading="lazy" decoding="async">` : '<span class="profile-initials" aria-hidden="true"><img class="profile-brand" src="assets/stanford-icon.svg" alt="" width="88" height="88"></span>',
    media: Boolean(teacher.media?.length),
    details: `<p class="profile-back-role">${escapeHTML(teacher.role)}</p><dl class="profile-facts">${teacher.qualification ? `<div><dt>Квалификация</dt><dd>${escapeHTML(teacher.qualification)}</dd></div>` : ''}${teacher.experience ? `<div><dt>Опыт</dt><dd>${escapeHTML(teacher.experience)}</dd></div>` : ''}</dl>`
  })).join('')}</div>`;
}

export function renderDirectoryResults(results = []) {
  if (!results.length) return '<p class="directory-empty" data-text="results.empty">Результаты пока не опубликованы.</p>';
  return results.map((result, index) => directoryCard({
    id: `student-details-${index + 1}`, name: result.student, subtitle: result.course, type: 'result',
    cover: result.media?.length ? renderMediaGallery(result.media, result.student) : '<span class="profile-initials" aria-hidden="true"><img class="profile-brand" src="assets/stanford-icon.svg" alt="" width="88" height="88"></span>',
    media: Boolean(result.media?.length),
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
  html = replaceBlock(html, 'ANALYTICS', renderAnalytics(data.site));
  html = replaceBlock(html, 'HOLIDAY', renderHoliday(data.site));
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
  html = replaceBlock(html, 'ANALYTICS', renderAnalytics(data.site));
  html = replaceBlock(html, 'HOLIDAY', renderHoliday(data.site));
  html = replaceBlock(html, 'SEO', renderMetadata(data.site, 'teachers.html'));
  return versionContentAssets(applyTexts(html, data.texts), data);
}

export function generateCareer(html, data) {
  html = html.replace(/\r\n/g, '\n');
  validateContent(data);
  html = replaceBlock(html, 'ROBOTS', renderRobots(data.site));
  html = replaceBlock(html, 'ANALYTICS', renderAnalytics(data.site));
  html = replaceBlock(html, 'HOLIDAY', renderHoliday(data.site));
  html = replaceBlock(html, 'SEO', renderMetadata(data.site, 'career.html'));
  return versionContentAssets(applyTexts(html, data.texts), data);
}

// The privacy policy is static text from the owner's document; only metadata and versions are generated.
export function generatePrivacy(html, data) {
  html = html.replace(/\r\n/g, '\n');
  validateContent(data);
  html = replaceBlock(html, 'ROBOTS', renderRobots(data.site));
  html = replaceBlock(html, 'ANALYTICS', renderAnalytics(data.site));
  html = replaceBlock(html, 'HOLIDAY', renderHoliday(data.site));
  html = replaceBlock(html, 'SEO', renderMetadata(data.site, 'privacy.html'));
  return versionContentAssets(applyTexts(html, data.texts), data);
}

// Complaints page: static form; the branch list comes from the contacts data.
export function generateFeedback(html, data) {
  html = html.replace(/\r\n/g, '\n');
  validateContent(data);
  html = replaceBlock(html, 'ROBOTS', renderRobots(data.site));
  html = replaceBlock(html, 'ANALYTICS', renderAnalytics(data.site));
  html = replaceBlock(html, 'HOLIDAY', renderHoliday(data.site));
  html = replaceBlock(html, 'SEO', renderMetadata(data.site, 'feedback.html'));
  html = replaceBlock(html, 'FEEDBACK_BRANCHES', (data.contacts?.locations || []).map(location => `<option value="${escapeHTML(location.name)}">${escapeHTML(location.name)}</option>`).join(''));
  return versionContentAssets(applyTexts(html, data.texts), data);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const data = readContent();
  const pages = [
    { file: new URL('./index.html', import.meta.url), build: generate, label: 'index.html' },
    { file: new URL('./results.html', import.meta.url), build: generateResults, label: 'results.html' },
    { file: new URL('./teachers.html', import.meta.url), build: generateTeachers, label: 'teachers.html' },
    { file: new URL('./career.html', import.meta.url), build: generateCareer, label: 'career.html' },
    { file: new URL('./privacy.html', import.meta.url), build: generatePrivacy, label: 'privacy.html' },
    { file: new URL('./feedback.html', import.meta.url), build: generateFeedback, label: 'feedback.html' }
  ];
  let stale = false;
  // Plain files generated from the same data: robots.txt and sitemap.xml.
  const textFiles = [
    { file: new URL('./robots.txt', import.meta.url), output: renderRobotsTxt(data.site), label: 'robots.txt' },
    { file: new URL('./sitemap.xml', import.meta.url), output: renderSitemap(data.site), label: 'sitemap.xml' }
  ];
  for (const { file, output, label } of textFiles) {
    const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (process.argv.includes('--check')) {
      if (output !== source) { console.error(`Generated ${label} is stale. Run node build.mjs`); stale = true; }
    } else if (output !== source) {
      fs.writeFileSync(file, output);
    }
  }
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
  for (const lang of LANGUAGES) {
    const pack = loadLanguagePack(lang);
    const folder = new URL(`./${lang}/`, import.meta.url);
    for (const { output, label } of generated) {
      const file = new URL(label, folder);
      const translated = generateLanguagePage(output, data, lang, label, label === 'privacy.html' ? languagePackFor(lang, label) : pack);
      const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (process.argv.includes('--check')) {
        if (translated !== source) { console.error(`Generated ${lang}/${label} is stale. Run node build.mjs`); stale = true; }
      } else if (translated !== source) {
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(file, translated);
      }
    }
  }
  if (process.argv.includes('--check')) {
    if (stale) process.exitCode = 1;
    else console.log('Generated HTML is current.');
  } else {
    console.log('Static courses, prices, direct contacts and the results page generated.');
  }
}
