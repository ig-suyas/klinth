import { blockPropSchemas, type BlockType } from '@klinth/core';
import { z } from 'zod';

/**
 * What the inspector shows for each block, in plain words. Limits (longest
 * text, most items, allowed choices) are read from the block schemas, so the
 * form can never offer something the schema refuses.
 */

export type FieldSpec =
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
  | {
      kind: 'list';
      key: string;
      label: string;
      itemLabel: string;
      fields: FieldSpec[];
      newItem: () => Record<string, unknown>;
    };

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
const look = [background, navLabel];

// An empty address is allowed: the link shows as text until the user adds one.
const linkItem = (): Record<string, unknown> => ({ label: 'New link', href: '' });

export const blockFields: { readonly [T in BlockType]: readonly FieldSpec[] } = {
  hero: [
    {
      kind: 'choice',
      key: 'layout',
      label: 'Layout',
      options: { editorial: 'Editorial', centered: 'Centered', split: 'Text beside picture' },
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
    {
      kind: 'choice',
      key: 'imageSide',
      label: 'Picture side',
      options: { right: 'Right', left: 'Left' },
    },
    { kind: 'link', key: 'button', label: 'Button' },
    ...look,
  ],
  gallery: [...head, ...look],
  video: [...head, { kind: 'text', key: 'caption', label: 'Caption', rows: 2 }, ...look],
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
  ],
  customCode: [],
  spacer: [
    {
      kind: 'choice',
      key: 'size',
      label: 'Size',
      options: { small: 'Small', medium: 'Medium', large: 'Large' },
      fallback: 'medium',
    },
  ],
};

/** Props the inspector does not show yet (pictures, videos and code arrive in Phase 4). */
export const LATER_PROPS = new Set(['image', 'imageAlt', 'images', 'code']);

/** Props a block accepts but its renderer does not show, so the inspector hides them. */
export const UNUSED_PROPS: Partial<Record<BlockType, readonly string[]>> = {
  // The big intro uses "Text under the heading" (subheading) instead.
  hero: ['intro'],
};

/** Block types offered in "Add a section". Media and code blocks join in Phase 4. */
export const ADDABLE_BLOCKS: readonly BlockType[] = [
  'hero',
  'about',
  'textImage',
  'projects',
  'testimonials',
  'links',
  'contact',
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
