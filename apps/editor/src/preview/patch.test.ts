/**
 * Preview updates: which change needs only one section swapped, which only new
 * styles, and which a full redraw. Built from the real preview document.
 */
import type { Project } from '@klinth/core';
import { getTemplate } from '@klinth/templates';
import { describe, expect, it } from 'vitest';
import { buildPreviewDocument } from './document.ts';
import { planUpdate, splitPreview } from './patch.ts';

const portfolio = (): Project => {
  const template = getTemplate('portfolio');
  if (!template) throw new Error('missing template');
  return template.create();
};
const doc = (p: Project, pageIndex = 0) =>
  buildPreviewDocument(p, pageIndex, {
    origin: 'https://editor.test',
    interactive: true,
    calm: true,
  });
const split = (p: Project) => {
  const s = splitPreview(doc(p));
  if (!s) throw new Error('could not split');
  return s;
};
type Props = Record<string, unknown>;
const props = (p: Project, i: number): Props => (p.pages[0]?.sections[i]?.props ?? {}) as Props;

describe('splitting the preview into sections', () => {
  it('finds every section of the page by its stable id, in order', () => {
    const p = portfolio();
    const s = split(p);
    const ids = (p.pages[0]?.sections ?? []).filter((x) => x.type !== 'footer').map((x) => x.id);
    expect(s.order).toEqual(ids);
    for (const id of ids) {
      const html = s.sections.get(id) ?? '';
      expect(html.startsWith('<section ')).toBe(true);
      expect(html).toContain(`data-section-id="${id}"`);
      expect(html.endsWith('</section>')).toBe(true);
    }
  });

  it('refuses a document it does not recognise', () => {
    expect(splitPreview('<html><body>hi</body></html>')).toBeNull();
  });
});

describe('planning an update', () => {
  it('swaps only the changed section for a text edit, an added item or a new picture', () => {
    const before = portfolio();
    const after = structuredClone(before);
    props(after, 0).heading = 'A brand new heading';
    const plan = planUpdate(split(before), split(after));
    expect(plan.kind).toBe('patch');
    if (plan.kind !== 'patch') return;
    expect(plan.sections.map((s) => s.id)).toEqual([before.pages[0]?.sections[0]?.id]);
    expect(plan.sections[0]?.html).toContain('A brand new heading');
    expect(plan.styles).toBeNull();

    const more = structuredClone(before);
    const work = more.pages[0]?.sections.find((s) => s.type === 'projects');
    const items = (work?.props as { items: unknown[] }).items;
    items.push({ title: 'One more project' });
    const added = planUpdate(split(before), split(more));
    expect(added.kind === 'patch' && added.sections.map((s) => s.id)).toEqual([work?.id]);
  });

  it('escapes typed text exactly like the export (it is the renderer output)', () => {
    const before = portfolio();
    const after = structuredClone(before);
    props(after, 0).heading = '<img src=x onerror=alert(1)>';
    const plan = planUpdate(split(before), split(after));
    expect(plan.kind === 'patch' && plan.sections[0]?.html).toContain('&lt;img src=x');
    expect(plan.kind === 'patch' && plan.sections[0]?.html).not.toContain('<img src=x');
  });

  it('changes only the styles for a theme colour or a font', () => {
    const before = portfolio();
    const after = structuredClone(before);
    after.theme.colors.accent = '#123456';
    const plan = planUpdate(split(before), split(after));
    expect(plan.kind).toBe('patch');
    if (plan.kind !== 'patch') return;
    expect(plan.sections).toEqual([]);
    expect(plan.styles?.join('')).toContain('#123456');
  });

  it('redraws everything for added or removed sections, the header, the footer or site code', () => {
    const before = portfolio();
    const base = split(before);
    const removed = structuredClone(before);
    removed.pages[0]?.sections.splice(1, 1);
    expect(planUpdate(base, split(removed)).kind).toBe('full');
    const header = structuredClone(before);
    header.meta.title = 'Another name';
    expect(planUpdate(base, split(header)).kind).toBe('full');
    const footer = structuredClone(before);
    footer.meta.backToTop = false;
    expect(planUpdate(base, split(footer)).kind).toBe('full');
    const code = structuredClone(before);
    code.siteCode = { js: 'console.log(1)' };
    expect(planUpdate(base, split(code)).kind).toBe('full');
    expect(planUpdate(null, base).kind).toBe('full');
  });

  it('redraws everything when a changed section needs its own script set up again', () => {
    const before = portfolio();
    const gallery =
      before.pages[0]?.sections.find((s) => s.type === 'gallery') ?? before.pages[0]?.sections[1];
    if (!gallery) throw new Error('no section');
    gallery.animation =
      gallery.type === 'gallery'
        ? { media: { preset: 'marquee' } }
        : { background: { preset: 'parallax' } };
    const after = structuredClone(before);
    const same = after.pages[0]?.sections.find((s) => s.id === gallery.id);
    (same?.props as Props).heading = 'Changed';
    expect(planUpdate(split(before), split(after)).kind).toBe('full');
  });

  it('needs nothing when nothing changed', () => {
    const p = portfolio();
    const plan = planUpdate(split(p), split(structuredClone(p)));
    expect(plan).toEqual({ kind: 'patch', sections: [], styles: null });
  });
});
