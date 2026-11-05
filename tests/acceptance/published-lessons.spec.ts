import { expect, test } from '@playwright/test';

const fixture = {
  revision: 1, publishedAt: '2026-11-05T00:00:00Z',
  document: {
    schemaVersion: 1, id: 'boot-pilot', title: 'Power to POST', description: 'A published teaching story.',
    scenes: [{ id: 'power', title: 'Power on', beats: [
      { id: 'one', narration: { en: 'Firmware begins the boot process.', ta: 'Firmware boot செயல்முறையைத் தொடங்குகிறது.' }, visual: { component: 'boot-machine', focus: 'firmware', action: 'focus' } },
      { id: 'two', narration: { en: 'Memory is checked before the OS loads.', ta: 'OS ஏற்றுவதற்கு முன் நினைவகம் சோதிக்கப்படுகிறது.' }, visual: { component: 'boot-machine', focus: 'ram', action: 'status', status: 'checking' } },
    ] }],
  },
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Username', { exact: false }).fill('guest');
  await page.getByLabel('Password', { exact: false }).fill(process.env.TEST_GUEST_PASSWORD ?? 'LocalGuest123!Only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.route('**/api/lessons', (route) => route.fulfill({ json: [{ id: 'boot-pilot', title: 'Power to POST', revision: 1 }] }));
});

test('published story steps and bilingual captions work without author access', async ({ page }) => {
  await page.route('**/api/lessons/boot-pilot', (route) => route.fulfill({ json: fixture }));
  await page.goto('/#/lessons');
  await expect(page.getByRole('heading', { name: 'Power to POST' })).toBeVisible();
  await expect(page.getByText('Beat 1 of 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next beat', exact: true }).click();
  await expect(page.locator('p[lang="en"]').first()).toHaveText('Memory is checked before the OS loads.');
  await page.getByRole('button', { name: 'தமிழ் captions', exact: true }).click();
  await expect(page.locator('p[lang=ta]')).toContainText('நினைவகம்');
  await page.getByRole('button', { name: 'Restart story', exact: true }).click();
  await expect(page.getByText('Beat 1 of 2', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('incompatible publication does not fall back to outdated bundled content', async ({ page }) => {
  await page.route('**/api/lessons/boot-pilot', (route) => route.fulfill({ json: { ...fixture, document: { ...fixture.document, schemaVersion: 999 } } }));
  await page.goto('/#/lessons');
  await expect(page.getByRole('alert')).toContainText('Published lessons could not be loaded');
  await expect(page.getByRole('button', { name: 'Retry lessons' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Power to POST' })).toHaveCount(0);
});

test('active reader remains pinned to its loaded publication', async ({ page }) => {
  let reads = 0;
  await page.route('**/api/lessons/boot-pilot', (route) => { reads++; return route.fulfill({ json: fixture }); });
  await page.goto('/#/lessons');
  await expect(page.getByRole('heading', { name: 'Power to POST' })).toBeVisible();
  await page.getByRole('button', { name: 'Next beat', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Beat 2 of 2', { exact: true })).toBeVisible();
  expect(reads).toBe(1);
});
