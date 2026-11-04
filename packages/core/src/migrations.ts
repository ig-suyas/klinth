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
};

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
