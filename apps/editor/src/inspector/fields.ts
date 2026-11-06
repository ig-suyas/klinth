import {
  CANVAS_DEFAULT_PX,
  CANVAS_DEFAULT_VH,
  CANVAS_MAX_DIM,
  CANVAS_MAX_MIN_HEIGHT,
  CANVAS_PX,
  CANVAS_VH,
  FOOTER_DEFAULT_PADDING,
  FOOTER_MAX_OFFSET,
  FOOTER_MAX_PADDING,
  SPACER_PRESETS,
  VIDEO_MAX_BORDER,
  VIDEO_MAX_RADIUS,
  VIDEO_MAX_WIDTH,
  VIDEO_MIN_WIDTH,
  blockPropSchemas,
  type BlockType,
} from '@klinth/core';
import { z } from 'zod';

/**
 * What the inspector shows for each block, in plain words. Limits (longest
 * text, most items, allowed choices) are read from the block schemas, so the
 * form can never offer something the schema refuses.
 */

/** Shown only when this returns true for the props (or list item) holding the field. */
type When = { when?: (item: Readonly<Record<string, unknown>>) => boolean };

export type FieldSpec = When &
  (
    | { kind: 'line'; key: string; label: string; help?: string; input?: 'email' | 'tel' }
    | { kind: 'text'; key: string; label: string; help?: string; rows?: number }
    | {
        kind: 'choice';
        key: string;
        label: string;
        options: Record<string, string>;
        /** What the site shows when nothing is picked (defaults to the first option). */
        fallback?: string;
      }
    | { kind: 'link'; key: string; label: string; help?: string }
    /** A number picked with a slider; the block schema checks the range again. */
    | {
        kind: 'number';
        key: string;
        label: string;
        help?: string;
        min: number;
        max: number;
        step: number;
        unit: string;
        /** What the site uses when nothing is set. */
        fallback: number;
      }
    /** An uploaded picture and its description (`altKey`), set together. No `altKey`: decorative. */
    | { kind: 'image'; key: string; altKey?: string; label: string; help?: string }
    /** On or off. `fallback` is what the site does when nothing is set. */
    | { kind: 'toggle'; key: string; label: string; help?: string; fallback: boolean }
    /** A color as #rrggbb. */
    | { kind: 'color'; key: string; label: string; fallback: string }
    /** A few fixed numbers to pick from (for example heights in px). */
    | {
        kind: 'presets';
        key: string;
        label: string;
        help?: string;
        options: readonly number[];
        unit: string;
        /** Picked when nothing is set. */
        fallback?: number;
      }
    /** An uploaded video (`key`) or a YouTube/Vimeo link (`linkKey`). */
    | { kind: 'video'; key: string; linkKey: string; label: string }
    | { kind: 'code'; key: string; label: string }
    | {
        kind: 'list';
        key: string;
        label: string;
        itemLabel: string;
        fields: FieldSpec[];
        newItem: () => Record<string, unknown>;
      }
  );

const ALIGN_OPTIONS = { left: 'Left', center: 'Center', right: 'Right' };
const footAlign = (key: string, label: string, fallback: string): FieldSpec => ({
  kind: 'choice',
  key,
  label,
  options: ALIGN_OPTIONS,
  fallback,
});

const BACKGROUND_OPTIONS = { plain: 'Plain', tinted: 'Soft tint', bold: 'Bold color' };

const eyebrow: FieldSpec = {
  kind: 'line',
  key: 'eyebrow',
  label: 'Small label',
  help: 'A few words above the heading.',
};
const heading: FieldSpec = { kind: 'text', key: 'heading', label: 'Heading', rows: 2 };
const intro: FieldSpec = { kind: 'text', key: 'intro', label: 'Intro text', rows: 3 };
const background: FieldSpec = {
  kind: 'choice',
  key: 'background',
  label: 'Background',
  options: BACKGROUND_OPTIONS,
};
const navLabel: FieldSpec = {
  kind: 'line',
  key: 'navLabel',
  label: 'Name in the menu',
  help: 'Leave empty to keep this section out of the menu.',
};
const body: FieldSpec = {
  kind: 'text',
  key: 'body',
  label: 'Text',
  rows: 6,
  help: 'Leave an empty line to start a new paragraph.',
};
const head = [eyebrow, heading, intro];
const picture = (label = 'Picture'): FieldSpec => ({
  kind: 'image',
  key: 'image',
  altKey: 'imageAlt',
  label,
});
const look = [background, navLabel];

// An empty address is allowed: the link shows as text until the user adds one.
const linkItem = (): Record<string, unknown> => ({ label: 'New link', href: '' });

