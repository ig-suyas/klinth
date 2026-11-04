import { z } from 'zod';
import { create } from 'zustand';
import { apiBase } from '../ai/api.ts';
import { GitHubError } from './api.ts';

/**
 * "Connect GitHub": OAuth with PKCE in a small window. The callback page sends
 * the one-time code back over a same-origin BroadcastChannel; the Worker swaps
 * it for a token. The token lives in this module's memory only: never in
 * localStorage, IndexedDB, the project file or a URL. Closing the tab forgets it.
 */

export const CALLBACK_PATH = '/github-callback.html';
export const CHANNEL = 'klinth-github';
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

export interface GitHubSession {
  token: string;
  login: string;
  scopes: string[];
}

interface GitHubState {
  session: GitHubSession | null;
  dialogOpen: boolean;
  setSession: (session: GitHubSession | null) => void;
  openDialog: (open: boolean) => void;
}

/** In memory only. Deliberately not persisted. */
export const useGitHub = create<GitHubState>((set) => ({
  session: null,
  dialogOpen: false,
  setSession: (session) => set({ session }),
  openDialog: (dialogOpen) => set({ dialogOpen }),
}));

/** `repo` covers private repositories and turning on GitHub Pages; `public_repo` is the smallest. */
export type GitHubScope = 'public_repo' | 'repo';

export function neededScope(options: { private: boolean; pages: boolean }): GitHubScope {
  return options.private || options.pages ? 'repo' : 'public_repo';
}

export function hasScope(session: GitHubSession | null, scope: GitHubScope): boolean {
  if (!session) return false;
  return session.scopes.includes('repo') || session.scopes.includes(scope);
}

const NOT_READY = 'Publishing to GitHub is not set up yet. You can download the ZIP instead.';
const OFFLINE = 'Klinth could not be reached. Check your internet connection and try again.';

/** The public OAuth app id from the Worker, or null when GitHub is not set up. */
export async function loadClientId(): Promise<string | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/github/config`, { cache: 'no-store' });
    if (!res.ok) return null;
    const parsed = z.object({ clientId: z.string().nullable() }).safeParse(await res.json());
    return parsed.success ? parsed.data.clientId : null;
  } catch {
    return null;
  }
}

const base64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export interface PendingSignIn {
  state: string;
  verifier: string;
  challenge: string;
}

/** Prepared before the click, so the window can open right away (popup blockers). */
export async function prepareSignIn(): Promise<PendingSignIn> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { state, verifier, challenge: base64Url(new Uint8Array(digest)) };
}

export function redirectUri(origin = window.location.origin): string {
  return `${origin}${CALLBACK_PATH}`;
}

export function authorizeUrl(clientId: string, pending: PendingSignIn, scope: GitHubScope): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    scope,
    state: pending.state,
    code_challenge: pending.challenge,
    code_challenge_method: 'S256',
    allow_signup: 'true',
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

const callbackSchema = z.object({
  type: z.literal('klinth-github'),
  state: z.string().nullable(),
  code: z.string().nullable(),
  error: z.string().nullable(),
});

/** Waits for the callback page of *this* sign-in (matching state). */
function waitForCode(state: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const channel = new BroadcastChannel(CHANNEL);
    const done = () => {
      clearTimeout(timer);
      channel.close();
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      done();
      reject(new GitHubError('failed', 'Connecting to GitHub was stopped.'));
    };
    const timer = setTimeout(() => {
      done();
      reject(new GitHubError('failed', 'Connecting to GitHub took too long. Please try again.'));
    }, SIGN_IN_TIMEOUT_MS);
    signal.addEventListener('abort', onAbort);
    channel.onmessage = (event: MessageEvent) => {
      const message = callbackSchema.safeParse(event.data);
      if (!message.success || message.data.state !== state) return;
      done();
      if (message.data.code) resolve(message.data.code);
      else
        reject(
          new GitHubError(
            'forbidden',
            message.data.error === 'access_denied'
              ? 'You did not give Klinth access on GitHub. Nothing was published.'
              : 'GitHub did not finish the sign-in. Please try again.',
          ),
        );
    };
  });
}

async function exchange(code: string, verifier: string): Promise<{ token: string; scope: string }> {
  const base = apiBase();
  if (!base) throw new GitHubError('failed', NOT_READY);
  let res: Response;
  try {
    res = await fetch(`${base}/github/oauth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, codeVerifier: verifier, redirectUri: redirectUri() }),
      cache: 'no-store',
    });
  } catch {
    throw new GitHubError('offline', OFFLINE);
  }
  const body: unknown = await res.json().catch(() => null);
  const good = z.object({ token: z.string().min(1), scope: z.string() }).safeParse(body);
  if (res.ok && good.success) return good.data;
  const bad = z.object({ error: z.string().max(300) }).safeParse(body);
  throw new GitHubError('failed', bad.success ? bad.data.error : NOT_READY);
}

/**
 * Opens GitHub's sign-in window and resolves with the token and its scopes.
 * Must be called straight from a click: the window opens before any await.
 */
export async function connectGitHub(
  clientId: string,
  pending: PendingSignIn,
  scope: GitHubScope,
  signal: AbortSignal,
): Promise<{ token: string; scopes: string[] }> {
  const popup = window.open(
    authorizeUrl(clientId, pending, scope),
    'klinth-github',
    'popup,width=520,height=720',
  );
  if (!popup) {
    throw new GitHubError(
      'failed',
      'Your browser blocked the GitHub window. Allow pop-ups for Klinth and try again.',
    );
  }
  const code = await waitForCode(pending.state, signal);
  const { token, scope: granted } = await exchange(code, pending.verifier);
  return {
    token,
    scopes: granted
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
