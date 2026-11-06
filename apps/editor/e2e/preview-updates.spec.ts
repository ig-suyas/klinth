import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

const shell = (page: Page) => page.frameLocator('iframe[title="Preview of your site"]');
const preview = (page: Page) => shell(page).frameLocator('iframe[title="Your site"]');
const settings = (page: Page) => page.getByRole('complementary', { name: 'Settings' });

/** How many pages the preview shell has shown (each full redraw is one). */
const loads = (page: Page) =>
  shell(page)
    .locator('body')
    .evaluate((b) => Number(b.getAttribute('data-loads') ?? 0));
const scrollY = (page: Page) =>
  preview(page)
    .locator('html')
    .evaluate(() => window.scrollY);
const atBottom = (page: Page) =>
  preview(page)
    .locator('html')
    .evaluate(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      return window.scrollY;
    });

async function widePng(page: Page): Promise<Buffer> {
  const url = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1500;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no canvas');
    context.fillStyle = '#1d5f7a';
    context.fillRect(0, 0, 1200, 1500);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(url.split(',')[1] ?? '', 'base64');
}

/**
 * What the reader sees: the section at the middle of the preview window and how
 * far from the top it starts. Content added far above may change `scrollY`
 * (the browser keeps the view still), but this must not move.
 */
const inView = (page: Page) =>
  preview(page)
    .locator('html')
    .evaluate(() => {
      const el = document
        .elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
        ?.closest('[data-section-id], footer');
      const id = el?.getAttribute('data-section-id') ?? 'footer';
      const box = (el ?? document.body).getBoundingClientRect();
      return { id, top: box.top };
    });
const topOf = (page: Page, id: string) =>
  preview(page)
    .locator('html')
    .evaluate((_, key) => {
      const el =
        key === 'footer'
          ? document.querySelector('footer')
          : document.querySelector(`[data-section-id="${key}"]`);
      return el?.getBoundingClientRect().top ?? Number.NaN;
    }, id);

/** Runs `action`, waits for the preview to settle, and checks the reader did not move. */
async function staysPut(page: Page, action: () => Promise<void>, opts: { reload?: boolean } = {}) {
  const view = await inView(page);
  const y = await scrollY(page);
  const before = await loads(page);
  await action();
  await page.waitForTimeout(1200);
  const now = await topOf(page, view.id);
  expect(
    Math.abs(now - view.top),
    `${view.id} moved (scrollY ${y} -> ${await scrollY(page)})`,
  ).toBeLessThanOrEqual(2);
  if (!opts.reload) expect(await loads(page)).toBe(before);
}

