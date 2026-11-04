// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHANNEL,
  authorizeUrl,
  connectGitHub,
  hasScope,
  neededScope,
  prepareSignIn,
  useGitHub,
} from './oauth.ts';

const ORIGIN = 'http://localhost:5173';
const TOKEN = 'gho_secrettoken0123456789abcdefghijklmnop';

/** Every write to any browser storage is recorded here. */
const writes: string[] = [];
function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => {
      writes.push(`${k}=${v}`);
      data.set(k, v);
    },
  };
}

let open: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writes.length = 0;
  open = vi.fn(() => ({}));
  vi.stubGlobal('window', { location: { origin: ORIGIN }, open });
  vi.stubGlobal('localStorage', fakeStorage());
  vi.stubGlobal('sessionStorage', fakeStorage());
  useGitHub.setState({ session: null });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const sendBack = (message: Record<string, unknown>) => {
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage({ type: 'klinth-github', code: null, error: null, ...message });
  channel.close();
};

describe('sign-in pieces', () => {
  it('makes a PKCE pair (S256) and a random state', async () => {
    const a = await prepareSignIn();
    const b = await prepareSignIn();
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.state).not.toBe(b.state);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(a.verifier));
    const expected = Buffer.from(digest).toString('base64url');
    expect(a.challenge).toBe(expected);
  });

  it('builds the GitHub address with the callback page and the challenge', async () => {
    const pending = await prepareSignIn();
    const url = new URL(authorizeUrl('Iv1.app', pending, 'public_repo'));
    expect(url.origin).toBe('https://github.com');
    expect(url.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/github-callback.html`);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(pending.challenge);
    expect(url.searchParams.get('scope')).toBe('public_repo');
    expect(url.toString()).not.toContain(pending.verifier);
  });

  it('asks for the smallest access that does the job', () => {
    expect(neededScope({ private: false, pages: false })).toBe('public_repo');
    expect(neededScope({ private: false, pages: true })).toBe('repo');
    expect(neededScope({ private: true, pages: false })).toBe('repo');
    const narrow = { token: 't', login: 'a', scopes: ['public_repo'] };
    expect(hasScope(narrow, 'public_repo')).toBe(true);
    expect(hasScope(narrow, 'repo')).toBe(false);
    expect(hasScope({ ...narrow, scopes: ['repo'] }, 'public_repo')).toBe(true);
    expect(hasScope(null, 'public_repo')).toBe(false);
  });
});

describe('connectGitHub', () => {
  it('opens the window at once, takes only its own code, and never stores the token', async () => {
    const pending = await prepareSignIn();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ token: TOKEN, scope: 'public_repo' }), { status: 200 }),
      );
    const controller = new AbortController();
    const result = connectGitHub('Iv1.app', pending, 'public_repo', controller.signal);
    expect(open).toHaveBeenCalledTimes(1); // before any await: pop-up blockers allow it

    sendBack({ state: 'someone-else', code: 'wrong-code' });
    sendBack({ state: pending.state, code: 'right-code' });
    await expect(result).resolves.toEqual({ token: TOKEN, scopes: ['public_repo'] });

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe('http://localhost:8787/github/oauth');
    expect(JSON.parse(String(init?.body))).toEqual({
      code: 'right-code',
      codeVerifier: pending.verifier,
      redirectUri: `${ORIGIN}/github-callback.html`,
    });
    expect(writes).toEqual([]);
  });

  it('explains when the user says no on GitHub', async () => {
    const pending = await prepareSignIn();
    const result = connectGitHub('Iv1.app', pending, 'repo', new AbortController().signal);
    sendBack({ state: pending.state, error: 'access_denied' });
    await expect(result).rejects.toThrow('You did not give Klinth access');
  });

  it('explains a blocked pop-up', async () => {
    open.mockReturnValue(null);
    const pending = await prepareSignIn();
    await expect(
      connectGitHub('Iv1.app', pending, 'repo', new AbortController().signal),
    ).rejects.toThrow(/blocked the GitHub window/);
  });

  it('passes on the Worker’s plain message', async () => {
    const pending = await prepareSignIn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'The GitHub sign-in took too long.' }), {
        status: 400,
      }),
    );
    const result = connectGitHub('Iv1.app', pending, 'repo', new AbortController().signal);
    sendBack({ state: pending.state, code: 'old' });
    await expect(result).rejects.toThrow('took too long');
  });

  it('can be stopped', async () => {
    const pending = await prepareSignIn();
    const controller = new AbortController();
    const result = connectGitHub('Iv1.app', pending, 'repo', controller.signal);
    controller.abort();
    await expect(result).rejects.toThrow('stopped');
  });
});

describe('the GitHub session', () => {
  it('lives in memory only', () => {
    useGitHub.getState().setSession({ token: TOKEN, login: 'asha', scopes: ['repo'] });
    expect(writes).toEqual([]);
    expect(JSON.stringify(localStorage)).not.toContain(TOKEN);
    useGitHub.getState().setSession(null);
    expect(useGitHub.getState().session).toBeNull();
  });
});
