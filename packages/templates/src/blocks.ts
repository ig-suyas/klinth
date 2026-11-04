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
    description: 'A video you upload or a YouTube or Vimeo link.',
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
    description: 'Extra breathing room between sections.',
    defaults: () => ({ size: 'medium' }),
  },
};
