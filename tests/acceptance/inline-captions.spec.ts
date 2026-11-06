import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { BASELINE, captionText, changedCaptions, readCaptionDocument, replaceCaption } from '../../src/captions/model';
import { BOOT_TIMELINE } from '../../src/simulator/boot/bootTimeline';
import { BOOT_CAPTIONS_TA } from '../../src/simulator/boot/bootCaptions.ta';

async function login(page: Page, role = 'admin') {
  await page.goto('/#/login');
  await page.getByLabel('Username', { exact: false }).fill(role);
  await page.getByLabel('Password', { exact: false }).fill(role === 'admin' ? process.env.TEST_ADMIN_PASSWORD ?? 'LocalAdmin123!Only' : process.env.TEST_GUEST_PASSWORD ?? 'LocalGuest123!Only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'How a computer boots', exact: true })).toBeVisible();
}
const draftUrl = '**/api/studio/lessons/boot-whiteboard/draft';
async function mockDraft(page: Page) {
  await page.route(draftUrl, route => route.fulfill({ json: { document: BASELINE, version: 1, baseRevision: null }, headers: { ETag: '"1"' } }));
  await page.route('**/api/studio/ai/status', route => route.fulfill({ json: { enabled: true, models: ['mock-free'], remainingToday: 10 } }));
}
const editor = (page: Page) => page.getByRole('textbox', { name: 'Caption and narration', exact: true });

test('caption mapping exactly matches all 16 boot steps and rejects structural changes', () => {
  expect(BASELINE.scenes[0].beats).toHaveLength(16);
  for (const step of BOOT_TIMELINE) {
    expect(captionText(BASELINE, step.id, 'en')).toBe(step.caption);
    expect(captionText(BASELINE, step.id, 'ta')).toBe(BOOT_CAPTIONS_TA[step.id]);
  }
  const edited = replaceCaption(BASELINE, 'power', 'ta', 'தமிழ் caption');
  expect(changedCaptions(BASELINE, edited)).toHaveLength(1);
  const wrong = structuredClone(BASELINE); wrong.scenes[0].beats.reverse();
  expect(() => readCaptionDocument(wrong)).toThrow(/structure/);
  expect(() => replaceCaption(BASELINE, 'missing', 'en', 'Text')).toThrow();
  expect(() => replaceCaption(BASELINE, 'power', 'en', '<script>')).toThrow();
  const hiddenChange = structuredClone(BASELINE);
  hiddenChange.scenes[0].beats[0].captions = { en: 'Different hidden narration.' };
  expect(() => readCaptionDocument(hiddenChange)).toThrow(/overrides differ/);
});

test('guest has no inline authoring controls and direct writes/AI remain forbidden', async ({ page }) => {
  await login(page, 'guest');
  await expect(page.getByRole('region', { name: 'Caption authoring' })).toHaveCount(0);
  expect((await page.request.get('/api/studio/lessons/boot-whiteboard/draft')).status()).toBe(403);
  const session = await (await page.request.get('/api/auth/me')).json();
  const headers = { Origin: new URL(page.url()).origin, 'X-CSRF-Token': session.csrfToken, 'If-Match': '"1"' };
  expect((await page.request.put('/api/studio/lessons/boot-whiteboard/draft', { headers, data: BASELINE })).status()).toBe(403);
  expect((await page.request.post('/api/studio/ai/assist', { headers, data: { mode: 'review', language: 'en', text: 'Firmware.' } })).status()).toBe(403);
});

test('inline draft save and explicit publication persist without changing the old pilot', async ({ page }) => {
  await login(page);
  const pilotBefore = await (await page.request.get('/api/lessons/boot-pilot')).json();
  const oldPublication = await page.request.get('/api/lessons/boot-whiteboard');
  const oldText = oldPublication.ok() ? captionText((await oldPublication.json()).document, 'power', 'en') : captionText(BASELINE, 'power', 'en');
  const changed = `The power supply stabilizes its output voltages before startup. Test ${Date.now()}.`;
  await page.getByRole('button', { name: '✎ Edit caption', exact: true }).click();
  await expect(editor(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next step', exact: true })).toBeDisabled();
  await editor(page).fill(changed);
  await page.getByRole('button', { name: 'Save caption draft', exact: true }).click();
  await expect(page.getByText('Draft saved.', { exact: false })).toBeVisible();
  const stillPublished = await page.request.get('/api/lessons/boot-whiteboard');
  expect(stillPublished.ok() ? captionText((await stillPublished.json()).document, 'power', 'en') : captionText(BASELINE, 'power', 'en')).toBe(oldText);
  await expect(page.locator('p[title]').filter({ hasText: changed })).toHaveCount(0);
  await page.getByRole('button', { name: 'Review publication', exact: true }).click();
  await expect(page.getByText('Saved draft: ' + changed, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm publish captions', exact: true }).click();
  await expect(page.getByText('Published successfully.', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.locator('p[title]')).toHaveAttribute('title', changed);
  expect(await (await page.request.get('/api/lessons/boot-pilot')).json()).toEqual(pilotBefore);
  await page.getByRole('button', { name: '🌐 தமிழ்', exact: true }).click();
  await page.getByRole('button', { name: '✎ Edit caption', exact: true }).click();
  await expect(editor(page)).toHaveValue(BOOT_CAPTIONS_TA.power);
});

test('AI rewrite/review are explicit, contextual and never auto-save or apply findings as captions', async ({ page }) => {
  await mockDraft(page);
  let saves = 0, calls = 0;
  page.on('request', req => { if (['PUT', 'POST'].includes(req.method()) && /lessons/.test(req.url())) saves++; });
  await page.route('**/api/studio/ai/assist', route => {
    calls++;
    const body = route.request().postDataJSON();
    expect(body.sceneContext.title).toContain('power');
    expect(body.sceneContext.summary).toContain('not live source retrieval');
    return route.fulfill({ json: { suggestion: body.mode === 'review' ? 'Check platform-specific timing; this is not a verified source lookup.' : 'Power rails stabilize before the processor starts firmware.', model: 'mock-free', requestId: 'fake-test' } });
  });
  await login(page);
  await page.getByRole('button', { name: '✨ AI Rewrite', exact: true }).click();
  await expect(editor(page)).toBeVisible();
  const original = await editor(page).inputValue();
  expect(calls).toBe(0);
  await page.getByRole('button', { name: '✨ AI Rewrite', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Suggested rewrite' })).toBeVisible();
  await expect(editor(page)).toHaveValue(original);
  await page.getByRole('button', { name: 'Accept rewrite into editor' }).click();
  await expect(editor(page)).toHaveValue('Power rails stabilize before the processor starts firmware.');
  await page.getByRole('button', { name: '✓ AI Fact-check', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'AI technical review — advisory only' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept rewrite into editor' })).toHaveCount(0);
  expect(saves).toBe(0); expect(calls).toBe(2);
});

test('conflicts and AI failures retain text; cancellation rejects late suggestions', async ({ page }) => {
  await mockDraft(page);
  await login(page);
  await page.getByRole('button', { name: '✎ Edit caption', exact: true }).click();
  await editor(page).fill('Keep this local caption.');
  await page.route('**/api/studio/ai/assist', route => route.fulfill({ status: 502, json: {} }));
  await page.getByRole('button', { name: '✓ AI Fact-check', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('AI provider failed');
  await expect(editor(page)).toHaveValue('Keep this local caption.');
  await page.route(draftUrl, route => route.fulfill({ status: 409, json: {} }));
  await page.getByRole('button', { name: 'Save caption draft' }).click();
  await expect(page.getByRole('alert')).toContainText('Version conflict');
  await expect(editor(page)).toHaveValue('Keep this local caption.');
  await expect(page.getByRole('button', { name: 'Save caption draft' })).toBeDisabled();
  let respondLate: (() => Promise<void>) | undefined;
  await page.route('**/api/studio/ai/assist', route => { respondLate = () => route.fulfill({ json: { suggestion: 'Stale answer.', model: 'mock-free', requestId: 'late' } }).catch(() => {}); });
  await page.getByRole('button', { name: '✨ AI Rewrite', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await expect(page.getByText('Request cancelled locally.', { exact: false })).toBeVisible();
  await respondLate?.();
  await expect(page.getByText('Stale answer.', { exact: true })).toHaveCount(0);
  await expect(editor(page)).toHaveValue('Keep this local caption.');
});

test('navigation warns about unsaved text, editing is pinned to its step and language', async ({ page }) => {
  await mockDraft(page); await login(page);
  await page.getByRole('button', { name: '✎ Edit caption', exact: true }).click();
  await editor(page).fill('Unsaved local wording.');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('navigation', { name: 'Computer Basics chapters' }).getByRole('link', { name: 'Boot & OS', exact: true }).click();
  await expect(editor(page)).toHaveValue('Unsaved local wording.');
  await expect(page.getByRole('button', { name: '🌐 தமிழ்', exact: true })).toBeDisabled();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Close caption editor' }).click();
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await page.getByRole('button', { name: '✎ Edit caption', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Edit caption and narration.*cpu-wake/ })).toBeVisible();
});

test('leaving unsaved text needs only one confirmation and sign-out can be cancelled', async ({ page }) => {
  await mockDraft(page); await login(page);
  await page.getByRole('button', { name: '✎ Edit caption', exact: true }).click();
  await editor(page).fill('Keep this unsaved caption until I confirm.');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(editor(page)).toHaveValue('Keep this unsaved caption until I confirm.');
  let prompts = 0;
  page.on('dialog', async dialog => { prompts++; await dialog.accept(); });
  await page.getByRole('navigation', { name: 'Computer Basics chapters' }).getByRole('link', { name: 'Boot & OS', exact: true }).click();
  await expect(page).toHaveURL(/#\/skills\/computer-basics\/boot-os$/);
  await expect(page.getByRole('textbox', { name: 'Caption and narration', exact: true })).toHaveCount(0);
  expect(prompts).toBe(1);
});

test('failed or incompatible draft loads never enable saves or silently substitute content', async ({ page }) => {
  await login(page);
  await page.route(draftUrl, route => route.fulfill({ status: 503, json: {} }));
  await page.getByRole('button', { name: '✎ Edit caption', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry caption load' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save caption draft' })).toHaveCount(0);
  const incompatible = structuredClone(BASELINE); incompatible.scenes[0].beats.reverse();
  await page.route(draftUrl, route => route.fulfill({ json: { document: incompatible, version: 4 }, headers: { ETag: '\"4\"' } }));
  await page.getByRole('button', { name: 'Retry caption load' }).click();
  await expect(page.getByRole('alert')).toContainText('structure does not match');
  await expect(editor(page)).toHaveCount(0);
});

for (const theme of ['light', 'dark'] as const) {
  test(`inline editor ${theme}: mobile layout, reduced motion and contrast`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await mockDraft(page); await page.emulateMedia({ reducedMotion: 'reduce' }); await login(page);
    await page.getByRole('radio', { name: `${theme === 'light' ? 'Light' : 'Dark'} theme` }).click();
    await page.getByRole('button', { name: '✎ Edit caption', exact: true }).click();
    await expect(editor(page)).toBeVisible();
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    }
    const scan = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze(); expect(scan.violations).toEqual([]);
    await page.screenshot({ path: path.join(process.env.LEARN_EVIDENCE_DIR ?? 'acceptance-tests/skill-phase-02', 'screenshots', `${info.project.name}-inline-${theme}.png`), fullPage: true, scale: 'css' });
  });
}
