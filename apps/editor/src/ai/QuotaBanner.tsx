import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Icon } from '../ui/Icon.tsx';
import { useAi } from './store.ts';

/** Shown when Gemini says the user's daily free limit is used up. Editing keeps working. */
export function QuotaBanner() {
  const hit = useAi((s) => s.quotaHit);
  const dismiss = useAi((s) => s.setQuotaHit);
  const reduce = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {hit ? (
        <motion.div
          key="quota"
          role="status"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
          className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-accent/30 bg-accent-wash px-4 py-2.5"
        >
          <Icon name="sparkle" className="size-4 shrink-0 text-accent-strong" />
          <p className="flex-1 text-sm leading-snug">
            <span className="font-semibold">Your Gemini limit is reached.</span> Free-tier limits
            reset daily. You can keep editing by hand in the meantime.
          </p>
          <button
            type="button"
            className="icon-btn size-8"
            aria-label="Hide this message"
            onClick={() => dismiss(false)}
          >
            <Icon name="close" className="size-3.5" />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
