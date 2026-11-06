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
const LINKS = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtu.be/aqz-KE-bpKQ',
  'https://vimeo.com/76979871',
];

async function exportZip(page: Page): Promise<Record<string, Uint8Array>> {
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download website/ }).click(),
  ]);
  return unzipSync(new Uint8Array(await readFile(await download.path())));
}

test('a video carousel and a blank canvas: build, try in the preview, export', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Start blank/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  const preview = page.frameLocator('iframe[title="Preview of your site"]').frameLocator('iframe');
  const settings = page.getByRole('complementary', { name: 'Settings' });
  const addSection = async (name: RegExp) => {
    await page.getByRole('button', { name: 'Add a section' }).click();
    await page.getByRole('dialog', { name: 'Add a section' }).getByRole('button', { name }).click();
  };

  // The list explains the two kinds of empty sections.
  await page.getByRole('button', { name: 'Add a section' }).click();
  const menu = page.getByRole('dialog', { name: 'Add a section' });
  await expect(menu.getByRole('button', { name: /Blank canvas/ })).toContainText(
    'place text, pictures, buttons and videos anywhere',
  );
  await expect(menu.getByRole('button', { name: /Empty space/ })).toContainText('24 to 320 px');
  await page.keyboard.press('Escape');

  // 1. Three vertical videos in a carousel.
  await addSection(/^Video/);
  await expect(settings.getByRole('heading', { name: 'Video', exact: true })).toBeVisible();
  await settings
    .getByLabel('Video link')
    .first()
    .fill(LINKS[0] ?? '');
  for (const link of LINKS.slice(1)) {
    await settings.getByRole('button', { name: 'Add a video' }).click();
    await settings.getByLabel('Video link').last().fill(link);
  }
  await settings.getByRole('group', { name: 'Show the videos as' }).getByText('Carousel').click();
  await settings.getByRole('group', { name: 'Shape' }).getByText('Vertical 9:16').click();
  await settings.getByRole('group', { name: 'Frame' }).getByText('Soft card').click();
  await settings.getByRole('group', { name: 'Play button' }).getByText('Minimal').click();

  const carousel = preview.locator('[data-carousel]');
  await expect(carousel).toHaveClass(/is-ready/);
  await expect(carousel.locator('.vc-slide')).toHaveCount(3);
  await expect(carousel.locator('.vc-slide').first()).toHaveClass(/is-active/);
  // Keyboard: the arrow keys move one slide; the neighbours show beside it, smaller.
  await carousel.locator('.vc-track').focus();
  await page.keyboard.press('ArrowRight');
  await expect(carousel.locator('.vc-slide').nth(1)).toHaveClass(/is-active/);
  const sides = await carousel.locator('.vc-slide').evaluateAll((slides) =>
    slides.map((s) => {
      const r = s.getBoundingClientRect();
      const track = (s.parentElement as HTMLElement).getBoundingClientRect();
      return { left: r.left - track.left, right: r.right - track.left, width: track.width };
    }),
  );
  const [first, middle] = sides;
  expect(middle && middle.left > 0 && middle.right < middle.width).toBe(true);
  expect(first && first.right > 0).toBe(true);
  await carousel.getByRole('button', { name: 'Next video' }).click();
  await expect(carousel.locator('.vc-slide').nth(2)).toHaveClass(/is-active/);
  await expect(carousel.getByRole('button', { name: 'Next video' })).toBeDisabled();
  await carousel.getByRole('button', { name: 'Show video 1' }).click();
  await expect(carousel.locator('.vc-slide').first()).toHaveClass(/is-active/);

  // 2. A blank canvas: free from the start, so no SEO warning, three-quarter height, gradient.
  await addSection(/Blank canvas/);
  await expect(settings.getByRole('heading', { name: 'Blank canvas' })).toBeVisible();
  await settings.getByRole('group', { name: 'Height' }).getByText('Three-quarter').click();
  await settings.getByRole('group', { name: 'Background' }).getByText('Gradient').click();
  await settings.getByRole('button', { name: 'Heading', exact: true }).click();
  await settings.getByRole('button', { name: 'Button', exact: true }).click();
  await expect(page.getByText('Free positioning can hurt your SEO')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Sections' })).toContainText('Free layout');

  const blank = preview.locator('section.block-canvas');
  await expect(blank.locator('[data-k-item]')).toHaveCount(2);
  const size = await blank.evaluate((el) => ({
    h: el.getBoundingClientRect().height,
    vh: window.innerHeight,
  }));
  expect(size.h).toBeGreaterThanOrEqual(size.vh * 0.75 - 1);

  // Free-layout editing works as in any free section: drag the heading, no question asked.
  const heading = blank.locator('.free-title');
  await heading.scrollIntoViewIfNeeded();
  const before = await heading.boundingBox();
  if (!before) throw new Error('heading not shown');
  await page.mouse.move(before.x + 8, before.y + 8);
  await page.mouse.down();
  await page.mouse.move(before.x + 88, before.y + 48, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByText('Free positioning can hurt your SEO')).toHaveCount(0);
  await expect
    .poll(async () => ((await heading.boundingBox())?.x ?? 0) - before.x)
    .toBeGreaterThan(40);
  await expect(settings.getByRole('button', { name: 'Return to optimized layout' })).toHaveCount(0);

  // 3. Export.
  const files = await exportZip(page);
  const read = (path: string) => strFromU8(files[path] ?? new Uint8Array());
  const html = read('index.html');
  expect(html).toContain('data-carousel role="region" aria-roledescription="carousel"');
  expect(html).toContain('vids-carousel vr-vertical vf-card vs-none pl-minimal has-ratio');
  expect(html.match(/class="vc-slide"/g)).toHaveLength(3);
  expect(html).toContain('<link rel="stylesheet" href="css/video.css">');
  expect(html).toContain('<script src="js/video.js" defer></script>');
  expect(html).toMatch(/class="block block-canvas block-free canvas-vh[^"]*"/);
  expect(html).toContain('<div class="wrap canvas-wrap" style="--ch:75;">');
  expect(html).toMatch(
    /<div class="canvas-fill fill-gradient" style="--c1r:\d+;--c1g:\d+;--c1b:\d+;--c2r:\d+;--c2g:\d+;--c2b:\d+;--ga:180;"/,
  );
  expect(html).toContain('free-title');
  expect(html).not.toContain('<iframe');
  expect(html).not.toContain('data-k-');
  expect(read('css/video.css')).toContain('.vr-vertical{--vr:9/16');
  expect(read('css/free.css')).toContain('.canvas-wrap{');
  expect(read('js/video.js')).toContain('data-carousel');
  expect(JSON.parse(read('.klinth/project.json')).schemaVersion).toBe(8);

  // The exported carousel works on its own, also with a swipe and with reduced motion.
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
  await site.setViewportSize({ width: 1280, height: 800 });
  await site.goto(`${SITE}/index.html`);
  const live = site.locator('[data-carousel]');
  await expect(live).toHaveClass(/is-ready/);
  const track = await live.locator('.vc-track').boundingBox();
  if (!track) throw new Error('no track');
  const y = track.y + track.height / 2;
  await site.mouse.move(track.x + track.width / 2 + 100, y);
  await site.mouse.down();
  await site.mouse.move(track.x + track.width / 2 - 60, y, { steps: 6 });
  await site.mouse.up();
  await expect(live.locator('.vc-slide').nth(1)).toHaveClass(/is-active/);
  await expect(site.locator('iframe')).toHaveCount(0);
  const overflow = await site.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  // Phones: one video at a time, nothing sideways.
  await site.setViewportSize({ width: 375, height: 740 });
  const phone = await live
    .locator('.vc-slide')
    .evaluateAll((slides) => slides.map((s) => Math.round(s.getBoundingClientRect().width)));
  const trackWidth = await live.locator('.vc-track').evaluate((t) => t.clientWidth);
  expect(phone.every((w) => w === trackWidth)).toBe(true);
  expect(await site.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await site.close();
});
