import type { BlockType } from '@klinth/core';
import { blockDefinitions } from '@klinth/templates';
import {
  addSection,
  deleteSection,
  duplicateSection,
  moveSection,
  reorderSections,
} from './sections.ts';
import { currentPage, useEditor } from './store.ts';

/** Section commands shared by the sections list, the inspector and the keyboard. */
export function useSectionActions() {
  const change = useEditor((s) => s.change);
  const select = useEditor((s) => s.select);
  const notify = useEditor((s) => s.notify);
  const pageIndex = useEditor((s) => s.pageIndex);

  const report = (problem: string | null) => {
    if (problem) notify(`That change could not be made: ${problem}`);
    return problem === null;
  };

  return {
    add(type: BlockType) {
      const { selectedId } = useEditor.getState();
      let id = '';
      const ok = report(
        change((p) => {
          const result = addSection(p, pageIndex, type, selectedId);
          id = result.id;
          return result.project;
        }),
      );
      if (ok) select(id);
    },
    duplicate(sectionId: string) {
      let id = '';
      const ok = report(
        change((p) => {
          const result = duplicateSection(p, pageIndex, sectionId);
          id = result?.id ?? '';
          return result ? result.project : p;
        }),
      );
      if (ok && id) {
        select(id);
        notify('Section duplicated.', true);
      }
    },
    remove(sectionId: string) {
      const section = currentPage(useEditor.getState())?.sections.find((s) => s.id === sectionId);
      if (!section) return;
      if (report(change((p) => deleteSection(p, pageIndex, sectionId)))) {
        notify(`“${blockDefinitions[section.type].label}” deleted.`, true);
      }
    },
    move(sectionId: string, by: -1 | 1) {
      report(change((p) => moveSection(p, pageIndex, sectionId, by)));
    },
    reorder(ids: readonly string[]) {
      report(change((p) => reorderSections(p, pageIndex, ids), 'reorder'));
    },
  };
}
