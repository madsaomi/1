import fs from 'node:fs';
import vm from 'node:vm';
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
    camera: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'
  };
  return `<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${paths[name]}"/></svg>`;
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

export function validateContent(data) {
  const ids = new Set();
  for (const course of data.courses) {
    if (!/^[a-z0-9-]+$/.test(course.id) || ids.has(course.id)) throw new Error('Course IDs must be unique slugs');
    ids.add(course.id);
    if (!Number.isFinite(course.price) || course.price <= 0) throw new Error(`Invalid price: ${course.id}`);
    if (course.specialPrice != null && (!Number.isFinite(course.specialPrice) || course.specialPrice <= 0 || course.specialPrice > course.price)) throw new Error(`Invalid discounted price: ${course.id}`);
    if (!/^#[a-z0-9-]+$/.test(course.target)) throw new Error(`Invalid course target: ${course.id}`);
  }
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
          google: /^https:\/\/maps\.app\.goo\.gl\/[a-zA-Z0-9_-]+\/?$/,
          yandex: /^https:\/\/yandex\.(?:uz|com|ru)\/maps\/(?:-\/[a-zA-Z0-9_-]+|org\/[a-zA-Z0-9_-]+\/\d+)\/?$/
        };
        if (!Object.hasOwn(patterns, map.provider) || typeof map.url !== 'string' || !patterns[map.provider].test(map.url)) throw new Error('Use an approved HTTPS map URL for its provider');
      }
    }
  }
  const demo = data.site?.demoMode;
  if (demo !== undefined && typeof demo !== 'boolean') throw new Error('demoMode must be true or false');
  const { stats = [], teachers = [], results = [] } = data;
  if (![stats, teachers, results].every(Array.isArray)) throw new Error('Stats, teachers and results must be arrays');
  for (const stat of stats) if (!text(stat.value, 12) || !text(stat.label, 40)) throw new Error('Stat needs a short value and label');
  for (const teacher of teachers) {
    if (!text(teacher.name, 60) || !text(teacher.role, 80) || !optionalText(teacher.qualification, 40) || !optionalText(teacher.experience, 40)) throw new Error('Teacher needs a name, role and short optional details');
    validatePhoto(teacher.photo, 'Use an existing local teacher photo');
  }
  for (const result of results) {
    if (!text(result.score, 8) || !text(result.exam, 20) || !optionalText(result.level, 20) || !text(result.quote, 240) || !text(result.student, 40) || !optionalText(result.course, 60)) throw new Error('Result needs a score, exam, quote and student');
    // Real student results are published only with the student's consent; demo samples are announced as examples instead.
    if (!demo && result.consent !== true) throw new Error('Publish a real student result only with consent');
  }
  if (data.site?.url) {
    const url = new URL(data.site.url);
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
  if (contacts.phones?.length) groups.push(`<div class="contact-group"><${heading} class="contact-label">Позвонить</${heading}><ul class="contact-list">${contacts.phones.map(phone => `<li><a class="contact-channel" href="tel:${escapeHTML(phone)}" aria-label="Позвонить: ${escapeHTML(displayPhone(phone))}">${escapeHTML(displayPhone(phone))}</a></li>`).join('')}</ul></div>`);
  if (contacts.telegrams?.length) groups.push(`<div class="contact-group"><${heading} class="contact-label">Запись в Telegram</${heading}><ul class="contact-list">${contacts.telegrams.map(url => `<li><a class="contact-channel" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" aria-label="Написать для записи: @${escapeHTML(url.split('/').pop())}">@${escapeHTML(url.split('/').pop())}${svgIcon('external')}</a></li>`).join('')}</ul></div>`);
  const extras = [];
  if (!compact && contacts.instagram) extras.push(`<a href="${escapeHTML(contacts.instagram)}" target="_blank" rel="noopener noreferrer">Instagram ${svgIcon('external')}</a>`);
  if (!compact && contacts.hrTelegram) extras.push(`<span class="contact-extra">По вопросам работы: <a href="${escapeHTML(contacts.hrTelegram)}" target="_blank" rel="noopener noreferrer">@${escapeHTML(contacts.hrTelegram.split('/').pop())} ${svgIcon('external')}</a></span>`);
  return `<div class="contact-channels">${groups.join('')}</div>${extras.length ? `<div class="contact-extras">${extras.join('')}</div>` : ''}`;
}

const demoTag = site => site?.demoMode ? ' <span class="demo-tag">Пример</span>' : '';

// Samples must not be indexed: while demo mode is on, search engines are asked to skip the page.
export function renderRobots(site) {
  return site?.demoMode ? '<meta name="robots" content="noindex, nofollow">' : '';
}

export function renderDemoBanner(site) {
  return site?.demoMode ? '<p class="demo-banner">Демо-версия: блоки «Пример» — образцы</p>' : '';
}

export function renderStats(stats = [], site) {
  if (!stats.length) return '';
  const items = stats.map(stat => `<div><dt>${escapeHTML(stat.label)}</dt><dd>${escapeHTML(stat.value)}</dd></div>`).join('');
  return `<section class="wrap stats-strip" aria-label="Stanford в цифрах${site?.demoMode ? ' (пример)' : ''}">${site?.demoMode ? '<span class="demo-tag">Пример</span>' : ''}<dl>${items}</dl></section>`;
}

export function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
}

