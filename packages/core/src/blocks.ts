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
export const href = z
  .string()
  .max(2048)
  .refine((v) => v === '' || safeUrl(v) !== null, 'Use a link starting with https://');

/** A YouTube or Vimeo link. Embed code (`<iframe ...>`) is refused with its own message. */
export const embedUrl = z
  .string()
  .max(MAX_EMBED_URL_LENGTH)
  .refine((v) => !looksLikeEmbedCode(v), 'Paste the video link, not the embed code')
  .refine((v) => looksLikeEmbedCode(v) || parseVideoUrl(v) !== null, 'Use a YouTube or Vimeo link');

const linkSchema = z.object({ label: singleLine(80), href }).strict();

/** Footer group alignments, the largest sideways shift (%) and the most padding (rem). */
export const FOOTER_ALIGNS = ['left', 'center', 'right'] as const;
export type FooterAlign = (typeof FOOTER_ALIGNS)[number];
export const FOOTER_MAX_OFFSET = 20;
export const FOOTER_MAX_PADDING = 8;
/** The footer's padding (rem) when none is set. */
export const FOOTER_DEFAULT_PADDING = 2.25;

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

// ---- Video look and layouts (all optional; none set = the original player) ----

/** Video shapes: 16:9, 9:16, 1:1 and 4:5. */
export const VIDEO_RATIOS = ['landscape', 'vertical', 'square', 'portrait'] as const;
export type VideoRatio = (typeof VIDEO_RATIOS)[number];
export const VIDEO_SIZES = ['small', 'medium', 'large', 'full'] as const;
export type VideoSize = (typeof VIDEO_SIZES)[number];
/** plain = just the video, card = on a soft card, glass = on frosted glass. */
export const VIDEO_FRAMES = ['plain', 'card', 'glass'] as const;
export const VIDEO_SHADOWS = ['none', 'soft', 'strong'] as const;
export const PLAY_STYLES = ['circle', 'square', 'minimal'] as const;
/** How several videos in one section are shown. */
export const VIDEO_LAYOUTS = ['single', 'grid', 'carousel', 'deck'] as const;
export type VideoLayout = (typeof VIDEO_LAYOUTS)[number];
/** Most videos in one section (the main one plus the list). */
export const MAX_VIDEOS = 12;
/** Custom largest width, in px. */
export const VIDEO_MIN_WIDTH = 160;
export const VIDEO_MAX_WIDTH = 1600;
export const VIDEO_MAX_RADIUS = 48;
export const VIDEO_MAX_BORDER = 8;

/** A whole number of px (or degrees, or %) in a range: never NaN, Infinity or text. */
const whole = (min: number, max: number) => z.number().int().min(min).max(max);

/** One more video in a section with several. */
const videoItemSchema = z
  .object({
    /** Its name for screen readers, also shown in a title bar above it. */
    title: optLine(120),
    video: id.optional(),
    embedUrl: embedUrl.optional(),
    /** Asset id of its own thumbnail (embeds) or poster (uploads). */
    poster: id.optional(),
  })
  .strict();

// ---- Spacer and blank canvas ----

/** Spacer heights offered in the editor, in px. */
export const SPACER_PRESETS = [24, 48, 96, 160, 240, 320] as const;
export const SPACER_MIN = 8;
export const SPACER_MAX = 480;

/** Blank canvas heights in % of the screen height; `custom` uses `heightVh` or `heightPx`. */
export const CANVAS_HEIGHTS = ['quarter', 'half', 'threeQuarter', 'full', 'custom'] as const;
export type CanvasHeight = (typeof CANVAS_HEIGHTS)[number];
export const CANVAS_UNITS = ['vh', 'px'] as const;
export const CANVAS_FILLS = ['none', 'color', 'gradient', 'image'] as const;
export const CANVAS_VH = { min: 10, max: 200 } as const;
export const CANVAS_PX = { min: 80, max: 3000 } as const;
export const CANVAS_MAX_MIN_HEIGHT = 1200;
export const CANVAS_MAX_DIM = 90;

