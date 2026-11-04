import { migrateProject, type Project } from '@klinth/core';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/** Browser-only persistence: projects and their media live in IndexedDB. */

interface KlinthDB extends DBSchema {
  projects: { key: string; value: { id: string; updatedAt: number; project: Project } };
  assets: {
    key: [string, string];
    value: { projectId: string; assetId: string; data: Uint8Array };
  };
}

export interface ProjectSummary {
  id: string;
  title: string;
  updatedAt: number;
}

const DB_NAME = 'klinth';

let dbPromise: Promise<IDBPDatabase<KlinthDB>> | undefined;

function db(): Promise<IDBPDatabase<KlinthDB>> {
  dbPromise ??= openDB<KlinthDB>(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore('projects', { keyPath: 'id' });
      database.createObjectStore('assets', { keyPath: ['projectId', 'assetId'] });
    },
  });
  return dbPromise;
}

export async function saveProject(id: string, project: Project, now = Date.now()): Promise<void> {
  const valid = migrateProject(project);
  await (await db()).put('projects', { id, updatedAt: now, project: valid });
}

/** Loads a project, upgrading it if it was saved by an older Klinth. */
export async function loadProject(id: string): Promise<Project | undefined> {
  const row = await (await db()).get('projects', id);
  return row ? migrateProject(row.project) : undefined;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const rows = await (await db()).getAll('projects');
  return rows
    .map((r) => ({ id: r.id, title: r.project.meta.title, updatedAt: r.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** All asset keys [projectId, *] of one project. */
function projectRange(projectId: string): IDBKeyRange {
  return IDBKeyRange.bound([projectId, ''], [projectId, '￿']);
}

export async function deleteProject(id: string): Promise<void> {
  const tx = (await db()).transaction(['projects', 'assets'], 'readwrite');
  await tx.objectStore('projects').delete(id);
  const assets = tx.objectStore('assets');
  for (const key of await assets.getAllKeys(projectRange(id))) {
    await assets.delete(key);
  }
  await tx.done;
}

export async function saveAsset(
  projectId: string,
  assetId: string,
  data: Uint8Array,
): Promise<void> {
  await (await db()).put('assets', { projectId, assetId, data });
}

/** Returns every asset binary of a project, ready for `buildExport`. */
export async function loadAssets(projectId: string): Promise<Map<string, Uint8Array>> {
  const rows = await (await db()).getAll('assets', projectRange(projectId));
  return new Map(rows.map((r) => [r.assetId, r.data]));
}

/** Test helper: closes and forgets the open connection. */
export async function closeStorage(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = undefined;
}
