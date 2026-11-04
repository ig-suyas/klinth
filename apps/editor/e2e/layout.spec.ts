import { expect, test, type Page } from '@playwright/test';

const SIZES = [
  { width: 1366, height: 768 },
  { width: 1280, height: 600 },
  { width: 1024, height: 768 },
];

async function openEditor(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
}

/** Height the page itself can scroll, beyond the window. */
const pageOverflow = (page: Page) =>
  page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return root.scrollHeight - window.innerHeight;
  });

for (const size of SIZES) {
  test(`editor fits the window with no page scrollbar at ${size.width}x${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openEditor(page);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);

    // Scrolling the window does nothing: the shell stays put.
    await page.mouse.wheel(0, 2000);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // The right panel scrolls on its own, down to its last control.
    await page.getByRole('tab', { name: 'Site style' }).click();
    for (const title of ['Ready-made looks', 'Colors', 'Fonts', 'Shape and space', 'Custom code']) {
      await page.locator('summary', { hasText: title }).click();
    }
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
    const settings = page.getByRole('complementary', { name: 'Settings' });
    const last = settings.getByLabel(/Custom JavaScript/);
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // The left list and the preview stay reachable too.
    await expect(page.getByRole('button', { name: 'Add a section' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Export' })).toBeInViewport();
    await expect(page.getByTitle('Preview of your site')).toBeInViewport();
  });
}
