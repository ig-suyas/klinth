import {
  BLOCK_TYPES,
  buildExport,
  buildZip,
  contrastRatio,
  HEADER_STYLES,
  THEME_PRESETS,
  applyPreset,
  fontPath,
  migrateProject,
  parseProjectFile,
  renderSite,
  sectionSchema,
  serializeProject,
  themeContrastIssues,
  themeFonts,
} from '@klinth/core';
import { describe, expect, it } from 'vitest';
import { TEST_FONTS } from '../../core/src/test-fonts.ts';
import { blockDefinitions, getTemplate, sectionPresets, templates } from './index.ts';

const attrs = (html: string, name: string): string[] =>
  [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((m) => m[1] ?? '');

describe('templates', () => {
  it('ships exactly three templates with unique ids', () => {
    expect(templates.map((t) => t.id)).toEqual(['portfolio', 'landing', 'studio']);
    expect(getTemplate('studio')?.name).toBe('Creative studio');
    expect(getTemplate('landing')?.name).toBe('Small business or link page');
    expect(getTemplate('nope')).toBeUndefined();
  });

  it('use their own heading font and corner shape', () => {
    const themes = templates.map((t) => t.create().theme);
    expect(new Set(themes.map((t) => t.fonts.heading)).size).toBe(themes.length);
    expect(new Set(themes.map((t) => t.radius)).size).toBe(themes.length);
  });

  it('look clearly different from each other', () => {
    const [a, b] = templates.map((t) => t.create().theme);
    expect(a?.fonts.heading).not.toBe(b?.fonts.heading);
    expect(a?.radius).not.toBe(b?.radius);
    // One light, one dark.
    expect(contrastRatio(a?.colors.background ?? '', b?.colors.background ?? '')).toBeGreaterThan(
      10,
    );
  });
});

describe.each(templates)('$name template', (template) => {
  const project = template.create();
  const files = renderSite(project);
  const html = files.find((f) => f.path === 'index.html')?.content;
  if (typeof html !== 'string') throw new Error('index.html missing');

  it('is a valid project', () => {
    expect(migrateProject(project)).toEqual(project);
  });

  it('round-trips through a project file with no key or token', () => {
    expect(parseProjectFile(serializeProject(project))).toEqual(project);
  });

  it('returns a fresh copy each time', () => {
    const a = template.create();
    a.meta.title = 'Changed';
    expect(template.create().meta.title).not.toBe('Changed');
  });

  it('meets WCAG AA contrast for every color pairing', () => {
    expect(themeContrastIssues(project.theme)).toEqual([]);
  });

  it('exports a complete repository', () => {
    const out = buildExport(project, new Map(), TEST_FONTS);
    const fonts = themeFonts(project.theme).map(fontPath);
    // The studio template uses system fonts only, so it ships no font files.
    expect(fonts).toHaveLength(template.id === 'studio' ? 0 : 2);
    expect(out.map((f) => f.path).sort()).toEqual(
      [
        '.klinth/project.json',
        '.nojekyll',
        'README.md',
        'css/site.css',
        'favicon.svg',
        ...(fonts.length > 0 ? ['fonts/LICENSE.txt'] : []),
        ...fonts,
        'index.html',
        'js/site.js',
      ].sort(),
    );
    expect(buildZip(out).byteLength).toBeGreaterThan(1000);
  });

  it('has a language, title, description and exactly one h1', () => {
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html).toMatch(/<meta name="description" content="[^"]{50,}">/);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it('never skips a heading level', () => {
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    levels.reduce((prev, level) => {
      expect(level).toBeLessThanOrEqual(prev + 1);
      return level;
    }, 1);
  });

  it('only links to its own sections, local files or https, mailto and tel', () => {
    const ids = new Set(attrs(html, 'id'));
    const local = new Set([
      ...files.map((f) => f.path),
      ...themeFonts(project.theme).map(fontPath),
    ]);
    for (const href of attrs(html, 'href')) {
      if (href.startsWith('#')) expect(ids, href).toContain(href.slice(1));
      else if (!/^(https:\/\/|mailto:|tel:)/.test(href)) expect(local, href).toContain(href);
    }
  });

  it('loads nothing from other sites', () => {
    for (const src of attrs(html, 'src')) expect(src).not.toMatch(/^[a-z]+:|^\/\//);
    expect(html).toContain('<link rel="stylesheet" href="css/site.css">');
  });

  it('avoids vague link text that hurts search ranking', () => {
    const labels = [...html.matchAll(/<a\b[^>]*>([^<]*)/g)].map((m) => m[1]?.trim().toLowerCase());
    for (const vague of ['click here', 'here', 'more', 'learn more', 'read more', 'link']) {
      expect(labels).not.toContain(vague);
    }
  });

  it('supports every header style and theme preset', () => {
    for (const headerStyle of HEADER_STYLES) {
      for (const preset of THEME_PRESETS) {
        const p = template.create();
        p.meta.headerStyle = headerStyle;
        p.theme = applyPreset(p.theme, preset.id);
        expect(migrateProject(p), `${headerStyle} + ${preset.id}`).toEqual(p);
        expect(themeContrastIssues(p.theme)).toEqual([]);
        const page = renderSite(p).find((f) => f.path === 'index.html')?.content;
        expect(page).toContain(`class="site-header header-${headerStyle}"`);
        // System fonts only: the export carries no font files.
        expect(buildExport(p, new Map(), TEST_FONTS).some((f) => f.path.startsWith('fonts/'))).toBe(
          false,
        );
      }
    }
  });

  it('matches the rendered snapshot', async () => {
    for (const file of files) {
      await expect(file.content).toMatchFileSnapshot(`./__snapshots__/${template.id}/${file.path}`);
    }
  });
});

describe('Creative studio template', () => {
  const project = getTemplate('studio')?.create();
  if (!project) throw new Error('studio missing');
  const page = renderSite(project).find((f) => f.path === 'index.html')?.content as string;
  const sheet = renderSite(project).find((f) => f.path === 'css/site.css')?.content as string;

  it('opens with a poster headline that wraps naturally (no hard line breaks)', () => {
    expect(page).toContain('<div class="hero hero-poster">');
    const h1 = /<h1 class="display"[^>]*>(.*?)<\/h1>/.exec(page)?.[1] ?? '';
    const hero = project.pages[0]?.sections[0]?.props as { heading?: string } | undefined;
    expect(hero?.heading).not.toMatch(/\n/);
    expect(h1).not.toContain('<br>');
    // Words on different lines stay separate words for screen readers and search.
    const words = h1
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    expect(words).toBe('We make brands that speak clearly.');
    expect(page).toContain('<div class="poster-rule" aria-hidden="true"></div>');
  });

  it('uses system fonts only, sharp corners and roomy spacing', () => {
    expect(themeFonts(project.theme)).toEqual([]);
    expect(project.theme.radius).toBe(0);
    expect(project.theme.spacing).toBeGreaterThan(8);
  });

  it('only animates the headline when the visitor has not asked for less motion', () => {
    const calm = sheet.lastIndexOf('@media (prefers-reduced-motion:no-preference){\n');
    const lineUp = sheet.indexOf('.hero-poster .line>span{animation');
    expect(calm).toBeGreaterThan(-1);
    expect(lineUp).toBeGreaterThan(calm);
    expect(lineUp).toBeLessThan(sheet.indexOf('@media (prefers-reduced-motion:reduce)'));
    // Transform only: the text is never hidden with opacity, so it paints at once.
    expect(sheet).toMatch(/@keyframes line-up\{from\{transform:translateY\(105%\)\}\}/);
  });

  it('makes no invented reviews or numbers', () => {
    const sections = project.pages.flatMap((p) => p.sections.map((s) => s.type));
    expect(sections).not.toContain('testimonials');
    expect(page).not.toMatch(/\d+\s*(\+|%|clients|projects delivered)/i);
  });
});

describe('block definitions', () => {
  it('describe every block type with valid starting props', () => {
    expect(Object.keys(blockDefinitions)).toEqual(BLOCK_TYPES);
    for (const type of BLOCK_TYPES) {
      const props = blockDefinitions[type].defaults();
      expect(sectionSchema.safeParse({ id: 'new', type, props }).success, type).toBe(true);
    }
  });

  it('use unique plain-language labels', () => {
    const labels = Object.values(blockDefinitions).map((d) => d.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('return a fresh copy each time', () => {
    expect(blockDefinitions.hero.defaults()).not.toBe(blockDefinitions.hero.defaults());
  });

  it('ready-made sections start valid and have their own names', () => {
    for (const [id, preset] of Object.entries(sectionPresets)) {
      const props = preset.defaults();
      expect(sectionSchema.safeParse({ id: 'new', type: preset.type, props }).success, id).toBe(
        true,
      );
    }
    const labels = [...Object.values(blockDefinitions), ...Object.values(sectionPresets)].map(
      (d) => d.label,
    );
    expect(new Set(labels).size).toBe(labels.length);
  });
});