export function renderTeachers(teachers = [], site) {
  const heading = `<div class="section-top"><h2 id="teachers-title">Преподаватели${demoTag(site)}</h2><p>Группу и преподавателя подбирают по уровню после входного теста.</p></div>`;
  if (!teachers.length) return heading;
  const cards = teachers.map(teacher => {
    const name = escapeHTML(teacher.name);
    const portrait = teacher.photo
      ? `<img class="teacher-photo" src="${escapeHTML(teacher.photo)}" alt="Фото: ${name}" width="600" height="750" loading="lazy" decoding="async">`
      : `<div class="teacher-initials" aria-hidden="true">${escapeHTML(initials(teacher.name))}</div>`;
    const chips = [teacher.qualification && `<li class="teacher-chip-key">${escapeHTML(teacher.qualification)}</li>`, teacher.experience && `<li>${escapeHTML(teacher.experience)}</li>`].filter(Boolean).join('');
    return `<article class="teacher-card">${portrait}<div class="teacher-body"><h3>${name}</h3><p>${escapeHTML(teacher.role)}</p>${chips ? `<ul class="teacher-chips">${chips}</ul>` : ''}</div></article>`;
  }).join('');
  return `${heading}\n<div class="team-grid">${cards}</div>`;
}

export function renderResults(results = [], site) {
  if (!results.length) return '';
  const cards = results.map(result => `<article class="result-card"><div class="result-score"><strong>${escapeHTML(result.score)}</strong><span>${escapeHTML(result.exam)}</span>${result.level ? `<small>${escapeHTML(result.level)}</small>` : ''}</div><blockquote>«${escapeHTML(result.quote)}»</blockquote><p class="result-name">${escapeHTML([result.student, result.course].filter(Boolean).join(' · '))}</p></article>`).join('');
  return `<section data-reveal class="section wrap results-section" id="results" aria-labelledby="results-title">
<div class="section-top"><h2 id="results-title">Результаты студентов${demoTag(site)}</h2><p>Реальные баллы — с согласия студентов.</p></div>
<div class="results-grid">${cards}</div>
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
    const links = location.maps.map(map => `<a href="${escapeHTML(map.url)}" target="_blank" rel="noopener noreferrer" aria-label="${providers[map.provider]}: ${name}, ${address}">${providers[map.provider]} ${svgIcon('external')}</a>`).join('');
    // Until the owner sends entrance photos, each branch shows a tagged placeholder.
    const photo = location.photo
      ? `<img class="location-photo" src="${escapeHTML(location.photo)}" alt="Вход: ${name}" width="640" height="360" loading="lazy" decoding="async">`
      : !demo ? '' : `<div class="location-photo location-photo-demo" role="img" aria-label="Пример: место для фото входа, ${name}">${svgIcon('camera')}<span>Фото входа</span><span class="demo-tag">Пример</span></div>`;
    return `<article class="location-card"><h4>${name}</h4><p>${address}</p>${photo}${select}<div class="map-links">${links}</div></article>`;
  }).join('');
  const map = first ? `<div class="branch-map-panel"><div class="map-toolbar"><p id="map-status" class="map-status" tabindex="-1" aria-live="polite">${escapeHTML(`${first.name} — ${first.address}`)}</p></div><iframe id="branch-map" class="branch-map" src="${escapeHTML(first.googleEmbed)}" title="${escapeHTML(`Карта: ${first.name}`)}" width="1100" height="360" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>` : '';
  return `<div class="contact-locations"><h3>Как добраться</h3><div class="location-map-layout"><div class="location-grid">${cards}</div>${map}</div></div>`;
}

export function renderCourses(courses) {
  return courses.map(course => `<article class="course-card" id="course-${escapeHTML(course.id)}" tabindex="-1" data-category="${escapeHTML(course.category)}" data-course-id="${escapeHTML(course.id)}">
<h3>${escapeHTML(course.name)}${course.subtitle ? `<span class="course-subtitle">${escapeHTML(course.subtitle)}</span>` : ''}</h3>
<p class="course-description">${escapeHTML(course.description)}</p>
<ul class="course-details" aria-label="В программе">${course.skills.map(skill => `<li>${svgIcon('check')}<span>${escapeHTML(skill)}</span></li>`).join('')}</ul>
<div class="course-bottom"><div class="course-price"><strong>${money(course.price)} сум</strong><span>в месяц</span></div><a class="course-enroll-btn" href="#prices" data-open-course="${escapeHTML(course.id)}" aria-label="Программа и цены: ${escapeHTML([course.name, course.subtitle].filter(Boolean).join(' '))}">Программа и цены${svgIcon('arrow-right')}</a></div>
</article>`).join('\n');
}

export function renderHero(courses) {
  const groups = [
    ['languages', 'Языки', 'Английский и немецкий'],
    ['exam', 'IELTS и SAT', 'Подготовка к экзаменам'],
    ['kids', 'Английский для детей', 'Kids English'],
    ['subjects', 'Математика', 'Разбор тем и задач']
  ];
  return groups.map(([category, title, description]) => {
    const programs = courses.filter(course => course.category === category);
    if (!programs.length) return '';
    const prices = programs.map(course => course.price);
    const [minimum, maximum] = [Math.min(...prices), Math.max(...prices)];
    // Without "от": one price, or the full range when programs differ.
    const price = minimum === maximum ? money(minimum) : `${money(minimum)} – ${money(maximum)}`;
    return `<a class="hero-program" href="#courses" data-goal="${category}"><span><strong>${title}</strong><small>${description}</small></span><span class="hero-program-price">${price}<small>сум / месяц</small></span></a>`;
  }).filter(Boolean).join('\n');
}

export function renderCTA(contacts) {
  const telegram = contacts.verified ? contacts.telegrams?.[0] : '';
  const phone = contacts.verified ? contacts.phones?.[0] : '';
  // The trial lesson goes straight to admissions in Telegram; unverified contacts keep the in-page fallback.
  const trial = telegram
    ? `<a class="button" href="${escapeHTML(telegram)}" target="_blank" rel="noopener noreferrer" aria-label="Бесплатный пробный урок: написать в Telegram">Бесплатный пробный урок${svgIcon('external')}</a>`
    : '<a class="button" href="#enroll">Бесплатный пробный урок</a>';
  const note = telegram && phone
    ? `Откроется Telegram. Или позвоните: <a href="tel:${escapeHTML(phone)}">${escapeHTML(displayPhone(phone))}</a>`
    : 'Запись — по телефону или в Telegram.';
  return `<div class="actions">${trial}<a class="text-link" href="#courses">Выбрать курс${svgIcon('arrow-right')}</a></div>\n<p class="hero-footnote">${note}</p>`;
}

export function renderPrices(courses) {
  return courses.map(course => {
    // Keep the arrow with the last word so a wrapped name never leaves it alone on a line.
    const words = [course.name, course.subtitle].filter(Boolean).join(' ').split(' ');
    const last = words.pop();
    const label = `${words.length ? `${escapeHTML(words.join(' '))} ` : ''}<span class="nowrap">${escapeHTML(last)}${svgIcon('arrow-right')}</span>`;
    return `<tr><th scope="row"><a class="price-course-link" href="#course-${escapeHTML(course.id)}" data-reveal-course="${escapeHTML(course.id)}">${label}</a></th><td class="price-amount"><span class="price-standard">${money(course.price)}</span></td><td class="price-amount">${course.specialPrice ? `<span class="price-special"><strong>${money(course.specialPrice)}</strong></span>` : '<span class="price-empty" aria-label="Специальная цена не предусмотрена">—</span>'}</td></tr>`;
  }).join('\n');
}

export function renderFilters(courses) {
  const labels = { all: 'Все программы', languages: 'Языки', kids: 'Для детей', subjects: 'Математика', exam: 'IELTS и SAT' };
  return Object.entries(labels).map(([category, label]) => {
    const count = courses.filter(course => category === 'all' || course.category === category).length;
    return `<button type="button" data-filter="${category}" data-filter-label="${label}" class="${category === 'all' ? 'active' : ''}" aria-pressed="${category === 'all'}" aria-label="${label}: ${count}">${label}<span class="filter-count" aria-hidden="true">${count}</span></button>`;
  }).join('\n');
}

function replaceBlock(html, name, body) {
  const pattern = new RegExp(`<!-- ${name}_START -->[\\s\\S]*?<!-- ${name}_END -->`);
  if (!pattern.test(html)) throw new Error(`Missing generated block: ${name}`);
  return html.replace(pattern, () => `<!-- ${name}_START -->\n${body}\n<!-- ${name}_END -->`);
}

export function generate(html, data) {
  html = html.replace(/\r\n/g, '\n');
  validateContent(data);
  html = replaceBlock(html, 'COURSES', renderCourses(data.courses));
  html = replaceBlock(html, 'HERO', renderHero(data.courses));
  html = replaceBlock(html, 'CTA', renderCTA(data.contacts));
  html = replaceBlock(html, 'PRICES', renderPrices(data.courses));
  html = replaceBlock(html, 'FILTERS', renderFilters(data.courses));
  html = replaceBlock(html, 'LOCATIONS', renderLocations(data.contacts, { demo: data.site?.demoMode }));
  html = replaceBlock(html, 'ROBOTS', renderRobots(data.site));
  html = replaceBlock(html, 'BANNER', renderDemoBanner(data.site));
  html = replaceBlock(html, 'STATS', renderStats(data.stats, data.site));
  html = replaceBlock(html, 'TEACHERS', renderTeachers(data.teachers, data.site));
  html = replaceBlock(html, 'RESULTS', renderResults(data.results, data.site));
  html = replaceBlock(html, 'OPTIONS', data.courses.map(course => `<option value="${escapeHTML(course.id)}">${escapeHTML([course.name, course.subtitle].filter(Boolean).join(' '))}</option>`).join(''));
  const siteURL = data.site?.url;
  const metadata = siteURL ? `<link rel="canonical" href="${escapeHTML(siteURL)}">\n<meta property="og:url" content="${escapeHTML(siteURL)}">\n<meta property="og:image" content="${escapeHTML(new URL('assets/stanford-logo.png', siteURL.endsWith('/') ? siteURL : `${siteURL}/`).href)}">` : '';
  html = replaceBlock(html, 'SEO', metadata);
  html = html.replace(/<!-- CONTACT_START:([a-z]+) -->[\s\S]*?<!-- CONTACT_END:\1 -->/g, (_, key) => `<!-- CONTACT_START:${key} -->\n${renderContacts(data.contacts, { compact: key === 'dialog' })}\n<!-- CONTACT_END:${key} -->`);
  return html;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const file = new URL('./index.html', import.meta.url);
  const source = fs.readFileSync(file, 'utf8');
  const output = generate(source, readContent());
  if (process.argv.includes('--check')) {
    if (output !== source) { console.error('Generated HTML is stale. Run node build.mjs'); process.exitCode = 1; }
    else console.log('Generated HTML is current.');
  } else {
    fs.writeFileSync(file, output);
    console.log('Static courses, prices and direct contacts generated.');
  }
}
