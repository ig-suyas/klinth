import { describe, expect, it } from 'vitest';
import {
  BLOCK_TYPES,
  contrastRatio,
  defaultTheme,
  migrateProject,
  mixSrgb,
  renderSite,
  sampleProject,
  sectionSchema,
  themeContrastIssues,
  type Project,
  type Section,
} from './index.ts';
import { SITE_CSS, SITE_JS } from './site-assets.ts';

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
const page = (p: Project, path = 'index.html'): string => {
  const f = renderSite(p).find((x) => x.path === path);
  if (!f || typeof f.content !== 'string') throw new Error(`missing ${path}`);
  return f.content;
};
const onePage = (sections: Section[], assets: Project['assets'] = []): Project => ({
  ...clone(),
  pages: [{ slug: '', title: 'Home', sections }],
  assets,
});
const headingLevels = (html: string): number[] =>
  [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));

describe('block schemas', () => {
  it('cover every block type exactly once', () => {
    const types = sectionSchema.options.map((o) => o.shape.type.value);
    expect(types).toEqual(BLOCK_TYPES);
  });

  it('reject unknown props, including key-like names', () => {
    for (const props of [{ heading: 'x', colour: 'red' }, { apiKey: 'x' }]) {
      expect(sectionSchema.safeParse({ id: 'a', type: 'hero', props }).success).toBe(false);
    }
  });

  it.each(['javascript:alert(1)', 'http://plain.example', 'data:text/html,x'])(
    'reject unsafe links at save time: %s',
    (href) => {
      const section = { id: 'a', type: 'links', props: { items: [{ label: 'x', href }] } };
      expect(sectionSchema.safeParse(section).success).toBe(false);
    },
  );

  it('reject line breaks in single-line fields', () => {
    const section = { id: 'a', type: 'footer', props: { text: 'a\nb' } };
    expect(sectionSchema.safeParse(section).success).toBe(false);
  });

  it('accept an empty props object for every block', () => {
    for (const type of BLOCK_TYPES) {
      expect(sectionSchema.safeParse({ id: 'a', type, props: {} }).success).toBe(true);
    }
  });
});

describe('page structure', () => {
  it('has a skip link, a header, one main and the footer outside main', () => {
    const html = page(clone());
    expect(html).toContain('<a class="skip" href="#main">Skip to content</a>');
    expect(html).toContain('<main id="main">');
    expect(html.indexOf('<footer class="site-footer">')).toBeGreaterThan(html.indexOf('</main>'));
    expect(html.match(/<main/g)).toHaveLength(1);
  });

  it('adds an escaped monogram favicon unless the user picked one', () => {
    const p = clone();
    p.meta.title = '<ña';
    const files = renderSite(p);
    const icon = files.find((f) => f.path === 'favicon.svg')?.content;
    expect(icon).toContain('>&lt;</text>');
    expect(page(p)).toContain('<link rel="icon" href="favicon.svg">');
    p.meta.favicon = 'img1';
    expect(renderSite(p).some((f) => f.path === 'favicon.svg')).toBe(false);
    expect(page(p)).toContain('<link rel="icon" href="assets/img1.webp">');
  });

  it('makes the first heading the only h1, even without a hero', () => {
    const html = page(
      onePage([
        { id: 's', type: 'spacer', props: {} },
        { id: 'w', type: 'projects', props: { heading: 'Work', items: [{ title: 'One' }] } },
        { id: 'a', type: 'about', props: { heading: 'About' } },
      ]),
    );
    expect(headingLevels(html)).toEqual([1, 2, 2]);
  });

  it('never skips heading levels inside cards and lists', () => {
    const html = page(
      onePage([
        { id: 'h', type: 'hero', props: { heading: 'Hi' } },
        { id: 'w', type: 'projects', props: { heading: 'Work', items: [{ title: 'One' }] } },
        {
          id: 'l',
          type: 'projects',
          props: { layout: 'list', heading: 'Menu', items: [{ title: 'Two' }] },
        },
      ]),
    );
    expect(headingLevels(html)).toEqual([1, 2, 3, 2, 3]);
  });

  it('lists pages in the menu and marks the current one', () => {
    const html = page(clone());
    expect(html).toContain('<a href="index.html" aria-current="page">Home</a>');
    expect(html).toContain('<a href="about.html">About</a>');
  });

  it('lists named sections on a one-page site, behind a Menu button when long', () => {
    const named = (n: number): Section[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `s${i}`,
        type: 'about' as const,
        props: { heading: `S${i}`, navLabel: `Go ${i}` },
      }));
    const short = page(onePage(named(3)));
    expect(short).toContain('<a href="#s2">Go 2</a>');
    expect(short).not.toContain('<details');
    const long = page(onePage(named(4)));
    expect(long).toContain('<details class="menu"><summary>Menu</summary>');
    expect(page(onePage([{ id: 'x', type: 'about', props: {} }]))).not.toContain('<nav');
  });
});

