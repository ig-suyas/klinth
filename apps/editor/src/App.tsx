import { motion, useReducedMotion } from 'motion/react';
import { templates } from '@klinth/templates';

/** Phase 0 placeholder shell. The real editor arrives in Phase 3. */
export function App() {
  const reduceMotion = useReducedMotion();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-stone-950 p-8 text-stone-100">
      <motion.h1
        className="text-5xl font-semibold tracking-tight"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        Klinth
      </motion.h1>
      <p className="text-stone-400">Build a beautiful website without code.</p>
      <p className="text-sm text-stone-500">{templates.length} templates on the way.</p>
    </main>
  );
}
