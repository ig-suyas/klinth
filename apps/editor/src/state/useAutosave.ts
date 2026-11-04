import { useEffect } from 'react';
import { saveProject, StorageError } from '../lib/storage.ts';
import { useEditor } from './store.ts';

/** Saves this long after the last change. */
export const AUTOSAVE_MS = 700;
const CHANNEL = 'klinth-saves';

interface SavedMessage {
  id: string;
  revision: number;
}

const isSavedMessage = (v: unknown): v is SavedMessage =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as SavedMessage).id === 'string' &&
  typeof (v as SavedMessage).revision === 'number';

let timer: ReturnType<typeof setTimeout> | undefined;
/** Saves run one after another, so each one starts from the revision the last one wrote. */
let queue: Promise<void> = Promise.resolve();
let channel: BroadcastChannel | null = null;

async function saveNow(): Promise<void> {
  const { projectId, project, revision, save, setSave, setRevision } = useEditor.getState();
  if (!projectId || !project || save.status !== 'unsaved') return;
  setSave('saving');
  try {
    const next = await saveProject(projectId, project, revision);
    setRevision(next);
    channel?.postMessage({ id: projectId, revision: next } satisfies SavedMessage);
    // Only "Saved" if nothing changed while saving; otherwise the next save is already queued.
    if (useEditor.getState().project === project) setSave('saved');
    else setSave('unsaved');
  } catch (error) {
    setSave('error', error instanceof Error ? error.message : String(error));
  }
}

/** Saves any pending change now. Resolves when every queued save is done. */
export function flushSave(): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  queue = queue.then(saveNow);
  return queue;
}

/**
 * Saves the open project to the browser shortly after every change. Tells
 * other tabs about each save, and stops this tab from overwriting a newer
 * save made in another tab.
 */
export function useAutosave(): void {
  useEffect(() => {
    channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
    channel?.addEventListener('message', (event: MessageEvent<unknown>) => {
      const { projectId, revision, setSave } = useEditor.getState();
      if (!isSavedMessage(event.data) || event.data.id !== projectId) return;
      if (event.data.revision > revision) setSave('error', new StorageError('conflict').message);
    });

    const unsubscribe = useEditor.subscribe((state, previous) => {
      if (state.project === previous.project || state.save.status !== 'unsaved') return;
      clearTimeout(timer);
      timer = setTimeout(() => void flushSave(), AUTOSAVE_MS);
    });

    const warn = (event: BeforeUnloadEvent) => {
      const { status } = useEditor.getState().save;
      // `error`: the last change could not be stored, so leaving would lose it.
      if (status === 'unsaved' || status === 'saving' || status === 'error') event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);

    return () => {
      clearTimeout(timer);
      unsubscribe();
      channel?.close();
      channel = null;
      window.removeEventListener('beforeunload', warn);
    };
  }, []);
}
