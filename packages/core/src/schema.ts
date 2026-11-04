import { z } from 'zod';
import { blockPropSchemas, singleLine, type BlockType } from './blocks.ts';
import { themeSchema } from './tokens.ts';

export const SCHEMA_VERSION = 1;

/** Block types in the order the editor lists them. */
export const BLOCK_TYPES = Object.keys(blockPropSchemas) as BlockType[];

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id');

/** Windows cannot create files with these names (even with an extension). */
const DEVICE_NAME = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** Page addresses that would clash with exported files or folders. */
const RESERVED_SLUGS = new Set(['index', 'assets', 'css', 'js', 'readme']);

/** Asset ids become file names, so they also avoid Windows device names. */
const assetId = id.refine((v) => !DEVICE_NAME.test(v), 'This file id is reserved');

const isUnique = (values: string[]): boolean => new Set(values).size === values.length;

const sectionOf = <T extends BlockType>(type: T) =>
  z.object({ id, type: z.literal(type), props: blockPropSchemas[type] }).strict();

export const sectionSchema = z.discriminatedUnion('type', [
  sectionOf('hero'),
  sectionOf('about'),
  sectionOf('textImage'),
  sectionOf('gallery'),
  sectionOf('video'),
  sectionOf('projects'),
  sectionOf('testimonials'),
  sectionOf('links'),
  sectionOf('contact'),
  sectionOf('footer'),
  sectionOf('customCode'),
  sectionOf('spacer'),
]);

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
    /** Pixel size of images, used to reserve space and avoid layout jumps. */
    width: z.number().int().min(1).max(10_000).optional(),
    height: z.number().int().min(1).max(10_000).optional(),
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
export type SectionOf<T extends BlockType> = Extract<Section, { type: T }>;
export type Page = z.infer<typeof pageSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Project = z.infer<typeof projectSchema>;
