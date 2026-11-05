/**
 * Free layout resizing like common design tools: corners scale text (font
 * size too) so it keeps its wrapping, sides change only the width, text height
 * is automatic, and the artboard grows to hold its lowest item.
 */
import { freeCanvas, projectSchema, type FreeItem, type Project } from '@klinth/core';
import { getTemplate } from '@klinth/templates';
import { beforeEach, describe, expect, it } from 'vitest';
import { scaleBox, widthBox } from '../preview/free-geometry.ts';
import {
  convertToFree,
  measureItems,
  overlapWarnings,
  readabilityGroup,
  setItemBox,
} from './free.ts';
import { useEditor } from './store.ts';

const portfolio = (): Project => {
  const template = getTemplate('portfolio');
  if (!template) throw new Error('missing template');
  return template.create();
};
const parse = (value: unknown): Project => projectSchema.parse(value);
const heroOf = (p: Project) => {
  const hero = p.pages[0]?.sections[0];
  if (!hero) throw new Error('no hero');
  return hero;
};
const canvasOf = (p: Project) => {
  const c = freeCanvas(heroOf(p));
  if (!c) throw new Error('not free');
  return c;
};
const itemsOf = (p: Project): FreeItem[] => canvasOf(p).items;
const byFrom = (p: Project, from: string) => {
  const item = itemsOf(p).find((i) => i.from === from);
  if (!item) throw new Error(`${from} missing`);
  return item;
};

const measure = {
  width: 1000,
  height: 500,
  elements: [
    { from: 'eyebrow', x: 0, y: 0, width: 200, height: 20, fontSize: 14 },
    { from: 'heading', x: 0, y: 40, width: 700, height: 160, fontSize: 80 },
    { from: 'subheading', x: 0, y: 220, width: 560, height: 60, fontSize: 21 },
    { from: 'buttons.0', x: 0, y: 320, width: 170, height: 48, fontSize: 16 },
    { from: 'buttons.1', x: 190, y: 320, width: 170, height: 48, fontSize: 16 },
  ],
};
const free = (): Project => {
  const p = portfolio();
  const result = convertToFree(p, 0, heroOf(p).id, measure);
  if ('problem' in result) throw new Error(result.problem);
  return parse(result.project);
};

describe('turning free keeps the text wrapping as it was', () => {
  it('gives text a little room, so rounding never pushes a word onto a new line', () => {
    const p = free();
    // The eyebrow was measured exactly as wide as its text (200 px of 1000).
    expect(byFrom(p, 'eyebrow').w).toBeGreaterThan(20);
    expect(byFrom(p, 'eyebrow').w).toBeLessThanOrEqual(21);
    // Never past the artboard's edge.
    const wide = convertToFree(portfolio(), 0, heroOf(portfolio()).id, {
      ...measure,
      elements: [{ from: 'heading', x: 0, y: 40, width: 1000, height: 160, fontSize: 80 }],
    });
    if ('problem' in wide) throw new Error(wide.problem);
    expect(byFrom(parse(wide.project), 'heading').w).toBe(100);
    // Buttons and pictures keep their measured width.
    expect(byFrom(p, 'buttons.0').w).toBe(17);
  });
});

describe('corner handles scale proportionally', () => {
  const start = { x: 10, y: 10, w: 40, h: 20 };
  const limits = { min: 1, max: 20, grow: true };

  it('scales the box and the font size by the same factor (text keeps its wrapping)', () => {
    const r = scaleBox(start, 'se', 10, 0, 4, limits);
    expect(r.box).toEqual({ x: 10, y: 10, w: 50, h: 25 });
    expect(r.size).toBe(5);
    expect(r.size / 4).toBeCloseTo(r.box.w / start.w, 3);
  });

  it('keeps the opposite corner in place', () => {
    const r = scaleBox(start, 'nw', 10, 5, 4, limits);
    expect(r.box.x + r.box.w).toBeCloseTo(50, 3);
    expect(r.box.y + r.box.h).toBeCloseTo(30, 3);
    expect(r.box.w).toBe(30);
    expect(r.size).toBe(3);
  });

  it('stays within the minimum and maximum text size', () => {
    expect(scaleBox(start, 'se', -39, 0, 4, limits).size).toBe(1);
    expect(scaleBox(start, 'se', -39, 0, 4, limits).box.w).toBe(10);
    expect(scaleBox({ ...start, x: 0, w: 10 }, 'se', 90, 0, 15, limits).size).toBe(20);
    // A size already under the minimum may stay, but never shrinks further.
    expect(scaleBox(start, 'se', -30, 0, 0.6, limits).size).toBe(0.6);
  });

  it('never goes past the side edges; text may grow downwards (the artboard grows)', () => {
    const wide = scaleBox(start, 'se', 200, 0, 4, limits);
    expect(wide.box.x + wide.box.w).toBeLessThanOrEqual(100);
    const low = scaleBox({ x: 10, y: 80, w: 40, h: 20 }, 'se', 20, 0, 4, limits);
    expect(low.box.y + low.box.h).toBeGreaterThan(100);
    const kept = scaleBox({ x: 10, y: 80, w: 40, h: 20 }, 'se', 20, 0, 4, {
      ...limits,
      grow: false,
    });
    expect(kept.box.y + kept.box.h).toBeLessThanOrEqual(100);
  });
});

