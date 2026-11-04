import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { downloadProjectFile, downloadSiteZip } from '../lib/files.ts';
import { useAi } from '../ai/store.ts';
import { useGitHub } from '../github/oauth.ts';
import { loadAssets } from '../lib/storage.ts';
import { useLibrary } from '../media/files.ts';
import { useEditor, type Device } from '../state/store.ts';
import { flushSave } from '../state/useAutosave.ts';
import { Icon, type IconName } from '../ui/Icon.tsx';

const DEVICES: { id: Device; label: string; icon: IconName }[] = [
  { id: 'desktop', label: 'Computer', icon: 'desktop' },
  { id: 'tablet', label: 'Tablet', icon: 'tablet' },
  { id: 'phone', label: 'Phone', icon: 'phone' },
];

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

export function TopBar({ onExit }: { onExit: () => void }) {
  const project = useEditor((s) => s.project);
  const pageIndex = useEditor((s) => s.pageIndex);
  const setPage = useEditor((s) => s.setPage);
  const device = useEditor((s) => s.device);
  const setDevice = useEditor((s) => s.setDevice);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const openLibrary = useLibrary((s) => s.open);
  const openAi = useAi((s) => s.openSettings);
  if (!project) return null;

  return (
    <header className="col-span-full flex h-14 items-center gap-2 border-b border-line bg-panel px-2">
      <button type="button" className="btn btn-quiet" onClick={() => void flushSave().then(onExit)}>
        <Icon name="back" />
        All projects
      </button>
      <span className="h-6 w-px bg-line" aria-hidden="true" />
      <p className="min-w-0 truncate px-2 font-display text-[1.0625rem]" title={project.meta.title}>
        {project.meta.title}
      </p>
      {project.pages.length > 1 ? (
        <select
          aria-label="Page"
          className="input w-auto"
          value={pageIndex}
          onChange={(e) => setPage(Number(e.target.value))}
        >
          {project.pages.map((page, i) => (
            <option key={page.slug || 'home'} value={i}>
              {page.title}
            </option>
          ))}
        </select>
      ) : null}

      <div className="mx-auto flex items-center gap-1" role="radiogroup" aria-label="Preview size">
        {DEVICES.map((d) => (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={device === d.id}
            aria-label={d.label}
            title={`Preview on a ${d.label.toLowerCase()}`}
            className="icon-btn aria-checked:bg-sunk aria-checked:text-ink"
            onClick={() => setDevice(d.id)}
          >
            <Icon name={d.icon} className="size-[1.125rem]" />
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className="icon-btn"
          aria-label="Undo"
          title={`Undo (${MOD}+Z)`}
          disabled={!canUndo}
          onClick={undo}
        >
          <Icon name="undo" className="size-[1.125rem]" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Redo"
          title={`Redo (${MOD}+Shift+Z)`}
          disabled={!canRedo}
          onClick={redo}
        >
          <Icon name="redo" className="size-[1.125rem]" />
        </button>
      </div>
      <SaveIndicator />
      <button
        type="button"
        className="btn btn-quiet"
        title="Pictures and videos"
        onClick={() => openLibrary({ mode: 'manage' })}
      >
        <Icon name="image" />
        <span className="max-xl:sr-only">Pictures and videos</span>
      </button>
      <button
        type="button"
        className="btn btn-quiet"
        title="AI helper: your Gemini key"
        onClick={() => openAi(true)}
      >
        <Icon name="sparkle" className="size-4 text-accent" />
        <span className="max-xl:sr-only">AI helper</span>
      </button>
      <ExportMenu />
    </header>
  );
}

function SaveIndicator() {
  const save = useEditor((s) => s.save);
  if (save.status === 'error') {
    return (
      <div role="alert" className="flex max-w-[22rem] items-center gap-2 text-xs text-danger">
        <Icon name="warn" className="size-4 shrink-0" />
        <span className="line-clamp-2">{save.message ?? 'Not saved.'}</span>
        <button
          type="button"
          className="btn btn-line h-8 min-h-8 px-2 text-xs"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
  const text = save.status === 'saved' ? 'Saved in this browser' : 'Saving…';
  return (
    <p
      role="status"
      className="flex min-w-[9.5rem] items-center gap-1.5 px-2 text-xs text-ink-soft"
      data-save-status={save.status}
    >
      {save.status === 'saved' ? (
        <Icon name="check" className="size-3.5 text-ok" />
      ) : (
        <span
          className="size-1.5 rounded-full bg-accent motion-safe:animate-pulse"
          aria-hidden="true"
        />
      )}
      {text}
    </p>
  );
}

function ExportMenu() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = async (task: () => Promise<void> | void) => {
    setBusy(true);
    setProblem(null);
    try {
      await task();
      setOpen(false);
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const downloadSite = () =>
    run(async () => {
      const { projectId, project } = useEditor.getState();
      if (!projectId || !project) return;
      await downloadSiteZip(project, await loadAssets(projectId));
    });
  const downloadProject = () =>
    run(() => {
      const { project } = useEditor.getState();
      if (project) downloadProjectFile(project);
    });

  return (
    <div className="relative" ref={wrap} data-tour="export">
      <button
        type="button"
        className="btn btn-primary"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="download" />
        Export
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            aria-label="Export"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            className="absolute top-full right-0 z-30 mt-2 w-80 origin-top-right rounded-xl border border-line bg-panel p-1.5 shadow-[0_16px_40px_-12px_rgba(29,27,24,.35)]"
          >
            <MenuItem
              icon="download"
              title="Download website"
              text="A ZIP with your finished site, ready to put online."
              disabled={busy}
              onClick={() => void downloadSite()}
            />
            <MenuItem
              icon="globe"
              title="Publish to GitHub"
              text="Save the same files to a GitHub repository and get a free web address."
              disabled={busy}
              onClick={() => {
                setOpen(false);
                useGitHub.getState().openDialog(true);
              }}
            />
            <MenuItem
              icon="file"
              title="Download project file"
              text="A backup you can open in Klinth later, on any computer."
              disabled={busy}
              onClick={() => void downloadProject()}
            />
            {problem ? (
              <p role="alert" className="error-text px-2.5 pb-1">
                {problem}
              </p>
            ) : null}
            <p className="mt-1 border-t border-line px-2.5 pt-2 pb-1 text-xs leading-relaxed text-ink-soft">
              Your work is saved in this browser only. Clearing browser data removes it, so keep a
              project file as a backup.
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MenuItem(props: {
  icon: IconName;
  title: string;
  text: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={props.disabled}
      onClick={props.onClick}
      className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-sunk focus-visible:bg-sunk disabled:opacity-50"
    >
      <Icon name={props.icon} className="mt-0.5 size-4 shrink-0 text-accent" />
      <span>
        <span className="block text-sm font-medium">{props.title}</span>
        <span className="block text-xs leading-snug text-ink-soft">{props.text}</span>
      </span>
    </button>
  );
}