/** A color as `#rrggbb` (it reaches CSS only as three checked numbers). */
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a color like #1f3fe0');

/** Longest custom code, in characters (about 200 KB). */
export const MAX_CUSTOM_CODE = 200_000;

// ---- Extras: usable in any section (see extras.ts) ----

/** Decorative shapes drawn behind a section's content. */
export const SHAPE_KINDS = ['starburst', 'blob', 'rings', 'grid'] as const;
/** Theme colors only, so shapes follow every template and preset. */
export const SHAPE_COLORS = ['accent', 'text', 'muted', 'surface'] as const;
export const SHAPE_MOTIONS = ['none', 'spin', 'float', 'pulse'] as const;
export const MOTION_SPEEDS = ['slow', 'normal', 'fast'] as const;
/** Shape width in px. */
export const SHAPE_SIZE = { min: 32, max: 640 } as const;
export const MAX_SHAPES_PER_SECTION = 4;
export const MAX_SHAPES_PER_PAGE = 12;

const shapeSchema = z
  .object({
    kind: z.enum(SHAPE_KINDS),
    color: z.enum(SHAPE_COLORS).optional(),
    motion: z.enum(SHAPE_MOTIONS).optional(),
    speed: z.enum(MOTION_SPEEDS).optional(),
    size: whole(SHAPE_SIZE.min, SHAPE_SIZE.max).optional(),
    /** Centre of the shape in % of the section's width and height. */
    x: whole(0, 100).optional(),
    y: whole(0, 100).optional(),
    /** In %. */
    opacity: whole(10, 100).optional(),
  })
  .strict();

const shapeFields = {
  shapes: z.array(shapeSchema).max(MAX_SHAPES_PER_SECTION).optional(),
};

/** The section folds behind a title row with an arrow (expand and collapse). */
const foldFields = {
  fold: z.boolean().optional(),
  /** Text of the title row. */
  foldTitle: optLine(120),
  /** Open when the page loads (default: closed). */
  foldOpen: z.boolean().optional(),
};

/** Shapes and folding: every section but the footer (and the spacer, which cannot fold). */
const extraFields = { ...shapeFields, ...foldFields };

/** `glass`: translucent, blurred cards with a soft shadow that lift on hover. */
export const CARD_STYLES = ['plain', 'glass'] as const;
const cardStyleField = { cardStyle: z.enum(CARD_STYLES).optional() };

export const ROTATOR_EFFECTS = ['fade', 'slide', 'typewriter'] as const;
export const MAX_ROTATOR_WORDS = 8;
/** Time each word stays, in ms. */
export const ROTATOR_INTERVAL = { min: 1000, max: 10000, fallback: 2500 } as const;
export const STACK_RATIOS = ['portrait', 'square', 'landscape'] as const;
export const MAX_STACK_IMAGES = 6;
export const STACK_INTERVAL = { min: 2000, max: 10000, fallback: 4000 } as const;
export const STACK_MAX_TILT = 15;
export const MARQUEE_DIRECTIONS = ['left', 'right'] as const;
export const GIANT_FILLS = ['accent', 'ink', 'custom'] as const;
export const GIANT_SIZES = ['large', 'huge', 'max'] as const;