describe('blocks', () => {
  const asset = {
    id: 'pic',
    kind: 'image' as const,
    name: 'pic.webp',
    size: 10,
    width: 800,
    height: 600,
    mime: 'image/webp' as const,
  };

  it('reserves image space and loads only the first section eagerly', () => {
    const html = page(
      onePage(
        [
          { id: 'h', type: 'hero', props: { heading: 'Hi', image: 'pic', imageAlt: 'Me' } },
          { id: 'a', type: 'about', props: { image: 'pic', imageAlt: 'Me again' } },
        ],
        [asset],
      ),
    );
    expect(html).toContain(
      '<img src="assets/pic.webp" alt="Me" width="800" height="600" fetchpriority="high" decoding="async">',
    );
    expect(html).toContain('alt="Me again" width="800" height="600" loading="lazy"');
  });

  it('draws a numbered cover when a project has no picture', () => {
    const html = page(
      onePage([{ id: 'w', type: 'projects', props: { items: [{ title: 'A' }, { title: 'B' }] } }]),
    );
    expect(html).toContain(
      '<div class="cover cover-2"><span class="cover-num" aria-hidden="true">02</span>',
    );
  });

  it('shows a message form only for an https form address', () => {
    const contact = (formAction: string): string =>
      page(onePage([{ id: 'c', type: 'contact', props: { email: 'a@b.co', formAction } }]));
    expect(contact('https://formspree.io/f/abc')).toContain(
      '<form class="form" action="https://formspree.io/f/abc" method="post">',
    );
    expect(contact('mailto:a@b.co')).not.toContain('<form');
    expect(contact('')).not.toContain('<form');
    expect(contact('')).toContain('<a class="big-link" href="mailto:a@b.co">a@b.co</a>');
  });

  it('labels every form field', () => {
    const html = page(
      onePage([{ id: 'c', type: 'contact', props: { formAction: 'https://example.com/f' } }]),
    );
    const fields = html.match(/<(input|textarea)\b/g) ?? [];
    const labelled = html.match(/<label>[^<]+<(input|textarea)\b/g) ?? [];
    expect(fields.length).toBe(3);
    expect(labelled.length).toBe(fields.length);
  });

  it('turns phone numbers into tel links and drops bad ones', () => {
    const contact = (phone: string): string =>
      page(onePage([{ id: 'c', type: 'contact', props: { phone } }]));
    expect(contact('+91 80 1234 5678')).toContain('href="tel:+918012345678"');
    expect(contact('call me maybe')).not.toContain('tel:');
  });

  it('keeps line breaks as <br> and blank lines as paragraphs, escaped', () => {
    const html = page(
      onePage([{ id: 'a', type: 'about', props: { body: 'One <b>\ntwo\n\nThree' } }]),
    );
    expect(html).toContain('<p>One &lt;b&gt;<br>two</p><p>Three</p>');
  });

  it('applies section backgrounds and hero layouts as classes', () => {
    const html = page(
      onePage([
        { id: 'h', type: 'hero', props: { layout: 'centered', background: 'bold' } },
        { id: 'c', type: 'customCode', props: { code: '<script>alert(1)</script>' } },
      ]),
    );
    expect(html).toContain('class="block block-hero bg-bold"');
    expect(html).toContain('<div class="hero hero-centered">');
    expect(html).not.toContain('<script>alert');
  });
});

describe('site stylesheet and script', () => {
  it('respects reduced motion', () => {
    expect(SITE_CSS).toContain('@media (prefers-reduced-motion:reduce)');
    expect(SITE_JS).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
  });

  it('never builds markup from strings or evaluates code', () => {
    expect(SITE_JS).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/);
  });

  it('loads nothing from other sites', () => {
    expect(SITE_CSS).not.toMatch(/url\(|@import/);
    expect(SITE_JS).not.toMatch(/https?:|fetch\(|XMLHttpRequest/);
  });
});

describe('contrast', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  it('mixes like CSS color-mix in srgb', () => {
    expect(mixSrgb('#ffffff', 0.5, '#000000')).toBe('#808080');
    expect(mixSrgb('#ff0000', 1, '#0000ff')).toBe('#ff0000');
  });

  it('passes for the default theme and flags a pale one', () => {
    expect(themeContrastIssues(defaultTheme)).toEqual([]);
    const pale = { ...defaultTheme, colors: { ...defaultTheme.colors, muted: '#cccccc' } };
    expect(themeContrastIssues(pale).map((i) => i.where)).toContain('Soft text on the background');
  });

  it('validates the sample project with typed props', () => {
    expect(() => migrateProject(clone())).not.toThrow();
  });
});
