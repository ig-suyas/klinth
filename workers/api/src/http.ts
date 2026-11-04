import type { AiErrorCode } from '@klinth/core';

/** Response helpers. Bodies are always JSON; nothing is cached anywhere. */

const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const;

export type Headers = Record<string, string>;

export function allowedOrigins(list: string): string[] {
  return list
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(request: Request, list: string): boolean {
  const origin = request.headers.get('Origin');
  return origin !== null && allowedOrigins(list).includes(origin);
}

export function corsHeaders(request: Request, list: string): Headers {
  if (!isAllowedOrigin(request, list)) return {};
  return {
    'access-control-allow-origin': request.headers.get('Origin') ?? '',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-gemini-key',
    'access-control-expose-headers': 'retry-after',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

export function json(body: unknown, status: number, extra: Headers = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...extra } });
}

/** Plain-language messages. They never include upstream text, keys or the skill. */
export const MESSAGES: Record<AiErrorCode, string> = {
  bad_request: 'That request could not be read. Please reload Klinth and try again.',
  bad_key: 'Gemini did not accept this key. Check it in Google AI Studio and add it again.',
  rate_limited: 'You have used the AI helper a lot this hour. Please wait a little and try again.',
  quota: 'Your Gemini limit is reached. Free-tier limits reset daily.',
  busy: 'Gemini is busy for your key right now. Wait a minute and try again.',
  refused: 'The AI helper can only change your section. Try describing the change you want.',
  invalid_output: 'The AI’s answer did not fit this section. Try again or say it differently.',
  too_long: 'The answer was too long. Try asking for a smaller change.',
  timeout: 'Gemini took too long to answer. Please try again.',
  upstream: 'Gemini could not answer right now. Please try again later.',
  not_ready: 'The AI helper is not set up yet. You can keep editing by hand.',
};

export const STATUS: Record<AiErrorCode, number> = {
  bad_request: 400,
  bad_key: 401,
  rate_limited: 429,
  quota: 429,
  busy: 429,
  refused: 422,
  invalid_output: 422,
  too_long: 422,
  timeout: 504,
  upstream: 502,
  not_ready: 503,
};

export function fail(code: AiErrorCode, cors: Headers, extra: Headers = {}): Response {
  return json({ error: MESSAGES[code], code }, STATUS[code], { ...cors, ...extra });
}

/**
 * Reads a request body as text, stopping as soon as it passes `maxBytes`, so a
 * body with no or a false Content-Length is never read in full. Null = too big.
 */
export async function readCappedText(request: Request, maxBytes: number): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? '0') > maxBytes) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
