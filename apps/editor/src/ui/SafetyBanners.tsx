import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { downloadProjectFile } from '../lib/files.ts';
import { keepStorage, lastBackup, markBackedUp, needsBackupReminder } from '../lib/safety.ts';
import { onStorageModeChange, storageInMemory } from '../lib/storage.ts';
import { useEditor } from '../state/store.ts';
import { Icon } from './Icon.tsx';

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Whether the browser thinks it is online. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** True when the browser refused storage and this tab keeps the work in memory only. */
export function useStorageInMemory(): boolean {
  return useSyncExternalStore(onStorageModeChange, storageInMemory, () => false);
}

/** Counts changes to the open project and keeps the browser from clearing Klinth's storage. */
function useEditsAndStorage(): { edits: number; at: number; persisted: boolean } {
  const projectId = useEditor((s) => s.projectId);
  const [count, setCount] = useState({ id: projectId, edits: 0, at: 0 });
  const [persisted, setPersisted] = useState(false);

  useEffect(
    () =>
      useEditor.subscribe((state, previous) => {
        if (state.project === previous.project || !state.projectId) return;
        const id = state.projectId;
        setCount((c) => ({ id, edits: c.id === id ? c.edits + 1 : 1, at: Date.now() }));
      }),
    [],
  );

  useEffect(() => {
    let live = true;
    void keepStorage().then((kept) => live && setPersisted(kept));
    return () => {
      live = false;
    };
  }, []);

  return { edits: count.id === projectId ? count.edits : 0, at: count.at, persisted };
}

/**
 * Banners over the preview that protect the user's work: one when the internet
 * is gone (editing and saving still work), one reminding them to keep a backup.
 */
export function SafetyBanners() {
  const online = useOnline();
  const inMemory = useStorageInMemory();
  const projectId = useEditor((s) => s.projectId);
  const { edits, at, persisted } = useEditsAndStorage();
  const [hidden, setHidden] = useState<string | null>(null);
  const reduce = useReducedMotion();

  const remind =
    !inMemory &&
    projectId !== null &&
    hidden !== projectId &&
    needsBackupReminder({ edits, lastBackup: lastBackup(projectId), persisted, now: at });

  const motionProps = {
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: -8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: { duration: 0.2, ease: [0.2, 0.7, 0.2, 1] as const },
  };

  return (
    <AnimatePresence initial={false}>
      {inMemory ? (
        <motion.div
          key="memory"
          role="status"
          {...motionProps}
          className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-2.5"
        >
          <Icon name="file" className="size-4 shrink-0 text-ink-soft" />
          <p className="flex-1 text-sm leading-snug">
            <span className="font-semibold">Klinth cannot save in this browser.</span> It may be a
            private window or storage is turned off. Your work is kept in this tab only, so download
            your project file before you close it.
          </p>
          <button
            type="button"
            className="btn btn-line"
            onClick={() => {
              const { project } = useEditor.getState();
              if (project) downloadProjectFile(project);
            }}
          >
            Download project file
          </button>
        </motion.div>
      ) : null}
      {!online ? (
        <motion.div
          key="offline"
          role="status"
          {...motionProps}
          className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-2.5"
        >
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-ink-soft" />
          <p className="flex-1 text-sm leading-snug">
            <span className="font-semibold">You are offline.</span> Keep editing: your changes still
            save in this browser. The AI helper and publishing need the internet.
          </p>
        </motion.div>
      ) : null}
      {remind ? (
        <motion.div
          key="backup"
          role="status"
          {...motionProps}
          className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-2.5"
        >
          <Icon name="file" className="size-4 shrink-0 text-ink-soft" />
          <p className="flex-1 text-sm leading-snug">
            <span className="font-semibold">Keep a backup.</span> Your site is saved only in this
            browser, and clearing browser data deletes it.
          </p>
          <button
            type="button"
            className="btn btn-line"
            onClick={() => {
              const { project } = useEditor.getState();
              if (!project) return;
              downloadProjectFile(project);
              markBackedUp(projectId);
              setHidden(projectId);
            }}
          >
            Download backup
          </button>
          <button
            type="button"
            className="icon-btn size-8"
            aria-label="Remind me later"
            title="Remind me later"
            onClick={() => setHidden(projectId)}
          >
            <Icon name="close" className="size-3.5" />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
