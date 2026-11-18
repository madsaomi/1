// What a visitor actually sees and clicks, in a real browser on a phone (375 px) and a desktop (1280 px).
import { test, expect } from '@playwright/test';

const PAGES = ['/', '/results', '/teachers', '/career', '/privacy', '/feedback'];
const phone = testInfo => testInfo.project.name === 'phone';

// Every test starts in Russian with nothing saved.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('e2e-ready')) { localStorage.clear(); sessionStorage.setItem('e2e-ready', '1'); } });
});

async function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/favicon/.test(message.text())) errors.push(message.text()); });
  return errors;
}

test('every page and its translations open without errors or sideways scrolling, in light and dark', async ({ page }) => {
  const errors = await collectErrors(page);
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    for (const address of [...PAGES, '/uz/', '/kaa/teachers', '/en/feedback']) {
      await page.goto(address);
      await expect(page.locator('h1')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${address} (${theme}) scrolls sideways`).toBeLessThanOrEqual(1);
    }
  }
  expect(errors).toEqual([]);
});

test('the language menu shows flags, opens the translated copy and remembers the choice', async ({ page }) => {
  await page.goto('/teachers#top');
  const button = page.locator('.lang-menu-button');
  await expect(button).toContainText('RU');
  await button.click();
  const options = page.locator('.lang-menu-list [role="option"]');
  await expect(options).toHaveCount(4);
  for (const option of await options.all()) {
    const flag = await option.locator('.lang-flag').evaluate(element => getComputedStyle(element).backgroundImage);
    expect(flag).toContain('/assets/flags/');
  }
  await page.locator('#lang-menu-uz').click();
  await expect(page).toHaveURL(/\/uz\/teachers#top$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'uz');
  // The saved choice opens the copy straight away next time.
  await page.goto('/feedback');
  await expect(page).toHaveURL(/\/uz\/feedback$/);
  await page.locator('.lang-menu-button').click();
  await page.locator('#lang-menu-ru').click();
  await expect(page).toHaveURL(/\/feedback$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
});

test('the language menu works from the keyboard and Escape returns focus', async ({ page }) => {
  await page.goto('/results');
  const button = page.locator('.lang-menu-button');
  await button.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.lang-menu-list')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.lang-menu-list')).toBeHidden();
  await expect(button).toBeFocused();
});

test('phone menu opens, closes with Escape and gives focus back', async ({ page }, testInfo) => {
  test.skip(!phone(testInfo), 'The menu button exists on phones');
  await page.goto('/');
  const menu = page.locator('button.menu');
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#navigation a').first()).toBeVisible();
  await expect(page.locator('.call-bar')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();
  await expect(page.locator('.call-bar')).toBeVisible();
});

test('the call bar is on phones only and dials the centre', async ({ page }, testInfo) => {
  await page.goto('/');
  const bar = page.locator('.call-bar');
  if (phone(testInfo)) {
    await expect(bar).toBeVisible();
    await expect(bar.locator('a').first()).toHaveAttribute('href', /^tel:\+998/);
  } else {
    await expect(bar).toBeHidden();
  }
});

test('a course card shows the programme and a call button, and «Назад» brings the price back', async ({ page }, testInfo) => {
  await page.goto('/#courses');
  const card = page.locator('.course-card:not([hidden])').first();
  const front = card.locator('.course-front');
  const frontHeight = (await card.boundingBox()).height;
  if (phone(testInfo)) expect(frontHeight, 'Phone cards are short').toBeLessThan(360);
  await card.locator('[data-flip-open]').click();
  await expect(card).toHaveClass(/is-flipped/);
  await expect(card.locator('.course-back .course-call')).toBeVisible();
  await expect(card.locator('.course-back .course-call')).toHaveAttribute('href', /^tel:/);
  await expect(card.locator('.course-back-title')).toBeFocused();
  await card.locator('[data-flip-close]').click();
  await expect(card).not.toHaveClass(/is-flipped/);
  await expect(front).toBeVisible();
  await expect(card.locator('[data-flip-open]')).toBeFocused();
});

test('course filters show only their courses and «Все курсы» brings everything back', async ({ page }) => {
  await page.goto('/#courses');
  const visible = () => page.locator('.course-card:not([hidden])').count();
  const total = await page.locator('.course-card').count();
  await page.locator('.filters button[data-filter="kids"]').click();
  expect(await visible()).toBeLessThan(total);
  await page.locator('#reset-filter').click();
  expect(await visible()).toBe(total);
});

test('event carousel moves one card at a time and counts slides', async ({ page }) => {
  await page.goto('/#events');
  const carousel = page.locator('#events [data-carousel]');
  const counter = carousel.locator('.carousel-count');
  await expect(counter).toHaveText(/^1 \/ 8$/);
  await carousel.locator('[data-carousel-next]').click();
  await expect(counter).toHaveText(/^2 \/ 8$/);
  await carousel.locator('[data-carousel-prev]').click();
  await expect(counter).toHaveText(/^1 \/ 8$/);
});

test('a photo gallery switches slides with its arrows over the photo', async ({ page }) => {
  await page.goto('/teachers');
  const gallery = page.locator('.profile-card-teacher .media-gallery').first();
  const status = gallery.locator('[data-gallery-status]');
  await expect(status).toHaveText('1 / 2');
  await gallery.locator('[data-gallery-next]').click();
  await expect(status).toHaveText('2 / 2');
  // The arrows lie on the photo, not in a band under it.
  const track = await gallery.locator('.media-gallery-track').boundingBox();
  const arrow = await gallery.locator('[data-gallery-next]').boundingBox();
  expect(arrow.y + arrow.height).toBeLessThanOrEqual(track.y + track.height + 1);
});

test('teacher and student cards share one photo frame on their pages', async ({ page }) => {
  const frames = async address => {
    await page.goto(address);
    return page.locator('.profile-card').evaluateAll(cards => cards.filter(card => card.offsetParent).slice(0, 3).map(card => {
      const frame = card.querySelector('.media-gallery-track') || card.querySelector('.profile-cover');
      const box = frame.getBoundingClientRect();
      return Math.round(box.height / box.width * 100);
    }));
  };
  const teachers = await frames('/teachers');
  const results = await frames('/results');
  for (const ratio of [...teachers, ...results]) expect(ratio).toBe(125);
});

test('complaints: the anonymous form hides contacts, Telegram takes Latin only, and a sent message shows thanks', async ({ page }) => {
  await page.goto('/feedback');
  const telegram = page.locator('#fb-telegram');
  await telegram.pressSequentially('@Иван_ivan99');
  await expect(telegram).toHaveValue('@_ivan99');
  await page.locator('input[name="kind"][value="anonymous"]').check();
  await expect(page.locator('#fb-contacts')).toBeHidden();
  await expect(page.locator('#fb-anonymous-note')).toBeVisible();
  await page.locator('#fb-topic').selectOption('Другое');
  await page.locator('#fb-message').fill('Пример жалобы для проверки: в кабинете холодно, просим проверить отопление.');
  let sent;
  await page.route('**/feedback', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.locator('#fb-submit').click();
  await expect(page.locator('#fb-result')).toBeVisible();
  expect(sent.kind).toBe('anonymous');
  expect(sent).not.toHaveProperty('name');
  expect(sent).not.toHaveProperty('phone');
});

test('complaints: an official complaint needs consent and too many links are refused', async ({ page }) => {
  await page.goto('/feedback');
  await page.locator('#fb-topic').selectOption('Другое');
  await page.locator('#fb-message').fill('Слишком много ссылок https://a.example www.b.example t.me/c — это похоже на рекламу.');
  await page.locator('#fb-submit').click();
  await expect(page.locator('#fb-status')).toHaveText('Не больше 2 ссылок в тексте.');
  await page.locator('#fb-message').fill('Пример официальной жалобы: квитанцию об оплате выдали с опозданием.');
  await page.locator('#fb-name').fill('Тест Тестов');
  await page.locator('#fb-phone').fill('901234567');
  await page.locator('#fb-submit').click();
  await expect(page.locator('#fb-status')).toHaveText('Нужно согласие на обработку данных.');
});

test('the career form explains what is missing instead of sending an empty application', async ({ page }) => {
  let posted = false;
  await page.route('**/career', route => { if (route.request().method() === 'POST') posted = true; return route.continue(); });
  await page.goto('/career');
  await page.locator('#career-submit').click();
  await expect(page.locator('#career-status')).not.toBeEmpty();
  expect(posted).toBe(false);
  await page.locator('#cf-telegram').pressSequentially('Иван');
  await expect(page.locator('#cf-telegram')).toHaveValue('');
});

test('a course has its own page with price, results and other courses, in every language', async ({ page }) => {
  const errors = await collectErrors(page);
  await page.goto('/#courses');
  await page.locator('.filters button[data-filter="exam"]').click();
  const card = page.locator('#course-ielts');
  await card.locator('[data-flip-open]').click();
  await card.locator('.course-page-link').click();
  await expect(page).toHaveURL(/\/courses\/ielts$/);
  await expect(page.locator('h1')).toHaveText('IELTS');
  await expect(page.locator('.course-page-price .course-price strong')).toHaveText('800 000');
  await expect(page.locator('#course-results-title')).toBeVisible();
  await expect(page.locator('.course-page-main .result-card').first()).toContainText('IELTS');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  // The language menu opens the same course in Uzbek; links stay inside the language.
  await page.locator('.lang-menu-button').click();
  await page.locator('#lang-menu-uz').click();
  await expect(page).toHaveURL(/\/uz\/courses\/ielts$/);
  await expect(page.locator('#course-program-title')).toHaveText('Kursga nimalar kiradi');
  await page.locator('.course-page-others a[href$="courses/sat"]').click();
  await expect(page).toHaveURL(/\/uz\/courses\/sat$/);
  await page.locator('.breadcrumbs a').first().click();
  await expect(page).toHaveURL(/\/uz\/$/);
  expect(errors).toEqual([]);
});

test('a missing address shows the branded 404 in the language of its folder', async ({ page }) => {
  const response = await page.goto('/uz/no-such-page');
  expect(response.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText('Sahifa topilmadi');
  await expect(page.locator('[data-error-home]')).toHaveAttribute('href', '/uz/');
});
