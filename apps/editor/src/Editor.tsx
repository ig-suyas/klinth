import { useEffect } from 'react';
import { AiSettings, useAutoLock } from './ai/AiSettings.tsx';
import { QuotaBanner } from './ai/QuotaBanner.tsx';
import { GitHubDialog } from './github/GitHubDialog.tsx';
import { Inspector } from './inspector/Inspector.tsx';
import { MediaLibrary } from './media/MediaLibrary.tsx';
import { PagesPanel } from './panels/PagesPanel.tsx';
import { SectionsPanel } from './panels/SectionsPanel.tsx';
import { TopBar } from './panels/TopBar.tsx';
import { Preview } from './preview/Preview.tsx';
import { pruneAssets } from './lib/storage.ts';
import { useEditor } from './state/store.ts';
import { useAutosave } from './state/useAutosave.ts';
import { NoticeBar } from './ui/Notice.tsx';
import { SafetyBanners } from './ui/SafetyBanners.tsx';
import { Tour } from './ui/Tour.tsx';

/** Fields keep their own undo for typing, so the editor shortcuts skip them. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/** The editor: top bar, sections on the left, live preview, settings on the right. */
export function Editor({ onExit }: { onExit: () => void }) {
  useAutosave();
  useAutoLock();
  const projectId = useEditor((s) => s.projectId);

  // Files that were deleted or whose upload was undone are cleaned up when a project opens.
  useEffect(() => {
    const { project } = useEditor.getState();
    if (!projectId || !project) return;
    pruneAssets(projectId, new Set(project.assets.map((a) => a.id))).catch(() => undefined);
  }, [projectId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      const { undo, redo } = useEditor.getState();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="editor-shell grid overflow-hidden grid-cols-[17rem_minmax(0,1fr)_20rem] grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)_22rem]">
      <TopBar onExit={onExit} />
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
        <PagesPanel />
        <SectionsPanel />
      </div>
      <main className="flex min-h-0 min-w-0 flex-col" aria-label="Preview">
        <QuotaBanner />
        <SafetyBanners />
        <Preview />
      </main>
      <Inspector />
      <Tour />
      <MediaLibrary />
      <AiSettings />
      <GitHubDialog />
      <NoticeBar />
    </div>
  );
}
