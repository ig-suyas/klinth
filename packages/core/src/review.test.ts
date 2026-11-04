/* eslint-disable @typescript-eslint/no-non-null-assertion -- fixture indexes are known in tests */
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  ProjectError,
  SCHEMA_VERSION,
  buildExport,
  buildZip,
  containsSecret,
  migrateProject,
  parseProjectFile,
  renderSite,
  runMigrations,
  safeUrl,
  sampleProject,
  serializeProject,
  themeToCss,
  type Project,
  type Section,
  type SiteFile,
} from './index.ts';

/** Props as plain data, so tests can plant invalid or hostile values. */
const loose = (section: Section | undefined): Record<string, unknown> =>
  (section as Section).props as Record<string, unknown>;

/**
 * Phase 1 review: each test tries to break one guarantee.
 * Kept even when it passed first time, so regressions are caught.
 */

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
const assetData = new Map([['img1', new Uint8Array([1, 2, 3, 4])]]);
const html = (files: SiteFile[], path = 'index.html'): string => {
  const f = files.find((x) => x.path === path);
  if (!f || typeof f.content !== 'string') throw new Error(`missing ${path}`);
  return f.content;
};
/** Builds a project that may be invalid, for attack tests. */
const raw = (mutate: (p: Record<string, unknown> & Project) => void): unknown => {
  const p = clone() as Record<string, unknown> & Project;
  mutate(p);
  return p;
};

// ---------------------------------------------------------------- 1. URLs

describe('1. URL allow-list', () => {
  const blocked = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'java\rscript:alert(1)',
    'java\u0000script:alert(1)',
    '\u0001javascript:alert(1)',
    '   javascript:alert(1)',
    '\n\njavascript:alert(1)',
    ' javascript:alert(1)',
    '​javascript:alert(1)',
    '﻿javascript:alert(1)',
    '&#106;avascript:alert(1)',
    '&#x6A;avascript:alert(1)',
    'javascript&colon;alert(1)',
    '%6Aavascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'DATA:image/svg+xml;base64,PHN2Zz4=',
    'vbscript:msgbox(1)',
    'blob:https://example.com/x',
    'file:///etc/passwd',
    'http://example.com',
    'ftp://example.com',
    '//evil.com',
    '\\\\evil.com',
    '/\\evil.com',
    'https:evil.com',
    'https:/evil.com',
    'https://',
    'https://evil',
    'https://user:pass@evil.com',
    'https://good.com .evil',
    'mailto:',
    'mailto:nobody',
    'tel:',
    'tel:javascript',
    '#',
    '#1abc',
    '#a b',
    '# x',
    'page.html',
    '../secret',
    '',
    `https://example.com/${'a'.repeat(2100)}`,
  ];

  it.each(blocked)('blocks %j', (url) => expect(safeUrl(url)).toBeNull());

  it.each([
    'https://example.com',
    'https://sub.example.co.in:8443/a/b?q=1&r=2#frag',
    'HTTPS://EXAMPLE.COM',
    'mailto:asha@example.com',
    'mailto:asha@example.com?subject=Hi',
    'tel:+919876543210',
    'tel:(020)555-0100',
    '#work',
  ])('allows %j unchanged', (url) => expect(safeUrl(url)).toBe(url));

  it('trims surrounding spaces from allowed links', () => {
    expect(safeUrl('  https://example.com  ')).toBe('https://example.com');
  });

  it('stays fast on very long hostile input', () => {
    const start = Date.now();
    for (const s of ['https://' + 'a.'.repeat(50_000), 'https://' + 'a-'.repeat(50_000) + '!']) {
      expect(safeUrl(s)).toBeNull();
    }
    expect(Date.now() - start).toBeLessThan(200);
  });

  it('never renders a blocked scheme in any link-carrying block', () => {
    const p = clone();
    const bad = 'javascript:alert(1)';
    const home = p.pages[0]!.sections;
    loose(home[0]).buttons = [{ label: 'Go', href: bad }];
    loose(home[1]).items = [{ title: 'T', href: bad, label: 'More' }];
    loose(home[2]).items = [{ label: 'L', href: bad }];
    home.push({ id: 'c', type: 'contact', props: { email: 'x@y.co" onmouseover="alert(1)' } });
    const out = html(renderSite(p));
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toContain('" onmouseover="');
  });
});

