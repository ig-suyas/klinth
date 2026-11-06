import type { BlockType } from '@klinth/core';
import { blockDefinitions, sectionPresets, type SectionPresetId } from '@klinth/templates';
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
    /** Adds a block, or a ready-made section (`expandable`, `shapes`). */
    add(entry: BlockType | SectionPresetId) {
      const { selectedId } = useEditor.getState();
      const preset = entry in sectionPresets ? sectionPresets[entry as SectionPresetId] : null;
      const type = preset ? preset.type : (entry as BlockType);
      let id = '';
      const ok = report(
        change((p) => {
          const result = addSection(p, pageIndex, type, selectedId, preset?.defaults());
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
      const page = currentPage(useEditor.getState());
      const linked = useEditor
        .getState()
        .project?.meta.navLinks?.some(
          (l) =>
            l.target.kind === 'section' &&
            l.target.section === sectionId &&
            l.target.page === page?.slug,
        );
      if (report(change((p) => deleteSection(p, pageIndex, sectionId)))) {
        const name = blockDefinitions[section.type].label;
        notify(
          linked
            ? `“${name}” deleted. Its header link is hidden until you point it somewhere else.`
            : `“${name}” deleted.`,
          true,
        );
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
