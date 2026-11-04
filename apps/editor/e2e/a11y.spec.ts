import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Serious and critical accessibility problems, with where they are. */
async function problems(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

// Entrance animations fade content in; check the settled page, as people see it.
test.beforeEach(({ page }) => page.emulateMedia({ reducedMotion: 'reduce' }));

test('the start screen has no serious accessibility problems', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Make a website you are proud of.' }),
  ).toBeVisible();
  await page.waitForTimeout(800);
  expect(await problems(page)).toEqual([]);
});

for (const template of ['Personal portfolio', 'Small business']) {
  test(`the editor with the ${template} template has no serious accessibility problems`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: new RegExp(template) }).click();
    await page.getByRole('button', { name: 'Skip tour' }).click();
    await expect(
      page
        .frameLocator('iframe[title="Preview of your site"]')
        .frameLocator('iframe[title="Your site"]')
        .locator('h1'),
    ).toBeVisible();
    await page.waitForTimeout(800);
    expect(await problems(page)).toEqual([]);
  });
}

test('the privacy and terms pages are linked, readable and accessible', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Privacy' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  expect(await problems(page)).toEqual([]);
  await page.getByRole('link', { name: 'Terms' }).click();
  await expect(page.getByRole('heading', { name: 'Terms', level: 1 })).toBeVisible();
  expect(await problems(page)).toEqual([]);
});
