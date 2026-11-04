import type { Project } from '@klinth/core';
import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { downloadProjectFile, missingFilesNote, type ImportedProject } from './lib/files.ts';
import { loadProject, saveAsset, saveProject } from './lib/storage.ts';
import { useEditor } from './state/store.ts';

// Split so a first visit downloads only the start screen, and a return visit only the editor.
const loadEditor = () => import('./Editor.tsx');
const Editor = lazy(() => loadEditor().then((m) => ({ default: m.Editor })));
const StartScreen = lazy(() =>
  import('./StartScreen.tsx').then((m) => ({ default: m.StartScreen })),
);

const LAST_KEY = 'klinth:last-project';

function remember(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_KEY, id);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    // Storage blocked: Klinth just starts on the first screen next time.
  }
}

function lastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

type Screen = 'loading' | 'start' | 'editor';

export function App() {
  const [screen, setScreen] = useState<Screen>(() => (lastProjectId() ? 'loading' : 'start'));
  const open = useEditor((s) => s.open);
  const close = useEditor((s) => s.close);

  const openSaved = async (id: string) => {
    const loaded = await loadProject(id);
    if (!loaded) throw new Error('That project could not be found. It may have been deleted.');
    open(id, loaded.project, loaded.revision);
    remember(id);
    setScreen('editor');
  };

  const create = async (project: Project, imported?: Omit<ImportedProject, 'project'>) => {
    const id = crypto.randomUUID();
    // Media first: the project is only listed once every file it needs is stored.
    for (const [assetId, data] of imported?.assets ?? []) await saveAsset(id, assetId, data);
    const revision = await saveProject(id, project, 0);
    open(id, project, revision);
    remember(id);
    setScreen('editor');
    const note = missingFilesNote(imported?.missing ?? []);
    if (note) useEditor.getState().notify(note);
  };

  // While the start screen is open, fetch the editor in the background so opening
  // a project is instant and still works if the connection drops meanwhile.
  useEffect(() => {
    if (screen !== 'start') return;
    const timer = setTimeout(() => void loadEditor().catch(() => undefined), 1500);
    return () => clearTimeout(timer);
  }, [screen]);

  // Returning visitors go straight back to what they were working on.
  useEffect(() => {
    const id = lastProjectId();
    if (!id) return;
    loadProject(id).then(
      (loaded) => {
        if (loaded) {
          useEditor.getState().open(id, loaded.project, loaded.revision);
          setScreen('editor');
        } else {
          remember(null);
          setScreen('start');
        }
      },
      () => setScreen('start'),
    );
  }, []);

  return (
    <>
      <SmallScreenNotice />
      {screen === 'loading' ? (
        <Opening />
      ) : screen === 'editor' ? (
        <ErrorBoundary>
          <Suspense fallback={<Opening />}>
            <Editor
              onExit={() => {
                close();
                remember(null);
                setScreen('start');
              }}
            />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <ErrorBoundary>
          <Suspense fallback={<Opening />}>
            <StartScreen onCreate={create} onOpen={openSaved} />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}

function Opening() {
  return (
    <p role="status" className="grid h-full place-items-center text-sm text-ink-soft">
      Opening your project…
    </p>
  );
}

/** Phones get a friendly note: the editor needs room. Exported sites work on every screen. */
function SmallScreenNotice() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="fixed inset-0 z-[60] hidden flex-col items-start justify-center gap-4 bg-canvas p-8 max-[899px]:flex">
      <p className="font-display text-xl">Klinth</p>
      <h1 className="font-display text-3xl leading-tight">Klinth works best on a bigger screen.</h1>
      <p className="max-w-[40ch] leading-relaxed text-ink-soft">
        Open it on a computer or tablet to build your site. The sites you make work great on phones.
      </p>
      <button type="button" className="btn btn-line" onClick={() => setDismissed(true)}>
        Continue anyway
      </button>
    </div>
  );
}

interface BoundaryState {
  failed: boolean;
  /** A part of Klinth could not be downloaded (offline, or Klinth was just updated). */
  loadFailed: boolean;
}

/** True for the error a browser throws when a lazily loaded file cannot be fetched. */
export function isLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(
    message,
  );
}

/** If the editor crashes, the user can still download their work. */
class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { failed: false, loadFailed: false };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { failed: true, loadFailed: isLoadError(error) };
  }

  override componentDidCatch(error: unknown): void {
    // Only the error's name and message: never the project or anything the user typed.
    const name = error instanceof Error ? error.name : 'Error';
    const message = error instanceof Error ? error.message : '';
    console.error('Klinth crashed:', name, message.slice(0, 200));
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    if (this.state.loadFailed) {
      return (
        <div role="alert" className="mx-auto max-w-lg px-6 py-24">
          <h1 className="font-display text-3xl">Klinth could not finish loading.</h1>
          <p className="mt-3 leading-relaxed text-ink-soft">
            Check your internet connection, then reload. Your saved work is safe in this browser.
          </p>
          <button
            type="button"
            className="btn btn-primary mt-6"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    const { project } = useEditor.getState();
    return (
      <div role="alert" className="mx-auto max-w-lg px-6 py-24">
        <h1 className="font-display text-3xl">Something went wrong.</h1>
        <p className="mt-3 leading-relaxed text-ink-soft">
          Your last saved version is safe in this browser. Download a copy of your project, then
          reload the page.
        </p>
        <div className="mt-6 flex gap-2">
          {project ? (
            <button
              type="button"
              className="btn btn-line"
              onClick={() => downloadProjectFile(project)}
            >
              Download project file
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
