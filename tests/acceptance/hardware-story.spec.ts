import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { PILOT } from '../../src/computerBasics/story';
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
const scene = (page: Page, n: number) => page.getByRole('navigation', { name: 'Hardware story scenes' }).getByRole('button').nth(n - 1).click();
test('pilot caption schema is isolated and has eight stable beats', () => {
  expect(readCaptionDocument(PILOT, PILOT).scenes[0].beats).toHaveLength(8);
  expect(() => readCaptionDocument(PILOT)).toThrow(/structure/);
});
test('power, firmware, memory, failure and prediction reconstruct deterministically', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('button', { name: 'Next scene', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '⏻ Press the power button' }).click();
  await page.getByRole('button', { name: 'Stabilize the supply rails' }).click();
  await page.getByRole('button', { name: 'Release reset' }).click();
  await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  await page.getByRole('button', { name: 'Where does the first instruction come from?' }).click();
  await page.getByRole('button', { name: 'Fetch a firmware instruction' }).click();
  await page.getByRole('button', { name: 'Execute the instruction' }).click();
  await expect(page.getByRole('status')).toContainText('chip stores software');
  await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  await page.getByRole('button', { name: 'Write 17 to working memory' }).click();
  await page.getByRole('button', { name: 'Read 17 into a register' }).click();
  await expect(page.getByRole('status')).toContainText('read back into a CPU register');
  await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  await page.getByRole('button', { name: 'Try a memory-check failure' }).click();
  await expect(page.getByRole('button', { name: 'Next scene', exact: true })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Startup stops');
  await page.getByRole('button', { name: 'Run passing checks' }).click();
  await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  await page.getByRole('button', { name: 'RAM working value remains' }).click();
  await expect(page.getByRole('button', { name: 'Remove simulated power' })).toBeDisabled();
  await page.getByRole('button', { name: 'Saved file on storage remains' }).click();
  await page.getByRole('button', { name: 'Remove simulated power' }).click();
  await expect(page.getByText('RAM example value: not retained. Saved file on SSD/HDD: retained.')).toBeVisible();
  await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  await page.getByRole('button', { name: 'Scattered reads', exact: true }).click();
  await page.getByRole('button', { name: 'Read next example block' }).click();
  await expect(page.getByRole('status')).toContainText('no moving read head');
  await page.getByRole('button', { name: 'Restart hardware story' }).click();
  await expect(page.getByText('Scene 1 of 8')).toBeVisible();
  await scene(page, 5);
  await expect(page.getByRole('button', { name: 'Write 17 to working memory' })).toBeVisible();
});
test('guest cannot author; admin captions use the new isolated chapter', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('region', { name: 'Caption authoring' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await start(page, 'admin');
  await page.route('**/api/studio/lessons/computer-hardware-pilot/draft', route => route.fulfill({ json: { document: PILOT, version: 1 }, headers: { ETag: '"1"' } }));
  await page.getByRole('button', { name: '✎ Edit caption', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Caption and narration', exact: true })).toHaveValue(PILOT.scenes[0].beats[0].narration.en);
  await expect(page.getByRole('navigation', { name: 'Hardware story scenes' }).getByRole('button').first()).toBeDisabled();
});
for (const theme of ['light', 'dark'] as const) test(`pilot ${theme} responsive, motion and contrast`, async ({ page }, info) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await start(page);
  await page.getByRole('radio', { name: `${theme === 'light' ? 'Light' : 'Dark'} theme` }).click();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  }
  await scene(page, 8);
  await page.getByRole('button', { name: 'Read next example block' }).click();
  const scan = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze(); expect(scan.violations).toEqual([]);
  await page.screenshot({ path: path.join(process.env.LEARN_EVIDENCE_DIR ?? 'acceptance-tests/skill-phase-03', 'screenshots', `${info.project.name}-hardware-${theme}.png`), fullPage: true });
  await page.getByRole('button', { name: 'Pause visual motion' }).click();
  await expect(page.getByRole('region', { name: 'Inside the machine', exact: true })).toHaveAttribute('data-hidden', 'true');
});
