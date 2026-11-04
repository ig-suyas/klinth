/* eslint-disable @typescript-eslint/no-non-null-assertion -- fixture indexes are known in tests */
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  MAX_PAGES,
  ProjectError,
  addPage,
  blankProject,
  buildExport,
  buildZip,
  deletePage,
  migrateProject,
  movePage,
  parseProjectFile,
  renamePage,
  safeUrl,
  sampleProject,
  serializeProject,
  slugify,
  uniqueSlug,
  type Project,
} from './index.ts';
import { TEST_FONTS } from './test-fonts.ts';

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
const assetData = new Map([['img1', new Uint8Array([1, 2, 3, 4])]]);

/** A project with a button on the home page that links to the About page. */
function linked(): Project {
  const p = clone();
  const hero = p.pages[0]!.sections[0]!;
  if (hero.type !== 'hero') throw new Error('fixture changed');
  hero.props.buttons = [{ label: 'About me', href: 'about.html' }];
  return p;
}

function withPages(count: number): Project {
  let p = blankProject();
  for (let i = 1; i < count; i++) p = addPage(p, `Page ${i}`).project;
  return p;
}

describe('page addresses', () => {
  it.each([
    ['About me', 'about-me'],
    ['  Prices & Plans!  ', 'prices-plans'],
    ['Café Ünïcode', 'cafe-unicode'],
    ['../../etc/passwd', 'etc-passwd'],
    ['a\\b/c', 'a-b-c'],
    ['---', 'page'],
    ['मेरा पेज', 'page'],
    ['x'.repeat(200), 'x'.repeat(60)],
  ])('slugify(%j) is %j', (title, slug) => {
    expect(slugify(title)).toBe(slug);
  });

  it.each([
    'index',
    'Index',
    'CSS',
    'assets',
    'js',
    'readme',
    'fonts',
    'con',
    'NUL',
    'com1',
    'lpt9',
  ])('never gives a reserved address for %j', (title) => {
    const slug = uniqueSlug(title, []);
    expect(slug).not.toBe(title.toLowerCase());
    expect(() =>
      migrateProject({ ...clone(), pages: [...clone().pages, { slug, title, sections: [] }] }),
    ).not.toThrow();
  });

  it('adds a number when the address is taken, ignoring letter case', () => {
    expect(uniqueSlug('About', ['about'])).toBe('about-2');
    expect(uniqueSlug('ABOUT', ['about', 'about-2'])).toBe('about-3');
    expect(uniqueSlug('x'.repeat(80), ['x'.repeat(60)])).toBe(`${'x'.repeat(58)}-2`);
  });

  it('makes unique, safe addresses when pages share a title', () => {
    let p = blankProject();
    for (const title of ['About', 'about', 'ABOUT', '../about', 'index', 'Index.html']) {
      p = addPage(p, title).project;
    }
    const slugs = p.pages.map((x) => x.slug);
    expect(new Set(slugs.map((s) => s.toLowerCase())).size).toBe(slugs.length);
    expect(slugs.slice(1).every((s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s))).toBe(true);
    expect(slugs).not.toContain('index');
    expect(() => migrateProject(p)).not.toThrow();
  });

  it('allows links to pages but not to other files or folders', () => {
    expect(safeUrl('about.html')).toBe('about.html');
    expect(safeUrl('index.html')).toBe('index.html');
    expect(safeUrl('about.html#work')).toBe('about.html#work');
    for (const bad of ['../about.html', '/about.html', 'About.html', 'a/b.html', 'about.htm']) {
      expect(safeUrl(bad)).toBeNull();
    }
  });

  it('refuses a link to a page that does not exist', () => {
    const p = linked();
    const hero = p.pages[0]!.sections[0]!;
    if (hero.type !== 'hero') throw new Error('fixture changed');
    hero.props.buttons = [{ label: 'Gone', href: 'missing.html' }];
    expect(() => migrateProject(p)).toThrow(ProjectError);
  });
});

