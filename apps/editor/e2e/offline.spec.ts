import { expect, test } from '@playwright/test';

test('going offline shows a calm note and editing keeps saving', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  const status = page.locator('[data-save-status]');
  await expect(status).toHaveAttribute('data-save-status', 'saved');

  await context.setOffline(true);
  await expect(page.getByText('You are offline.')).toBeVisible();
  await page
    .frameLocator('iframe[title="Preview of your site"]')
    .frameLocator('iframe[title="Your site"]')
    .locator('h1')
    .click();
  await page
    .getByRole('complementary', { name: 'Settings' })
    .getByLabel('Heading', { exact: true })
    .fill('Written on a train');
  await expect(status).toHaveAttribute('data-save-status', 'saved');

  await context.setOffline(false);
  await expect(page.getByText('You are offline.')).toHaveCount(0);
  await page.reload();
  await expect(
    page
      .frameLocator('iframe[title="Preview of your site"]')
      .frameLocator('iframe[title="Your site"]')
      .locator('h1'),
  ).toHaveText('Written on a train');
});
