// Speed budget on a phone with slow 4G (≈1.6 Mbit/s, 150 ms) and a 4× slower processor, like Lighthouse mobile.
// Runs as its own project after all other browser tests (playwright.config.mjs), one page after another, so the
// numbers are not distorted by other tests sharing the processor. The test server compresses files like Caddy.
// The limits are loose on purpose: they catch a change that makes the site clearly slower, heavier or jumpy.
import { test, expect } from '@playwright/test';

const BUDGETS = { lcp: 3000, cls: 0.1, kib: 450, requests: 35, scriptKib: 80 };
const PAGES = ['/', '/courses/ielts', '/results', '/teachers', '/career', '/feedback'];

test('every main page stays within the speed budget on a slow phone', async ({ browser }, testInfo) => {
  test.setTimeout(120000);
  const report = [];
  for (const address of PAGES) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const sizes = new Map();
    const scripts = new Set();
    cdp.on('Network.responseReceived', event => { if (event.type === 'Script') scripts.add(event.requestId); });
    cdp.on('Network.loadingFinished', event => sizes.set(event.requestId, event.encodedDataLength));
    await page.addInitScript(() => {
      window.__lcp = 0;
      window.__cls = 0;
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__lcp = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(address, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const { lcp, cls } = await page.evaluate(() => ({ lcp: window.__lcp, cls: window.__cls }));
    const kib = [...sizes.values()].reduce((sum, size) => sum + size, 0) / 1024;
    const scriptKib = [...scripts].reduce((sum, id) => sum + (sizes.get(id) || 0), 0) / 1024;
    report.push(`${address}: LCP ${Math.round(lcp)} ms, CLS ${cls.toFixed(3)}, ${Math.round(kib)} KiB in ${sizes.size} requests, scripts ${Math.round(scriptKib)} KiB`);
    expect.soft(lcp, `${address}: Largest Contentful Paint, ms`).toBeLessThan(BUDGETS.lcp);
    expect.soft(cls, `${address}: Cumulative Layout Shift`).toBeLessThan(BUDGETS.cls);
    expect.soft(kib, `${address}: downloaded, KiB`).toBeLessThan(BUDGETS.kib);
    expect.soft(sizes.size, `${address}: requests`).toBeLessThan(BUDGETS.requests);
    expect.soft(scriptKib, `${address}: scripts, KiB`).toBeLessThan(BUDGETS.scriptKib);
    await context.close();
  }
  testInfo.annotations.push({ type: 'speed', description: report.join('\n') });
  console.log(report.join('\n'));
});
