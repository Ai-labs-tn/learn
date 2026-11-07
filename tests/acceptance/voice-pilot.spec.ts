import { expect, test, type Page } from '@playwright/test';
import { subtitleSegments } from '../../src/player/useGuidedPlayback';

type Recorded = { text: string; voice: string; lang: string; rate: number };
async function installVoices(page: Page) {
  await page.addInitScript(() => {
    const target = new EventTarget();
    const state: { voices: Array<Record<string, unknown>>; utterances: Recorded[]; cancelCount: number } = { voices: [], utterances: [], cancelCount: 0 };
    class Utterance { text: string; lang = ''; rate = 1; voice: { voiceURI: string } | null = null; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(text: string) { this.text = text; } }
    const synth = Object.assign(target, {
      getVoices: () => state.voices,
      cancel: () => { state.cancelCount++; },
      speak: (speech: Utterance) => { state.utterances.push({ text: speech.text, voice: speech.voice?.voiceURI ?? '', lang: speech.lang, rate: speech.rate }); },
    });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
    (window as unknown as { __voice: typeof state }).__voice = state;
    (window as unknown as { __loadVoices: () => void }).__loadVoices = () => {
      state.voices = [
        { name: 'First English', lang: 'en-US', voiceURI: 'en-first', localService: true, default: true },
        { name: 'Warm English', lang: 'en-IN', voiceURI: 'en-warm', localService: false, default: false },
        { name: 'Tamil Voice', lang: 'ta-IN', voiceURI: 'ta-voice', localService: true, default: false },
      ];
      target.dispatchEvent(new Event('voiceschanged'));
    };
  });
}
async function login(page: Page) {
  await page.goto('/#/login');
  await page.getByLabel('Username', { exact: false }).fill('guest');
  await page.getByLabel('Password', { exact: false }).fill(process.env.TEST_GUEST_PASSWORD ?? 'LocalGuest123!Only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inside the machine', exact: true })).toBeVisible();
}
const records = (page: Page) => page.evaluate(() => (window as unknown as { __voice: { utterances: Recorded[] } }).__voice.utterances);
test('sentence-oriented subtitle chunks preserve the source without splitting normal sentences unnecessarily', () => {
  const text = 'A slightly longer sentence gives a speaker enough context to sound natural, without clipping the subtitle. Then we pause.';
  const chunks = subtitleSegments(text);
  expect(chunks.join(' ')).toBe(text);
  expect(chunks).toHaveLength(2);
});
test('browser voices load asynchronously; sample is explicit and selected voice persists across modules', async ({ page }) => {
  await installVoices(page); await login(page);
  await page.getByRole('button', { name: 'Player settings', exact: true }).click();
  expect(await records(page)).toHaveLength(0);
  await page.evaluate(() => (window as unknown as { __loadVoices: () => void }).__loadVoices());
  await expect(page.getByRole('option', { name: /Warm English/ })).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Browser voice', exact: true }).selectOption('en-warm');
  await page.getByRole('combobox', { name: 'Playback speed', exact: true }).selectOption('0.85');
  await page.getByRole('button', { name: 'Play voice sample', exact: true }).click();
  await expect.poll(async () => (await records(page)).length).toBe(1);
  expect((await records(page))[0]).toEqual(expect.objectContaining({ voice: 'en-warm', rate: 0.85, lang: 'en-US' }));
  await page.getByRole('button', { name: 'Stop voice sample', exact: true }).click();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.goto('/#/jvm-runtime');
  await page.evaluate(() => (window as unknown as { __loadVoices: () => void }).__loadVoices());
  await page.getByRole('button', { name: 'Player settings', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Browser voice', exact: true })).toHaveValue('en-warm');
  await expect(page.getByRole('combobox', { name: 'Playback speed', exact: true })).toHaveValue('0.85');
  await page.getByRole('checkbox', { name: 'Narration', exact: true }).check();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.getByRole('button', { name: 'Play story', exact: true }).click();
  await expect.poll(async () => (await records(page)).length).toBeGreaterThan(0);
  expect((await records(page)).at(-1)).toEqual(expect.objectContaining({ voice: 'en-warm', rate: 0.85 }));
});
test('English and Tamil selections remain separate; stopping or leaving the settings cancels preview', async ({ page }) => {
  await installVoices(page); await login(page);
  await page.evaluate(() => (window as unknown as { __loadVoices: () => void }).__loadVoices());
  await page.getByRole('button', { name: 'Player settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Browser voice', exact: true }).selectOption('en-warm');
  await page.getByRole('combobox', { name: 'Caption language', exact: true }).selectOption('ta');
  await page.getByRole('combobox', { name: 'Browser voice', exact: true }).selectOption('ta-voice');
  await page.getByRole('button', { name: 'Play voice sample', exact: true }).click();
  expect((await records(page)).at(-1)).toEqual(expect.objectContaining({ voice: 'ta-voice', lang: 'ta-IN' }));
  await page.getByRole('combobox', { name: 'Caption language', exact: true }).selectOption('en');
  await expect(page.getByRole('button', { name: 'Play voice sample', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Browser voice', exact: true })).toHaveValue('en-warm');
  await page.getByRole('combobox', { name: 'Caption language', exact: true }).selectOption('ta');
  await expect(page.getByRole('combobox', { name: 'Browser voice', exact: true })).toHaveValue('ta-voice');
  await page.getByRole('button', { name: 'Play voice sample', exact: true }).click();
  const before = await page.evaluate(() => (window as unknown as { __voice: { cancelCount: number } }).__voice.cancelCount);
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __voice: { cancelCount: number } }).__voice.cancelCount)).toBeGreaterThan(before);
});
test('a missing Tamil voice gives clear fallback and does not play another language voice', async ({ page }) => {
  await installVoices(page); await login(page);
  await page.getByRole('button', { name: 'Player settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Caption language', exact: true }).selectOption('ta');
  await page.getByRole('button', { name: 'Play voice sample', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('No Tamil voice');
  expect(await records(page)).toHaveLength(0);
});
