import {
  freeCanvas,
  freeTitle,
  type BlockType,
  type Page,
  type Project,
  type Section,
} from '@klinth/core';
import { blockDefinitions } from '@klinth/templates';

/**
 * Pure edits on a project. Each returns a new project (the input is never
 * changed). The store validates the result before it is applied, so these
 * may build loosely typed objects.
 */

export type Props = Record<string, unknown>;

/** A short random id like `about-k3x9q2`, unique among `taken`. */
export function newSectionId(type: string, taken: ReadonlySet<string>): string {
  const prefix = type.replace(/[^A-Za-z0-9]/g, '').slice(0, 20) || 'section';
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const suffix = Array.from(bytes, (b) => (b % 36).toString(36)).join('');
    const id = `${prefix}-${suffix}`;
    if (!taken.has(id)) return id;
  }
}

function withPage(project: Project, pageIndex: number, edit: (page: Page) => unknown): unknown {
  const page = project.pages[pageIndex];
  if (!page) return project;
  return {
    ...project,
    pages: project.pages.map((p, i) => (i === pageIndex ? edit(p) : p)),
  };
}

function withSections(
  project: Project,
  pageIndex: number,
  edit: (sections: readonly Section[]) => unknown[],
): unknown {
  return withPage(project, pageIndex, (page) => ({ ...page, sections: edit(page.sections) }));
}

/** Replaces one section's props. Empty strings and `undefined` remove the prop. */
export function setSectionProps(
  project: Project,
  pageIndex: number,
  id: string,
  props: Props,
): unknown {
  return withSections(project, pageIndex, (sections) =>
    sections.map((s) => (s.id === id ? { ...s, props: tidy(props) } : s)),
  );
}

/** Drops empty optional values so saved files stay small and tidy. */
export function tidy(props: Props): Props {
  return Object.fromEntries(
    Object.entries(props).filter(([, value]) => value !== undefined && value !== ''),
  );
}

/**
 * Adds a new section of `type` after `afterId`, or before the footer when
 * nothing is selected. Returns the new project and the new section's id.
 */
export function addSection(
  project: Project,
  pageIndex: number,
  type: BlockType,
  afterId?: string | null,
): { project: unknown; id: string } {
  const sections = project.pages[pageIndex]?.sections ?? [];
  const id = newSectionId(type, new Set(sections.map((s) => s.id)));
  const section = { id, type, props: blockDefinitions[type].defaults() };
  const after = sections.findIndex((s) => s.id === afterId);
  const footer = sections.findIndex((s) => s.type === 'footer');
  const at = after >= 0 ? after + 1 : footer >= 0 ? footer : sections.length;
  return {
    id,
    project: withSections(project, pageIndex, (list) => [
      ...list.slice(0, at),
      section,
      ...list.slice(at),
    ]),
  };
}

/** Copies a section right below itself. Returns the copy's id. */
export function duplicateSection(
  project: Project,
  pageIndex: number,
  id: string,
): { project: unknown; id: string } | undefined {
  const sections = project.pages[pageIndex]?.sections ?? [];
  const index = sections.findIndex((s) => s.id === id);
  const original = sections[index];
  if (!original) return undefined;
  const copyId = newSectionId(original.type, new Set(sections.map((s) => s.id)));
  // The copy gets its own anchor later if a header link points to it; two equal ones are invalid.
  const copy = { ...structuredClone(original), id: copyId };
  delete copy.anchor;
  return {
    id: copyId,
    project: withSections(project, pageIndex, (list) => [
      ...list.slice(0, index + 1),
      copy,
      ...list.slice(index + 1),
    ]),
  };
}

export function deleteSection(project: Project, pageIndex: number, id: string): unknown {
  return withSections(project, pageIndex, (list) => list.filter((s) => s.id !== id));
}

/** Moves a section up (-1) or down (+1). */
export function moveSection(project: Project, pageIndex: number, id: string, by: -1 | 1): unknown {
  return withSections(project, pageIndex, (list) => {
    const from = list.findIndex((s) => s.id === id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= list.length) return [...list];
    const next = [...list];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    return next;
  });
}

/** Puts sections in the order of `ids` (from drag and drop). Unknown ids are ignored. */
export function reorderSections(
  project: Project,
  pageIndex: number,
  ids: readonly string[],
): unknown {
  return withSections(project, pageIndex, (list) => {
    const byId = new Map(list.map((s) => [s.id, s]));
    const ordered = ids.flatMap((id) => {
      const s = byId.get(id);
      return s ? [s] : [];
    });
    // Never lose a section, even if the list was out of date.
    return [...ordered, ...list.filter((s) => !ids.includes(s.id))];
  });
}

/** The short name shown in the sections list: its heading, or the block's label. */
export function sectionTitle(section: Section): string {
  // A free section shows its own title item (the block's props keep the flow text).
  const canvas = freeCanvas(section);
  const title = canvas ? freeTitle(canvas).replace(/\s+/g, ' ') : '';
  if (title) return title;
  const props: Props = section.props;
  const text = [props.heading, props.text, props.eyebrow].find(
    (v): v is string => typeof v === 'string' && v.trim() !== '',
  );
  return text ? text.replace(/\s+/g, ' ').trim() : blockDefinitions[section.type].label;
}
