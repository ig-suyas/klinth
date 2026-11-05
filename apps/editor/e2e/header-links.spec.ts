import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';

const SITE = 'http://exported-site.test';
const TYPES: Record<string, string> = {
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  svg: 'image/svg+xml',
  woff2: 'font/woff2',
  json: 'application/json',
};

async function exportZip(page: Page): Promise<Record<string, Uint8Array>> {
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download website/ }).click(),
  ]);
  return unzipSync(new Uint8Array(await readFile(await download.path())));
}

const text = (files: Record<string, Uint8Array>, path: string) =>
  new TextDecoder().decode(files[path] ?? new Uint8Array());

test('header links work in the preview and the export, then the header is removed', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Start blank/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  const editorUrl = page.url();
  const preview = page.frameLocator('iframe[title="Preview of your site"]').frameLocator('iframe');

  for (const block of [/^Big intro/, /^Work and projects/, /^Contact/]) {
    await page.getByRole('button', { name: 'Add a section' }).click();
    await page
      .getByRole('dialog', { name: 'Add a section' })
      .getByRole('button', { name: block })
      .click();
  }
  const pages = page.getByRole('navigation', { name: 'Pages' });
  await pages.getByRole('button', { name: 'Add a page' }).click();
  await pages.getByLabel('New page name').fill('About Me');
  await pages.getByRole('button', { name: 'Add', exact: true }).click();
  await pages.getByRole('button', { name: /^Home/ }).click();

  // Pick links from lists: the two pages (automatic), then two sections.
  await page.getByRole('tab', { name: 'Site style' }).click();
  const header = page.getByRole('region', { name: 'Header' });
  const links = header.getByRole('group', { name: 'Header links' });
  await links.getByRole('button', { name: 'Choose links myself' }).click();
  await links.getByLabel('Add a link to').selectOption({ label: 'Selected work' });
  await links.getByLabel('Add a link to').selectOption({ label: 'Say hello' });
  const nav = preview.locator('header .nav-links');
  await expect(nav.getByRole('link')).toHaveText([
    'Home',
    'About Me',
    'Selected work',
    'Say hello',
  ]);
  await expect(nav.getByRole('link', { name: 'Say hello' })).toHaveAttribute('href', '#say-hello');
  await expect(preview.locator('section#say-hello')).toHaveCount(1);

  // In the preview a header link never leaves the editor: it scrolls or switches page.
  await nav.getByRole('link', { name: 'Say hello' }).click();
  await expect
    .poll(() => preview.locator('html').evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  expect(page.url()).toBe(editorUrl);
  await nav.getByRole('link', { name: 'About Me' }).click();
  await expect(pages.getByRole('button', { name: /^About Me/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(page.url()).toBe(editorUrl);
  await pages.getByRole('button', { name: /^Home/ }).click();

  // The export: every header link works, ids match and section links update the hash.
  const files = await exportZip(page);
  const context = page.context();
  await context.route(`${SITE}/**`, (route) => {
    const path = new URL(route.request().url()).pathname.slice(1) || 'index.html';
    const body = files[path];
    if (!body) return route.fulfill({ status: 404, body: 'missing' });
    const type = TYPES[path.split('.').pop() ?? ''] ?? 'application/octet-stream';
    return route.fulfill({ status: 200, body: Buffer.from(body), contentType: type });
  });
  const site = await context.newPage();
  await site.emulateMedia({ reducedMotion: 'reduce' });
  await site.setViewportSize({ width: 1280, height: 600 });
  await site.goto(`${SITE}/index.html`);
  const siteNav = site.locator('header .nav-links');
  for (const [name, anchor] of [
    ['Selected work', 'selected-work'],
    ['Say hello', 'say-hello'],
  ] as const) {
    await siteNav.getByRole('link', { name }).click();
    await expect(site).toHaveURL(`${SITE}/index.html#${anchor}`);
    const section = site.locator(`section#${anchor}`);
    await expect(section).toBeInViewport();
    // Not hidden under the sticky header.
    const headerBottom = await site
      .locator('header.site-header')
      .evaluate((el) => el.getBoundingClientRect().bottom);
    const top = await section.evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(headerBottom - 1);
  }
  await siteNav.getByRole('link', { name: 'About Me' }).click();
  await expect(site).toHaveURL(`${SITE}/about-me.html`);
  await expect(site.locator('header .nav-links [aria-current="page"]')).toHaveText('About Me');
  await site.locator('header .nav-links').getByRole('link', { name: 'Home' }).click();
  await expect(site).toHaveURL(`${SITE}/index.html`);

  // Remove the header from the preview toolbar; Undo brings it back.
  await preview.locator('header.site-header').click({ position: { x: 4, y: 4 } });
  const remove = preview.getByRole('button', { name: 'Remove header' });
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(preview.locator('header')).toHaveCount(0);
  const notice = page.getByText(/^Header removed\./);
  await expect(notice).toContainText("visitors can't move between your pages");
  await page.locator('[aria-live="polite"]').getByRole('button', { name: 'Undo' }).click();
  await expect(preview.locator('header.site-header')).toHaveCount(1);
  await expect(preview.locator('header .nav-links').getByRole('link')).toHaveCount(4);

  await preview.locator('header.site-header').click({ position: { x: 4, y: 4 } });
  await preview.getByRole('button', { name: 'Remove header' }).click();
  await expect(preview.locator('header')).toHaveCount(0);
  await expect(header.getByRole('button', { name: 'Add header back' })).toBeVisible();

  const after = await exportZip(page);
  for (const path of ['index.html', 'about-me.html']) {
    expect(text(after, path)).not.toMatch(/<header|site-header|header\.css|header\.js/);
  }
  expect(Object.keys(after)).not.toContain('css/header.css');
  expect(text(after, 'css/site.css')).not.toMatch(/site-header|scroll-padding/);
  expect(text(after, 'js/site.js')).not.toContain('.menu');
  // Section links elsewhere still work, with no offset.
  expect(text(after, 'index.html')).toContain('<section id="say-hello"');
  const saved = JSON.parse(text(after, '.klinth/project.json')) as {
    schemaVersion: number;
    meta: { headerEnabled: boolean };
  };
  expect(saved.schemaVersion).toBe(6);
  expect(saved.meta.headerEnabled).toBe(false);
  await site.close();
});
