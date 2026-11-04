import { describe, expect, it } from 'vitest';
import {
  MAX_PROJECT_FILE_BYTES,
  MAX_SITE_CODE_BYTES,
  addPage,
  buildExport,
  buildZip,
  containsSecret,
  migrateProject,
  parseProjectFile,
  projectSchema,
  serializeProject,
  utf8Length,
  type Project,
} from './index.ts';
import { sampleProject } from './sample.ts';
import { TEST_FONTS } from './test-fonts.ts';

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
const withCode = (css: string, js: string): Project => ({ ...clone(), siteCode: { css, js } });
const exportOf = (p: Project) =>
  buildExport(p, new Map(p.assets.map((a) => [a.id, new Uint8Array([1, 2, 3])])), TEST_FONTS);
const text = (files: ReturnType<typeof buildExport>, path: string): string => {
  const file = files.find((f) => f.path === path);
  if (typeof file?.content !== 'string') throw new Error(`${path} missing`);
  return file.content;
};

describe('site-wide code size', () => {
  it('counts UTF-8 bytes, not characters', () => {
    expect(utf8Length('abc')).toBe(3);
    expect(utf8Length('é')).toBe(2);
    expect(utf8Length('€')).toBe(3);
    expect(utf8Length('😀')).toBe(4);
  });

  it('allows about 200 KB of CSS and of JavaScript', () => {
    expect(MAX_SITE_CODE_BYTES).toBe(200_000);
    const full = 'a'.repeat(MAX_SITE_CODE_BYTES);
    expect(projectSchema.safeParse(withCode(full, full)).success).toBe(true);
  });

  it('refuses code over the limit, also when multi-byte letters push it over', () => {
    const over = 'a'.repeat(MAX_SITE_CODE_BYTES + 1);
    expect(projectSchema.safeParse(withCode(over, '')).success).toBe(false);
    expect(projectSchema.safeParse(withCode('', over)).success).toBe(false);
    const wide = '€'.repeat(Math.ceil(MAX_SITE_CODE_BYTES / 3) + 1);
    expect(wide.length).toBeLessThan(MAX_SITE_CODE_BYTES);
    expect(projectSchema.safeParse(withCode(wide, '')).success).toBe(false);
  });

  it('refuses unknown fields next to the code', () => {
    const p = { ...clone(), siteCode: { css: '', js: '', html: '<b>' } };
    expect(projectSchema.safeParse(p).success).toBe(false);
  });

  it('keeps a full-size project inside the import limit', () => {
    const full = 'a'.repeat(MAX_SITE_CODE_BYTES);
    const file = serializeProject(withCode(full, full));
    expect(file.length).toBeLessThan(MAX_PROJECT_FILE_BYTES);
    expect(parseProjectFile(file).siteCode?.css).toHaveLength(MAX_SITE_CODE_BYTES);
  });
});

describe('site-wide code in the export', () => {
  const css = 'body { outline: 0 } /* </style><script>alert(1)</script> */';
  const js = 'console.log("</script><script>alert(1)</script>");';

  it('writes separate files that every page links, never inline', () => {
    let p = withCode(css, js);
    p = addPage(p, 'Contact').project;
    const files = exportOf(p);
    expect(text(files, 'css/custom.css')).toBe(`${css}\n`);
    expect(text(files, 'js/custom.js')).toBe(`${js}\n`);
    const pages = files.filter((f) => f.path.endsWith('.html'));
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      const html = text(files, page.path);
      // CSS after the site stylesheet (so it wins), JavaScript at the end of the body.
      expect(html).toMatch(
        /<link rel="stylesheet" href="css\/site.css">\n<link rel="stylesheet" href="css\/custom.css">/,
      );
      expect(html).toMatch(/<script src="js\/custom.js"><\/script>\n<\/body>/);
      expect(html).not.toContain('alert(1)');
      expect(html).not.toContain('outline: 0');
    }
    // Every file a page refers to exists.
    const paths = new Set(files.map((f) => f.path));
    for (const page of pages) {
      for (const [, ref] of text(files, page.path).matchAll(/(?:href|src)="([^"#:]+)"/g)) {
        expect(paths, `${page.path} -> ${ref}`).toContain(ref);
      }
    }
    expect(buildZip(files).byteLength).toBeGreaterThan(0);
  });

  it('adds no files or tags when there is no code', () => {
    for (const p of [clone(), withCode('', ''), withCode('  \n', '\n')]) {
      const files = exportOf(p);
      expect(files.some((f) => f.path === 'css/custom.css' || f.path === 'js/custom.js')).toBe(
        false,
      );
      expect(text(files, 'index.html')).not.toContain('custom.');
    }
  });

  it('mentions the code in the README', () => {
    const files = exportOf(withCode('', js));
    expect(text(files, 'README.md')).toContain('js/custom.js');
  });
});

describe('site-wide code and the key or token guard', () => {
  it.each([
    ['Stripe secret key', 'sk_live_' + 'a1B2c3D4e5F6g7H8i9J0k1L2'],
    ['OpenAI key', 'sk-proj-' + 'A'.repeat(40)],
    ['Anthropic key', 'sk-ant-api03-' + 'b'.repeat(40)],
    ['AWS access key', 'AKIA' + 'ABCDEFGHIJKLMNOP'],
    ['Slack token', 'xoxb-' + '123456789012-abcdefghij'],
    ['private key', '-----BEGIN RSA PRIVATE KEY-----'],
    ['Gemini key', 'AIza' + 'x'.repeat(35)],
  ])('blocks a %s pasted into the JavaScript', (_, secret) => {
    const p = withCode('', `const k = "${secret}";`);
    expect(containsSecret(p)).toBe(true);
    expect(() => serializeProject(p)).toThrow(/key or token/);
    expect(() => parseProjectFile(JSON.stringify(p))).toThrow(/key or token/);
  });

  it('lets ordinary code through', () => {
    const js = 'const tokenize = (s) => s.split(" "); // pk_live_ keys are public; task-list';
    expect(containsSecret(withCode('.monkey { color: red }', js))).toBe(false);
  });
});

describe('site-wide code and old projects', () => {
  it('upgrades a version 1 project and round-trips the code', () => {
    const v1 = { ...clone(), schemaVersion: 1 } as Record<string, unknown>;
    const upgraded = migrateProject(v1);
    expect(upgraded.siteCode).toBeUndefined();
    const p = { ...upgraded, siteCode: { css: 'h1{color:red}', js: 'void 0;' } };
    expect(parseProjectFile(serializeProject(p))).toEqual(p);
  });
});