// ---------------------------------------------------------------- 2. Escaping

describe('2. escaping by context', () => {
  const payloads = [
    '"><script>alert(1)</script>',
    "'><img src=x onerror=alert(1)>",
    '</style><script>alert(1)</script>',
    '</script><script>alert(1)</script>',
    '</title><script>alert(1)</script>',
    '`onmouseover=alert(1)`',
    '<!--',
    ']]>',
    '‮<script>',
    '＜script＞',
    '&lt;script&gt;',
  ];

  /** No raw markup from a payload may survive: every `<`, `>` and `"` must be encoded. */
  const assertInert = (out: string, payload: string): void => {
    expect(out).not.toContain(payload.includes('<') ? payload : '\u0000never');
    expect(out).not.toMatch(/<script>alert/);
    expect(out).not.toMatch(/<img src=x/);
    expect(out).not.toMatch(/" ?on\w+=|' ?on\w+=/);
    expect(out).not.toContain('<!--');
  };

  it.each(payloads)('is inert in every text and attribute field: %j', (payload) => {
    const p = clone();
    p.meta.description = payload;
    p.pages[1]!.title = payload.slice(0, 120);
    const home = p.pages[0]!.sections;
    home[0]!.props = {
      heading: payload,
      subheading: payload,
      buttons: [{ label: payload, href: '#work' }],
    };
    loose(home[1]).items = [
      { title: payload, description: payload, image: 'img1', imageAlt: payload, label: payload },
    ];
    home.push(
      { id: 't', type: 'testimonials', props: { items: [{ quote: payload, name: payload }] } },
      { id: 'f', type: 'footer', props: { text: payload } },
    );
    const files = renderSite(p);
    assertInert(html(files), payload);
    assertInert(html(files, 'about.html'), payload);
  });

  it('escapes the page title and a long site title', () => {
    const p = clone();
    p.meta.title = '</title><script>x()</script>';
    expect(html(renderSite(p))).toContain(
      '<title>&lt;/title&gt;&lt;script&gt;x()&lt;/script&gt;</title>',
    );
  });

  it.each(['en"><script>', 'en onload=x', 'EN', 'e', 'en-', 'en_US', 'en\n'])(
    'rejects unsafe language %j',
    (language) => {
      expect(() => migrateProject(raw((p) => (p.meta.language = language)))).toThrow(ProjectError);
    },
  );

  it.each(['../x', 'a"b', 'a b', 'img/1', '', 'x'.repeat(65)])(
    'rejects unsafe asset, favicon and section ids %j',
    (bad) => {
      expect(() => migrateProject(raw((p) => (p.assets[0]!.id = bad)))).toThrow(ProjectError);
      expect(() => migrateProject(raw((p) => (p.meta.favicon = bad)))).toThrow(ProjectError);
      expect(() => migrateProject(raw((p) => (p.pages[0]!.sections[0]!.id = bad)))).toThrow(
        ProjectError,
      );
    },
  );

  it('rejects prop names that are not plain identifiers', () => {
    for (const name of ['__proto__', 'constructor', 'a b', '"x"', '']) {
      const text = serializeProject(clone()).replace('"heading": "Asha Rao"', `"${name}": "x"`);
      expect(() => parseProjectFile(text), name).toThrow(ProjectError);
    }
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('keeps single-line fields single-line (README and <title> injection)', () => {
    expect(() => migrateProject(raw((p) => (p.meta.title = 'A\n\n[click](https://x.co)')))).toThrow(
      ProjectError,
    );
    expect(() => migrateProject(raw((p) => (p.pages[1]!.title = 'A\u0000B')))).toThrow(
      ProjectError,
    );
    expect(() => migrateProject(raw((p) => (p.assets[0]!.name = 'a\r\nb.webp')))).toThrow(
      ProjectError,
    );
  });
});

// ---------------------------------------------------------------- 3. CSS

describe('3. CSS injection', () => {
  it.each([
    'red',
    '#fff',
    '#ffffff;}',
    '#ffffff\n',
    '#fffffff',
    'url(x)',
    '#ffffff} body{display:none',
    'var(--x)',
    '#gggggg',
  ])('rejects color %j', (color) => {
    expect(() => migrateProject(raw((p) => (p.theme.colors.accent = color)))).toThrow(ProjectError);
  });

  it.each([
    ['radius', 1.5],
    ['radius', -1],
    ['radius', 1e9],
    ['radius', Number.NaN],
    ['radius', Number.POSITIVE_INFINITY],
    ['radius', '12px;}'],
    ['spacing', 3],
    ['spacing', 17],
    ['spacing', '8'],
  ] as const)('rejects %s = %j', (key, value) => {
    expect(() =>
      migrateProject(raw((p) => ((p.theme as Record<string, unknown>)[key] = value))),
    ).toThrow(ProjectError);
  });

  it.each(['Arial', 'system-sans; } body {', 'didone\n', '__proto__', 'toString'])(
    'rejects font %j (fixed list only)',
    (font) => {
      expect(() =>
        migrateProject(raw((p) => ((p.theme.fonts as Record<string, unknown>).heading = font))),
      ).toThrow(ProjectError);
    },
  );

  it('rejects extra theme fields', () => {
    expect(() =>
      migrateProject(raw((p) => ((p.theme as Record<string, unknown>).extra = 'x'))),
    ).toThrow(ProjectError);
  });

  it('generated token CSS only contains expected declarations', () => {
    const css = themeToCss(migrateProject(clone()).theme);
    for (const line of css.trim().split('\n').slice(1, -1)) {
      expect(line).toMatch(/^ {2}--[a-z-]+: [^;{}<>]+;$/);
    }
  });
});

// ---------------------------------------------------------------- 4. Export paths

describe('4. export paths', () => {
  it.each([
    '../x',
    '..',
    '/abs',
    'a/b',
    'a\\b',
    'C:',
    'About',
    'a--b',
    '-a',
    'a-',
    'a.html',
    ' a',
    'x'.repeat(61),
  ])('rejects page slug %j', (slug) => {
    expect(() => migrateProject(raw((p) => (p.pages[1]!.slug = slug)))).toThrow(ProjectError);
  });

  it.each(['index', 'assets', 'css', 'js', 'readme', 'con', 'nul', 'aux', 'prn', 'com1', 'lpt9'])(
    'rejects reserved page slug %j',
    (slug) => {
      expect(() => migrateProject(raw((p) => (p.pages[1]!.slug = slug)))).toThrow(ProjectError);
    },
  );

  it('rejects duplicate page slugs', () => {
    expect(() =>
      migrateProject(raw((p) => p.pages.push({ ...p.pages[1]!, title: 'Again' }))),
    ).toThrow(ProjectError);
  });

  it('rejects duplicate and case-only-different asset ids', () => {
    for (const other of ['img1', 'IMG1', 'Img1']) {
      expect(() =>
        migrateProject(raw((p) => p.assets.push({ ...p.assets[0]!, id: other }))),
      ).toThrow(ProjectError);
    }
  });

  it.each(['con', 'NUL', 'Aux', 'com1', 'LPT9'])('rejects reserved asset id %j', (id) => {
    expect(() => migrateProject(raw((p) => (p.assets[0]!.id = id)))).toThrow(ProjectError);
  });

  it('rejects duplicate section ids on one page', () => {
    expect(() =>
      migrateProject(raw((p) => p.pages[0]!.sections.push({ ...p.pages[0]!.sections[0]! }))),
    ).toThrow(ProjectError);
  });

  it('names asset files by id, never by the uploaded file name', () => {
    const p = clone();
    p.assets[0]!.name = '../../evil\\..\\x.html';
    const paths = buildExport(p, assetData).map((f) => f.path);
    expect(paths).toContain('assets/img1.webp');
    expect(paths.join('\n')).not.toContain('..');
  });

  it('every exported path is relative, clean and unique (case-insensitive)', () => {
    const paths = buildExport(clone(), assetData).map((f) => f.path);
    for (const path of paths) {
      expect(path).toMatch(/^(\.?[a-z0-9_-]+\/)?\.?[A-Za-z0-9_-]+(\.[a-z0-9]+)?$/);
    }
    expect(new Set(paths.map((x) => x.toLowerCase())).size).toBe(paths.length);
  });

  it('refuses to zip duplicate paths', () => {
    expect(() =>
      buildZip([
        { path: 'a.html', content: '1' },
        { path: 'A.html', content: '2' },
      ]),
    ).toThrow(ProjectError);
    expect(() => buildZip([{ path: '../a.html', content: '1' }])).toThrow(ProjectError);
  });
});

// ---------------------------------------------------------------- 5. Secrets

describe('5. key and token guard', () => {
  const gemini = `AIza${'Sy0_-aB'.repeat(5)}`; // 39 chars, like a real key
  const ghp = `ghp_${'a1B2'.repeat(9)}`;
  const gho = `gho_${'Zz09'.repeat(9)}`;
  const pat = `github_pat_${'A1_b'.repeat(20)}`;

  it.each([gemini, ghp, gho, pat])('detects secret value %s', (value) => {
    expect(containsSecret(value)).toBe(true);
    expect(containsSecret({ a: [{ b: { c: `my key is ${value}.` } }] })).toBe(true);
  });

  it.each([
    'apiKey',
    'api_key',
    'API-KEY',
    'geminiKey',
    'geminiApiKey',
    'githubToken',
    'accessToken',
    'token',
    'authToken',
    'secret',
    'clientSecret',
    'password',
    'passphrase',
    'authorization',
  ])('detects secret field name %s at any depth', (name) => {
    expect(containsSecret({ [name]: 'x' })).toBe(true);
    expect(containsSecret({ a: [{ b: [{ [name]: 'x' }] }] })).toBe(true);
  });

  it.each([
    'Keynote speaker and monkey keeper',
    'Use your token of thanks wisely.',
    'My secret recipe',
    'Password managers are great',
    'AIza is short',
    'ghp_short',
    'github_pat_',
    'https://github.com/asha',
    'AIzaShort-but-not-39-chars',
  ])('does not flag normal text %j', (text) => {
    expect(containsSecret(text)).toBe(false);
    expect(containsSecret({ heading: text, keyline: 'x', monkey: text })).toBe(false);
  });

  it('blocks on export (serialize and buildExport)', () => {
    const p = clone();
    loose(p.pages[0]!.sections[2]).items = [{ label: 'x', href: '#work', nested: [gemini] }];
    expect(() => serializeProject(p)).toThrow(/key or token/);
    expect(() => buildExport(p, assetData)).toThrow(/key or token/);
  });

  it('blocks on import, by value and by name', () => {
    const text = serializeProject(clone());
    expect(() => parseProjectFile(text.replace('Asha Rao', ghp))).toThrow(/key or token/);
    expect(() => parseProjectFile(text.replace('"heading"', '"githubToken"'))).toThrow(
      /key or token/,
    );
  });
});

// ---------------------------------------------------------------- 6. Import

describe('6. import hardening', () => {
  const base = (): Record<string, unknown> =>
    JSON.parse(serializeProject(clone())) as Record<string, unknown>;

  it('rejects files over the size limit before parsing', () => {
    expect(() => parseProjectFile(' '.repeat(5 * 1024 * 1024 + 1))).toThrow(/too large/);
  });

  it('rejects deeply nested data with a plain message, not a crash', () => {
    const deep = '['.repeat(100_000) + ']'.repeat(100_000);
    expect(() => parseProjectFile(deep)).toThrow(ProjectError);
    const p = base();
    let nested: unknown = 'x';
    for (let i = 0; i < 50; i++) nested = [nested];
    ((p.pages as Project['pages'])[0]!.sections[0]!.props as Record<string, unknown>).deep = nested;
    expect(() => parseProjectFile(JSON.stringify(p))).toThrow(/too deeply nested/);
  });

  it.each([
    ['pages', 11],
    ['sections', 101],
    ['assets', 201],
  ] as const)('rejects more than the limit of %s', (kind, count) => {
    const p = clone();
    if (kind === 'pages') {
      p.pages = Array.from({ length: count }, (_, i) => ({
        slug: i === 0 ? '' : `p${i}`,
        title: 'P',
        sections: [],
      }));
    } else if (kind === 'sections') {
      p.pages[0]!.sections = Array.from({ length: count }, (_, i) => ({
        id: `s${i}`,
        type: 'spacer' as const,
        props: {},
      }));
    } else {
      p.assets = Array.from({ length: count }, (_, i) => ({ ...p.assets[0]!, id: `a${i}` }));
    }
    expect(() => parseProjectFile(JSON.stringify(p))).toThrow(ProjectError);
  });

  it('gives a friendly error for a newer schema version', () => {
    const text = JSON.stringify({ ...base(), schemaVersion: SCHEMA_VERSION + 1 });
    expect(() => parseProjectFile(text)).toThrow(/newer Klinth/);
  });

  it.each([null, 'x', 1.5, -1, '1'])('gives a friendly error for schemaVersion %j', (v) => {
    expect(() => parseProjectFile(JSON.stringify({ ...base(), schemaVersion: v }))).toThrow(
      ProjectError,
    );
  });

  it.each(['null', '"text"', '42', '[]', '{}', '{"schemaVersion":1}'])(
    'rejects non-project JSON %s with ProjectError',
    (text) => expect(() => parseProjectFile(text)).toThrow(ProjectError),
  );

  it('upgrades a fake v0 project to v1 through the migration hook', () => {
    const v0 = { schemaVersion: 0, name: 'Old site', lang: 'en', blocks: [] as unknown[] };
    const fakeMigrations = {
      0: (d: Record<string, unknown>) => {
        const current = clone() as Record<string, unknown> & Project;
        current.meta = { ...current.meta, title: String(d.name), language: String(d.lang) };
        return current;
      },
    };
    const upgraded = runMigrations(v0, 1, fakeMigrations);
    expect(upgraded.schemaVersion).toBe(1);
    expect(migrateProject(upgraded).meta.title).toBe('Old site');
    // With the real (empty) hook a v0 file gets a plain error.
    expect(MIGRATIONS[0]).toBeUndefined();
    expect(() => migrateProject(v0)).toThrow(/Cannot upgrade a project from version 0/);
  });

  it('turns a crashing migration step into a plain error', () => {
    const steps = {
      1: () => {
        throw new TypeError('boom');
      },
    };
    expect(() => runMigrations({ schemaVersion: 1 }, 2, steps)).toThrow(ProjectError);
  });
});

// ---------------------------------------------------------------- 7. ZIP

/** Node's environment, typed locally because core has no Node types. */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
  .process.env;
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

describe('7. deterministic ZIP', () => {
  const originalTz = env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete env.TZ;
    else env.TZ = originalTz;
  });

  const zipOf = (files: SiteFile[]): Uint8Array => buildZip(files);

  it('gives byte-identical output for the same project, twice', () => {
    const a = zipOf(buildExport(clone(), assetData));
    const b = zipOf(buildExport(clone(), assetData));
    expect(sameBytes(a, b)).toBe(true);
  });

  it('does not depend on the machine time zone', () => {
    env.TZ = 'UTC';
    const utc = zipOf(buildExport(clone(), assetData));
    env.TZ = 'Asia/Kolkata';
    const ist = zipOf(buildExport(clone(), assetData));
    env.TZ = 'America/Los_Angeles';
    const la = zipOf(buildExport(clone(), assetData));
    expect(sameBytes(utc, ist)).toBe(true);
    expect(sameBytes(utc, la)).toBe(true);
  });

  it('does not depend on input file order', () => {
    const files = buildExport(clone(), assetData);
    const reversed = [...files].reverse();
    expect(sameBytes(zipOf(files), zipOf(reversed))).toBe(true);
  });

  it('stores entries sorted, with fixed time and permissions', () => {
    const zip = zipOf(buildExport(clone(), assetData));
    const names = Object.keys(unzipSync(zip));
    expect(names).toEqual([...names].sort());
    // Walk the central directory and check every entry header.
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    let offset = zip.length - 22;
    while (view.getUint32(offset, true) !== 0x06054b50) offset--;
    let entry = view.getUint32(offset + 16, true);
    const total = view.getUint16(offset + 10, true);
    for (let i = 0; i < total; i++) {
      expect(view.getUint32(entry, true)).toBe(0x02014b50);
      expect(view.getUint8(entry + 5)).toBe(3); // made by: Unix
      expect(view.getUint16(entry + 12, true)).toBe(0); // time 00:00:00
      expect(view.getUint16(entry + 14, true)).toBe(0x5021); // date 2020-01-01
      expect(view.getUint32(entry + 38, true) >>> 16).toBe(0o100644); // regular file, rw-r--r--
      const nameLen = view.getUint16(entry + 28, true);
      const extraLen = view.getUint16(entry + 30, true);
      const commentLen = view.getUint16(entry + 32, true);
      entry += 46 + nameLen + extraLen + commentLen;
    }
  });

  it('round-trips the project file through the ZIP', () => {
    const out = unzipSync(zipOf(buildExport(clone(), assetData)));
    expect(parseProjectFile(strFromU8(out['.klinth/project.json']!))).toEqual(
      migrateProject(clone()),
    );
  });
});

// ---------------------------------------------------------------- 9. Offline

describe('9. offline export', () => {
  const files = buildExport(clone(), assetData);
  const paths = new Set(files.map((f) => f.path));

  it('every referenced local file exists, and nothing loads from the internet', () => {
    for (const f of files) {
      if (typeof f.content !== 'string' || !f.path.endsWith('.html')) continue;
      const refs = [...f.content.matchAll(/\s(?:src|href|srcset|poster|data)="([^"]*)"/g)].map(
        (m) => m[1]!,
      );
      for (const ref of refs) {
        if (ref.startsWith('#') || /^(mailto|tel):/.test(ref)) continue;
        if (ref.startsWith('https:')) {
          // Only plain <a> links may point to the internet.
          const tag = f.content.slice(f.content.lastIndexOf('<', f.content.indexOf(ref)));
          expect(tag.startsWith('<a '), `${f.path}: ${ref}`).toBe(true);
          continue;
        }
        expect(paths.has(ref), `${f.path} -> ${ref}`).toBe(true);
      }
      expect(f.content).not.toMatch(
        /<(script|link|img|iframe|video|source)[^>]+(src|href)="(https?:)?\/\//,
      );
    }
    const css = html(files, 'css/site.css');
    const js = html(files, 'js/site.js');
    expect(css).not.toMatch(/@import|url\(/);
    expect(js).not.toMatch(/fetch\(|XMLHttpRequest|https?:|import\(/);
  });
});