test('the preview stays where the reader is: text, picture, item, colour; Back to top off', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await expect(preview(page).locator('h1')).toBeVisible();

  // A new project has "Back to top" off, in the preview too.
  await expect(preview(page).locator('footer .totop')).toHaveCount(0);

  // Select the intro first (at the top), then go to the bottom of the page.
  await expect(async () => {
    await preview(page).locator('section.block-hero h1').click();
    await expect(settings(page).getByRole('heading', { name: 'Big intro' })).toBeVisible({
      timeout: 1500,
    });
  }).toPass({ timeout: 20_000 });
  await page.waitForTimeout(500);
  const bottom = await atBottom(page);
  expect(bottom).toBeGreaterThan(400);
  await page.waitForTimeout(400);

  // 1. Change a picture (the intro's, far above).
  await staysPut(page, async () => {
    await settings(page).getByRole('button', { name: 'Choose a picture' }).click();
    const picker = page.getByRole('dialog', { name: 'Choose a picture' });
    await picker
      .getByLabel('Upload files')
      .setInputFiles({ name: 'tall.png', mimeType: 'image/png', buffer: await widePng(page) });
    await expect(picker).toHaveCount(0);
    await expect(preview(page).locator('.hero-media img')).toHaveAttribute('src', /^blob:/);
  });

  // 2. Edit text at the bottom: the caret stays put while typing, no reload.
  await preview(page).locator('section.block-contact h2').click();
  await expect(settings(page).getByRole('heading', { name: 'Contact' })).toBeVisible();
  const panel = settings(page).locator('.overflow-y-auto').first();
  const list = page
    .getByRole('navigation', { name: 'Sections' })
    .locator('.overflow-y-auto')
    .first();
  const heading = settings(page).getByLabel('Heading', { exact: true });
  await heading.click();
  // Both side panels scrolled somewhere (as far as they go), then kept there.
  await panel.evaluate((el) => (el.scrollTop = Math.min(120, el.scrollHeight)));
  await list.evaluate((el) => (el.scrollTop = 60));
  await heading.focus();
  const panelTop = await panel.evaluate((el) => el.scrollTop);
  const listTop = await list.evaluate((el) => el.scrollTop);
  await staysPut(page, async () => {
    await page.keyboard.press('End');
    await page.keyboard.type(' today', { delay: 40 });
    await page.waitForTimeout(700);
    await page.keyboard.type('!', { delay: 40 });
  });
  await expect(heading).toBeFocused();
  const caret = await heading.evaluate((el: HTMLInputElement | HTMLTextAreaElement) => ({
    at: el.selectionStart,
    length: el.value.length,
    value: el.value,
  }));
  expect(caret.value.endsWith(' today!')).toBe(true);
  expect(caret.at).toBe(caret.length);
  await expect(preview(page).locator('section.block-contact h2')).toContainText('today!');
  // The settings panel kept its own scroll.
  expect(Math.abs((await panel.evaluate((el) => el.scrollTop)) - panelTop)).toBeLessThanOrEqual(1);
  expect(Math.abs((await list.evaluate((el) => el.scrollTop)) - listTop)).toBeLessThanOrEqual(1);
  // Still selected after the update.
  await expect(preview(page).locator('section.block-contact')).toHaveClass(/k-selected/);

  // 3. Add an item to a section near the bottom.
  await preview(page).locator('section.block-testimonials figure').last().click();
  await expect(settings(page).getByRole('heading', { name: 'Kind words' })).toBeVisible();
  const quotes = await preview(page).locator('section.block-testimonials figure').count();
  await staysPut(page, async () => {
    await settings(page).getByRole('button', { name: 'Add a quote' }).click();
    await expect(preview(page).locator('section.block-testimonials figure')).toHaveCount(
      quotes + 1,
    );
  });

  // 4. Change a colour of the whole site: the styles change in place.
  await page.getByRole('tab', { name: 'Site style' }).click();
  const colors = page.locator('details', { has: page.locator('summary', { hasText: /^Colors$/ }) });
  if ((await colors.getAttribute('open')) === null) await colors.locator('summary').click();
  await staysPut(page, async () => {
    await page.getByLabel('Accent color picker', { exact: true }).fill('#7a1d5f');
    await expect
      .poll(() =>
        preview(page)
          .locator('html')
          .evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim(),
          ),
      )
      .toBe('#7a1d5f');
  });

  // Undo goes the same way.
  await staysPut(page, async () => {
    await page.getByRole('button', { name: 'Undo' }).click();
  });

  // A replaced section still animates: animation set (a full, replayed redraw), then edited.
  await preview(page).locator('section.block-contact h2').click();
  await expect(settings(page).getByRole('heading', { name: 'Contact' })).toBeVisible();
  const animation = settings(page).getByRole('region', { name: 'Animation' });
  await animation.getByLabel('What moves').selectOption({ label: 'Whole section' });
  await animation
    .getByRole('radiogroup', { name: 'Animation' })
    .getByText(/^Slide up/)
    .click();
  await expect(preview(page).locator('section.block-contact')).toHaveAttribute(
    'data-anim-section',
    'slideUp',
  );
  await page.waitForTimeout(800);
  await staysPut(page, async () => {
    await heading.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' again');
    await expect(preview(page).locator('section.block-contact h2')).toContainText('again');
  });
  const contact = preview(page).locator('section.block-contact');
  await expect(contact).toHaveAttribute('data-anim-section', 'slideUp');
  await expect(contact).toHaveClass(/k-in-section/);
  await expect(contact.locator('> .wrap')).toHaveCSS('opacity', '1');

  // "Back to top" from the footer's own settings: on, then off again (a full redraw that keeps
  // the place).
  await preview(page)
    .locator('footer .foot')
    .click({ position: { x: 4, y: 4 } });
  const footerPanel = settings(page).getByRole('region', { name: 'Back to top' });
  const toggle = footerPanel.getByRole('switch', { name: 'Show “Back to top”' });
  await expect(toggle).not.toBeChecked();
  await footerPanel.locator('label', { has: page.getByRole('switch') }).click();
  await expect(preview(page).locator('footer .totop')).toHaveCount(1);
  await page.waitForTimeout(600);
  await atBottom(page);
  await page.waitForTimeout(400);
  await staysPut(
    page,
    async () => {
      await footerPanel.locator('label', { has: page.getByRole('switch') }).click();
      await expect(preview(page).locator('footer .totop')).toHaveCount(0);
    },
    { reload: true },
  );

  // Export: no "Back to top", no preview markers.
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download website/ }).click(),
  ]);
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  const html = strFromU8(files['index.html'] ?? new Uint8Array());
  expect(html).toContain('today!');
  expect(html).not.toContain('Back to top');
  expect(html).not.toContain('data-section-id');
  expect(html).not.toMatch(/data-k-(section|field|from|header|asset)/);
});
