/**
 * Free canvas: a section whose content is placed freely on a fixed-ratio
 * artboard instead of the block's own responsive layout. The default stays
 * `flow`; the editor only offers free placement after a warning (Part 2).
 *
 * Every position and size is a percentage of the artboard, so the artboard can
 * scale with the page width and look the same on desktop and tablet. Items are
 * real text, pictures, links and videos, never images of text. On small phones
 * the artboard falls back to a column in reading order, unless every item has
 * its own phone box (`phoneAspect` + `item.phone`).
 *
 * All geometry is plain numbers checked here; the renderer turns only these
 * numbers into CSS custom properties, so nothing the owner types reaches CSS.
 * No DOM: the editor measures the flow layout and passes the numbers in.
 */
import { z } from 'zod';
import { blockPropSchemas, embedUrl, href, singleLine, type BlockType } from './blocks.ts';
import type { SectionAnimation } from './animation.ts';

export const LAYOUT_MODES = ['flow', 'free'] as const;
export type LayoutMode = (typeof LAYOUT_MODES)[number];

/** How far (in % of the artboard) an item may hang past an edge. */
export const FREE_TOLERANCE = 2;
/** Most items one free section can hold. */
export const MAX_FREE_ITEMS = 100;
/** Most free sections on one page (also an import limit). */
export const MAX_FREE_SECTIONS = 20;
/** Artboard width divided by height. */
export const MIN_FREE_ASPECT = 0.05;
export const MAX_FREE_ASPECT = 20;
/** Smallest item width or height, in % of the artboard. */
export const MIN_FREE_SIZE = 0.25;
/** Text size range, in % of the artboard width (CSS `cqw`). */
export const MIN_FREE_FONT = 0.25;
export const MAX_FREE_FONT = 25;
/** Line height range of text, as a multiple of its size. */
export const MIN_FREE_LEADING = 0.5;
export const MAX_FREE_LEADING = 3;
/** Highest stacking value. */
export const MAX_FREE_Z = 9999;

export const FREE_ITEM_TYPES = ['text', 'image', 'video', 'button'] as const;
export type FreeItemType = (typeof FREE_ITEM_TYPES)[number];
/** title = the section heading (h1/h2), subtitle = a smaller heading, body = paragraphs. */
export const FREE_TEXT_STYLES = ['title', 'subtitle', 'body'] as const;
export const FREE_ALIGNS = ['start', 'center', 'end'] as const;

/**
 * Blocks that can be laid out freely. The footer, spacers and pasted code cannot;
 * a blank canvas always is.
 */
export const FREE_BLOCKS: ReadonlySet<BlockType> = new Set<BlockType>([
  'canvas',
  'hero',
  'about',
  'textImage',
  'gallery',
  'video',
  'projects',
  'testimonials',
  'links',
  'contact',
]);

const itemId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id');

/**
 * Where in the block's props an item came from, like `heading`, `buttons.0` or
 * `items.2.image`. Used to write edits back when the section returns to flow.
 */
const BIND_PATH = /^[a-z][A-Za-z]{0,29}(?:\.(?:\d{1,2}|[a-z][A-Za-z]{0,29})){0,3}$/;
const UNSAFE_SEGMENTS = new Set(['constructor', 'prototype']);
export const bindPathSchema = z
  .string()
  .regex(BIND_PATH, 'Invalid field path')
  .refine((v) => !v.split('.').some((s) => UNSAFE_SEGMENTS.has(s)), 'Invalid field path');

const start = z
  .number()
  .min(-FREE_TOLERANCE)
  .max(100 + FREE_TOLERANCE);
const extent = z
  .number()
  .min(MIN_FREE_SIZE)
  .max(100 + 2 * FREE_TOLERANCE);
const boxFields = { x: start, y: start, w: extent, h: extent };

export const freePhoneBoxSchema = z
  .object({ ...boxFields, /** Not shown on phones. */ hidden: z.literal(true).optional() })
  .strict();

const base = {
  id: itemId,
  ...boxFields,
  /** Stacking: higher is in front. */
  z: z.number().int().min(0).max(MAX_FREE_Z),
  /** Box on the phone artboard; used only when the canvas has `phoneAspect`. */
  phone: freePhoneBoxSchema.optional(),
  from: bindPathSchema.optional(),
};
const fontSize = z.number().min(MIN_FREE_FONT).max(MAX_FREE_FONT);

