import { z } from 'zod';
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

/** Block props are JSON values; each block's renderer reads them defensively. */
const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string().max(200_000),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue).max(500),
    z.record(z.string().max(64), jsonValue),
  ]),
);

export const sectionSchema = z
  .object({
    id,
    type: z.enum(BLOCK_TYPES),
    props: z.record(z.string().max(64), jsonValue),
  })
  .strict();

export const pageSchema = z
  .object({
    /** Empty string means the home page (index.html). */
    slug: z.string().regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, 'Use lowercase letters, numbers and -'),
    title: z.string().min(1).max(120),
    sections: z.array(sectionSchema).max(100),
  })
  .strict();

export const assetSchema = z
  .object({
    id,
    kind: z.enum(['image', 'video']),
    name: z.string().min(1).max(200),
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
        title: z.string().min(1).max(120),
        description: z.string().max(300).default(''),
        language: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/),
        favicon: id.optional(),
      })
      .strict(),
    theme: themeSchema,
    pages: z
      .array(pageSchema)
      .min(1)
      .max(10)
      .refine(
        (pages) => new Set(pages.map((p) => p.slug)).size === pages.length,
        'Page addresses must be unique',
      )
      .refine((pages) => pages.some((p) => p.slug === ''), 'A home page is required'),
    assets: z.array(assetSchema).max(200),
  })
  .strict();

export type Section = z.infer<typeof sectionSchema>;
export type Page = z.infer<typeof pageSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Project = z.infer<typeof projectSchema>;
