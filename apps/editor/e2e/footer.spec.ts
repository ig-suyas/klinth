import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

test('footer: align each group, move it sideways, set its padding, hide "Back to top", export', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  const preview = page.frameLocator('iframe[title="Preview of your site"]').frameLocator('iframe');
  const settings = page.getByRole('complementary', { name: 'Settings' });

  await preview.locator('footer .foot').click({ position: { x: 4, y: 4 } });
  await settings
    .getByRole('group', { name: 'Copyright text position' })
    .getByText('Center')
    .click();
  await settings.getByRole('group', { name: '“Back to top” position' }).getByText('Left').click();
  await settings.getByLabel('Move sideways').fill('10');
  await settings.getByLabel('Space above and below').fill('4');
  await expect(preview.locator('footer .foot-text')).toHaveClass(/al-center/);
  await expect(preview.locator('footer .totop')).toHaveClass(/al-left/);
  const box = await preview.locator('footer .foot').evaluate((el) => {
    const inner = el.querySelector('.foot-in') as HTMLElement;
    const cs = getComputedStyle(el);
    const content = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return {
      shift:
        inner.getBoundingClientRect().left -
        el.getBoundingClientRect().left -
        parseFloat(cs.paddingLeft),
      content,
      pad: parseFloat(cs.paddingTop),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  expect(Math.abs(box.shift - box.content * 0.1)).toBeLessThan(1);
  expect(box.pad).toBe(64);
  expect(box.overflow).toBe(false);

  // Site style > Footer: hide "Back to top" for the whole site.
  await page.getByRole('tab', { name: 'Site style' }).click();
  await page.locator('summary', { hasText: 'Footer' }).click();
  const toTop = page.getByRole('switch', { name: 'Show “Back to top”' });
  await page.locator('label', { has: toTop }).click();
  await expect(toTop).not.toBeChecked();
  await expect(preview.locator('footer .totop')).toHaveCount(0);

  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download website/ }).click(),
  ]);
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  const read = (path: string) => strFromU8(files[path] ?? new Uint8Array());
  const html = read('index.html');
  expect(html).toContain('class="wrap foot foot-set" style="--fpad:4;--fl:10;--fr:0;"');
  expect(html).toContain('foot-text al-center');
  expect(html).not.toContain('Back to top');
  expect(read('css/site.css')).toContain('.foot-col>.al-center');
});
