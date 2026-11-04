import { create } from 'zustand';
import { forgetVault, readVault } from './vault.ts';

/**
 * AI helper state. The unlocked key lives only here, in memory: never in the
 * project, IndexedDB, URLs or logs. Closing or reloading the tab forgets it.
 */

export const AUTO_LOCK_MS = 30 * 60 * 1000;
const AUTO_LOCK_PREF = 'klinth.ai.autolock';

function readAutoLock(): boolean {
  try {
    return window.localStorage.getItem(AUTO_LOCK_PREF) !== 'off';
  } catch {
    return true;
  }
}

interface AiState {
  /** The unlocked key, or null. */
  key: string | null;
  /** A locked key is saved in this browser. */
  saved: boolean;
  autoLock: boolean;
  lastUsed: number;
  /** Gemini said the user's daily limit is used up. Shows the banner. */
  quotaHit: boolean;
  /** Section whose AI helper is open in the inspector. */
  panelFor: string | null;
  settingsOpen: boolean;

  unlock: (key: string, saved: boolean) => void;
  lock: () => void;
  forget: () => void;
  touch: () => void;
  setAutoLock: (on: boolean) => void;
  setQuotaHit: (hit: boolean) => void;
  openPanel: (sectionId: string | null) => void;
  openSettings: (open: boolean) => void;
}

export const useAi = create<AiState>()((set) => ({
  key: null,
  saved: readVault() !== null,
  autoLock: readAutoLock(),
  lastUsed: 0,
  quotaHit: false,
  panelFor: null,
  settingsOpen: false,

  unlock: (key, saved) => set({ key, saved, lastUsed: Date.now() }),
  lock: () => set({ key: null }),
  forget: () => {
    forgetVault();
    set({ key: null, saved: false });
  },
  touch: () => set({ lastUsed: Date.now() }),
  setAutoLock: (on) => {
    try {
      window.localStorage.setItem(AUTO_LOCK_PREF, on ? 'on' : 'off');
    } catch {
      // The setting lasts for this tab only.
    }
    set({ autoLock: on, lastUsed: Date.now() });
  },
  setQuotaHit: (hit) => set({ quotaHit: hit }),
  openPanel: (sectionId) => set({ panelFor: sectionId }),
  openSettings: (open) => set({ settingsOpen: open }),
}));

/** True when the key should lock itself now. */
export function shouldAutoLock(
  state: Pick<AiState, 'key' | 'autoLock' | 'lastUsed'>,
  now: number,
): boolean {
  return Boolean(state.key) && state.autoLock && now - state.lastUsed > AUTO_LOCK_MS;
}
