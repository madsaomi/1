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
    reducedMotion: 'reduce',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } }
  ],
  webServer: {
    command: 'node tests/e2e/serve.mjs',
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 60000,
    ignoreHTTPSErrors: true
  }
});
