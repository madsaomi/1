// Visual check: pictures of the key screens are compared with approved ones, so a change that moves the layout by
// accident shows up before it reaches visitors. Runs locally (`npm run e2e`): screenshots depend on the operating
// system's font rendering, so the approved pictures are made on the owner's Windows machine and CI skips them.
// After an intended design change: `npx playwright test --project=visual --update-snapshots`, look at the new
// pictures in tests/e2e/visual.spec.mjs-snapshots/ and commit them.
import { test, expect } from '@playwright/test';

const SHOTS = [
  { page: '/', name: 'home-top', element: 'body', clip: true },
  { page: '/#courses', name: 'course-card', element: '.course-card:not([hidden])' },
  { page: '/#cashback', name: 'cashback', element: '#cashback' },
  { page: '/#enroll', name: 'contacts', element: '#enroll .contact-layout' },
  { page: '/', name: 'footer', element: 'footer' },
  { page: '/teachers', name: 'teacher-card', element: '.profile-card' },
  { page: '/results', name: 'student-card', element: '.profile-card' },
  { page: '/courses/ielts', name: 'course-page-top', element: '.course-page-hero' },
  { page: '/career', name: 'career-top', element: '.career-form', height: 700 },
  { page: '/feedback', name: 'feedback-top', element: '#feedback-form', height: 700 }
];
const SIZES = [{ name: 'phone', width: 375, height: 812, mobile: true }, { name: 'desktop', width: 1280, height: 900, mobile: false }];

test.skip(Boolean(process.env.CI), 'Approved pictures are made on Windows; Linux renders fonts differently');

for (const size of SIZES) {
  for (const theme of ['light', 'dark']) {
    test(`key screens look as approved: ${size.name}, ${theme}`, async ({ browser }) => {
      test.setTimeout(120000);
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile, colorScheme: theme, reducedMotion: 'reduce' });
      const page = await context.newPage();
      for (const shot of SHOTS) {
        await page.goto(shot.page, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        // Moving or time-dependent parts are covered: countdowns, event dates, the phone call bar.
        const mask = [page.locator('.event-countdown, .event-date, .event-card time, [data-countdown-status]'), page.locator('.call-bar')];
        const options = { animations: 'disabled', caret: 'hide', mask, maxDiffPixelRatio: 0.01 };
        if (shot.clip) {
          await expect(page).toHaveScreenshot(`${shot.name}-${size.name}-${theme}.png`, options);
          continue;
        }
        const element = page.locator(shot.element).first();
        await element.scrollIntoViewIfNeeded();
        if (shot.height) {
          await element.evaluate(node => window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY - 100));
          await expect(page).toHaveScreenshot(`${shot.name}-${size.name}-${theme}.png`, options);
        } else {
          await expect(element).toHaveScreenshot(`${shot.name}-${size.name}-${theme}.png`, options);
        }
      }
      await context.close();
    });
  }
}
