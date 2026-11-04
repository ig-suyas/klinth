/**
 * Klinth API Worker. Phase 0 skeleton: health check, CORS allow-list and
 * placeholder routes. Never log request bodies, keys, tokens or the skill.
 */

export interface Env {
  ALLOWED_ORIGINS: string;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' } as const;

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-gemini-key',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function json(body: unknown, status: number, extra: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request, env);
  const { pathname } = new URL(request.url);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (pathname === '/health' && request.method === 'GET') {
    return json({ ok: true }, 200, cors);
  }
  if (pathname === '/ai/generate' || pathname === '/github/oauth') {
    return json({ error: 'Not available yet.' }, 501, cors);
  }
  return json({ error: 'Not found.' }, 404, cors);
}

export default {
  fetch: (request, env) => handle(request, env),
} satisfies ExportedHandler<Env>;
