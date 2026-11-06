import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { journeyDocument, JOURNEYS, type JourneyId } from '../../src/computerBasics/journeys';
import { readCaptionDocument } from '../../src/captions/model';
async function login(page: Page) {
  await page.goto('/#/login');
  await page.getByLabel('Username', { exact: false }).fill('guest');
  await page.getByLabel('Password', { exact: false }).fill(process.env.TEST_GUEST_PASSWORD ?? 'LocalGuest123!Only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inside the machine', exact: true })).toBeVisible();
}
test('legacy boot is hidden, still reachable; new scripts have isolated valid caption documents', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Choose scene', exact: true }).click();
  await expect(page.getByRole('link', { name: /Boot & OS/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Reach the desktop', exact: true })).toBeVisible();
  await page.goto('/#/boot-os'); await expect(page.getByRole('heading', { name: 'How a computer boots', exact: true })).toBeVisible();
  for (const id of Object.keys(JOURNEYS) as JourneyId[]) {
    const doc = journeyDocument(id);
    expect(readCaptionDocument(doc, doc).scenes[0].beats).toHaveLength(JOURNEYS[id].steps.length);
    expect(doc.id).not.toBe('boot-pilot');
  }
});
test('player and settings are shared by hardware, JVM, bytecode, DSA and new chapters', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Player settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Caption language', exact: true }).selectOption('ta');
  await page.getByRole('combobox', { name: 'Playback speed', exact: true }).selectOption('1.5');
  await page.getByRole('checkbox', { name: 'Subtitles', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  for (const route of ['jvm-runtime', 'bytecode-stepper', 'dsa', 'desktop-startup', 'chrome-launch', 'java-machine']) {
    await page.goto(`/#/${route}`);
    await expect(page.locator('[data-player="shared"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show subtitles', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Player settings', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Caption language', exact: true })).toHaveValue('ta');
    await expect(page.getByRole('combobox', { name: 'Playback speed', exact: true })).toHaveValue('1.5');
    await page.getByRole('button', { name: 'Close panel', exact: true }).click();
    await page.reload(); await expect(page.getByRole('button', { name: 'Show subtitles', exact: true })).toBeVisible();
  }
});
test('three approved journeys show causal state and play without network activity', async ({ page }) => {
  await login(page);
  let external = 0;
  page.on('request', request => { if (!request.url().startsWith(new URL(page.url()).origin)) external++; });
  for (const id of Object.keys(JOURNEYS) as JourneyId[]) {
    await page.goto(`/#/${id}`);
    await expect(page.getByRole('heading', { name: JOURNEYS[id].title, exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Software view', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Next scene', exact: true }).click();
    await expect(page.locator('[data-player="shared"]')).toHaveAttribute('data-scene', '2');
    await page.getByRole('button', { name: 'Choose scene', exact: true }).click();
    await page.getByRole('navigation', { name: 'Story scenes', exact: true }).getByRole('button').last().click();
    await expect(page.locator('[data-player="shared"]')).toHaveAttribute('data-scene', String(JOURNEYS[id].steps.length));
  }
  expect(external).toBe(0);
});
for (const theme of ['light', 'dark'] as const) test(`new journeys ${theme} mobile fit and contrast`, async ({ page }) => {
  test.setTimeout(90000); await login(page);
  await page.getByRole('radio', { name: `${theme === 'light' ? 'Light' : 'Dark'} theme` }).click();
  for (const route of ['desktop-startup', 'chrome-launch', 'java-machine']) {
    await page.goto(`/#/${route}`);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('[data-player="shared"]')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    }
    const scan = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze(); expect(scan.violations).toEqual([]);
  }
});