export const freeItemSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...base,
      type: z.literal('text'),
      style: z.enum(FREE_TEXT_STYLES),
      /** Blank line = new paragraph; escaped when rendered. */
      text: z.string().min(1).max(4000),
      size: fontSize,
      align: z.enum(FREE_ALIGNS).optional(),
      /** Line height as a multiple of the size (kept from the flow layout); absent = the default. */
      leading: z.number().min(MIN_FREE_LEADING).max(MAX_FREE_LEADING).optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal('image'),
      image: itemId,
      /** Describes the picture for screen readers. Missing = a warning, see `freeWarnings`. */
      imageAlt: singleLine(300).optional(),
      fit: z.enum(['cover', 'contain']).optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal('video'),
      /** YouTube or Vimeo link; plays through the click-to-load facade. */
      embedUrl,
      title: singleLine(200).optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal('button'),
      label: singleLine(80, 1),
      href,
      size: fontSize.optional(),
      variant: z.enum(['solid', 'ghost']).optional(),
    })
    .strict(),
]);

const aspect = z.number().min(MIN_FREE_ASPECT).max(MAX_FREE_ASPECT);
const EPSILON = 1e-9;
const fits = (b: { x: number; y: number; w: number; h: number }): boolean =>
  b.x + b.w <= 100 + FREE_TOLERANCE + EPSILON && b.y + b.h <= 100 + FREE_TOLERANCE + EPSILON;

export const freeCanvasSchema = z
  .object({
    /** Artboard width / height on desktop and tablet. */
    aspect,
    /** Phone artboard width / height. Set only when every item has a phone box. */
    phoneAspect: aspect.optional(),
    items: z
      .array(freeItemSchema)
      .max(MAX_FREE_ITEMS, `A free section can hold up to ${MAX_FREE_ITEMS} items`),
    /** Item ids read first, in this order; the rest follow top to bottom, then left to right. */
    readingOrder: z.array(itemId).max(MAX_FREE_ITEMS).optional(),
  })
  .strict()
  .superRefine((canvas, ctx) => {
    const ids = canvas.items.map((i) => i.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'Item ids must be unique' });
    }
    canvas.items.forEach((item, i) => {
      if (!fits(item)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', i],
          message: 'This item is off the canvas',
        });
      }
      if (item.phone && !fits(item.phone)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', i, 'phone'],
          message: 'This item is off the phone canvas',
        });
      }
      if (canvas.phoneAspect !== undefined && !item.phone) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', i, 'phone'],
          message: 'Every item needs a place on phones',
        });
      }
    });
    const order = canvas.readingOrder ?? [];
    if (new Set(order).size !== order.length || order.some((id) => !ids.includes(id))) {
      ctx.addIssue({
        code: 'custom',
        path: ['readingOrder'],
        message: 'The reading order lists an unknown item',
      });
    }
  });

export type FreeItem = z.infer<typeof freeItemSchema>;
export type FreeCanvas = z.infer<typeof freeCanvasSchema>;
export type FreePhoneBox = z.infer<typeof freePhoneBoxSchema>;

/** The parts of a section the free-layout helpers look at. */
interface SectionLike {
  type: BlockType;
  props: object;
  layout?: LayoutMode | undefined;
  canvas?: FreeCanvas | undefined;
  animation?: SectionAnimation | undefined;
}

/** The section's canvas when it is laid out freely, else null. */
export function freeCanvas(section: SectionLike): FreeCanvas | null {
  return section.layout === 'free' && section.canvas ? section.canvas : null;
}

/** Why the section's layout settings do not fit together, or null when they do. */
export function freeSectionProblem(section: SectionLike): string | null {
  const free = section.layout === 'free';
  if (free && !section.canvas) return 'A free section needs its canvas';
  if (!free && section.canvas) return 'Only a free section has a canvas';
  if (free && !FREE_BLOCKS.has(section.type)) return 'This section cannot be placed freely';
  if (!free && section.type === 'canvas') return 'A blank canvas is always placed freely';
  const parts = Object.keys(section.animation ?? {}).filter((k) => k !== 'section');
  if (free && parts.length > 0) return 'A free section can only animate as a whole';
  return null;
}

/**
 * Items in reading order (and DOM order): the manual order first, then the rest
 * top to bottom, then left to right. Ties keep their list order.
 */
export function readingOrder(canvas: FreeCanvas): FreeItem[] {
  const listed = canvas.readingOrder ?? [];
  const byId = new Map(canvas.items.map((item) => [item.id, item]));
  const first = listed.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  const rest = canvas.items
    .filter((item) => !listed.includes(item.id))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  return [...first, ...rest];
}

/** The text of the first title in reading order ('' when there is none). */
export function freeTitle(canvas: FreeCanvas): string {
  const title = readingOrder(canvas).find((i) => i.type === 'text' && i.style === 'title');
  return title?.type === 'text' ? title.text.trim() : '';
}

export interface FreeWarning {
  item: string;
  message: string;
}