export const blockPropSchemas = {
  hero: z
    .object({
      ...headFields,
      ...imageFields,
      layout: z.enum(['editorial', 'centered', 'split', 'poster']).optional(),
      subheading: optText(600),
      /** A small status line, for example "Open for new projects". */
      status: optLine(80),
      buttons: z.array(linkSchema).max(2).optional(),
      ...extraFields,
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
      ...cardStyleField,
      ...extraFields,
    })
    .strict(),
  textImage: z
    .object({
      ...headFields,
      ...imageFields,
      body: optText(4000),
      imageSide: z.enum(['left', 'right']).optional(),
      button: linkSchema.optional(),
      ...extraFields,
    })
    .strict(),
  gallery: z
    .object({
      ...headFields,
      images: z
        .array(z.object({ ...imageFields, caption: optLine(200) }).strict())
        .max(24)
        .optional(),
      ...extraFields,
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
      /** Shape of every video in the section (not set: 16:9 players, uploads keep their own). */
      ratio: z.enum(VIDEO_RATIOS).optional(),
      size: z.enum(VIDEO_SIZES).optional(),
      /** Custom largest width in px; wins over `size`. */
      maxWidth: whole(VIDEO_MIN_WIDTH, VIDEO_MAX_WIDTH).optional(),
      /** Corner radius in px. */
      radius: whole(0, VIDEO_MAX_RADIUS).optional(),
      shadow: z.enum(VIDEO_SHADOWS).optional(),
      /** Border width in px (0 = none). */
      border: whole(0, VIDEO_MAX_BORDER).optional(),
      frame: z.enum(VIDEO_FRAMES).optional(),
      /** Asset id of a custom thumbnail (embeds) or poster image (uploads). */
      poster: id.optional(),
      play: z.enum(PLAY_STYLES).optional(),
      /** Text in a bar above the main video. */
      titleBar: optLine(120),
      /** Uploaded videos: play silently on a loop (never with reduced motion). */
      autoplay: z.boolean().optional(),
      /** Uploaded videos: show the player controls (default on; always on unless autoplaying). */
      controls: z.boolean().optional(),
      layout: z.enum(VIDEO_LAYOUTS).optional(),
      /** More videos after the main one. */
      videos: z
        .array(videoItemSchema)
        .max(MAX_VIDEOS - 1)
        .optional(),
      ...extraFields,
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
      ...cardStyleField,
      ...extraFields,
    })
    .strict(),
  testimonials: z
    .object({
      ...headFields,
      items: z
        .array(z.object({ quote: text(800), name: singleLine(80), role: optLine(80) }).strict())
        .max(12)
        .optional(),
      ...cardStyleField,
      ...extraFields,
    })
    .strict(),
  links: z
    .object({
      ...headFields,
      ...imageFields,
      items: z.array(linkSchema).max(30).optional(),
      ...cardStyleField,
      ...extraFields,
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
      ...extraFields,
    })
    .strict(),
  footer: z
    .object({
      text: optLine(300),
      links: z.array(linkSchema).max(8).optional(),
      /** Where each group sits (copyright text, links, back to top). Not set: the old row. */
      textAlign: z.enum(FOOTER_ALIGNS).optional(),
      linksAlign: z.enum(FOOTER_ALIGNS).optional(),
      topAlign: z.enum(FOOTER_ALIGNS).optional(),
      /** Sideways shift in % of the content width (never past its edges). */
      offset: z.number().finite().min(-FOOTER_MAX_OFFSET).max(FOOTER_MAX_OFFSET).optional(),
      /** Space above and below, in rem. */
      padding: z.number().finite().min(0).max(FOOTER_MAX_PADDING).optional(),
    })
    .strict(),
  /** Code the user pasted. Runs on the published site; the editor shows it in a sandbox. */
  customCode: z.object({ code: text(MAX_CUSTOM_CODE).optional(), ...extraFields }).strict(),
  spacer: z
    .object({
      size: z.enum(['small', 'medium', 'large']).optional(),
      /** Height in px; wins over `size`. */
      height: whole(SPACER_MIN, SPACER_MAX).optional(),
      ...shapeFields,
    })
    .strict(),
  /**
   * An empty area placed freely from the start (its content is the section's
   * free canvas, see free.ts). These props set its height and background.
   */
  canvas: z
    .object({
      /** Not set: half the screen height. */
      height: z.enum(CANVAS_HEIGHTS).optional(),
      heightUnit: z.enum(CANVAS_UNITS).optional(),
      /** Custom height in % of the screen height. */
      heightVh: whole(CANVAS_VH.min, CANVAS_VH.max).optional(),
      /** Custom height in px. */
      heightPx: whole(CANVAS_PX.min, CANVAS_PX.max).optional(),
      /** Never shorter than this, in px. */
      minHeight: whole(0, CANVAS_MAX_MIN_HEIGHT).optional(),
      fill: z.enum(CANVAS_FILLS).optional(),
      /** The color, or where the gradient starts. */
      color: hexColor.optional(),
      /** Where the gradient ends. */
      colorTo: hexColor.optional(),
      /** Gradient direction in degrees. */
      angle: whole(0, 360).optional(),
      /** Asset id of the background picture (decorative). */
      image: id.optional(),
      /** Darkens the picture so text stays readable, in %. */
      dim: whole(0, CANVAS_MAX_DIM).optional(),
      ...extraFields,
    })
    .strict(),
  /** A heading where one word swaps through a list. */
  rotator: z
    .object({
      ...headFields,
      /** `heading` is the text before the word; this comes after it. */
      words: z
        .array(z.object({ word: singleLine(40, 1) }).strict())
        .max(MAX_ROTATOR_WORDS)
        .optional(),
      after: optLine(120),
      effect: z.enum(ROTATOR_EFFECTS).optional(),
      interval: whole(ROTATOR_INTERVAL.min, ROTATOR_INTERVAL.max).optional(),
      align: z.enum(['left', 'center']).optional(),
      ...extraFields,
    })
    .strict(),
  /** Pictures stacked with a slight tilt that shuffle. */
  cardStack: z
    .object({
      ...headFields,
      images: z
        .array(z.object({ ...imageFields, caption: optLine(200) }).strict())
        .max(MAX_STACK_IMAGES)
        .optional(),
      /** Shuffle by itself (never for visitors who ask for less motion). */
      auto: z.boolean().optional(),
      interval: whole(STACK_INTERVAL.min, STACK_INTERVAL.max).optional(),
      /** Degrees of tilt per card behind the front one. */
      tilt: whole(0, STACK_MAX_TILT).optional(),
      ratio: z.enum(STACK_RATIOS).optional(),
      ...extraFields,
    })
    .strict(),
  /** Numbered steps on cards. */
  steps: z
    .object({
      ...headFields,
      items: z
        .array(z.object({ title: singleLine(120, 1), text: optText(600) }).strict())
        .max(8)
        .optional(),
      ...cardStyleField,
      ...extraFields,
    })
    .strict(),
  /** Quote cards that scroll sideways by themselves. `**words**` are highlighted. */
  marquee: z
    .object({
      ...headFields,
      items: z
        .array(z.object({ quote: text(600), name: singleLine(80), role: optLine(80) }).strict())
        .max(12)
        .optional(),
      speed: z.enum(MOTION_SPEEDS).optional(),
      direction: z.enum(MARQUEE_DIRECTIONS).optional(),
      ...cardStyleField,
      ...extraFields,
    })
    .strict(),
  /** Very large type with a gradient fill. `heading` is the text. */
  giantText: z
    .object({
      ...headFields,
      fill: z.enum(GIANT_FILLS).optional(),
      color: hexColor.optional(),
      colorTo: hexColor.optional(),
      angle: whole(0, 360).optional(),
      size: z.enum(GIANT_SIZES).optional(),
      align: z.enum(['left', 'center', 'right']).optional(),
      /** Cut off at the bottom edge of the section. */
      crop: z.boolean().optional(),
      /** Rises into view on scroll. */
      reveal: z.boolean().optional(),
      ...extraFields,
    })
    .strict(),
} as const;

export type BlockPropSchemas = typeof blockPropSchemas;
export type BlockType = keyof BlockPropSchemas;
export type BlockProps<T extends BlockType> = z.infer<BlockPropSchemas[T]>;
export type LinkProps = z.infer<typeof linkSchema>;
