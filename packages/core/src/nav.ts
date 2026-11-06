/**
 * Header links and section anchors.
 *
 * A header link points to a page or to one section, picked from lists in the
 * editor (never typed). Pages are referenced by slug and sections by their
 * internal id, so links survive renames; each linked section gets a stable,
 * readable `anchor` made from its title, used as its `id` in the export.
 * Kept free of schema imports (types only), so the schema can use it.
 */
import { z } from 'zod';
import { singleLine } from './blocks.ts';
import { PAGE_LINK, linkedSlug, mapHrefs, pageFile } from './links.ts';
import type { Page, Project, Section } from './schema.ts';

/** Most links one header can have. */
export const MAX_NAV_LINKS = 20;
/** Longest header link label. */
export const MAX_NAV_LABEL = 40;
const MAX_ANCHOR = 60;

/** Ids the page itself uses or that read like page parts; never given to a section. */
export const RESERVED_ANCHORS: ReadonlySet<string> = new Set([
  'top',
  'main',
  'content',
  'header',
  'footer',
  'nav',
  'menu',
  'skip',
]);

/** A section anchor: lowercase ASCII words joined by `-`, starting with a letter. */
export const anchorSchema = z
  .string()
  .max(MAX_ANCHOR)
  .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and -')
  .refine((v) => !RESERVED_ANCHORS.has(v), 'This name is reserved');

const slug = z
  .string()
  .max(60)
  .regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, 'Invalid page');
const sectionId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id');

export const navLinkSchema = z
  .object({
    label: singleLine(MAX_NAV_LABEL, 1),
    target: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('page'), page: slug }).strict(),
      z.object({ kind: z.literal('section'), page: slug, section: sectionId }).strict(),
    ]),
  })
  .strict();

export type NavLink = z.infer<typeof navLinkSchema>;

/** The id a section has in the page: its anchor, or its internal id when it has none. */
export const sectionAnchor = (section: Pick<Section, 'id' | 'anchor'>): string =>
  section.anchor ?? section.id;

/** The words a section's anchor is made from. */
export function sectionTitleText(section: Section): string {
  const props = section.props as Record<string, unknown>;
  const text = [props.navLabel, props.heading, props.text, props.eyebrow].find(
    (v): v is string => typeof v === 'string' && v.trim() !== '',
  );
  return text ?? section.type;
}

function anchorBase(title: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, MAX_ANCHOR)
    .replace(/-+$/, '');
  if (!base) return 'section';
  return /^[a-z]/.test(base) ? base : `section-${base}`.slice(0, MAX_ANCHOR).replace(/-+$/, '');
}

/** A safe anchor for `title` that no id in `taken` uses (compared without letter case). */
export function uniqueAnchor(title: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((s) => s.toLowerCase()));
  const free = (a: string) => !used.has(a) && !RESERVED_ANCHORS.has(a);
  const base = anchorBase(title);
  if (free(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const anchor = `${base.slice(0, MAX_ANCHOR - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (free(anchor)) return anchor;
  }
}

/**
 * Gives a section a stored anchor (if it has none yet) and points links that
 * used its old id at the new one. Returns the project unchanged otherwise.
 */
export function ensureAnchor(project: Project, pageIndex: number, id: string): Project {
  const page = project.pages[pageIndex];
  const section = page?.sections.find((s) => s.id === id);
  if (!page || !section || section.anchor) return project;
  const taken = page.sections.filter((s) => s !== section).map(sectionAnchor);
  const anchor = uniqueAnchor(sectionTitleText(section), taken);
  const old = section.id;
  const relink = (href: string, onPage: boolean): string => {
    const value = href.trim();
    if (onPage && value === `#${old}`) return `#${anchor}`;
    const match = PAGE_LINK.exec(value);
    if (match && match[2] === `#${old}` && linkedSlug(value) === page.slug) {
      return `${pageFile(page.slug)}#${anchor}`;
    }
    return href;
  };
  const pages = project.pages.map((p, i) => ({
    ...p,
    sections: mapHrefs(
      p.sections.map((s) => (i === pageIndex && s.id === id ? { ...s, anchor } : s)),
      (href) => relink(href, i === pageIndex),
    ),
  }));
  const cta = project.meta.header?.cta;
  const meta =
    project.meta.header && cta
      ? {
          ...project.meta,
          header: { ...project.meta.header, cta: { ...cta, href: relink(cta.href, false) } },
        }
      : project.meta;
  return { ...project, meta, pages };
}

/** Where a header link goes from `from`, or null when its page or section is gone. */
export function navLinkHref(project: Project, link: NavLink, from: Page): string | null {
  const page = project.pages.find((p) => p.slug === link.target.page);
  if (!page) return null;
  if (link.target.kind === 'page') return pageFile(page.slug);
  const id = link.target.section;
  const section = page.sections.find((s) => s.id === id);
  if (!section) return null;
  const hash = `#${sectionAnchor(section)}`;
  return page === from ? hash : `${pageFile(page.slug)}${hash}`;
}

/** Header links whose page or section no longer exists, with a plain message each. */
export function navLinkProblems(project: Project): { index: number; message: string }[] {
  return (project.meta.navLinks ?? []).flatMap((link, index) => {
    const page = project.pages.find((p) => p.slug === link.target.page);
    if (!page) return [{ index, message: `“${link.label}” points to a page that was deleted.` }];
    if (
      link.target.kind === 'section' &&
      !page.sections.some((s) => s.id === (link.target as { section: string }).section)
    ) {
      return [{ index, message: `“${link.label}” points to a section that was deleted.` }];
    }
    return [];
  });
}

/** Drops header links whose page or section is gone. */
export function removeBrokenNavLinks(project: Project): Project {
  const broken = new Set(navLinkProblems(project).map((p) => p.index));
  if (!project.meta.navLinks || broken.size === 0) return project;
  return {
    ...project,
    meta: { ...project.meta, navLinks: project.meta.navLinks.filter((_, i) => !broken.has(i)) },
  };
}

/** Points header links at a renamed page (`to`), or leaves them flagged when it was deleted. */
export function relinkNavLinks(meta: Project['meta'], from: string, to: string): Project['meta'] {
  if (!meta.navLinks) return meta;
  return {
    ...meta,
    navLinks: meta.navLinks.map((link) =>
      link.target.page === from ? { ...link, target: { ...link.target, page: to } } : link,
    ),
  };
}

/**
 * The links the header showed before links could be chosen: every page (when
 * there are several and the page menu is on), otherwise the sections the owner
 * named for the menu. Used to start the editable list from what is shown.
 */
export function automaticNavLinks(project: Project): NavLink[] {
  if (project.pages.length > 1 && project.meta.pageMenu !== false) {
    return project.pages.map((p) => ({
      label: p.title.slice(0, MAX_NAV_LABEL),
      target: { kind: 'page', page: p.slug },
    }));
  }
  return project.pages.flatMap((page) =>
    page.sections.flatMap((s): NavLink[] => {
      const label = 'navLabel' in s.props ? (s.props.navLabel ?? '').trim() : '';
      return s.type !== 'footer' && label
        ? [{ label, target: { kind: 'section', page: page.slug, section: s.id } }]
        : [];
    }),
  );
}

/** True when this page shows the site header (on for the site, not hidden on the page). */
export const headerShown = (project: Project, page: Page): boolean =>
  project.meta.headerEnabled !== false && page.hideHeader !== true;

/** True when this page's footer shows "Back to top" (on for the site, not hidden on the page). */
export const backToTopShown = (project: Project, page: Page): boolean =>
  project.meta.backToTop !== false && page.hideBackToTop !== true;
