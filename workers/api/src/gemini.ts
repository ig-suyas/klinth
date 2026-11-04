import { z } from 'zod';

/**
 * Calls Gemini through the Interactions API with the user's own key. The host
 * is fixed (no SSRF); only the model id comes from config. Gemini's error
 * texts are never passed on: every failure becomes one of our plain messages.
 */

export const GEMINI_HOST = 'https://generativelanguage.googleapis.com';
/** Pinned API revision, as sent by Google's own examples (verified 2026-11-04). */
export const GEMINI_API_REVISION = '2026-05-20';
export const GEMINI_TIMEOUT_MS = 60_000;
export const MAX_OUTPUT_TOKENS = 8192;
export const THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

const MODEL_ID = /^[a-z0-9][a-z0-9.-]{1,63}$/;

export type GeminiFailure =
  'bad_key' | 'quota' | 'busy' | 'too_long' | 'timeout' | 'upstream' | 'not_ready';

export class GeminiError extends Error {
  constructor(readonly failure: GeminiFailure) {
    super(failure);
    this.name = 'GeminiError';
  }
}

export interface GeminiConfig {
  model: string;
  thinkingLevel?: ThinkingLevel | undefined;
  fetcher?: typeof fetch;
}

export interface GeminiPrompt {
  system: string;
  input: string;
  schema: Record<string, unknown>;
}

const interaction = z
  .object({
    status: z.string(),
    steps: z
      .array(
        z
          .object({
            type: z.string(),
            content: z
              .array(z.object({ type: z.string(), text: z.string().optional() }).loose())
              .optional(),
          })
          .loose(),
      )
      .optional(),
  })
  .loose();

function checkModel(model: string): string {
  if (!MODEL_ID.test(model)) throw new GeminiError('not_ready');
  return model;
}

/**
 * Maps an HTTP failure from Gemini to what we tell the user. Gemini uses two
 * error formats (verified 2026-11-04: a bad key gives 400 with reason
 * API_KEY_INVALID, in the old Google format), so we look for known markers.
 * The text itself is never passed on.
 */
async function failureOf(res: Response): Promise<GeminiFailure> {
  if (res.status === 401 || res.status === 403) return 'bad_key';
  if (res.status === 402) return 'quota';
  const text = await res.text().catch(() => '');
  if (res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(text)) return 'bad_key';
  if (res.status === 429) {
    if (/quota_exceeded|PerDay/i.test(text)) return 'quota';
    if (/rate_limit_exceeded|too_many_requests|PerMinute/i.test(text)) return 'busy';
    return 'quota';
  }
  return 'upstream';
}

/**
 * Sends one request, with one retry on a 5xx answer. No retry on 4xx or 429
 * (the user's quota is precious). One 60 s deadline covers both attempts.
 */
async function send(url: string, init: RequestInit, fetcher: typeof fetch): Promise<Response> {
  const signal = AbortSignal.timeout(GEMINI_TIMEOUT_MS);
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetcher(url, { ...init, signal });
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'TimeoutError')) {
        throw new GeminiError('timeout');
      }
      throw new GeminiError('upstream');
    }
    if (res.ok) return res;
    if (res.status >= 500 && attempt === 0) {
      await res.body?.cancel();
      continue;
    }
    throw new GeminiError(await failureOf(res));
  }
}

function headers(key: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-goog-api-key': key,
    'api-revision': GEMINI_API_REVISION,
  };
}

/** Asks Gemini for JSON matching `prompt.schema`. Returns the parsed JSON (not yet validated). */
export async function generateJson(
  prompt: GeminiPrompt,
  key: string,
  config: GeminiConfig,
): Promise<unknown> {
  const body = {
    model: checkModel(config.model),
    system_instruction: prompt.system,
    input: prompt.input,
    generation_config: {
      max_output_tokens: MAX_OUTPUT_TOKENS,
      ...(config.thinkingLevel ? { thinking_level: config.thinkingLevel } : {}),
    },
    response_format: { type: 'text', mime_type: 'application/json', schema: prompt.schema },
    // Do not keep the conversation on Google's side.
    store: false,
  };
  const res = await send(
    `${GEMINI_HOST}/v1beta/interactions`,
    { method: 'POST', headers: headers(key), body: JSON.stringify(body) },
    config.fetcher ?? fetch,
  );
  const parsed = interaction.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new GeminiError('upstream');
  if (parsed.data.status === 'incomplete') throw new GeminiError('too_long');
  if (parsed.data.status !== 'completed') throw new GeminiError('upstream');
  const text = (parsed.data.steps ?? [])
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .map((part) => (part.type === 'text' ? (part.text ?? '') : ''))
    .join('');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** "Test my key": reads the model's details. Cheap and uses no generation quota. */
export async function checkKey(key: string, config: GeminiConfig): Promise<void> {
  const model = encodeURIComponent(checkModel(config.model));
  await send(
    `${GEMINI_HOST}/v1beta/models/${model}`,
    { method: 'GET', headers: headers(key) },
    config.fetcher ?? fetch,
  );
}

const KEEP = new Set([
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'additionalProperties',
  'minItems',
  'maxItems',
  'description',
]);

/**
 * Turns a Zod JSON Schema into the subset Gemini enforces. Length limits are
 * not enforced by Gemini, so they become a hint in `description`; Zod checks
 * them for real afterwards.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (typeof schema !== 'object' || schema === null) return schema;
  const source = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!KEEP.has(key)) continue;
    if (key === 'properties' && typeof value === 'object' && value !== null) {
      out[key] = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, toGeminiSchema(child)]),
      );
    } else if (key === 'items') {
      out[key] = toGeminiSchema(value);
    } else {
      out[key] = value;
    }
  }
  if (typeof source.maxLength === 'number') {
    const hint = `At most ${source.maxLength} characters.`;
    out.description = typeof out.description === 'string' ? `${out.description} ${hint}` : hint;
  }
  return out;
}
