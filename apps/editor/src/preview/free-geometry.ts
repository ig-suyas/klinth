/**
 * Box arithmetic for the free layout, in % of the artboard (0-100 both ways).
 * Used by the editor and by the preview script: each function is
 * self-contained (no outside names, only plain numbers and Math), because
 * bridge.ts copies its source into the sandboxed preview frame.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Snap grid step, in % of the artboard. */
export const FREE_GRID = 2.5;

/** Keeps a box fully inside the artboard, at least 0.25% in each direction. 3 decimals. */
export function clampBox(box: Box): Box {
  const min = 0.25;
  const r = (n: number) => {
    const v = Math.round(n * 1000) / 1000;
    return Object.is(v, -0) ? 0 : v;
  };
  const w = r(Math.min(100, Math.max(min, box.w)));
  const h = r(Math.min(100, Math.max(min, box.h)));
  return {
    x: r(Math.min(100 - w, Math.max(0, box.x))),
    y: r(Math.min(100 - h, Math.max(0, box.y))),
    w,
    h,
  };
}

/** The box moved by `dx`/`dy` (in %), kept inside the artboard. */
export function moveBox(box: Box, dx: number, dy: number): Box {
  const min = 0.25;
  const r = (n: number) => {
    const v = Math.round(n * 1000) / 1000;
    return Object.is(v, -0) ? 0 : v;
  };
  const w = r(Math.min(100, Math.max(min, box.w)));
  const h = r(Math.min(100, Math.max(min, box.h)));
  return {
    x: r(Math.min(100 - w, Math.max(0, box.x + dx))),
    y: r(Math.min(100 - h, Math.max(0, box.y + dy))),
    w,
    h,
  };
}

/**
 * Snaps a moved box. Its left edge, centre or right edge goes to the nearest
 * line in `targets.xs` closer than `tx` (same for `ys`, `ty`); without a line
 * close enough, its start goes to the grid when that is close enough. A
 * threshold of 0 turns snapping off on that axis. Returns the guide lines hit.
 */
export function snapBox(
  box: Box,
  targets: { xs: readonly number[]; ys: readonly number[] },
  tx: number,
  ty: number,
): { box: Box; gx: number | null; gy: number | null } {
  const grid = 2.5;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  const axis = (start: number, size: number, lines: readonly number[], limit: number) => {
    let best: { start: number; line: number; d: number } | null = null;
    const edges = [0, size / 2, size];
    for (const line of lines) {
      for (const offset of edges) {
        const d = Math.abs(start + offset - line);
        if (d < limit && (!best || d < best.d)) best = { start: line - offset, line, d };
      }
    }
    if (best) return { start: best.start, line: best.line as number | null };
    const cell = Math.round(start / grid) * grid;
    return { start: Math.abs(cell - start) < limit ? cell : start, line: null };
  };
  const ax = axis(box.x, box.w, targets.xs, tx);
  const ay = axis(box.y, box.h, targets.ys, ty);
  return {
    box: {
      x: r(Math.min(100 - box.w, Math.max(0, ax.start))),
      y: r(Math.min(100 - box.h, Math.max(0, ay.start))),
      w: box.w,
      h: box.h,
    },
    gx: ax.line,
    gy: ay.line,
  };
}

/**
 * The box resized by dragging `handle` by `dx`/`dy` (in %). The opposite edge
 * or corner stays put. With `lock`, the width/height ratio stays the same
 * (pictures and videos). Never past the artboard, never below 0.25%.
 */
export function resizeBox(start: Box, handle: string, dx: number, dy: number, lock: boolean): Box {
  const min = 0.25;
  const r = (n: number) => {
    const v = Math.round(n * 1000) / 1000;
    return Object.is(v, -0) ? 0 : v;
  };
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const hx = handle.includes('e') ? 'e' : handle.includes('w') ? 'w' : '';
  const vy = handle.includes('s') ? 's' : handle.includes('n') ? 'n' : '';
  const left = start.x;
  const top = start.y;
  const right = start.x + start.w;
  const bottom = start.y + start.h;
  if (!lock || start.w <= 0 || start.h <= 0) {
    const l = hx === 'w' ? clamp(left + dx, 0, right - min) : left;
    const rt = hx === 'e' ? clamp(right + dx, left + min, 100) : right;
    const t = vy === 'n' ? clamp(top + dy, 0, bottom - min) : top;
    const b = vy === 's' ? clamp(bottom + dy, top + min, 100) : bottom;
    return { x: r(l), y: r(t), w: r(rt - l), h: r(b - t) };
  }
  const ratio = start.w / start.h;
  const wantW = hx === 'e' ? start.w + dx : hx === 'w' ? start.w - dx : start.w;
  const wantH = vy === 's' ? start.h + dy : vy === 'n' ? start.h - dy : start.h;
  let w: number;
  if (hx && vy) {
    w = Math.abs(dx / start.w) >= Math.abs(dy / start.h) ? wantW : wantH * ratio;
  } else if (hx) {
    w = wantW;
  } else {
    w = wantH * ratio;
  }
  const roomX = hx === 'w' ? right : 100 - left;
  const roomY = vy === 'n' ? bottom : 100 - top;
  w = clamp(w, Math.max(min, min * ratio), Math.min(roomX, roomY * ratio));
  const h = w / ratio;
  const x = hx === 'w' ? right - w : left;
  const y = vy === 'n' ? bottom - h : top;
  // Floor the size so rounding never pushes the far edge past the artboard.
  const f = (n: number) => Math.floor(n * 1000) / 1000;
  return { x: r(x), y: r(y), w: f(w), h: f(h) };
}
