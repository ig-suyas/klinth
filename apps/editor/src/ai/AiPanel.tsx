import type { BlockType, Section } from '@klinth/core';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { setSectionProps } from '../state/sections.ts';
import { currentPage, useEditor } from '../state/store.ts';
import { Icon } from '../ui/Icon.tsx';
import { AiError, askForSection } from './api.ts';
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

type View =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'review'; section: Section }
  | { kind: 'error'; text: string; badKey?: boolean };

function errorText(error: unknown): string {
  if (!(error instanceof AiError)) return 'Something went wrong. Please try again.';
  if (error.code === 'rate_limited' && error.retryAfter) {
    const minutes = Math.max(1, Math.ceil(error.retryAfter / 60));
    return `${error.message} You can ask again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
  }
  return error.message;
}

/** "What do you want?" for one section, shown in the inspector. */
export function AiPanel({ section }: { section: Section }) {
  const key = useAi((s) => s.key);
  const openPanel = useAi((s) => s.openPanel);
  const reduce = useReducedMotion();

  return (
    <motion.section
      aria-label="AI helper"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
      className="space-y-3 rounded-xl border border-line-strong bg-panel p-3 shadow-[0_8px_24px_-16px_rgba(29,27,24,.4)]"
    >
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Icon name="sparkle" className="size-4 text-accent" />
          AI helper
        </p>
        <button
          type="button"
          className="icon-btn size-7"
          aria-label="Close AI helper"
          onClick={() => openPanel(null)}
        >
          <Icon name="close" className="size-3.5" />
        </button>
      </div>
      {key ? (
        <Ask section={section} apiKey={key} />
      ) : (
        <>
          <p className="text-xs leading-relaxed text-ink-soft">
            The AI helper uses your own free Gemini key. Add it once and you are set.
          </p>
          <KeyGate compact />
        </>
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
    const still =
      state.pageIndex === pageIndex && currentPage(state)?.sections.some((s) => s.id === next.id);
    if (!still) {
      notify('That section is gone, so the AI’s change was not used.');
      setView({ kind: 'idle' });
      return;
    }
    const problem = change((p) => setSectionProps(p, pageIndex, next.id, next.props));
    if (problem) {
      setView({ kind: 'error', text: `The AI’s change could not be used: ${problem}` });
      return;
    }
    setInstruction('');
    setView({ kind: 'idle' });
    notify('The AI updated this section.', true);
  };

  const run = async (text: string) => {
    const { project, pageIndex } = useEditor.getState();
    if (!project || text.trim().length < 2) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setView({ kind: 'working' });
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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(instruction);
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

  const working = view.kind === 'working';
  const suggestions = [...(SUGGESTIONS[section.type] ?? []), ...COMMON].slice(0, 4);

  return (
    <form className="space-y-2.5" onSubmit={submit}>
      <label className="label" htmlFor={`${id}-ask`}>
        What do you want?
      </label>
      <textarea
        id={`${id}-ask`}
        className="input min-h-[4.5rem] resize-y"
        placeholder="For example: make the heading warmer and mention I work in Pune"
        maxLength={1000}
        value={instruction}
        disabled={working}
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void run(instruction);
        }}
      />
      <div className="flex flex-wrap gap-1.5" aria-label="Ideas">
        {suggestions.map((idea) => (
          <button
            key={idea}
            type="button"
            disabled={working}
            className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft hover:border-ink hover:text-ink disabled:opacity-50"
            onClick={() => {
              setInstruction(idea);
              void run(idea);
            }}
          >
            {idea}
          </button>
        ))}
      </div>
      {view.kind === 'error' ? (
        <div>
          <p role="alert" className="error-text">
            {view.text}
          </p>
          {view.badKey ? (
            <button
              type="button"
              className="btn btn-line mt-2 w-full"
              onClick={() => useAi.getState().forget()}
            >
              <Icon name="key" />
              Use a different key
            </button>
          ) : null}
        </div>
      ) : null}
      {working ? (
        <div className="flex items-center gap-2">
          <p role="status" className="flex flex-1 items-center gap-2 text-sm text-ink-soft">
            <span
              className="size-1.5 rounded-full bg-accent motion-safe:animate-pulse"
              aria-hidden="true"
            />
            Writing… this can take up to a minute.
          </p>
          <button
            type="button"
            className="btn btn-line"
            onClick={() => {
              controller.current?.abort();
              setView({ kind: 'idle' });
            }}
          >
            Stop
          </button>
        </div>
      ) : (
        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={instruction.trim().length < 2}
        >
          <Icon name="sparkle" />
          Ask AI
        </button>
      )}
      <p className="help">You can undo any change the AI makes.</p>
    </form>
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
    <div className="space-y-2.5">
      <p className="text-sm font-medium">The AI wrote this code. Please read it first.</p>
      <pre
        className="max-h-60 overflow-auto rounded-lg bg-ink p-3 font-mono text-[0.6875rem] leading-relaxed whitespace-pre-wrap text-panel"
        aria-label="Code from the AI"
        tabIndex={0}
      >
        {code}
      </pre>
      <p className="flex gap-2 rounded-lg bg-accent-wash px-3 py-2 text-xs leading-relaxed">
        <Icon name="warn" className="mt-0.5 size-3.5 shrink-0 text-accent-strong" />
        This code runs on your published site. Only use code you trust.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 accent-[var(--color-accent)]"
          checked={trusted}
          onChange={(e) => setTrusted(e.target.checked)}
        />
        I have read this code and I trust it
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary flex-1"
          disabled={!trusted}
          onClick={onUse}
        >
          Use this code
        </button>
        <button type="button" className="btn btn-line" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}
