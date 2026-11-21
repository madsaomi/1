// Browser tests (tests/e2e): a real Chromium clicks through the demo copy on a phone and a desktop screen.
// Locally the installed Chrome is used; GitHub Actions installs Playwright's Chromium.
import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT || 4310);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    ...(process.env.CI ? {} : { channel: 'chrome' }),
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'phone', testIgnore: /(?:speed|visual)\.spec/, use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', testIgnore: /(?:speed|visual)\.spec/, use: { viewport: { width: 1280, height: 900 } } },
    // Pictures of the key screens compared with approved ones (local only, see visual.spec.mjs).
    { name: 'visual', testMatch: /visual\.spec/ },
    // Speed budget runs alone after the other tests, so the processor is not shared while measuring.
    { name: 'speed', testMatch: /speed\.spec/, dependencies: ['phone', 'desktop'] }
  ],
  webServer: {
    command: 'node tests/e2e/serve.mjs',
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 60000,
    ignoreHTTPSErrors: true
  }
});
