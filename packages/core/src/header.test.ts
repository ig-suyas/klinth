import { describe, expect, it } from 'vitest';
import {
  HEADER_BACKGROUNDS,
  HEADER_STYLES,
  assetUsage,
  buildExport,
  contrastRatio,
  defaultHeader,
  deletePage,
  headerColors,
  headerContrastIssues,
  headerSchema,
  headerToCss,
  migrateProject,
  parseProjectFile,
  projectSchema,
  removeAsset,
  renamePage,
  renderSite,
  resolveHeader,
  serializeProject,
  type HeaderSettings,
  type Project,
} from './index.ts';
import { sampleProject } from './sample.ts';
import { TEST_FONTS } from './test-fonts.ts';

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
const withHeader = (patch: Partial<HeaderSettings>, p = clone()): Project => {
  p.meta.header = { ...defaultHeader(p.meta.headerStyle ?? 'bar'), ...patch };
  return p;
};
const file = (p: Project, path: string): string => {
  const f = renderSite(p).find((x) => x.path === path);
  if (typeof f?.content !== 'string') throw new Error(`${path} missing`);
  return f.content;
};
const headerTag = (html: string): string => /<header[^>]*>/.exec(html)?.[0] ?? '';
const valid = (p: unknown): boolean => projectSchema.safeParse(p).success;

describe('header settings schema', () => {
  it('accepts every layout, background and theme color', () => {
    for (const layout of ['full', 'floating'] as const) {
      for (const background of HEADER_BACKGROUNDS) {
        for (const color of ['background', 'surface', 'accent', 'text'] as const) {
          for (const sticky of [true, false]) {
            const p = withHeader({ layout, background, color, sticky });
            expect(migrateProject(p), `${layout} ${background} ${color}`).toEqual(p);
          }
        }
      }
    }
  });

  it('needs a valid custom color when "custom" is picked', () => {
    expect(valid(withHeader({ color: 'custom', customColor: '#12ab9f' }))).toBe(true);
    expect(valid(withHeader({ color: 'custom' }))).toBe(false);
    for (const bad of ['red', '#fff', '#12345g', '#123456;}body{x', 'url(x)', '#1234567']) {
      expect(valid(withHeader({ color: 'custom', customColor: bad })), bad).toBe(false);
    }
  });

  it('refuses unknown values and extra fields', () => {
    const bad: Record<string, unknown>[] = [
      { layout: 'sideways' },
      { background: 'blur' },
      { color: 'pink' },
      { sticky: 'yes' },
      { onclick: 'x' },
    ];
    for (const patch of bad) {
      const p = clone() as unknown as { meta: Record<string, unknown> };
      p.meta.header = { ...defaultHeader('bar'), ...patch };
      expect(valid(p), JSON.stringify(patch)).toBe(false);
    }
    expect(headerSchema.safeParse({}).success).toBe(false);
  });

  it('is optional: projects without it validate and render the old header', () => {
    const p = clone();
    expect(p.meta.header).toBeUndefined();
    expect(headerTag(file(p, 'index.html'))).toBe(
      '<header class="site-header header-bar" id="top">',
    );
  });

  it('round-trips through the project file', () => {
    const p = withHeader({
      layout: 'floating',
      background: 'glass',
      cta: { label: 'Book a call', href: 'https://example.com/book' },
      logo: { image: 'img1', imageAlt: 'Asha Rao' },
    });
    expect(parseProjectFile(serializeProject(p))).toEqual(p);
  });

  it('gives each style a sensible starting point', () => {
    for (const style of HEADER_STYLES) {
      expect(headerSchema.parse(defaultHeader(style))).toEqual(defaultHeader(style));
    }
    expect(defaultHeader('pill').layout).toBe('floating');
    expect(defaultHeader('bar').sticky).toBe(true);
    expect(defaultHeader('centered').sticky).toBe(false);
    const p = clone();
    p.meta.headerStyle = 'pill';
    expect(resolveHeader(p.meta)).toEqual(defaultHeader('pill'));
  });
});

