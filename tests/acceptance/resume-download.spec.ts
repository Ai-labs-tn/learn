import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

const snapshot = JSON.parse(fs.readFileSync(new URL('../../src/portfolio/profile.snapshot.json', import.meta.url), 'utf8'));

const withPhone = (phone?: string) => ({
  ...snapshot,
  version: snapshot.version + 1,
  updatedAt: '2099-01-01T00:00:00.000Z',
  profile: { ...snapshot.profile, contact: { email: snapshot.profile.contact.email, linkedin: snapshot.profile.contact.linkedin, ...(phone ? { phone } : {}) } },
});
async function openPortfolio(page: Page, phone?: string) {
  // The hero drifts continuously on touch devices; reduced motion keeps controls still for stable clicks.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/profile', route => route.fulfill({ json: withPhone(phone) }));
  await page.goto('/#/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test('download resume is offered in the hero and the contact section, with both formats', async ({ page }) => {
  await openPortfolio(page);
  const buttons = page.getByRole('button', { name: 'Download resume' });
  await expect(buttons).toHaveCount(2);
  await buttons.first().click();
  await expect(buttons.first()).toHaveAttribute('aria-expanded', 'true');
  const group = page.getByRole('group', { name: 'Resume format' });
  await expect(group.getByRole('button')).toHaveText(['Word document (.docx)', 'PDF document (.pdf)']);
  await page.keyboard.press('Escape');
  await expect(group).toHaveCount(0);
  await expect(buttons.first()).toBeFocused();
  await page.getByRole('button', { name: 'Download resume' }).last().scrollIntoViewIfNeeded();
  await buttons.last().click();
  await expect(page.getByRole('group', { name: 'Resume format' })).toBeVisible();
});

test('PDF and Word downloads are real files with the right names', async ({ page }) => {
  await openPortfolio(page, '+91 98765 43210');
  const files: Record<string, Buffer> = {};
  for (const [label, extension, magic] of [['PDF document (.pdf)', 'pdf', '%PDF'], ['Word document (.docx)', 'docx', 'PK']] as const) {
    await page.getByRole('button', { name: 'Download resume' }).first().click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label }).click()]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`^[A-Za-z0-9_-]+_Resume\\.${extension}$`));
    const path = await download.path();
    files[extension] = fs.readFileSync(path);
    expect(files[extension].subarray(0, magic.length).toString('latin1')).toBe(magic);
    expect(files[extension].length).toBeGreaterThan(5_000);
    await expect(page.locator('[data-resume-status]').first()).toContainText(new RegExp(`Downloaded .*\\.${extension}`));
  }
  expect(files.pdf.toString('latin1')).toContain('%%EOF');
});

test('a failing generator is reported without breaking the page', async ({ page }) => {
  await page.addInitScript(() => { URL.createObjectURL = () => { throw new Error('storage blocked'); }; });
  await openPortfolio(page);
  await page.getByRole('button', { name: 'Download resume' }).first().click();
  await page.getByRole('button', { name: 'PDF document (.pdf)' }).click();
  await expect(page.getByRole('alert')).toContainText('could not be created');
  await expect(page.getByRole('button', { name: 'Download resume' }).first()).toBeEnabled();
});

test('phone number appears in the contact section only when the profile publishes it', async ({ page }) => {
  await openPortfolio(page, '+91 98765 43210');
  const phone = page.getByRole('link', { name: /Phone:/ });
  await expect(phone).toHaveAttribute('href', 'tel:+919876543210');
  await expect(phone).toContainText('+91 98765 43210');
  await page.unroute('**/api/profile');
  await openPortfolio(page);
  await page.reload();
  await expect(page.getByRole('link', { name: /Phone:/ })).toHaveCount(0);
});
