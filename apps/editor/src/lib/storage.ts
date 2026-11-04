import { ProjectError, assertNoSecrets, migrateProject, type Project } from '@klinth/core';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * Browser-only persistence: projects and their media live in IndexedDB.
 * Every failure surfaces as a StorageError with a plain message, so the editor
 * can tell the user instead of losing work silently.
 */

interface ProjectRecord {
  id: string;
  updatedAt: number;
  /** Goes up by one on every save; guards against two tabs overwriting each other. */
  revision: number;
  project: Project;
}

interface AssetRecord {
  projectId: string;
  assetId: string;
  data: Uint8Array;
  /** When the file was stored. Older records may not have it. */
  savedAt?: number;
}

interface KlinthDB extends DBSchema {
  projects: { key: string; value: ProjectRecord };
  assets: {
    key: [string, string];
    value: AssetRecord;
  };
}

export interface ProjectSummary {
  id: string;
  title: string;
  updatedAt: number;
  /** True if the saved record cannot be read; it is kept so it can be rescued. */
  damaged: boolean;
}

export type StorageErrorCode =
  'unavailable' | 'quota' | 'blocked' | 'version' | 'conflict' | 'damaged' | 'unknown';

const MESSAGES: Record<StorageErrorCode, string> = {
  unavailable:
    'Your browser is not letting Klinth save here (this happens in some private windows). Download your project file to keep your work.',
  quota:
    'Your browser storage is full, so this change was not saved. Download your project file, then remove large videos or old projects.',
  blocked: 'Klinth is open in another tab. Close the other Klinth tabs, then reload this page.',
  version:
    'Klinth was updated in another tab. Reload this page to keep editing. Your last change here was not saved.',
  conflict:
    'This project was changed in another tab. Reload to see the latest version. Your change here was not saved.',
  damaged:
    'This saved project is damaged and cannot be opened. It has not been deleted, so it can still be rescued.',
  unknown:
    'Klinth could not use your browser storage. Download your project file to keep your work.',
};

export class StorageError extends Error {
  override name = 'StorageError';
  constructor(
    readonly code: StorageErrorCode,
    options?: { cause?: unknown },
  ) {
    super(MESSAGES[code], options);
  }
}

const DB_NAME = 'klinth';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<KlinthDB>> | undefined;

function toStorageError(error: unknown): Error {
  if (error instanceof StorageError || error instanceof ProjectError) return error;
  // DOMExceptions from another realm (jsdom, workers) are not `instanceof Error`.
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  const code: StorageErrorCode =
    name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
      ? 'quota'
      : name === 'VersionError'
        ? 'version'
        : name === 'SecurityError' || name === 'InvalidStateError'
          ? 'unavailable'
          : 'unknown';
  return new StorageError(code, { cause: error });
}

/**
 * Opens the database. Exported for tests; app code uses the functions below.
 * Rejects with `blocked` instead of hanging when an old tab refuses an upgrade.
 */
export function openStorage(version = DB_VERSION): Promise<IDBPDatabase<KlinthDB>> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new StorageError('unavailable'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(toStorageError(error));
    };
    let opening: Promise<IDBPDatabase<KlinthDB>>;
    try {
      opening = openDB<KlinthDB>(DB_NAME, version, {
        upgrade(database, oldVersion) {
          if (oldVersion < 1) {
            database.createObjectStore('projects', { keyPath: 'id' });
            database.createObjectStore('assets', { keyPath: ['projectId', 'assetId'] });
          }
        },
        blocked: () => fail(new StorageError('blocked')),
        // A newer Klinth in another tab wants to upgrade: step aside. The next
        // call reopens and reports `version`, so nothing is lost silently.
        blocking: (_current, _next, event) => {
          (event.target as IDBDatabase).close();
          dbPromise = undefined;
        },
        // The browser closed the connection (storage cleared, crash): reopen next time.
        terminated: () => {
          dbPromise = undefined;
        },
      });
    } catch (error) {
      fail(error);
      return;
    }
    opening.then((database) => {
      // Opened after we already reported `blocked`: do not leak the connection.
      if (settled) database.close();
      else {
        settled = true;
        resolve(database);
      }
    }, fail);
  });
}

function db(): Promise<IDBPDatabase<KlinthDB>> {
  if (!dbPromise) {
    const opening = openStorage();
    dbPromise = opening;
    // Never cache a failure: the next call tries again.
    opening.catch(() => {
      if (dbPromise === opening) dbPromise = undefined;
    });
  }
  return dbPromise;
}

/** Runs a storage operation and turns any failure into a StorageError. */
async function run<T>(operation: (database: IDBPDatabase<KlinthDB>) => Promise<T>): Promise<T> {
  try {
    return await operation(await db());
  } catch (error) {
    throw toStorageError(error);
  }
}

