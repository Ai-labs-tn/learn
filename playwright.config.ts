import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.LEARN_TEST_BASE_URL ?? 'http://127.0.0.1:5173';
if (!['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
  throw new Error('Acceptance tests require an isolated local server, never production.');
}
const evidence = process.env.LEARN_TEST_BASE_URL
  ? 'acceptance-tests/phase-01/built'
  : 'acceptance-tests/phase-01';

/** Start the API separately with isolated local test credentials; never run against production. */
export default defineConfig({
  testDir: './tests/acceptance',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: `${evidence}/browser-report`, open: 'never' }],
    ['junit', { outputFile: `${evidence}/browser-results.xml` }],
  ],
  outputDir: `${evidence}/browser-artifacts`,
  use: {
    baseURL,
    trace: 'off', // Do not persist login requests, cookies or passwords in evidence.
    screenshot: 'off', // Capture reviewed, post-login screenshots explicitly instead.
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.LEARN_TEST_BASE_URL ? undefined : {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
});
