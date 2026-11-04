import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { GITHUB_TOKEN_URL } from './github.ts';
import { handle, type Env } from './index.ts';

const ORIGIN = 'http://localhost:5173';
const TOKEN = 'gho_0123456789abcdefghijklmnopqrstuvwxyzAB';
const SECRET = 'client-secret-value-0123456789';
const VERIFIER = 'v'.repeat(43);
const REDIRECT = `${ORIGIN}/github-callback.html`;

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ALLOWED_ORIGINS: ORIGIN,
    GITHUB_CLIENT_ID: 'Iv1.clientid',
    GITHUB_CLIENT_SECRET: SECRET,
    BURST: { limit: async () => ({ success: true }) } as RateLimit,
    ...overrides,
  } as Env;
}

function oauth(body: unknown, origin: string | null = ORIGIN): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (origin) headers.Origin = origin;
  return new Request('https://api.test/github/oauth', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const good = { code: 'abc123def456', codeVerifier: VERIFIER, redirectUri: REDIRECT };

let fetchSpy: MockInstance<typeof fetch>;
let logs: string[];

beforeEach(() => {
  logs = [];
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  }
});
afterEach(() => vi.restoreAllMocks());

const upstream = (body: unknown, status = 200) =>
  fetchSpy.mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('/github/config', () => {
  it('gives the public app id to the editor only', async () => {
    const res = await handle(
      new Request('https://api.test/github/config', { headers: { Origin: ORIGIN } }),
      makeEnv(),
    );
    expect(await res.json()).toEqual({ clientId: 'Iv1.clientid' });
    const blocked = await handle(new Request('https://api.test/github/config'), makeEnv());
    expect(blocked.status).toBe(403);
  });

  it('says when GitHub is not set up, and never shows the secret', async () => {
    const res = await handle(
      new Request('https://api.test/github/config', { headers: { Origin: ORIGIN } }),
      makeEnv({ GITHUB_CLIENT_SECRET: '' }),
    );
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ clientId: null });
    expect(text).not.toContain(SECRET);
  });
});

describe('/github/oauth', () => {
  it('swaps the code for a token at the fixed GitHub address', async () => {
    upstream({ access_token: TOKEN, scope: 'public_repo', token_type: 'bearer' });
    const res = await handle(oauth(good), makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(await res.json()).toEqual({ token: TOKEN, scope: 'public_repo' });

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(GITHUB_TOKEN_URL);
    const sent = new URLSearchParams(String(init?.body));
    expect(sent.get('client_secret')).toBe(SECRET);
    expect(sent.get('code_verifier')).toBe(VERIFIER);
    expect(sent.get('redirect_uri')).toBe(REDIRECT);
  });

  it('never logs the code, token or secret', async () => {
    upstream({ access_token: TOKEN, scope: 'repo' });
    await handle(oauth(good), makeEnv());
    upstream({ error: 'bad_verification_code' });
    await handle(oauth(good), makeEnv());
    const all = logs.join('\n');
    expect(all).not.toContain(TOKEN);
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain(good.code);
    expect(all).not.toContain(VERIFIER);
    expect(logs).toEqual([
      JSON.stringify({ route: '/github/oauth', outcome: 'ok' }),
      JSON.stringify({ route: '/github/oauth', outcome: 'expired' }),
    ]);
  });

  it('turns an expired code into a plain message', async () => {
    upstream({ error: 'bad_verification_code', error_description: 'The code is incorrect' });
    const res = await handle(oauth(good), makeEnv());
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/connect again/);
  });

  it('reports a wrongly set up app as "not set up", without GitHub text', async () => {
    upstream({ error: 'incorrect_client_credentials', error_description: 'secret wrong' });
    const res = await handle(oauth(good), makeEnv());
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('secret wrong');
  });

  it('answers 503 when no app is configured, without calling GitHub', async () => {
    const res = await handle(oauth(good), makeEnv({ GITHUB_CLIENT_ID: '' }));
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses other origins, bad bodies and foreign callback addresses', async () => {
    const env = makeEnv();
    expect((await handle(oauth(good, 'https://evil.example'), env)).status).toBe(403);
    expect((await handle(oauth(good, null), env)).status).toBe(403);
    for (const body of [
      { ...good, code: 'a b' },
      { ...good, codeVerifier: 'short' },
      { ...good, redirectUri: 'https://evil.example/github-callback.html' },
      { ...good, redirectUri: `${ORIGIN}/other.html` },
      { ...good, redirectUri: `${REDIRECT}?x=1` },
      { ...good, extra: true },
      'nope',
    ]) {
      expect((await handle(oauth(body), env)).status).toBe(400);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('applies the burst guard', async () => {
    const res = await handle(
      oauth(good),
      makeEnv({ BURST: { limit: async () => ({ success: false }) } as RateLimit }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
  });

  it('maps network failures and odd answers to "try again"', async () => {
    fetchSpy.mockRejectedValue(new TypeError('network'));
    expect((await handle(oauth(good), makeEnv())).status).toBe(502);
    upstream({ hello: 'world' });
    expect((await handle(oauth(good), makeEnv())).status).toBe(502);
    upstream({}, 500);
    expect((await handle(oauth(good), makeEnv())).status).toBe(502);
  });

  it('only accepts POST', async () => {
    const res = await handle(
      new Request('https://api.test/github/oauth', { headers: { Origin: ORIGIN } }),
      makeEnv(),
    );
    expect(res.status).toBe(405);
  });
});
