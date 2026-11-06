import type { BlockProps, BlockType } from '@klinth/core';

/** What the editor shows for each block, in plain language, and what a new one starts with. */
export interface BlockDefinition<T extends BlockType = BlockType> {
  readonly label: string;
  readonly description: string;
  readonly defaults: () => BlockProps<T>;
}

type BlockDefinitions = { readonly [T in BlockType]: BlockDefinition<T> };

export const blockDefinitions: BlockDefinitions = {
  hero: {
    label: 'Big intro',
    description: 'The first thing people see: a large heading, a sentence and buttons.',
    defaults: () => ({
      layout: 'editorial',
      heading: 'Your big headline',
      subheading: 'One or two sentences about who you are and what you do.',
      buttons: [{ label: 'Get in touch', href: '#contact' }],
    }),
  },
  about: {
    label: 'About',
    description: 'A few paragraphs about you, with an optional photo and quick facts.',
    defaults: () => ({
      eyebrow: 'About',
      heading: 'A little about me',
      body: 'Write a few words here.',
    }),
  },
  textImage: {
    label: 'Text and picture',
    description: 'A heading and text beside a picture.',
    defaults: () => ({ heading: 'A short heading', body: 'Write a few words here.' }),
  },
  gallery: {
    label: 'Picture gallery',
    description: 'A neat grid of pictures with optional captions.',
    defaults: () => ({ heading: 'Gallery', images: [] }),
  },
  video: {
    label: 'Video',
    description:
      'One or more videos you upload or link from YouTube or Vimeo: pick the shape, size and frame, and show several as a grid, carousel or stacked deck.',
    defaults: () => ({ heading: 'Watch' }),
  },
  projects: {
    label: 'Work and projects',
    description: 'Cards or a numbered list of your projects, products or services.',
    defaults: () => ({
      layout: 'cards',
      heading: 'Selected work',
      items: [{ title: 'Project name', description: 'One sentence about it.' }],
    }),
  },
  testimonials: {
    label: 'Kind words',
    description: 'Quotes from happy clients or customers.',
    defaults: () => ({
      heading: 'Kind words',
      items: [{ quote: 'A short, honest quote.', name: 'Their name' }],
    }),
  },
  links: {
    label: 'Link list',
    description: 'Big, easy-to-tap buttons for all your links.',
    defaults: () => ({ heading: 'Find me online', items: [] }),
  },
  contact: {
    label: 'Contact',
    description: 'Your email and phone, and an optional message form.',
    defaults: () => ({ background: 'bold', heading: 'Say hello', email: '' }),
  },
  footer: {
    label: 'Footer',
    description: 'The small print at the bottom of every page.',
    defaults: () => ({ text: '© Your name' }),
  },
  customCode: {
    label: 'Custom code',
    description: 'Paste code from another service. Only paste code you trust.',
    defaults: () => ({ code: '' }),
  },
  spacer: {
    label: 'Empty space',
    description:
      'A plain gap between two sections, from 24 to 320 px tall. Nothing goes inside it.',
    defaults: () => ({ height: 96 }),
  },
  canvas: {
    label: 'Blank canvas',
    description:
      'An empty area you design yourself: place text, pictures, buttons and videos anywhere. Pick its height and background.',
    defaults: () => ({ height: 'half' }),
  },
  rotator: {
    label: 'Rotating headline',
    description:
      'A big heading where one word keeps changing, for example “We design websites / shops / brands”. Pick fade, slide or typewriter and how long each word stays.',
    defaults: () => ({
      heading: 'We design',
      words: [{ word: 'websites' }, { word: 'shops' }, { word: 'brands' }],
      effect: 'slide',
      interval: 2500,
    }),
  },
  cardStack: {
    label: 'Picture stack',
    description:
      'Three to six pictures piled up with a slight tilt. Visitors flip through them with a click, a swipe or the arrows; they can also shuffle by themselves.',
    defaults: () => ({ heading: 'A few moments', images: [], tilt: 6 }),
  },
  steps: {
    label: 'Numbered steps',
    description:
      'Explain how something works in a few numbered steps, on frosted glass cards (or plain ones).',
    defaults: () => ({
      heading: 'How it works',
      cardStyle: 'glass',
      items: [
        { title: 'We talk', text: 'Tell me what you need.' },
        { title: 'I make it', text: 'You see progress every week.' },
        { title: 'You launch', text: 'Your site goes live.' },
      ],
    }),
  },
  marquee: {
    label: 'Moving quotes',
    description:
      'Quotes from clients on cards that slide sideways by themselves and stop when someone points at them. Put **two stars** around words to highlight them.',
    defaults: () => ({
      heading: 'Kind words',
      items: [
        { quote: 'A short, **honest** quote.', name: 'Their name' },
        { quote: 'Another quote about **working together**.', name: 'Another name' },
        { quote: 'One more happy client.', name: 'Third name' },
      ],
    }),
  },
  giantText: {
    label: 'Giant text',
    description:
      'One or two words in huge letters with a color gradient, that can rise into view and be cut off at the bottom of the section.',
    defaults: () => ({ heading: 'Hello', fill: 'accent', size: 'huge', reveal: true }),
  },
};

/** A ready-made section that is an existing block with some settings already picked. */
export interface SectionPreset<T extends BlockType = BlockType> {
  readonly type: T;
  readonly label: string;
  readonly description: string;
  readonly defaults: () => BlockProps<T>;
}

const preset = <T extends BlockType>(p: SectionPreset<T>): SectionPreset => p as SectionPreset;

/** Extra entries in "Add a section" built from existing blocks. */
export const sectionPresets = {
  expandable: preset({
    type: 'textImage',
    label: 'Expandable section',
    description:
      'A title row with an arrow that opens and closes what is below it. Any other section can also fold this way from its settings.',
    defaults: () => ({
      heading: 'The details',
      body: 'Write the details here. Visitors open them with the arrow.',
      fold: true,
      foldTitle: 'Read the details',
    }),
  }),
  shapes: preset({
    type: 'spacer',
    label: 'Decorative shapes',
    description:
      'A band of shapes in your theme colors (star burst, blob, rings, dot grid) that can spin, float or pulse. Any section can get shapes from its settings.',
    defaults: () => ({
      height: 160,
      shapes: [
        { kind: 'starburst', color: 'accent', motion: 'spin', size: 140, x: 82, y: 50 },
        { kind: 'rings', color: 'muted', motion: 'float', size: 120, x: 18, y: 50, opacity: 60 },
      ],
    }),
  }),
} as const satisfies Record<string, SectionPreset>;

export type SectionPresetId = keyof typeof sectionPresets;
