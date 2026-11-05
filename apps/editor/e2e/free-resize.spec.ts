/**
 * Free layout sizing (the "Big intro" heading of the Creative studio
 * template): corner handles scale text proportionally, side handles reflow
 * it, the selection frame always matches the text, the section grows to hold
 * its items, banners never move the preview, and the export matches the
 * editor at three widths.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';

const preview = (page: Page) =>
  page
    .frameLocator('iframe[title="Preview of your site"]')
    .frameLocator('iframe[title="Your site"]');
const settings = (page: Page) => page.getByRole('complementary', { name: 'Settings' });
const warning = (page: Page) => page.getByRole('dialog', { name: /free positioning/i });

async function centre(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('not on screen');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(page: Page, target: Locator, dx: number, dy: number) {
  await target.scrollIntoViewIfNeeded();
  const { x, y } = await centre(target);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
  // A grown artboard redraws the preview shortly after the drop; let it land.
  await page.waitForTimeout(500);
}

interface Measured {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fs: number;
  lines: number;
  overflow: boolean;
  minContent: number;
}
interface Layout {
  board: { w: number; h: number; bottom: number };
  sectionBottom: number;
  items: Measured[];
  frame: { x: number; y: number; w: number; h: number } | null;
}

/** Positions inside the free board, in px relative to it (works in the preview and the export). */
function measureBoard(section: Element): Layout {
  const board = section.querySelector('.free-board');
  if (!board) throw new Error('no board');
  const b = board.getBoundingClientRect();
  const items = [...board.querySelectorAll('[data-free]')].map((node) => {
    const el = node as HTMLElement;
    const r = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = new Set([...range.getClientRects()].map((q) => Math.round(q.top)));
    const probe = el.cloneNode(true) as HTMLElement;
    probe.removeAttribute('data-free');
    probe.removeAttribute('data-k-item');
    probe.style.width = 'min-content';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    board.appendChild(probe);
    const minContent = probe.getBoundingClientRect().width;
    probe.remove();
    return {
      id: el.getAttribute('data-free') ?? '',
      x: r.left - b.left,
      y: r.top - b.top,
      w: r.width,
      h: r.height,
      fs: parseFloat(getComputedStyle(el).fontSize),
      lines: tops.size,
      // Text is as tall as its lines (big glyphs may ink a little past a tight line height),
      // so only sideways overflow counts for text; other items must hold their content.
      overflow:
        el.scrollWidth > el.clientWidth + 1 ||
        (!el.classList.contains('free-text') && el.scrollHeight > el.clientHeight + 1),
      minContent,
    };
  });
  const f = board.querySelector('.k-frame')?.getBoundingClientRect();
  return {
    board: { w: b.width, h: b.height, bottom: b.bottom },
    sectionBottom: section.getBoundingClientRect().bottom,
    items,
    frame: f ? { x: f.left - b.left, y: f.top - b.top, w: f.width, h: f.height } : null,
  };
}

const layoutOf = (hero: Locator) => hero.evaluate(measureBoard);
const itemOf = (l: Layout, id: string): Measured => {
  const found = l.items.find((i) => i.id === id);
  if (!found) throw new Error(`${id} missing`);
  return found;
};

