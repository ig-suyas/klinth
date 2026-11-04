import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

const sectionsList = (page: Page) =>
  page.getByRole('navigation', { name: 'Sections' }).getByRole('listitem');
/** The Undo button in the top bar (the delete notice has its own). */
const toolbarUndo = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Undo' });
const preview = (page: Page) => page.frameLocator('iframe[title="Preview of your site"]');

async function waitForSave(page: Page) {
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
}

test('a non-coder picks a template, edits it and exports a site', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Make a website you are proud of.' }),
  ).toBeVisible();

  // Pick a template.
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();

  // The first-run tour shows and can be skipped.
  await expect(page.getByRole('dialog', { name: 'Your sections' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('dialog', { name: 'Click to edit' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Click a section in the preview to select it, then click its heading to type in place.
  const heading = preview(page).locator('h1');
  await heading.click();
  await expect(
    page
      .getByRole('complementary', { name: 'Settings' })
      .getByRole('heading', { name: 'Big intro' }),
  ).toBeVisible();
  await heading.click();
  await expect(heading).toHaveAttribute('contenteditable', 'plaintext-only');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Hi, I make websites');
  await page.keyboard.press('Enter');
  await expect(sectionsList(page).first()).toContainText('Hi, I make websites');
  await expect(preview(page).locator('h1')).toHaveText('Hi, I make websites');

  // Change text in the inspector; the preview follows.
  await page
    .getByLabel('Text under the heading')
    .fill('I build small, fast sites for kind people.');
  await expect(preview(page).locator('.lede')).toHaveText(
    'I build small, fast sites for kind people.',
  );

  // Change the accent color of the whole site.
  await page.getByRole('tab', { name: 'Site style' }).click();
  await page.getByLabel('Accent', { exact: true }).fill('#1d5f7a');
  await expect
    .poll(() =>
      preview(page)
        .locator('html')
        .evaluate((el) => getComputedStyle(el).getPropertyValue('--color-accent').trim()),
    )
    .toBe('#1d5f7a');

  // Add a section, delete it, and bring it back with undo.
  const before = await sectionsList(page).count();
  await page.getByRole('button', { name: 'Add a section' }).click();
  await page
    .getByRole('dialog', { name: 'Add a section' })
    .getByRole('button', { name: /Kind words/ })
    .click();
  await expect(sectionsList(page)).toHaveCount(before + 1);
  await page.getByRole('button', { name: 'Delete Kind words' }).last().click();
  await expect(sectionsList(page)).toHaveCount(before);
  await toolbarUndo(page).click();
  await expect(sectionsList(page)).toHaveCount(before + 1);

  // Reorder with the keyboard-friendly buttons.
  await page.getByRole('button', { name: 'Move Big intro down' }).click();
  await expect(sectionsList(page).nth(1)).toContainText('Hi, I make websites');
  await toolbarUndo(page).click();

  // Work is saved in the browser and survives a reload.
  await waitForSave(page);
  await page.reload();
  await expect(preview(page).locator('h1')).toHaveText('Hi, I make websites');

  // Export the site as a ZIP and check the files.
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download website/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('ira-sen.zip');
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  const index = strFromU8(files['index.html'] ?? new Uint8Array());
  expect(index).toContain('Hi, I make websites');
  expect(index).toContain('I build small, fast sites for kind people.');
  expect(index).not.toContain('data-k-');
  expect(strFromU8(files['css/site.css'] ?? new Uint8Array())).toContain('--color-accent: #1d5f7a');
  expect(Object.keys(files)).toContain('.klinth/project.json');
});

test('Escape cancels an in-place edit', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Small business/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  const heading = preview(page).locator('h1');
  const original = await heading.innerText();
  await heading.click();
  await heading.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Something else');
  await page.keyboard.press('Escape');
  await expect(heading).toHaveText(original);
  await expect(toolbarUndo(page)).toBeDisabled();
});

test('sections can be dragged into a new order', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  const row = await sectionsList(page).nth(0).boundingBox();
  const handle = page.getByRole('button', { name: 'Drag to move Big intro' });
  const box = await handle.boundingBox();
  if (!box || !row) throw new Error('No drag handle');
  // Drag the first section down by a little more than one row.
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step += 1)
    await page.mouse.move(x, y + (step / 8) * row.height * 1.2);
  await page.mouse.up();
  await expect(sectionsList(page).nth(1)).toContainText('Designing calm, useful things.');
  await expect(preview(page).locator('main > section').nth(1)).toHaveClass(/block-hero/);
});
