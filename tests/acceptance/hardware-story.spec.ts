import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { PILOT } from '../../src/computerBasics/story';
import { subtitleSegments } from '../../src/player/useGuidedPlayback';
import { readCaptionDocument } from '../../src/captions/model';
async function start(page: Page, role = 'guest') {
  await page.goto('/#/login');
  await page.getByLabel('Username', { exact: false }).fill(role);
  await page.getByLabel('Password', { exact: false }).fill(role === 'guest' ? 'LocalGuest123!Only' : 'LocalAdmin123!Only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.goto('/#/skills/computer-basics/inside-machine');
  await expect(page.getByRole('heading', { name: 'Inside the machine', exact: true })).toBeVisible();
}
const player = (page: Page) => page.getByRole('region', { name: 'Inside the machine', exact: true });
async function choose(page: Page, n: number) {
  await page.getByRole('button', { name: 'Choose scene', exact: true }).click();
  await page.getByRole('navigation', { name: 'Story scenes' }).getByRole('button').nth(n - 1).click();
}
async function advanceTo(page: Page, n: number) {
  await expect.poll(async () => { await page.clock.runFor(3000); return player(page).getAttribute('data-scene'); }, { timeout: 30000, intervals: [30] }).toBe(String(n));
}
test('pilot schema and subtitles preserve all edited teaching text', () => {
  expect(readCaptionDocument(PILOT, PILOT).scenes[0].beats).toHaveLength(8);
  expect(() => readCaptionDocument(PILOT)).toThrow(/structure/);
  for (const beat of PILOT.scenes[0].beats) for (const language of ['en', 'ta'] as const) {
    expect(subtitleSegments(beat.narration[language]).join(' ')).toBe(beat.narration[language]);
  }
});
test('Power automatically runs through startup; pauses only at meaningful checkpoints', async ({ page }) => {
  await start(page); await page.clock.install();
  await expect(page.getByText('My engineering learning journey')).toHaveCount(0);
  await expect(page.getByText(/Coming next in/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Press the power button', exact: true }).click();
  await advanceTo(page, 6);
  await expect.poll(async () => { await page.clock.runFor(3000); return page.getByRole('region', { name: 'Scene checkpoint' }).isVisible(); }, { timeout: 30000, intervals: [30] }).toBe(true);
  await page.getByRole('button', { name: /Try a memory failure/ }).click();
  await expect(page.getByRole('status')).toContainText('Startup stopped');
  await page.clock.runFor(60000); await expect(player(page)).toHaveAttribute('data-scene', '6');
  await page.getByRole('button', { name: /Retry startup checks/ }).click();
  await expect.poll(async () => { await page.clock.runFor(3000); return page.getByRole('button', { name: /Continue normal startup/ }).isVisible(); }, { timeout: 30000, intervals: [30] }).toBe(true);
  await page.getByRole('button', { name: /Continue normal startup/ }).click();
  await expect.poll(async () => { await page.clock.runFor(3000); return page.getByRole('button', { name: 'RAM working value', exact: true }).isVisible(); }, { timeout: 30000, intervals: [30] }).toBe(true);
  await page.getByRole('button', { name: 'RAM working value', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('RAM is volatile');
  await page.getByRole('button', { name: 'Saved file on SSD / HDD', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('storage retains');
  await page.getByRole('button', { name: /Continue to storage inspection/ }).click();
  await expect(player(page)).toHaveAttribute('data-scene', '8');
});
test('pause, scene seek and overlays stop the playback clock; controls reveal on input', async ({ page }) => {
  await start(page); await page.clock.install();
  await page.getByRole('button', { name: 'Press the power button', exact: true }).click();
  await page.mouse.move(600, 280); await page.clock.runFor(3500);
  await expect(player(page)).toHaveAttribute('data-controls', 'false');
  await player(page).dispatchEvent('pointermove'); await expect(player(page)).toHaveAttribute('data-controls', 'true');
  await page.getByRole('button', { name: 'Pause story', exact: true }).click();
  const before = await player(page).getAttribute('data-scene'); await page.clock.runFor(60000);
  await expect(player(page)).toHaveAttribute('data-scene', before!);
  await choose(page, 4);
  await page.getByRole('button', { name: 'Explore this scene', exact: true }).click();
  await page.getByRole('button', { name: 'Step instruction fetch / execution' }).click();
  await page.clock.runFor(60000); await expect(player(page)).toHaveAttribute('data-scene', '4');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await choose(page, 8); await page.getByRole('button', { name: 'Explore this scene', exact: true }).click();
  await page.getByRole('button', { name: 'Scattered reads', exact: true }).click();
  await page.getByRole('button', { name: 'Read next example block' }).click();
  await expect(page.getByRole('status')).toContainText('no moving read head');
});
test('guest cannot author; compact admin caption editor pauses and locks the player', async ({ page }) => {
  await start(page); await expect(page.getByRole('region', { name: 'Caption authoring' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await start(page, 'admin');
  await page.route('**/api/studio/lessons/computer-hardware-pilot/draft', route => route.fulfill({ json: { document: PILOT, version: 1 }, headers: { ETag: '"1"' } }));
  await page.getByRole('button', { name: 'Edit caption', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Caption and narration', exact: true })).toHaveValue(PILOT.scenes[0].beats[0].narration.en);
  await expect(page.getByRole('button', { name: 'Play story', exact: true, includeHidden: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Close caption editor', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit caption', exact: true })).toBeFocused();
});
test('speech failure falls back to subtitles and fullscreen can be exited', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, addEventListener() {}, removeEventListener() {}, getVoices() { return []; }, speak() { throw new Error('test unavailable'); } } });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class { text: string; constructor(text: string) { this.text = text; } } });
  });
  await start(page); await page.clock.install();
  await page.getByRole('button', { name: 'Enable narration', exact: true }).click();
  await page.getByRole('button', { name: 'Press the power button', exact: true }).click();
  await advanceTo(page, 3);
  await player(page).dispatchEvent('pointermove');
  await page.getByRole('button', { name: 'Player settings', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(/subtitles/i);
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});
for (const theme of ['light', 'dark'] as const) test(`player ${theme} fits viewport, reduced motion and contrast`, async ({ page }, info) => {
  test.setTimeout(90000); await page.emulateMedia({ reducedMotion: 'reduce' }); await start(page);
  await page.getByRole('radio', { name: `${theme === 'light' ? 'Light' : 'Dark'} theme` }).click();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => player(page).evaluate(element => Math.round(element.getBoundingClientRect().bottom))).toBeLessThanOrEqual(900);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  }
  const scan = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze(); expect(scan.violations).toEqual([]);
  await page.screenshot({ path: path.join(process.env.LEARN_EVIDENCE_DIR ?? 'acceptance-tests/skill-phase-03-player', 'screenshots', `${info.project.name}-player-${theme}.png`), fullPage: true });
});
