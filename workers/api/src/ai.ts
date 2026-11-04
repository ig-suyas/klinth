import {
  GEMINI_KEY_HEADER,
  MAX_AI_BODY_BYTES,
  aiRequestSchema,
  blockPropSchemas,
  geminiKeySchema,
  keepAssetRefs,
  sectionAssetIds,
  sectionSchema,
  type AiErrorCode,
  type AiResponse,
} from '@klinth/core';
import {
  GeminiError,
  THINKING_LEVELS,
  checkKey,
  generateJson,
  type GeminiConfig,
} from './gemini.ts';
import { echoesSkill, isExtractionAttempt } from './guard.ts';
import { fail, json, type Headers } from './http.ts';
import { buildPrompt } from './prompt.ts';

export interface AiEnv {
  GEMINI_MODEL: string;
  GEMINI_THINKING_LEVEL?: string;
  /** Workers KV holding the private design skill under SKILL_KEY. */
  SKILL: KVNamespace;
  /** Durable Object: exact per-IP hourly limit. */
  RATE_LIMITER: DurableObjectNamespace;
  /** Built-in rate limit binding: short-window burst guard (approximate, per location). */
  BURST: RateLimit;
}

export const SKILL_KEY = 'design-skill';
const SKILL_CACHE_SECONDS = 300;

/**
 * Only outcome codes are logged: never keys, bodies, answers or the skill.
 * (Invocation logs are off in wrangler.jsonc because they would include headers.)
 */
function log(route: string, outcome: string): void {
  console.log(JSON.stringify({ route, outcome }));
}

function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'local';
}

function geminiConfig(env: AiEnv): GeminiConfig {
  const level = THINKING_LEVELS.find((l) => l === env.GEMINI_THINKING_LEVEL);
  return { model: env.GEMINI_MODEL, thinkingLevel: level };
}

/** Burst guard first (cheap), then the exact hourly bucket. Returns a 429 response or null. */
async function rateLimit(request: Request, env: AiEnv, cors: Headers): Promise<Response | null> {
  const ip = clientIp(request);
  const burst = await env.BURST.limit({ key: ip });
  if (!burst.success) return fail('rate_limited', cors, { 'retry-after': '60' });
  const stub = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(ip));
  const res = await stub.fetch('https://rate-limiter/take', { method: 'POST' });
  const verdict = (await res.json()) as { allowed: boolean; retryAfter: number };
  if (verdict.allowed) return null;
  return fail('rate_limited', cors, { 'retry-after': String(verdict.retryAfter) });
}

function readKey(request: Request): string | null {
  const parsed = geminiKeySchema.safeParse(request.headers.get(GEMINI_KEY_HEADER) ?? '');
  return parsed.success ? parsed.data : null;
}

async function readBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_AI_BODY_BYTES) return TOO_BIG;
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_AI_BODY_BYTES) return TOO_BIG;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
const TOO_BIG = Symbol('too big');

function failGemini(error: unknown, route: string, cors: Headers): Response {
  const code: AiErrorCode = error instanceof GeminiError ? error.failure : 'upstream';
  log(route, code);
  return fail(code, cors);
}

/** POST /ai/generate: instruction + one section in, one validated section out. */
export async function generate(request: Request, env: AiEnv, cors: Headers): Promise<Response> {
  const route = 'ai/generate';
  const key = readKey(request);
  if (!key) return fail('bad_key', cors);
  const body = await readBody(request);
  if (body === TOO_BIG) {
    return json(
      { error: 'This section is too big for the AI helper.', code: 'bad_request' },
      413,
      cors,
    );
  }
  const parsed = aiRequestSchema.safeParse(body);
  if (!parsed.success) return fail('bad_request', cors);

  const limited = await rateLimit(request, env, cors);
  if (limited) {
    log(route, 'rate_limited');
    return limited;
  }
  if (isExtractionAttempt(parsed.data.instruction)) {
    log(route, 'refused');
    return fail('refused', cors);
  }
  const skill = await env.SKILL.get(SKILL_KEY, { cacheTtl: SKILL_CACHE_SECONDS });
  if (!skill) {
    log(route, 'not_ready');
    return fail('not_ready', cors);
  }

  const { section } = parsed.data;
  let answer: unknown;
  try {
    answer = await generateJson(buildPrompt(parsed.data, skill), key, geminiConfig(env));
  } catch (error) {
    return failGemini(error, route, cors);
  }

  const props = blockPropSchemas[section.type].safeParse(answer);
  if (!props.success) {
    log(route, 'invalid_output');
    return fail('invalid_output', cors);
  }
  if (echoesSkill(props.data, skill)) {
    log(route, 'echo_blocked');
    return fail('invalid_output', cors);
  }
  const next = sectionSchema.safeParse({
    id: section.id,
    type: section.type,
    props: keepAssetRefs(props.data, sectionAssetIds([section])),
  });
  if (!next.success) {
    log(route, 'invalid_output');
    return fail('invalid_output', cors);
  }
  log(route, 'ok');
  const response: AiResponse = { section: next.data };
  return json(response, 200, cors);
}

/** POST /ai/test: "Test my key". Counts toward the hourly limit so it cannot be used to check keys in bulk. */
export async function testKey(request: Request, env: AiEnv, cors: Headers): Promise<Response> {
  const route = 'ai/test';
  const key = readKey(request);
  if (!key) return fail('bad_key', cors);
  const limited = await rateLimit(request, env, cors);
  if (limited) {
    log(route, 'rate_limited');
    return limited;
  }
  try {
    await checkKey(key, geminiConfig(env));
  } catch (error) {
    return failGemini(error, route, cors);
  }
  log(route, 'ok');
  return json({ ok: true }, 200, cors);
}
