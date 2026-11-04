import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

/**
 * A first visit in a clean browser profile: no saved projects, no settings, no
 * cached files. Every test here gets its own fresh context with empty storage.
 * These are the checks behind the "blank screen / empty templates / stuck
 * sections / touch does nothing" reports from people who had never opened Klinth.
 */

// Playwright's trace recorder tries to run its snapshot script inside the
// script-free template thumbnails (sandbox="") and Chrome logs "Blocked script
// execution" for it. That message comes from the test tool, not from Klinth,
// and would make the "no console errors" checks fail at random.
test.use({ trace: 'off' });

const TEMPLATES = ['Personal portfolio', 'Small business or link page', 'Creative studio'];

const sectionsList = (page: Page) =>
  page.getByRole('navigation', { name: 'Sections' }).getByRole('listitem');
const preview = (page: Page) =>
  page
    .frameLocator('iframe[title="Preview of your site"]')
    .frameLocator('iframe[title="Your site"]');
const settings = (page: Page) => page.getByRole('complementary', { name: 'Settings' });

/**
 * Collects console errors (the browser logs every CSP violation there),
 * uncaught errors and failed responses.
 */
function watchForErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`);
  });
  return problems;
}

async function skipTour(page: Page) {
  const skip = page.getByRole('button', { name: 'Skip tour' });
  await expect(skip).toBeVisible();
  await skip.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function addKindWords(page: Page, tap = false) {
  const before = await sectionsList(page).count();
  const add = page.getByRole('button', { name: 'Add a section' });
  await (tap ? add.tap() : add.click());
  const option = page
    .getByRole('dialog', { name: 'Add a section' })
    .getByRole('button', { name: /Kind words/ });
  await (tap ? option.tap() : option.click());
  // The menu closes and exactly one section is added, quickly (no freeze).
  await expect(page.getByRole('dialog', { name: 'Add a section' })).toHaveCount(0, {
    timeout: 3000,
  });
  await expect(sectionsList(page)).toHaveCount(before + 1, { timeout: 3000 });
  await expect(settings(page).getByRole('heading', { name: 'Kind words' })).toBeVisible();
}

test('first visit: the start screen renders with every template and no errors', async ({
  page,
}) => {
  const problems = watchForErrors(page);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Make a website you are proud of.' }),
  ).toBeVisible();
  for (const name of TEMPLATES) {
    await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: /Start blank/ })).toBeVisible();
  // Let the background editor prefetch finish too.
  await page.waitForLoadState('networkidle');

  // Open a template: still nothing in the console.
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await skipTour(page);
  await expect(preview(page).locator('h1')).not.toBeEmpty();
  expect(problems).toEqual([]);
});

for (const name of TEMPLATES) {
  test(`first visit: "${name}" opens with real content in the preview`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await skipTour(page);
    expect(await sectionsList(page).count()).toBeGreaterThan(2);
    await expect(preview(page).locator('h1')).not.toBeEmpty();
    await expect(preview(page).locator('[data-k-section]').first()).toBeVisible();
  });
}

test('first visit: adding a section works and nothing freezes', async ({ page }) => {
  const problems = watchForErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Start blank/ }).click();
  await skipTour(page);
  await addKindWords(page);
  await addKindWords(page);
  await expect(preview(page).locator('[data-k-section]')).toHaveCount(2);
  // A click on a section in the preview selects it.
  await preview(page).locator('[data-k-section]').first().click();
  await expect(settings(page).getByRole('heading', { name: 'Kind words' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('with IndexedDB blocked the editor still works, in memory, and says so', async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
  });
  const problems = watchForErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await skipTour(page);
  await expect(page.getByText('Klinth cannot save in this browser.')).toBeVisible();
  await expect(preview(page).locator('h1')).not.toBeEmpty();
  await addKindWords(page);
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  expect(problems.filter((p) => p.startsWith('uncaught'))).toEqual([]);
});

test('with localStorage blocked the editor still works', async ({ page, context }) => {
  await context.addInitScript(() => {
    for (const name of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(window, name, {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });
    }
  });
  const problems = watchForErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  // Without storage the tour cannot remember it was seen, so it stays out of the way.
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(preview(page).locator('h1')).not.toBeEmpty();
  await addKindWords(page);
  expect(problems.filter((p) => p.startsWith('uncaught'))).toEqual([]);
});

test('if the preview page cannot load, the editor keeps working and explains', async ({ page }) => {
  // What the live site did: /preview.html answered 404.
  await page.route('**/preview.html', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/');
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await skipTour(page);
  await expect(page.getByText('The preview could not load.')).toBeVisible({ timeout: 15_000 });
  // Selecting from the list and adding a section are not stuck.
  await sectionsList(page).nth(1).getByRole('button').nth(1).click();
  await expect(sectionsList(page).nth(1).locator('[aria-current="true"]')).toHaveCount(1);
  await addKindWords(page);
});

test.describe('touch', () => {
  test.use({ hasTouch: true });

  test('a tap opens a template, selects a section and adds one', async ({ page }) => {
    const problems = watchForErrors(page);
    await page.goto('/');
    await page.getByRole('button', { name: /Personal portfolio/ }).tap();
    await page.getByRole('button', { name: 'Skip tour' }).tap();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await preview(page).locator('h1').tap();
    await expect(settings(page).getByRole('heading', { name: 'Big intro' })).toBeVisible();
    await addKindWords(page, true);
    expect(problems.filter((p) => p.startsWith('uncaught'))).toEqual([]);
  });
});