describe('header call-to-action button', () => {
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'http://example.com',
    '//evil.example',
    '../secret.html',
    '/etc/passwd',
    'https://exa mple.com',
    'https://example.com/\u0000',
    'file:///c:/x',
    'missing-page.html',
  ])('refuses the unsafe or broken link %j', (href) => {
    expect(valid(withHeader({ cta: { label: 'Go', href } }))).toBe(false);
  });

  it.each([
    'https://example.com/book',
    'mailto:hi@example.com',
    'tel:+351210000000',
    '#work',
    'about.html',
  ])('accepts %j', (href) => {
    expect(valid(withHeader({ cta: { label: 'Go', href } }))).toBe(true);
  });

  it('refuses a label with line breaks or one that is too long', () => {
    expect(valid(withHeader({ cta: { label: 'a\nb', href: '#work' } }))).toBe(false);
    expect(valid(withHeader({ cta: { label: 'x'.repeat(41), href: '#work' } }))).toBe(false);
  });

  it('renders an escaped button in the bar and in the phone menu', () => {
    const p = withHeader({
      cta: { label: 'Say "hi" <now>', href: 'https://example.com/?a=1&b=2' },
    });
    const html = file(p, 'index.html');
    expect(html).toContain(
      '<a class="button header-cta" href="https://example.com/?a=1&amp;b=2">Say &quot;hi&quot; &lt;now&gt;</a>',
    );
    expect(html).toMatch(
      /<ul class="menu-panel" role="list">.*<li class="menu-cta"><a class="button"/,
    );
    expect(html).not.toContain('<now>');
  });

  it('is left out when its label or link is empty', () => {
    for (const cta of [
      { label: '', href: '#work' },
      { label: 'Go', href: '' },
    ]) {
      expect(file(withHeader({ cta }), 'index.html')).not.toContain('header-cta');
    }
  });

  it('follows a renamed page and goes away with a deleted one', () => {
    const p = withHeader({ cta: { label: 'About', href: 'about.html' } });
    const renamed = renamePage(p, 1, 'My story');
    expect(renamed.meta.header?.cta?.href).toBe('my-story.html');
    expect(valid(renamed)).toBe(true);
    const deleted = deletePage(p, 1);
    expect(deleted.meta.header?.cta?.href).toBe('');
    expect(valid(deleted)).toBe(true);
  });
});

describe('header logo', () => {
  it('shows the picture with its alt text instead of the site name', () => {
    const p = withHeader({ logo: { image: 'img1', imageAlt: 'Asha & Co' } });
    const html = file(p, 'index.html');
    expect(html).toMatch(
      /<a class="brand brand-logo" href="[^"]+"><img src="assets\/img1\.webp" alt="Asha &amp; Co"/,
    );
    const preview = renderSite(p, { preview: true })[0]?.content as string;
    expect(preview).toContain('data-k-asset="img1"');
  });

  it('needs alt text and an uploaded picture', () => {
    expect(valid(withHeader({ logo: { image: 'img1', imageAlt: '' } }))).toBe(false);
    expect(valid(withHeader({ logo: { image: 'nope', imageAlt: 'Logo' } }))).toBe(false);
    expect(valid(withHeader({ logo: { image: '../x', imageAlt: 'Logo' } }))).toBe(false);
  });

  it('counts as a use of the file, and goes back to text when the file is removed', () => {
    const p = withHeader({ logo: { image: 'img1', imageAlt: 'Logo' } });
    p.pages = p.pages.map((page) => ({
      ...page,
      sections: page.sections.filter((s) => !JSON.stringify(s).includes('img1')),
    }));
    expect(assetUsage(p).get('img1')).toBe(1);
    const removed = removeAsset(p, 'img1');
    expect(removed.meta.header?.logo).toBeUndefined();
    expect(valid(removed)).toBe(true);
  });
});

describe('header contrast check', () => {
  it('passes the sample theme on every background', () => {
    for (const background of HEADER_BACKGROUNDS) {
      const colors =
        background === 'glass'
          ? (['background', 'surface'] as const)
          : (['background', 'surface', 'accent', 'text'] as const);
      for (const color of colors) {
        expect(
          headerContrastIssues(withHeader({ background, color })),
          `${background} ${color}`,
        ).toEqual([]);
      }
    }
  });

  it('picks readable text for a custom color', () => {
    const p = withHeader({ color: 'custom', customColor: '#111111' });
    const dark = headerColors(p.theme, resolveHeader(p.meta));
    expect(dark.fg).not.toBe(p.theme.colors.text);
    expect(contrastRatio(dark.fg, dark.bg)).toBeGreaterThanOrEqual(4.5);
    const light = withHeader({ color: 'custom', customColor: '#fafafa' });
    expect(headerColors(light.theme, resolveHeader(light.meta)).fg).toBe(light.theme.colors.text);
  });

  it('warns when no theme color is readable on the custom color', () => {
    const p = withHeader({ color: 'custom', customColor: '#8a8a8a' });
    p.theme.colors.text = '#666666';
    p.theme.colors.background = '#aaaaaa';
    p.theme.colors.accentText = '#999999';
    const issues = headerContrastIssues(p);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.ratio).toBeLessThan(4.5);
  });

  it('checks transparent headers against the first section of every page', () => {
    const p = withHeader({ background: 'transparent' });
    p.theme.colors.accentText = '#c0c0c0';
    p.theme.colors.accent = '#b0b0b0';
    const first = p.pages[1]?.sections[0];
    if (first) (first.props as { background?: string }).background = 'bold';
    expect(headerContrastIssues(p).some((i) => /first section/i.test(i.where))).toBe(true);
  });
});

