/* eslint-disable @typescript-eslint/no-non-null-assertion -- fixture indexes are known in tests */
import 'fake-indexeddb/auto';
import { sampleProject, type Project } from '@klinth/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  StorageError,
  closeStorage,
  listProjects,
  loadAssets,
  loadProject,
  loadRawProject,
  openStorage,
  saveAsset,
  saveProject,
} from './storage.ts';

/**
 * Phase 1 review: failure modes of browser storage. fake-indexeddb runs in one
 * process, so see handoff.md for what still needs a real-browser check.
 */

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;

/** Writes a record directly, bypassing all checks, like a buggy old version or a broken disk. */
async function writeRaw(record: unknown): Promise<void> {
  const db = await openStorage();
  await db.put('projects', record as never);
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await closeStorage();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('klinth');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

describe('secrets', () => {
  it('refuses to save a project holding a Gemini key or GitHub token', async () => {
    const p = clone();
    p.pages[0]!.sections[0]!.props.heading = `AIza${'x'.repeat(35)}`;
    await expect(saveProject('a', p, 0)).rejects.toThrow(/key or token/);
    const q = clone();
    q.pages[0]!.sections[0]!.props.githubToken = 'abc';
    await expect(saveProject('a', q, 0)).rejects.toThrow(/key or token/);
    expect(await loadProject('a')).toBeUndefined();
  });
});

describe('quota exceeded', () => {
  it('reports a plain error and keeps the previous save', async () => {
    const rev = await saveProject('a', clone(), 0);
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const changed = clone();
    changed.meta.title = 'Changed';
    const err = await saveProject('a', changed, rev).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageError);
    expect((err as StorageError).code).toBe('quota');
    expect((err as StorageError).message).toMatch(/full/i);
    vi.restoreAllMocks();
    expect((await loadProject('a'))?.project.meta.title).toBe(sampleProject.meta.title);
  });

  it('maps quota errors on assets too', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await expect(saveAsset('a', 'img1', new Uint8Array([1]))).rejects.toMatchObject({
      code: 'quota',
    });
  });
});

describe('storage unavailable', () => {
  it('gives a plain error when IndexedDB does not exist (some private modes)', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(listProjects()).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('gives a plain error when opening is refused, and recovers on the next try', async () => {
    const open = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    await expect(listProjects()).rejects.toMatchObject({ code: 'unavailable' });
    open.mockRestore();
    await expect(listProjects()).resolves.toEqual([]);
  });
});

describe('upgrades and other tabs', () => {
  it('lets a newer Klinth in another tab upgrade, then says to reload', async () => {
    await saveProject('a', clone(), 0);
    // Another tab opens a newer database version; this tab must step aside.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('klinth', 2);
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onblocked = () => reject(new Error('this tab blocked the upgrade'));
      req.onerror = () => reject(req.error ?? new Error('open failed'));
    });
    await expect(loadProject('a')).rejects.toMatchObject({ code: 'version' });
  });

  it('reports when an old tab blocks an upgrade, instead of hanging', async () => {
    // An old tab holds version 1 open and ignores upgrade requests.
    const old = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('klinth', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('projects', { keyPath: 'id' });
        req.result.createObjectStore('assets', { keyPath: ['projectId', 'assetId'] });
      };
      req.onsuccess = () => resolve(req.result);
    });
    await expect(openStorage(2)).rejects.toMatchObject({ code: 'blocked' });
    old.close();
  });

  it('never silently overwrites a newer save from another tab', async () => {
    const rev = await saveProject('a', clone(), 0);
    vi.resetModules();
    const tabB = await import('./storage.ts');
    const fromB = clone();
    fromB.meta.title = 'Saved in tab B';
    await tabB.saveProject('a', fromB, rev);
    await tabB.closeStorage();

    const fromA = clone();
    fromA.meta.title = 'Saved in tab A';
    await expect(saveProject('a', fromA, rev)).rejects.toMatchObject({ code: 'conflict' });
    expect((await loadProject('a'))?.project.meta.title).toBe('Saved in tab B');
  });

  it('refuses to create a project over an existing one', async () => {
    await saveProject('a', clone(), 0);
    await expect(saveProject('a', clone(), 0)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('recovers after the browser closes the connection', async () => {
    await saveProject('a', clone(), 0);
    (await openStorage()).close();
    await expect(listProjects()).resolves.toHaveLength(1);
  });
});

describe('corrupted records', () => {
  it('lists a damaged project instead of crashing, and keeps it', async () => {
    await saveProject('good', clone(), 0, 2);
    await writeRaw({ id: 'bad', updatedAt: 1, project: { nonsense: true } });
    await writeRaw({ id: 'worse', project: null });
    const list = await listProjects();
    expect(list.map((p) => [p.id, p.damaged])).toEqual([
      ['good', false],
      ['bad', true],
      ['worse', true],
    ]);
  });

  it('opening a damaged project gives a plain error, and the raw data can be rescued', async () => {
    await writeRaw({ id: 'bad', updatedAt: 1, project: { meta: { title: 'Half' } } });
    const err = await loadProject('bad').catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'damaged' });
    expect((err as Error).message).toMatch(/not been deleted/);
    expect(await loadRawProject('bad')).toEqual({ meta: { title: 'Half' } });
  });

  it('skips a damaged asset record instead of failing the whole export', async () => {
    await saveAsset('a', 'img1', new Uint8Array([1]));
    const db = await openStorage();
    await db.put('assets', { projectId: 'a', assetId: 'bad', data: 'oops' } as never);
    expect([...(await loadAssets('a')).keys()]).toEqual(['img1']);
  });
});
