import { expect, test, type Browser, type Page } from '@playwright/test';
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

const settings = (page: Page) => page.getByRole('complementary', { name: 'Settings' });
const animation = (page: Page) => settings(page).getByRole('region', { name: 'Animation' });

async function choose(page: Page, part: string, preset: RegExp) {
  await animation(page).getByLabel('What moves').selectOption({ label: part });
  await animation(page).getByRole('radiogroup', { name: 'Animation' }).getByText(preset).click();
}

/** Opens the exported files as a real site in a new context. */
async function openSite(
  browser: Browser,
  files: Record<string, Uint8Array>,
  options: Parameters<Browser['newContext']>[0] = {},
) {
  const context = await browser.newContext(options);
  await context.route(`${SITE}/**`, (route) => {
    const path = new URL(route.request().url()).pathname.slice(1) || 'index.html';
    const body = files[path];
    if (!body) return route.fulfill({ status: 404, body: 'missing' });
    const type = TYPES[path.split('.').pop() ?? ''] ?? 'application/octet-stream';
    return route.fulfill({ status: 200, body: Buffer.from(body), contentType: type });
  });
  const site = await context.newPage();
  await site.goto(`${SITE}/motion.html`);
  return { context, site };
}

test('three new animations on a second page made from Blank, then export', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Start blank/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  const preview = page.frameLocator('iframe[title="Preview of your site"]').frameLocator('iframe');
  const menu = page.getByRole('dialog', { name: 'Add a section' });
  const addSection = async (name: RegExp, heading: string) => {
    await page.getByRole('button', { name: 'Add a section' }).click();
    await menu.getByRole('button', { name }).click();
    await expect(settings(page).getByRole('heading', { name: heading, exact: true })).toBeVisible();
  };

  const pages = page.getByRole('navigation', { name: 'Pages' });
  await pages.getByRole('button', { name: 'Add a page' }).click();
  await pages.getByLabel('New page name').fill('Motion');
  await pages.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(pages.getByRole('button', { name: /^Motion/ })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // 1. Moving gradient behind the intro: speed, but no wait or repeat.
  await addSection(/^Big intro/, 'Big intro');
  await choose(page, 'Background', /^Moving gradient/);
  await animation(page).getByText('Fast', { exact: true }).click();
  await expect(animation(page).getByLabel(/Wait before it starts/)).toHaveCount(0);
  await expect(preview.locator('section.block-hero')).toHaveAttribute(
    'data-anim-background',
    'gradient',
  );

  // 2. A section transition that plays every time.
  await addSection(/^Text and picture/, 'Text and picture');
  await choose(page, 'Whole section', /^Rise into place/);
  await animation(page).getByText('Every time it comes into view').click();
  await expect(preview.locator('section.block-textImage')).toHaveAttribute(
    'data-anim-section',
    'rise',
  );

  // 3. A heading revealed letter by letter, keeping its text for screen readers.
  await addSection(/^About/, 'About');
  await choose(page, 'Heading', /^Letter by letter/);
  const title = preview.locator('section.block-about [data-k-split]');
  await expect(title).toHaveAttribute('aria-label', /\S/);
  await expect(title.locator('.k-w').first()).toHaveAttribute('aria-hidden', 'true');
  await animation(page).getByRole('button', { name: 'Preview animations' }).click();

  // Export.
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download website/ }).click(),
  ]);
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  const read = (path: string) => strFromU8(files[path] ?? new Uint8Array());
  const html = read('motion.html');
  expect(html).toContain('<link rel="stylesheet" href="css/anim.css">');
  expect(html).toContain('<script src="js/anim.js" defer></script>');
  expect(html).toMatch(/data-anim-background="gradient"[^>]*--k-background-dur:10s/);
  expect(html).toMatch(/data-anim-section="rise"[^>]*data-k-again="section"/);
  expect(html).toContain('data-anim-heading="letters"');
  expect(html).not.toContain('data-k-section');
  expect(read('index.html')).not.toContain('anim.');
  expect(read('css/anim.css').length).toBeLessThan(18_000);
  expect(read('js/anim.js')).toContain('IntersectionObserver');
  const saved = JSON.parse(read('.klinth/project.json')) as {
    schemaVersion: number;
    pages: { sections: { type: string; animation?: unknown }[] }[];
  };
  expect(saved.schemaVersion).toBe(10);
  const motion = saved.pages[1]?.sections ?? [];
  expect(motion.find((s) => s.type === 'hero')?.animation).toEqual({
    background: { preset: 'gradient', speed: 'fast' },
  });
  expect(motion.find((s) => s.type === 'textImage')?.animation).toEqual({
    section: { preset: 'rise', repeat: 'always' },
  });

  // The exported page: plays, no layout shift, no sideways scroll on a phone.
  {
    const { context, site } = await openSite(browser, files, {
      viewport: { width: 375, height: 740 },
    });
    const shift = await site.evaluate(
      () =>
        new Promise<number>((done) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as unknown as {
              value: number;
              hadRecentInput: boolean;
            }[])
              if (!e.hadRecentInput) total += e.value;
          }).observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => done(total), 2000);
        }),
    );
    expect(shift).toBeLessThan(0.02);
    expect(
      await site.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);
    // The gradient stays still on small phones.
    expect(
      await site.evaluate(
        () =>
          getComputedStyle(document.querySelector('section.block-hero') as Element, '::before')
            .animationName,
      ),
    ).toBe('none');
    const rise = site.locator('section.block-textImage');
    await rise.scrollIntoViewIfNeeded();
    await expect(rise).toHaveClass(/k-in-section/);
    await expect(rise.locator('> .wrap')).toHaveCSS('opacity', '1', { timeout: 5000 });
    await context.close();
  }

  // On a desktop the gradient drifts.
  {
    const { context, site } = await openSite(browser, files, {
      viewport: { width: 1280, height: 800 },
    });
    expect(
      await site.evaluate(
        () =>
          getComputedStyle(document.querySelector('section.block-hero') as Element, '::before')
            .animationName,
      ),
    ).toBe('k-drift');
    await context.close();
  }

  // With JavaScript off, and with reduced motion, everything is shown and still.
  for (const options of [{ javaScriptEnabled: false }, { reducedMotion: 'reduce' as const }]) {
    const { context, site } = await openSite(browser, files, options);
    for (const css of ['section.block-hero', 'section.block-textImage', 'section.block-about']) {
      const section = site.locator(css);
      await section.scrollIntoViewIfNeeded();
      await expect(section.locator('> .wrap')).toHaveCSS('opacity', '1');
      await expect(section.locator('h1, h2').first()).toBeVisible();
    }
    if (options.reducedMotion) {
      await expect(site.locator('section.block-textImage > .wrap')).toHaveCSS(
        'animation-name',
        'none',
      );
      expect(
        await site.evaluate(
          () =>
            getComputedStyle(document.querySelector('section.block-hero') as Element, '::before')
              .animationName,
        ),
      ).toBe('none');
    }
    await context.close();
  }
});
