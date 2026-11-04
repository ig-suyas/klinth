import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type BrowserContext } from '@playwright/test';
import { unzipSync } from 'fflate';

/**
 * Publish to GitHub end to end: Connect (OAuth popup with PKCE) -> new repo ->
 * Git Data API push -> Pages. GitHub and the Klinth Worker are answered by
 * Playwright, with a small fake that keeps real Git blob ids. The pushed files
 * must equal the ZIP download byte for byte, and the token must never be saved.
 */

const TOKEN = 'gho_e2eToken0123456789abcdefghijklmnopq';
const API = 'https://api.github.com';

const gitSha = (bytes: Buffer) =>
  createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
    .digest('hex');

interface FakeRepo {
  ref: string;
  pages: boolean;
}

async function fakeGitHub(context: BrowserContext) {
  const blobs = new Map<string, Buffer>();
  const trees = new Map<string, Map<string, string>>();
  const commits = new Map<string, { tree: string; parent: string | null }>();
  const repos = new Map<string, FakeRepo>();
  const authHeaders: (string | undefined)[] = [];
  let n = 0;

  const addTree = (files: Map<string, string>) => {
    const id = `t${(n += 1)}`;
    trees.set(id, files);
    return id;
  };
  const filesOf = (name: string) => {
    const tree = trees.get(commits.get(repos.get(name)?.ref ?? '')?.tree ?? '') ?? new Map();
    return new Map([...tree].map(([path, sha]) => [path, blobs.get(sha) ?? Buffer.alloc(0)]));
  };

  // The sign-in window: GitHub "approves" at once and sends the user back with a code.
  await context.route('https://github.com/login/oauth/authorize**', (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const back = new URL(url.searchParams.get('redirect_uri') ?? '');
    back.searchParams.set('code', 'e2e-code');
    back.searchParams.set('state', url.searchParams.get('state') ?? '');
    return route.fulfill({ status: 302, headers: { location: back.toString() } });
  });

  await context.route('http://localhost:8787/github/**', (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (request.url().endsWith('/github/config')) {
      return route.fulfill({ json: { clientId: 'Iv1.e2e' } });
    }
    const body = JSON.parse(request.postData() ?? '{}') as Record<string, string>;
    expect(body.code).toBe('e2e-code');
    expect(body.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    return route.fulfill({ json: { token: TOKEN, scope: 'repo' } });
  });

  await context.route(`${API}/**`, async (route) => {
    const request = route.request();
    const method = request.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
    authHeaders.push(request.headers().authorization);
    const path = request.url().slice(API.length);
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    const json = (status: number, data: unknown) =>
      route.fulfill({ status, json: data, headers: { 'access-control-allow-origin': '*' } });
    const repoJson = (name: string) => ({
      name,
      full_name: `asha/${name}`,
      html_url: `https://github.com/asha/${name}`,
      default_branch: 'main',
      private: false,
      owner: { login: 'asha' },
    });

    if (path === '/user') return json(200, { login: 'asha' });
    if (path === '/user/repos' && method === 'POST') {
      const name = String(body.name);
      const readme = Buffer.from(`# ${name}\n`);
      blobs.set(gitSha(readme), readme);
      const tree = addTree(new Map([['README.md', gitSha(readme)]]));
      commits.set('c0', { tree, parent: null });
      repos.set(name, { ref: 'c0', pages: false });
      return json(201, repoJson(name));
    }
    const m = /^\/repos\/asha\/([^/]+)(\/.*)?$/.exec(path);
    const name = decodeURIComponent(m?.[1] ?? '');
    const repo = repos.get(name);
    if (!repo) return json(404, { message: 'Not Found' });
    const rest = m?.[2] ?? '';
    if (rest === '') return json(200, repoJson(name));
    if (rest === '/git/ref/heads/main') return json(200, { object: { sha: repo.ref } });
    if (rest.startsWith('/git/commits/')) {
      return json(200, { tree: { sha: commits.get(rest.split('/').pop() ?? '')?.tree } });
    }
    if (rest.startsWith('/git/trees/') && method === 'GET') {
      const id = rest.slice('/git/trees/'.length).split('?')[0] ?? '';
      const tree = [...(trees.get(id) ?? [])].map(([p, sha]) => ({ path: p, sha, type: 'blob' }));
      return json(200, { tree, truncated: false });
    }
    if (rest === '/git/blobs') {
      const bytes = Buffer.from(String(body.content), 'base64');
      blobs.set(gitSha(bytes), bytes);
      return json(201, { sha: gitSha(bytes) });
    }
    if (rest === '/git/trees') {
      const files = new Map<string, string>();
      for (const e of body.tree as Record<string, string>[]) {
        if (typeof e.content === 'string') {
          const bytes = Buffer.from(e.content, 'utf8');
          blobs.set(gitSha(bytes), bytes);
          files.set(e.path ?? '', gitSha(bytes));
        } else files.set(e.path ?? '', e.sha ?? '');
      }
      return json(201, { sha: addTree(files) });
    }
    if (rest === '/git/commits') {
      const id = `c${(n += 1)}`;
      commits.set(id, { tree: String(body.tree), parent: (body.parents as string[])[0] ?? null });
      return json(201, { sha: id });
    }
    if (rest === '/git/refs/heads/main') {
      repo.ref = String(body.sha);
      return json(200, {});
    }
    if (rest === '/pages' && method === 'POST') {
      if (repo.pages) return json(409, {});
      repo.pages = true;
      return json(201, { html_url: `https://asha.github.io/${name}/` });
    }
    if (rest === '/pages') return json(200, { html_url: `https://asha.github.io/${name}/` });
    return json(404, { message: 'Not Found' });
  });

  return { filesOf, authHeaders, repos };
}

test('connect GitHub, push a new repository with Pages, matching the ZIP exactly', async ({
  page,
  context,
}) => {
  const gh = await fakeGitHub(context);
  await page.goto('/');
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();

  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: /Publish to GitHub/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish to GitHub' });
  await dialog.getByLabel('Repository name').fill('ira-site');
  await expect(dialog.getByLabel(/Turn on GitHub Pages/)).toBeChecked();

  const popup = page.waitForEvent('popup');
  await dialog.getByRole('button', { name: 'Connect GitHub and publish' }).click();
  await popup;

  await expect(dialog.getByText('Your site is on GitHub.')).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByRole('link', { name: /Open your live site/ })).toHaveAttribute(
    'href',
    'https://asha.github.io/ira-site/',
  );
  expect(gh.authHeaders.every((h) => h === `Bearer ${TOKEN}`)).toBe(true);
  await dialog.getByRole('button', { name: 'Done' }).click();

  // The ZIP download holds exactly the pushed files, byte for byte.
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download website/ }).click(),
  ]);
  const zipped = unzipSync(new Uint8Array(await readFile(await download.path())));
  const pushed = gh.filesOf('ira-site');
  expect([...pushed.keys()].sort()).toEqual(Object.keys(zipped).sort());
  for (const [path, bytes] of pushed) {
    expect(Buffer.compare(bytes, Buffer.from(zipped[path] ?? [])), path).toBe(0);
  }

  // The token is never saved: not in browser storage, not in the project.
  const stored = await page.evaluate(async () => {
    const dump: string[] = [JSON.stringify(localStorage), JSON.stringify(sessionStorage)];
    for (const info of await indexedDB.databases()) {
      if (!info.name) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(info.name as string);
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      for (const store of Array.from(db.objectStoreNames)) {
        const rows = await new Promise<unknown[]>((resolve) => {
          const req = db.transaction(store).objectStore(store).getAll();
          req.onsuccess = () => resolve(req.result as unknown[]);
        });
        dump.push(JSON.stringify(rows));
      }
      db.close();
    }
    return dump.join('\n');
  });
  expect(stored).not.toContain(TOKEN);
  expect(Buffer.from(zipped['.klinth/project.json'] ?? []).toString()).not.toContain(TOKEN);

  // After a reload the access is gone, and the repository name is remembered for updates.
  await page.reload();
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: /Publish to GitHub/ }).click();
  await expect(dialog.getByLabel('Repository name')).toHaveValue('ira-site');
  await expect(dialog.getByLabel(/One I published before/)).toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Connect GitHub and publish' })).toBeVisible();
});

test('re-import a site ZIP brings back the pictures', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Personal portfolio/ }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download website/ }).click(),
  ]);
  const zipPath = await download.path();

  await page.getByRole('button', { name: 'All projects' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open a project file or site ZIP' }).click();
  await (await chooser).setFiles(zipPath);
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  // No "upload again" note: every file came back with the ZIP.
  await expect(page.getByText(/not included/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Export' }).click();
  const [again] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Download website/ }).click(),
  ]);
  const first = unzipSync(new Uint8Array(await readFile(zipPath)));
  const second = unzipSync(new Uint8Array(await readFile(await again.path())));
  expect(Object.keys(second).sort()).toEqual(Object.keys(first).sort());
  for (const path of Object.keys(first)) {
    expect(
      Buffer.compare(Buffer.from(second[path] ?? []), Buffer.from(first[path] ?? [])),
      path,
    ).toBe(0);
  }
});
