import { describe, expect, it } from 'vitest';
import { handle, type Env } from './index.ts';

const env = { ALLOWED_ORIGINS: 'http://localhost:5173' } as Env;

describe('api worker', () => {
  it('answers the health check', async () => {
    const res = await handle(new Request('https://api.test/health'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('sets CORS only for allowed origins', async () => {
    const allowed = await handle(
      new Request('https://api.test/health', { headers: { Origin: 'http://localhost:5173' } }),
      env,
    );
    const blocked = await handle(
      new Request('https://api.test/health', { headers: { Origin: 'https://evil.example' } }),
      env,
    );
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(allowed.headers.get('access-control-allow-headers')).toContain('x-gemini-key');
    expect(blocked.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers unknown paths with 404', async () => {
    const res = await handle(new Request('https://api.test/nope'), env);
    expect(res.status).toBe(404);
  });
});
