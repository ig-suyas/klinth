import { ProjectError, assertPlainJson, migrateProject } from './migrations.ts';
import type { Project } from './schema.ts';

/** Values that look like real secrets. Checked inside every string, at any depth. */
const SECRET_VALUES: RegExp[] = [
  /AIza[0-9A-Za-z_-]{35}/, // Google / Gemini API key (39 chars)
  /\bgh[pousr]_[A-Za-z0-9]{36,}/, // GitHub classic, OAuth, user, server and refresh tokens
  /\bgithub_pat_[A-Za-z0-9_]{22,}/, // GitHub fine-grained token
];

/**
 * Field names that hold secrets. Matched as camelCase / snake / kebab words, so
 * `githubToken` and `api_key` match but `keyline`, `monkey` and `tokenize` do not.
 */
const SECRET_NAME_WORDS = new Set([
  'token',
  'secret',
  'password',
  'passphrase',
  'passwd',
  'authorization',
  'credential',
  'credentials',
]);
const SECRET_NAME_PAIRS = /(^|[^a-z])(api|gemini|access|auth|private|secret)[^a-z]*key($|[^a-z])/;

function nameWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isSecretName(name: string): boolean {
  const words = nameWords(name);
  return words.some((w) => SECRET_NAME_WORDS.has(w)) || SECRET_NAME_PAIRS.test(words.join(' '));
}

/**
 * True if `value` (a string or any JSON-like data) contains something that
 * looks like a key or token, either as a value or as a field name, at any depth.
 */
export function containsSecret(value: unknown): boolean {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current === 'string') {
      if (SECRET_VALUES.some((p) => p.test(current))) return true;
    } else if (Array.isArray(current)) {
      stack.push(...(current as unknown[]));
    } else if (typeof current === 'object' && current !== null) {
      for (const [key, child] of Object.entries(current)) {
        if (isSecretName(key)) return true;
        stack.push(child);
      }
    }
  }
  return false;
}

/** Throws a plain-language error if the project holds a key or token. Use before every save. */
export function assertNoSecrets(project: unknown): void {
  if (containsSecret(project)) {
    throw new ProjectError(
      'The project contains something that looks like a key or token, so it was not saved. Remove it and try again.',
    );
  }
}

/** Serializes a project for download / `.klinth/project.json`. Throws if a secret slipped in. */
export function serializeProject(project: Project): string {
  const valid = migrateProject(project);
  assertNoSecrets(valid);
  return `${JSON.stringify(valid, null, 2)}\n`;
}

export const MAX_PROJECT_FILE_BYTES = 5 * 1024 * 1024;

/** Parses and upgrades a project file the user imported. */
export function parseProjectFile(text: string): Project {
  // String length is a lower bound on UTF-8 bytes, so this is checked before parsing.
  if (text.length > MAX_PROJECT_FILE_BYTES) {
    throw new ProjectError('This project file is too large (over 5 MB).');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectError('This file is not a Klinth project file.');
  }
  assertPlainJson(raw);
  if (containsSecret(raw)) {
    throw new ProjectError('This project file contains something that looks like a key or token.');
  }
  return migrateProject(raw);
}
