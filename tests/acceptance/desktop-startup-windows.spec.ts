import { expect, test, type Page } from '@playwright/test';
import { journeyDocument, JOURNEYS } from '../../src/computerBasics/journeys';
import { readCaptionDocument } from '../../src/captions/model';

async function openChapter(page: Page) {
  await page.goto('/#/login');
  await page.getByLabel('Username', { exact: false }).fill('guest');
  await page.getByLabel('Password', { exact: false }).fill(process.env.TEST_GUEST_PASSWORD ?? 'LocalGuest123!Only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.goto('/#/desktop-startup');
  await expect(page.locator('[data-player="shared"]')).toBeVisible();
}

test('Windows narration has an isolated caption document and six bilingual beats', () => {
  const doc = journeyDocument('desktop-startup');
  expect(doc.id).toBe('journey-desktop-startup-windows');
  expect(doc.id).not.toBe('journey-desktop-startup');
  const beats = readCaptionDocument(doc, doc).scenes[0].beats;
  expect(beats).toHaveLength(6);
  expect(JOURNEYS['desktop-startup'].steps).toHaveLength(6);
  for (const beat of beats) {
    expect(beat.narration.en.trim()).not.toBe('');
    expect(beat.narration.ta.trim()).not.toBe('');
    expect(JSON.stringify(beat.narration)).not.toMatch(/linux|systemd|initramfs/i);
  }
  expect(beats.map(beat => beat.narration.en).join(' ')).toMatch(/windows/i);
  const oldDocument = { ...doc, id: 'journey-desktop-startup' };
  expect(() => readCaptionDocument(oldDocument, doc)).toThrow();
});

test('chapter fetches only its Windows captions and navigates all six scenes without external requests', async ({ page }) => {
  const external: string[] = [];
  const lessonRequests: string[] = [];
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== origin) external.push(request.url());
    if (url.pathname.startsWith('/api/lessons/journey-desktop-startup')) lessonRequests.push(url.pathname);
  });
  await page.route('**/api/lessons/journey-desktop-startup*', route => route.fulfill({ status: 404, body: '' }));
  await openChapter(page);
  expect(lessonRequests).toContain('/api/lessons/journey-desktop-startup-windows');
  expect(lessonRequests).not.toContain('/api/lessons/journey-desktop-startup');
  const player = page.locator('[data-player="shared"]');
  await expect(page.getByRole('img', { name: /Connected computer interior/ })).toBeVisible();
  for (let i = 1; i <= 6; i++) {
    await expect(player).toHaveAttribute('data-scene', String(i));
    await page.getByRole('button', { name: 'Scene information and transcript', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Scene information' });
    await expect(dialog).not.toContainText(/linux|systemd|initramfs/i);
    await page.getByRole('button', { name: 'Close panel', exact: true }).click();
    if (i < 6) await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: 'Next scene', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous scene', exact: true }).click();
  await expect(player).toHaveAttribute('data-scene', '5');
  await page.getByRole('button', { name: 'Choose scene', exact: true }).click();
  const scenes = page.getByRole('navigation', { name: 'Story scenes', exact: true }).getByRole('button');
  await expect(scenes).toHaveCount(6);
  await scenes.nth(1).click();
  await expect(player).toHaveAttribute('data-scene', '2');
  expect(external).toEqual([]);
});

test('pause holds the current scene and restart replays from the beginning', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('learn.voice', 'false'));
  await page.route('**/api/lessons/journey-desktop-startup*', route => route.fulfill({ status: 404, body: '' }));
  await openChapter(page);
  await page.clock.install();
  const player = page.locator('[data-player="shared"]');
  await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  await page.getByRole('button', { name: 'Play story', exact: true }).click();
  await page.getByRole('button', { name: 'Pause story', exact: true }).click();
  await page.clock.fastForward(30000);
  await expect(player).toHaveAttribute('data-scene', '2');
  await page.getByRole('button', { name: 'Restart story', exact: true }).click();
  await expect(player).toHaveAttribute('data-scene', '1');
  await page.getByRole('button', { name: 'Play story', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause story', exact: true })).toBeVisible();
});

test('mobile layout remains usable with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.route('**/api/lessons/journey-desktop-startup*', route => route.fulfill({ status: 404, body: '' }));
  await openChapter(page);
  const player = page.locator('[data-player="shared"]');
  await expect(page.getByRole('img', { name: /Connected computer interior/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect(await player.locator('*').evaluateAll(elements => elements.every(element => getComputedStyle(element).animationName === 'none'))).toBe(true);
  await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  await expect(player).toHaveAttribute('data-scene', '2');
});
