import { projectSchema, renderSite, sampleProject, type Project } from '@klinth/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildPreviewDocument, previewMessageSchema } from '../preview/document.ts';
import {
  HEADER_ID,
  MULTI_PAGE_NOTE,
  addNavLink,
  customizeNavLinks,
  decodeTarget,
  encodeTarget,
  navTargetOptions,
  removeHeader,
  setPageHeaderHidden,
} from './header.ts';
import { duplicateSection } from './sections.ts';
import { useEditor } from './store.ts';

/** The value, or a failed test when it is missing. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('missing value');
  return value;
}

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
const state = () => useEditor.getState();

beforeEach(() => {
  state().open('p1', clone(), 1);
});

describe('header link targets', () => {
  it('lists every page and every section to pick from', () => {
    const options = navTargetOptions(clone());
    expect(options.map((o) => o.label)).toEqual([
      'Home (page)',
      'Asha Rao',
      'Selected work',
      'Find me',
      'About (page)',
      'About me',
    ]);
    expect(options.every((o) => decodeTarget(o.value) !== null)).toBe(true);
  });

  it('encodes and decodes targets, refusing anything else', () => {
    const page = { kind: 'page', page: '' } as const;
    const section = { kind: 'section', page: 'about', section: 'about' } as const;
    expect(decodeTarget(encodeTarget(page))).toEqual(page);
    expect(decodeTarget(encodeTarget(section))).toEqual(section);
    for (const bad of ['', 'url:javascript:alert(1)', 'page:../x', 'section:about', 'x']) {
      expect(decodeTarget(bad)).toBeNull();
    }
  });

  it('gives a linked section a safe anchor and keeps the project valid', () => {
    const p = addNavLink(clone(), { kind: 'section', page: '', section: 'work' });
    expect(projectSchema.safeParse(p).success).toBe(true);
    expect(p.meta.navLinks).toEqual([
      { label: 'Selected work', target: { kind: 'section', page: '', section: 'work' } },
    ]);
    expect(must(must(p.pages[0]).sections[1]).anchor).toBe('selected-work');
  });

  it('starts the editable list from what the header showed', () => {
    const p = customizeNavLinks(clone());
    expect(p.meta.navLinks?.map((l) => l.label)).toEqual(['Home', 'About']);
  });

  it('never copies an anchor when a section is duplicated', () => {
    const p = addNavLink(clone(), { kind: 'section', page: '', section: 'work' });
    const copy = duplicateSection(p, 0, 'work');
    expect(projectSchema.safeParse(copy?.project).success).toBe(true);
  });
});

describe('removing the header', () => {
  it('turns it off for the whole site and undo restores the exact previous state', () => {
    const before = structuredClone(state().project);
    state().select(HEADER_ID);
    expect(state().change(removeHeader)).toBeNull();
    expect(state().project?.meta.headerEnabled).toBe(false);
    expect(state().selectedId).toBeNull();
    expect(must(renderSite(must(state().project))[0]).content).not.toContain('<header');
    state().undo();
    expect(state().project).toEqual(before);
    state().redo();
    expect(state().project?.meta.headerEnabled).toBe(false);
    state().undo();
    expect(state().project).toEqual(before);
  });

  it('keeps the header selected while it is shown', () => {
    state().select(HEADER_ID);
    state().change((p) => ({ ...p, meta: { ...p.meta, title: 'New name' } }));
    expect(state().selectedId).toBe(HEADER_ID);
  });

  it('can hide the header on one page only', () => {
    const p = setPageHeaderHidden(clone(), 1, true);
    expect(must(p.pages[1]).hideHeader).toBe(true);
    expect(must(p.pages[0]).hideHeader).toBeUndefined();
    expect(must(setPageHeaderHidden(p, 1, false).pages[1]).hideHeader).toBeUndefined();
  });

  it('has a friendly note for sites with several pages', () => {
    expect(MULTI_PAGE_NOTE).toBe(
      "Without a header, visitors can't move between your pages unless you add links.",
    );
  });
});

describe('header in the preview', () => {
  const doc = (p: Project, index = 0) =>
    buildPreviewDocument(p, index, { origin: 'http://localhost', interactive: true });

  it('marks the header so it can be selected, with a remove button', () => {
    const html = doc(clone());
    expect(html).toContain('data-k-header');
    expect(html).toContain('Remove header');
  });

  it('inlines the split header files on pages that show it', () => {
    const p = setPageHeaderHidden(clone(), 1, true);
    const home = doc(p, 0);
    expect(home).not.toContain('css/header.css');
    expect(home).not.toContain('js/header.js');
    expect(home).toContain('.site-header{');
    const about = doc(p, 1);
    expect(about).not.toContain('<header');
    expect(about).not.toContain('.site-header{');
  });

  it('accepts only well-formed header messages', () => {
    const ok = (data: unknown) => previewMessageSchema.safeParse(data).success;
    const msg = { source: 'klinth-preview' };
    expect(ok({ ...msg, type: 'header' })).toBe(true);
    expect(ok({ ...msg, type: 'removeHeader' })).toBe(true);
    expect(ok({ ...msg, type: 'navigate', page: 'about', anchor: 'about-me' })).toBe(true);
    expect(ok({ ...msg, type: 'navigate', page: '' })).toBe(true);
    expect(ok({ ...msg, type: 'navigate', page: '../x' })).toBe(false);
    expect(ok({ ...msg, type: 'navigate', page: 'about', anchor: '"><img>' })).toBe(false);
  });
});
