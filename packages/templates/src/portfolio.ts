import { SCHEMA_VERSION, type Project } from '@klinth/core';

/**
 * Template 1: an editorial personal portfolio. Warm paper colors, a light
 * display serif, sharp corners and numbered covers so it looks finished
 * before the owner adds a single picture.
 */
export function createPortfolio(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      title: 'Ira Sen',
      description:
        'Ira Sen is an independent designer who makes calm, useful brands, websites and apps for small teams.',
      language: 'en',
    },
    theme: {
      colors: {
        background: '#f3efe7',
        surface: '#e8e1d4',
        text: '#17140f',
        muted: '#5a5348',
        accent: '#ad3a15',
        accentText: '#fffaf2',
      },
      fonts: { heading: 'didone', body: 'humanist' },
      radius: 4,
      spacing: 8,
    },
    pages: [
      {
        slug: '',
        title: 'Home',
        sections: [
          {
            id: 'intro',
            type: 'hero',
            props: {
              layout: 'editorial',
              status: 'Taking on new projects',
              eyebrow: 'Independent designer',
              heading: 'Designing calm, useful things.',
              subheading:
                'I help founders and small teams shape brands, websites and apps that feel simple, honest and quietly confident.',
              buttons: [
                { label: 'See selected work', href: '#work' },
                { label: 'Get in touch', href: '#contact' },
              ],
            },
          },
          {
            id: 'work',
            type: 'projects',
            props: {
              navLabel: 'Work',
              layout: 'cards',
              eyebrow: 'Selected work',
              heading: 'A few things I am proud of',
              items: [
                {
                  title: 'Fieldnote',
                  tag: 'Brand and app',
                  year: '2026',
                  description: 'A journaling app for home gardeners, from first sketch to launch.',
                },
                {
                  title: 'Harbour Coffee',
                  tag: 'Identity',
                  year: '2025',
                  description:
                    'A warm, hand-drawn identity for a seaside roastery and its three cafés.',
                },
                {
                  title: 'Atlas of Small Rivers',
                  tag: 'Illustration',
                  year: '2025',
                  description: 'Thirty maps for a guide to the lesser-known rivers of South India.',
                },
                {
                  title: 'Common Ground',
                  tag: 'Website',
                  year: '2024',
                  description: 'A clear, welcoming website for a community land trust.',
                },
              ],
            },
          },
          {
            id: 'about',
            type: 'about',
            props: {
              navLabel: 'About',
              background: 'tinted',
              eyebrow: 'About',
              heading: 'Hello, I am Ira.',
              body: 'I have spent nine years designing for studios, start-ups and nonprofits. These days I work alone, which means you talk to the person doing the work, every step of the way.\n\nI care about clear words, generous space and details that make people feel looked after. Outside work I draw maps, bake bread and walk too far.',
              facts: [
                { label: 'Based in', value: 'Bengaluru, India' },
                { label: 'Experience', value: '9 years' },
                { label: 'Works with', value: 'Founders and small teams' },
              ],
            },
          },
          {
            id: 'process',
            type: 'textImage',
            props: {
              eyebrow: 'How I work',
              heading: 'Small steps, made together.',
              body: 'We start with a short call to understand what you need and what success looks like. Then I share early sketches within a week, so we can steer together before anything is polished.\n\nEvery project ends with clear files and a simple guide, so you can keep going without me.',
            },
          },
          {
            id: 'kind-words',
            type: 'testimonials',
            props: {
              eyebrow: 'Kind words',
              heading: 'What clients say',
              items: [
                {
                  quote:
                    'Ira listened more than anyone we had worked with. The new brand feels like us, only better.',
                  name: 'Meera Pillai',
                  role: 'Founder, Harbour Coffee',
                },
                {
                  quote:
                    'Calm, quick and full of ideas. Our sign-ups doubled after the new website went live.',
                  name: 'Daniel Ortiz',
                  role: 'Director, Common Ground',
                },
                {
                  quote: 'The maps are beautiful, and every one of them arrived on time.',
                  name: 'Lakshmi Rao',
                  role: 'Editor, Riverbank Press',
                },
              ],
            },
          },
          {
            id: 'contact',
            type: 'contact',
            props: {
              navLabel: 'Contact',
              background: 'bold',
              eyebrow: 'Contact',
              heading: 'Let us make something good.',
              intro: 'Tell me a little about your project. I reply within two working days.',
              email: 'hello@example.com',
            },
          },
          {
            id: 'footer',
            type: 'footer',
            props: {
              text: '© 2026 Ira Sen',
              links: [
                { label: 'Instagram', href: 'https://www.instagram.com/' },
                { label: 'LinkedIn', href: 'https://www.linkedin.com/' },
              ],
            },
          },
        ],
      },
    ],
    assets: [],
  };
}
