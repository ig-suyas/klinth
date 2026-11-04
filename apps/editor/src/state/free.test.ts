import { freeCanvas, projectSchema, type FreeItem, type Project } from '@klinth/core';
import { getTemplate } from '@klinth/templates';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  convertToFree,
  nudgeItem,
  readableSizeWarnings,
  restackItem,
  returnToFlow,
  setItemBox,
  updateFreeItem,
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
const itemsOf = (p: Project): FreeItem[] => freeCanvas(heroOf(p))?.items ?? [];

/** What the bridge would measure for the hero, in px inside its `.wrap`. */
const measure = {
  width: 1000,
  height: 500,
  elements: [
    { from: 'eyebrow', x: 0, y: 0, width: 200, height: 20, fontSize: 14 },
    { from: 'heading', x: 0, y: 40, width: 700, height: 160, fontSize: 80 },
    { from: 'subheading', x: 0, y: 220, width: 560, height: 60, fontSize: 21 },
    { from: 'buttons.0', x: 0, y: 320, width: 170, height: 48, fontSize: 16 },
    { from: 'no.such.path', x: 0, y: 0, width: 10, height: 10 },
  ],
};

describe('turning a section free', () => {
  it('places each element where it was measured and keeps the drag', () => {
    const p = portfolio();
    const id = heroOf(p).id;
    const result = convertToFree(p, 0, id, measure, { from: 'heading', dx: 100, dy: -20 });
    if ('problem' in result) throw new Error(result.problem);
    const next = parse(result.project);
    const items = itemsOf(next);
    const heading = items.find((i) => i.from === 'heading');
    // 40 px down on a 500 px board is 8%; the drag adds 10% right and 4% up.
    expect(heading).toMatchObject({ x: 10, y: 4 });
    expect(result.item).toBe(heading?.id);
    expect(items.find((i) => i.from === 'subheading')).toMatchObject({ x: 0, y: 44 });
    expect(result.skipped).toEqual(['no.such.path']);
    // The block's own props are kept for "Return to optimized layout".
    expect(heroOf(next).props).toEqual(heroOf(p).props);
  });

  it('clamps the dragged element inside the artboard', () => {
    const p = portfolio();
    const result = convertToFree(p, 0, heroOf(p).id, measure, {
      from: 'buttons.0',
      dx: 5000,
      dy: 5000,
    });
    if ('problem' in result) throw new Error(result.problem);
    const button = itemsOf(parse(result.project)).find((i) => i.from === 'buttons.0');
    expect((button?.x ?? 0) + (button?.w ?? 0)).toBeLessThanOrEqual(100);
    expect((button?.y ?? 0) + (button?.h ?? 0)).toBeLessThanOrEqual(100);
  });

  it('refuses sections that cannot be free and bad measurements', () => {
    const p = portfolio();
    const footer = p.pages[0]?.sections.find((s) => s.type === 'footer');
    expect(convertToFree(p, 0, footer?.id ?? '', measure)).toHaveProperty('problem');
    expect(convertToFree(p, 0, heroOf(p).id, { ...measure, width: 0 })).toHaveProperty('problem');
    expect(convertToFree(p, 0, 'missing', measure)).toHaveProperty('problem');
  });

  it('drops part animations (a free section only animates as a whole)', () => {
    const p = portfolio();
    const hero = heroOf(p) as { animation?: unknown };
    hero.animation = { section: { preset: 'fade' }, heading: { preset: 'words' } };
    const result = convertToFree(parse(p), 0, heroOf(p).id, measure);
    if ('problem' in result) throw new Error(result.problem);
    expect(heroOf(parse(result.project)).animation).toEqual({ section: { preset: 'fade' } });
  });
});

