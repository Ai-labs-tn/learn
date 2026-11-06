import { expect, test, type Page } from '@playwright/test';

const publication = { revision: 1, publishedAt: '2026-11-05T00:00:00Z', document: {
  schemaVersion: 1, id: 'playback-test', title: 'Playback test story', description: 'Disposable browser fixture.',
  scenes: [{ id: 'scene-power', title: 'Power', beats: [
    { id: 'beat-one', narration: { en: 'Power is stable.', ta: 'மின்சாரம் நிலையாக உள்ளது.' }, visual: { component: 'boot-machine', focus: 'power', action: 'focus' } },
    { id: 'beat-two', narration: { en: 'Firmware begins.', ta: 'Firmware தொடங்குகிறது.' }, visual: { component: 'boot-machine', focus: 'firmware', action: 'focus' } },
  ] }],
} };

async function mockSpeech(page: Page, available = true) {
  await page.addInitScript(({ available }) => {
    localStorage.setItem('learn.voice', 'true');
    localStorage.setItem('learn.captionLang', '"en"');
    const state: any = { utterances: [], callbacks: [], speaking: false, pending: false, cancels: 0 };
    class Utterance { text: string; lang = ''; voice: unknown; onend: any; onerror: any; constructor(text: string) { this.text = text; } }
    const synth = Object.assign(new EventTarget(), {
      getVoices: () => [{ lang: 'en-US', name: 'Disposable English voice', default: true, localService: true, voiceURI: 'test' }],
      speak: (utterance: any) => { state.utterances.push(utterance.text); state.callbacks.push(utterance.onend); state.speaking = true; },
      cancel: () => { state.cancels++; state.speaking = false; state.pending = false; },
    });
    Object.defineProperties(synth, { speaking: { get: () => state.speaking }, pending: { get: () => state.pending } });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: available ? synth : undefined });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: available ? Utterance : undefined });
    (window as any).__speech = state;
  }, { available });
}

async function signIn(page: Page, role = 'guest') {
  await page.goto('/#/login');
  await page.getByLabel('Username', { exact: false }).fill(role);
  await page.getByLabel('Password', { exact: false }).fill(role === 'admin' ? process.env.TEST_ADMIN_PASSWORD ?? 'LocalAdmin123!Only' : process.env.TEST_GUEST_PASSWORD ?? 'LocalGuest123!Only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}

async function story(page: Page) {
  await page.route('**/api/lessons', (route) => route.fulfill({ json: [{ id: 'playback-test', title: 'Playback test story' }] }));
  await page.route('**/api/lessons/playback-test', (route) => route.fulfill({ json: publication }));
  await page.goto('/#/lessons');
  await expect(page.getByRole('heading', { name: 'Playback test story' })).toBeVisible();
  // V1 may issue a silent browser warm-up before route navigation. It is not story narration.
  await page.evaluate(() => { const speech = (window as any).__speech; speech.utterances = []; speech.callbacks = []; speech.speaking = false; speech.pending = false; });
  await page.clock.install();
}

test('speech completion waits for engine state; old callbacks cannot advance after pause', async ({ page }) => {
  await mockSpeech(page); await signIn(page); await story(page);
  await page.getByRole('button', { name: 'Play story', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__speech.utterances.length)).toBe(1);
  await page.clock.runFor(400);
  await page.evaluate(() => (window as any).__speech.callbacks[0]());
  await page.clock.runFor(1000);
  await expect(page.getByRole('status')).toHaveText('Beat 1 of 2');
  await page.evaluate(() => { (window as any).__speech.speaking = false; });
  await page.clock.runFor(400);
  await expect(page.getByRole('status')).toHaveText('Beat 2 of 2');
  await page.getByRole('button', { name: 'Pause story', exact: true }).click();
  await page.evaluate(() => (window as any).__speech.callbacks[0]());
  await page.clock.runFor(1000);
  await expect(page.getByRole('status')).toHaveText('Beat 2 of 2');
  await expect(page.getByRole('button', { name: 'Play story', exact: true })).toBeVisible();
});

test('missing Tamil voice never speaks through English and captions advance', async ({ page }) => {
  await mockSpeech(page); await signIn(page); await story(page);
  await page.getByRole('button', { name: 'தமிழ் captions', exact: true }).click();
  await page.getByRole('button', { name: 'Play story', exact: true }).click();
  await expect(page.getByText(/Tamil voice unavailable/)).toBeVisible();
  await page.clock.runFor(3000);
  await expect(page.getByRole('status')).toHaveText('Beat 2 of 2');
  expect(await page.evaluate(() => (window as any).__speech.utterances.length)).toBe(0);
});

test('missing browser speech API falls back to captions without breaking V1', async ({ page }) => {
  await mockSpeech(page, false); await signIn(page); await story(page);
  await page.getByRole('button', { name: 'Play story', exact: true }).click();
  await expect(page.getByText(/Browser speech is unavailable/)).toBeVisible();
  await page.clock.runFor(3000);
  await expect(page.getByRole('status')).toHaveText('Beat 2 of 2');
});

test('V1 voice-off Play advances and Space on a focused control remains native', async ({ page }) => {
  await mockSpeech(page);
  await page.addInitScript(() => localStorage.setItem('learn.voice', 'false'));
  await signIn(page);
  const next = page.getByRole('button', { name: 'Next step', exact: true });
  await next.focus(); await next.press('Space');
  await expect(page.getByText('2 / 16', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play lecture', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restart lecture', exact: true }).click();
  await page.clock.install();
  await page.getByRole('button', { name: 'Play lecture', exact: true }).click();
  await page.clock.fastForward(45000);
  await expect(page.getByText('1 / 16', { exact: true })).toHaveCount(0);
});

test('stalled speech pauses with explicit recovery instead of skipping', async ({ page }) => {
  await mockSpeech(page); await signIn(page); await story(page);
  await page.getByRole('button', { name: 'Play story', exact: true }).click();
  await page.clock.fastForward(61000);
  await expect(page.getByText(/Speech did not finish reliably/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play story', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Beat 1 of 2');
});
