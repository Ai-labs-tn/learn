import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/#/login');
  await page.getByLabel('Username', { exact: false }).fill('guest');
  await page.getByLabel('Password', { exact: false }).fill(process.env.TEST_GUEST_PASSWORD ?? 'LocalGuest123!Only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
});

test('legacy bookmark can step, restart and switch caption language', async ({ page }) => {
  await page.goto('/#/boot-os');
  await expect(page.getByText('1 / 16', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous step', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await expect(page.getByText('2 / 16', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restart lecture', exact: true }).click();
  await expect(page.getByText('1 / 16', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '🌐 தமிழ்', exact: true }).click();
  await expect(page.getByRole('button', { name: '🌐 English', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '🌐 English', exact: true }).click();
});

test('guest can explore DSA topics', async ({ page }) => {
  await page.goto('/#/dsa');
  await page.getByRole('button', { name: 'Bubble sort', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bubble sort', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hash map', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hash map', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  await expect(page.getByText(/· 2 \/ 8/)).toBeVisible();
});

test('guest can run the Java playground without author privileges', async ({ page }) => {
  await page.goto('/#/write-your-own');
  await page.getByRole('button', { name: '▶ Run — compile to bytecode' }).click();
  await expect(page.getByText('Micro-step 1 of 54', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  await expect(page.getByText('Micro-step 2 of 54', { exact: true })).toBeVisible();
  await expect(page.getByText('This program does not compile', { exact: true })).toHaveCount(0);
  expect((await page.request.get('/api/studio/status')).status()).toBe(403);
});
