import type { BlockType, Project, Section } from '@klinth/core';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { setSectionProps } from '../state/sections.ts';
import { currentPage, useEditor } from '../state/store.ts';
import { Icon } from '../ui/Icon.tsx';
import { AiError, askForSection } from './api.ts';
import { changedFields, listNames } from './changes.ts';
import { KeyGate } from './KeyForms.tsx';
import { useAi } from './store.ts';

const COMMON = ['Make it shorter', 'Sound friendlier', 'More professional'];
const SUGGESTIONS: Partial<Record<BlockType, string[]>> = {
  hero: ['Write a clearer heading', 'Make it about a small bakery'],
  about: ['Write it in first person', 'Make it warmer'],
  projects: ['Tighten every description'],
  links: ['Make the link names clearer'],
  contact: ['Make it more inviting'],
  customCode: ['A soft animated background', 'A simple countdown to a date'],
  spacer: ['Make it bigger'],
};

const EASE = [0.2, 0.7, 0.2, 1] as const;

type View =
  | { kind: 'idle' }
  | { kind: 'working'; started: number }
  | { kind: 'review'; section: Section }
  | { kind: 'done'; changed: string[]; after: Project }
  | { kind: 'error'; text: string; badKey?: boolean };

function errorText(error: unknown): string {
  if (!(error instanceof AiError)) return 'Something went wrong. Please try again.';
  if (error.code === 'rate_limited' && error.retryAfter) {
    const minutes = Math.max(1, Math.ceil(error.retryAfter / 60));
    return `${error.message} You can ask again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
  }
  return error.message;
}

/**
 * The AI helper for one section: the editor's one dark, "ink" surface, so the
 * headline feature reads as its own moment inside the light settings panel.
 */
export function AiPanel({ section }: { section: Section }) {
  const key = useAi((s) => s.key);
  const openPanel = useAi((s) => s.openPanel);
  const reduce = useReducedMotion();

  return (
    <motion.section
      aria-label="AI helper"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.24, ease: EASE }}
      className="surface-ink relative overflow-hidden rounded-xl p-4 shadow-[0_18px_40px_-24px_rgba(29,27,24,.7)]"
    >
      {/* A thin warm rule ties the surface to the editor's accent. */}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-accent" />
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-[var(--color-on-ink-accent)] uppercase">
            <Icon name="sparkle" className="size-3.5" />
            AI helper
          </p>
          <h3 className="mt-1 font-display text-lg leading-tight">
            {key ? 'What should change?' : 'Add your key to begin'}
          </h3>
        </div>
        <button
          type="button"
          className="icon-btn -mt-1 -mr-1 size-8"
          aria-label="Close AI helper"
          onClick={() => openPanel(null)}
        >
          <Icon name="close" className="size-3.5" />
        </button>
      </header>
      {key ? (
        <Ask section={section} apiKey={key} />
      ) : (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-ink-soft">
            The AI helper uses your own free Gemini key from Google. You add it once.
          </p>
          <KeyGate compact />
        </div>
      )}
    </motion.section>
  );
}

function Ask({ section, apiKey }: { section: Section; apiKey: string }) {
  const change = useEditor((s) => s.change);
  const notify = useEditor((s) => s.notify);
  const touch = useAi((s) => s.touch);
  const setQuotaHit = useAi((s) => s.setQuotaHit);
  const [instruction, setInstruction] = useState('');
  const [view, setView] = useState<View>({ kind: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const id = useId();

  useEffect(() => () => controller.current?.abort(), []);

  /** Applies the answer as one undo step, if the section is still there. */
  const apply = (next: Section, pageIndex: number) => {
    const state = useEditor.getState();
    const before = currentPage(state)?.sections.find((s) => s.id === next.id);
    if (state.pageIndex !== pageIndex || !before) {
      notify('That section is gone, so the AI’s change was not used.');
      setView({ kind: 'idle' });
      return;
    }
    const problem = change((p) => setSectionProps(p, pageIndex, next.id, next.props));
    const after = useEditor.getState().project;
    if (problem || !after) {
      setView({ kind: 'error', text: `The AI’s change could not be used: ${problem ?? ''}` });
      return;
    }
    setInstruction('');
    setView({ kind: 'done', changed: changedFields(next.type, before.props, next.props), after });
  };

  const run = async (text: string) => {
    const { project, pageIndex } = useEditor.getState();
    if (!project || text.trim().length < 2) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setView({ kind: 'working', started: Date.now() });
    touch();
    try {
      const next = await askForSection(
        {
          instruction: text.trim(),
          section,
          site: {
            title: project.meta.title,
            description: project.meta.description,
            language: project.meta.language,
          },
        },
        apiKey,
        abort.signal,
      );
      setQuotaHit(false);
      // Code from the AI runs on the published site, so the user must read and confirm it.
      if (next.type === 'customCode') setView({ kind: 'review', section: next });
      else apply(next, pageIndex);
    } catch (error) {
      if (abort.signal.aborted) return;
      if (error instanceof AiError && error.code === 'quota') setQuotaHit(true);
      const badKey = error instanceof AiError && error.code === 'bad_key';
      setView({ kind: 'error', text: errorText(error), badKey });
    } finally {
      if (controller.current === abort) controller.current = null;
    }
  };

  if (view.kind === 'review' && view.section.type === 'customCode') {
    return (
      <CodeReview
        code={view.section.props.code ?? ''}
        onUse={() => apply(view.section, useEditor.getState().pageIndex)}
        onDiscard={() => setView({ kind: 'idle' })}
      />
    );
  }
  if (view.kind === 'working') {
    return (
      <Working
        started={view.started}
        onStop={() => {
          controller.current?.abort();
          setView({ kind: 'idle' });
        }}
      />
    );
  }
  if (view.kind === 'done') {
    return (
      <Done changed={view.changed} after={view.after} onMore={() => setView({ kind: 'idle' })} />
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(instruction);
  };
  const suggestions = [...(SUGGESTIONS[section.type] ?? []), ...COMMON].slice(0, 4);

  return (
    <form className="space-y-3" onSubmit={submit}>
      <label className="sr-only" htmlFor={`${id}-ask`}>
        What do you want?
      </label>
      <textarea
        id={`${id}-ask`}
        className="input min-h-[5.5rem] resize-y border-line-strong leading-relaxed placeholder:text-ink-soft/70"
        placeholder="For example: make the heading warmer and say I work in Pune"
        maxLength={1000}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void run(instruction);
        }}
      />
      <ul className="flex flex-wrap gap-1.5" aria-label="Ideas">
        {suggestions.map((idea) => (
          <li key={idea}>
            <button
              type="button"
              className="min-h-8 rounded-full border border-line-strong px-3 text-xs text-ink-soft transition-colors duration-150 hover:border-ink hover:text-ink focus-visible:border-ink"
              onClick={() => {
                setInstruction(idea);
                void run(idea);
              }}
            >
              {idea}
            </button>
          </li>
        ))}
      </ul>
      {view.kind === 'error' ? (
        <div className="rounded-lg border border-danger/40 px-3 py-2.5">
          <p role="alert" className="text-xs leading-relaxed text-danger">
            {view.text}
          </p>
          {view.badKey ? (
            <button
              type="button"
              className="btn btn-line mt-2 h-9 w-full"
              onClick={() => useAi.getState().forget()}
            >
              <Icon name="key" />
              Use a different key
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <p className="text-[0.6875rem] text-ink-soft">You can undo any change.</p>
        <button type="submit" className="btn btn-accent" disabled={instruction.trim().length < 2}>
          <Icon name="sparkle" />
          Ask AI
        </button>
      </div>
    </form>
  );
}

function Working({ started, onStop }: { started: number; onStop: () => void }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [started]);
  return (
    <div className="space-y-4">
      <div className="ai-lines grid gap-2" aria-hidden="true">
        <span />
        <span className="w-[86%]" />
        <span className="w-[58%]" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <p role="status" className="text-sm">
          Writing your section…
          <span className="ml-1.5 text-xs text-ink-soft tabular-nums">
            {seconds > 2 ? `${seconds}s` : ''}
          </span>
        </p>
        <button type="button" className="btn btn-line h-9" onClick={onStop}>
          Stop
        </button>
      </div>
      <p className="text-[0.6875rem] leading-relaxed text-ink-soft">
        Usually a few seconds. It can take up to a minute when Gemini is busy.
      </p>
    </div>
  );
}

function Done({
  changed,
  after,
  onMore,
}: {
  changed: string[];
  after: Project;
  onMore: () => void;
}) {
  const reduce = useReducedMotion();
  // Undo here only while the AI's change is still the latest one.
  const latest = useEditor((s) => s.project === after);
  const undo = useEditor((s) => s.undo);
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: EASE }}
      className="space-y-3"
    >
      <p role="status" className="flex items-start gap-2 text-sm">
        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ok/20 text-ok">
          <Icon name="check" className="size-3.5" />
        </span>
        <span>
          <span className="block">The AI updated this section.</span>
          {changed.length > 0 ? (
            <span className="mt-0.5 block text-xs text-ink-soft">
              Changed: {listNames(changed)}.
            </span>
          ) : null}
        </span>
      </p>
      <div className="flex gap-2">
        <button type="button" className="btn btn-accent flex-1" onClick={onMore}>
          <Icon name="sparkle" />
          Ask for more
        </button>
        <AnimatePresence initial={false}>
          {latest ? (
            <motion.button
              type="button"
              className="btn btn-line"
              exit={{ opacity: 0 }}
              onClick={() => {
                undo();
                onMore();
              }}
            >
              <Icon name="undo" />
              Undo
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function CodeReview({
  code,
  onUse,
  onDiscard,
}: {
  code: string;
  onUse: () => void;
  onDiscard: () => void;
}) {
  const [trusted, setTrusted] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-sm">The AI wrote this code. Please read it before using it.</p>
      <pre
        className="max-h-64 overflow-auto rounded-lg border border-line bg-sunk p-3 font-mono text-[0.6875rem] leading-relaxed whitespace-pre-wrap"
        aria-label="Code from the AI"
        tabIndex={0}
      >
        {code}
      </pre>
      <Callout>This code runs on your published site. Only use code you trust.</Callout>
      <label className="flex min-h-9 items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--color-accent)]"
          checked={trusted}
          onChange={(e) => setTrusted(e.target.checked)}
        />
        I have read this code and I trust it
      </label>
      <div className="flex gap-2">
        <button type="button" className="btn btn-accent flex-1" disabled={!trusted} onClick={onUse}>
          Use this code
        </button>
        <button type="button" className="btn btn-line" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg bg-accent-wash px-3 py-2 text-xs leading-relaxed">
      <Icon name="warn" className="mt-0.5 size-3.5 shrink-0 text-accent-strong" />
      {children}
    </p>
  );
}
