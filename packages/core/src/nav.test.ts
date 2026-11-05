import { describe, expect, it } from 'vitest';
import {
  MAX_NAV_LINKS,
  MIGRATIONS,
  SCHEMA_VERSION,
  buildExport,
  deletePage,
  ensureAnchor,
  headerShown,
  migrateProject,
  navLinkProblems,
  parseProjectFile,
  projectSchema,
  removeBrokenNavLinks,
  renamePage,
  renderSite,
  sectionAnchor,
  serializeProject,
  uniqueAnchor,
  type NavLink,
  type Project,
} from './index.ts';
import { sampleProject } from './sample.ts';
import { TEST_FONTS } from './test-fonts.ts';

/** The value, or a failed test when it is missing. */
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
const paths = (p: Project): string[] => renderSite(p).map((f) => f.path);
const valid = (p: unknown): boolean => projectSchema.safeParse(p).success;
const sectionLink = (label: string, page: string, section: string): NavLink => ({
  label,
  target: { kind: 'section', page, section },
});
const pageLink = (label: string, page: string): NavLink => ({
  label,
  target: { kind: 'page', page },
});

/** Sample with explicit header links: a section on home, a section on about, and the about page. */
function linked(): Project {
  let p = clone();
  p = ensureAnchor(p, 0, 'work');
  p = ensureAnchor(p, 1, 'about');
  p.meta.navLinks = [
    sectionLink('Work', '', 'work'),
    sectionLink('Me', 'about', 'about'),
    pageLink('About page', 'about'),
  ];
  return p;
}

