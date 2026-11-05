import type { FlowMeasurement } from '@klinth/core';
import { create } from 'zustand';
import { canBeFree, convertToFree } from './free.ts';
import { useEditor } from './store.ts';

/**
 * The hidden free layout: there is no menu item for it. It is offered only
 * when the owner double-clicks an element in the preview and drags it (the
 * preview sends `freeIntent`). Nothing changes until they answer the warning;
 * "Yes" converts the section with the measured positions and keeps the drag.
 */

interface FreeIntent {
  sectionId: string;
  from: string;
  measure: FlowMeasurement;
  dx: number;
  dy: number;
  /** The pointer was let go (`freeDrop` arrived). */
  released: boolean;
  /** "Yes" was chosen; the conversion waits for the drop when the pointer is still down. */
  accepted: boolean;
}

interface FreeUiState {
  /** The selected item of the selected free section. */
  item: string | null;
  intent: FreeIntent | null;
  /** The warning is open. */
  asking: boolean;
  /** Tells the preview the answer (it moves the element back on No). Set by the preview. */
  bridge: ((accept: boolean) => void) | null;
  setBridge: (post: ((accept: boolean) => void) | null) => void;
  selectItem: (item: string | null) => void;
  /** Items a "Show" button points at; the preview outlines them for a moment. */
  hint: { items: string[]; at: number } | null;
  showItems: (items: string[]) => void;
  reset: () => void;
}

export const useFreeUi = create<FreeUiState>()((set) => ({
  item: null,
  intent: null,
  asking: false,
  bridge: null,
  setBridge: (bridge) => set({ bridge }),
  selectItem: (item) => set({ item }),
  hint: null,
  showItems: (items) => set({ hint: { items: [...items], at: Date.now() } }),
  reset: () => set({ item: null, intent: null, asking: false }),
}));

// An item belongs to its section: picking another section (or page) clears it.
useEditor.subscribe((state, previous) => {
  if (state.selectedId !== previous.selectedId || state.projectId !== previous.projectId) {
    const ui = useFreeUi.getState();
    if (ui.item !== null) ui.selectItem(null);
  }
});

// ---- "Don't ask again for this section" (this device only) ----

const CHOICES_KEY = 'klinth.freeAsk';
const MAX_CHOICES = 200;
export type FreeChoice = 'yes' | 'no';

function readChoices(): Record<string, FreeChoice> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(CHOICES_KEY) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw).filter((e): e is [string, FreeChoice] => e[1] === 'yes' || e[1] === 'no'),
    );
  } catch {
    return {};
  }
}

const choiceKey = (projectId: string, sectionId: string) => `${projectId}:${sectionId}`;

/** The remembered answer for a section, if the owner ticked "Don't ask again". */
export function freeChoice(projectId: string | null, sectionId: string): FreeChoice | null {
  return projectId ? (readChoices()[choiceKey(projectId, sectionId)] ?? null) : null;
}

/** Remembers (or with null forgets) the answer for a section. */
export function rememberFreeChoice(
  projectId: string | null,
  sectionId: string,
  choice: FreeChoice | null,
): void {
  if (!projectId) return;
  const key = choiceKey(projectId, sectionId);
  const others = Object.entries(readChoices()).filter(([k]) => k !== key);
  const kept = [...others, ...(choice ? [[key, choice] as const] : [])].slice(-MAX_CHOICES);
  try {
    localStorage.setItem(CHOICES_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Storage blocked: the question is simply asked again next time.
  }
}

// ---- The flow ----

function answer(accept: boolean) {
  useFreeUi.getState().bridge?.(accept);
}

function finish(intent: FreeIntent) {
  const editor = useEditor.getState();
  useFreeUi.setState({ intent: null, asking: false });
  let result: ReturnType<typeof convertToFree> | null = null;
  const problem = editor.change((project) => {
    result = convertToFree(project, editor.pageIndex, intent.sectionId, intent.measure, {
      from: intent.from,
      dx: intent.dx,
      dy: intent.dy,
    });
    return 'problem' in result ? project : result.project;
  });
  const done = result as ReturnType<typeof convertToFree> | null;
  if (problem || !done || 'problem' in done) {
    answer(false);
    editor.notify(
      `Free layout could not be turned on: ${problem ?? (done && 'problem' in done ? done.problem : 'unknown problem')}`,
    );
    return;
  }
  editor.select(intent.sectionId);
  useFreeUi.getState().selectItem(done.item);
  const kept = done.skipped.length;
  editor.notify(
    kept
      ? `Free layout is on for this section. ${kept === 1 ? '1 part' : `${kept} parts`} could not be placed freely; ${kept === 1 ? 'it comes' : 'they come'} back if you return to the optimized layout.`
      : 'Free layout is on for this section.',
    true,
  );
}

/** The preview reports a double-click and a drag past the threshold. */
export function receiveFreeIntent(message: {
  id: string;
  from: string;
  dx: number;
  dy: number;
  measure: FlowMeasurement;
}): void {
  const editor = useEditor.getState();
  const section = editor.project?.pages[editor.pageIndex]?.sections.find(
    (s) => s.id === message.id,
  );
  const ui = useFreeUi.getState();
  if (!section || !canBeFree(section) || ui.intent) {
    answer(false);
    return;
  }
  const choice = freeChoice(editor.projectId, section.id);
  if (choice === 'no') {
    answer(false);
    editor.notify('This section keeps its optimized layout (you asked not to be asked again).');
    return;
  }
  const intent: FreeIntent = {
    sectionId: section.id,
    from: message.from,
    measure: message.measure,
    dx: message.dx,
    dy: message.dy,
    released: false,
    accepted: choice === 'yes',
  };
  useFreeUi.setState({ intent, asking: choice !== 'yes' });
  if (choice === 'yes') answer(true);
}

/** The pointer is still held: where the element is now. */
export function receiveFreeDrag(dx: number, dy: number): void {
  const { intent } = useFreeUi.getState();
  if (intent && !intent.released) useFreeUi.setState({ intent: { ...intent, dx, dy } });
}

/**
 * The pointer was let go over the editor (the warning appeared under it), so
 * the preview never heard it: the last position it reported counts.
 */
export function receiveFreeRelease(): void {
  const { intent } = useFreeUi.getState();
  if (intent && !intent.released) receiveFreeDrop(intent.dx, intent.dy);
}

/** The pointer was let go: where the element ended up, relative to where it started. */
export function receiveFreeDrop(dx: number, dy: number): void {
  const { intent } = useFreeUi.getState();
  if (!intent) return;
  const next = { ...intent, dx, dy, released: true };
  if (next.accepted) finish(next);
  else useFreeUi.setState({ intent: next });
}

/** The owner's answer. `remember` = "Don't ask again for this section". */
export function decideFreeIntent(accept: boolean, remember: boolean): void {
  const { intent } = useFreeUi.getState();
  if (!intent) return;
  if (remember) {
    rememberFreeChoice(useEditor.getState().projectId, intent.sectionId, accept ? 'yes' : 'no');
  }
  answer(accept);
  if (!accept) {
    useFreeUi.setState({ intent: null, asking: false });
    return;
  }
  const next = { ...intent, accepted: true };
  if (next.released) finish(next);
  else useFreeUi.setState({ intent: next, asking: false });
}
