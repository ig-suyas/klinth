import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

test('start blank, add a section and a second page, then export', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Start blank/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();

  // One empty page.
  const pages = page.getByRole('navigation', { name: 'Pages' });
  await expect(pages.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByText('This page is empty.')).toBeVisible();

  // Add a section.
  await page.getByRole('button', { name: 'Add a section' }).click();
  await page
    .getByRole('dialog', { name: 'Add a section' })
    .getByRole('button', { name: /^Big intro/ })
    .click();
  await expect(
    page.getByRole('navigation', { name: 'Sections' }).getByRole('listitem'),
  ).toHaveCount(1);

  // Add a second page: it opens straight away and is empty.
  await pages.getByRole('button', { name: 'Add a page' }).click();
  await pages.getByLabel('New page name').fill('About Me');
  await pages.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(pages.getByRole('listitem')).toHaveCount(2);
  await expect(pages.getByRole('button', { name: /^About Me/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(pages.getByText('about-me.html')).toBeVisible();
  await expect(page.getByText('This page is empty.')).toBeVisible();

  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download website/ }).click(),
  ]);
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  const index = strFromU8(files['index.html'] ?? new Uint8Array());
  const about = strFromU8(files['about-me.html'] ?? new Uint8Array());
  expect(index).toContain('class="block block-hero');
  // The shared menu links both pages.
  expect(index).toContain('href="about-me.html"');
  expect(about).toContain('href="index.html"');
  expect(about).toContain('aria-current="page"');
});
