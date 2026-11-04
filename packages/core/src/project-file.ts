import { ProjectError, migrateProject } from './migrations.ts';
import type { Project } from './schema.ts';

/** Patterns of secrets that must never end up in a project file. */
const SECRET_PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z_-]{35}/, // Google / Gemini API key
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{22,}\b/, // GitHub fine-grained token
];

const SECRET_KEY_NAMES =
  /"(api[_-]?key|gemini[_-]?key|access[_-]?token|token|secret|password)"\s*:/i;

export function containsSecret(text: string): boolean {
  return SECRET_KEY_NAMES.test(text) || SECRET_PATTERNS.some((p) => p.test(text));
}

/** Serializes a project for download / `.klinth/project.json`. Throws if a secret slipped in. */
export function serializeProject(project: Project): string {
  const valid = migrateProject(project);
  const text = JSON.stringify(valid, null, 2);
  if (containsSecret(text)) {
    throw new ProjectError(
      'The project contains something that looks like a key or token. It was not saved.',
    );
  }
  return `${text}\n`;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Parses and upgrades a project file the user imported. */
export function parseProjectFile(text: string): Project {
  if (text.length > MAX_FILE_BYTES) throw new ProjectError('This project file is too large.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectError('This file is not a Klinth project file.');
  }
  const project = migrateProject(raw);
  if (containsSecret(JSON.stringify(project))) {
    throw new ProjectError('This project file contains something that looks like a key or token.');
  }
  return project;
}
