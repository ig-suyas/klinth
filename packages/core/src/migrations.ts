import { SCHEMA_VERSION, projectSchema, type Project } from './schema.ts';

type Migration = (input: Record<string, unknown>) => Record<string, unknown>;

/**
 * MIGRATIONS[n] upgrades a project from version n to n + 1.
 * Add an entry here every time SCHEMA_VERSION goes up.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // 1 -> 2: header styles and theme presets. Old sites keep the top bar.
  1: (data) => ({
    ...data,
    meta: isRecord(data.meta) ? { headerStyle: 'bar', ...data.meta } : data.meta,
  }),
  // 2 -> 3: the header can be removed (site-wide or per page). Old sites keep it.
  2: (data) => ({
    ...data,
    meta: isRecord(data.meta) ? { headerEnabled: true, ...data.meta } : data.meta,
  }),
  // 3 -> 4: sections can carry animation settings (optional). Older files have none, so
  // nothing changes; the new version stops older editors from dropping the settings.
  3: (data) => ({ ...data }),
  // 4 -> 5: sections can be laid out freely (`layout: 'free'` + `canvas`). Older files are all
  // flow, so nothing changes; the new version stops older editors from dropping free sections.
  4: (data) => ({ ...data }),
  // 5 -> 6: text wraps naturally. Hard line breaks in headings (flow and free) and inside
  // free text become spaces; blank lines between free body paragraphs stay. Only
  // whitespace changes, and anything with an unexpected shape is left for validation.
  5: (data) => (Array.isArray(data.pages) ? { ...data, pages: data.pages.map(unbreakPage) } : data),
  // 6 -> 7: footer alignment, offset and padding, and switches for "Back to top" (site-wide
  // and per page). All optional; absent means the old footer, so nothing changes. The new
  // version stops older editors from dropping the settings.
  6: (data) => ({ ...data }),
  // 7 -> 8: video look and layouts (several videos per section), the spacer's height in px
  // and the blank canvas section. All optional or new; older files have none, so nothing
  // changes. The new version stops older editors from dropping them.
  7: (data) => ({ ...data }),
  // 8 -> 9: rotating headline, picture stack, numbered steps, quote marquee and giant text
  // sections, and glass cards, folding and decorative shapes on existing sections. All new
  // or optional; older files have none, so nothing changes. The new version stops older
  // editors from dropping them.
  8: (data) => ({ ...data }),
};

/** Single line breaks (and the spaces around them) become one space. */
const joinLines = (text: string): string => text.replace(/[ \t]*\r?\n[ \t\r\n]*/g, ' ').trim();
/** Paragraphs (blank lines) stay; line breaks inside a paragraph become spaces. */
const joinInParagraphs = (text: string): string =>
  text
    .split(/\r?\n[ \t]*\r?\n\s*/)
    .map(joinLines)
    .filter(Boolean)
    .join('\n\n');

function unbreakPage(page: unknown): unknown {
  if (!isRecord(page) || !Array.isArray(page.sections)) return page;
  return { ...page, sections: page.sections.map(unbreakSection) };
}

function unbreakSection(section: unknown): unknown {
  if (!isRecord(section)) return section;
  let next = section;
  const props = section.props;
  if (isRecord(props) && typeof props.heading === 'string' && props.heading.includes('\n')) {
    next = { ...next, props: { ...props, heading: joinLines(props.heading) } };
  }
  const canvas = section.canvas;
  if (isRecord(canvas) && Array.isArray(canvas.items)) {
    const items = canvas.items.map((item: unknown) => {
      if (!isRecord(item) || item.type !== 'text' || typeof item.text !== 'string') return item;
      if (!item.text.includes('\n')) return item;
      const text = item.style === 'body' ? joinInParagraphs(item.text) : joinLines(item.text);
      // Never empty a text (the schema needs one character); keep the original then.
      return text ? { ...item, text } : item;
    });
    next = { ...next, canvas: { ...canvas, items } };
  }
  return next;
}

export class ProjectError extends Error {
  override name = 'ProjectError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Applies migration steps until `data` reaches `target`. Pure; validation happens after. */
export function runMigrations(
  input: unknown,
  target: number,
  migrations: Readonly<Record<number, Migration>>,
): Record<string, unknown> {
  if (!isRecord(input)) throw new ProjectError('This is not a Klinth project file.');
  let data = input;
  let version = data.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    throw new ProjectError('This project file has no valid version.');
  }
  if (version > target) {
    throw new ProjectError(
      'This project was made with a newer Klinth. Reload the page and try again.',
    );
  }
  while (version < target) {
    const step = migrations[version];
    if (!step) throw new ProjectError(`Cannot upgrade a project from version ${version}.`);
    let next: unknown;
    try {
      next = step(data);
    } catch {
      throw new ProjectError(`This project could not be upgraded from version ${version}.`);
    }
    if (!isRecord(next)) {
      throw new ProjectError(`This project could not be upgraded from version ${version}.`);
    }
    data = { ...next, schemaVersion: version + 1 };
    version += 1;
  }
  return data;
}

/** Deepest nesting a real project needs is about 8; leave headroom. */
export const MAX_DEPTH = 16;

/**
 * Zod silently drops a `__proto__` field instead of rejecting it, so such
 * keys are refused here, before validation, together with the other two
 * names that can reach object prototypes.
 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Rejects data nested deeper than MAX_DEPTH or using prototype keys. Walks
 * without recursion so hostile input cannot overflow the stack.
 */
export function assertPlainJson(value: unknown): void {
  const stack: [unknown, number][] = [[value, 0]];
  while (stack.length > 0) {
    const [current, depth] = stack.pop() as [unknown, number];
    if (typeof current !== 'object' || current === null) continue;
    if (depth + 1 > MAX_DEPTH) {
      throw new ProjectError('This project file is too deeply nested to be a Klinth project.');
    }
    for (const [key, child] of Object.entries(current)) {
      if (UNSAFE_KEYS.has(key)) {
        throw new ProjectError(`This project file uses a field name that is not allowed (${key}).`);
      }
      stack.push([child, depth + 1]);
    }
  }
}

/** Upgrades any older project to the current version and validates it. */
export function migrateProject(input: unknown): Project {
  assertPlainJson(input);
  const data = runMigrations(input, SCHEMA_VERSION, MIGRATIONS);
  const result = projectSchema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.join('.') || 'project';
    throw new ProjectError(
      `This project file is damaged (${where}: ${first?.message ?? 'invalid'}).`,
    );
  }
  return result.data;
}
