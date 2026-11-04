/* eslint-disable @typescript-eslint/no-non-null-assertion -- the fake server indexes known fixtures */
// @vitest-environment node
import {
  buildExport,
  buildZip,
  sampleProject,
  siteFileBytes,
  themeFonts,
  type Project,
  type SiteFile,
} from '@klinth/core';
import { unzipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  GITHUB_API,
  GitHubError,
  gitBlobSha,
  publish,
  suggestRepoName,
  validRepoName,
  type PublishOptions,
} from './api.ts';

const TOKEN = 'gho_testtoken0123456789abcdefghijklmnopqrs';
const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
const assetData = new Map([['img1', new Uint8Array([0, 1, 2, 255])]]);
const fontData = (project: Project) =>
  new Map(themeFonts(project.theme).map((f) => [f.file, new Uint8Array([0x77, 0x4f, 0x46, 0x32])]));
const siteFiles = (project = clone()): SiteFile[] =>
  buildExport(project, assetData, fontData(project));

/** A tiny in-memory GitHub that stores real Git blob ids. */
class FakeGitHub {
  blobs = new Map<string, Uint8Array>();
  trees = new Map<string, Map<string, string>>();
  commits = new Map<string, { tree: string; parents: string[] }>();
  repos = new Map<string, { ref: string; private: boolean; pages: boolean }>();
  calls: { method: string; url: string; auth: string | null }[] = [];
  /** Hooks to break things in a test. */
  failWith: { match: RegExp; status: number; headers?: Record<string, string> } | null = null;
  corruptBlobs = false;
  private counter = 0;

  async addTree(files: Map<string, string>): Promise<string> {
    const key = [...files].sort().join('\n');
    const sha = await gitBlobSha(new TextEncoder().encode(`tree:${key}`));
    this.trees.set(sha, files);
    return sha;
  }

  async seedRepo(name: string, files: Record<string, string>): Promise<void> {
    const map = new Map<string, string>();
    for (const [path, text] of Object.entries(files)) {
      const bytes = new TextEncoder().encode(text);
      const sha = await gitBlobSha(bytes);
      this.blobs.set(sha, bytes);
      map.set(path, sha);
    }
    const tree = await this.addTree(map);
    const commit = `c${(this.counter += 1)}`;
    this.commits.set(commit, { tree, parents: [] });
    this.repos.set(name, { ref: commit, private: false, pages: false });
  }

  /** Files on the default branch, path -> bytes. */
  filesOf(name: string): Map<string, Uint8Array> {
    const repo = this.repos.get(name);
    const tree = this.trees.get(this.commits.get(repo?.ref ?? '')?.tree ?? '');
    return new Map([...(tree ?? [])].map(([path, sha]) => [path, this.blobs.get(sha)!]));
  }

  repoJson(name: string) {
    return {
      name,
      full_name: `asha/${name}`,
      html_url: `https://github.com/asha/${name}`,
      default_branch: 'main',
      private: this.repos.get(name)?.private ?? false,
      owner: { login: 'asha' },
    };
  }

  fetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const auth = new Headers(init?.headers).get('authorization');
    this.calls.push({ method, url, auth });
    const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { status, headers });
    if (this.failWith?.match.test(`${method} ${url}`)) {
      return reply(this.failWith.status, { message: 'nope' }, this.failWith.headers);
    }
    if (!url.startsWith(GITHUB_API)) throw new Error('wrong host');
    if (auth !== `Bearer ${TOKEN}`) return reply(401, { message: 'Bad credentials' });
    const path = url.slice(GITHUB_API.length);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    if (path === '/user') return reply(200, { login: 'asha' });
    if (path === '/user/repos' && method === 'POST') {
      const name = String(body.name);
      if (this.repos.has(name)) {
        return reply(422, { errors: [{ message: 'name already exists on this account' }] });
      }
      await this.seedRepo(name, { 'README.md': `# ${name}\n` });
      this.repos.get(name)!.private = Boolean(body.private);
      return reply(201, this.repoJson(name));
    }
    const m = /^\/repos\/asha\/([^/]+)(\/.*)?$/.exec(path);
    const repo = m ? this.repos.get(decodeURIComponent(m[1]!)) : undefined;
    if (!m || !repo) return reply(404, { message: 'Not Found' });
    const name = decodeURIComponent(m[1]!);
    const rest = m[2] ?? '';

    if (rest === '') return reply(200, this.repoJson(name));
    if (rest === '/git/ref/heads/main') return reply(200, { object: { sha: repo.ref } });
    if (rest.startsWith('/git/commits/') && method === 'GET') {
      const commit = this.commits.get(rest.slice('/git/commits/'.length));
      return commit ? reply(200, { tree: { sha: commit.tree } }) : reply(404, {});
    }
    if (rest.startsWith('/git/trees/') && method === 'GET') {
      const sha = rest.slice('/git/trees/'.length).split('?')[0]!;
      const tree = this.trees.get(sha);
      if (!tree) return reply(404, {});
      const entries = [...tree].map(([p, s]) => ({
        path: p,
        type: 'blob',
        sha: s,
        mode: '100644',
      }));
      return reply(200, { sha, tree: entries, truncated: false });
    }
    if (rest === '/git/blobs' && method === 'POST') {
      const bytes = Uint8Array.from(atob(String(body.content)), (c) => c.charCodeAt(0));
      const stored = this.corruptBlobs ? new Uint8Array([...bytes, 0]) : bytes;
      const sha = await gitBlobSha(stored);
      this.blobs.set(sha, stored);
      return reply(201, { sha });
    }
    if (rest === '/git/trees' && method === 'POST') {
      const files = new Map<string, string>();
      for (const entry of body.tree as Record<string, string>[]) {
        if (entry.content !== undefined) {
          const bytes = new TextEncoder().encode(entry.content);
          const sha = await gitBlobSha(bytes);
          this.blobs.set(sha, bytes);
          files.set(entry.path!, sha);
        } else {
          if (!this.blobs.has(entry.sha!)) return reply(422, { message: 'bad sha' });
          files.set(entry.path!, entry.sha!);
        }
      }
      return reply(201, { sha: await this.addTree(files) });
    }
    if (rest === '/git/commits' && method === 'POST') {
      const sha = `c${(this.counter += 1)}`;
      this.commits.set(sha, { tree: String(body.tree), parents: body.parents as string[] });
      return reply(201, { sha });
    }
    if (rest === '/git/refs/heads/main' && method === 'PATCH') {
      const parent = this.commits.get(String(body.sha))?.parents[0];
      if (parent !== repo.ref) return reply(422, { message: 'not a fast forward' });
      repo.ref = String(body.sha);
      return reply(200, {});
    }
    if (rest === '/pages' && method === 'POST') {
      if (repo.pages) return reply(409, { message: 'already enabled' });
      repo.pages = true;
      return reply(201, { html_url: `https://asha.github.io/${name}/` });
    }
    if (rest === '/pages' && method === 'GET') {
      return reply(200, { html_url: `https://asha.github.io/${name}/` });
    }
    return reply(404, { message: 'Not Found' });
  };
}

let gh: FakeGitHub;
const client = () => ({ token: TOKEN, fetch: gh.fetch });
const options = (extra: Partial<PublishOptions> = {}): PublishOptions => ({
  login: 'asha',
  name: 'my-site',
  mode: 'create',
  private: false,
  pages: true,
  description: 'A site',
  waitMs: 0,
  ...extra,
});

beforeEach(() => {
  gh = new FakeGitHub();
});

