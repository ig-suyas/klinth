import 'fake-indexeddb/auto';
import { sampleProject } from '@klinth/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeStorage,
  deleteProject,
  listProjects,
  PRUNE_AFTER_MS,
  loadAsset,
  loadAssets,
  loadProject,
  pruneAssets,
  saveAsset,
  saveProject,
} from './storage.ts';

afterEach(async () => {
  await closeStorage();
  indexedDB.deleteDatabase('klinth');
});

describe('storage', () => {
  it('saves, loads and lists projects newest first', async () => {
    await saveProject('a', sampleProject, 0, 1);
    await saveProject('b', { ...sampleProject, meta: { ...sampleProject.meta, title: 'B' } }, 0, 2);
    expect(await loadProject('a')).toEqual({ project: sampleProject, revision: 1 });
    expect((await listProjects()).map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('refuses to save an invalid project', async () => {
    await expect(saveProject('x', { ...sampleProject, pages: [] }, 0)).rejects.toThrow();
  });

  it('stores assets per project and deletes them with the project', async () => {
    await saveProject('a', sampleProject, 0);
    await saveAsset('a', 'img1', new Uint8Array([9, 8]));
    await saveAsset('b', 'img1', new Uint8Array([7]));
    expect(Array.from((await loadAssets('a')).get('img1') ?? [])).toEqual([9, 8]);
    await deleteProject('a');
    expect(await loadProject('a')).toBeUndefined();
    expect((await loadAssets('a')).size).toBe(0);
    expect((await loadAssets('b')).size).toBe(1);
  });

  it('loads one file, and prunes only old files the project no longer lists', async () => {
    const day = PRUNE_AFTER_MS;
    await saveAsset('a', 'keep', new Uint8Array([1]), 0);
    await saveAsset('a', 'old', new Uint8Array([2]), 0);
    await saveAsset('a', 'fresh', new Uint8Array([3]), day * 3);
    await saveAsset('b', 'old', new Uint8Array([4]), 0);
    expect(Array.from((await loadAsset('a', 'old')) ?? [])).toEqual([2]);
    expect(await loadAsset('a', 'missing')).toBeUndefined();
    expect(await pruneAssets('a', new Set(['keep']), day * 3 + 1)).toBe(1);
    expect([...(await loadAssets('a')).keys()].sort()).toEqual(['fresh', 'keep']);
    // Other projects are never touched.
    expect((await loadAssets('b')).size).toBe(1);
  });
});
