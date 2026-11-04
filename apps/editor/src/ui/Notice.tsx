import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect } from 'react';
import { useEditor } from '../state/store.ts';

const NOTICE_MS = 5000;

/** A short message at the bottom of the screen, with "Undo" when it helps. */
export function NoticeBar() {
  const notice = useEditor((s) => s.notice);
  const dismiss = useEditor((s) => s.dismissNotice);
  const undo = useEditor((s) => s.undo);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(dismiss, NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice, dismiss]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center"
      aria-live="polite"
    >
      <AnimatePresence>
        {notice ? (
          <motion.div
            key={notice.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : 6 }}
            transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
            className="pointer-events-auto flex items-center gap-3 rounded-full bg-ink py-1.5 pr-1.5 pl-4 text-sm text-panel shadow-lg"
          >
            <span>{notice.text}</span>
            {notice.undo ? (
              <button
                type="button"
                className="rounded-full bg-panel/15 px-3 py-1 font-medium hover:bg-panel/25"
                onClick={() => {
                  undo();
                  dismiss();
                }}
              >
                Undo
              </button>
            ) : (
              <span className="w-2" />
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
