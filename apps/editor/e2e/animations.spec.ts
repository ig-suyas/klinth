import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

const preview = (page: Page) =>
  page
    .frameLocator('iframe[title="Preview of your site"]')
    .frameLocator('iframe[title="Your site"]');
const settings = (page: Page) => page.getByRole('complementary', { name: 'Settings' });
const animation = (page: Page) => settings(page).getByRole('region', { name: 'Animation' });

/** Selects a section by clicking it in the preview. */
async function select(page: Page, css: string, name: string) {
  // A click right after the preview redraws can be lost (see handoff), so retry it.
  await expect(async () => {
    await preview(page).locator(css).first().click();
    await expect(settings(page).getByRole('heading', { name, exact: true })).toBeVisible({
      timeout: 1500,
    });
  }).toPass({ timeout: 20_000 });
}

async function choose(page: Page, part: string, preset: RegExp) {
  await animation(page).getByLabel('What moves').selectOption({ label: part });
  await animation(page).getByRole('radiogroup', { name: 'Animation' }).getByText(preset).click();
}

test('apply three animations, try them in the preview and export', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();

  // 1. The intro heading appears word by word.
  await select(page, 'section.block-hero h1', 'Big intro');
  await choose(page, 'Heading', /^Word by word/);
  await animation(page).getByText('Slow', { exact: true }).click();
  const h1 = preview(page).locator('h1');
  await expect(h1).toHaveAttribute('data-k-split', '');
  const label = await h1.getAttribute('aria-label');
  expect(label).toBeTruthy();
  await expect(h1.locator('.k-w').first()).toHaveAttribute('aria-hidden', 'true');

  // The split heading can still be edited in place and saves the text once.
  await h1.click();
  await expect(h1).toHaveAttribute('contenteditable', 'plaintext-only');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Hello moving words');
  await page.keyboard.press('Enter');
  await expect(preview(page).locator('h1')).toHaveAttribute('aria-label', 'Hello moving words');

  // 2. Project cards lift on hover (no timing to set).
  await select(page, 'section.block-projects h2', 'Work and projects');
  await choose(page, 'Cards', /^Lift on hover/);
  await expect(animation(page).getByLabel(/Wait before it starts/)).toHaveCount(0);

  // 3. The quotes section slides up every time it comes into view, after a short wait.
  await select(page, 'section.block-testimonials h2', 'Kind words');
  await choose(page, 'Whole section', /^Slide up/);
  await animation(page)
    .getByLabel(/Wait before it starts/)
    .fill('0.3');
  await animation(page).getByText('Every time it comes into view').click();
  const quotes = preview(page).locator('section.block-testimonials');
  await expect(quotes).toHaveAttribute('data-anim-section', 'slideUp');
  await expect(quotes).toHaveAttribute('data-k-again', 'section');

  // Preview animations replays: the section scrolls into view and ends shown.
  await animation(page).getByRole('button', { name: 'Preview animations' }).click();
  // The preview frame is replaced by the redraw; retry until the new one has scrolled.
  await expect(async () => {
    await quotes.scrollIntoViewIfNeeded({ timeout: 1000 });
    await expect(quotes).toHaveClass(/k-in-section/, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(quotes.locator('> .wrap')).toHaveCSS('opacity', '1');

  // Export.
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download website/ }).click(),
  ]);
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  const read = (path: string) => strFromU8(files[path] ?? new Uint8Array());
  const html = read('index.html');
  expect(html).toContain('<link rel="stylesheet" href="css/anim.css">');
  expect(html).toContain('<script src="js/anim.js" defer></script>');
  expect(read('css/anim.css')).toContain('prefers-reduced-motion:no-preference');
  expect(read('js/anim.js')).toContain('IntersectionObserver');
  expect(html).toMatch(
    /<h1 class="display" data-k-split aria-label="Hello moving words" style="--n:3">/,
  );
  expect(html).toContain('data-anim-heading="words"');
  expect(html).toContain('--k-heading-dur:1.1s');
  expect(html).toContain('data-anim-cards="lift"');
  expect(html).toMatch(
    /data-anim-section="slideUp"[^>]*data-k-again="section"[^>]*--k-section-delay:300ms/,
  );
  expect(html).not.toContain('data-k-section');
  const saved = JSON.parse(read('.klinth/project.json')) as {
    schemaVersion: number;
    pages: { sections: { type: string; animation?: unknown }[] }[];
  };
  expect(saved.schemaVersion).toBe(9);
  const byType = (type: string) => saved.pages[0]?.sections.find((s) => s.type === type);
  expect(byType('hero')?.animation).toEqual({ heading: { preset: 'words', speed: 'slow' } });
  expect(byType('projects')?.animation).toEqual({ cards: { preset: 'lift' } });
  expect(byType('testimonials')?.animation).toEqual({
    section: { preset: 'slideUp', delay: 300, repeat: 'always' },
  });
});

test('visitors who ask for less motion see every animated part straight away', async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await select(page, 'section.block-testimonials h2', 'Kind words');
  await choose(page, 'Whole section', /^Fade in/);
  const quotes = preview(page).locator('section.block-testimonials');
  await expect(quotes).toHaveAttribute('data-anim-section', 'fade');
  await animation(page).getByRole('button', { name: 'Preview animations' }).click();
  await expect(async () => {
    await quotes.scrollIntoViewIfNeeded({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  // No waiting state and nothing hidden or moving.
  await expect(quotes).not.toHaveClass(/k-wait-/);
  await expect(quotes.locator('> .wrap')).toHaveCSS('opacity', '1');
  await expect(quotes.locator('> .wrap')).toHaveCSS('animation-name', 'none');
  await context.close();
});
