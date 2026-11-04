import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';

const preview = (page: Page) => page.frameLocator('iframe[title="Preview of your site"]');
const settings = (page: Page) => page.getByRole('complementary', { name: 'Settings' });
const MP4_HEAD = [0, 0, 0, 24, ...Array.from('ftypisom', (c) => c.charCodeAt(0)), 0, 0, 2, 0];

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
}

async function addSection(page: Page, name: RegExp) {
  await page.getByRole('button', { name: 'Add a section' }).click();
  await page.getByRole('dialog', { name: 'Add a section' }).getByRole('button', { name }).click();
}

/** A wide PNG made in the browser, so the test needs no image files. */
async function widePng(page: Page): Promise<Buffer> {
  const url = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = 1200;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no canvas');
    context.fillStyle = '#1d5f7a';
    context.fillRect(0, 0, 2400, 1200);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(url.split(',')[1] ?? '', 'base64');
}

test('pictures, videos and code are added, previewed and exported', async ({
  page,
  context,
}, testInfo) => {
  await start(page);

  // Upload a picture for the big intro: it is resized and shown in the preview.
  await preview(page).locator('h1').click();
  await settings(page).getByRole('button', { name: 'Choose a picture' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a picture' });
  await picker
    .getByLabel('Upload files')
    .setInputFiles({ name: 'studio.png', mimeType: 'image/png', buffer: await widePng(page) });
  await expect(picker).toHaveCount(0);
  await settings(page).getByLabel('Describe the picture').fill('A calm blue wall');
  const heroImg = preview(page).locator('.hero-media img');
  await expect(heroImg).toHaveAttribute('alt', 'A calm blue wall');
  await expect(heroImg).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => heroImg.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(2000);

  // A YouTube link: embed code is refused, a page link becomes a click-to-load facade.
  await addSection(page, /^Video/);
  const link = settings(page).getByLabel('Video link');
  await link.fill('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>');
  await expect(settings(page).getByRole('alert')).toContainText('embed code');
  await expect(preview(page).locator('.video-facade')).toHaveCount(0);
  await link.fill('https://youtu.be/dQw4w9WgXcQ');
  const facade = preview(page).locator('.video-facade');
  await expect(facade).toHaveAttribute(
    'data-embed',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0',
  );
  // The preview never loads the player.
  await facade.click();
  await expect(preview(page).locator('.block-video iframe')).toHaveCount(0);

  // An uploaded video: too big is refused with a hint, a small MP4 is kept.
  await addSection(page, /^Video/);
  // Wait until the inspector shows the new, empty section (the old one fades out first).
  await expect(settings(page).getByLabel('Video link')).toHaveValue('');
  await settings(page).getByRole('radio', { name: 'Upload a file' }).click();
  await settings(page).getByRole('button', { name: 'Choose a video' }).click();
  const videoPicker = page.getByRole('dialog', { name: 'Choose a video' });
  const tooBig = Buffer.alloc(25 * 1024 * 1024 + 1);
  Buffer.from(MP4_HEAD).copy(tooBig);
  await videoPicker
    .getByLabel('Upload files')
    .setInputFiles({ name: 'long.mp4', mimeType: 'video/mp4', buffer: tooBig });
  await expect(videoPicker.getByRole('alert')).toContainText('up to 25 MB');
  await videoPicker
    .getByLabel('Upload files')
    .setInputFiles({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from(MP4_HEAD) });
  await expect(videoPicker).toHaveCount(0);
  await expect(settings(page).getByText('clip.mp4')).toBeVisible();
  await expect(preview(page).locator('.video-file video')).toHaveAttribute('src', /^blob:/);

  // The file manager lists both files with their use.
  await page.getByRole('button', { name: 'Pictures and videos' }).click();
  const library = page.getByRole('dialog', { name: 'Pictures and videos' });
  await expect(library.locator('[data-asset]')).toHaveCount(2);
  await expect(library).toContainText('Used in 1 place');
  await page.keyboard.press('Escape');

  // Export: the files are in the ZIP and the pages point at them.
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download website/ }).click(),
  ]);
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  const names = Object.keys(files);
  const picture = names.find((n) => /^assets\/img-[a-z0-9]{8}\.(webp|jpg)$/.test(n));
  const clip = names.find((n) => /^assets\/vid-[a-z0-9]{8}\.mp4$/.test(n));
  expect(picture, names.join(', ')).toBeDefined();
  expect(Array.from(files[clip ?? ''] ?? [])).toEqual(MP4_HEAD);
  const index = strFromU8(files['index.html'] ?? new Uint8Array());
  expect(index).toContain(
    `<img src="${picture}" alt="A calm blue wall" width="2000" height="1000" fetchpriority="high"`,
  );
  expect(index).toContain(`<video src="${clip}" controls`);
  expect(index).toContain('data-embed="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  expect(index).not.toContain('<iframe');
  expect(index).not.toContain('data-k-');

  // The exported site opens from disk; pressing play swaps the facade for the player.
  const site = testInfo.outputPath('site');
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    await mkdir(dirname(join(site, name)), { recursive: true });
    await writeFile(join(site, name), data);
  }
  const visitor = await context.newPage();
  await visitor.route(/youtube/, (route) => route.abort());
  await visitor.goto(pathToFileURL(join(site, 'index.html')).href);
  await expect(visitor.locator('.hero-media img')).toHaveJSProperty('naturalWidth', 2000);
  await expect(visitor.locator('.block-video iframe')).toHaveCount(0);
  await visitor.locator('.video-facade').click();
  await expect(visitor.locator('.block-video iframe')).toHaveAttribute(
    'src',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0',
  );
  await visitor.close();

  // Deleting a used picture removes it from the page; Undo brings it back.
  await page.getByRole('button', { name: 'Pictures and videos' }).click();
  await library.getByRole('button', { name: 'Delete studio.png' }).click();
  await library.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(preview(page).locator('.hero-media img')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Undo', exact: true }).last().click();
  await expect(preview(page).locator('.hero-media img')).toHaveAttribute('src', /^blob:/);
});

