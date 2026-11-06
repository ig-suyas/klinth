import { describe, expect, it } from 'vitest';
import {
  FOOTER_CSS,
  MIGRATIONS,
  SCHEMA_VERSION,
  backToTopShown,
  blockPropSchemas,
  migrateProject,
  parseProjectFile,
  projectSchema,
  renderSite,
  serializeProject,
  type Project,
} from './index.ts';
import { sampleProject } from './sample.ts';

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('missing value');
  return value;
}

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
const file = (p: Project, path: string): string => {
  const f = renderSite(p).find((x) => x.path === path);
  if (typeof f?.content !== 'string') throw new Error(`${path} missing`);
  return f.content;
};
const footerOf = (p: Project) => {
  const s = must(must(p.pages[0]).sections.find((x) => x.type === 'footer'));
  if (s.type !== 'footer') throw new Error('not a footer');
  return s;
};
const withFooter = (props: Record<string, unknown>): Project => {
  const p = clone();
  const s = footerOf(p);
  s.props = { ...s.props, ...props } as typeof s.props;
  return p;
};
const valid = (p: unknown): boolean => projectSchema.safeParse(p).success;
const footerHtml = (p: Project): string => {
  const m = /<footer class="site-footer">([\s\S]*?)<\/footer>/.exec(file(p, 'index.html'));
  return m?.[1] ?? '';
};

describe('footer position', () => {
  it('accepts alignments, offset and padding within their ranges', () => {
    const schema = blockPropSchemas.footer;
    expect(
      schema.safeParse({
        textAlign: 'left',
        linksAlign: 'center',
        topAlign: 'right',
        offset: -20,
        padding: 0,
      }).success,
    ).toBe(true);
    expect(schema.safeParse({ offset: 20, padding: 8 }).success).toBe(true);
    expect(schema.safeParse({ offset: 12.5 }).success).toBe(true);
  });

  it('refuses unknown alignments and numbers out of range or not finite', () => {
    const schema = blockPropSchemas.footer;
    for (const bad of [
      { textAlign: 'justify' },
      { linksAlign: 'middle' },
      { topAlign: '' },
      { offset: 20.01 },
      { offset: -21 },
      { offset: Number.NaN },
      { offset: Number.POSITIVE_INFINITY },
      { offset: '5' },
      { padding: -1 },
      { padding: 8.5 },
      { padding: Number.NaN },
      { padding: '2rem' },
    ]) {
      expect(schema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(valid(withFooter({ offset: 50 }))).toBe(false);
    expect(valid(withFooter({ padding: 1e9 }))).toBe(false);
  });

  it('leaves an unchanged footer byte-identical (no extra CSS, same markup)', () => {
    const p = clone();
    expect(footerHtml(p)).toBe(
      '<div class="wrap foot"><p class="foot-text">© 2026 Asha Rao</p><a class="totop" href="#top">Back to top <span aria-hidden="true">↑</span></a></div>',
    );
    expect(file(p, 'css/site.css')).not.toContain('.foot-set');
  });

  it('exports alignment per group, the offset and the padding', () => {
    const p = withFooter({
      links: [{ label: 'Mail', href: 'mailto:a@b.co' }],
      textAlign: 'center',
      linksAlign: 'right',
      topAlign: 'left',
      offset: 7.5,
      padding: 3.25,
    });
    const html = footerHtml(p);
    expect(html).toContain('class="wrap foot foot-set" style="--fpad:3.25;--fl:7.5;--fr:0;"');
    expect(html).toContain('<div class="foot-in foot-col">');
    expect(html).toContain('<p class="foot-text al-center">');
    expect(html).toContain('<ul class="foot-links al-right" role="list">');
    expect(html).toContain('<a class="totop al-left" href="#top">');
    const css = file(p, 'css/site.css');
    expect(css).toContain(FOOTER_CSS);
    expect(FOOTER_CSS).toContain('.foot-col>.al-center');
  });

  it('turns a negative offset into a right margin, so nothing leaves the content width', () => {
    const html = footerHtml(withFooter({ offset: -20 }));
    expect(html).toContain('style="--fl:0;--fr:20;"');
    // Only the offset: the row layout stays (no column).
    expect(html).toContain('<div class="foot-in">');
    expect(html).not.toContain('al-');
  });

  it('fills alignment defaults for groups left unset once one is set', () => {
    const html = footerHtml(withFooter({ topAlign: 'center' }));
    expect(html).toContain('<p class="foot-text al-left">');
    expect(html).toContain('<a class="totop al-center"');
  });

  it('cannot inject markup through the new fields', () => {
    const p = withFooter({ textAlign: '"><script>' });
    expect(valid(p)).toBe(false);
  });
});

describe('back to top', () => {
  it('is shown by default', () => {
    const p = clone();
    expect(backToTopShown(p, must(p.pages[0]))).toBe(true);
    expect(file(p, 'index.html')).toContain('class="totop"');
  });

  it('can be hidden for the whole site', () => {
    const p = clone();
    p.meta.backToTop = false;
    expect(valid(p)).toBe(true);
    for (const page of p.pages) expect(backToTopShown(p, page)).toBe(false);
    for (const f of renderSite(p).filter((x) => x.path.endsWith('.html'))) {
      expect(String(f.content)).not.toContain('totop');
      expect(String(f.content)).not.toContain('Back to top');
    }
    // The footer text stays.
    expect(file(p, 'index.html')).toContain('© 2026 Asha Rao');
  });

  it('can be hidden on one page only', () => {
    const p = clone();
    must(p.pages[0]).hideBackToTop = true;
    expect(valid(p)).toBe(true);
    expect(file(p, 'index.html')).not.toContain('Back to top');
    const other = p.pages[1];
    if (other) {
      const path = `${other.slug}.html`;
      const hasFooter = other.sections.some((s) => s.type === 'footer');
      if (hasFooter) expect(file(p, path)).toContain('Back to top');
    }
  });

  it('drops an empty footer when nothing is left in it', () => {
    const p = clone();
    footerOf(p).props = {};
    p.meta.backToTop = false;
    expect(file(p, 'index.html')).not.toContain('<footer');
  });

  it('refuses non-boolean switches', () => {
    const p = clone() as unknown as { meta: Record<string, unknown> };
    p.meta.backToTop = 'no';
    expect(valid(p)).toBe(false);
    const q = clone() as unknown as { pages: Record<string, unknown>[] };
    must(q.pages[0]).hideBackToTop = 1;
    expect(valid(q)).toBe(false);
  });
});

describe('version 7', () => {
  it('upgrades version 6 files without changing them (absent = shown, old layout)', () => {
    expect(SCHEMA_VERSION).toBe(8);
    expect(typeof MIGRATIONS[6]).toBe('function');
    const upgraded = migrateProject({ ...clone(), schemaVersion: 6 });
    expect(upgraded).toEqual(clone());
    expect(backToTopShown(upgraded, must(upgraded.pages[0]))).toBe(true);
    expect(file(upgraded, 'index.html')).toBe(file(clone(), 'index.html'));
  });

  it('keeps the new fields through a project file round trip', () => {
    const p = withFooter({ textAlign: 'right', offset: -3, padding: 1.5 });
    p.meta.backToTop = false;
    must(p.pages[0]).hideBackToTop = true;
    expect(parseProjectFile(serializeProject(p))).toEqual(p);
  });
});