/** Things to fix that do not block saving (pictures without a description). */
export function freeWarnings(section: SectionLike): FreeWarning[] {
  const canvas = freeCanvas(section);
  if (!canvas) return [];
  return readingOrder(canvas)
    .filter((item) => item.type === 'image' && !item.imageAlt?.trim())
    .map((item) => ({
      item: item.id,
      message: 'Describe this picture for people who cannot see it.',
    }));
}

// ---- Conversions (pure; the editor measures, these only do arithmetic) ----

/** One element of the flow layout, measured in px relative to the section's content box. */
export interface MeasuredElement {
  /** Prop path the element shows (`heading`, `buttons.0`, `items.1.image`...). */
  from: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Computed font size in px (text and buttons). */
  fontSize?: number | undefined;
  /** Computed line height in px (text), so a tight heading stays as tall as it was. */
  lineHeight?: number | undefined;
}

export interface FlowMeasurement {
  /** Size of the content box (the section's `.wrap`) in px. */
  width: number;
  height: number;
  /** In stacking order: later elements are drawn in front. */
  elements: readonly MeasuredElement[];
}

const TEXT_KEYS = new Set([
  'eyebrow',
  'heading',
  'subheading',
  'intro',
  'body',
  'status',
  'caption',
  'title',
  'tag',
  'year',
  'description',
  'quote',
  'name',
  'role',
  'text',
  'label',
  'value',
  'email',
  'phone',
]);
const DEFAULT_FONT: Record<(typeof FREE_TEXT_STYLES)[number], number> = {
  title: 5,
  subtitle: 2.5,
  body: 1.5,
};

type Segment = string | number;
type Json = Record<string, unknown> | unknown[];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parsePath(path: string): Segment[] | null {
  if (!bindPathSchema.safeParse(path).success) return null;
  return path.split('.').map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

/** Own value at `path`, or undefined. Never reads inherited properties. */
function getAt(root: unknown, path: readonly Segment[]): unknown {
  let current = root;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current) || segment >= current.length) return undefined;
      current = current[segment];
    } else {
      if (!isObject(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
        return undefined;
      }
      current = current[segment];
    }
  }
  return current;
}

const round = (n: number, places: number): number => {
  const f = 10 ** places;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
};
const floor3 = (n: number): number => Math.floor(n * 1000) / 1000;
const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

type ItemContent =
  | { type: 'text'; style: (typeof FREE_TEXT_STYLES)[number]; text: string }
  | { type: 'image'; image: string; imageAlt?: string }
  | { type: 'video'; embedUrl: string }
  | { type: 'button'; label: string; href: string };

/** What the flow element at `from` shows, as item content; null if it cannot be an item. */
function contentAt(props: object, from: string): ItemContent | null {
  const path = parsePath(from);
  if (!path) return null;
  const value = getAt(props, path);
  const last = path[path.length - 1];
  if (last === 'image' && typeof value === 'string') {
    const parent = getAt(props, path.slice(0, -1));
    const alt = isObject(parent) && typeof parent.imageAlt === 'string' ? parent.imageAlt : '';
    return { type: 'image', image: value, ...(alt.trim() ? { imageAlt: alt } : {}) };
  }
  if (last === 'embedUrl' && typeof value === 'string' && value.trim()) {
    return { type: 'video', embedUrl: value };
  }
  if (isObject(value) && typeof value.label === 'string' && typeof value.href === 'string') {
    return value.label.trim() ? { type: 'button', label: value.label, href: value.href } : null;
  }
  if (typeof value === 'string' && typeof last === 'string' && TEXT_KEYS.has(last)) {
    if (!value.trim()) return null;
    const style = last === 'heading' ? 'title' : last === 'title' ? 'subtitle' : 'body';
    return { type: 'text', style, text: value };
  }
  return null;
}

const finite = (...values: number[]): boolean => values.every((v) => Number.isFinite(v));

/**
 * Turns a flow section into a free one, placing each measured element exactly
 * where it was. Elements that cannot become an item (unknown path, empty
 * text, an uploaded video) are listed in `skipped`. Only a whole-section
 * animation is kept. Throws on an impossible measurement.
 */