test('custom code runs in a sandbox that cannot reach the editor', async ({ page }) => {
  await start(page);
  const heading = await preview(page).locator('h1').innerText();
  await addSection(page, /^Custom code/);
  await expect(settings(page)).toContainText('Only paste code you trust.');
  const attack = `<p id="out">waiting</p><script>
var r = [];
try { parent.parent.document.title = 'HACKED'; r.push('editor:open'); } catch (e) { r.push('editor:blocked'); }
try { parent.document.body.innerHTML = 'HACKED'; r.push('preview:open'); } catch (e) { r.push('preview:blocked'); }
try { localStorage.setItem('k', '1'); r.push('storage:open'); } catch (e) { r.push('storage:blocked'); }
try { document.cookie = 'k=1'; r.push(document.cookie ? 'cookie:open' : 'cookie:blocked'); } catch (e) { r.push('cookie:blocked'); }
top.postMessage({ source: 'klinth-preview', type: 'edit', id: 'intro', field: 'heading', value: 'HACKED' }, '*');
parent.postMessage({ source: 'klinth-preview', type: 'edit', id: 'intro', field: 'heading', value: 'HACKED' }, '*');
document.getElementById('out').textContent = r.join(' ');
</script>`;
  await settings(page).getByLabel('Your code').fill(attack);

  const out = preview(page).frameLocator('iframe.code-frame').locator('#out');
  await expect(out).toHaveText('editor:blocked preview:blocked storage:blocked cookie:blocked');
  // The editor, its saved projects and the preview page are untouched.
  await expect(page).toHaveTitle('Klinth');
  await expect(preview(page).locator('h1')).toHaveText(heading);
  expect(await page.evaluate(() => localStorage.getItem('k'))).toBeNull();
  await expect(page.getByRole('navigation', { name: 'Sections' })).not.toContainText('HACKED');

  // On the exported site the code runs as pasted.
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download website/ }).click(),
  ]);
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  const index = strFromU8(files['index.html'] ?? new Uint8Array());
  expect(index).toContain(`<div class="custom-code">${attack}</div>`);
  expect(strFromU8(files['README.md'] ?? new Uint8Array())).toContain('About your custom code');
});
