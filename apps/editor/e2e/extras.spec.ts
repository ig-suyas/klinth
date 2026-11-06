import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

const SITE = 'http://exported-site.test';
const TYPES: Record<string, string> = {
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  svg: 'image/svg+xml',
  woff2: 'font/woff2',
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

test('three extras on a second page made from Blank: build, preview, export, use', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Start blank/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  const preview = page.frameLocator('iframe[title="Preview of your site"]').frameLocator('iframe');
  const settings = page.getByRole('complementary', { name: 'Settings' });
  const menu = page.getByRole('dialog', { name: 'Add a section' });
  const addSection = async (name: RegExp) => {
    await page.getByRole('button', { name: 'Add a section' }).click();
    await menu.getByRole('button', { name }).click();
  };

  // A second page; everything below goes on it.
  const pages = page.getByRole('navigation', { name: 'Pages' });
  await pages.getByRole('button', { name: 'Add a page' }).click();
  await pages.getByLabel('New page name').fill('Extras');
  await pages.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(pages.getByRole('button', { name: /^Extras/ })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // Every new entry is in the list, explained in plain words.
  await page.getByRole('button', { name: 'Add a section' }).click();
  for (const [name, words] of [
    [/^Rotating headline/, 'one word keeps changing'],
    [/^Picture stack/, 'slight tilt'],
    [/^Numbered steps/, 'frosted glass'],
    [/^Moving quotes/, 'two stars'],
    [/^Expandable section/, 'opens and closes'],
    [/^Decorative shapes/, 'spin, float or pulse'],
    [/^Giant text/, 'huge letters'],
  ] as const) {
    await expect(menu.getByRole('button', { name })).toContainText(words);
  }
  await page.keyboard.press('Escape');

  // 1. Rotating headline (typewriter), with a decorative shape added from its settings.
  await addSection(/^Rotating headline/);
  await expect(settings.getByRole('heading', { name: 'Rotating headline' })).toBeVisible();
  await settings
    .getByRole('group', { name: 'How the word changes' })
    .getByText('Typewriter')
    .click();
  await settings.getByRole('button', { name: 'Add a shape' }).click();
  const rot = preview.locator('[data-rotator]');
  await expect(rot).toHaveClass(/rot-typewriter/);
  await expect(rot.locator('.rot-title')).toHaveAttribute(
    'aria-label',
    'We design websites, shops, brands',
  );
  await expect(preview.locator('.shp-layer svg')).toHaveCount(1);

  // 2. Expandable section.
  await addSection(/^Expandable section/);
  await expect(preview.locator('[data-fold] .xp-btn')).toHaveAttribute('aria-expanded', 'false');

  // 3. Moving quotes on glass cards.
  await addSection(/^Moving quotes/);
  await settings.getByRole('group', { name: 'Card style' }).getByText('Frosted glass').click();
  await expect(preview.locator('section.block-marquee')).toHaveClass(/cs-glass/);
  await expect(preview.locator('[data-marquee]')).toHaveClass(/is-moving/);

  // Export.
  const files = await exportZip(page);
  const read = (path: string) => strFromU8(files[path] ?? new Uint8Array());
  const html = read('extras.html');
  expect(html).toContain('<link rel="stylesheet" href="css/extras.css">');
  expect(html).toContain('<script src="js/extras.js" defer></script>');
  expect(html).toContain('data-rotator');
  expect(html).toContain('<div class="shp-layer" aria-hidden="true">');
  expect(html).toMatch(/class="xp-btn" id="[A-Za-z0-9_-]+-xp" aria-expanded="false"/);
  expect(html).toContain('<noscript><style>');
  expect(html).toContain('<mark class="hl">honest</mark>');
  expect(html).toMatch(/class="block block-marquee cs-glass/);
  expect(html).not.toContain('data-k-');
  // The home page uses none of it.
  expect(read('index.html')).not.toContain('css/extras.css');
  expect(read('index.html')).not.toContain('js/extras.js');
  expect(read('css/extras.css')).toContain('.xp-panel{');
  expect(read('js/extras.js')).toContain('[data-marquee]');
  expect(JSON.parse(read('.klinth/project.json')).schemaVersion).toBe(10);

  // The exported page on its own.
  const context = page.context();
  await context.route(`${SITE}/**`, (route) => {
    const path = new URL(route.request().url()).pathname.slice(1) || 'index.html';
    const body = files[path];
    if (!body) return route.fulfill({ status: 404, body: 'missing' });
    const type = TYPES[path.split('.').pop() ?? ''] ?? 'application/octet-stream';
    return route.fulfill({ status: 200, body: Buffer.from(body), contentType: type });
  });
  const site = await context.newPage();
  await site.setViewportSize({ width: 1280, height: 800 });
  await site.goto(`${SITE}/extras.html`);

  // No layout shift while it loads and the word changes (shifts right after input do not count).
  const shifts = await site.evaluate(
    () =>
      new Promise<{ total: number; nodes: string[] }>((done) => {
        let total = 0;
        const nodes: string[] = [];
        new PerformanceObserver((list) => {
          type Shift = { value: number; hadRecentInput: boolean; sources?: { node?: Node }[] };
          for (const e of list.getEntries() as unknown as Shift[]) {
            if (e.hadRecentInput) continue;
            total += e.value;
            for (const s of e.sources ?? [])
              nodes.push((s.node as Element | undefined)?.className?.toString() ?? '?');
          }
        }).observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => done({ total, nodes }), 3500);
      }),
  );
  expect(shifts.total, shifts.nodes.join(' | ')).toBeLessThan(0.02);

  // Keyboard on the expandable section: Enter opens, Space closes, focus stays on the button.
  const btn = site.locator('.xp-btn');
  const panel = site.locator('.xp-panel');
  await expect(panel).toHaveAttribute('inert', '');
  await btn.focus();
  await site.keyboard.press('Enter');
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).not.toHaveAttribute('inert', '');
  await expect(panel.getByText('Write the details here')).toBeVisible();
  await site.keyboard.press('Space');
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await expect(btn).toBeFocused();
  await expect(panel.getByText('Write the details here')).toBeHidden();

  // The word changes, the marquee moves and pauses.
  await expect(site.locator('.rot-w.is-on')).not.toHaveText('websites', { timeout: 6000 });
  const marquee = site.locator('[data-marquee]');
  await expect(marquee).toHaveClass(/is-moving/);
  await marquee.getByRole('button', { name: 'Pause' }).click();
  await expect(marquee).toHaveClass(/is-paused/);
  await expect(marquee.getByRole('button', { name: 'Play' })).toBeVisible();

  // Nothing sideways at desktop and phone widths.
  expect(await site.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await site.setViewportSize({ width: 375, height: 740 });
  expect(await site.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await site.close();

  // Reduced motion: the first word stays, the marquee is a scroll-snap row, folding still works.
  const calm = await context.newPage();
  await calm.emulateMedia({ reducedMotion: 'reduce' });
  await calm.goto(`${SITE}/extras.html`);
  await calm.waitForTimeout(3000);
  await expect(calm.locator('.rot-w.is-on')).toHaveText('websites');
  await expect(calm.locator('[data-marquee]')).not.toHaveClass(/is-moving/);
  expect(
    await calm.locator('.mq-view').evaluate((el) => getComputedStyle(el).scrollSnapType),
  ).toContain('mandatory');
  await calm.locator('.xp-btn').click();
  await expect(calm.locator('.xp-btn')).toHaveAttribute('aria-expanded', 'true');
  await calm.close();
});
