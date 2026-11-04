import { z } from 'zod';
import { allowedOrigins, json, readCappedText, type Headers } from './http.ts';

/**
 * GitHub sign-in. The Worker only swaps the one-time `code` for a token, because
 * that step needs the app secret. The token is returned to the browser and is
 * never stored, cached or logged here.
 */
export interface GitHubEnv {
  /** OAuth app id (public). Empty until the owner creates the app. */
  GITHUB_CLIENT_ID?: string;
  /** OAuth app secret: `wrangler secret put GITHUB_CLIENT_SECRET`, never in a file in git. */
  GITHUB_CLIENT_SECRET?: string;
  ALLOWED_ORIGINS: string;
  BURST: RateLimit;
}

/** Fixed upstream: nothing in the request can change where the Worker calls. */
export const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 4 * 1024;
export const CALLBACK_PATH = '/github-callback.html';

export const oauthRequestSchema = z.strictObject({
  code: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  // RFC 7636: 43 to 128 unreserved characters.
  codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
  redirectUri: z.string().max(300),
});

const tokenSchema = z.object({
  access_token: z.string().min(1).max(500),
  scope: z.string().max(500).default(''),
});
const tokenErrorSchema = z.object({ error: z.string().max(200) });

type OauthCode = 'bad_request' | 'expired' | 'not_ready' | 'rate_limited' | 'upstream';

const MESSAGES: Record<OauthCode, [number, string]> = {
  bad_request: [400, 'That sign-in could not be read. Please try connecting again.'],
  expired: [400, 'The GitHub sign-in took too long or was already used. Please connect again.'],
  not_ready: [503, 'Publishing to GitHub is not set up yet. You can download the ZIP instead.'],
  rate_limited: [429, 'Too many tries in a short time. Please wait a minute and try again.'],
  upstream: [502, 'GitHub could not be reached right now. Please try again in a little while.'],
};

function log(outcome: string): void {
  console.log(JSON.stringify({ route: '/github/oauth', outcome }));
}

function fail(code: OauthCode, cors: Headers, extra: Headers = {}): Response {
  const [status, error] = MESSAGES[code];
  log(code);
  return json({ error, code }, status, { ...cors, ...extra });
}

const configured = (env: GitHubEnv): boolean =>
  Boolean(env.GITHUB_CLIENT_ID?.trim() && env.GITHUB_CLIENT_SECRET?.trim());

/** GET /github/config: the public app id, so the editor can start sign-in. */
export function githubConfig(env: GitHubEnv, cors: Headers): Response {
  if (!configured(env)) return json({ clientId: null }, 200, cors);
  return json({ clientId: env.GITHUB_CLIENT_ID?.trim() }, 200, cors);
}

/** The callback page must be on an allowed Klinth origin, exactly. */
function validRedirect(uri: string, env: GitHubEnv): boolean {
  try {
    const url = new URL(uri);
    return (
      url.pathname === CALLBACK_PATH &&
      url.search === '' &&
      url.hash === '' &&
      allowedOrigins(env.ALLOWED_ORIGINS).includes(url.origin)
    );
  } catch {
    return false;
  }
}

async function readBody(request: Request): Promise<unknown> {
  const text = await readCappedText(request, MAX_BODY_BYTES);
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** POST /github/oauth: { code, codeVerifier, redirectUri } -> { token, scope }. */
export async function githubOauth(
  request: Request,
  env: GitHubEnv,
  cors: Headers,
): Promise<Response> {
  if (!configured(env)) return fail('not_ready', cors);
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const burst = await env.BURST.limit({ key: `github:${ip}` });
  if (!burst.success) return fail('rate_limited', cors, { 'retry-after': '60' });

  const parsed = oauthRequestSchema.safeParse(await readBody(request));
  if (!parsed.success || !validRedirect(parsed.data.redirectUri, env)) {
    return fail('bad_request', cors);
  }
  const { code, codeVerifier, redirectUri } = parsed.data;

  let res: Response;
  try {
    res = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': 'klinth-api',
      },
      body: new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID?.trim() ?? '',
        client_secret: env.GITHUB_CLIENT_SECRET?.trim() ?? '',
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return fail('upstream', cors);
  }
  if (!res.ok) return fail('upstream', cors);

  const body: unknown = await res.json().catch(() => null);
  const token = tokenSchema.safeParse(body);
  if (token.success) {
    log('ok');
    return json({ token: token.data.access_token, scope: token.data.scope }, 200, cors);
  }
  // GitHub answers 200 with { error } for a bad code.
  const error = tokenErrorSchema.safeParse(body);
  if (error.success && error.data.error === 'bad_verification_code') return fail('expired', cors);
  if (
    error.success &&
    ['incorrect_client_credentials', 'redirect_uri_mismatch'].includes(error.data.error)
  ) {
    return fail('not_ready', cors);
  }
  return fail('upstream', cors);
}