describe('editing a free section', () => {
  const free = (): Project => {
    const p = portfolio();
    const result = convertToFree(p, 0, heroOf(p).id, measure);
    if ('problem' in result) throw new Error(result.problem);
    return parse(result.project);
  };

  it('moves and resizes an item, always inside the artboard', () => {
    const p = free();
    const [first] = itemsOf(p);
    const moved = parse(
      setItemBox(p, 0, heroOf(p).id, first?.id ?? '', { x: 98, y: -3, w: 20, h: 10 }),
    );
    expect(itemsOf(moved)[0]).toMatchObject({ x: 80, y: 0, w: 20, h: 10 });
  });

  it('nudges with the keyboard and clamps at the edges', () => {
    let p = free();
    const id = itemsOf(p)[1]?.id ?? '';
    p = parse(nudgeItem(p, 0, heroOf(p).id, id, 0.5, 0));
    expect(itemsOf(p)[1]?.x).toBe(0.5);
    for (let i = 0; i < 50; i += 1) p = parse(nudgeItem(p, 0, heroOf(p).id, id, -5, -5));
    expect(itemsOf(p)[1]).toMatchObject({ x: 0, y: 0 });
    for (let i = 0; i < 50; i += 1) p = parse(nudgeItem(p, 0, heroOf(p).id, id, 5, 5));
    const it = itemsOf(p)[1];
    expect((it?.x ?? 0) + (it?.w ?? 0)).toBeCloseTo(100, 3);
    expect((it?.y ?? 0) + (it?.h ?? 0)).toBeCloseTo(100, 3);
  });

  it('brings an item forward and sends it back', () => {
    const p = free();
    const items = itemsOf(p);
    const back = items[0]?.id ?? '';
    const forward = parse(restackItem(p, 0, heroOf(p).id, back, 'forward'));
    const z = (q: Project, id: string) => itemsOf(q).find((i) => i.id === id)?.z ?? -1;
    expect(z(forward, back)).toBeGreaterThan(z(forward, items[1]?.id ?? ''));
    const again = parse(restackItem(forward, 0, heroOf(p).id, back, 'backward'));
    expect(z(again, back)).toBeLessThan(z(again, items[1]?.id ?? ''));
    // Already at the back: nothing changes.
    expect(parse(restackItem(again, 0, heroOf(p).id, back, 'backward'))).toEqual(again);
  });

  it('changes an item’s text and refuses unknown fields', () => {
    const p = free();
    const title = itemsOf(p).find((i) => i.from === 'heading');
    const next = parse(updateFreeItem(p, 0, heroOf(p).id, title?.id ?? '', { text: 'New title' }));
    expect(itemsOf(next).find((i) => i.id === title?.id)).toMatchObject({ text: 'New title' });
    expect(
      projectSchema.safeParse(updateFreeItem(p, 0, heroOf(p).id, title?.id ?? '', { evil: 1 }))
        .success,
    ).toBe(false);
  });

  it('warns about text that would be too small to read on a tablet', () => {
    const p = free();
    const canvas = freeCanvas(heroOf(p));
    if (!canvas) throw new Error('not free');
    // 14 px on a 1000 px board is 1.4 cqw, about 9.9 px on a 707 px tablet board.
    expect(readableSizeWarnings(canvas).map((w) => w.item)).toContain(
      itemsOf(p).find((i) => i.from === 'eyebrow')?.id,
    );
    expect(readableSizeWarnings(canvas).map((w) => w.item)).not.toContain(
      itemsOf(p).find((i) => i.from === 'heading')?.id,
    );
  });

  it('returns to the optimized layout with the edited text', () => {
    const p = free();
    const title = itemsOf(p).find((i) => i.from === 'heading');
    const edited = parse(updateFreeItem(p, 0, heroOf(p).id, title?.id ?? '', { text: 'Edited' }));
    const back = returnToFlow(edited, 0, heroOf(p).id);
    const flow = parse(back.project);
    expect(heroOf(flow).layout).toBeUndefined();
    expect(heroOf(flow).canvas).toBeUndefined();
    expect(heroOf(flow).props).toMatchObject({ heading: 'Edited' });
    expect(back.dropped).toEqual([]);
  });
});

describe('undo and redo across the conversion', () => {
  beforeEach(() => useEditor.getState().close());

  it('steps back to the flow layout and forward again, move by move', () => {
    const p = portfolio();
    const id = heroOf(p).id;
    useEditor.getState().open('p1', p, 0);
    const change = useEditor.getState().change;
    expect(
      change((q) => {
        const r = convertToFree(q, 0, id, measure, { from: 'heading', dx: 50, dy: 0 });
        return 'problem' in r ? q : r.project;
      }),
    ).toBeNull();
    const converted = useEditor.getState().project as Project;
    const item = itemsOf(converted).find((i) => i.from === 'heading')?.id ?? '';
    expect(change((q) => setItemBox(q, 0, id, item, { x: 30, y: 30, w: 40, h: 20 }))).toBeNull();
    expect(change((q) => nudgeItem(q, 0, id, item, 0.5, 0))).toBeNull();

    const now = () => useEditor.getState().project as Project;
    const headingX = () => itemsOf(now()).find((i) => i.id === item)?.x;
    expect(headingX()).toBe(30.5);
    useEditor.getState().undo();
    expect(headingX()).toBe(30);
    useEditor.getState().undo();
    expect(headingX()).toBe(5);
    useEditor.getState().undo();
    expect(heroOf(now()).layout).toBeUndefined();
    expect(now()).toEqual(p);
    useEditor.getState().redo();
    expect(heroOf(now()).layout).toBe('free');
    expect(headingX()).toBe(5);
    useEditor.getState().redo();
    useEditor.getState().redo();
    expect(headingX()).toBe(30.5);
  });
});
