// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  PBKDF2_ITERATIONS,
  VAULT_STORAGE_KEY,
  VaultError,
  forgetVault,
  openVault,
  readVault,
  sealKey,
  writeVault,
} from './vault.ts';

const KEY = 'AIzaSyTestKey_0123456789abcdefghijk';
const PASS = 'correct horse battery';

function memoryStore() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe('key vault', () => {
  it('locks and unlocks the key, storing only ciphertext, salt and IV', async () => {
    const store = memoryStore();
    const record = await sealKey(KEY, PASS);
    writeVault(record, store);
    const raw = store.map.get(VAULT_STORAGE_KEY) ?? '';
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['data', 'iterations', 'iv', 'salt', 'v']);
    expect(raw).not.toContain(KEY);
    expect(raw).not.toContain(PASS);
    expect(record.iterations).toBeGreaterThanOrEqual(600_000);

    const saved = readVault(store);
    if (!saved) throw new Error('vault not saved');
    expect(await openVault(saved, PASS)).toBe(KEY);
  });

  it('uses a fresh salt and IV every time', async () => {
    const a = await sealKey(KEY, PASS);
    const b = await sealKey(KEY, PASS);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it('refuses a wrong passphrase and changed data', async () => {
    const record = await sealKey(KEY, PASS);
    await expect(openVault(record, 'wrong passphrase')).rejects.toBeInstanceOf(VaultError);
    const flipped = {
      ...record,
      data: record.data.startsWith('A') ? `B${record.data.slice(1)}` : `A${record.data.slice(1)}`,
    };
    await expect(openVault(flipped, PASS)).rejects.toBeInstanceOf(VaultError);
  });

  it('refuses short passphrases and records that lower the cost', async () => {
    await expect(sealKey(KEY, 'short')).rejects.toBeInstanceOf(VaultError);
    const record = await sealKey(KEY, PASS);
    const store = memoryStore();
    store.setItem(VAULT_STORAGE_KEY, JSON.stringify({ ...record, iterations: 1000 }));
    expect(readVault(store)).toBeNull();
    await expect(openVault({ ...record, iterations: 1000 }, PASS)).rejects.toThrow();
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });

  it('ignores damaged storage and forgets on request', async () => {
    const store = memoryStore();
    store.setItem(VAULT_STORAGE_KEY, '{not json');
    expect(readVault(store)).toBeNull();
    writeVault(await sealKey(KEY, PASS), store);
    forgetVault(store);
    expect(store.map.size).toBe(0);
  });
});
