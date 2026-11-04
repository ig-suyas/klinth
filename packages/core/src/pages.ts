import { DEVICE_NAME, PAGE_LINK, RESERVED_SLUGS, linkedSlug, mapHrefs, pageFile } from './links.ts';
import { ProjectError } from './migrations.ts';
import { MAX_PAGES, SCHEMA_VERSION, type Page, type Project } from './schema.ts';
import { defaultTheme } from './tokens.ts';

export { MAX_PAGES };

const MAX_SLUG = 60;
const MAX_TITLE = 120;

/** A page address from its title: lowercase ASCII letters, numbers and single dashes. */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '');
  return slug || 'page';
}

const isFree = (slug: string, taken: ReadonlySet<string>): boolean =>
  !taken.has(slug) && !RESERVED_SLUGS.has(slug) && !DEVICE_NAME.test(slug);

/**
 * A safe address for `title` that no other page uses. Compared without letter
 * case, because Windows and macOS treat `About.html` and `about.html` as one file.
 */
export function uniqueSlug(title: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((s) => s.toLowerCase()));
  const base = slugify(title);
  if (isFree(base, used)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const slug = `${base.slice(0, MAX_SLUG - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (isFree(slug, used)) return slug;
  }
}

const cleanTitle = (title: string): string => title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);

/** Points links at `from` to `to` instead (or removes them when `to` is null). */
function relink(pages: Page[], from: string, to: string | null): Page[] {
  return pages.map((page) => ({
    ...page,
    sections: mapHrefs(page.sections, (href) => {
      if (linkedSlug(href) !== from) return href;
      if (to === null) return '';
      const anchor = PAGE_LINK.exec(href.trim())?.[2] ?? '';
      return `${pageFile(to)}${anchor}`;
    }),
  }));
}

/** Adds an empty page at the end. */
export function addPage(project: Project, title: string): { project: Project; index: number } {
  if (project.pages.length >= MAX_PAGES) {
    throw new ProjectError(`A site can have up to ${MAX_PAGES} pages.`);
  }
  const name = cleanTitle(title) || 'New page';
  const page: Page = {
    slug: uniqueSlug(
      name,
      project.pages.map((p) => p.slug),
    ),
    title: name,
    sections: [],
  };
  return { project: { ...project, pages: [...project.pages, page] }, index: project.pages.length };
}

/** Renames a page. Its address follows the new name and every link to it is updated. */
export function renamePage(project: Project, index: number, title: string): Project {
  const page = project.pages[index];
  if (!page) return project;
  const name = cleanTitle(title);
  if (!name) throw new ProjectError('Give the page a name.');
  if (page.slug === '') {
    return {
      ...project,
      pages: project.pages.map((p, i) => (i === index ? { ...p, title: name } : p)),
    };
  }
  const others = project.pages.filter((_, i) => i !== index).map((p) => p.slug);
  const slug = slugify(name) === page.slug ? page.slug : uniqueSlug(name, others);
  const pages = project.pages.map((p, i) => (i === index ? { ...p, slug, title: name } : p));
  return { ...project, pages: slug === page.slug ? pages : relink(pages, page.slug, slug) };
}

/** Deletes a page. Links to it are removed so the site never has broken links. */
export function deletePage(project: Project, index: number): Project {
  if (project.pages.length <= 1) throw new ProjectError('A site needs at least one page.');
  const page = project.pages[index];
  if (!page) return project;
  if (page.slug === '') throw new ProjectError('The home page cannot be deleted.');
  const pages = project.pages.filter((_, i) => i !== index);
  return { ...project, pages: relink(pages, page.slug, null) };
}

/** Moves a page up (-1) or down (+1). The home page always stays first. */
export function movePage(project: Project, index: number, by: -1 | 1): Project {
  const to = index + by;
  if (index === 0 || to === 0) throw new ProjectError('The home page always comes first.');
  if (index < 0 || to < 0 || index >= project.pages.length || to >= project.pages.length) {
    return project;
  }
  const pages = [...project.pages];
  const [moved] = pages.splice(index, 1);
  if (moved) pages.splice(to, 0, moved);
  return { ...project, pages };
}

/** A fresh project with one empty home page, for "Start blank". */
export function blankProject(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { title: 'My website', description: '', language: 'en', headerStyle: 'bar' },
    theme: JSON.parse(JSON.stringify(defaultTheme)) as Project['theme'],
    pages: [{ slug: '', title: 'Home', sections: [] }],
    assets: [],
  };
}
