import type { Project } from '@klinth/core';
import { measureItems, setItemBox, updateFreeItem } from '../state/free.ts';
import {
  receiveFreeDrag,
  receiveFreeDrop,
  receiveFreeIntent,
  useFreeUi,
} from '../state/free-intent.ts';
import { useEditor } from '../state/store.ts';
import type { PreviewMessage } from './document.ts';

type FreeType =
  | 'history'
  | 'freeIntent'
  | 'freeDrag'
  | 'freeDrop'
  | 'freeSelect'
  | 'freeChange'
  | 'freeText'
  | 'freeMeasure';
export type FreeMessage = Extract<PreviewMessage, { type: FreeType }>;

const FREE_TYPES: ReadonlySet<string> = new Set<FreeType>([
  'history',
  'freeIntent',
  'freeDrag',
  'freeDrop',
  'freeSelect',
  'freeChange',
  'freeText',
  'freeMeasure',
]);

export const isFreeMessage = (m: PreviewMessage): m is FreeMessage => FREE_TYPES.has(m.type);

export interface FreeView {
  /** The preview already shows `project` (it moved the item itself): no redraw needed. */
  shown: (project: Project) => void;
  /** Redraw now (a change the preview showed was refused). */
  redraw: () => void;
}

/** The artboard ratio of a free section (undefined when it is not free). */
function boardAspect(project: Project, pageIndex: number, id: string): number | undefined {
  const section = project.pages[pageIndex]?.sections.find((s) => s.id === id);
  return section?.layout === 'free' ? section.canvas?.aspect : undefined;
}

/** Applies a free layout message from the preview (already checked by schema and source). */
export function handleFreeMessage(message: FreeMessage, view: FreeView): void {
  const state = useEditor.getState();
  switch (message.type) {
    case 'history':
      if (message.action === 'undo') state.undo();
      else state.redo();
      break;
    case 'freeIntent':
      receiveFreeIntent(message);
      break;
    case 'freeDrag':
      receiveFreeDrag(message.dx, message.dy);
      break;
    case 'freeDrop':
      receiveFreeDrop(message.dx, message.dy);
      break;
    case 'freeSelect':
      if (state.selectedId !== message.id) state.select(message.id);
      useFreeUi.getState().selectItem(message.item);
      break;
    case 'freeChange': {
      const aspectBefore = state.project
        ? boardAspect(state.project, state.pageIndex, message.id)
        : undefined;
      // Arrow-key nudges within a second become one undo step; every drag is its own.
      const key = message.nudge ? `free-nudge:${message.id}:${message.item}` : undefined;
      const problem = state.change(
        (p) =>
          setItemBox(
            p,
            state.pageIndex,
            message.id,
            message.item,
            message.box,
            message.phone,
            message.size,
          ),
        key,
      );
      const project = useEditor.getState().project;
      // A grown artboard needs a redraw (its height changed); anything else is already shown.
      const grew = project && boardAspect(project, state.pageIndex, message.id) !== aspectBefore;
      if (!problem && project && !grew) view.shown(project);
      else {
        if (problem) state.notify(`That move could not be saved: ${problem}`);
        view.redraw();
      }
      break;
    }
    case 'freeMeasure': {
      // A measurement, not an edit: it joins the current undo step.
      const before = state.project
        ? boardAspect(state.project, state.pageIndex, message.id)
        : undefined;
      const problem = state.amend((p) =>
        measureItems(p, state.pageIndex, message.id, message.items),
      );
      const project = useEditor.getState().project;
      if (!problem && project && boardAspect(project, state.pageIndex, message.id) === before) {
        view.shown(project);
      }
      break;
    }
    case 'freeText': {
      const problem = state.change((p) =>
        updateFreeItem(p, state.pageIndex, message.id, message.item, { text: message.text }),
      );
      if (problem) state.notify(`That text could not be saved: ${problem}`);
      break;
    }
  }
}
