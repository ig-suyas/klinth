import { z } from 'zod';
import { hasControlChar } from './html.ts';
import { themeSchema } from './tokens.ts';

export const SCHEMA_VERSION = 1;

export const BLOCK_TYPES = [
  'hero',
  'about',
  'textImage',
  'gallery',
  'video',
  'projects',
  'testimonials',
  'links',
  'contact',
  'footer',
  'customCode',
  'spacer',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id');

/** Windows cannot create files with these names (even with an extension). */
const DEVICE_NAME = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** Page addresses that would clash with exported files or folders. */
const RESERVED_SLUGS = new Set(['index', 'assets', 'css', 'js', 'readme']);

/** Asset ids become file names, so they also avoid Windows device names. */
const assetId = id.refine((v) => !DEVICE_NAME.test(v), 'This file id is reserved');

/** One line of plain text: no line breaks or control characters. */
const singleLine = (max: number, min = 0) =>
  z
    .string()
    .min(min)
    .max(max)
    .refine((v) => !hasControlChar(v), 'Use a single line of text');

const propName = z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,63}$/, 'Invalid field name');

/** Block props are JSON values; each block's renderer reads them defensively. */
const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string().max(200_000),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue).max(500),
    // Plain identifiers only: blocks `__proto__`, `constructor` and odd names.
    z.record(propName, jsonValue),
  ]),
);

const isUnique = (values: string[]): boolean => new Set(values).size === values.length;

export const sectionSchema = z
  .object({
    id,
    type: z.enum(BLOCK_TYPES),
    props: z.record(propName, jsonValue),
  })
  .strict();

export const pageSchema = z
  .object({
    /** Empty string means the home page (index.html). */
    slug: z
      .string()
      .max(60)
      .regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, 'Use lowercase letters, numbers and -')
      .refine(
        (v) => !RESERVED_SLUGS.has(v) && !DEVICE_NAME.test(v),
        'This page address is reserved',
      ),
    title: singleLine(120, 1),
    sections: z
      .array(sectionSchema)
      .max(100)
      .refine((s) => isUnique(s.map((x) => x.id)), 'Section ids must be unique on a page'),
  })
  .strict();

export const assetSchema = z
  .object({
    id: assetId,
    kind: z.enum(['image', 'video']),
    name: singleLine(200, 1),
    size: z
      .number()
      .int()
      .min(0)
      .max(25 * 1024 * 1024),
    mime: z.enum([
      'image/webp',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/svg+xml',
      'video/mp4',
      'video/webm',
    ]),
  })
  .strict();

export const projectSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    meta: z
      .object({
        title: singleLine(120, 1),
        description: singleLine(300).default(''),
        language: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/),
        favicon: id.optional(),
      })
      .strict(),
    theme: themeSchema,
    pages: z
      .array(pageSchema)
      .min(1)
      .max(10)
      .refine((pages) => isUnique(pages.map((p) => p.slug)), 'Page addresses must be unique')
      .refine((pages) => pages.some((p) => p.slug === ''), 'A home page is required'),
    assets: z
      .array(assetSchema)
      .max(200)
      // Case-insensitive: `Img1` and `img1` are the same file on Windows and macOS.
      .refine((a) => isUnique(a.map((x) => x.id.toLowerCase())), 'File ids must be unique'),
  })
  .strict();

export type Section = z.infer<typeof sectionSchema>;
export type Page = z.infer<typeof pageSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Project = z.infer<typeof projectSchema>;
