import { useState } from 'react';
import { setBackToTop, setPageBackToTopHidden } from '../state/footer.ts';
import { useEditor } from '../state/store.ts';

/**
 * Site style > Footer: the "Back to top" link, for the whole site and for this page.
 * Alignment, offset and padding live in the footer section's own settings.
 */
export function FooterPanel({ inFooter = false }: { inFooter?: boolean }) {
  const project = useEditor((s) => s.project);
  const change = useEditor((s) => s.change);
  const pageIndex = useEditor((s) => s.pageIndex);
  const [problem, setProblem] = useState<string | null>(null);
  if (!project) return null;
  const on = project.meta.backToTop !== false;
  const page = project.pages[pageIndex];

  return (
    <div className="space-y-4">
      <label className="flex items-center justify-between gap-3 text-[0.8125rem] font-semibold">
        Show “Back to top”
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={on}
          onChange={(e) =>
            setProblem(change((p) => setBackToTop(p, e.target.checked), 'meta.backToTop'))
          }
        />
        <span
          aria-hidden="true"
          className="relative h-6 w-10 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4"
        />
      </label>
      {on && page ? (
        <label className="flex items-start gap-2 text-[0.8125rem]">
          <input
            type="checkbox"
            className="mt-0.5 accent-accent"
            checked={page.hideBackToTop === true}
            onChange={(e) =>
              setProblem(change((p) => setPageBackToTopHidden(p, pageIndex, e.target.checked)))
            }
          />
          <span>
            <span className="block font-semibold">Hide “Back to top” on this page</span>
            <span className="block text-[0.6875rem] text-ink-soft">Only on “{page.title}”.</span>
          </span>
        </label>
      ) : null}
      {inFooter ? (
        <p className="help">The same switch is in Site style &gt; Footer.</p>
      ) : (
        <p className="help">
          To move the footer’s text, links or “Back to top”, select the footer section.
        </p>
      )}
      {problem ? (
        <p role="alert" className="error-text">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
