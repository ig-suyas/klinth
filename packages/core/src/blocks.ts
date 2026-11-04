import { z } from 'zod';
import { MAX_EMBED_URL_LENGTH, looksLikeEmbedCode, parseVideoUrl } from './embed.ts';
import { hasControlChar, safeUrl } from './html.ts';

/**
 * Typed props for every v1 block. All schemas are strict, so unknown props
 * (for example an `apiKey`) are rejected. Text is escaped at render time;
 * links are checked here and again when rendering.
 *
 * Prop names must avoid secret-like words (token, secret, password, apiKey...)
 * because `containsSecret` blocks projects that use them.
 */

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id');
/** Text that may span paragraphs (blank line = new paragraph). */
const text = (max: number) => z.string().max(max);
const optText = (max: number) => text(max).optional();
/** One line of plain text: no line breaks or control characters. */
export const singleLine = (max: number, min = 0) =>
  z
    .string()
    .min(min)
    .max(max)
    .refine((v) => !hasControlChar(v), 'Use a single line of text');
const optLine = (max: number) => singleLine(max).optional();

/** Empty, or an allowed link (https, mailto, tel or #anchor). */
const href = z
  .string()
  .max(2048)
  .refine((v) => v === '' || safeUrl(v) !== null, 'Use a link starting with https://');

/** A YouTube or Vimeo link. Embed code (`<iframe ...>`) is refused with its own message. */
const embedUrl = z
  .string()
  .max(MAX_EMBED_URL_LENGTH)
  .refine((v) => !looksLikeEmbedCode(v), 'Paste the video link, not the embed code')
  .refine((v) => looksLikeEmbedCode(v) || parseVideoUrl(v) !== null, 'Use a YouTube or Vimeo link');

const linkSchema = z.object({ label: singleLine(80), href }).strict();

const imageFields = {
  /** Asset id of an uploaded image. */
  image: id.optional(),
  /** Describes the image for people using screen readers. */
  imageAlt: optLine(300),
};

/** Background treatment of a section. */
export const BACKGROUNDS = ['plain', 'tinted', 'bold'] as const;
export type Background = (typeof BACKGROUNDS)[number];

/** Fields shared by most blocks: a small label, a heading, a short intro. */
const headFields = {
  eyebrow: optLine(60),
  heading: optText(200),
  intro: optText(600),
  background: z.enum(BACKGROUNDS).optional(),
  /** When set, the section is listed in the site menu under this name. */
  navLabel: optLine(30),
};

/** Longest custom code, in characters (about 200 KB). */
export const MAX_CUSTOM_CODE = 200_000;

export const blockPropSchemas = {
  hero: z
    .object({
      ...headFields,
      ...imageFields,
      layout: z.enum(['editorial', 'centered', 'split']).optional(),
      subheading: optText(600),
      /** A small status line, for example "Open for new projects". */
      status: optLine(80),
      buttons: z.array(linkSchema).max(2).optional(),
    })
    .strict(),
  about: z
    .object({
      ...headFields,
      ...imageFields,
      body: optText(4000),
      facts: z
        .array(z.object({ label: singleLine(60), value: singleLine(120) }).strict())
        .max(8)
        .optional(),
    })
    .strict(),
  textImage: z
    .object({
      ...headFields,
      ...imageFields,
      body: optText(4000),
      imageSide: z.enum(['left', 'right']).optional(),
      button: linkSchema.optional(),
    })
    .strict(),
  gallery: z
    .object({
      ...headFields,
      images: z
        .array(z.object({ ...imageFields, caption: optLine(200) }).strict())
        .max(24)
        .optional(),
    })
    .strict(),
  video: z
    .object({
      ...headFields,
      caption: optText(600),
      /** Asset id of an uploaded video. */
      video: id.optional(),
      /** A YouTube or Vimeo page link. Wins over an uploaded video when both are set. */
      embedUrl: embedUrl.optional(),
    })
    .strict(),
  projects: z
    .object({
      ...headFields,
      layout: z.enum(['cards', 'list']).optional(),
      items: z
        .array(
          z
            .object({
              ...imageFields,
              title: singleLine(120),
              tag: optLine(60),
              year: optLine(20),
              description: optText(1000),
              link: linkSchema.optional(),
            })
            .strict(),
        )
        .max(24)
        .optional(),
    })
    .strict(),
  testimonials: z
    .object({
      ...headFields,
      items: z
        .array(z.object({ quote: text(800), name: singleLine(80), role: optLine(80) }).strict())
        .max(12)
        .optional(),
    })
    .strict(),
  links: z
    .object({
      ...headFields,
      ...imageFields,
      items: z.array(linkSchema).max(30).optional(),
    })
    .strict(),
  contact: z
    .object({
      ...headFields,
      email: optLine(254),
      phone: optLine(32),
      /** The user's own form service address (for example Formspree). Empty means email only. */
      formAction: href.optional(),
      buttonLabel: optLine(40),
    })
    .strict(),
  footer: z
    .object({
      text: optLine(300),
      links: z.array(linkSchema).max(8).optional(),
    })
    .strict(),
  /** Code the user pasted. Runs on the published site; the editor shows it in a sandbox. */
  customCode: z.object({ code: text(MAX_CUSTOM_CODE).optional() }).strict(),
  spacer: z.object({ size: z.enum(['small', 'medium', 'large']).optional() }).strict(),
} as const;

export type BlockPropSchemas = typeof blockPropSchemas;
export type BlockType = keyof BlockPropSchemas;
export type BlockProps<T extends BlockType> = z.infer<BlockPropSchemas[T]>;
export type LinkProps = z.infer<typeof linkSchema>;
