import { expect, test } from '@playwright/test';

const suggestion = 'A stabilized power supply brings every output voltage into range before startup continues.';
const canned = { suggestion, model: 'google/gemma-4-31b-it:free', requestId: '7' };

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Username', { exact: false }).fill('admin');
  await page.getByLabel('Password', { exact: false }).fill(process.env.TEST_ADMIN_PASSWORD ?? 'LocalAdmin123!Only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible({ timeout: 15000 });
  await page.goto('/#/studio');
  await expect(page.getByRole('textbox', { name: 'English narration', exact: true })).toBeVisible();
}

test('suggestion applies locally only and is never auto-saved or published', async ({ page }) => {
  // Status is fetched when Studio mounts; mocks must exist before sign-in so the
  // assist controls are enabled regardless of the server's real key configuration.
  await page.route('**/api/studio/ai/status', (route) => route.fulfill({ json: { enabled: true, models: ['google/gemma-4-31b-it:free'], remainingToday: 99 } }));
  let payload: Record<string, unknown> = {};
  await page.route('**/api/studio/ai/assist', async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ json: canned });
  });
  await signIn(page);
  const narration = page.getByRole('textbox', { name: 'English narration', exact: true });
  const original = await narration.inputValue();
  const region = page.getByRole('region', { name: 'AI suggestion (plain text, not saved)' });

  // Discard first: box disappears, nothing changes.
  await page.getByRole('button', { name: 'AI: improve English narration', exact: true }).click();
  await expect(region).toBeVisible();
  await expect(page.getByText('google/gemma-4-31b-it:free')).toBeVisible();
  expect(payload).toMatchObject({ mode: 'improve', language: 'en' });
  await page.getByRole('button', { name: 'Discard suggestion', exact: true }).click();
  await expect(region).toHaveCount(0);
  await expect(narration).toHaveValue(original);

  // Apply: fills narration locally, clears the box, never saves or publishes.
  const before = await (await page.request.get('/api/lessons/boot-pilot')).json();
  await page.getByRole('button', { name: 'AI: improve English narration', exact: true }).click();
  await expect(region).toBeVisible();
  await page.getByRole('button', { name: 'Apply suggestion', exact: true }).click();
  await expect(region).toHaveCount(0);
  await expect(narration).toHaveValue(suggestion);
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled();
  const after = await (await page.request.get('/api/lessons/boot-pilot')).json();
  expect(after.document).toEqual(before.document);
});

test('guests never see assist controls and direct assist calls are denied', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Username', { exact: false }).fill('guest');
  await page.getByLabel('Password', { exact: false }).fill(process.env.TEST_GUEST_PASSWORD ?? 'LocalGuest123!Only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible({ timeout: 15000 });
  await page.goto('/#/studio');
  await expect(page.getByRole('heading', { name: 'Studio access denied' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'AI: improve English narration', exact: true })).toHaveCount(0);
  expect((await page.request.get('/api/studio/ai/status')).status()).toBe(403);
  expect((await page.request.post('/api/studio/ai/assist', { data: { mode: 'improve', language: 'en', text: 'x' } })).status()).toBe(403);
});

test('disabled feature, budget exhaustion and provider failures are explicit without fail-open', async ({ page }) => {
  // Status is fetched when Studio mounts, so routes must exist before sign-in navigation.
  await page.route('**/api/studio/ai/status', (route) => route.fulfill({ json: { enabled: false, models: [], remainingToday: 0 } }));
  await page.route('**/api/studio/ai/assist', (route) => route.fulfill({ status: 503, json: { detail: 'AI assistance is disabled' } }));
  await signIn(page);
  await expect(page.getByText(/AI assist is disabled on this server/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'AI: improve English narration', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'AI: suggest visuals', exact: true })).toBeDisabled();

  await page.route('**/api/studio/ai/status', (route) => route.fulfill({ json: { enabled: true, models: ['m'], remainingToday: 0 } }));
  await page.route('**/api/studio/ai/assist', (route) => route.fulfill({ status: 429, json: { detail: 'Daily AI budget exhausted' } }));
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'English narration', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'AI: improve English narration', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'AI: improve English narration', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/budget/i);

  await page.route('**/api/studio/ai/assist', (route) => route.fulfill({ status: 502, json: { detail: 'Provider failure' } }));
  await page.getByRole('button', { name: 'AI: improve English narration', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Provider failure');
  await expect(page.getByRole('textbox', { name: 'English narration', exact: true })).not.toHaveValue(suggestion);
});
