/* eslint-disable @typescript-eslint/no-non-null-assertion -- fixture indexes are known in tests */
import { strFromU8, unzipSync } from 'fflate';
import { TEST_FONTS } from './test-fonts.ts';
import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  ProjectError,
  SCHEMA_VERSION,
  buildExport,
  buildZip,
  containsSecret,
  escapeHtml,
  migrateProject,
  parseProjectFile,
  renderSite,
  runMigrations,
  safeUrl,
  sampleProject,
  serializeProject,
  type Project,
  type Section,
} from './index.ts';

/** Props as plain data, so tests can plant invalid or hostile values. */
const loose = (section: Section | undefined): Record<string, unknown> =>
  (section as Section).props as Record<string, unknown>;

const assetData = new Map([['img1', new Uint8Array([1, 2, 3, 4])]]);
const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
const text = (files: ReturnType<typeof renderSite>, path: string): string => {
  const f = files.find((x) => x.path === path);
  if (!f || typeof f.content !== 'string') throw new Error(`missing ${path}`);
  return f.content;
};

describe('escaping', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });

  it('never outputs user markup in rendered pages', () => {
    const p = clone();
    const hero = p.pages[0]!.sections[0]!;
    loose(hero).heading = '<script>alert(1)</script>';
    loose(hero).subheading = '"><img src=x onerror=alert(1)>';
    p.meta.title = '</title><script>x()</script>';
    const html = text(renderSite(p), 'index.html');
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('</title><script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('rejects ids that could break out of attributes', () => {
    const p = clone();
    p.pages[0]!.sections[0]!.id = 'x" onclick="evil';
    expect(() => migrateProject(p)).toThrow(ProjectError);
  });

  it('rejects theme values that could inject CSS', () => {
    const p = clone() as unknown as { theme: { colors: { text: string } } };
    p.theme.colors.text = 'red;} body{display:none';
    expect(() => migrateProject(p)).toThrow(ProjectError);
  });
});

describe('URL allow-list', () => {
  it.each([
    'https://example.com',
    'https://a.b.co/x?y=1#z',
    'mailto:a@b.co',
    'tel:+919876543210',
    '#work',
  ])('allows %s', (url) => expect(safeUrl(url)).toBe(url));

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\nscript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>',
    'vbscript:x',
    'http://example.com',
    '//evil.com',
    'https://',
    'file:///etc/passwd',
    'page.htm',
  ])('blocks %s', (url) => expect(safeUrl(url)).toBeNull());

  it('drops unsafe links when rendering', () => {
    const p = clone();
    loose(p.pages[0]!.sections[2]).items = [{ label: 'Bad', href: 'javascript:alert(1)' }];
    const html = text(renderSite(p), 'index.html');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<span class="linkbtn"><span>Bad</span>');
  });
});

