import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { SKILLS, resolveLearningRoute, skillPath } from '../../src/learning/catalog';

async function login(page: Page, role = 'guest') {
  await page.goto('/#/login');
  await page.getByLabel('Username', { exact: false }).fill(role);
  await page.getByLabel('Password', { exact: false }).fill(role === 'admin'
    ? process.env.TEST_ADMIN_PASSWORD ?? 'LocalAdmin123!Only'
    : process.env.TEST_GUEST_PASSWORD ?? 'LocalGuest123!Only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}

async function primary(page: Page) {
  const menu = page.getByRole('button', { name: 'Open navigation menu', exact: true });
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await expect(menu).toBeVisible();
    await menu.click();
  } else {
    await expect(menu).toHaveCount(0);
  }
  return page.getByRole('navigation', { name: 'Primary', exact: true });
}

test('skill map routes preserve legacy bookmarks and reject invalid chapter/skill combinations', () => {
  expect(SKILLS).toHaveLength(9);
  for (const skill of SKILLS) {
    expect(resolveLearningRoute(`#${skillPath(skill.id)}`).kind).toBe('skill');
    for (const chapter of skill.chapters) {
      const canonical = `/skills/${skill.id}/${chapter.id}`;
      expect(resolveLearningRoute(`#/${chapter.id}`).path).toBe(canonical);
      expect(resolveLearningRoute(`#${canonical}?preview=1`).path).toBe(canonical);
    }
  }
  expect(resolveLearningRoute('#/skills/gcp/bytecode-stepper').path).toBe('/skills/computer-basics');
  expect(resolveLearningRoute('#/boot-os-typo').path).toBe('/skills/computer-basics');
  expect(resolveLearningRoute('#/studio/anything').kind).toBe('studio');
  expect(resolveLearningRoute('#/lessons').kind).toBe('lessons');
});

test('nine skills are the primary navigation; old content tools are preserved', async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/#\/skills\/computer-basics$/);
  const nav = await primary(page);
  await expect(nav.getByRole('link')).toHaveText([...SKILLS.map((skill) => skill.title), 'Lesson library']);
  await expect(nav.getByRole('link', { name: 'Computer Basics', exact: true })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: 'Core Java Internals', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inside the JVM', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Choose scene', exact: true }).click();
  const chapters = page.getByRole('navigation', { name: 'Core Java Internals chapters' });
  await chapters.getByRole('link', { name: 'Bytecode stepper', exact: true }).click();
  await expect(page).toHaveURL(/#\/skills\/core-java\/bytecode-stepper$/);
  await expect(page.getByRole('heading', { name: 'Bytecode stepper', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Choose scene', exact: true }).click();
  await expect(chapters.getByRole('link', { name: 'Bytecode stepper', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Inside the JVM', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Bytecode stepper', exact: true })).toBeVisible();
  expect((await page.request.get('/api/studio/status')).status()).toBe(403);
});

test('unbuilt skill tracks are honest roadmaps, not fake editors or AI verification', async ({ page }) => {
  await login(page, 'admin');
  for (const skill of SKILLS.filter((item) => item.chapters.length === 0)) {
    const nav = await primary(page);
    await nav.getByRole('link', { name: skill.title, exact: true }).click();
    await expect(page.getByRole('heading', { name: skill.title, exact: true })).toBeVisible();
    await expect(page.getByText('Planned learning track — interactive scenes and exercises are not available yet.')).toBeVisible();
    await expect(page.getByText('AI review is not proof of correctness.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: /compile|run|verify|rewrite/i })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: skill.title, exact: true })).toBeVisible();
  }
  const nav = await primary(page);
  await expect(nav.getByRole('link', { name: 'Studio', exact: true })).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
  test(`skill layout and contrast in ${theme}, including 320px and reduced motion`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page);
    await page.getByRole('radio', { name: `${theme === 'light' ? 'Light' : 'Dark'} theme` }).click();
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const nav = await primary(page);
      await nav.getByRole('link', { name: 'Advanced Java — Spring Boot & JPA', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Advanced Java — Spring Boot & JPA', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    }
    const scan = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    expect(scan.violations).toEqual([]);
    await page.screenshot({ path: path.join(process.env.LEARN_EVIDENCE_DIR ?? 'acceptance-tests/skill-phase-01', 'screenshots', `${info.project.name}-skill-${theme}.png`), fullPage: true, scale: 'css' });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  });
}