describe('header export output', () => {
  const exportFiles = (p: Project) =>
    buildExport(p, new Map([['img1', new Uint8Array([1, 2, 3, 4])]]), TEST_FONTS);
  const exported = (p: Project, path: string): string => {
    const f = exportFiles(p).find((x) => x.path === path);
    return typeof f?.content === 'string' ? f.content : '';
  };

  it('solid: header classes and readable colors in the stylesheet', () => {
    const p = withHeader({ background: 'solid', color: 'accent' });
    expect(headerTag(exported(p, 'index.html'))).toBe(
      '<header class="site-header header-bar hdr hdr-full hdr-solid hdr-sticky" id="top">',
    );
    const css = exported(p, 'css/site.css');
    expect(css).toContain(`--hdr-bg: ${p.theme.colors.accent};`);
    expect(css).toContain(`--hdr-fg: ${p.theme.colors.accentText};`);
    expect(css).toMatch(/\.hdr-solid/);
  });

  it('solid with a custom color writes only the validated hex value', () => {
    const p = withHeader({ color: 'custom', customColor: '#12AB9F' });
    const css = exported(p, 'css/site.css');
    expect(css).toContain('--hdr-bg: #12ab9f;');
  });

  it('transparent: overlays the first section and turns solid on scroll when sticky', () => {
    const p = withHeader({ background: 'transparent', sticky: true });
    const tag = headerTag(exported(p, 'index.html'));
    expect(tag).toContain('hdr-transparent');
    expect(tag).toContain('hdr-on-plain');
    expect(tag).toContain('is-top');
    const css = exported(p, 'css/site.css');
    expect(css).toMatch(/\.hdr-transparent\.hdr-sticky:not\(\.is-top\)/);
    expect(exported(p, 'js/site.js')).toContain('is-top');
  });

  it('transparent and not sticky: no scroll state', () => {
    const p = withHeader({ background: 'transparent', sticky: false });
    const tag = headerTag(exported(p, 'index.html'));
    expect(tag).toContain('hdr-static');
    expect(tag).not.toContain('is-top');
  });

  it('transparent follows a bold first section', () => {
    const p = withHeader({ background: 'transparent' });
    const first = p.pages[0]?.sections[0];
    if (first) (first.props as { background?: string }).background = 'bold';
    expect(headerTag(exported(p, 'index.html'))).toContain('hdr-on-bold');
  });

  it('glass: blur with a solid fallback', () => {
    const p = withHeader({ background: 'glass', layout: 'floating' });
    expect(headerTag(exported(p, 'index.html'))).toContain('hdr-floating hdr-glass');
    const css = exported(p, 'css/site.css');
    expect(css).toContain('backdrop-filter');
    expect(css).toMatch(/@supports not \(\(backdrop-filter/);
  });

  it('keeps motion inside prefers-reduced-motion: no-preference', () => {
    const css = exported(withHeader({ background: 'transparent' }), 'css/site.css');
    const motion = css.slice(css.indexOf('@media (prefers-reduced-motion:no-preference){\n.hdr'));
    expect(motion).toContain('transition');
    // No header transition outside the motion block.
    const outside = css.replace(motion, '');
    expect(outside).not.toMatch(/\.hdr[^{]*\{[^}]*transition/);
  });

  it('the pill always floats', () => {
    const p = clone();
    p.meta.headerStyle = 'pill';
    p.meta.header = { ...defaultHeader('pill'), layout: 'full' };
    expect(headerTag(file(p, 'index.html'))).toContain('hdr-floating');
  });

  it('nothing from the header settings reaches CSS unchecked', () => {
    const p = withHeader({ color: 'custom', customColor: '#abcdef', background: 'glass' });
    const css = headerToCss(p);
    expect(css).toContain('--hdr-bg: #abcdef;');
    expect(css).not.toMatch(/url\(|@import|expression\(|[<>\\]/i);
  });
});
