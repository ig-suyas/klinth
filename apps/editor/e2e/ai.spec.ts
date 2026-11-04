import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The AI helper end to end, with the Klinth Worker answered by Playwright
 * (no real Gemini key is ever used in tests).
 */

const KEY = 'AIzaSyTestKey_0123456789abcdefghijk';
const PASS = 'a calm morning';
const preview = (page: Page) => page.frameLocator('iframe[title="Preview of your site"]');
const panel = (page: Page) => page.getByRole('region', { name: 'AI helper' });

async function waitForSave(page: Page) {
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
}

test('add a key, ask AI to rewrite a section, unlock after reload, see the quota banner', async ({
  page,
}) => {
  const seen: { url: string; key: string | null; body: string }[] = [];
  let reply: (
    route: Route,
    body: { section: { id: string; type: string; props: object } },
  ) => Promise<void> = (route, body) =>
    route.fulfill({
      json: {
        section: {
          ...body.section,
          props: { ...body.section.props, heading: 'Quiet, careful websites' },
        },
      },
    });
  await page.route('http://localhost:8787/ai/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    seen.push({
      url: request.url(),
      key: request.headers()['x-gemini-key'] ?? null,
      body: request.postData() ?? '',
    });
    return reply(route, JSON.parse(request.postData() ?? '{}'));
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();

  // The sparkle button on a section opens the helper, which first asks for a key.
  await page.getByRole('button', { name: 'Ask AI about Big intro' }).click();
  await panel(page).getByLabel('Your Gemini key').fill(KEY);
  await panel(page).getByLabel('Passphrase', { exact: true }).fill(PASS);
  await panel(page).getByLabel('Passphrase again').fill(PASS);
  await panel(page).getByRole('button', { name: 'Save key' }).click();

  // Ask, and the preview follows.
  await panel(page).getByLabel('What do you want?').fill('Make the heading calmer');
  await panel(page).getByRole('button', { name: 'Ask AI' }).click();
  await expect(preview(page).locator('h1')).toHaveText('Quiet, careful websites');
  await expect(page.getByText('The AI updated this section.')).toBeVisible();

  // The key went only in the header; storage holds only the locked form.
  expect(seen).toHaveLength(1);
  expect(seen[0]?.key).toBe(KEY);
  expect(seen[0]?.url).not.toContain(KEY);
  expect(seen[0]?.body).not.toContain(KEY);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).toContain('klinth.vault.v1');
  expect(stored).not.toContain(KEY);
  expect(stored).not.toContain(PASS);

  // After a reload the key is locked; a wrong passphrase is refused.
  await waitForSave(page);
  await page.reload();
  await page.getByRole('button', { name: 'Ask AI about Big intro' }).click();
  await panel(page).getByLabel('Passphrase to unlock your key').fill('not the one');
  await panel(page).getByRole('button', { name: 'Unlock' }).click();
  await expect(panel(page).getByRole('alert')).toHaveText(
    'That passphrase is not right. Please try again.',
  );
  await panel(page).getByLabel('Passphrase to unlock your key').fill(PASS);
  await panel(page).getByRole('button', { name: 'Unlock' }).click();

  // A used-up Gemini quota shows the banner; editing by hand still works.
  reply = (route) =>
    route.fulfill({
      status: 429,
      json: { code: 'quota', error: 'Your Gemini limit is reached. Free-tier limits reset daily.' },
    });
  await panel(page).getByRole('button', { name: 'Make it shorter' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Free-tier limits reset daily.' }),
  ).toBeVisible();
  await page
    .getByRole('complementary', { name: 'Settings' })
    .getByLabel('Heading', { exact: true })
    .fill('By hand');
  await expect(preview(page).locator('h1')).toHaveText('By hand');

  // Forget the key from the AI helper window.
  await page
    .getByRole('button', { name: /AI helper/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'AI helper' });
  await dialog.getByRole('button', { name: 'Forget my key' }).click();
  await expect(dialog.getByLabel('Your Gemini key')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('klinth.vault.v1'))).toBeNull();
});
