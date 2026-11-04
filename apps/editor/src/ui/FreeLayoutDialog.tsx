import { AnimatePresence } from 'motion/react';
import { useEffect } from 'react';
import { decideFreeIntent, receiveFreeRelease, useFreeUi } from '../state/free-intent.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

/** The warning shown the first time the owner drags an element out of the optimized layout. */
export function FreeLayoutDialog() {
  const asking = useFreeUi((s) => s.asking);
  // While the pointer is still held, the drag goes on in the preview under the warning.
  const holding = useFreeUi((s) => s.intent !== null && !s.intent.released);
  // A release over the editor (on the warning itself) never reaches the preview.
  useEffect(() => {
    if (!holding) return;
    window.addEventListener('pointerup', receiveFreeRelease, true);
    return () => window.removeEventListener('pointerup', receiveFreeRelease, true);
  }, [holding]);
  return (
    <AnimatePresence>
      {asking ? (
        <ConfirmDialog
          key="free-layout"
          title="Use free positioning?"
          confirmLabel="Yes, use free layout"
          cancelLabel="No, keep the optimized layout"
          checkboxLabel="Don’t ask again for this section"
          passThrough={holding}
          onConfirm={(remember) => decideFreeIntent(true, remember)}
          onCancel={(remember) => decideFreeIntent(false, remember)}
        >
          <p>
            Free positioning can hurt your SEO, accessibility and how the page looks on phones.
            Continue?
          </p>
        </ConfirmDialog>
      ) : null}
    </AnimatePresence>
  );
}