export const blockFields: { readonly [T in BlockType]: readonly FieldSpec[] } = {
  hero: [
    {
      kind: 'choice',
      key: 'layout',
      label: 'Layout',
      options: {
        editorial: 'Editorial',
        centered: 'Centered',
        split: 'Text beside picture',
        poster: 'Poster',
      },
    },
    {
      kind: 'line',
      key: 'status',
      label: 'Status line',
      help: 'For example "Open for new projects".',
    },
    eyebrow,
    heading,
    { kind: 'text', key: 'subheading', label: 'Text under the heading', rows: 3 },
    picture(),
    {
      kind: 'list',
      key: 'buttons',
      label: 'Buttons',
      itemLabel: 'Button',
      fields: [
        { kind: 'line', key: 'label', label: 'Button text' },
        { kind: 'link', key: 'href', label: 'Goes to' },
      ],
      newItem: () => ({ label: 'New button', href: '#contact' }),
    },
    ...look,
  ],
  about: [
    ...head,
    body,
    picture('Photo'),
    {
      kind: 'list',
      key: 'facts',
      label: 'Quick facts',
      itemLabel: 'Fact',
      fields: [
        { kind: 'line', key: 'label', label: 'Label' },
        { kind: 'line', key: 'value', label: 'Value' },
      ],
      newItem: () => ({ label: 'Based in', value: 'Your city' }),
    },
    ...look,
  ],
  textImage: [
    ...head,
    body,
    picture(),
    {
      kind: 'choice',
      key: 'imageSide',
      label: 'Picture side',
      options: { right: 'Right', left: 'Left' },
    },
    { kind: 'link', key: 'button', label: 'Button' },
    ...look,
  ],
  gallery: [
    ...head,
    {
      kind: 'list',
      key: 'images',
      label: 'Pictures',
      itemLabel: 'Picture',
      fields: [picture(), { kind: 'line', key: 'caption', label: 'Caption' }],
      newItem: () => ({}),
    },
    ...look,
  ],
  video: [
    ...head,
    { kind: 'video', key: 'video', linkKey: 'embedUrl', label: 'Video' },
    { kind: 'text', key: 'caption', label: 'Caption', rows: 2 },
    {
      kind: 'list',
      key: 'videos',
      label: 'More videos',
      itemLabel: 'Video',
      fields: [
        { kind: 'line', key: 'title', label: 'Title', help: 'Shown above the video.' },
        { kind: 'video', key: 'video', linkKey: 'embedUrl', label: 'Video' },
        {
          kind: 'image',
          key: 'poster',
          label: 'Thumbnail',
          help: 'Shown before the video plays.',
        },
      ],
      newItem: () => ({}),
    },
    {
      kind: 'choice',
      key: 'layout',
      label: 'Show the videos as',
      options: { grid: 'Grid', carousel: 'Carousel', deck: 'Stacked deck', single: 'One by one' },
      fallback: 'grid',
      when: (p) => Array.isArray(p.videos) && p.videos.length > 0,
    },
    {
      kind: 'choice',
      key: 'ratio',
      label: 'Shape',
      options: {
        landscape: 'Landscape 16:9',
        vertical: 'Vertical 9:16',
        square: 'Square 1:1',
        portrait: 'Portrait 4:5',
      },
    },
    {
      kind: 'choice',
      key: 'size',
      label: 'Size',
      options: { small: 'Small', medium: 'Medium', large: 'Large', full: 'Full width' },
      fallback: 'full',
    },
    {
      kind: 'number',
      key: 'maxWidth',
      label: 'Custom largest width',
      help: 'Wins over the size above.',
      min: VIDEO_MIN_WIDTH,
      max: VIDEO_MAX_WIDTH,
      step: 10,
      unit: ' px',
      fallback: 720,
    },
    {
      kind: 'choice',
      key: 'frame',
      label: 'Frame',
      options: { plain: 'Plain', card: 'Soft card', glass: 'Glass' },
    },
    {
      kind: 'number',
      key: 'radius',
      label: 'Corner radius',
      min: 0,
      max: VIDEO_MAX_RADIUS,
      step: 1,
      unit: ' px',
      fallback: 16,
    },
    {
      kind: 'choice',
      key: 'shadow',
      label: 'Shadow',
      options: { none: 'None', soft: 'Soft', strong: 'Strong' },
    },
    {
      kind: 'number',
      key: 'border',
      label: 'Border',
      min: 0,
      max: VIDEO_MAX_BORDER,
      step: 1,
      unit: ' px',
      fallback: 0,
    },
    {
      kind: 'choice',
      key: 'play',
      label: 'Play button',
      options: { circle: 'Round', square: 'Square', minimal: 'Minimal' },
    },
    {
      kind: 'image',
      key: 'poster',
      label: 'Thumbnail',
      help: 'Shown before the video plays (YouTube and Vimeo), or as the poster of an uploaded video.',
    },
    {
      kind: 'line',
      key: 'titleBar',
      label: 'Title bar',
      help: 'Optional text in a bar above the video.',
    },
    {
      kind: 'toggle',
      key: 'autoplay',
      label: 'Play silently on a loop',
      help: 'Uploaded videos only. Never for visitors who ask for less motion.',
      fallback: false,
    },
    {
      kind: 'toggle',
      key: 'controls',
      label: 'Show player controls',
      help: 'Can only be turned off for a silent loop.',
      fallback: true,
      when: (p) => p.autoplay === true,
    },
    ...look,
  ],
  projects: [
    ...head,
    {
      kind: 'choice',
      key: 'layout',
      label: 'Layout',
      options: { cards: 'Cards', list: 'Numbered list' },
    },
    {
      kind: 'list',
      key: 'items',
      label: 'Projects',
      itemLabel: 'Project',
      fields: [
        { kind: 'line', key: 'title', label: 'Title' },
        { kind: 'line', key: 'tag', label: 'Tag', help: 'For example "Branding".' },
        { kind: 'line', key: 'year', label: 'Year' },
        { kind: 'text', key: 'description', label: 'Description', rows: 3 },
        picture('Cover picture'),
        { kind: 'link', key: 'link', label: 'Link' },
      ],
      newItem: () => ({ title: 'New project', description: 'One sentence about it.' }),
    },
    ...look,
  ],
  testimonials: [
    ...head,
    {
      kind: 'list',
      key: 'items',
      label: 'Quotes',
      itemLabel: 'Quote',
      fields: [
        { kind: 'text', key: 'quote', label: 'Quote', rows: 3 },
        { kind: 'line', key: 'name', label: 'Name' },
        { kind: 'line', key: 'role', label: 'Role or company' },
      ],
      newItem: () => ({ quote: 'A short, honest quote.', name: 'Their name' }),
    },
    ...look,
  ],
  links: [
    ...head,
    picture('Profile photo'),
    {
      kind: 'list',
      key: 'items',
      label: 'Links',
      itemLabel: 'Link',
      fields: [
        { kind: 'line', key: 'label', label: 'Text' },
        { kind: 'link', key: 'href', label: 'Goes to' },
      ],
      newItem: linkItem,
    },
    ...look,
  ],
  contact: [
    ...head,
    { kind: 'line', key: 'email', label: 'Email', input: 'email' },
    { kind: 'line', key: 'phone', label: 'Phone', input: 'tel' },
    {
      kind: 'link',
      key: 'formAction',
      label: 'Form service address',
      help: 'Optional. Paste the address from a free form service such as Formspree or Web3Forms to show a message form.',
    },
    { kind: 'line', key: 'buttonLabel', label: 'Form button text' },
    ...look,
  ],
  footer: [
    { kind: 'line', key: 'text', label: 'Text' },
    {
      kind: 'list',
      key: 'links',
      label: 'Links',
      itemLabel: 'Link',
      fields: [
        { kind: 'line', key: 'label', label: 'Text' },
        { kind: 'link', key: 'href', label: 'Goes to' },
      ],
      newItem: linkItem,
    },
    footAlign('textAlign', 'Copyright text position', 'left'),
    footAlign('linksAlign', 'Links position', 'left'),
    footAlign('topAlign', '“Back to top” position', 'right'),
    {
      kind: 'number',
      key: 'offset',
      label: 'Move sideways',
      help: 'In % of the content width. Negative moves left, positive moves right.',
      min: -FOOTER_MAX_OFFSET,
      max: FOOTER_MAX_OFFSET,
      step: 0.5,
      unit: '%',
      fallback: 0,
    },
    {
      kind: 'number',
      key: 'padding',
      label: 'Space above and below',
      min: 0,
      max: FOOTER_MAX_PADDING,
      step: 0.25,
      unit: ' rem',
      fallback: FOOTER_DEFAULT_PADDING,
    },
  ],
  customCode: [{ kind: 'code', key: 'code', label: 'Your code' }],
  spacer: [
    {
      kind: 'presets',
      key: 'height',
      label: 'Height',
      help: 'The empty space between the sections above and below.',
      options: SPACER_PRESETS,
      unit: 'px',
    },
  ],
  canvas: [
    {
      kind: 'choice',
      key: 'height',
      label: 'Height',
      options: {
        quarter: 'Quarter',
        half: 'Half',
        threeQuarter: 'Three-quarter',
        full: 'Full screen',
        custom: 'Custom',
      },
      fallback: 'half',
    },
    {
      kind: 'choice',
      key: 'heightUnit',
      label: 'Custom height in',
      options: { vh: '% of the screen', px: 'Pixels' },
      when: (p) => p.height === 'custom',
    },
    {
      kind: 'number',
      key: 'heightVh',
      label: 'Custom height',
      min: CANVAS_VH.min,
      max: CANVAS_VH.max,
      step: 1,
      unit: '% of the screen',
      fallback: CANVAS_DEFAULT_VH,
      when: (p) => p.height === 'custom' && p.heightUnit !== 'px',
    },
    {
      kind: 'number',
      key: 'heightPx',
      label: 'Custom height',
      min: CANVAS_PX.min,
      max: CANVAS_PX.max,
      step: 10,
      unit: ' px',
      fallback: CANVAS_DEFAULT_PX,
      when: (p) => p.height === 'custom' && p.heightUnit === 'px',
    },
    {
      kind: 'number',
      key: 'minHeight',
      label: 'Never shorter than',
      help: 'Keeps the canvas tall enough on short screens.',
      min: 0,
      max: CANVAS_MAX_MIN_HEIGHT,
      step: 10,
      unit: ' px',
      fallback: 0,
    },
    {
      kind: 'choice',
      key: 'fill',
      label: 'Background',
      options: { none: 'None', color: 'Color', gradient: 'Gradient', image: 'Picture' },
    },
    {
      kind: 'color',
      key: 'color',
      label: 'Color',
      fallback: '#1f3fe0',
      when: (p) => p.fill === 'color',
    },
    {
      kind: 'color',
      key: 'color',
      label: 'Gradient from',
      fallback: '#1f3fe0',
      when: (p) => p.fill === 'gradient',
    },
    {
      kind: 'color',
      key: 'colorTo',
      label: 'Gradient to',
      fallback: '#0c0c0d',
      when: (p) => p.fill === 'gradient',
    },
    {
      kind: 'number',
      key: 'angle',
      label: 'Gradient direction',
      min: 0,
      max: 360,
      step: 15,
      unit: '°',
      fallback: 180,
      when: (p) => p.fill === 'gradient',
    },
    {
      kind: 'image',
      key: 'image',
      label: 'Background picture',
      help: 'Decorative: it is not read aloud.',
      when: (p) => p.fill === 'image',
    },
    {
      kind: 'number',
      key: 'dim',
      label: 'Darken the picture',
      min: 0,
      max: CANVAS_MAX_DIM,
      step: 5,
      unit: '%',
      fallback: 0,
      when: (p) => p.fill === 'image',
    },
  ],
};

