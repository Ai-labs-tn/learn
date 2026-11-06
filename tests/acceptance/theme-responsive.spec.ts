import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const evidence = process.env.LEARN_EVIDENCE_DIR ?? 'acceptance-tests/phase-01-polish';
const sizes = [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 844, height: 390 },
];

async function noPageOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))).toEqual(expect.objectContaining({ width: expect.any(Number), content: expect.any(Number) }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

async function capture(page: Page, label: string, project: string) {
  await page.screenshot({ path: path.join(evidence, 'screenshots', `${project}-${label}.png`), fullPage: true, scale: 'css' });
}

async function contrast(page: Page, label: string) {
  const scan = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  expect(scan.violations.map((item) => ({ id: item.id, description: item.description, nodes: item.nodes.map((node) => node.target) })), label).toEqual([]);
}

async function login(page: Page) {
  await page.goto('/#/login');
  await page.getByLabel('Username', { exact: false }).fill('admin');
  await page.getByLabel('Password', { exact: false }).fill(process.env.TEST_ADMIN_PASSWORD ?? 'LocalAdmin123!Only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}

for (const theme of ['light', 'dark'] as const) {
  test(`login: ${theme} contrast, mobile layout and touch targets`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.goto('/#/login');
    await page.getByRole('radio', { name: `${theme === 'light' ? 'Light' : 'Dark'} theme` }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const size of sizes) {
      await page.setViewportSize(size);
      await noPageOverflow(page);
      await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
      const field = page.getByLabel('Username', { exact: false });
      expect(await field.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
      for (const target of await page.getByRole('radiogroup', { name: 'Color theme' }).getByRole('radio').all()) {
        const bounds = await target.boundingBox();
        expect(bounds?.width).toBeGreaterThanOrEqual(44);
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
      }
      if ([320, 1280].includes(size.width)) await capture(page, `login-${theme}-${size.width}`, info.project.name);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Username', { exact: false }).fill('admin');
    await page.getByLabel('Password', { exact: false }).fill('DisposablePreviewOnly');
    await contrast(page, `Enabled login in ${theme}`);
    // Clear disposable preview text before any further screenshot/report evidence.
    await page.getByLabel('Password', { exact: false }).fill('');
  });

  test(`all authenticated screens: ${theme} responsive layout`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await login(page);
    await page.getByRole('radio', { name: `${theme === 'light' ? 'Light' : 'Dark'} theme` }).click();
    const routes = [
      ['boot-os', 'How a computer boots'], ['jvm-runtime', 'Inside the JVM'],
      ['bytecode-stepper', 'Bytecode stepper'], ['dsa', 'Binary search tree'],
      ['write-your-own', 'Your Java'], ['studio', 'Learning Studio'],
      ['lessons', 'Lesson library'],
    ] as const;
    for (const [route, heading] of routes) {
      await page.goto(`/#/${route}`);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      for (const size of sizes) {
        await page.setViewportSize(size);
        await noPageOverflow(page);
        await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
        if ([320, 1280].includes(size.width)) await capture(page, `${route}-${theme}-${size.width}`, info.project.name);
      }
      await contrast(page, `${route} in ${theme}`);
      if (route === 'write-your-own') {
        await page.getByRole('button', { name: '▶ Run — compile to bytecode' }).click();
        await expect(page.getByRole('button', { name: 'Next →', exact: true })).toBeVisible();
        await page.setViewportSize({ width: 320, height: 740 });
        await noPageOverflow(page);
        await expect.poll(() => page.locator('.monaco-editor').evaluate((element) => element.className)).toContain(theme === 'dark' ? 'vs-dark' : 'vs');
      }
    }
  });
}

test('system theme follows OS changes and explicit preference survives reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/#/login');
  await page.getByRole('radio', { name: 'System theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: 'Dark theme' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Dark theme' })).toBeChecked();
});