describe('section anchors', () => {
  it('are made from the title, lowercase ASCII, starting with a letter', () => {
    expect(uniqueAnchor('Selected work', [])).toBe('selected-work');
    expect(uniqueAnchor('Ünïcode café!', [])).toBe('unicode-cafe');
    expect(uniqueAnchor('<script>alert(1)</script>', [])).toBe('script-alert-1-script');
    expect(uniqueAnchor('2026 plans', [])).toBe('section-2026-plans');
    expect(uniqueAnchor('   ', [])).toBe('section');
    expect(uniqueAnchor('x'.repeat(200), []).length).toBeLessThanOrEqual(60);
  });

  it('are unique on the page, ignoring letter case', () => {
    expect(uniqueAnchor('Contact', ['contact'])).toBe('contact-2');
    expect(uniqueAnchor('Contact', ['CONTACT', 'contact-2'])).toBe('contact-3');
  });

  it('never use names the page itself needs', () => {
    for (const name of ['top', 'main', 'Main', 'header', 'footer', 'nav', 'menu', 'content']) {
      const anchor = uniqueAnchor(name, []);
      expect(anchor).not.toBe(name.toLowerCase());
      expect(anchor).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it('are stored on the section and kept when the title changes', () => {
    const p = ensureAnchor(clone(), 0, 'work');
    const work = must(must(p.pages[0]).sections.find((s) => s.id === 'work'));
    expect(work.anchor).toBe('selected-work');
    expect(sectionAnchor(work)).toBe('selected-work');
    (work.props as { heading?: string }).heading = 'Renamed';
    expect(must(must(ensureAnchor(p, 0, 'work').pages[0]).sections[1]).anchor).toBe(
      'selected-work',
    );
  });

  it('give two sections with the same title different anchors', () => {
    const p = clone();
    must(must(p.pages[0]).sections[2]).props = { heading: 'Selected work', items: [] };
    const both = ensureAnchor(ensureAnchor(p, 0, 'work'), 0, 'links');
    const anchors = must(both.pages[0]).sections.map(sectionAnchor);
    expect(new Set(anchors).size).toBe(anchors.length);
    expect(anchors).toContain('selected-work-2');
    expect(valid(both)).toBe(true);
  });

  it('keep existing links to the section working', () => {
    const p = ensureAnchor(clone(), 0, 'work');
    const hero = must(must(p.pages[0]).sections[0]).props as { buttons: { href: string }[] };
    expect(must(hero.buttons[0]).href).toBe('#selected-work');
  });

  it('are refused by the schema when reserved, malformed or taken', () => {
    for (const anchor of ['top', 'main', 'Bad Id', '1abc', 'a"b', '', 'x'.repeat(61)]) {
      const p = clone();
      must(must(p.pages[0]).sections[1]).anchor = anchor;
      expect(valid(p), anchor).toBe(false);
    }
    const p = clone();
    must(must(p.pages[0]).sections[1]).anchor = 'hero';
    expect(valid(p)).toBe(false);
  });
});

describe('header links', () => {
  it('point to sections and pages with matching ids in the export', () => {
    const p = linked();
    const files = buildExport(p, new Map([['img1', new Uint8Array([1])]]), TEST_FONTS);
    const html = (path: string) => files.find((f) => f.path === path)?.content as string;
    const home = html('index.html');
    const nav = /<ul class="nav-links"[^>]*>(.*?)<\/ul>/.exec(home)?.[1] ?? '';
    expect(nav).toContain('href="#selected-work"');
    expect(nav).toContain('href="about.html#about-me"');
    expect(nav).toContain('href="about.html"');
    expect(home).toContain('<section id="selected-work"');
    expect(html('about.html')).toContain('<section id="about-me"');
    // On the about page its own section is a same-page link and the page is current.
    const aboutNav = /<ul class="nav-links"[^>]*>(.*?)<\/ul>/.exec(html('about.html'))?.[1] ?? '';
    expect(aboutNav).toContain('href="index.html#selected-work"');
    expect(aboutNav).toContain('href="#about-me"');
    expect(aboutNav).toContain('href="about.html" aria-current="page"');
  });

  it('escape their labels', () => {
    const p = linked();
    must(must(p.meta.navLinks)[0]).label = '<img src=x onerror=alert(1)>';
    const home = file(p, 'index.html');
    expect(home).not.toContain('<img src=x');
    expect(home).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('flag a link to a deleted section and leave it out of the export', () => {
    const p = linked();
    must(p.pages[0]).sections = must(p.pages[0]).sections.filter((s) => s.id !== 'work');
    expect(valid(p)).toBe(true);
    expect(navLinkProblems(p)).toEqual([
      { index: 0, message: '“Work” points to a section that was deleted.' },
    ]);
    expect(file(p, 'index.html')).not.toContain('>Work</a>');
    const fixed = removeBrokenNavLinks(p);
    expect(fixed.meta.navLinks?.map((l) => l.label)).toEqual(['Me', 'About page']);
    expect(navLinkProblems(fixed)).toEqual([]);
  });

  it('flag links to a deleted page', () => {
    const p = deletePage(linked(), 1);
    expect(navLinkProblems(p).map((x) => x.message)).toEqual([
      '“Me” points to a page that was deleted.',
      '“About page” points to a page that was deleted.',
    ]);
    expect(file(p, 'index.html')).not.toContain('about.html');
  });

  it('follow a page rename', () => {
    const p = renamePage(linked(), 1, 'Story');
    expect(p.meta.navLinks?.map((l) => l.target.page)).toEqual(['', 'story', 'story']);
    expect(navLinkProblems(p)).toEqual([]);
    expect(file(p, 'index.html')).toContain('href="story.html#about-me"');
  });

  it('are limited in number and checked on import', () => {
    const p = linked();
    p.meta.navLinks = Array.from({ length: MAX_NAV_LINKS }, (_, i) => pageLink(`L${i}`, ''));
    expect(parseProjectFile(serializeProject(p)).meta.navLinks).toHaveLength(MAX_NAV_LINKS);
    p.meta.navLinks.push(pageLink('One too many', ''));
    expect(() => parseProjectFile(JSON.stringify(p))).toThrow(/damaged/);
    const bad = linked() as unknown as { meta: { navLinks: unknown[] } };
    bad.meta.navLinks[0] = { label: 'x', target: { kind: 'url', href: 'javascript:alert(1)' } };
    expect(() => parseProjectFile(JSON.stringify(bad))).toThrow(/damaged/);
    bad.meta.navLinks[0] = { label: 'x', target: { kind: 'page', page: '../etc' } };
    expect(() => parseProjectFile(JSON.stringify(bad))).toThrow(/damaged/);
  });

  it('scroll smoothly with an offset from the header, honoring reduced motion', () => {
    const js = file(linked(), 'js/site.js');
    expect(js).toContain('a[href^="#"]');
    expect(js).toContain('prefers-reduced-motion: reduce');
    expect(js).toContain('scrollPaddingTop');
    expect(js).toContain('history.pushState');
  });
});

describe('removing the header', () => {
  const off = (): Project => {
    const p = linked();
    p.meta.headerEnabled = false;
    return p;
  };

  it('leaves no header markup, CSS or JS in the export', () => {
    const p = off();
    p.meta.header = {
      layout: 'floating',
      background: 'transparent',
      color: 'accent',
      sticky: true,
      cta: { label: 'Book', href: 'about.html' },
    };
    const files = buildExport(p, new Map([['img1', new Uint8Array([1])]]), TEST_FONTS);
    for (const f of files.filter((x) => x.path.endsWith('.html'))) {
      const html = f.content as string;
      expect(html).not.toMatch(/<header|site-header|class="nav|header\.css|header\.js/);
      expect(html).toContain('<a class="skip" href="#main">');
    }
    const css = files.find((f) => f.path === 'css/site.css')?.content as string;
    expect(css).not.toMatch(/site-header|\.hdr|\.nav|\.menu|header-|scroll-padding/);
    const js = files.find((f) => f.path === 'js/site.js')?.content as string;
    expect(js).not.toMatch(/\.menu|hdr-|site-header|scrollPaddingTop *=/);
    expect(files.map((f) => f.path)).not.toContain('css/header.css');
    expect(files.map((f) => f.path)).not.toContain('js/header.js');
  });

  it('keeps section links working with zero offset', () => {
    const js = file(off(), 'js/site.js');
    expect(js).toContain('a[href^="#"]');
    expect(file(off(), 'index.html')).toContain('<section id="selected-work"');
  });

  it('can be hidden on one page only', () => {
    const p = linked();
    must(p.pages[1]).hideHeader = true;
    expect(headerShown(p, must(p.pages[0]))).toBe(true);
    expect(headerShown(p, must(p.pages[1]))).toBe(false);
    const home = file(p, 'index.html');
    const about = file(p, 'about.html');
    expect(home).toContain('<header class="site-header');
    expect(home).toContain('<link rel="stylesheet" href="css/header.css">');
    expect(home).toContain('<script src="js/header.js" defer></script>');
    expect(about).not.toMatch(/<header|header\.css|header\.js/);
    expect(file(p, 'css/site.css')).not.toMatch(/site-header|scroll-padding/);
    expect(file(p, 'css/header.css')).toMatch(/site-header/);
    expect(file(p, 'css/header.css')).toMatch(/scroll-padding-top/);
    expect(file(p, 'js/site.js')).not.toMatch(/\.menu/);
    expect(file(p, 'js/header.js')).toMatch(/\.menu/);
  });

  it('hidden on every page is the same as off', () => {
    const p = linked();
    for (const page of p.pages) page.hideHeader = true;
    expect(paths(p)).not.toContain('css/header.css');
    expect(file(p, 'css/site.css')).toBe(file(off(), 'css/site.css'));
  });

  it('changes nothing for a site that shows its header everywhere', () => {
    const p = linked();
    expect(paths(p)).not.toContain('css/header.css');
    expect(file(p, 'css/site.css')).toMatch(/site-header/);
    expect(file(p, 'index.html')).not.toContain('header.css');
  });

  it('round-trips through the project file', () => {
    const p = off();
    must(p.pages[1]).hideHeader = true;
    expect(parseProjectFile(serializeProject(p))).toEqual(p);
  });
});

describe('schema version 3', () => {
  const v2 = (): Record<string, unknown> => {
    const p = clone() as unknown as Record<string, unknown> & { meta: Record<string, unknown> };
    delete p.meta.headerEnabled;
    return { ...p, schemaVersion: 2 };
  };

  it('is upgraded past by version 5 (see free.test.ts)', () => {
    expect(SCHEMA_VERSION).toBe(6);
    expect(Object.keys(MIGRATIONS)).toContain('2');
  });

  it('upgrades a version 2 project with the header on', () => {
    const upgraded = migrateProject(v2());
    expect(upgraded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(upgraded.meta.headerEnabled).toBe(true);
    expect(upgraded.pages).toEqual(clone().pages);
    expect(upgraded.pages.every((page) => page.hideHeader === undefined)).toBe(true);
    expect(file(upgraded, 'index.html')).toContain('<header class="site-header');
  });

  it('keeps a header turned off when upgrading', () => {
    const old = { ...v2(), meta: { ...(v2().meta as object), headerEnabled: false } };
    expect(migrateProject(old).meta.headerEnabled).toBe(false);
  });

  it('upgrades a version 1 project all the way', () => {
    const p = v2() as { meta: Record<string, unknown> };
    delete p.meta.headerStyle;
    const upgraded = migrateProject({ ...p, schemaVersion: 1 });
    expect(upgraded.meta.headerStyle).toBe('bar');
    expect(upgraded.meta.headerEnabled).toBe(true);
  });
});
