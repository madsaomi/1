// Accessibility (axe-core, WCAG 2.1 A/AA rules) on every page in light and dark, phone and desktop.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = ['/', '/results', '/teachers', '/career', '/privacy', '/feedback', '/courses/ielts', '/uz/', '/kaa/courses/sat', '/en/feedback'];

for (const theme of ['light', 'dark']) {
  test(`no accessibility violations on any page (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    const found = [];
    for (const address of PAGES) {
      await page.goto(address);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      for (const violation of violations) {
        found.push(`${address}: ${violation.id} — ${violation.help} (${violation.nodes.length}) ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`);
      }
    }
    expect(found, found.join('\n')).toEqual([]);
  });
}

test('with animations on, rolling scores and the first screen stay accessible once they settle', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const found = [];
  for (const address of ['/', '/results']) {
    await page.goto(address);
    await page.waitForTimeout(2500);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    for (const violation of violations) found.push(`${address}: ${violation.id} ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`);
  }
  expect(found, found.join('\n')).toEqual([]);
  // The number is read once: hidden text for screen readers, the moving digits are hidden from them.
  const score = page.locator('.score-tiles dd').first();
  await expect(score.locator('.sr-only')).toHaveCount(1);
  await expect(score).not.toHaveAttribute('aria-label', /.*/);
});
