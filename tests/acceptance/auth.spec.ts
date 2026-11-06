import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const credentials = {
  admin: process.env.TEST_ADMIN_PASSWORD ?? 'LocalAdmin123!Only',
  guest: process.env.TEST_GUEST_PASSWORD ?? 'LocalGuest123!Only',
};

async function login(page: Page, role: 'admin' | 'guest') {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await page.getByLabel('Username', { exact: false }).fill(role);
  await page.getByLabel('Password', { exact: false }).fill(credentials[role]);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}

async function screenshot(page: Page, name: string, project: string) {
  const caption = page.locator('p[title]');
  if (await caption.count() === 1) {
    const fullText = await caption.getAttribute('title');
    if (fullText) await expect(caption).toContainText(fullText, { timeout: 15_000 });
  }
  await page.screenshot({
    path: path.join(process.env.LEARN_EVIDENCE_DIR ?? 'acceptance-tests/phase-01', process.env.LEARN_TEST_BASE_URL ? 'built/screenshots' : 'screenshots', `${project}-${name}.png`),
    fullPage: true,
    scale: 'css',
  });
}

test('anonymous users cannot read protected API or Studio', async ({ page }) => {
  await page.goto('/#/studio');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  expect((await page.request.get('/api/studio/status')).status()).toBe(401);
  expect((await page.request.get('/api/boot-os-simulator')).status()).toBe(401);
});

test('invalid login is clear and clears password', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Username', { exact: false }).fill('guest');
  await page.getByLabel('Password', { exact: false }).fill('IncorrectTestOnly');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid username or password.');
  await expect(page.getByLabel('Password', { exact: false })).toHaveValue('');
});

test('guest can learn, survives refresh, but cannot enter Studio', async ({ page }, info) => {
  await login(page, 'guest');
  await expect(page.getByRole('heading', { name: 'How a computer boots' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  expect((await page.request.get('/api/studio/status')).status()).toBe(403);
  await page.goto('/#/studio');
  await expect(page.getByRole('heading', { name: 'Studio access denied' })).toBeVisible();
  await screenshot(page, 'guest-denied', info.project.name);
});

test('admin accesses verified Studio; logout invalidates session', async ({ page, context }, info) => {
  await login(page, 'admin');
  const cookies = await context.cookies();
  expect(cookies.some((cookie) => cookie.httpOnly)).toBeTruthy();
  expect(await page.evaluate(() => localStorage.getItem('accessToken'))).toBeNull();
  await page.goto('/#/studio');
  await expect(page.getByText('Administrator access verified.')).toBeVisible();
  await screenshot(page, 'admin-studio', info.project.name);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
});

test('logout without CSRF token is denied and session remains valid', async ({ page }) => {
  await login(page, 'guest');
  const response = await page.request.post('/api/auth/logout', {
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(response.status()).toBe(403);
  expect((await page.request.get('/api/auth/me')).status()).toBe(200);
});

test('existing lesson routes remain accessible to guests', async ({ page }, info) => {
  await login(page, 'guest');
  const routes = [
    ['jvm-runtime', 'Inside the JVM'],
    ['bytecode-stepper', 'Bytecode stepper'],
    ['dsa', 'Binary search tree'],
    ['write-your-own', 'Your Java'],
    ['boot-os', 'How a computer boots'],
  ] as const;
  for (const [route, title] of routes) {
    await page.goto(`/#/${route}`);
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await screenshot(page, 'guest-learning', info.project.name);
});

test('Studio rejects a successful response with invalid content', async ({ page }) => {
  await login(page, 'admin');
  await page.route('**/api/studio/status', (route) => route.fulfill({
    status: 200, contentType: 'text/html', body: '<html>Wrong API route</html>',
  }));
  await page.goto('/#/studio');
  await expect(page.getByRole('alert')).toContainText('Studio access could not be verified');
  await expect(page.getByText('Administrator access verified.')).toHaveCount(0);
  await page.unroute('**/api/studio/status');
  await page.getByRole('button', { name: 'Retry Studio access' }).click();
  await expect(page.getByText('Administrator access verified.')).toBeVisible();
});

test('failed logout is not reported as success and permits recovery', async ({ page }) => {
  await login(page, 'guest');
  await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 403, body: '{}' }));
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Sign-out was not confirmed');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.unroute('**/api/auth/logout');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
});

test('focus revalidation preserves the current learning step', async ({ page }) => {
  await login(page, 'guest');
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await expect(page.getByText('2 / 16', { exact: true })).toBeVisible();
  const refreshed = page.waitForResponse((response) => response.url().endsWith('/api/auth/me'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refreshed;
  await expect(page.getByText('2 / 16', { exact: true })).toBeVisible();
});

test('logout in another tab revokes the visible session', async ({ page, context }) => {
  await login(page, 'guest');
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await other.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  await other.close();
});

test('revoked session on focus returns to sign in', async ({ page }) => {
  await login(page, 'admin');
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, body: '{}' }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
});

test('session service failure shows retry rather than exposing lessons', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 503, body: '{}' }));
  // A 503 is what a waking server returns, so the app retries (3s + 6s + 9s) before giving up.
  await page.clock.install();
  await page.goto('/');
  await expect.poll(async () => {
    await page.clock.runFor(5_000);
    return page.getByRole('heading', { name: 'Unable to check your session' }).isVisible();
  }, { timeout: 30_000, intervals: [50] }).toBe(true);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How a computer boots' })).toHaveCount(0);
  await page.unroute('**/api/auth/me');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
});
