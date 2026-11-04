import { assertSafePaths, siteFileBytes, type SiteFile } from '@klinth/core';

/**
 * Publishing to GitHub straight from the browser with the user's token
 * (kept in memory only). Uses the Git Data API: blobs, one tree with exactly
 * the exported files, one commit, then the branch moves to it. Afterwards the
 * pushed tree is read back and compared file by file with what the ZIP holds.
 */

export const GITHUB_API = 'https://api.github.com';
const API_VERSION = '2022-11-28';

export type GitHubErrorKind =
  | 'signed_out'
  | 'name_taken'
  | 'not_found'
  | 'not_klinth'
  | 'slow_down'
  | 'forbidden'
  | 'offline'
  | 'mismatch'
  | 'failed';

export class GitHubError extends Error {
  constructor(
    readonly kind: GitHubErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

const MESSAGES: Record<GitHubErrorKind, string> = {
  signed_out: 'GitHub signed you out, or the access was removed. Please connect again.',
  name_taken: 'You already have a repository with this name. Pick another name, or update it.',
  not_found: 'Klinth could not find that repository in your GitHub account.',
  not_klinth:
    'That repository was not made with Klinth, so Klinth will not replace its files. Pick a new name.',
  slow_down: 'GitHub asked Klinth to slow down. Wait a few minutes, then try again.',
  forbidden: 'GitHub did not allow this. Check that you gave Klinth access, then connect again.',
  offline: 'GitHub could not be reached. Check your internet connection and try again.',
  mismatch: 'The files on GitHub do not match your site. Please publish again.',
  failed: 'GitHub could not finish publishing. Please try again in a little while.',
};

const fail = (kind: GitHubErrorKind): GitHubError => new GitHubError(kind, MESSAGES[kind]);

/** GitHub's own rules: letters, digits, `.`, `-`, `_`, up to 100 characters. */
export function validRepoName(name: string): boolean {
  return /^[A-Za-z0-9._-]{1,100}$/.test(name) && name !== '.' && name !== '..';
}

/** A repository name from the site title: "Asha Rao Studio" -> "asha-rao-studio". */
export function suggestRepoName(title: string): string {
  const slug = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'my-website';
}

/** Git's id for a file: SHA-1 of "blob <size>\0" + bytes. Same bytes, same id. */
export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const all = new Uint8Array(header.byteLength + bytes.byteLength);
  all.set(header);
  all.set(bytes, header.byteLength);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', all));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** True when the bytes are text Git can take inline (valid UTF-8, no NUL). */
function asInlineText(file: SiteFile, bytes: Uint8Array): string | null {
  if (typeof file.content !== 'string' || bytes.byteLength === 0) return null;
  return file.content.includes('\0') ? null : file.content;
}

export interface GitHubClient {
  token: string;
  fetch?: typeof fetch;
  /** Stops publishing between requests (the branch only moves at the very end). */
  signal?: AbortSignal;
}

interface Repo {
  name: string;
  full_name: string;
  html_url: string;
  default_branch: string;
  private: boolean;
  owner: { login: string };
}

async function request<T>(
  client: GitHubClient,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const doFetch = client.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${GITHUB_API}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${client.token}`,
        'x-github-api-version': API_VERSION,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: client.signal,
    });
  } catch {
    if (client.signal?.aborted) throw new GitHubError('failed', 'Publishing was stopped.');
    throw fail('offline');
  }
  const data = (await res.json().catch(() => null)) as T;
  if (res.ok) return { status: res.status, data };
  if (res.status === 401) throw fail('signed_out');
  const limited =
    res.status === 429 ||
    res.headers.get('x-ratelimit-remaining') === '0' ||
    res.headers.get('retry-after') !== null;
  if (limited) throw fail('slow_down');
  return { status: res.status, data };
}

async function ok<T>(
  client: GitHubClient,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await request<T>(client, method, path, body);
  if (res.status >= 400) throw fail(res.status === 403 ? 'forbidden' : 'failed');
  return res.data;
}

const seg = (value: string): string => encodeURIComponent(value);

export async function getLogin(client: GitHubClient): Promise<string> {
  const user = await ok<{ login: string }>(client, 'GET', '/user');
  return user.login;
}

async function createRepo(
  client: GitHubClient,
  name: string,
  isPrivate: boolean,
  description: string,
): Promise<Repo> {
  // auto_init gives the repository a first commit: the Git Data API cannot write to an empty one.
  const res = await request<Repo & { errors?: { message?: string }[] }>(
    client,
    'POST',
    '/user/repos',
    { name, private: isPrivate, auto_init: true, description: description.slice(0, 300) },
  );
  if (res.status === 422) {
    const taken = (res.data?.errors ?? []).some((e) => /already exists/i.test(e.message ?? ''));
    throw fail(taken ? 'name_taken' : 'failed');
  }
  if (res.status === 403) throw fail('forbidden');
  if (res.status >= 400) throw fail('failed');
  return res.data;
}

async function getRepo(client: GitHubClient, owner: string, name: string): Promise<Repo> {
  const res = await request<Repo>(client, 'GET', `/repos/${seg(owner)}/${seg(name)}`);
  if (res.status === 404) throw fail('not_found');
  if (res.status >= 400) throw fail('failed');
  return res.data;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The branch's latest commit. A new repository may need a moment before it exists. */
async function headCommit(client: GitHubClient, repo: Repo, waitMs: number): Promise<string> {
  const path = `/repos/${seg(repo.owner.login)}/${seg(repo.name)}/git/ref/heads/${seg(repo.default_branch)}`;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const res = await request<{ object: { sha: string } }>(client, 'GET', path);
    if (res.status < 400) return res.data.object.sha;
    if (res.status !== 404 && res.status !== 409) throw fail('failed');
    await sleep(waitMs * (attempt + 1));
  }
  throw fail('failed');
}

interface TreeEntry {
  path: string;
  mode: string;
  type: string;
  sha: string;
}

async function readTree(
  client: GitHubClient,
  repo: Repo,
  treeSha: string,
): Promise<Map<string, string>> {
  const tree = await ok<{ tree: TreeEntry[]; truncated: boolean }>(
    client,
    'GET',
    `/repos/${seg(repo.owner.login)}/${seg(repo.name)}/git/trees/${seg(treeSha)}?recursive=1`,
  );
  if (tree.truncated) throw fail('failed');
  return new Map(tree.tree.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]));
}

export type PublishStep = 'repo' | 'upload' | 'save' | 'check' | 'pages';

export interface PublishOptions {
  login: string;
  name: string;
  /** "create" makes a new repository; "update" replaces the files of an existing Klinth one. */
  mode: 'create' | 'update';
  private: boolean;
  pages: boolean;
  description: string;
  onProgress?: (step: PublishStep, done?: number, total?: number) => void;
  /** Wait between checks for a new repository's first commit (tests pass 0). */
  waitMs?: number;
}

export interface PublishResult {
  repoUrl: string;
  fullName: string;
  /** The live address, when GitHub Pages is on. */
  pagesUrl: string | null;
  /** False when the files on GitHub were already exactly these. */
  changed: boolean;
  /** Set when Pages could not be turned on (the push itself worked). */
  pagesProblem: string | null;
}

async function enablePages(
  client: GitHubClient,
  repo: Repo,
): Promise<{ url: string | null; problem: string | null }> {
  const base = `/repos/${seg(repo.owner.login)}/${seg(repo.name)}/pages`;
  const res = await request<{ html_url?: string }>(client, 'POST', base, {
    build_type: 'legacy',
    source: { branch: repo.default_branch, path: '/' },
  });
  if (res.status === 201) return { url: res.data.html_url ?? null, problem: null };
  if (res.status === 409) {
    // Already on: read its address.
    const current = await request<{ html_url?: string }>(client, 'GET', base);
    return { url: current.status < 400 ? (current.data.html_url ?? null) : null, problem: null };
  }
  return {
    url: null,
    problem:
      'Your files are on GitHub, but GitHub Pages could not be turned on. Open the repository’s Settings, then Pages, and pick the main branch.',
  };
}

/**
 * Puts exactly `files` on the default branch of a GitHub repository.
 * Throws GitHubError with a plain message.
 */
export async function publish(
  client: GitHubClient,
  files: readonly SiteFile[],
  options: PublishOptions,
): Promise<PublishResult> {
  if (!validRepoName(options.name)) {
    throw new GitHubError(
      'failed',
      'Repository names can use letters, numbers, dots, dashes and underscores only.',
    );
  }
  assertSafePaths(files);
  const progress = options.onProgress ?? (() => undefined);
  const waitMs = options.waitMs ?? 700;

  progress('repo');
  const repo =
    options.mode === 'create'
      ? await createRepo(client, options.name, options.private, options.description)
      : await getRepo(client, options.login, options.name);
  const repoPath = `/repos/${seg(repo.owner.login)}/${seg(repo.name)}`;
  const head = await headCommit(client, repo, waitMs);
  const headTree = (
    await ok<{ tree: { sha: string } }>(client, 'GET', `${repoPath}/git/commits/${seg(head)}`)
  ).tree.sha;
  const existing = await readTree(client, repo, headTree);
  if (options.mode === 'update' && !existing.has('.klinth/project.json')) throw fail('not_klinth');

  // Local ids of every file: these are what the ZIP holds, byte for byte.
  const local = new Map<string, string>();
  const entries: Record<string, string>[] = [];
  const uploads: { path: string; bytes: Uint8Array; sha: string }[] = [];
  for (const file of files) {
    const bytes = siteFileBytes(file);
    const sha = await gitBlobSha(bytes);
    local.set(file.path, sha);
    const text = asInlineText(file, bytes);
    if (existing.get(file.path) === sha) {
      entries.push({ path: file.path, mode: '100644', type: 'blob', sha });
    } else if (text !== null) {
      entries.push({ path: file.path, mode: '100644', type: 'blob', content: text });
    } else {
      uploads.push({ path: file.path, bytes, sha });
    }
  }

  // One at a time: GitHub asks apps not to send content requests in parallel.
  progress('upload', 0, uploads.length);
  for (const [i, upload] of uploads.entries()) {
    const blob = await ok<{ sha: string }>(client, 'POST', `${repoPath}/git/blobs`, {
      content: toBase64(upload.bytes),
      encoding: 'base64',
    });
    if (blob.sha !== upload.sha) throw fail('mismatch');
    entries.push({ path: upload.path, mode: '100644', type: 'blob', sha: blob.sha });
    progress('upload', i + 1, uploads.length);
  }

  progress('save');
  // No base tree: the new tree holds exactly these files, so old ones are removed.
  const tree = await ok<{ sha: string }>(client, 'POST', `${repoPath}/git/trees`, {
    tree: entries,
  });
  const changed = tree.sha !== headTree;
  if (changed) {
    const commit = await ok<{ sha: string }>(client, 'POST', `${repoPath}/git/commits`, {
      message: options.mode === 'create' ? 'Publish website' : 'Update website',
      tree: tree.sha,
      parents: [head],
    });
    const moved = await request(
      client,
      'PATCH',
      `${repoPath}/git/refs/heads/${seg(repo.default_branch)}`,
      { sha: commit.sha, force: false },
    );
    if (moved.status === 422) {
      throw new GitHubError(
        'failed',
        'The repository changed on GitHub while publishing. Please publish again.',
      );
    }
    if (moved.status >= 400) throw fail(moved.status === 403 ? 'forbidden' : 'failed');
  }

  progress('check');
  const pushed = await readTree(client, repo, tree.sha);
  const same =
    pushed.size === local.size && [...local].every(([path, sha]) => pushed.get(path) === sha);
  if (!same) throw fail('mismatch');

  let pagesUrl: string | null = null;
  let pagesProblem: string | null = null;
  if (options.pages && !repo.private) {
    progress('pages');
    ({ url: pagesUrl, problem: pagesProblem } = await enablePages(client, repo));
  }
  return { repoUrl: repo.html_url, fullName: repo.full_name, pagesUrl, changed, pagesProblem };
}
