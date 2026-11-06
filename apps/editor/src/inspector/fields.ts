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
  ROTATOR_INTERVAL,
  SHAPE_SIZE,
  SPACER_PRESETS,
  STACK_INTERVAL,
  STACK_MAX_TILT,
  VIDEO_MAX_BORDER,
  VIDEO_MAX_RADIUS,
  VIDEO_MAX_WIDTH,
  VIDEO_MIN_WIDTH,
  blockPropSchemas,
  type BlockType,
} from '@klinth/core';
import type { SectionPresetId } from '@klinth/templates';
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

// ---- Extras: shapes and folding on (almost) every section, glass on card sections ----

const cardStyle: FieldSpec = {
  kind: 'choice',
  key: 'cardStyle',
  label: 'Card style',
  options: { plain: 'Plain', glass: 'Frosted glass' },
};
const shapes: FieldSpec = {
  kind: 'list',
  key: 'shapes',
  label: 'Decorative shapes',
  itemLabel: 'Shape',
  fields: [
    {
      kind: 'choice',
      key: 'kind',
      label: 'Shape',
      options: { starburst: 'Star burst', blob: 'Blob', rings: 'Rings', grid: 'Dot grid' },
    },
    {
      kind: 'choice',
      key: 'color',
      label: 'Color',
      options: { accent: 'Accent', text: 'Text', muted: 'Soft', surface: 'Light' },
    },
    {
      kind: 'choice',
      key: 'motion',
      label: 'Movement',
      options: { none: 'Still', spin: 'Spin', float: 'Float', pulse: 'Pulse' },
    },
    {
      kind: 'choice',
      key: 'speed',
      label: 'Speed',
      options: { slow: 'Slow', normal: 'Normal', fast: 'Fast' },
      fallback: 'normal',
      when: (item) => item.motion !== undefined && item.motion !== 'none',
    },
    {
      kind: 'number',
      key: 'size',
      label: 'Size',
      min: SHAPE_SIZE.min,
      max: SHAPE_SIZE.max,
      step: 8,
      unit: ' px',
      fallback: 160,
    },
    {
      kind: 'number',
      key: 'x',
      label: 'Across',
      help: '0 is the left edge, 100 the right edge.',
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      fallback: 85,
    },
    {
      kind: 'number',
      key: 'y',
      label: 'Down',
      help: '0 is the top, 100 the bottom.',
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      fallback: 20,
    },
    {
      kind: 'number',
      key: 'opacity',
      label: 'Strength',
      min: 10,
      max: 100,
      step: 5,
      unit: '%',
      fallback: 100,
    },
  ],
  newItem: () => ({ kind: 'starburst', color: 'accent', motion: 'spin', size: 140, x: 85, y: 20 }),
};
const fold: FieldSpec[] = [
  {
    kind: 'toggle',
    key: 'fold',
    label: 'Fold behind a title row',
    help: 'Visitors open and close the section with an arrow.',
    fallback: false,
  },
  {
    kind: 'line',
    key: 'foldTitle',
    label: 'Title row text',
    help: 'Empty: “Show more”.',
    when: (p) => p.fold === true,
  },
  {
    kind: 'toggle',
    key: 'foldOpen',
    label: 'Open when the page loads',
    fallback: false,
    when: (p) => p.fold === true,
  },
];
/** Shapes and folding, offered on every section but the footer (empty space only gets shapes). */
const extras: FieldSpec[] = [shapes, ...fold];

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
    ...extras,
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
    cardStyle,
    ...look,
    ...extras,
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
    ...extras,
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
    ...extras,
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
    ...extras,
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
    cardStyle,
    ...look,
    ...extras,
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
    cardStyle,
    ...look,
    ...extras,
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
    cardStyle,
    ...look,
    ...extras,
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
    ...extras,
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
  customCode: [{ kind: 'code', key: 'code', label: 'Your code' }, ...extras],
  spacer: [
    {
      kind: 'presets',
      key: 'height',
      label: 'Height',
      help: 'The empty space between the sections above and below.',
      options: SPACER_PRESETS,
      unit: 'px',
    },
    shapes,
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
    ...extras,
  ],
  rotator: [
    eyebrow,
    { kind: 'line', key: 'heading', label: 'Text before the word' },
    {
      kind: 'list',
      key: 'words',
      label: 'Words that change',
      itemLabel: 'Word',
      fields: [{ kind: 'line', key: 'word', label: 'Word' }],
      newItem: () => ({ word: 'new word' }),
    },
    { kind: 'line', key: 'after', label: 'Text after the word', help: 'Optional.' },
    {
      kind: 'choice',
      key: 'effect',
      label: 'How the word changes',
      options: { fade: 'Fade', slide: 'Slide up', typewriter: 'Typewriter' },
    },
    {
      kind: 'number',
      key: 'interval',
      label: 'Each word stays',
      help: '1000 ms is one second. Visitors who ask for less motion only see the first word.',
      min: ROTATOR_INTERVAL.min,
      max: ROTATOR_INTERVAL.max,
      step: 250,
      unit: ' ms',
      fallback: ROTATOR_INTERVAL.fallback,
    },
    {
      kind: 'choice',
      key: 'align',
      label: 'Position',
      options: { left: 'Left', center: 'Centered' },
    },
    intro,
    ...look,
    ...extras,
  ],
  cardStack: [
    ...head,
    {
      kind: 'list',
      key: 'images',
      label: 'Pictures',
      itemLabel: 'Picture',
      fields: [picture(), { kind: 'line', key: 'caption', label: 'Caption' }],
      newItem: () => ({}),
    },
    {
      kind: 'choice',
      key: 'ratio',
      label: 'Picture shape',
      options: { portrait: 'Tall 4:5', square: 'Square', landscape: 'Wide 4:3' },
    },
    {
      kind: 'number',
      key: 'tilt',
      label: 'Tilt',
      min: 0,
      max: STACK_MAX_TILT,
      step: 1,
      unit: '°',
      fallback: 6,
    },
    {
      kind: 'toggle',
      key: 'auto',
      label: 'Shuffle by itself',
      help: 'Stops while someone points at it, and never for visitors who ask for less motion.',
      fallback: false,
    },
    {
      kind: 'number',
      key: 'interval',
      label: 'Next picture every',
      min: STACK_INTERVAL.min,
      max: STACK_INTERVAL.max,
      step: 500,
      unit: ' ms',
      fallback: STACK_INTERVAL.fallback,
      when: (p) => p.auto === true,
    },
    ...look,
    ...extras,
  ],
  steps: [
    ...head,
    {
      kind: 'list',
      key: 'items',
      label: 'Steps',
      itemLabel: 'Step',
      fields: [
        { kind: 'line', key: 'title', label: 'Title' },
        { kind: 'text', key: 'text', label: 'Text', rows: 2 },
      ],
      newItem: () => ({ title: 'Next step', text: 'One sentence about it.' }),
    },
    cardStyle,
    ...look,
    ...extras,
  ],
  marquee: [
    ...head,
    {
      kind: 'list',
      key: 'items',
      label: 'Quotes',
      itemLabel: 'Quote',
      fields: [
        {
          kind: 'text',
          key: 'quote',
          label: 'Quote',
          rows: 3,
          help: 'Put **two stars** around words to highlight them.',
        },
        { kind: 'line', key: 'name', label: 'Name' },
        { kind: 'line', key: 'role', label: 'Role or company' },
      ],
      newItem: () => ({ quote: 'A short, **honest** quote.', name: 'Their name' }),
    },
    {
      kind: 'choice',
      key: 'speed',
      label: 'Speed',
      options: { slow: 'Slow', normal: 'Normal', fast: 'Fast' },
      fallback: 'normal',
    },
    {
      kind: 'choice',
      key: 'direction',
      label: 'Moves',
      options: { left: 'To the left', right: 'To the right' },
    },
    cardStyle,
    ...look,
    ...extras,
  ],
  giantText: [
    eyebrow,
    {
      kind: 'text',
      key: 'heading',
      label: 'Giant text',
      rows: 2,
      help: 'One or two short words work best.',
    },
    intro,
    {
      kind: 'choice',
      key: 'fill',
      label: 'Color',
      options: { accent: 'Accent to text', ink: 'Text to soft', custom: 'My own gradient' },
    },
    {
      kind: 'color',
      key: 'color',
      label: 'Gradient from',
      fallback: '#1f3fe0',
      when: (p) => p.fill === 'custom',
    },
    {
      kind: 'color',
      key: 'colorTo',
      label: 'Gradient to',
      fallback: '#0c0c0d',
      when: (p) => p.fill === 'custom',
    },
    {
      kind: 'number',
      key: 'angle',
      label: 'Gradient direction',
      min: 0,
      max: 360,
      step: 15,
      unit: '°',
      fallback: 100,
    },
    {
      kind: 'choice',
      key: 'size',
      label: 'Size',
      options: { large: 'Large', huge: 'Huge', max: 'Biggest' },
      fallback: 'huge',
    },
    {
      kind: 'choice',
      key: 'align',
      label: 'Position',
      options: { left: 'Left', center: 'Centered', right: 'Right' },
    },
    {
      kind: 'toggle',
      key: 'crop',
      label: 'Cut off at the bottom of the section',
      fallback: false,
    },
    {
      kind: 'toggle',
      key: 'reveal',
      label: 'Rise into view on scroll',
      help: 'Never for visitors who ask for less motion.',
      fallback: false,
    },
    ...look,
    ...extras,
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

/** A block type, or a ready-made section built from one (see `sectionPresets`). */
export type AddEntry = BlockType | SectionPresetId;

/** What "Add a section" offers, in the order shown. */
export const ADDABLE_SECTIONS: readonly AddEntry[] = [
  'hero',
  'about',
  'textImage',
  'gallery',
  'video',
  'projects',
  'testimonials',
  'links',
  'contact',
  'rotator',
  'giantText',
  'steps',
  'marquee',
  'cardStack',
  'expandable',
  'shapes',
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
