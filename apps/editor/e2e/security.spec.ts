import { expect, test } from '@playwright/test';

const preview = (page: import('@playwright/test').Page) =>
  page
    .frameLocator('iframe[title="Preview of your site"]')
    .frameLocator('iframe[title="Your site"]');

test('the editor ships strict security headers and the preview has its own policy', async ({
  request,
}) => {
  const editor = await request.get('/');
  const csp = editor.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("script-src 'self';");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(editor.headers()['x-frame-options']).toBe('DENY');
  expect(editor.headers()['x-content-type-options']).toBe('nosniff');

  const host = await request.get('/preview.html');
  expect(host.headers()['content-security-policy']).toContain("frame-ancestors 'self'");
  expect(host.headers()['x-frame-options']).toBe('SAMEORIGIN');
});

test('nothing in the editor or the preview breaks the security policy', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await expect(preview(page).locator('h1')).toBeVisible();
  // The site's own script runs in the preview (its scroll reveal marks elements).
  await expect(preview(page).locator('.reveal, .reveal-mask').first()).toBeAttached();

  // Injected inline scripts cannot run in the editor.
  const ran = await page.evaluate(async () => {
    const script = document.createElement('script');
    script.textContent = 'document.body.dataset.injected = "1"';
    document.body.append(script);
    await new Promise((resolve) => setTimeout(resolve, 100));
    return document.body.dataset.injected === '1';
  });
  expect(ran).toBe(false);
  // That blocked script reports one violation; anything else is a real problem.
  expect(violations.filter((v) => !/inline script/i.test(v))).toEqual([]);
  expect(violations.length).toBe(1);
});
