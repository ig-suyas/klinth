import { addPage, blankProject, projectSchema, renderSite, type Project } from '@klinth/core';
import { blockDefinitions, sectionPresets, type SectionPresetId } from '@klinth/templates';
import { describe, expect, it } from 'vitest';
import { ADDABLE_SECTIONS, blockFields } from '../inspector/fields.ts';
import { addSection, type Props } from './sections.ts';

const NEW_ENTRIES = [
  'rotator',
  'giantText',
  'steps',
  'marquee',
  'cardStack',
  'expandable',
  'shapes',
] as const;

/** Adds an "Add a section" entry the way the menu does (presets bring their own props). */
function addEntry(project: Project, page: number, entry: string): Project {
  const preset = entry in sectionPresets ? sectionPresets[entry as SectionPresetId] : null;
  const type = preset ? preset.type : (entry as keyof typeof blockDefinitions);
  const { project: next } = addSection(project, page, type, null, preset?.defaults() as Props);
  const parsed = projectSchema.safeParse(next);
  if (!parsed.success) throw new Error(`${entry}: ${parsed.error.message}`);
  return parsed.data;
}

describe('new sections in "Add a section"', () => {
  it('are all offered, with a plain-language description', () => {
    for (const entry of NEW_ENTRIES) {
      expect(ADDABLE_SECTIONS).toContain(entry);
      const info =
        entry in sectionPresets
          ? sectionPresets[entry as SectionPresetId]
          : blockDefinitions[entry as keyof typeof blockDefinitions];
      expect(info.description.length).toBeGreaterThan(40);
    }
  });

  it('can be added twice on a second page made from Blank and export', () => {
    let { project } = addPage(blankProject(), 'Second');
    for (const entry of [...NEW_ENTRIES, ...NEW_ENTRIES]) project = addEntry(project, 1, entry);
    const page = project.pages[1];
    expect(page?.sections).toHaveLength(NEW_ENTRIES.length * 2);
    const html = renderSite(project).find((f) => f.path === 'second.html')?.content;
    expect(typeof html).toBe('string');
    expect(html).toContain('css/extras.css');
    expect(html).toContain('js/extras.js');
    // Ids stay unique when the same thing is added twice.
    const ids = page?.sections.map((s) => s.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every section but the footer offers shapes; all but footer and empty space can fold', () => {
    for (const [type, fields] of Object.entries(blockFields)) {
      const keys = fields.map((f) => f.key);
      if (type === 'footer') {
        expect(keys).not.toContain('shapes');
        continue;
      }
      expect(keys, type).toContain('shapes');
      if (type === 'spacer') expect(keys).not.toContain('fold');
      else expect(keys, type).toContain('fold');
    }
  });
});
