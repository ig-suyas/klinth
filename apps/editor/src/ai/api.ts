import {
  GEMINI_KEY_HEADER,
  MAX_AI_BODY_BYTES,
  aiErrorSchema,
  aiResponseSchema,
  type AiErrorCode,
  type AiRequest,
  type Section,
} from '@klinth/core';
import { z } from 'zod';

/**
 * Talks to the Klinth Worker. The key goes only there, only over HTTPS (or to
 * a local dev Worker), only in the X-Gemini-Key header. Answers are checked
 * with the same schemas the Worker uses before anything reaches the project.
 */

/** Codes the browser adds: the Worker could not be reached, or AI is not configured. */
export type ClientErrorCode = AiErrorCode | 'offline';

export class AiError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

const LOCAL_HOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** The Worker address, or null when it is missing or not HTTPS. */
export function apiBase(
  raw: string | undefined = import.meta.env.VITE_API_BASE_URL,
): string | null {
  const value = (raw ?? 'http://localhost:8787').trim().replace(/\/+$/, '');
  if (LOCAL_HOST.test(value)) return value;
  return /^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(value) ? value : null;
}

const NOT_READY = 'The AI helper is not set up yet. You can keep editing by hand.';
const OFFLINE =
  'Klinth’s AI helper could not be reached. Check your internet connection and try again.';

async function call(
  path: string,
  key: string,
  body: string | null,
  signal?: AbortSignal,
): Promise<unknown> {
  const base = apiBase();
  if (!base) throw new AiError('not_ready', NOT_READY);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [GEMINI_KEY_HEADER]: key },
      body,
      signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new AiError('offline', OFFLINE);
  }
  const data: unknown = await res.json().catch(() => null);
  if (res.ok) return data;
  const parsed = aiErrorSchema.safeParse(data);
  const retryAfter = Number(res.headers.get('retry-after')) || undefined;
  if (parsed.success) throw new AiError(parsed.data.code, parsed.data.error, retryAfter);
  throw new AiError(
    'upstream',
    'The AI helper could not answer right now. Please try again later.',
  );
}

/** True when the request is small enough to send. */
export function fitsRequest(request: AiRequest): boolean {
  return new TextEncoder().encode(JSON.stringify(request)).length <= MAX_AI_BODY_BYTES;
}

/** Asks for a new version of one section. Resolves to a valid section of the same id and type. */
export async function askForSection(
  request: AiRequest,
  key: string,
  signal?: AbortSignal,
): Promise<Section> {
  if (!fitsRequest(request)) {
    throw new AiError('bad_request', 'This section is too big for the AI helper.');
  }
  const data = await call('/ai/generate', key, JSON.stringify(request), signal);
  const parsed = aiResponseSchema.safeParse(data);
  const section = parsed.success ? parsed.data.section : null;
  if (!section || section.id !== request.section.id || section.type !== request.section.type) {
    throw new AiError(
      'invalid_output',
      'The AI’s answer did not fit this section. Try again or say it differently.',
    );
  }
  return section;
}

/** "Test my key": one cheap call that uses none of the Gemini quota. */
export async function testKey(key: string, signal?: AbortSignal): Promise<void> {
  const data = await call('/ai/test', key, null, signal);
  if (!z.object({ ok: z.literal(true) }).safeParse(data).success) {
    throw new AiError(
      'upstream',
      'The key could not be checked right now. Please try again later.',
    );
  }
}
