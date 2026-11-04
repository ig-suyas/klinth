import { describe, expect, it } from 'vitest';
import { readCappedText } from './http.ts';
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

describe('readCappedText', () => {
  const stream = (chunks: string[]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
        controller.close();
      },
    });

  it('stops reading a body without a length once it passes the cap', async () => {
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1024));
      },
    });
    const request = new Request('https://x.test/', {
      method: 'POST',
      body: endless,
      duplex: 'half',
    } as RequestInit);
    expect(await readCappedText(request, 4096)).toBeNull();
    expect(pulled).toBeLessThan(10);
  });

  it('returns the text when it fits, and refuses a declared length over the cap', async () => {
    const ok = new Request('https://x.test/', {
      method: 'POST',
      body: stream(['{"a":', '1}']),
      duplex: 'half',
    } as RequestInit);
    expect(await readCappedText(ok, 64)).toBe('{"a":1}');
    const big = new Request('https://x.test/', {
      method: 'POST',
      body: 'x',
      headers: { 'content-length': '999' },
    });
    expect(await readCappedText(big, 64)).toBeNull();
  });
});
