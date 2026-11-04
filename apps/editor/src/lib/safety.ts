/**
 * Guards against losing work: projects live only in this browser, so Klinth
 * asks the browser to keep its storage, remembers when each project was last
 * backed up (downloaded or published), and reminds the user when it has been a while.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Remind again when the last backup is older than this. */
export const BACKUP_REMINDER_MS = 7 * DAY_MS;
/** Do not nag in the first minutes of a brand-new project. */
export const FIRST_REMINDER_EDITS = 15;

const backupKey = (projectId: string) => `klinth:backup:${projectId}`;

/** Records that the user now has a copy of this project outside the browser. */
export function markBackedUp(projectId: string, now = Date.now()): void {
  try {
    localStorage.setItem(backupKey(projectId), String(now));
  } catch {
    // Storage blocked: the reminder may show again, which is harmless.
  }
}

export function lastBackup(projectId: string): number | null {
  try {
    const value = Number(localStorage.getItem(backupKey(projectId)));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * True when the user should be nudged to download a backup: they have made
 * real changes, and have no backup or only an old one. A browser that promised
 * to keep Klinth's storage still gets a reminder, just less often.
 */
export function needsBackupReminder(input: {
  edits: number;
  lastBackup: number | null;
  persisted: boolean;
  now: number;
}): boolean {
  if (input.edits < FIRST_REMINDER_EDITS) return false;
  if (input.lastBackup === null) return true;
  const wait = input.persisted ? BACKUP_REMINDER_MS * 4 : BACKUP_REMINDER_MS;
  return input.now - input.lastBackup > wait;
}

/**
 * Asks the browser not to clear Klinth's storage when space runs low. Chrome
 * and Edge decide silently; Firefox may ask the user. Resolves to whether
 * storage is kept.
 */
export async function keepStorage(): Promise<boolean> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (!storage?.persist || !storage.persisted) return false;
  try {
    return (await storage.persisted()) || (await storage.persist());
  } catch {
    return false;
  }
}
