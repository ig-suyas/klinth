import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

const preview = (page: Page) =>
  page
    .frameLocator('iframe[title="Preview of your site"]')
    .frameLocator('iframe[title="Your site"]');
const settings = (page: Page) => page.getByRole('complementary', { name: 'Settings' });
const warning = (page: Page) => page.getByRole('dialog', { name: /free positioning/i });

async function centre(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('not on screen');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

/** Double-click the element, then press and drag it by dx/dy (the gesture that asks). */
async function doubleClickDrag(page: Page, target: Locator, dx: number, dy: number) {
  const { x, y } = await centre(target);
  await page.mouse.dblclick(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

/** Reads a free item's position variables from its inline style. */
async function position(item: Locator) {
  const style = (await item.getAttribute('style')) ?? '';
  // The browser writes `--x: 1` once the preview script has changed the style.
  const v = (k: string) => Number(new RegExp(`--${k}:\\s*(-?[\\d.]+)`).exec(style)?.[1] ?? NaN);
  return { x: v('x'), y: v('y'), w: v('w'), h: v('h') };
}

test('double-click, drag, warning, Yes, move, nudge, undo and export', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  const hero = preview(page).locator('section.block-hero');
  const h1 = hero.locator('h1');
  await expect(h1).toBeVisible();
  // A click right after the preview redraws can be lost (see handoff): select the hero first.
  await expect(async () => {
    await h1.click();
    await expect(settings(page).getByRole('heading', { name: 'Big intro' })).toBeVisible({
      timeout: 1500,
    });
  }).toPass({ timeout: 20_000 });
  await page.keyboard.press('Escape');
  // A press within half a second of that click would be a double-click.
  await page.waitForTimeout(700);

  // 1. A plain press-and-drag (text selection) never asks.
  const start = await centre(h1);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 120, start.y + 20, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(warning(page)).toHaveCount(0);

  // 2. Double-click and drag: the warning. Escape means No, and nothing changes.
  await doubleClickDrag(page, h1, 90, 40);
  await expect(warning(page)).toBeVisible();
  await expect(warning(page)).toContainText(
    'Free positioning can hurt your SEO, accessibility and how the page looks on phones. Continue?',
  );
  await expect(
    warning(page).getByRole('button', { name: 'No, keep the optimized layout' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(warning(page)).toHaveCount(0);
  await expect(hero).not.toHaveClass(/block-free/);
  await expect(page.locator('button[aria-label="Undo"]')).toBeDisabled();
  // The element went back where it was.
  await expect(async () => {
    const back = await centre(h1);
    expect(Math.abs(back.x - start.x)).toBeLessThan(1);
    expect(Math.abs(back.y - start.y)).toBeLessThan(1);
  }).toPass({ timeout: 3000 });

  // 3. Again, and Yes: the section turns free and the heading stays where it was dropped.
  // (It is as wide as the text column, so it can only move down, not sideways.)
  await doubleClickDrag(page, h1, 0, 40);
  await warning(page).getByRole('button', { name: 'Yes, use free layout' }).click();
  await expect(warning(page)).toHaveCount(0);
  await expect(hero).toHaveClass(/block-free/);
  await expect(hero.locator('.k-badge')).toHaveText('Free layout');
  const title = hero.locator('h1[data-k-item]');
  await expect(title).toBeVisible();
  // Compare the top-left corner: free text gets a little extra width (so it never wraps
  // sooner than in the optimized layout), which moves its centre but not its corner.
  const dropped = await centre(title);
  expect(Math.abs(dropped.box.x - start.box.x)).toBeLessThan(3);
  expect(Math.abs(dropped.box.y - (start.box.y + 40))).toBeLessThan(3);
  await expect(settings(page).getByText('Placed by hand')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Sections' })).toContainText('Free layout');

  // 4. Make it narrower in the settings panel, move it in the preview (no second
  // question) and nudge it with the keyboard.
  await settings(page).getByRole('spinbutton', { name: 'Width' }).fill('50');
  await expect.poll(async () => (await position(title)).w).toBe(50);
  const before = await position(title);
  // The narrower title wraps onto more lines and grows taller, so items drawn in front of it
  // may cover its middle: grab it near its top-left corner.
  await page.waitForTimeout(500);
  const { box: at } = await centre(title);
  const grab = { x: at.x + 20, y: at.y + 12 };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 200, grab.y + 20, { steps: 10 });
  await page.mouse.up();
  await expect(warning(page)).toHaveCount(0);
  await expect.poll(async () => (await position(title)).x).toBeGreaterThan(before.x + 5);
  const moved = await position(title);
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await position(title)).x).toBeCloseTo(moved.x + 0.5, 3);
  // Shift+Left many times stops at the artboard edge.
  for (let i = 0; i < 30; i += 1) await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(async () => (await position(title)).x).toBe(0);

  // 5. Undo steps back through the moves to the optimized layout, redo comes back.
  const undo = page.locator('button[aria-label="Undo"]');
  const redo = page.locator('button[aria-label="Redo"]');
  await undo.click(); // the nudges (one step)
  await expect
    .poll(async () => (await position(hero.locator('h1[data-k-item]'))).x)
    .toBeCloseTo(moved.x, 1);
  await undo.click(); // the drag
  await expect
    .poll(async () => (await position(hero.locator('h1[data-k-item]'))).x)
    .toBeCloseTo(before.x, 1);
  await undo.click(); // the width
  await expect.poll(async () => (await position(hero.locator('h1[data-k-item]'))).w).not.toBe(50);
  await undo.click(); // the conversion
  await expect(hero).not.toHaveClass(/block-free/);
  await expect(undo).toBeDisabled();
  await redo.click();
  await expect(hero).toHaveClass(/block-free/);
  await redo.click();
  await redo.click();
  await expect
    .poll(async () => (await position(hero.locator('h1[data-k-item]'))).x)
    .toBeCloseTo(moved.x, 1);

  // 6. Export: real semantic markup, the free stylesheet, and the saved canvas.
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download website/ }).click(),
  ]);
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  const read = (path: string) => strFromU8(files[path] ?? new Uint8Array());
  const html = read('index.html');
  expect(html).toContain('<link rel="stylesheet" href="css/free.css">');
  expect(read('css/free.css')).toContain('.free-board');
  expect(html).toMatch(/<section[^>]*class="block block-hero block-free/);
  expect(html).toMatch(/<h1 class="free-item free-text free-title" style="--x:[\d.]+;/);
  expect(html).not.toContain('data-k-');
  const saved = JSON.parse(read('.klinth/project.json')) as {
    pages: { sections: { type: string; layout?: string; canvas?: { items: unknown[] } }[] }[];
  };
  const savedHero = saved.pages[0]?.sections.find((s) => s.type === 'hero');
  expect(savedHero?.layout).toBe('free');
  expect(savedHero?.canvas?.items.length).toBeGreaterThan(3);
});

test('resize, stacking and Return to optimized layout', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  const hero = preview(page).locator('section.block-hero');
  const h1 = hero.locator('h1');
  await expect(async () => {
    await h1.click();
    await expect(settings(page).getByRole('heading', { name: 'Big intro' })).toBeVisible({
      timeout: 1500,
    });
  }).toPass({ timeout: 20_000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);

  // "Don't ask again" with Yes: remembered for this section.
  await doubleClickDrag(page, h1, 40, 0);
  await warning(page).getByRole('checkbox', { name: 'Don’t ask again for this section' }).check();
  await warning(page).getByRole('button', { name: 'Yes, use free layout' }).click();
  await expect(hero).toHaveClass(/block-free/);

  // Double-click edits the text in place; Enter saves it.
  const title = hero.locator('h1[data-k-item]');
  await title.dblclick();
  await expect(title).toHaveAttribute('contenteditable', 'plaintext-only');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Placed by me');
  await page.keyboard.press('Enter');
  await expect(hero.locator('h1[data-k-item]')).toHaveText('Placed by me');
  await expect(settings(page).getByRole('textbox', { name: 'Text' })).toHaveValue('Placed by me');
  // The saved text redraws the preview; let that land before the next drag.
  await page.waitForTimeout(800);

  // Resize the heading from its right edge: narrower, no question.
  const before = await position(title);
  const handle = hero.locator('.k-handle[data-h="e"]');
  const grip = await centre(handle);
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(grip.x - 120, grip.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await position(title)).w).toBeLessThan(before.w - 5);
  await expect(warning(page)).toHaveCount(0);

  // Bring forward / send back from the settings panel.
  const panel = settings(page);
  await panel.getByRole('button', { name: 'Send back' }).click();
  await panel.getByRole('button', { name: 'Bring forward' }).click();

  // The phone preview stacks the items in reading order.
  await panel.getByRole('button', { name: 'See it on a phone' }).click();
  await expect(hero.locator('h1[data-k-item]')).toHaveCSS('position', 'static');
  await page.getByRole('radio', { name: 'Computer' }).click();
  await expect(hero.locator('h1[data-k-item]')).toHaveCSS('position', 'relative');

  // Return to optimized layout asks first; Cancel keeps it, confirm goes back.
  await panel.getByRole('button', { name: 'Return to optimized layout' }).click();
  const confirm = page.getByRole('dialog', { name: 'Return to the optimized layout?' });
  await confirm.getByRole('button', { name: 'Keep the free layout' }).click();
  await expect(hero).toHaveClass(/block-free/);
  await panel.getByRole('button', { name: 'Return to optimized layout' }).click();
  await confirm.getByRole('button', { name: 'Return to optimized layout' }).click();
  await expect(hero).not.toHaveClass(/block-free/);
  await expect(page.getByText('Back to the optimized layout.')).toBeVisible();

  // Remembered "Yes": dragging again converts straight away.
  await doubleClickDrag(page, hero.locator('h1'), 40, 0);
  await expect(hero).toHaveClass(/block-free/);
  await expect(warning(page)).toHaveCount(0);
});

test('reordering sections in the list never asks', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  const list = page.getByRole('navigation', { name: 'Sections' });
  const grip = list.getByRole('button', { name: /Drag to move/ }).nth(1);
  const from = await centre(grip);
  await page.mouse.dblclick(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 80, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(warning(page)).toHaveCount(0);
});
