import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

test('floating transparent header with a button, checked in the preview and the export', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Start blank/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  const preview = page
    .frameLocator('iframe[title="Preview of your site"]')
    .frameLocator('iframe[title="Your site"]');

  await page.getByRole('button', { name: 'Add a section' }).click();
  await page
    .getByRole('dialog', { name: 'Add a section' })
    .getByRole('button', { name: /^Big intro/ })
    .click();

  await page.getByRole('tab', { name: 'Site style' }).click();
  const header = page.getByRole('region', { name: 'Header' });
  await header
    .getByRole('group', { name: 'Layout' })
    .getByText('Floating', { exact: true })
    .click();
  await header
    .getByRole('group', { name: 'Background' })
    .getByText('Transparent', { exact: true })
    .click();

  // The button refuses an unsafe link, then takes a safe one.
  const button = header.getByRole('group', { name: 'Button' });
  await button.getByLabel('Button text').fill('Book a call');
  await button.getByLabel('Goes to').fill('javascript:alert(1)');
  await expect(button.getByRole('alert')).toBeVisible();
  await button.getByLabel('Goes to').fill('https://example.com/book');
  await expect(button.getByRole('alert')).toHaveCount(0);

  const site = preview.locator('header.site-header');
  await expect(site).toHaveClass(/hdr-floating/);
  await expect(site).toHaveClass(/hdr-transparent/);
  await expect(site).toHaveClass(/is-top/);
  await expect(preview.locator('a.header-cta')).toHaveText('Book a call');
  await expect(preview.locator('a.header-cta')).toHaveAttribute('href', 'https://example.com/book');

  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download website/ }).click(),
  ]);
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  const read = (path: string) => strFromU8(files[path] ?? new Uint8Array());
  const html = read('index.html');
  expect(html).toMatch(
    /<header class="site-header header-bar hdr hdr-floating hdr-transparent hdr-sticky hdr-on-[a-z]+ is-top has-cta" id="top">/,
  );
  expect(html).toContain(
    '<a class="button header-cta" href="https://example.com/book">Book a call</a>',
  );
  expect(html).not.toContain('javascript:');
  const css = read('css/site.css');
  expect(css).toContain('--hdr-bg:');
  expect(css).toContain('.hdr-transparent+main>.block:first-child');
  expect(read('js/site.js')).toContain("classList.toggle('is-top'");
  const saved = JSON.parse(read('.klinth/project.json')) as {
    meta: { header: { layout: string; background: string; cta: { label: string; href: string } } };
  };
  expect(saved.meta.header.layout).toBe('floating');
  expect(saved.meta.header.background).toBe('transparent');
  expect(saved.meta.header.cta).toEqual({ label: 'Book a call', href: 'https://example.com/book' });
});