export function flowToFree<S extends SectionLike>(
  section: S,
  measured: FlowMeasurement,
): { section: S; skipped: string[] } {
  const { width, height } = measured;
  if (!finite(width, height) || width <= 0 || height <= 0) {
    throw new RangeError('The section could not be measured.');
  }
  const ratio = round(clamp(width / height, MIN_FREE_ASPECT, MAX_FREE_ASPECT), 4);
  const boardHeight = width / ratio;
  const skipped: string[] = [];
  const items: FreeItem[] = [];
  for (const el of measured.elements) {
    const content = contentAt(section.props, el.from);
    if (!content || !finite(el.x, el.y, el.width, el.height)) {
      skipped.push(el.from);
      continue;
    }
    const x = round(clamp((el.x / width) * 100, -FREE_TOLERANCE, 100 + FREE_TOLERANCE), 3);
    const y = round(clamp((el.y / boardHeight) * 100, -FREE_TOLERANCE, 100 + FREE_TOLERANCE), 3);
    const room = (pos: number) => Math.max(MIN_FREE_SIZE, 100 + FREE_TOLERANCE - pos);
    const box = {
      // Pull the start back if the item would not fit at its smallest size.
      x: Math.min(x, 100 + FREE_TOLERANCE - MIN_FREE_SIZE),
      y: Math.min(y, 100 + FREE_TOLERANCE - MIN_FREE_SIZE),
      w: 0,
      h: 0,
    };
    box.w = floor3(clamp((el.width / width) * 100, MIN_FREE_SIZE, room(box.x)));
    box.h = floor3(clamp((el.height / boardHeight) * 100, MIN_FREE_SIZE, room(box.y)));
    const size =
      el.fontSize !== undefined && finite(el.fontSize) && el.fontSize > 0
        ? round(clamp((el.fontSize / width) * 100, MIN_FREE_FONT, MAX_FREE_FONT), 3)
        : undefined;
    const common = { id: `i${items.length + 1}`, ...box, z: items.length, from: el.from };
    if (content.type === 'text') {
      const lh = el.lineHeight;
      const leading =
        lh !== undefined &&
        el.fontSize !== undefined &&
        finite(lh, el.fontSize) &&
        lh > 0 &&
        el.fontSize > 0
          ? round(clamp(lh / el.fontSize, MIN_FREE_LEADING, MAX_FREE_LEADING), 3)
          : undefined;
      items.push({
        ...common,
        ...content,
        size: size ?? DEFAULT_FONT[content.style],
        ...(leading !== undefined ? { leading } : {}),
      });
    } else if (content.type === 'button') {
      items.push({ ...common, ...content, ...(size !== undefined ? { size } : {}) });
    } else {
      items.push({ ...common, ...content });
    }
  }
  const canvas = freeCanvasSchema.parse({ aspect: ratio, items });
  const { animation, ...rest } = section;
  const kept = animation?.section ? { animation: { section: animation.section } } : {};
  return { section: { ...rest, ...kept, layout: 'free', canvas } as S, skipped };
}

/** Writes one item's content back to the prop it came from; null when the path does not fit. */
function writeBack(props: Json, item: FreeItem): Json | null {
  const path = item.from === undefined ? null : parsePath(item.from);
  if (!path || path.length === 0) return null;
  const next = JSON.parse(JSON.stringify(props)) as Json;
  const key = path[path.length - 1] as Segment;
  const parent = getAt(next, path.slice(0, -1));
  const current = getAt(next, path);
  const container = parent as Record<string | number, unknown>;
  if (typeof key === 'number' ? !Array.isArray(parent) : !isObject(parent)) return null;
  if (typeof key === 'number' && key >= (parent as unknown[]).length) return null;
  switch (item.type) {
    case 'text':
      if (current !== undefined && typeof current !== 'string') return null;
      container[key] = item.text;
      return next;
    case 'image': {
      if (key !== 'image' || !isObject(parent)) return null;
      parent.image = item.image;
      if (item.imageAlt?.trim()) parent.imageAlt = item.imageAlt;
      else delete parent.imageAlt;
      return next;
    }
    case 'video':
      if (key !== 'embedUrl') return null;
      container[key] = item.embedUrl;
      return next;
    case 'button':
      if (current !== undefined && !isObject(current)) return null;
      container[key] = { label: item.label, href: item.href };
      return next;
  }
}

/**
 * "Return to optimized layout": back to the block's own responsive layout.
 * Positions are discarded; each item's content is written back to the prop it
 * came from. Items added on the canvas, or whose content the block cannot hold,
 * are listed in `dropped` so the editor can say so.
 */
export function freeToFlow<S extends SectionLike>(section: S): { section: S; dropped: string[] } {
  const canvas = freeCanvas(section);
  const rest: SectionLike = { ...section };
  delete rest.layout;
  delete rest.canvas;
  if (!canvas) return { section: rest as S, dropped: [] };
  const schema = blockPropSchemas[section.type];
  let props = section.props as Json;
  const dropped: string[] = [];
  for (const item of readingOrder(canvas)) {
    const next = writeBack(props, item);
    if (next && schema.safeParse(next).success) props = next;
    else dropped.push(item.id);
  }
  return { section: { ...rest, props } as S, dropped };
}
