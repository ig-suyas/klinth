import { SCHEMA_VERSION, type Project } from './schema.ts';
import { defaultTheme } from './tokens.ts';

/** A small hard-coded project used by tests and as a dev fixture. */
export const sampleProject: Project = {
  schemaVersion: SCHEMA_VERSION,
  meta: {
    title: 'Asha Rao',
    description: 'Designer and illustrator.',
    language: 'en',
    headerEnabled: true,
  },
  theme: defaultTheme,
  pages: [
    {
      slug: '',
      title: 'Home',
      sections: [
        {
          id: 'hero',
          type: 'hero',
          props: {
            heading: 'Asha Rao',
            subheading: 'I draw maps, books & brands.',
            buttons: [{ label: 'See my work', href: '#work' }],
          },
        },
        {
          id: 'work',
          type: 'projects',
          props: {
            heading: 'Selected work',
            items: [
              {
                title: 'River atlas',
                description: 'Hand-drawn maps.',
                image: 'img1',
                imageAlt: 'A river map',
              },
            ],
          },
        },
        {
          id: 'links',
          type: 'links',
          props: {
            heading: 'Find me',
            items: [
              { label: 'Instagram', href: 'https://instagram.com/example' },
              { label: 'Email', href: 'mailto:asha@example.com' },
            ],
          },
        },
        { id: 'footer', type: 'footer', props: { text: '© 2026 Asha Rao' } },
      ],
    },
    {
      slug: 'about',
      title: 'About',
      sections: [
        {
          id: 'about',
          type: 'about',
          props: { heading: 'About me', body: 'Hello.\n\nI live in Pune.' },
        },
      ],
    },
  ],
  assets: [{ id: 'img1', kind: 'image', name: 'river.webp', size: 4, mime: 'image/webp' }],
};
