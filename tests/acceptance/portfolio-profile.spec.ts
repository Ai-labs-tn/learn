import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

const snapshot = JSON.parse(fs.readFileSync(new URL('../../src/portfolio/profile.snapshot.json', import.meta.url), 'utf8'));
const envelope = (contact: Record<string, string>, achievements: string[]) => ({
  ...snapshot, version: snapshot.version + 10, updatedAt: '2099-01-01T00:00:00.000Z',
  profile: {
    ...snapshot.profile,
    contact: { email: snapshot.profile.contact.email, linkedin: snapshot.profile.contact.linkedin, ...contact },
    experience: snapshot.profile.experience.map((job: Record<string, unknown>, index: number) => ({ ...job, achievements: index === 0 ? achievements : [] })),
  },
});
async function open(page: Page, body: unknown) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/profile', route => route.fulfill({ json: body }));
  await page.goto('/#/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test('website, phone and job achievements appear when the profile provides them', async ({ page }) => {
  await open(page, envelope({ phone: '+91 98765 43210', website: 'https://example.invalid/me' }, ['Cut deployment time from hours to minutes.', 'Led an 8-member team.']));
  const website = page.getByRole('link', { name: /^Website/ });
  await expect(website).toHaveAttribute('href', 'https://example.invalid/me');
  await expect(website).toHaveAttribute('rel', /noopener/);
  await expect(page.getByRole('link', { name: /Phone:/ })).toHaveAttribute('href', 'tel:+919876543210');
  await expect(page.getByText('Cut deployment time from hours to minutes.', { exact: true })).toBeVisible();
  await expect(page.getByText('Led an 8-member team.', { exact: true })).toBeVisible();
});

test('absent or unsafe optional fields render nothing', async ({ page }) => {
  await open(page, envelope({ website: 'javascript:alert(1)' }, []));
  await expect(page.getByRole('link', { name: /^Website/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Phone:/ })).toHaveCount(0);
  expect(await page.locator('ul[class*="achievements"]').count()).toBe(0);
});

test('bold markers render as bold keywords and the public address is shown', async ({ page }) => {
  const body = envelope({ address: '1 Example Street, Example city - 600001' }, ['Cut build time with **Gradle** and **Jib** caching.']);
  await open(page, body);
  const bullet = page.getByText('Cut build time with Gradle and Jib caching.', { exact: true });
  await expect(bullet).toBeVisible();
  await expect(bullet.locator('strong')).toHaveText(['Gradle', 'Jib']);
  await expect(page.getByText('**')).toHaveCount(0);
  await expect(page.getByText('1 Example Street, Example city - 600001')).toBeVisible();
});