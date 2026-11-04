import { z } from 'zod';
import { singleLine } from './blocks.ts';
import { sectionSchema } from './schema.ts';

/**
 * The AI helper's API contract, shared by the editor and the Worker.
 * The Worker validates requests with these schemas; the editor validates
 * answers with them again before anything reaches the project.
 */

/** Longest request the user can type. */
export const MAX_AI_INSTRUCTION = 1000;
/** Largest request body the Worker accepts. Big custom code sections do not fit. */
export const MAX_AI_BODY_BYTES = 64 * 1024;
/** AI calls allowed per hour per visitor (IP address). */
export const AI_CALLS_PER_HOUR = 30;
/** The request header that carries the user's own Gemini key. Never a URL or body field. */
export const GEMINI_KEY_HEADER = 'x-gemini-key';

/** Gemini keys are letters, digits, `-`, `_` and `.`; anything else is refused before sending. */
export const geminiKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.-]{20,200}$/, 'That does not look like a Gemini key');

export const aiRequestSchema = z
  .object({
    instruction: z.string().trim().min(2, 'Say what you want').max(MAX_AI_INSTRUCTION),
    section: sectionSchema,
    site: z
      .object({
        title: singleLine(120),
        description: singleLine(300),
        language: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/),
      })
      .strict(),
  })
  .strict();

export const aiResponseSchema = z.object({ section: sectionSchema }).strict();

export const AI_ERROR_CODES = [
  'bad_request',
  'bad_key',
  'rate_limited',
  'quota',
  'busy',
  'refused',
  'invalid_output',
  'too_long',
  'timeout',
  'upstream',
  'not_ready',
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export const aiErrorSchema = z
  .object({ error: z.string().max(400), code: z.enum(AI_ERROR_CODES) })
  .strict();

export type AiRequest = z.infer<typeof aiRequestSchema>;
export type AiResponse = z.infer<typeof aiResponseSchema>;
export type AiErrorBody = z.infer<typeof aiErrorSchema>;
