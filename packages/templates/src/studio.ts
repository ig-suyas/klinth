import { SCHEMA_VERSION, type Project } from '@klinth/core';

/**
 * Template 3: a creative studio. Bold typographic direction: bone paper, ink
 * and one cobalt accent, a tight system grotesk set very large, sharp corners
 * and roomy spacing. Its one signature moment is the poster headline rising
 * line by line on load (off for visitors who ask for less motion).
 */
export function createStudio(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      title: 'Field & Form',
      description:
        'Field & Form is a two-person brand and web studio in Lisbon, working with independent shops, makers and cultural spaces.',
      language: 'en',
      headerEnabled: true,
      headerStyle: 'minimal',
    },
    theme: {
      colors: {
        background: '#f2f0eb',
        surface: '#e4e1d9',
        text: '#0c0c0d',
        muted: '#57544c',
        accent: '#1f3fe0',
        accentText: '#f2f0eb',
      },
      fonts: { heading: 'grotesk', body: 'system-sans' },
      radius: 0,
      spacing: 10,
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
              layout: 'poster',
              eyebrow: 'Brand and web studio, Lisbon',
              status: 'Booking projects from March',
              heading: 'We make\nbrands\nthat speak\nclearly.',
              subheading:
                'Field & Form is a two-person studio. We name, shape and build brands and websites for independent shops, makers and cultural spaces.',
              buttons: [
                { label: 'See the work', href: '#work' },
                { label: 'Start a project', href: '#contact' },
              ],
            },
          },
          {
            id: 'work',
            type: 'projects',
            props: {
              navLabel: 'Work',
              layout: 'list',
              eyebrow: 'Selected work',
              heading: 'Recent projects',
              items: [
                {
                  title: 'Tide Bookshop',
                  tag: 'Identity and website',
                  year: '2026',
                  description:
                    'A name, a wordmark and a quick little shop site for an independent bookshop by the river.',
                },
                {
                  title: 'Casa Lume',
                  tag: 'Brand identity',
                  year: '2025',
                  description:
                    'Signage, menus and a warm visual system for a family-run restaurant in Alfama.',
                },
                {
                  title: 'Open Kiln',
                  tag: 'Website',
                  year: '2025',
                  description: 'An events calendar and booking pages for a shared ceramics studio.',
                },
                {
                  title: 'North Paper Fair',
                  tag: 'Campaign',
                  year: '2024',
                  description: 'Posters, tickets and a festival website for a weekend print fair.',
                },
              ],
            },
          },
          {
            id: 'studio',
            type: 'about',
            props: {
              navLabel: 'Studio',
              background: 'tinted',
              eyebrow: 'The studio',
              heading: 'Two people, one table, no hand-offs.',
              body: 'Marta draws and names things. Jonas writes the code. You talk to both of us from the first call to the last file, so nothing gets lost between teams.\n\nWe take on a few projects at a time and say no when we are not the right fit.',
              facts: [
                { label: 'Based in', value: 'Lisbon, Portugal' },
                { label: 'Team', value: 'A designer and a developer' },
                { label: 'We speak', value: 'English and Portuguese' },
              ],
            },
          },
          {
            id: 'process',
            type: 'textImage',
            props: {
              eyebrow: 'How we work',
              heading: 'Short projects, done properly.',
              body: 'Most projects take four to eight weeks. We begin with a half-day workshop, show early directions in the first week and decide together before anything is polished.\n\nAt the end you get every file, a plain guide and a website you can edit yourself.',
            },
          },
          {
            id: 'contact',
            type: 'contact',
            props: {
              navLabel: 'Contact',
              background: 'bold',
              eyebrow: 'Start a project',
              heading: 'Tell us what you are making.',
              intro: 'A few lines is plenty. We answer every message within two working days.',
              email: 'studio@example.com',
            },
          },
          {
            id: 'footer',
            type: 'footer',
            props: {
              text: '© 2026 Field & Form',
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
