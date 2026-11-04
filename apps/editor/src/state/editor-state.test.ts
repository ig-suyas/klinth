import { projectSchema, themeContrastIssues, type Project } from '@klinth/core';
import { getTemplate } from '@klinth/templates';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PALETTES } from '../inspector/ThemePanel.tsx';
import {
  addSection,
  deleteSection,
  duplicateSection,
  moveSection,
  newSectionId,
  reorderSections,
  sectionTitle,
  setSectionProps,
  tidy,
} from './sections.ts';
import { COALESCE_MS, useEditor } from './store.ts';

const portfolio = (): Project => {
  const template = getTemplate('portfolio');
  if (!template) throw new Error('missing template');
  return template.create();
};
const parse = (value: unknown): Project => projectSchema.parse(value);
const ids = (p: Project) => p.pages[0]?.sections.map((s) => s.id) ?? [];
const types = (p: Project) => p.pages[0]?.sections.map((s) => s.type) ?? [];

describe('section edits', () => {
  it('makes unique, valid ids', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const id = newSectionId('textImage', taken);
      expect(id).toMatch(/^textImage-[a-z0-9]{6}$/);
      expect(taken.has(id)).toBe(false);
      taken.add(id);
    }
  });

  it('adds a section after the selected one, or before the footer', () => {
    const project = portfolio();
    const first = ids(project)[0];
    const afterFirst = addSection(project, 0, 'spacer', first);
    expect(types(parse(afterFirst.project))[1]).toBe('spacer');
    const beforeFooter = parse(addSection(project, 0, 'links').project);
    expect(types(beforeFooter).at(-1)).toBe('footer');
    expect(types(beforeFooter).at(-2)).toBe('links');
    // The input project is never changed.
    expect(ids(project)).toEqual(ids(portfolio()));
  });

  it('duplicates a section right below itself with a new id', () => {
    const project = portfolio();
    const id = ids(project)[1] ?? '';
    const result = duplicateSection(project, 0, id);
    if (!result) throw new Error('not duplicated');
    const next = parse(result.project);
    expect(ids(next)[2]).toBe(result.id);
    expect(next.pages[0]?.sections[2]?.props).toEqual(next.pages[0]?.sections[1]?.props);
    expect(duplicateSection(project, 0, 'nope')).toBeUndefined();
  });

  it('deletes, moves and reorders without losing sections', () => {
    const project = portfolio();
    const [a, b] = ids(project);
    expect(ids(parse(deleteSection(project, 0, a ?? '')))).not.toContain(a);
    expect(ids(parse(moveSection(project, 0, a ?? '', 1))).slice(0, 2)).toEqual([b, a]);
    // Moving past the ends does nothing.
    expect(ids(parse(moveSection(project, 0, a ?? '', -1)))).toEqual(ids(project));
    const reordered = parse(reorderSections(project, 0, [b ?? '', 'unknown']));
    expect(ids(reordered)[0]).toBe(b);
    expect(ids(reordered).sort()).toEqual([...ids(project)].sort());
  });

  it('drops empty props and names sections by their heading', () => {
    expect(tidy({ heading: '', body: 'x', image: undefined })).toEqual({ body: 'x' });
    const project = portfolio();
    const id = ids(project)[0] ?? '';
    const next = parse(setSectionProps(project, 0, id, { heading: 'New\nheading', eyebrow: '' }));
    const hero = next.pages[0]?.sections[0];
    if (!hero) throw new Error('missing');
    expect(hero.props).toEqual({ heading: 'New\nheading' });
    expect(sectionTitle(hero)).toBe('New heading');
    expect(sectionTitle({ id: 's', type: 'spacer', props: {} })).toBe('Empty space');
  });
});

describe('editor store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useEditor.getState().open('p1', portfolio(), 1);
  });
  afterEach(() => {
    vi.useRealTimers();
    useEditor.getState().close();
  });

  const rename = (title: string, key?: string) =>
    useEditor.getState().change((p) => ({ ...p, meta: { ...p.meta, title } }), key);
  const title = () => useEditor.getState().project?.meta.title;

  it('undoes and redoes changes', () => {
    const original = title();
    expect(rename('One')).toBeNull();
    expect(rename('Two')).toBeNull();
    useEditor.getState().undo();
    expect(title()).toBe('One');
    useEditor.getState().undo();
    expect(title()).toBe(original);
    useEditor.getState().redo();
    expect(title()).toBe('One');
    // A new change clears the redo list.
    rename('Three');
    expect(useEditor.getState().future).toHaveLength(0);
  });

  it('groups quick edits with the same key into one undo step', () => {
    const original = title();
    rename('T', 'title');
    rename('Ty', 'title');
    rename('Typed', 'title');
    expect(useEditor.getState().past).toHaveLength(1);
    vi.advanceTimersByTime(COALESCE_MS + 1);
    rename('Typed later', 'title');
    expect(useEditor.getState().past).toHaveLength(2);
    useEditor.getState().undo();
    useEditor.getState().undo();
    expect(title()).toBe(original);
  });

  it('refuses invalid changes and keeps the project as it was', () => {
    const before = useEditor.getState().project;
    expect(rename('')).toMatch(/.+/);
    expect(useEditor.getState().project).toBe(before);
    expect(useEditor.getState().past).toHaveLength(0);
    const badColor = useEditor
      .getState()
      .change((p) => ({ ...p, theme: { ...p.theme, colors: { ...p.theme.colors, text: 'red' } } }));
    expect(badColor).toMatch(/color/i);
  });

  it('marks changes unsaved and clears a deleted selection', () => {
    const id = ids(useEditor.getState().project ?? portfolio())[0] ?? '';
    useEditor.getState().select(id);
    useEditor.getState().change((p) => deleteSection(p, 0, id));
    expect(useEditor.getState().selectedId).toBeNull();
    expect(useEditor.getState().save.status).toBe('unsaved');
  });
});

describe('ready-made palettes', () => {
  it.each(PALETTES.map((p) => [p.name, p.colors] as const))(
    '%s passes every contrast check',
    (_, colors) => {
      expect(themeContrastIssues({ ...portfolio().theme, colors })).toEqual([]);
    },
  );
});
