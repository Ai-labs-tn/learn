import { expect, test } from '@playwright/test';

test('guest reads a real persisted publication; drafts remain server-protected', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Username', { exact: false }).fill('guest');
  await page.getByLabel('Password', { exact: false }).fill(process.env.TEST_GUEST_PASSWORD ?? 'LocalGuest123!Only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  const response = await page.request.get('/api/lessons');
  expect(response.status()).toBe(200);
  const lessons = await response.json();
  const pilot = lessons.find((lesson: { id: string }) => lesson.id === 'boot-pilot');
  expect(pilot).toBeTruthy();
  expect((await page.request.get('/api/studio/lessons/boot-pilot/draft')).status()).toBe(403);
  await page.goto('/#/lessons');
  await expect(page.getByRole('heading', { name: pilot.title, exact: true })).toBeVisible();
  await expect(page.getByText(`Published revision ${pilot.revision}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next beat', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Beat 2 of');
  await page.reload();
  await expect(page.getByRole('heading', { name: pilot.title, exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Beat 1 of');
});