/** Every prop a field edits (pictures and videos edit two). */
export function specKeys(spec: FieldSpec): string[] {
  if (spec.kind === 'image') return spec.altKey ? [spec.key, spec.altKey] : [spec.key];
  if (spec.kind === 'video') return [spec.key, spec.linkKey];
  return [spec.key];
}

/** Props a block accepts but its renderer does not show, so the inspector hides them. */
export const UNUSED_PROPS: Partial<Record<BlockType, readonly string[]>> = {
  // The big intro uses "Text under the heading" (subheading) instead.
  hero: ['intro'],
  // Older spacers used named sizes; new ones pick a height in px (which wins).
  spacer: ['size'],
};

/** Block types offered in "Add a section", in the order shown. */
export const ADDABLE_BLOCKS: readonly BlockType[] = [
  'hero',
  'about',
  'textImage',
  'gallery',
  'video',
  'projects',
  'testimonials',
  'links',
  'contact',
  'canvas',
  'customCode',
  'footer',
  'spacer',
];

// ---- Reading limits from the schemas ----

function unwrap(schema: z.ZodType): z.ZodType {
  return schema instanceof z.ZodOptional ? unwrap(schema.unwrap() as z.ZodType) : schema;
}

/** The schema of a block prop, or of a field inside a list item. */
export function propSchema(type: BlockType, path: readonly string[]): z.ZodType | undefined {
  let schema: z.ZodType | undefined = blockPropSchemas[type];
  for (const key of path) {
    schema = schema ? unwrap(schema) : undefined;
    if (schema instanceof z.ZodArray) schema = unwrap(schema.element as z.ZodType);
    schema = schema instanceof z.ZodObject ? (schema.shape[key] as z.ZodType) : undefined;
  }
  return schema;
}

/** Longest text a string prop accepts. */
export function maxLength(schema: z.ZodType | undefined): number | undefined {
  const inner = schema && unwrap(schema);
  return inner instanceof z.ZodString ? (inner.maxLength ?? undefined) : undefined;
}

/** Most items a list prop accepts. */
export function maxItems(schema: z.ZodType | undefined): number {
  const inner = schema && unwrap(schema);
  if (!(inner instanceof z.ZodArray)) return 0;
  for (const check of inner.def.checks ?? []) {
    const def = check._zod.def;
    if (def.check === 'max_length' && 'maximum' in def && typeof def.maximum === 'number') {
      return def.maximum;
    }
  }
  return Infinity;
}
