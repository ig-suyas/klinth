import { z } from 'zod';
import { blockPropSchemas, singleLine, type BlockType } from './blocks.ts';
import { MAX_VIDEO_BYTES } from './media.ts';
import { DEVICE_NAME, RESERVED_SLUGS, collectHrefs, linkedSlug } from './links.ts';
import { themeSchema } from './tokens.ts';
import { HEADER_STYLES, headerSchema } from './header.ts';
import { MAX_NAV_LINKS, anchorSchema, navLinkSchema } from './nav.ts';
import {
  MAX_ANIMATED_SECTIONS,
  animationProblem,
  hasAnimation,
  sectionAnimationSchema,
} from './animation.ts';
import {
  LAYOUT_MODES,
  MAX_FREE_SECTIONS,
  freeCanvas,
  freeCanvasSchema,
  freeSectionProblem,
} from './free.ts';

export const SCHEMA_VERSION = 7;

export { HEADER_STYLES, type HeaderStyle } from './header.ts';

/** Block types in the order the editor lists them. */
export const BLOCK_TYPES = Object.keys(blockPropSchemas) as BlockType[];

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id');

/** Most pages one site can have. */
export const MAX_PAGES = 50;

/** Asset ids become file names, so they also avoid Windows device names. */
const assetId = id.refine((v) => !DEVICE_NAME.test(v), 'This file id is reserved');

const isUnique = (values: string[]): boolean => new Set(values).size === values.length;

/** Most site-wide CSS, and separately JavaScript, one site can carry (UTF-8 bytes, about 200 KB). */
export const MAX_SITE_CODE_BYTES = 200_000;

/** Length of `text` in UTF-8 bytes, the size it has in the exported file. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

const siteCodeText = z
  .string()
  .max(MAX_SITE_CODE_BYTES, 'Keep custom code under 200 KB')
  .refine((v) => utf8Length(v) <= MAX_SITE_CODE_BYTES, 'Keep custom code under 200 KB')
  .optional();

/**
 * Code the owner pasted for every page: CSS in the head, JavaScript at the end
 * of the body. Exported as separate files, never inline; the editor runs it
 * only inside the sandboxed preview frame.
 */
export const siteCodeSchema = z.object({ css: siteCodeText, js: siteCodeText }).strict();

const sectionOf = <T extends BlockType>(type: T) =>
  z
    .object({
      id,
      type: z.literal(type),
      /** The section's id in the page, made from its title when a header link points to it. */
      anchor: anchorSchema.optional(),
      /** Animation presets for the section and its parts (checked per block type on the page). */
      animation: sectionAnimationSchema.optional(),
      /** `flow` (the default when absent): the block's own responsive layout. `free`: `canvas`. */
      layout: z.enum(LAYOUT_MODES).optional(),
      /** Freely placed items; present exactly when `layout` is `free` (see free.ts). */
      canvas: freeCanvasSchema.optional(),
      props: blockPropSchemas[type],
    })
    .strict();

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
    /** Leaves the site header off this page only (for landing pages). */
    hideHeader: z.boolean().optional(),
    /** Leaves the footer's "Back to top" link off this page only. */
    hideBackToTop: z.boolean().optional(),
    sections: z
      .array(sectionSchema)
      .max(100)
      .refine((s) => isUnique(s.map((x) => x.id)), 'Section ids must be unique on a page')
      // The id each section gets in the page (its anchor, else its own id) must be unique too.
      .refine(
        (s) => isUnique(s.map((x) => (x.anchor ?? x.id).toLowerCase())),
        'Two sections on this page have the same link name',
      )
      .superRefine((sections, ctx) => {
        sections.forEach((section, i) => {
          const problem = section.animation && animationProblem(section.type, section.animation);
          if (problem) ctx.addIssue({ code: 'custom', path: [i, 'animation'], message: problem });
          const layout = freeSectionProblem(section);
          if (layout) ctx.addIssue({ code: 'custom', path: [i, 'layout'], message: layout });
        });
        if (sections.filter((s) => freeCanvas(s) !== null).length > MAX_FREE_SECTIONS) {
          ctx.addIssue({
            code: 'custom',
            message: `A page can have up to ${MAX_FREE_SECTIONS} freely placed sections`,
          });
        }
        if (sections.filter((s) => hasAnimation(s.animation)).length > MAX_ANIMATED_SECTIONS) {
          ctx.addIssue({
            code: 'custom',
            message: `A page can have up to ${MAX_ANIMATED_SECTIONS} animated sections`,
          });
        }
      }),
  })
  .strict();

export const assetSchema = z
  .object({
    id: assetId,
    kind: z.enum(['image', 'video']),
    name: singleLine(200, 1),
    size: z.number().int().min(0).max(MAX_VIDEO_BYTES),
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
        /** Shared menu of pages in the header. Shown unless set to false. */
        pageMenu: z.boolean().optional(),
        /** Header look; the top bar when not set. */
        headerStyle: z.enum(HEADER_STYLES).optional(),
        /** Header background, layout, button and logo; the style's own look when not set. */
        header: headerSchema.optional(),
        /** The site header is shown unless this is false (set to true by the version 3 upgrade). */
        headerEnabled: z.boolean().optional(),
        /** The footer's "Back to top" link is shown unless this is false. */
        backToTop: z.boolean().optional(),
        /**
         * Header links picked by the owner. Not set: pages, or the sections named
         * for the menu, as before. Links to a deleted page or section are kept,
         * flagged in the editor and left out of the export.
         */
        navLinks: z
          .array(navLinkSchema)
          .max(MAX_NAV_LINKS, `A header can have up to ${MAX_NAV_LINKS} links`)
          .optional(),
      })
      .strict(),
    theme: themeSchema,
    siteCode: siteCodeSchema.optional(),
    pages: z
      .array(pageSchema)
      .min(1)
      .max(MAX_PAGES, `A site can have up to ${MAX_PAGES} pages`)
      .refine((pages) => isUnique(pages.map((p) => p.slug)), 'Page addresses must be unique')
      .refine((pages) => pages[0]?.slug === '', 'The home page must come first')
      .refine(
        (pages) =>
          pages.every((page) =>
            collectHrefs(page.sections).every((href) => {
              const slug = linkedSlug(href);
              return slug === null || pages.some((p) => p.slug === slug);
            }),
          ),
        'A link points to a page that does not exist',
      ),
    assets: z
      .array(assetSchema)
      .max(200)
      // Case-insensitive: `Img1` and `img1` are the same file on Windows and macOS.
      .refine((a) => isUnique(a.map((x) => x.id.toLowerCase())), 'File ids must be unique'),
  })
  .strict()
  .superRefine((project, ctx) => {
    const header = project.meta.header;
    const slug = header?.cta ? linkedSlug(header.cta.href) : null;
    if (slug !== null && !project.pages.some((p) => p.slug === slug)) {
      ctx.addIssue({
        code: 'custom',
        path: ['meta', 'header', 'cta', 'href'],
        message: 'A link points to a page that does not exist',
      });
    }
    const logo = header?.logo;
    if (logo && !project.assets.some((a) => a.id === logo.image && a.kind === 'image')) {
      ctx.addIssue({
        code: 'custom',
        path: ['meta', 'header', 'logo', 'image'],
        message: 'The logo picture is missing',
      });
    }
  });

export type Section = z.infer<typeof sectionSchema>;
export type SectionOf<T extends BlockType> = Extract<Section, { type: T }>;
export type Page = z.infer<typeof pageSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Project = z.infer<typeof projectSchema>;
export type SiteCode = z.infer<typeof siteCodeSchema>;
