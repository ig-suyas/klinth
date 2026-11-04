import { SCHEMA_VERSION, type Project } from '@klinth/core';

/**
 * Template 2: a small business landing page that doubles as a link page.
 * Deep green with a warm saffron accent, a bold grotesk, rounded corners and
 * a centered layout that reads well on a phone.
 */
export function createLanding(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      title: 'Kiln & Crumb',
      description:
        'Kiln & Crumb is a neighbourhood bakery on Church Street baking slow-fermented bread, pastries and good coffee every morning.',
      language: 'en',
      headerEnabled: true,
    },
    theme: {
      colors: {
        background: '#0f1f19',
        surface: '#172a22',
        text: '#f3eee2',
        muted: '#aab6a9',
        accent: '#e8b65c',
        accentText: '#0f1f19',
      },
      fonts: { heading: 'bricolage', body: 'figtree' },
      radius: 20,
      spacing: 8,
    },
    pages: [
      {
        slug: '',
        title: 'Home',
        sections: [
          {
            id: 'welcome',
            type: 'hero',
            props: {
              layout: 'centered',
              status: 'Open today, 7 am to 7 pm',
              heading: 'Bread worth waking up for.',
              subheading:
                'Slow-fermented loaves, flaky pastries and good coffee, baked fresh every morning on Church Street.',
              buttons: [
                { label: 'See the menu', href: '#menu' },
                { label: 'Plan your visit', href: '#visit' },
              ],
            },
          },
          {
            id: 'links',
            type: 'links',
            props: {
              background: 'tinted',
              eyebrow: 'Quick links',
              heading: 'Everything in one place',
              items: [
                { label: 'Order for pickup', href: 'https://example.com/order' },
                { label: 'Today’s bakes on Instagram', href: 'https://www.instagram.com/' },
                { label: 'Call the bakery', href: 'tel:+918012345678' },
                { label: 'Email us', href: 'mailto:hello@example.com' },
              ],
            },
          },
          {
            id: 'menu',
            type: 'projects',
            props: {
              navLabel: 'Menu',
              layout: 'list',
              eyebrow: 'The menu',
              heading: 'Baked this morning',
              intro: 'A short menu that changes with the season. Everything is made here, by hand.',
              items: [
                {
                  title: 'Country sourdough',
                  tag: '₹220',
                  description: 'A 48-hour ferment, a crackly crust and a soft, open crumb.',
                },
                {
                  title: 'Cardamom buns',
                  tag: '₹90',
                  description: 'Knotted, glazed and fragrant. Usually gone by eleven.',
                },
                {
                  title: 'Sourdough focaccia',
                  tag: '₹160',
                  description: 'Olive oil, sea salt and rosemary from the garden.',
                },
                {
                  title: 'Seasonal fruit tart',
                  tag: '₹140',
                  description: 'Buttery pastry and whatever is ripe at the market this week.',
                },
                {
                  title: 'Filter coffee',
                  tag: '₹80',
                  description: 'Single-estate beans from Chikmagalur, brewed strong.',
                },
              ],
            },
          },
          {
            id: 'story',
            type: 'textImage',
            props: {
              background: 'tinted',
              navLabel: 'Story',
              eyebrow: 'Our story',
              heading: 'Two ovens, one simple idea.',
              body: 'We opened in 2019 with two ovens and a belief that good bread takes time. We still mix every dough by hand and let it rest overnight.\n\nMost mornings you will find us dusted in flour by five, so the first loaves are warm when the doors open.',
            },
          },
          {
            id: 'kind-words',
            type: 'testimonials',
            props: {
              eyebrow: 'Kind words',
              heading: 'Loved by the neighbourhood',
              items: [
                {
                  quote:
                    'The best sourdough in the city, and the kindest people behind the counter.',
                  name: 'Ananya K.',
                  role: 'Regular since 2019',
                },
                {
                  quote: 'Their cardamom buns are the reason I get up early on Sundays.',
                  name: 'Rahul M.',
                  role: 'Weekend regular',
                },
                {
                  quote:
                    'They baked our wedding cake and it was perfect. Guests still talk about it.',
                  name: 'Sara and Vik',
                  role: 'Married in 2025',
                },
              ],
            },
          },
          {
            id: 'visit',
            type: 'about',
            props: {
              navLabel: 'Visit',
              eyebrow: 'Visit us',
              heading: 'Come and say hello.',
              body: 'We are a short walk from the metro, with a few tables inside and a small garden at the back. Dogs are welcome in the garden.',
              facts: [
                { label: 'Address', value: '14 Church Street, Bengaluru' },
                { label: 'Open', value: 'Tuesday to Sunday' },
                { label: 'Hours', value: '7 am to 7 pm' },
              ],
            },
          },
          {
            id: 'contact',
            type: 'contact',
            props: {
              background: 'bold',
              eyebrow: 'Orders and events',
              heading: 'Planning a party?',
              intro:
                'We bake for birthdays, weddings and office mornings. Send us a note and we will reply within a day.',
              email: 'hello@example.com',
              phone: '+91 80 1234 5678',
            },
          },
          {
            id: 'footer',
            type: 'footer',
            props: {
              text: '© 2026 Kiln & Crumb',
              links: [
                { label: 'Instagram', href: 'https://www.instagram.com/' },
                { label: 'Google Maps', href: 'https://maps.google.com/' },
              ],
            },
          },
        ],
      },
    ],
    assets: [],
  };
}
