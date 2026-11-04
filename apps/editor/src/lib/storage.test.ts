import 'fake-indexeddb/auto';
import { sampleProject } from '@klinth/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeStorage,
  deleteProject,
  listProjects,
  loadAssets,
  loadProject,
  saveAsset,
  saveProject,
} from './storage.ts';

afterEach(async () => {
  await closeStorage();
  indexedDB.deleteDatabase('klinth');
});

describe('storage', () => {
  it('saves, loads and lists projects newest first', async () => {
    await saveProject('a', sampleProject, 1);
    await saveProject('b', { ...sampleProject, meta: { ...sampleProject.meta, title: 'B' } }, 2);
    expect(await loadProject('a')).toEqual(sampleProject);
    expect((await listProjects()).map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('refuses to save an invalid project', async () => {
    await expect(saveProject('x', { ...sampleProject, pages: [] })).rejects.toThrow();
  });

  it('stores assets per project and deletes them with the project', async () => {
    await saveProject('a', sampleProject);
    await saveAsset('a', 'img1', new Uint8Array([9, 8]));
    await saveAsset('b', 'img1', new Uint8Array([7]));
    expect(Array.from((await loadAssets('a')).get('img1') ?? [])).toEqual([9, 8]);
    await deleteProject('a');
    expect(await loadProject('a')).toBeUndefined();
    expect((await loadAssets('a')).size).toBe(0);
    expect((await loadAssets('b')).size).toBe(1);
  });
});
