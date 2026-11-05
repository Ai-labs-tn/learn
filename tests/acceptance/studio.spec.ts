import { expect, test } from '@playwright/test';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Username', { exact: false }).fill('admin');
  await page.getByLabel('Password', { exact: false }).fill(process.env.TEST_ADMIN_PASSWORD ?? 'LocalAdmin123!Only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.goto('/#/studio');
  await expect(page.getByText('Administrator access verified.', { exact: true })).toBeVisible();
}

test('admin creates, saves, previews, publishes and restores without deploying', async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  await page.getByLabel('New lesson ID', { exact: true }).fill(`lesson-acceptance-${Date.now()}`);
  await page.getByRole('button', { name: 'Create lesson', exact: true }).click();
  const narration = page.getByRole('textbox', { name: 'English narration', exact: true });
  await expect(narration).toBeVisible();
  await narration.fill('First approved explanation for this acceptance lesson.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const selectedId = await page.getByRole('combobox', { name: 'Lesson draft', exact: true }).inputValue();
  expect((await page.request.get(`/api/lessons/${selectedId}`)).status()).toBe(404);
  await page.getByRole('button', { name: 'Preview draft', exact: true }).click();
  await expect(page.getByText('Draft preview · not published', { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Publish saved draft', exact: true }).click();
  await expect.poll(async () => (await page.request.get(`/api/lessons/${selectedId}`)).status()).toBe(200);
  await narration.fill('Second approved explanation for this acceptance lesson.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Publish saved draft', exact: true }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/lessons/${selectedId}`)).json()).revision).toBe(2);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Restore revision 1 to draft', exact: true }).click();
  await expect(narration).toHaveValue('First approved explanation for this acceptance lesson.');
  const stillPublished = await (await page.request.get(`/api/lessons/${selectedId}`)).json();
  expect(stillPublished.revision).toBe(2);
  expect(stillPublished.document.scenes[0].beats[0].narration.en).toBe('Second approved explanation for this acceptance lesson.');
});

test('temporary background verification failures retain unsaved text and disable writes', async ({ page }) => {
  await signIn(page);
  const narration = page.getByRole('textbox', { name: 'English narration', exact: true });
  await narration.fill('Keep this unsaved explanation during a temporary disconnect.');
  await page.route('**/api/studio/status', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toContainText('Studio access could not be verified');
  await expect(narration).toHaveValue('Keep this unsaved explanation during a temporary disconnect.');
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  await page.unroute('**/api/studio/status');
  await page.unroute('**/api/auth/me');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Administrator access verified.', { exact: true })).toBeVisible();
  await expect(narration).toHaveValue('Keep this unsaved explanation during a temporary disconnect.');
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled();
});

test('admin can add and order scene beats using registered visuals', async ({ page }) => {
  await signIn(page);
  await page.getByLabel('New lesson ID', { exact: true }).fill(`lesson-structure-${Date.now()}`);
  await page.getByRole('button', { name: 'Create lesson', exact: true }).click();
  await page.getByRole('button', { name: 'Add scene', exact: true }).click();
  await page.getByRole('button', { name: 'Add beat', exact: true }).click();
  await page.getByRole('button', { name: 'Move beat up', exact: true }).click();
  await page.getByRole('combobox', { name: 'Visual action', exact: true }).selectOption('signal');
  await page.getByRole('combobox', { name: 'Signal path', exact: true }).selectOption('cpu:ram');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const id = await page.getByRole('combobox', { name: 'Lesson draft', exact: true }).inputValue();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
  const document = (await (await page.request.get(`/api/studio/lessons/${id}/draft`)).json()).document;
  expect(document.scenes.length).toBe(2);
  expect(document.scenes[1].beats.length).toBe(2);
  expect(document.scenes[1].beats[0].visual).toMatchObject({ action: 'signal', from: 'cpu', to: 'ram' });
});

test('stale admin draft save surfaces conflict rather than overwriting', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('textbox', { name: 'English narration', exact: true })).toBeVisible();
  const id = await page.getByRole('combobox', { name: 'Lesson draft', exact: true }).inputValue();
  const current = await page.request.get(`/api/studio/lessons/${id}/draft`);
  const document = (await current.json()).document;
  document.scenes[0].beats[0].narration.en = 'Changed in another administrator tab.';
  const session = await (await page.request.get('/api/auth/me')).json();
  expect((await page.request.put(`/api/studio/lessons/${id}/draft`, {
    headers: { Origin: new URL(page.url()).origin, 'X-CSRF-Token': session.csrfToken, 'If-Match': current.headers().etag },
    data: document,
  })).status()).toBe(200);
  await page.getByRole('textbox', { name: 'English narration', exact: true }).fill('My stale text must not win.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/conflict|changed|another/i);
  const after = await (await page.request.get(`/api/studio/lessons/${id}/draft`)).json();
  expect(after.document.scenes[0].beats[0].narration.en).toBe('Changed in another administrator tab.');
});