/**
 * Saves a project. `baseRevision` is the revision this tab last loaded or saved
 * (0 for a new project). If another tab saved in between, nothing is written and
 * a `conflict` error is thrown. Returns the new revision.
 */
export async function saveProject(
  id: string,
  project: Project,
  baseRevision: number,
  now = Date.now(),
): Promise<number> {
  // Secrets first: a clear "key or token" message beats a generic validation error.
  assertNoSecrets(project);
  const valid = migrateProject(project);
  return run(async (database) => {
    const tx = database.transaction('projects', 'readwrite');
    const current = await tx.store.get(id);
    const currentRevision = current ? revisionOf(current) : 0;
    if (currentRevision !== baseRevision) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw new StorageError('conflict');
    }
    const revision = baseRevision + 1;
    await tx.store.put({ id, updatedAt: now, revision, project: valid });
    await tx.done;
    return revision;
  });
}

function revisionOf(record: ProjectRecord): number {
  return typeof record.revision === 'number' ? record.revision : 0;
}

/** Loads a project, upgrading it if it was saved by an older Klinth. */
export async function loadProject(
  id: string,
): Promise<{ project: Project; revision: number } | undefined> {
  const record = await run((database) => database.get('projects', id));
  if (!record) return undefined;
  try {
    return { project: migrateProject(record.project), revision: revisionOf(record) };
  } catch (error) {
    throw new StorageError('damaged', { cause: error });
  }
}

/** Returns a saved project's data exactly as stored, to rescue a damaged one. */
export async function loadRawProject(id: string): Promise<unknown> {
  return (await run((database) => database.get('projects', id)))?.project;
}

function summarize(record: ProjectRecord): ProjectSummary {
  const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : 0;
  try {
    return {
      id: record.id,
      title: migrateProject(record.project).meta.title,
      updatedAt,
      damaged: false,
    };
  } catch {
    return { id: record.id, title: 'Damaged project', updatedAt, damaged: true };
  }
}

/** Lists saved projects, newest first. Damaged ones are listed, not hidden. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const records = await run((database) => database.getAll('projects'));
  return records.map(summarize).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** All asset keys [projectId, *] of one project. */
function projectRange(projectId: string): IDBKeyRange {
  return IDBKeyRange.bound([projectId, ''], [projectId, String.fromCharCode(0xffff)]);
}

export async function deleteProject(id: string): Promise<void> {
  await run(async (database) => {
    const tx = database.transaction(['projects', 'assets'], 'readwrite');
    await tx.objectStore('projects').delete(id);
    await tx.objectStore('assets').delete(projectRange(id));
    await tx.done;
  });
}

export async function saveAsset(
  projectId: string,
  assetId: string,
  data: Uint8Array,
  now = Date.now(),
): Promise<void> {
  await run((database) => database.put('assets', { projectId, assetId, data, savedAt: now }));
}

const asBytes = (data: unknown): Uint8Array | undefined =>
  // `ArrayBuffer.isView` works across realms, unlike `instanceof Uint8Array`.
  ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : undefined;

/** One file's bytes, or undefined if it is not stored (or damaged). */
export async function loadAsset(
  projectId: string,
  assetId: string,
): Promise<Uint8Array | undefined> {
  const row = await run((database) => database.get('assets', [projectId, assetId]));
  return row ? asBytes(row.data) : undefined;
}

/** Files are kept this long after upload even when unused, so another open tab cannot lose them. */
export const PRUNE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes stored files the project no longer lists (deleted, or uploads that
 * were undone). Recent uploads are kept for a day in case another tab still
 * needs them. Returns how many were deleted.
 */
export async function pruneAssets(
  projectId: string,
  keep: ReadonlySet<string>,
  now = Date.now(),
): Promise<number> {
  return run(async (database) => {
    const tx = database.transaction('assets', 'readwrite');
    let removed = 0;
    let cursor = await tx.store.openCursor(projectRange(projectId));
    while (cursor) {
      const { assetId, savedAt } = cursor.value;
      const old = typeof savedAt !== 'number' || now - savedAt > PRUNE_AFTER_MS;
      if (!keep.has(assetId) && old) {
        await cursor.delete();
        removed += 1;
      }
      cursor = await cursor.continue();
    }
    await tx.done;
    return removed;
  });
}

/** Returns every asset binary of a project, ready for `buildExport`. Skips damaged records. */
export async function loadAssets(projectId: string): Promise<Map<string, Uint8Array>> {
  const rows = await run((database) => database.getAll('assets', projectRange(projectId)));
  const assets = new Map<string, Uint8Array>();
  for (const { assetId, data } of rows) {
    const bytes = asBytes(data);
    if (bytes) assets.set(assetId, bytes);
  }
  return assets;
}

/** Closes and forgets the open connection (tests, and before deleting the database). */
export async function closeStorage(): Promise<void> {
  const current = dbPromise;
  dbPromise = undefined;
  if (current) (await current.catch(() => undefined))?.close();
}
