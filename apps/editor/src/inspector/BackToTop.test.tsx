import { blankProject, renderSite, type Project } from '@klinth/core';
import { getTemplate } from '@klinth/templates';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildPreviewDocument } from '../preview/document.ts';
import { newProjectDefaults } from '../state/footer.ts';
import { addSection } from '../state/sections.ts';
import { useEditor } from '../state/store.ts';
import { Inspector } from './Inspector.tsx';

const state = () => useEditor.getState();
const html = (p: Project) => {
  const f = renderSite(p).find((x) => x.path === 'index.html');
  return typeof f?.content === 'string' ? f.content : '';
};
const preview = (p: Project) =>
  buildPreviewDocument(p, 0, { origin: 'https://editor.test', interactive: true });

describe('"Back to top"', () => {
  it('is off in new projects (templates and Blank), and old projects keep their setting', () => {
    const template = getTemplate('portfolio');
    if (!template) throw new Error('no template');
    for (const fresh of [
      newProjectDefaults(template.create()),
      newProjectDefaults(blankProject()),
    ]) {
      expect(fresh.meta.backToTop).toBe(false);
    }
    const old = template.create();
    expect(html(old)).toContain('Back to top');
    const kept = newProjectDefaults({ ...old, meta: { ...old.meta, backToTop: true } });
    expect(kept.meta.backToTop).toBe(true);
    const off = newProjectDefaults(template.create());
    expect(html(off)).not.toContain('Back to top');
    expect(preview(off)).not.toContain('Back to top');
  });

  it('can be switched in the footer section’s own settings, for preview and export', () => {
    const { project, id } = addSection(blankProject(), 0, 'footer');
    act(() => {
      state().open('p1', project as Project, 1);
      state().select(id);
    });
    render(<Inspector />);
    const panel = screen.getByRole('region', { name: 'Back to top' });
    const toggle = within(panel).getByRole('switch', { name: 'Show “Back to top”' });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    const now = state().project as Project;
    expect(now.meta.backToTop).toBe(false);
    expect(html(now)).not.toContain('Back to top');
    expect(preview(now)).not.toContain('Back to top');
    fireEvent.click(within(panel).getByRole('switch', { name: 'Show “Back to top”' }));
    expect(html(state().project as Project)).toContain('Back to top');
  });
});
