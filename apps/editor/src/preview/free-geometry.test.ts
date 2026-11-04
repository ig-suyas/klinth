import { describe, expect, it } from 'vitest';
import { FREE_GRID, clampBox, moveBox, resizeBox, snapBox, type Box } from './free-geometry.ts';

const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });
const inside = (b: Box) => {
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x + b.w).toBeLessThanOrEqual(100 + 1e-9);
  expect(b.y + b.h).toBeLessThanOrEqual(100 + 1e-9);
};

describe('free layout geometry', () => {
  it('clamps a box inside the artboard', () => {
    expect(clampBox(box(-5, -1, 20, 10))).toEqual(box(0, 0, 20, 10));
    expect(clampBox(box(95, 99, 20, 10))).toEqual(box(80, 90, 20, 10));
    expect(clampBox(box(10, 10, 150, 0))).toEqual(box(0, 10, 100, 0.25));
    // Items converted just past an edge (inside the tolerance) come back in on the first move.
    inside(clampBox(box(-1.5, 98, 101.5, 3)));
  });

  it('moves by a percentage and stays inside', () => {
    expect(moveBox(box(10, 10, 20, 20), 5, -2.5)).toEqual(box(15, 7.5, 20, 20));
    expect(moveBox(box(10, 10, 20, 20), 500, 500)).toEqual(box(80, 80, 20, 20));
    expect(moveBox(box(10, 10, 20, 20), -500, -500)).toEqual(box(0, 0, 20, 20));
  });

  it('keeps 3 decimals at most, so the schema and CSS get short numbers', () => {
    const b = moveBox(box(10, 10, 20, 20), 1 / 3, 2 / 3);
    for (const n of Object.values(b)) expect(Math.round(n * 1000) / 1000).toBe(n);
  });

  it('snaps edges and centres to other items and the artboard, then to the grid', () => {
    const targets = { xs: [0, 50, 100, 30], ys: [0, 50, 100] };
    // The left edge is 0.4 away from another item's edge at 30.
    const a = snapBox(box(30.4, 13, 10, 10), targets, 1, 1);
    expect(a.box.x).toBe(30);
    expect(a.gx).toBe(30);
    // The centre lands on the artboard's middle.
    const b = snapBox(box(44.6, 20, 10, 10), targets, 1, 1);
    expect(b.box.x).toBe(45);
    expect(b.gx).toBe(50);
    // Nothing close: the grid takes over.
    const c = snapBox(box(12.3, 7.4, 10, 10), targets, 1, 1);
    expect(c.gx).toBeNull();
    expect(c.box.x % FREE_GRID).toBe(0);
    expect(c.box.y % FREE_GRID).toBe(0);
    // Far from any line and from the grid (threshold 0.1): unchanged.
    const d = snapBox(box(13.7, 8.7, 10, 10), targets, 0.1, 0.1);
    expect(d.box).toEqual(box(13.7, 8.7, 10, 10));
  });

  it('resizes from any handle and never past the edges', () => {
    expect(resizeBox(box(10, 10, 20, 20), 'se', 5, 5, false)).toEqual(box(10, 10, 25, 25));
    expect(resizeBox(box(10, 10, 20, 20), 'nw', 5, 5, false)).toEqual(box(15, 15, 15, 15));
    expect(resizeBox(box(10, 10, 20, 20), 'e', 500, 0, false)).toEqual(box(10, 10, 90, 20));
    expect(resizeBox(box(10, 10, 20, 20), 'w', -500, 0, false)).toEqual(box(0, 10, 30, 20));
    const tiny = resizeBox(box(10, 10, 20, 20), 'se', -500, -500, false);
    expect(tiny.w).toBeGreaterThan(0);
    expect(tiny.h).toBeGreaterThan(0);
    inside(tiny);
  });

  it('locks the aspect ratio for pictures and videos', () => {
    const start = box(10, 10, 40, 20);
    for (const [handle, dx, dy] of [
      ['se', 10, 1],
      ['e', 10, 0],
      ['s', 0, 5],
      ['nw', -6, -1],
      ['ne', 30, -30],
      ['sw', -80, 80],
    ] as const) {
      const b = resizeBox(start, handle, dx, dy, true);
      expect(b.w / b.h).toBeCloseTo(2, 2);
      inside(b);
    }
    // The opposite corner stays put.
    const nw = resizeBox(start, 'nw', -6, -1, true);
    expect(nw.x + nw.w).toBeCloseTo(50, 2);
    expect(nw.y + nw.h).toBeCloseTo(30, 2);
  });
});
