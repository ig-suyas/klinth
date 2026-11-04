import {
  BLOCK_TYPES,
  buildExport,
  buildZip,
  contrastRatio,
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
import { blockDefinitions, getTemplate, templates } from './index.ts';

const attrs = (html: string, name: string): string[] =>
  [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((m) => m[1] ?? '');

describe('templates', () => {
  it('ships exactly two templates with unique ids', () => {
    expect(templates.map((t) => t.id)).toEqual(['portfolio', 'landing']);
    expect(getTemplate('landing')?.name).toBe('Small business or link page');
    expect(getTemplate('nope')).toBeUndefined();
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
    expect(fonts).toHaveLength(2);
    expect(out.map((f) => f.path).sort()).toEqual(
      [
        '.klinth/project.json',
        '.nojekyll',
        'README.md',
        'css/site.css',
        'favicon.svg',
        'fonts/LICENSE.txt',
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

  it('matches the rendered snapshot', async () => {
    for (const file of files) {
      await expect(file.content).toMatchFileSnapshot(`./__snapshots__/${template.id}/${file.path}`);
    }
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
});