describe('helpers', () => {
  it('computes the same blob ids as Git', async () => {
    expect(await gitBlobSha(new Uint8Array())).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    expect(await gitBlobSha(new TextEncoder().encode('hello\n'))).toBe(
      'ce013625030ba8dba906f756967f9e9ca394464a',
    );
  });

  it('checks and suggests repository names', () => {
    expect(validRepoName('my-site.v2_ok')).toBe(true);
    for (const bad of ['', '.', '..', 'has space', 'a/b', 'x'.repeat(101)]) {
      expect(validRepoName(bad)).toBe(false);
    }
    expect(suggestRepoName('Asha Rao — Studio!')).toBe('asha-rao-studio');
    expect(suggestRepoName('★★★')).toBe('my-website');
  });
});

describe('publish', () => {
  it('pushes exactly the files of the ZIP, byte for byte, and turns on Pages', async () => {
    const files = siteFiles();
    const steps: string[] = [];
    const result = await publish(client(), files, {
      ...options(),
      onProgress: (step) => steps.push(step),
    });

    const zipped = unzipSync(buildZip(files));
    const pushed = gh.filesOf('my-site');
    expect([...pushed.keys()].sort()).toEqual(Object.keys(zipped).sort());
    for (const [path, bytes] of pushed) expect(bytes, path).toEqual(zipped[path]);
    // The starter README GitHub made is replaced by the site's own.
    expect(new TextDecoder().decode(pushed.get('README.md'))).toContain(sampleProject.meta.title);

    expect(result).toEqual({
      repoUrl: 'https://github.com/asha/my-site',
      fullName: 'asha/my-site',
      pagesUrl: 'https://asha.github.io/my-site/',
      changed: true,
      pagesProblem: null,
    });
    expect(new Set(steps)).toEqual(new Set(['repo', 'upload', 'save', 'check', 'pages']));
  });

  it('sends the token only to api.github.com, only in the Authorization header', async () => {
    await publish(client(), siteFiles(), options());
    expect(gh.calls.length).toBeGreaterThan(5);
    for (const call of gh.calls) {
      expect(call.url.startsWith(`${GITHUB_API}/`)).toBe(true);
      expect(call.url).not.toContain(TOKEN);
      expect(call.auth).toBe(`Bearer ${TOKEN}`);
    }
  });

  it('updates a repository it published before, reusing unchanged files', async () => {
    await publish(client(), siteFiles(), options());
    gh.calls = [];

    const again = await publish(client(), siteFiles(), options({ mode: 'update' }));
    expect(again.changed).toBe(false);
    expect(gh.calls.some((c) => c.url.endsWith('/git/blobs'))).toBe(false);

    const edited = clone();
    edited.meta.title = 'A new title';
    const files = siteFiles(edited);
    const result = await publish(client(), files, options({ mode: 'update' }));
    expect(result.changed).toBe(true);
    expect(result.pagesUrl).toBe('https://asha.github.io/my-site/'); // already on: 409 handled
    const zipped = unzipSync(buildZip(files));
    for (const [path, bytes] of gh.filesOf('my-site')) expect(bytes, path).toEqual(zipped[path]);
  });

  it('removes files that are no longer part of the site', async () => {
    await publish(client(), siteFiles(), options());
    const smaller = siteFiles().filter((f) => !f.path.startsWith('assets/'));
    await publish(client(), smaller, options({ mode: 'update' }));
    expect([...gh.filesOf('my-site').keys()].some((p) => p.startsWith('assets/'))).toBe(false);
  });

  it('says plainly when the name is taken, and offers nothing destructive', async () => {
    await gh.seedRepo('my-site', { 'notes.txt': 'mine' });
    await expect(publish(client(), siteFiles(), options())).rejects.toMatchObject({
      kind: 'name_taken',
    });
    expect(new TextDecoder().decode(gh.filesOf('my-site').get('notes.txt'))).toBe('mine');
  });

  it('never replaces a repository that Klinth did not make', async () => {
    await gh.seedRepo('my-site', { 'notes.txt': 'mine' });
    await expect(publish(client(), siteFiles(), options({ mode: 'update' }))).rejects.toMatchObject(
      { kind: 'not_klinth' },
    );
    expect([...gh.filesOf('my-site').keys()]).toEqual(['notes.txt']);
  });

  it('reports a missing repository', async () => {
    await expect(
      publish(client(), siteFiles(), options({ mode: 'update', name: 'nope' })),
    ).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('turns a revoked token into "connect again"', async () => {
    await expect(
      publish({ token: 'gho_revoked', fetch: gh.fetch }, siteFiles(), options()),
    ).rejects.toMatchObject({ kind: 'signed_out' });
  });

  it('turns GitHub rate limits into "slow down"', async () => {
    gh.failWith = { match: /\/git\/blobs/, status: 403, headers: { 'x-ratelimit-remaining': '0' } };
    await expect(publish(client(), siteFiles(), options())).rejects.toMatchObject({
      kind: 'slow_down',
    });
    gh.failWith = { match: /\/git\/trees$/, status: 429, headers: { 'retry-after': '60' } };
    await expect(publish(client(), siteFiles(), options({ name: 'other' }))).rejects.toMatchObject({
      kind: 'slow_down',
    });
  });

  it('reports a lost connection', async () => {
    const offline: typeof fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(
      publish({ token: TOKEN, fetch: offline }, siteFiles(), options()),
    ).rejects.toMatchObject({ kind: 'offline' });
  });

  it('refuses to finish when GitHub stored different bytes', async () => {
    gh.corruptBlobs = true;
    await expect(publish(client(), siteFiles(), options())).rejects.toMatchObject({
      kind: 'mismatch',
    });
    // The branch never moved to the broken files.
    expect([...gh.filesOf('my-site').keys()]).toEqual(['README.md']);
  });

  it('still succeeds when Pages cannot be turned on, with a plain note', async () => {
    gh.failWith = { match: /POST .*\/pages$/, status: 403 };
    const result = await publish(client(), siteFiles(), options());
    expect(result.pagesUrl).toBeNull();
    expect(result.pagesProblem).toMatch(/Settings, then Pages/);
  });

  it('skips Pages for private repositories', async () => {
    const result = await publish(client(), siteFiles(), options({ private: true }));
    expect(result.pagesUrl).toBeNull();
    expect(gh.calls.some((c) => c.url.endsWith('/pages'))).toBe(false);
  });

  it('stops between requests when asked', async () => {
    const controller = new AbortController();
    const stopping: typeof fetch = async (input, init) => {
      if (String(input).endsWith('/git/trees')) controller.abort();
      if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      return gh.fetch(input, init);
    };
    await expect(
      publish({ token: TOKEN, fetch: stopping, signal: controller.signal }, siteFiles(), options()),
    ).rejects.toThrow('stopped');
    expect([...gh.filesOf('my-site').keys()]).toEqual(['README.md']);
  });

  it('rejects bad names and unsafe paths before calling GitHub', async () => {
    await expect(publish(client(), siteFiles(), options({ name: 'a b' }))).rejects.toBeInstanceOf(
      GitHubError,
    );
    await expect(
      publish(client(), [{ path: '../evil.html', content: 'x' }], options()),
    ).rejects.toThrow(/unsafe/);
    expect(gh.calls).toEqual([]);
  });

  it('keeps every file identical for a large site with many binaries', async () => {
    const files: SiteFile[] = [
      ...siteFiles(),
      ...Array.from({ length: 30 }, (_, i) => ({
        path: `assets/extra-${i}.webp`,
        content: Uint8Array.from({ length: 70_000 }, (_, j) => (i * 31 + j) % 256),
      })),
    ];
    await publish(client(), files, options());
    const pushed = gh.filesOf('my-site');
    expect(pushed.size).toBe(files.length);
    for (const f of files) expect(pushed.get(f.path), f.path).toEqual(siteFileBytes(f));
  });
});
