import { SCHEMA_VERSION, projectSchema, type Project } from './schema.ts';

type Migration = (input: Record<string, unknown>) => Record<string, unknown>;

/**
 * MIGRATIONS[n] upgrades a project from version n to n + 1.
 * Add an entry here every time SCHEMA_VERSION goes up.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

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
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
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
    data = { ...step(data), schemaVersion: version + 1 };
    version += 1;
  }
  return data;
}

/** Upgrades any older project to the current version and validates it. */
export function migrateProject(input: unknown): Project {
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
