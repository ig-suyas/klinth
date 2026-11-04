import {
  MAX_NAV_LABEL,
  automaticNavLinks,
  ensureAnchor,
  sectionTitleText,
  type NavLink,
  type Project,
} from '@klinth/core';
import { sectionTitle } from './sections.ts';

/**
 * Pure header edits for the editor. The store validates every result against
 * the project schema before it is applied.
 */

/** Selection value for the site header. Never a valid section id (they cannot hold `#`). */
export const HEADER_ID = '#header';

export const MULTI_PAGE_NOTE =
  "Without a header, visitors can't move between your pages unless you add links.";

export type NavTarget = NavLink['target'];

const SLUG = /^([a-z0-9]+(-[a-z0-9]+)*)?$/;
const SECTION_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A dropdown value for a target: `page:<slug>` or `section:<slug>:<section id>`. */
export function encodeTarget(target: NavTarget): string {
  return target.kind === 'page'
    ? `page:${target.page}`
    : `section:${target.page}:${target.section}`;
}

/** The target a dropdown value stands for, or null for anything malformed. */
export function decodeTarget(value: string): NavTarget | null {
  const parts = value.split(':');
  if (parts[0] === 'page' && parts.length === 2 && SLUG.test(parts[1] ?? '-')) {
    return { kind: 'page', page: parts[1] ?? '' };
  }
  if (
    parts[0] === 'section' &&
    parts.length === 3 &&
    SLUG.test(parts[1] ?? '-') &&
    SECTION_ID.test(parts[2] ?? '')
  ) {
    return { kind: 'section', page: parts[1] ?? '', section: parts[2] ?? '' };
  }
  return null;
}

export interface TargetOption {
  value: string;
  label: string;
  /** The page the option belongs to, for grouping. */
  group: string;
}

/** Every page and every section (except footers), page by page, for the link dropdown. */
export function navTargetOptions(project: Project): TargetOption[] {
  return project.pages.flatMap((page) => [
    {
      value: encodeTarget({ kind: 'page', page: page.slug }),
      label: `${page.title} (page)`,
      group: page.title,
    },
    ...page.sections
      .filter((s) => s.type !== 'footer')
      .map((s) => ({
        value: encodeTarget({ kind: 'section', page: page.slug, section: s.id }),
        label: sectionTitle(s),
        group: page.title,
      })),
  ]);
}

/** A short label for a new link to `target`. */
function defaultLabel(project: Project, target: NavTarget): string {
  const page = project.pages.find((p) => p.slug === target.page);
  const section =
    target.kind === 'section' ? page?.sections.find((s) => s.id === target.section) : undefined;
  const text = section ? sectionTitleText(section) : (page?.title ?? 'Link');
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_NAV_LABEL) || 'Link';
}

/** Linked sections get a stable anchor made from their title. */
function anchorFor(project: Project, target: NavTarget): Project {
  if (target.kind !== 'section') return project;
  const index = project.pages.findIndex((p) => p.slug === target.page);
  return index < 0 ? project : ensureAnchor(project, index, target.section);
}

function withLinks(project: Project, links: NavLink[]): Project {
  return { ...project, meta: { ...project.meta, navLinks: links } };
}

/** Adds a header link to `target` at the end. */
export function addNavLink(project: Project, target: NavTarget, label?: string): Project {
  const base = anchorFor(project, target);
  const links = base.meta.navLinks ?? [];
  return withLinks(base, [...links, { label: label ?? defaultLabel(base, target), target }]);
}

/** Points link `index` somewhere else; the label follows unless the owner changed it. */
export function setNavTarget(project: Project, index: number, target: NavTarget): Project {
  const links = project.meta.navLinks ?? [];
  const link = links[index];
  if (!link) return project;
  const base = anchorFor(project, target);
  const keep = link.label !== defaultLabel(project, link.target);
  const next = { label: keep ? link.label : defaultLabel(base, target), target };
  return withLinks(
    base,
    links.map((l, i) => (i === index ? next : l)),
  );
}

export function setNavLabel(project: Project, index: number, label: string): Project {
  const links = project.meta.navLinks ?? [];
  return withLinks(
    project,
    links.map((l, i) => (i === index ? { ...l, label } : l)),
  );
}

export function removeNavLink(project: Project, index: number): Project {
  return withLinks(
    project,
    (project.meta.navLinks ?? []).filter((_, i) => i !== index),
  );
}

export function moveNavLink(project: Project, index: number, by: -1 | 1): Project {
  const links = [...(project.meta.navLinks ?? [])];
  const to = index + by;
  if (to < 0 || to >= links.length) return project;
  const [moved] = links.splice(index, 1);
  if (moved) links.splice(to, 0, moved);
  return withLinks(project, links);
}

/** Turns the automatic links into an editable list (same links, same order). */
export function customizeNavLinks(project: Project): Project {
  const links = automaticNavLinks(project);
  const anchored = links.reduce((p, link) => anchorFor(p, link.target), project);
  return withLinks(anchored, links);
}

/** Back to automatic links (pages, or sections named for the menu). */
export function automaticLinks(project: Project): Project {
  const meta = { ...project.meta };
  delete meta.navLinks;
  return { ...project, meta };
}

export const removeHeader = (project: Project): Project => ({
  ...project,
  meta: { ...project.meta, headerEnabled: false },
});

export const addHeaderBack = (project: Project): Project => ({
  ...project,
  meta: { ...project.meta, headerEnabled: true },
});

/** Hides (or shows again) the header on one page. */
export function setPageHeaderHidden(project: Project, index: number, hidden: boolean): Project {
  return {
    ...project,
    pages: project.pages.map((page, i) => {
      if (i !== index) return page;
      const next = { ...page };
      if (hidden) next.hideHeader = true;
      else delete next.hideHeader;
      return next;
    }),
  };
}