/** The selection frame is the item's real rendered box (within 2 px), and nothing is clipped. */
async function expectSound(hero: Locator, id: string) {
  await expect(async () => {
    const l = await layoutOf(hero);
    const it = itemOf(l, id);
    expect(l.frame).not.toBeNull();
    const f = l.frame as NonNullable<Layout['frame']>;
    expect(Math.abs(f.x - it.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(f.y - it.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(f.w - it.w)).toBeLessThanOrEqual(2);
    expect(Math.abs(f.h - it.h)).toBeLessThanOrEqual(2);
    for (const item of l.items) {
      expect(item.y + item.h).toBeLessThanOrEqual(l.board.h + 1);
      expect(item.overflow).toBe(false);
    }
    expect(l.board.bottom).toBeLessThanOrEqual(l.sectionBottom + 1);
  }).toPass({ timeout: 5000 });
}

/** Opens the studio template and turns its intro free by dragging the heading. */
async function freeIntro(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Creative studio/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  const hero = preview(page).locator('section.block-hero');
  const h1 = hero.locator('h1');
  await expect(h1).toBeVisible();
  await expect(async () => {
    await h1.click();
    await expect(settings(page).getByRole('heading', { name: 'Big intro' })).toBeVisible({
      timeout: 1500,
    });
  }).toPass({ timeout: 20_000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  const { x, y } = await centre(h1);
  await page.mouse.dblclick(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 30, { steps: 10 });
  await page.mouse.up();
  await warning(page).getByRole('button', { name: 'Yes, use free layout' }).click();
  await expect(hero).toHaveClass(/block-free/);
  const title = hero.locator('h1[data-k-item]');
  await expect(title).toBeVisible();
  const id = (await title.getAttribute('data-k-item')) ?? '';
  // Let the first measurement of the text land.
  await page.waitForTimeout(800);
  return { hero, title, id };
}

test('corner handles scale text proportionally and keep its wrapping', async ({ page }) => {
  const { hero, title, id } = await freeIntro(page);
  await title.click();
  await expectSound(hero, id);
  const start = itemOf(await layoutOf(hero), id);
  expect(start.lines).toBeGreaterThanOrEqual(1);
  expect(await title.innerHTML()).not.toContain('<br>');

  // Smaller from the bottom-right corner: everything scales by the same factor.
  await drag(page, hero.locator('.k-handle[data-h="se"]'), -start.w * 0.3, 0);
  await expectSound(hero, id);
  const small = itemOf(await layoutOf(hero), id);
  expect(small.w / start.w).toBeCloseTo(0.7, 1);
  expect(small.fs / start.fs).toBeCloseTo(small.w / start.w, 1);
  expect(small.lines).toBe(start.lines);

  // Bigger again from the top-right corner.
  await drag(page, hero.locator('.k-handle[data-h="ne"]'), start.w * 0.2, 0);
  await expectSound(hero, id);
  const big = itemOf(await layoutOf(hero), id);
  expect(big.fs / small.fs).toBeCloseTo(big.w / small.w, 1);
  expect(big.lines).toBe(start.lines);
  // Text has no top or bottom handle: its height is automatic.
  await expect(hero.locator('.k-handle[data-h="n"]')).toHaveCount(0);
  await expect(hero.locator('.k-handle[data-h="s"]')).toHaveCount(0);
});

test('side handles reflow text, never below the longest word, frame always matches', async ({
  page,
}) => {
  const { hero, title, id } = await freeIntro(page);
  await title.click();
  const start = itemOf(await layoutOf(hero), id);

  // Narrower: same text size, more lines, nothing overflows.
  await drag(page, hero.locator('.k-handle[data-h="e"]'), -start.w * 0.45, 0);
  await expectSound(hero, id);
  const narrow = itemOf(await layoutOf(hero), id);
  expect(narrow.fs).toBeCloseTo(start.fs, 1);
  expect(narrow.w).toBeLessThan(start.w * 0.7);
  expect(narrow.lines).toBeGreaterThan(start.lines);

  // Wider again: the text reflows back (no hard line breaks).
  await drag(page, hero.locator('.k-handle[data-h="e"]'), start.w - narrow.w, 0);
  await expectSound(hero, id);
  const wide = itemOf(await layoutOf(hero), id);
  expect(wide.lines).toBe(start.lines);

  // As narrow as possible: still at least the longest word.
  await drag(page, hero.locator('.k-handle[data-h="e"]'), -3000, 0);
  await expectSound(hero, id);
  const least = itemOf(await layoutOf(hero), id);
  expect(least.w).toBeGreaterThanOrEqual(least.minContent - 1);
  expect(least.overflow).toBe(false);

  // Editing the text keeps the frame on the text.
  // Near its top-left corner: lower down, later items are stacked over the tall, narrow title.
  await title.dblclick({ position: { x: 12, y: 12 } });
  await expect(title).toHaveAttribute('contenteditable', 'plaintext-only');
  await page.keyboard.press('End');
  await page.keyboard.type(' And they listen.');
  await expectSound(hero, id);
  await page.keyboard.press('Enter');
  await expect(hero.locator('h1[data-k-item]')).toContainText('And they listen.');
  await page.waitForTimeout(800);
  await hero.locator('h1[data-k-item]').click({ position: { x: 12, y: 12 } });
  await expectSound(hero, id);
});

test('the section grows to hold a big heading, with a gentle overlap hint', async ({ page }) => {
  const { hero, title, id } = await freeIntro(page);
  await title.click();
  const start = itemOf(await layoutOf(hero), id);
  // Make room on the right, move it to the bottom, then scale it up from a corner.
  await drag(page, hero.locator('.k-handle[data-h="e"]'), -start.w * 0.5, 0);
  for (let i = 0; i < 25; i += 1) await page.keyboard.press('Shift+ArrowDown');
  await page.waitForTimeout(400);
  const before = await layoutOf(hero);
  await drag(page, hero.locator('.k-handle[data-h="se"]'), itemOf(before, id).w * 0.8, 0);
  await expectSound(hero, id);
  const after = await layoutOf(hero);
  expect(after.board.h).toBeGreaterThan(before.board.h + 10);
  // A gentle hint, not a blocker.
  await expect(
    settings(page)
      .getByText(/overlap/i)
      .first(),
  ).toBeVisible();
  // The saved artboard really grew (the export holds it too).
  await page.waitForTimeout(800);
  await expectSound(hero, id);
});

test('the backup banner never moves or resizes the preview', async ({ page }) => {
  const { hero, title } = await freeIntro(page);
  await title.click();
  const banner = page.getByText('Keep a backup.');
  const boxes = async () => {
    const items = hero.locator('[data-k-item]');
    const n = await items.count();
    const out: { x: number; y: number; w: number; h: number }[] = [];
    for (let i = 0; i < n; i += 1) {
      const b = await items.nth(i).boundingBox();
      if (!b) throw new Error('item off screen');
      out.push({ x: b.x, y: b.y, w: b.width, h: b.height });
    }
    return out;
  };
  const same = (a: Awaited<ReturnType<typeof boxes>>, b: typeof a) => {
    expect(a).toHaveLength(b.length);
    a.forEach((box, i) => {
      const other = b[i] as (typeof a)[number];
      for (const k of ['x', 'y', 'w', 'h'] as const) {
        expect(Math.abs(box[k] - other[k])).toBeLessThanOrEqual(0.5);
      }
    });
  };
  // Nudge right and back until the reminder shows; the item ends where it started each time.
  let before = await boxes();
  for (let i = 0; i < 20 && !(await banner.isVisible()); i += 1) {
    before = await boxes();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);
  }
  await expect(banner).toBeVisible();
  await page.waitForTimeout(400);
  same(await boxes(), before);
  await page.getByRole('button', { name: 'Remind me later' }).click();
  await expect(banner).toHaveCount(0);
  await page.waitForTimeout(400);
  same(await boxes(), before);
});

test('the editor and the exported site match at 1366, 1024 and 768 px', async ({ page }) => {
  const { hero, title, id } = await freeIntro(page);
  await title.click();
  const start = itemOf(await layoutOf(hero), id);
  await drag(page, hero.locator('.k-handle[data-h="e"]'), -start.w * 0.3, 0);
  await drag(page, hero.locator('.k-handle[data-h="se"]'), -start.w * 0.1, 0);
  await page.waitForTimeout(800);
  const editor = await layoutOf(hero);

  // Normalised by the board width: positions and text sizes scale with the board.
  const norm = (l: Layout) =>
    new Map(
      l.items.map((i) => [
        i.id,
        {
          x: i.x / l.board.w,
          y: i.y / l.board.w,
          w: i.w / l.board.w,
          h: i.h / l.board.w,
          fs: i.fs / l.board.w,
          lines: i.lines,
        },
      ]),
    );
  const ed = norm(editor);

  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download website/ }).click(),
  ]);
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  const types: Record<string, string> = {
    html: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
  };
  await page.context().route('http://export.test/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(1) || 'index.html';
    const body = files[path];
    if (!body) return route.fulfill({ status: 404, body: '' });
    const ext = path.split('.').pop() ?? '';
    return route.fulfill({
      body: Buffer.from(body),
      contentType: types[ext] ?? 'application/octet-stream',
    });
  });
  const site = await page.context().newPage();
  for (const width of [1366, 1024, 768]) {
    await site.setViewportSize({ width, height: 900 });
    await site.goto('http://export.test/index.html');
    const exported = await site.locator('section.block-hero').evaluate(measureBoard);
    const ex = norm(exported);
    expect(ex.size).toBe(ed.size);
    for (const [key, a] of ed) {
      const b = ex.get(key);
      expect(b, `${key} at ${width}`).toBeDefined();
      if (!b) continue;
      for (const k of ['x', 'y', 'w', 'h'] as const) {
        expect(Math.abs(a[k] - b[k]), `${key}.${k} at ${width}`).toBeLessThan(0.004);
      }
      expect(Math.abs(a.fs - b.fs), `${key} text size at ${width}`).toBeLessThan(0.0006);
      expect(b.lines, `${key} lines at ${width}`).toBe(a.lines);
    }
  }
  await site.close();
});

test('small text on tablets is one grouped warning with one Show button', async ({ page }) => {
  await freeIntro(page);
  const panel = settings(page);
  const checks = panel.getByRole('list', { name: 'Things to check' });
  await expect(checks.getByText(/may be too small/)).toHaveCount(1);
  await expect(checks.getByText(/^\d+ items? may be too small on tablets$/)).toBeVisible();
  await expect(panel.getByText('This text may be too small to read on tablets.')).toHaveCount(0);
  await checks.getByRole('button', { name: /^Show/ }).first().click();
  await expect(preview(page).locator('.k-hint').first()).toBeVisible();
});
