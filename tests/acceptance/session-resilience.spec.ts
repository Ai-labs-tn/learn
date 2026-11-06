import { expect, test, type Page } from '@playwright/test';

const unauthenticated = { status: 401, json: { detail: 'Authentication required' } };

/**
 * Advance the fake clock in small steps until `done` holds. Aborted requests settle in a later
 * real-time turn, so one big jump would outrun the promise chain it is meant to exercise.
 */
async function advanceUntil(page: Page, done: () => boolean | Promise<boolean>, stepMs = 5_000) {
  await expect.poll(async () => { await page.clock.runFor(stepMs); return done(); }, { timeout: 30_000, intervals: [50] }).toBe(true);
}

test('a fresh visitor never gets an expiry banner after focus or visibility checks', async ({ page, context }) => {
  let calls = 0;
  await page.route('**/api/auth/me', (route) => { calls += 1; return route.fulfill(unauthenticated); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Saravanamanikandan S', exact: true })).toBeVisible();
  await expect.poll(() => calls).toBeGreaterThan(0);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const checked = page.waitForResponse('**/api/auth/me');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await checked;
    await expect(page.getByText(/session.*expir/i)).toHaveCount(0);
  }
  expect((await context.cookies()).filter((cookie) => cookie.httpOnly)).toHaveLength(0);
});

test('a sleeping server never leaves the session screen hanging: timeout, explain, retry, recover', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/auth/me', (route) => {
    calls += 1;
    // The first two attempts hang like a free instance that is still waking up.
    if (calls <= 2) return; // never answered: only the client timeout can end it
    return route.fulfill(unauthenticated);
  });
  await page.clock.install();
  await page.goto('/#/login');
  await expect(page.getByText('Loading your session…')).toBeVisible();
  await advanceUntil(page, () => page.getByText(/server is waking up/i).isVisible());
  expect(calls).toBeLessThan(3);
  await advanceUntil(page, () => calls >= 3);
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  expect(calls).toBe(3);
});

test('after bounded retries a persistent outage shows a clear error with a manual retry', async ({ page }) => {
  let stall = true;
  await page.route('**/api/auth/me', (route) => (stall ? undefined : route.fulfill(unauthenticated)));
  await page.clock.install();
  await page.goto('/#/login');
  // Spans several 60-second keep-alive ticks: they must not abort the initial load's retries.
  for (let step = 0; step < 8; step += 1) await page.clock.runFor(15_000);
  await expect(page.getByRole('heading', { name: 'Unable to check your session' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/not responding|still be starting/i);
  stall = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
});

test('an active signed-in tab keeps its session alive in the background', async ({ page }) => {
  let checks = 0;
  await page.clock.install(); // before the app registers its keep-alive timer
  await page.goto('/#/login');
  await page.getByLabel('Username', { exact: false }).fill('guest');
  await page.getByLabel('Password', { exact: false }).fill(process.env.TEST_GUEST_PASSWORD ?? 'LocalGuest123!Only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.route('**/api/auth/me', (route) => { checks += 1; return route.continue(); });
  await page.clock.runFor(65_000);
  await expect.poll(() => checks).toBeGreaterThanOrEqual(1);
  await page.clock.runFor(65_000);
  await expect.poll(() => checks).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
});

test('a session that expires while the tab is open says so instead of silently resetting', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByLabel('Username', { exact: false }).fill('guest');
  await page.getByLabel('Password', { exact: false }).fill(process.env.TEST_GUEST_PASSWORD ?? 'LocalGuest123!Only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.route('**/api/auth/me', (route) => route.fulfill(unauthenticated));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading', { name: 'Saravanamanikandan S', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('status')).toContainText('Your session expired. Please sign in again.');
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByText('Your session expired. Please sign in again.')).toHaveCount(0);
});
