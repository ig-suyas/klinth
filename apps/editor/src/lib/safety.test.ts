import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKUP_REMINDER_MS,
  FIRST_REMINDER_EDITS,
  keepStorage,
  lastBackup,
  markBackedUp,
  needsBackupReminder,
} from './safety.ts';

const NOW = 1_800_000_000_000;

describe('backup reminder', () => {
  beforeEach(() => localStorage.clear());

  it('waits for real changes before reminding', () => {
    const base = { lastBackup: null, persisted: false, now: NOW };
    expect(needsBackupReminder({ ...base, edits: FIRST_REMINDER_EDITS - 1 })).toBe(false);
    expect(needsBackupReminder({ ...base, edits: FIRST_REMINDER_EDITS })).toBe(true);
  });

  it('reminds again once the last backup is a week old, less often when storage is kept', () => {
    const edits = FIRST_REMINDER_EDITS;
    const fresh = NOW - BACKUP_REMINDER_MS + 1000;
    const old = NOW - BACKUP_REMINDER_MS - 1000;
    expect(needsBackupReminder({ edits, lastBackup: fresh, persisted: false, now: NOW })).toBe(
      false,
    );
    expect(needsBackupReminder({ edits, lastBackup: old, persisted: false, now: NOW })).toBe(true);
    expect(needsBackupReminder({ edits, lastBackup: old, persisted: true, now: NOW })).toBe(false);
  });

  it('remembers backups per project and ignores junk values', () => {
    markBackedUp('a', NOW);
    expect(lastBackup('a')).toBe(NOW);
    expect(lastBackup('b')).toBeNull();
    localStorage.setItem('klinth:backup:c', 'nonsense');
    expect(lastBackup('c')).toBeNull();
  });
});

describe('keepStorage', () => {
  it('asks only when storage is not kept yet, and never throws', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const persisted = vi.fn().mockResolvedValue(false);
    vi.stubGlobal('navigator', { storage: { persist, persisted } });
    expect(await keepStorage()).toBe(true);
    expect(persist).toHaveBeenCalledOnce();

    persisted.mockResolvedValue(true);
    persist.mockClear();
    expect(await keepStorage()).toBe(true);
    expect(persist).not.toHaveBeenCalled();

    persisted.mockRejectedValue(new Error('no'));
    expect(await keepStorage()).toBe(false);

    vi.stubGlobal('navigator', {});
    expect(await keepStorage()).toBe(false);
    vi.unstubAllGlobals();
  });
});