describe('side handles change the width only', () => {
  const start = { x: 10, y: 10, w: 40, h: 20 };

  it('moves one edge and leaves the height alone', () => {
    expect(widthBox(start, 'e', 10, 5)).toEqual({ x: 10, y: 10, w: 50, h: 20 });
    expect(widthBox(start, 'w', 10, 5)).toEqual({ x: 20, y: 10, w: 30, h: 20 });
  });

  it('never gets narrower than the minimum width (the longest word)', () => {
    expect(widthBox(start, 'e', -39, 12).w).toBe(12);
    const left = widthBox(start, 'w', 39, 12);
    expect(left.w).toBe(12);
    expect(left.x + left.w).toBe(50);
  });

  it('stays inside the artboard', () => {
    expect(widthBox(start, 'e', 200, 5).w).toBe(90);
    expect(widthBox(start, 'w', -200, 5)).toMatchObject({ x: 0, w: 50 });
  });
});

describe('the artboard grows to hold its lowest item', () => {
  it('grows instead of pulling tall text up, keeping every item where it was', () => {
    const p = free();
    const id = heroOf(p).id;
    const before = canvasOf(p);
    const title = byFrom(p, 'heading');
    const subtitle = byFrom(p, 'subheading');
    // The title got bigger: its text is now as tall as the old artboard.
    const next = parse(setItemBox(p, 0, id, title.id, { ...title, h: 100 }, false, 9));
    const after = canvasOf(next);
    const grown = itemsOf(next).find((i) => i.id === title.id) as FreeItem;
    expect(grown.y + grown.h).toBeLessThanOrEqual(100.001);
    expect(after.aspect).toBeLessThan(before.aspect);
    // Same place in px of a 1000 px wide board: y% of the board height (width / aspect).
    const px = (y: number, aspect: number) => (y / 100) * (1000 / aspect);
    expect(px(grown.y, after.aspect)).toBeCloseTo(px(title.y, before.aspect), 0);
    const sub = itemsOf(next).find((i) => i.id === subtitle.id) as FreeItem;
    expect(px(sub.y, after.aspect)).toBeCloseTo(px(subtitle.y, before.aspect), 0);
    expect(grown).toMatchObject({ size: 9 });
  });

  it('takes the measured height of text from the preview', () => {
    const p = free();
    const id = heroOf(p).id;
    const title = byFrom(p, 'heading');
    const next = parse(measureItems(p, 0, id, [{ item: title.id, h: 50 }]));
    expect(itemsOf(next).find((i) => i.id === title.id)?.h).toBe(50);
    expect(canvasOf(next).aspect).toBe(canvasOf(p).aspect);
    // Taller than the board: the board grows.
    const tall = parse(measureItems(p, 0, id, [{ item: title.id, h: 120 }]));
    expect(canvasOf(tall).aspect).toBeLessThan(canvasOf(p).aspect);
    for (const i of itemsOf(tall)) expect(i.y + i.h).toBeLessThanOrEqual(100.001);
    // Only text heights are automatic.
    const button = byFrom(p, 'buttons.0');
    const same = parse(measureItems(p, 0, id, [{ item: button.id, h: 40 }]));
    expect(itemsOf(same).find((i) => i.id === button.id)?.h).toBe(button.h);
  });

  it('keeps the font size within bounds when a size arrives', () => {
    const p = free();
    const title = byFrom(p, 'heading');
    const next = parse(setItemBox(p, 0, heroOf(p).id, title.id, title, false, 400));
    expect(itemsOf(next).find((i) => i.id === title.id)).toMatchObject({ size: 25 });
  });
});

describe('things to check, grouped', () => {
  it('lists small text once per section, with every item it applies to', () => {
    const p = free();
    const group = readabilityGroup(canvasOf(p));
    expect(group?.items).toEqual(
      expect.arrayContaining([byFrom(p, 'eyebrow').id, byFrom(p, 'buttons.0').id]),
    );
    expect(group?.items).not.toContain(byFrom(p, 'heading').id);
    expect(group?.message).toBe(`${group?.items.length} items may be too small on tablets`);
  });

  it('says nothing when no text crosses the threshold', () => {
    const p = free();
    const big = itemsOf(p).map((i) =>
      i.type === 'text' || i.type === 'button' ? { ...i, size: 1.7 } : i,
    );
    expect(readabilityGroup({ ...canvasOf(p), items: big })).toBeNull();
  });

  it('gives a gentle hint when text overlaps another item', () => {
    const p = free();
    expect(overlapWarnings(canvasOf(p))).toEqual([]);
    const title = byFrom(p, 'heading');
    const sub = byFrom(p, 'subheading');
    const overlapping = parse(setItemBox(p, 0, heroOf(p).id, sub.id, { ...sub, y: title.y + 2 }));
    const hints = overlapWarnings(canvasOf(overlapping));
    expect(hints.map((h) => h.item)).toEqual(expect.arrayContaining([sub.id]));
  });
});

describe('measurements do not add undo steps', () => {
  beforeEach(() => useEditor.getState().close());

  it('amends the current step', () => {
    const p = free();
    useEditor.getState().open('p1', p, 0);
    const title = byFrom(p, 'heading');
    expect(
      useEditor
        .getState()
        .amend((q) => measureItems(q, 0, heroOf(q).id, [{ item: title.id, h: 40 }])),
    ).toBeNull();
    expect(useEditor.getState().past).toHaveLength(0);
    expect(byFrom(useEditor.getState().project as Project, 'heading').h).toBe(40);
    expect(useEditor.getState().save.status).toBe('unsaved');
  });
});
