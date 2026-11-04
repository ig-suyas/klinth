import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const TOUR_KEY = 'klinth:tour-done';

const STEPS = [
  {
    target: 'sections',
    title: 'Your sections',
    text: 'Your page is built from sections. Drag them to change the order, or add new ones at the bottom.',
  },
  {
    target: 'preview',
    title: 'Click to edit',
    text: 'Click a section in the preview to pick it. Click its text again to type right there.',
  },
  {
    target: 'inspector',
    title: 'Fine-tune it',
    text: 'Change words, buttons and layout here. With nothing picked, change the colors and fonts of the whole site.',
  },
  {
    target: 'export',
    title: 'Take it with you',
    text: 'Klinth saves as you go. When you are happy, download your website and put it online.',
  },
] as const;

function readDone(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === '1';
  } catch {
    return true;
  }
}

function markDone(): void {
  try {
    localStorage.setItem(TOUR_KEY, '1');
  } catch {
    // Storage blocked: the tour simply shows again next time.
  }
}

interface Box {
  top: number;
  left: number;
}

/** A short, skippable first-run tour pointing at the four parts of the editor. */
export function Tour() {
  const [step, setStep] = useState<number | null>(() => (readDone() ? null : 0));
  const [box, setBox] = useState<Box | null>(null);
  const reduce = useReducedMotion();
  const card = useRef<HTMLDivElement>(null);
  const current = step === null ? undefined : STEPS[step];

  const finish = () => {
    markDone();
    setStep(null);
  };

  useLayoutEffect(() => {
    if (!current) return;
    const place = () => {
      const target = document.querySelector(`[data-tour="${current.target}"]`);
      const width = 320;
      if (!target) return setBox({ top: 80, left: window.innerWidth / 2 - width / 2 });
      const r = target.getBoundingClientRect();
      const height = card.current?.offsetHeight ?? 180;
      const fit = (x: number, max: number) => Math.max(12, Math.min(x, max - 12));
      const spot =
        current.target === 'sections'
          ? { top: r.top + 64, left: r.right + 12 }
          : current.target === 'inspector'
            ? { top: r.top + 64, left: r.left - width - 12 }
            : current.target === 'export'
              ? { top: r.bottom + 12, left: r.right - width }
              : { top: r.top + 48, left: r.left + r.width / 2 - width / 2 };
      setBox({
        top: fit(spot.top, window.innerHeight - height),
        left: fit(spot.left, window.innerWidth - width),
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [current]);

  useEffect(() => {
    if (step === null) return;
    card.current?.querySelector<HTMLButtonElement>('[data-primary]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  return (
    <AnimatePresence>
      {current && step !== null ? (
        <motion.div
          key={step}
          ref={card}
          role="dialog"
          aria-modal="false"
          aria-labelledby="tour-title"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
          className="fixed z-50 w-80 rounded-xl bg-ink p-4 text-panel shadow-[0_20px_50px_-16px_rgba(29,27,24,.55)]"
          style={box ?? { top: 80, left: 24 }}
        >
          <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-[#f2b48f] uppercase">
            Quick tour · {step + 1} of {STEPS.length}
          </p>
          <h2 id="tour-title" className="mt-1.5 font-display text-lg">
            {current.title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[#d9d4ca]">{current.text}</p>
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              className="text-sm text-[#d9d4ca] underline-offset-4 hover:text-panel hover:underline"
              onClick={finish}
            >
              Skip tour
            </button>
            <button
              type="button"
              data-primary
              className="btn bg-panel text-ink hover:bg-accent-wash"
              onClick={() => (step + 1 < STEPS.length ? setStep(step + 1) : finish())}
            >
              {step + 1 < STEPS.length ? 'Next' : 'Start building'}
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
