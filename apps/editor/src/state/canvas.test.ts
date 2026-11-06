import {
  blankProject,
  canvasAspect,
  freeCanvas,
  projectSchema,
  type FreeCanvas,
  type Project,
  type Section,
} from '@klinth/core';
import { describe, expect, it } from 'vitest';
import { addFreeItem, newFreeItem, setCanvasProps } from './canvas.ts';
import { addSection } from './sections.ts';

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('missing value');
  return value;
}

/** A blank project with one blank canvas section, as "Add a section" makes it. */
function withCanvas(): { project: Project; id: string } {
  const start = blankProject();
  const { project, id } = addSection(start, 0, 'canvas');
  const parsed = projectSchema.safeParse(project);
  if (!parsed.success) throw new Error(parsed.error.message);
  return { project: parsed.data, id };
}
const sectionOf = (p: unknown, id: string): Section =>
  must((p as Project).pages[0]?.sections.find((s) => s.id === id));
const canvasOf = (p: unknown, id: string): FreeCanvas => must(freeCanvas(sectionOf(p, id)));
const valid = (p: unknown) => projectSchema.safeParse(p).success;

describe('adding a blank canvas', () => {
  it('starts in free layout, empty, half the screen tall', () => {
    const { project, id } = withCanvas();
    const s = sectionOf(project, id);
    expect(s.type).toBe('canvas');
    expect(s.layout).toBe('free');
    expect(s.props).toEqual({ height: 'half' });
    expect(canvasOf(project, id)).toEqual({ aspect: canvasAspect({ height: 'half' }), items: [] });
  });

  it('starts an empty space at 96 px', () => {
    const { project, id } = addSection(blankProject(), 0, 'spacer');
    expect(sectionOf(project, id).props).toEqual({ height: 96 });
    expect(valid(project)).toBe(true);
  });
});

describe('blank canvas settings', () => {
  it('reshapes the artboard when the height changes and keeps items in place', () => {
    const { project, id } = withCanvas();
    const added = addFreeItem(project, 0, id, { type: 'title' });
    if ('problem' in added) throw new Error(added.problem);
    const before = must(canvasOf(added.project, id).items[0]);
    const full = setCanvasProps(added.project as Project, 0, id, { height: 'full' });
    expect(valid(full)).toBe(true);
    const after = canvasOf(full, id);
    expect(after.aspect).toBe(canvasAspect({ height: 'full' }));
    const item = must(after.items[0]);
    // Twice as tall: the same distance from the top is half the percentage.
    expect(item.y).toBeCloseTo(before.y / 2, 2);
    expect(item.x).toBe(before.x);
  });

  it('takes custom px and percent heights and a smallest height', () => {
    const { project, id } = withCanvas();
    const px = setCanvasProps(project, 0, id, {
      height: 'custom',
      heightUnit: 'px',
      heightPx: 560,
    });
    expect(valid(px)).toBe(true);
    expect(canvasOf(px, id).aspect).toBe(2);
    const vh = setCanvasProps(project, 0, id, { height: 'custom', heightVh: 80, minHeight: 900 });
    expect(canvasOf(vh, id).aspect).toBe(
      canvasAspect({ height: 'custom', heightVh: 80, minHeight: 900 }),
    );
    expect(valid(setCanvasProps(project, 0, id, { height: 'custom', heightVh: 500 }))).toBe(false);
  });

  it('starts a color or gradient from the site colors', () => {
    const { project, id } = withCanvas();
    const color = setCanvasProps(project, 0, id, { fill: 'color' });
    expect(sectionOf(color, id).props).toMatchObject({
      fill: 'color',
      color: project.theme.colors.accent,
    });
    const gradient = setCanvasProps(project, 0, id, { fill: 'gradient' });
    expect(sectionOf(gradient, id).props).toMatchObject({
      color: project.theme.colors.accent,
      colorTo: project.theme.colors.text,
    });
    expect(valid(gradient)).toBe(true);
  });
});

describe('adding items to a free canvas', () => {
  it('adds each kind as a valid item, in front, a little apart', () => {
    const { project, id: sectionId } = withCanvas();
    const kinds = [
      { type: 'title' },
      { type: 'subtitle' },
      { type: 'body' },
      { type: 'button' },
      { type: 'video', embedUrl: 'https://youtu.be/aqz-KE-bpKQ' },
    ] as const;
    let current: unknown = project;
    for (const kind of kinds) {
      const r = addFreeItem(current as Project, 0, sectionId, kind);
      if ('problem' in r) throw new Error(r.problem);
      expect(valid(r.project)).toBe(true);
      current = r.project;
    }
    const items = canvasOf(current, sectionId).items;
    expect(items.map((i) => i.type)).toEqual(['text', 'text', 'text', 'button', 'video']);
    expect(items.map((i) => i.z)).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(items.map((i) => i.id)).size).toBe(5);
    expect(new Set(items.map((i) => `${i.x},${i.y}`)).size).toBe(5);
    expect(sectionId).toMatch(/^canvas-/);
  });

  it('keeps a picture at its own shape inside the artboard', () => {
    const canvas: FreeCanvas = { aspect: 2, items: [] };
    const item = must(
      newFreeItem(canvas, { type: 'image', image: 'pic', width: 400, height: 300 }),
    );
    // 30% wide at 4:3 on a 2:1 board is 45% of the board's height.
    expect(item).toMatchObject({ type: 'image', w: 30, h: 45 });
    const tall = must(
      newFreeItem(canvas, { type: 'image', image: 'pic', width: 100, height: 400 }),
    );
    expect(tall.h).toBe(100);
    expect(tall.w).toBeCloseTo(12.5, 3);
  });

  it('refuses a link that is not YouTube or Vimeo', () => {
    const { project, id } = withCanvas();
    expect(
      addFreeItem(project, 0, id, { type: 'video', embedUrl: 'https://evil.example/x' }),
    ).toEqual({
      problem: 'Use a YouTube or Vimeo link.',
    });
    expect(addFreeItem(project, 0, 'nope', { type: 'title' })).toEqual({
      problem: 'That section is no longer on this page.',
    });
  });

  it('keeps a new text inside a very short artboard', () => {
    const item = must(newFreeItem({ aspect: 14, items: [] }, { type: 'body' }));
    expect(item.y + item.h).toBeLessThanOrEqual(100);
    expect(item.y).toBeGreaterThanOrEqual(0);
  });
});
