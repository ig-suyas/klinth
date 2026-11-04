import 'fake-indexeddb/auto';
import { sampleProject } from '@klinth/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeStorage,
  deleteProject,
  listProjects,
  loadAsset,
  loadAssets,
  loadProject,
  onStorageModeChange,
  pruneAssets,
  resetLocalData,
  resetStorageModeForTests,
  saveAsset,
  saveProject,
  storageInMemory,
} from './storage.ts';

const realIndexedDB = globalThis.indexedDB;

/** What a private window or a profile with storage turned off does. */
function blockIndexedDB(): void {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    get() {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    },
  });
}

beforeEach(async () => {
  await closeStorage();
  resetStorageModeForTests();
});

afterEach(async () => {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    writable: true,
    value: realIndexedDB,
  });
  resetStorageModeForTests();
  await closeStorage();
  indexedDB.deleteDatabase('klinth');
});

describe('storage without IndexedDB', () => {
  it('falls back to memory instead of failing, and says so once', async () => {
    blockIndexedDB();
    const listener = vi.fn();
    const stop = onStorageModeChange(listener);
    expect(storageInMemory()).toBe(false);
    expect(await listProjects()).toEqual([]);
    expect(storageInMemory()).toBe(true);
    await listProjects();
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it('saves, loads, lists and deletes projects and files in memory', async () => {
    blockIndexedDB();
    expect(await saveProject('a', sampleProject, 0, 1)).toBe(1);
    expect(await saveProject('a', sampleProject, 1, 2)).toBe(2);
    expect(await loadProject('a')).toEqual({ project: sampleProject, revision: 2 });
    expect((await listProjects()).map((p) => p.id)).toEqual(['a']);
    await saveAsset('a', 'img', new Uint8Array([1, 2]), 0);
    expect(Array.from((await loadAsset('a', 'img')) ?? [])).toEqual([1, 2]);
    expect([...(await loadAssets('a')).keys()]).toEqual(['img']);
    expect(await pruneAssets('a', new Set(), 0)).toBe(0);
    expect(await pruneAssets('a', new Set(), 2 * 24 * 60 * 60 * 1000)).toBe(1);
    await deleteProject('a');
    expect(await loadProject('a')).toBeUndefined();
  });

  it('still refuses a stale save in memory', async () => {
    blockIndexedDB();
    await saveProject('a', sampleProject, 0);
    await expect(saveProject('a', sampleProject, 0)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('keeps the memory copy apart from the editor state', async () => {
    blockIndexedDB();
    const project = structuredClone(sampleProject);
    await saveProject('a', project, 0);
    project.meta.title = 'Changed after saving';
    expect((await loadProject('a'))?.project.meta.title).toBe(sampleProject.meta.title);
  });

  it('does not fall back when IndexedDB works', async () => {
    await saveProject('a', sampleProject, 0);
    expect(storageInMemory()).toBe(false);
  });
});

describe('resetLocalData', () => {
  it('deletes saved projects and Klinth settings, and leaves other keys', async () => {
    await saveProject('a', sampleProject, 0);
    localStorage.setItem('klinth:last-project', 'a');
    localStorage.setItem('klinth.siteStyle.open', '{}');
    localStorage.setItem('someone-else', 'keep');
    await resetLocalData();
    expect(await listProjects()).toEqual([]);
    expect(localStorage.getItem('klinth:last-project')).toBeNull();
    expect(localStorage.getItem('klinth.siteStyle.open')).toBeNull();
    expect(localStorage.getItem('someone-else')).toBe('keep');
    localStorage.clear();
  });

  it('never throws when storage is blocked', async () => {
    blockIndexedDB();
    await expect(resetLocalData()).resolves.toBeUndefined();
  });
});
