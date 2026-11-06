import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

test('start blank, add a section and a page, pick a header and a look, add site-wide code, export', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Start blank/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  const preview = page
    .frameLocator('iframe[title="Preview of your site"]')
    .frameLocator('iframe[title="Your site"]');

  // Add a section.
  await page.getByRole('button', { name: 'Add a section' }).click();
  await page
    .getByRole('dialog', { name: 'Add a section' })
    .getByRole('button', { name: /^Big intro/ })
    .click();
  await expect(
    page.getByRole('navigation', { name: 'Sections' }).getByRole('listitem'),
  ).toHaveCount(1);

  // Add a second page, then go back home.
  const pages = page.getByRole('navigation', { name: 'Pages' });
  await pages.getByRole('button', { name: 'Add a page' }).click();
  await pages.getByLabel('New page name').fill('About Me');
  await pages.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(pages.getByRole('listitem')).toHaveCount(2);
  await pages.getByRole('button', { name: /^Home/ }).click();

  // Header style and a ready-made look.
  await page.getByRole('tab', { name: 'Site style' }).click();
  await page.getByRole('group', { name: 'Header style' }).getByText('Floating pill').click();
  await expect(preview.locator('header.site-header')).toHaveClass(/header-pill/);
  // Panel sections fold away; Header and Details start open.
  await page.locator('summary', { hasText: 'Ready-made looks' }).click();
  const looks = page.getByRole('group', { name: 'Ready-made looks' });
  await looks.getByRole('button', { name: /Midnight/ }).click();
  await expect(looks.getByRole('button', { name: /Midnight/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Site-wide code runs in the preview, inside the sandbox only.
  await page.locator('summary', { hasText: 'Custom code' }).click();
  const code = page.getByRole('region', { name: 'Custom code for every page' });
  await expect(code).toContainText(
    'This code runs on your published site. Only paste code you trust.',
  );
  await code.getByLabel(/Custom CSS/).fill('.brand { text-transform: uppercase; }');
  await code
    .getByLabel(/Custom JavaScript/)
    .fill(
      'document.body.dataset.reach = (function () { try { return String(!!window.top.document); } catch (e) { return "blocked"; } })();',
    );
  await expect(preview.locator('.brand')).toHaveCSS('text-transform', 'uppercase');
  await expect(preview.locator('body')).toHaveAttribute('data-reach', 'blocked');
  await expect(preview.locator('body')).toHaveCSS('background-color', 'rgb(13, 17, 23)');

  // Export: separate code files, linked from every page, with the header and look.
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download website/ }).click(),
  ]);
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  const read = (path: string) => strFromU8(files[path] ?? new Uint8Array());
  expect(read('css/custom.css')).toBe('.brand { text-transform: uppercase; }\n');
  expect(read('js/custom.js')).toContain('dataset.reach');
  for (const path of ['index.html', 'about-me.html']) {
    const html = read(path);
    expect(html).toContain('<link rel="stylesheet" href="css/custom.css">');
    expect(html).toContain('<script src="js/custom.js"></script>');
    expect(html).toContain('class="site-header header-pill"');
    expect(html).not.toContain('text-transform: uppercase');
  }
  expect(read('css/site.css')).toContain('--color-bg: #0d1117;');
  const saved = JSON.parse(read('.klinth/project.json')) as {
    schemaVersion: number;
    meta: { headerStyle: string };
    theme: { preset?: string };
    siteCode: { css: string };
  };
  expect(saved.schemaVersion).toBe(10);
  expect(saved.meta.headerStyle).toBe('pill');
  expect(saved.theme.preset).toBe('midnight');
  expect(saved.siteCode.css).toContain('uppercase');
});
