import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ConfirmDialogProps {
  title: string;
  /** Plain-language explanation under the title. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** Optional checkbox shown above the buttons (its value is passed to both answers). */
  checkboxLabel?: string;
  onConfirm: (checked: boolean) => void;
  /** Also on Escape and on a click outside. */
  onCancel: (checked: boolean) => void;
  /**
   * The dialog lets the pointer through (a drag under it is still going on);
   * it can be clicked once the pointer is let go. The keyboard works throughout.
   */
  passThrough?: boolean;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * A small modal question. Keyboard: focus starts on the cancel button (the
 * safe answer), Tab and Shift+Tab stay inside, Escape cancels. Focus goes
 * back to where it was when the dialog closes.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel,
  checkboxLabel,
  onConfirm,
  onCancel,
  passThrough = false,
}: ConfirmDialogProps) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const bodyId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancel.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel(checked);
      return;
    }
    if (e.key !== 'Tab' || !dialog.current) return;
    const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !dialog.current.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !dialog.current.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  // In <body>: a moved (transformed) panel around it would break `position: fixed`.
  return createPortal(
    <motion.div
      className={`fixed inset-0 z-[60] grid place-items-center bg-ink/30 p-6 ${passThrough ? 'pointer-events-none' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel(checked);
      }}
    >
      <motion.div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={onKeyDown}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
        className={`${passThrough ? '' : 'pointer-events-auto'} w-full max-w-sm rounded-2xl border border-line bg-panel p-5 shadow-[0_24px_60px_-20px_rgba(29,27,24,.45)] outline-none`}
      >
        <h2 id={titleId} className="font-display text-xl">
          {title}
        </h2>
        <div id={bodyId} className="mt-2 text-sm leading-relaxed text-ink-soft">
          {children}
        </div>
        {checkboxLabel ? (
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-accent"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            {checkboxLabel}
          </label>
        ) : null}
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" className="btn btn-primary" onClick={() => onConfirm(checked)}>
            {confirmLabel}
          </button>
          <button
            ref={cancel}
            type="button"
            className="btn btn-line"
            onClick={() => onCancel(checked)}
          >
            {cancelLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
