/**
 * Klinth API Worker: /health, /ai/generate, /ai/test, /github/config, /github/oauth.
 * Never log request bodies, keys, tokens or the skill.
 */
import { generate, testKey, type AiEnv } from './ai.ts';
import { githubConfig, githubOauth, type GitHubEnv } from './github.ts';
import { corsHeaders, isAllowedOrigin, json } from './http.ts';

export { RateLimiter } from './rate-limit.ts';

export interface Env extends AiEnv, GitHubEnv {
  ALLOWED_ORIGINS: string;
}

const ROUTES: Record<
  string,
  (request: Request, env: Env, cors: Record<string, string>) => Promise<Response>
> = {
  '/ai/generate': generate,
  '/ai/test': testKey,
  '/github/oauth': githubOauth,
};

export async function handle(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request, env.ALLOWED_ORIGINS);
  const { pathname } = new URL(request.url);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (pathname === '/health' && request.method === 'GET') {
    return json({ ok: true }, 200, cors);
  }
  const route = ROUTES[pathname];
  if (route) {
    if (request.method !== 'POST')
      return json({ error: 'Use POST.' }, 405, { ...cors, allow: 'POST' });
    // Only the Klinth editor may call these routes (CORS alone would still let the call run).
    if (!isAllowedOrigin(request, env.ALLOWED_ORIGINS)) {
      return json({ error: 'This address is only for the Klinth editor.' }, 403);
    }
    return route(request, env, cors);
  }
  if (pathname === '/github/config' && request.method === 'GET') {
    if (!isAllowedOrigin(request, env.ALLOWED_ORIGINS)) {
      return json({ error: 'This address is only for the Klinth editor.' }, 403);
    }
    return githubConfig(env, cors);
  }
  return json({ error: 'Not found.' }, 404, cors);
}

export default {
  fetch: (request, env) => handle(request, env),
} satisfies ExportedHandler<Env>;
