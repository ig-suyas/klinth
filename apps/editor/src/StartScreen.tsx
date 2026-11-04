import { templates, type TemplateInfo } from '@klinth/templates';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { importProjectFile } from './lib/files.ts';
import { deleteProject, listProjects, type ProjectSummary } from './lib/storage.ts';
import { useFontUrls } from './lib/fonts.ts';
import { buildPreviewDocument } from './preview/document.ts';
import { Icon } from './ui/Icon.tsx';
import { blankProject, type Project } from '@klinth/core';

interface StartScreenProps {
  onCreate: (project: Project) => Promise<void>;
  onOpen: (id: string) => Promise<void>;
}

const ease = [0.2, 0.7, 0.2, 1] as const;

/** First screen: pick a template, open a saved project, or bring in a project file. */
export function StartScreen({ onCreate, onOpen }: StartScreenProps) {
  const [saved, setSaved] = useState<ProjectSummary[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();

  const refresh = () =>
    listProjects().then(setSaved, (error: unknown) => {
      setSaved([]);
      setProblem(error instanceof Error ? error.message : String(error));
    });

  useEffect(() => {
    void refresh();
  }, []);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await task();
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      );
      setBusy(false);
    }
  };

  const rise = (i: number) =>
    reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, ease, delay: 0.06 * i },
        };

  return (
    <main className="min-h-full overflow-y-auto">
      <div className="mx-auto max-w-[62rem] px-6 pt-14 pb-20">
        <motion.p {...rise(0)} className="font-display text-xl tracking-tight">
          Klinth
        </motion.p>
        <motion.h1
          {...rise(1)}
          className="mt-10 max-w-[18ch] font-display text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.04] tracking-[-0.02em]"
        >
          Make a website you are proud of.
        </motion.h1>
        <motion.p {...rise(2)} className="mt-4 max-w-[52ch] text-lg leading-relaxed text-ink-soft">
          Pick a starting design, change the words and colors, and download a finished site. No
          code, no account, free.
        </motion.p>

        {problem ? (
          <p
            role="alert"
            className="mt-6 rounded-lg border border-danger/30 bg-[#fdecea] px-4 py-3 text-sm text-danger"
          >
            {problem}
          </p>
        ) : null}

        <section aria-labelledby="pick" className="mt-12">
          <motion.h2 {...rise(3)} id="pick" className="eyebrow">
            Start from a design
          </motion.h2>
          <ul className="mt-4 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((template, i) => (
              <motion.li key={template.id} {...rise(4 + i)}>
                <TemplateCard
                  template={template}
                  disabled={busy}
                  onPick={() => void run(() => onCreate(template.create()))}
                />
              </motion.li>
            ))}
            <motion.li {...rise(4 + templates.length)}>
              <BlankCard disabled={busy} onPick={() => void run(() => onCreate(blankProject()))} />
            </motion.li>
          </ul>
        </section>

        <section aria-labelledby="yours" className="mt-14">
          <div className="flex items-end justify-between gap-4">
            <h2 id="yours" className="eyebrow">
              Your projects
            </h2>
            <button
              type="button"
              className="btn btn-line"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              <Icon name="upload" />
              Open a project file
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void run(async () => onCreate(await importProjectFile(file)));
              }}
            />
          </div>
          {saved === null ? (
            <p className="mt-4 text-sm text-ink-soft">Looking for saved projects…</p>
          ) : saved.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-line-strong px-5 py-6 text-sm text-ink-soft">
              Nothing saved yet. Projects you start are kept in this browser, ready for next time.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-panel">
              {saved.map((p) => (
                <SavedRow
                  key={p.id}
                  project={p}
                  disabled={busy}
                  onOpen={() => void run(() => onOpen(p.id))}
                  onDelete={() =>
                    void run(async () => {
                      await deleteProject(p.id);
                      await refresh();
                      setBusy(false);
                    })
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function TemplateCard({
  template,
  disabled,
  onPick,
}: {
  template: TemplateInfo;
  disabled: boolean;
  onPick: () => void;
}) {
  // A still picture of the real template: no scripts run in this frame.
  const project = useMemo(() => template.create(), [template]);
  const fontUrls = useFontUrls(project.theme);
  const doc = useMemo(
    () => buildPreviewDocument(project, 0, { origin: '', interactive: false, fontUrls }),
    [project, fontUrls],
  );
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className="group block w-full rounded-2xl border border-line bg-panel p-2.5 text-left transition-[border-color,transform] duration-300 ease-out hover:-translate-y-0.5 hover:border-ink disabled:opacity-60"
    >
      <span className="relative block aspect-[16/10] overflow-hidden rounded-xl bg-white ring-1 ring-line">
        <iframe
          title={`${template.name} preview`}
          sandbox=""
          srcDoc={doc}
          tabIndex={-1}
          aria-hidden="true"
          loading="lazy"
          className="pointer-events-none absolute top-0 left-0 h-[800px] w-[1280px] origin-top-left scale-[0.35] border-0"
        />
      </span>
      <span className="flex items-end justify-between gap-4 px-2 pt-4 pb-2">
        <span>
          <span className="block font-display text-xl">{template.name}</span>
          <span className="mt-1 block text-sm leading-snug text-ink-soft">
            {template.description}
          </span>
        </span>
        <span className="btn btn-primary shrink-0 group-hover:bg-accent-strong">Use this</span>
      </span>
    </button>
  );
}

function BlankCard({ disabled, onPick }: { disabled: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className="group block w-full rounded-2xl border border-line bg-panel p-2.5 text-left transition-[border-color,transform] duration-300 ease-out hover:-translate-y-0.5 hover:border-ink disabled:opacity-60"
    >
      <span className="grid aspect-[16/10] place-items-center rounded-xl border border-dashed border-line-strong bg-sunk text-ink-soft">
        <Icon name="plus" className="size-8" />
      </span>
      <span className="flex items-end justify-between gap-4 px-2 pt-4 pb-2">
        <span>
          <span className="block font-display text-xl">Blank page</span>
          <span className="mt-1 block text-sm leading-snug text-ink-soft">
            One empty page. Add only the sections you want.
          </span>
        </span>
        <span className="btn btn-primary shrink-0 group-hover:bg-accent-strong">Start blank</span>
      </span>
    </button>
  );
}

function SavedRow({
  project,
  disabled,
  onOpen,
  onDelete,
}: {
  project: ProjectSummary;
  disabled: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const when = project.updatedAt
    ? new Date(project.updatedAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Unknown';
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{project.title}</span>
        <span className="block text-xs text-ink-soft">
          {project.damaged ? 'This project cannot be opened. It has been kept.' : `Edited ${when}`}
        </span>
      </span>
      {confirming ? (
        <>
          <span className="text-sm">Delete for good?</span>
          <button type="button" className="btn btn-quiet" onClick={() => setConfirming(false)}>
            Keep it
          </button>
          <button
            type="button"
            className="btn bg-danger text-white hover:bg-[#8f1c13]"
            disabled={disabled}
            onClick={onDelete}
          >
            Delete
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="icon-btn hover:text-danger"
            aria-label={`Delete ${project.title}`}
            disabled={disabled}
            onClick={() => setConfirming(true)}
          >
            <Icon name="trash" />
          </button>
          <button
            type="button"
            className="btn btn-line"
            disabled={disabled || project.damaged}
            onClick={onOpen}
          >
            Open
          </button>
        </>
      )}
    </li>
  );
}
