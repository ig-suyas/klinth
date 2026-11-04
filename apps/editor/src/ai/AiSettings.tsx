import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { Icon } from '../ui/Icon.tsx';
import { HonestNote, KeyGate } from './KeyForms.tsx';
import { AUTO_LOCK_MS, shouldAutoLock, useAi } from './store.ts';

/** "AI helper" window from the top bar: add, unlock, test or forget the key. */
export function AiSettings() {
  const open = useAi((s) => s.settingsOpen);
  return <AnimatePresence>{open ? <SettingsDialog key="ai-settings" /> : null}</AnimatePresence>;
}

function SettingsDialog() {
  const close = () => useAi.getState().openSettings(false);
  const reduce = useReducedMotion();
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useAi.getState().openSettings(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <motion.div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-title"
        tabIndex={-1}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: reduce ? 0 : 6 }}
        transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-panel p-6 shadow-[0_24px_60px_-20px_rgba(29,27,24,.45)] outline-none"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Your own key</p>
            <h2
              id="ai-settings-title"
              className="mt-1 flex items-center gap-2 font-display text-2xl"
            >
              <Icon name="sparkle" className="size-5 text-accent" />
              AI helper
            </h2>
            <p className="help">
              Ask AI to write or restyle any section. Use the sparkle button next to a section.
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
            <Icon name="close" />
          </button>
        </div>
        <KeyGate />
        <div className="mt-5 border-t border-line pt-4">
          <HonestNote />
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Locks the key after AUTO_LOCK_MS without AI use, if the user wants that. */
export function useAutoLock(): void {
  useEffect(() => {
    const timer = window.setInterval(
      () => {
        const state = useAi.getState();
        if (shouldAutoLock(state, Date.now())) state.lock();
      },
      Math.min(30_000, AUTO_LOCK_MS),
    );
    return () => window.clearInterval(timer);
  }, []);
}
