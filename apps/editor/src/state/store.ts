import { headerShown, projectSchema, type Project } from '@klinth/core';
import { create } from 'zustand';

export type Device = 'desktop' | 'tablet' | 'phone';
export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

/** Edits within this long with the same key become one undo step (typing, dragging a slider). */
export const COALESCE_MS = 1000;
const HISTORY_LIMIT = 100;

export interface Notice {
  id: number;
  text: string;
  /** Shows an "Undo" button on the notice. */
  undo?: boolean;
}

interface EditorState {
  projectId: string | null;
  project: Project | null;
  /** The saved revision this tab knows about (see storage.saveProject). */
  revision: number;
  pageIndex: number;
  selectedId: string | null;
  device: Device;
  past: Project[];
  future: Project[];
  lastKey: string | null;
  lastAt: number;
  save: { status: SaveStatus; message?: string };
  notice: Notice | null;
  /** Goes up by one each time the preview should play its animations again. */
  animationReplay: number;

  open: (id: string, project: Project, revision: number) => void;
  close: () => void;
  /**
   * Applies an edit. The result is validated against the project schema; an
   * invalid result is refused and its first problem returned, so nothing
   * broken is ever saved. Returns null on success.
   */
  change: (recipe: (project: Project) => unknown, key?: string) => string | null;
  /**
   * Like `change`, but adds no undo step: for facts the preview measured about
   * the current state (how tall a free text is), not edits of their own.
   */
  amend: (recipe: (project: Project) => unknown) => string | null;
  undo: () => void;
  redo: () => void;
  select: (id: string | null) => void;
  setPage: (index: number) => void;
  setDevice: (device: Device) => void;
  setSave: (status: SaveStatus, message?: string) => void;
  setRevision: (revision: number) => void;
  notify: (text: string, undo?: boolean) => void;
  dismissNotice: () => void;
  /** Redraws the preview with its animations playing (the "Preview animations" button). */
  replayAnimations: () => void;
}

const initial = {
  projectId: null,
  project: null,
  revision: 0,
  pageIndex: 0,
  selectedId: null,
  past: [],
  future: [],
  lastKey: null,
  lastAt: 0,
  save: { status: 'saved' as const },
  notice: null,
  animationReplay: 0,
};

let noticeCount = 0;

/** Selection value for the site header (never a valid section id; see state/header.ts). */
const HEADER_SELECTION = '#header';

/** Keeps the selection pointing at a section (or a header) that still exists. */
function keepSelection(project: Project, pageIndex: number, id: string | null): string | null {
  const page = project.pages[pageIndex];
  if (id === HEADER_SELECTION) return page && headerShown(project, page) ? id : null;
  return id && page?.sections.some((s) => s.id === id) ? id : null;
}

export const useEditor = create<EditorState>()((set, get) => ({
  ...initial,
  device: 'desktop',

  open: (id, project, revision) => set({ ...initial, projectId: id, project, revision }),
  close: () => set({ ...initial }),

  change: (recipe, key) => {
    const { project, past, lastKey, lastAt, pageIndex, selectedId } = get();
    if (!project) return 'No project is open.';
    const result = projectSchema.safeParse(recipe(project));
    if (!result.success) return result.error.issues[0]?.message ?? 'That change is not allowed.';
    const now = Date.now();
    const coalesce = key !== undefined && key === lastKey && now - lastAt < COALESCE_MS;
    set({
      project: result.data,
      past: coalesce ? past : [...past, project].slice(-HISTORY_LIMIT),
      future: [],
      lastKey: key ?? null,
      lastAt: now,
      selectedId: keepSelection(result.data, pageIndex, selectedId),
      save: { status: 'unsaved' },
    });
    return null;
  },

  amend: (recipe) => {
    const { project, pageIndex, selectedId } = get();
    if (!project) return 'No project is open.';
    const result = projectSchema.safeParse(recipe(project));
    if (!result.success) return result.error.issues[0]?.message ?? 'That change is not allowed.';
    set({
      project: result.data,
      selectedId: keepSelection(result.data, pageIndex, selectedId),
      save: { status: 'unsaved' },
    });
    return null;
  },

  undo: () => {
    const { project, past, future, pageIndex, selectedId } = get();
    const previous = past.at(-1);
    if (!project || !previous) return;
    const page = Math.min(pageIndex, previous.pages.length - 1);
    set({
      project: previous,
      past: past.slice(0, -1),
      future: [project, ...future],
      lastKey: null,
      pageIndex: page,
      selectedId: keepSelection(previous, page, selectedId),
      save: { status: 'unsaved' },
    });
  },

  redo: () => {
    const { project, past, future, pageIndex, selectedId } = get();
    const next = future[0];
    if (!project || !next) return;
    const page = Math.min(pageIndex, next.pages.length - 1);
    set({
      project: next,
      past: [...past, project],
      future: future.slice(1),
      lastKey: null,
      pageIndex: page,
      selectedId: keepSelection(next, page, selectedId),
      save: { status: 'unsaved' },
    });
  },

  select: (id) => set({ selectedId: id }),
  setPage: (index) => set({ pageIndex: index, selectedId: null }),
  setDevice: (device) => set({ device }),
  setSave: (status, message) => set({ save: message ? { status, message } : { status } }),
  setRevision: (revision) => set({ revision }),
  notify: (text, undo) => {
    noticeCount += 1;
    set({ notice: undo ? { id: noticeCount, text, undo } : { id: noticeCount, text } });
  },
  dismissNotice: () => set({ notice: null }),
  replayAnimations: () => set((s) => ({ animationReplay: s.animationReplay + 1 })),
}));

/** The page being edited, if a project is open. */
export function currentPage(state: Pick<EditorState, 'project' | 'pageIndex'>) {
  return state.project?.pages[state.pageIndex];
}