describe('page list', () => {
  it('keeps the home page first', () => {
    const p = clone();
    p.pages.reverse();
    expect(() => migrateProject(p)).toThrow(ProjectError);
    expect(() => movePage(clone(), 1, -1)).toThrow(/home page/i);
    expect(() => movePage(clone(), 0, 1)).toThrow(/home page/i);
  });

  it('allows 50 pages and refuses the 51st', () => {
    expect(MAX_PAGES).toBe(50);
    const full = withPages(MAX_PAGES);
    expect(full.pages).toHaveLength(50);
    expect(() => migrateProject(full)).not.toThrow();
    expect(() => addPage(full, 'One more')).toThrow(/50 pages/);
    const over = {
      ...full,
      pages: [...full.pages, { slug: 'extra', title: 'Extra', sections: [] }],
    };
    expect(() => migrateProject(over)).toThrow(ProjectError);
  });

  it('never deletes the last page or the home page', () => {
    const one = blankProject();
    expect(() => deletePage(one, 0)).toThrow(/at least one page/i);
    expect(() => deletePage(clone(), 0)).toThrow(/home page/i);
    const left = deletePage(clone(), 1);
    expect(left.pages.map((x) => x.slug)).toEqual(['']);
  });

  it('removes links to a deleted page instead of leaving them broken', () => {
    const p = deletePage(linked(), 1);
    expect(() => migrateProject(p)).not.toThrow();
    const hero = p.pages[0]!.sections[0]!;
    expect(hero.type === 'hero' && hero.props.buttons?.[0]).toEqual({
      label: 'About me',
      href: '',
    });
  });

  it('reorders pages other than the home page', () => {
    let p = withPages(4);
    p = movePage(p, 3, -1);
    expect(p.pages.map((x) => x.title)).toEqual(['Home', 'Page 1', 'Page 3', 'Page 2']);
    expect(movePage(p, 3, 1)).toBe(p);
  });
});

describe('renaming a page', () => {
  it('changes its address and updates every link to it', () => {
    const p = renamePage(linked(), 1, 'My story');
    expect(p.pages[1]).toMatchObject({ slug: 'my-story', title: 'My story' });
    const hero = p.pages[0]!.sections[0]!;
    expect(hero.type === 'hero' && hero.props.buttons?.[0]?.href).toBe('my-story.html');
    expect(() => migrateProject(p)).not.toThrow();
  });

  it('keeps the home page at index.html', () => {
    const p = renamePage(clone(), 0, 'Welcome');
    expect(p.pages[0]).toMatchObject({ slug: '', title: 'Welcome' });
  });

  it('keeps the address when the new title gives the same one', () => {
    const p = renamePage(linked(), 1, 'ABOUT');
    expect(p.pages[1]!.slug).toBe('about');
  });

  it('refuses an empty title', () => {
    expect(() => renamePage(clone(), 1, '   ')).toThrow(/name/i);
  });
});

describe('blank start', () => {
  it('is one empty home page', () => {
    const p = blankProject();
    expect(p.pages).toEqual([{ slug: '', title: 'Home', sections: [] }]);
    expect(migrateProject(p)).toEqual(p);
  });
});

describe('multi-page export', () => {
  function bigSite(): Project {
    let p = linked();
    for (let i = 0; i < 20; i++) p = addPage(p, `Service ${i}`).project;
    return renamePage(p, 1, 'Our story');
  }

  it('every page links only to files that exist', () => {
    const p = bigSite();
    const files = buildExport(p, assetData, TEST_FONTS);
    const paths = new Set(files.map((f) => f.path));
    expect(p.pages.every((pg) => paths.has(pg.slug ? `${pg.slug}.html` : 'index.html'))).toBe(true);
    for (const file of files.filter((f) => f.path.endsWith('.html'))) {
      const html = String(file.content);
      const refs = [...html.matchAll(/\s(?:href|src)="([^"]*)"/g)].map((m) => m[1] ?? '');
      for (const ref of refs) {
        if (/^(https:|mailto:|tel:|#)/.test(ref)) continue;
        expect(paths, `${file.path} -> ${ref}`).toContain(ref.split('#')[0]);
      }
    }
    // The shared menu lists every page, renamed one included.
    const home = String(files.find((f) => f.path === 'index.html')?.content);
    expect(home).toContain('href="our-story.html"');
    expect(home).toContain('href="service-19.html"');
    expect(home).not.toContain('about.html');
  });

  it('can turn off the shared page menu', () => {
    const p = { ...bigSite(), meta: { ...bigSite().meta, pageMenu: false } };
    const home = String(
      buildExport(p, assetData, TEST_FONTS).find((f) => f.path === 'index.html')?.content,
    );
    expect(home).not.toContain('href="service-1.html"');
    // Links the user added still work.
    expect(home).toContain('href="our-story.html"');
  });

  it('zips and round-trips 50 pages', () => {
    const p = withPages(MAX_PAGES);
    const zip = unzipSync(buildZip(buildExport(p, new Map(), TEST_FONTS)));
    expect(Object.keys(zip).filter((k) => k.endsWith('.html'))).toHaveLength(50);
    const file = strFromU8(zip['.klinth/project.json']!);
    expect(parseProjectFile(file)).toEqual(p);
    expect(parseProjectFile(serializeProject(p)).pages).toHaveLength(50);
  });
});