describe('schema and migrations', () => {
  it('validates the sample project', () => {
    expect(migrateProject(clone()).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('rejects unknown top-level fields such as keys', () => {
    expect(() => migrateProject({ ...clone(), geminiKey: 'x' })).toThrow(ProjectError);
  });

  it('rejects newer and missing versions', () => {
    expect(() => migrateProject({ ...clone(), schemaVersion: SCHEMA_VERSION + 1 })).toThrow(
      /newer/,
    );
    expect(() => migrateProject({ meta: {} })).toThrow(/version/);
  });

  it('runs migrations step by step', () => {
    const steps = {
      1: (d: Record<string, unknown>) => ({ ...d, a: 1 }),
      2: (d: Record<string, unknown>) => ({ ...d, b: 2 }),
    };
    expect(runMigrations({ schemaVersion: 1 }, 3, steps)).toEqual({ schemaVersion: 3, a: 1, b: 2 });
    expect(() => runMigrations({ schemaVersion: 1 }, 3, {})).toThrow(/version 1/);
    // Real steps: 1 -> 2 (styles.test.ts), 2 -> 3 (nav.test.ts), 3 -> 4 (animation.test.ts), 4 -> 5 (free.test.ts), 5 -> 6 (free-wrap.test.ts).
    expect(Object.keys(MIGRATIONS)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('requires a home page with unique addresses', () => {
    const p = clone();
    p.pages[1]!.slug = '';
    expect(() => migrateProject(p)).toThrow(ProjectError);
  });
});

describe('project file', () => {
  it('round-trips export and import', () => {
    const p = clone();
    expect(parseProjectFile(serializeProject(p))).toEqual(migrateProject(p));
  });

  it('never contains a key or token', () => {
    const json = serializeProject(clone());
    expect(containsSecret(json)).toBe(false);
    expect(json).not.toMatch(/key|token|secret|password/i);
  });

  it('refuses to save a project with a secret inside block props', () => {
    const p = clone();
    loose(p.pages[0]!.sections[0]).heading = `AIza${'a'.repeat(35)}`;
    expect(() => serializeProject(p)).toThrow(/key or token/);
    const q = clone();
    loose(q.pages[0]!.sections[0]).apiKey = 'hello';
    expect(() => serializeProject(q)).toThrow(/key or token/);
  });

  it('rejects broken files with a plain message', () => {
    expect(() => parseProjectFile('not json')).toThrow('This file is not a Klinth project file.');
    expect(() => parseProjectFile('[]')).toThrow(ProjectError);
  });
});

describe('export', () => {
  const files = buildExport(clone(), assetData, TEST_FONTS);
  const paths = files.map((f) => f.path).sort();

  it('produces the repository layout', () => {
    expect(paths).toEqual(
      [
        '.klinth/project.json',
        '.nojekyll',
        'README.md',
        'about.html',
        'assets/img1.webp',
        'favicon.svg',
        'fonts/LICENSE.txt',
        'fonts/fraunces-latin-wght-normal.woff2',
        'fonts/instrument-sans-latin-wght-normal.woff2',
        'css/site.css',
        'index.html',
        'js/site.js',
      ].sort(),
    );
  });

  it('works offline: every local reference exists and nothing is remote except links', () => {
    for (const page of ['index.html', 'about.html']) {
      const html = text(files, page);
      const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!);
      for (const ref of refs) {
        if (ref.startsWith('#') || /^(https|mailto|tel):/.test(ref)) continue;
        expect(paths, `${page} -> ${ref}`).toContain(ref);
      }
      expect(html).not.toMatch(/(src|rel="stylesheet" href)="https?:/);
    }
  });

  it('has no Klinth badge or link back', () => {
    for (const f of files) {
      if (typeof f.content === 'string' && f.path.endsWith('.html'))
        expect(f.content).not.toMatch(/klinth/i);
    }
  });

  it('fails clearly when an asset is missing', () => {
    expect(() => buildExport(clone(), new Map(), TEST_FONTS)).toThrow(/river\.webp/);
  });

  it('zips files that unzip identically, and re-imports the project', () => {
    const out = unzipSync(buildZip(files));
    expect(Object.keys(out).sort()).toEqual(paths);
    expect(Array.from(out['assets/img1.webp']!)).toEqual([1, 2, 3, 4]);
    expect(parseProjectFile(strFromU8(out['.klinth/project.json']!))).toEqual(
      migrateProject(clone()),
    );
  });

  it('is deterministic', () => {
    expect(buildZip(files)).toEqual(buildZip(buildExport(clone(), assetData, TEST_FONTS)));
  });
});

describe('editor preview markers', () => {
  const html = (editable: boolean) =>
    String(renderSite(sampleProject, { editable }).find((f) => f.path === 'index.html')?.content);

  it('mark sections and editable text only when asked', () => {
    const marked = html(true);
    for (const section of sampleProject.pages[0]?.sections ?? []) {
      expect(marked).toContain(`data-k-section="${section.id}"`);
    }
    expect(marked).toContain('data-k-field="heading"');
    expect(html(false)).not.toContain('data-k-');
  });

  it('do not change anything else in the page', () => {
    const stripped = html(true)
      .replace(/ data-k-(section|field|from)="[^"]*"/g, '')
      .replace(/ data-k-header/g, '');
    expect(stripped).toBe(html(false));
  });
});
