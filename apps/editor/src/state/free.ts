import {
  FREE_BLOCKS,
  MAX_FREE_FONT,
  MIN_FREE_ASPECT,
  MIN_FREE_FONT,
  flowToFree,
  freeCanvas,
  freeToFlow,
  type FlowMeasurement,
  type FreeCanvas,
  type FreeItem,
  type Project,
  type Section,
} from '@klinth/core';
import { clampBox, moveBox, type Box } from '../preview/free-geometry.ts';

/**
 * Pure edits for freely placed sections (see core free.ts). Like sections.ts,
 * each returns a new project; the store validates it before it is applied.
 */

/** The drag that made the owner choose free layout, in px of the preview. */
export interface FreeDrag {
  from: string;
  dx: number;
  dy: number;
}

function sectionAt(project: Project, pageIndex: number, id: string): Section | undefined {
  return project.pages[pageIndex]?.sections.find((s) => s.id === id);
}

function withSection(
  project: Project,
  pageIndex: number,
  id: string,
  edit: (section: Section) => unknown,
): unknown {
  return {
    ...project,
    pages: project.pages.map((page, i) =>
      i === pageIndex
        ? { ...page, sections: page.sections.map((s) => (s.id === id ? edit(s) : s)) }
        : page,
    ),
  };
}

function withCanvas(
  project: Project,
  pageIndex: number,
  id: string,
  edit: (canvas: FreeCanvas) => FreeCanvas,
): unknown {
  const section = sectionAt(project, pageIndex, id);
  const canvas = section ? freeCanvas(section) : null;
  if (!canvas) return project;
  return withSection(project, pageIndex, id, (s) => ({ ...s, canvas: edit(canvas) }));
}

function withItem(
  project: Project,
  pageIndex: number,
  id: string,
  itemId: string,
  edit: (item: FreeItem) => unknown,
): unknown {
  return withCanvas(project, pageIndex, id, (canvas) => ({
    ...canvas,
    items: canvas.items.map((item) => (item.id === itemId ? (edit(item) as FreeItem) : item)),
  }));
}

/** True when the section may switch to a free layout (and is not free yet). */
export function canBeFree(section: Section): boolean {
  return FREE_BLOCKS.has(section.type) && freeCanvas(section) === null;
}

/**
 * "Yes, use free layout": the section becomes free with every element where
 * it was measured, and the element being dragged moves by the drag. One edit,
 * so a single undo goes back to the optimized layout.
 */
export function convertToFree(
  project: Project,
  pageIndex: number,
  id: string,
  measure: FlowMeasurement,
  drag?: FreeDrag,
): { project: unknown; item: string | null; skipped: string[] } | { problem: string } {
  const section = sectionAt(project, pageIndex, id);
  if (!section) return { problem: 'That section is no longer on this page.' };
  if (!canBeFree(section)) return { problem: 'This section cannot be placed freely.' };
  let converted: ReturnType<typeof flowToFree<Section>>;
  try {
    converted = flowToFree(section, measure);
  } catch {
    return { problem: 'The section could not be measured. Try again.' };
  }
  const canvas = freeCanvas(converted.section);
  if (!canvas || canvas.items.length === 0) {
    return { problem: 'Nothing in this section can be placed freely.' };
  }
  // Text was measured exactly as wide as its lines; a little room (2% of its width, never
  // past the artboard) keeps rounding and font hinting at other widths from wrapping it sooner.
  for (const item of canvas.items) {
    if (item.type !== 'text') continue;
    item.w = Math.max(item.w, Math.min(Math.floor(item.w * 1.02 * 1000) / 1000, 100 - item.x));
  }
  const dragged = drag ? canvas.items.find((i) => i.from === drag.from) : undefined;
  if (dragged && drag) {
    const boardHeight = measure.width / canvas.aspect;
    const box = moveBox(dragged, (drag.dx / measure.width) * 100, (drag.dy / boardHeight) * 100);
    Object.assign(dragged, box);
  }
  return {
    project: withSection(project, pageIndex, id, () => converted.section),
    item: dragged?.id ?? canvas.items.at(-1)?.id ?? null,
    skipped: converted.skipped,
  };
}

const round3 = (n: number): number => {
  const v = Math.round(n * 1000) / 1000;
  return Object.is(v, -0) ? 0 : v;
};

/**
 * Text is as tall as its lines (the preview measures it), so it may reach below
 * the artboard. Then the artboard grows (a lower aspect ratio) and every item's
 * vertical numbers shrink by the same factor: nothing moves on screen, and
 * nothing is ever clipped. The artboard never shrinks by itself.
 */
export function growBoard(canvas: FreeCanvas): FreeCanvas {
  const bottom = Math.max(...canvas.items.map((i) => i.y + i.h), 0);
  if (bottom <= 100 + 1e-9) return canvas;
  const aspect = Math.round(canvas.aspect * (100 / bottom) * 10_000) / 10_000;
  if (!(aspect >= MIN_FREE_ASPECT)) {
    // As tall as an artboard can get: keep items inside instead.
    return { ...canvas, items: canvas.items.map((i) => ({ ...i, ...clampBox(i) })) };
  }
  const f = aspect / canvas.aspect;
  return {
    ...canvas,
    aspect,
    items: canvas.items.map((i) => {
      const y = round3(i.y * f);
      const h = Math.min(Math.floor(i.h * f * 1000) / 1000, 100 - y);
      return { ...i, y, h: Math.max(0.25, h) };
    }),
  };
}

/** Text keeps its measured height: only its width and start are kept inside the artboard. */
function placeText(box: Box): Box {
  const clamped = clampBox({ ...box, h: 0.25 });
  return { ...clamped, h: round3(Math.max(0.25, Math.min(10_000, box.h))) };
}

const fontSize = (size: number): number =>
  round3(Math.min(MAX_FREE_FONT, Math.max(MIN_FREE_FONT, size)));

/**
 * New position and size of one item, clamped inside the artboard (or its phone
 * box). `size` is a new text size (a corner handle scales text). A text taller
 * than the artboard makes the artboard grow.
 */
export function setItemBox(
  project: Project,
  pageIndex: number,
  id: string,
  itemId: string,
  box: Box,
  phone = false,
  size?: number,
): unknown {
  return withCanvas(project, pageIndex, id, (canvas) => {
    const items = canvas.items.map((item) => {
      if (item.id !== itemId) return item;
      const sized =
        size !== undefined &&
        Number.isFinite(size) &&
        (item.type === 'text' || item.type === 'button')
          ? { ...item, size: fontSize(size) }
          : item;
      if (phone) return { ...sized, phone: { ...sized.phone, ...clampBox(box) } };
      return { ...sized, ...(item.type === 'text' ? placeText(box) : clampBox(box)) };
    });
    return growBoard({ ...canvas, items });
  });
}

/**
 * The real heights of text items as the preview drew them (in % of the
 * artboard height). Only text heights are automatic; other items keep theirs.
 */
export function measureItems(
  project: Project,
  pageIndex: number,
  id: string,
  heights: readonly { item: string; h: number }[],
): unknown {
  const byId = new Map(heights.map((m) => [m.item, m.h]));
  return withCanvas(project, pageIndex, id, (canvas) =>
    growBoard({
      ...canvas,
      items: canvas.items.map((item) => {
        const h = byId.get(item.id);
        if (item.type !== 'text' || h === undefined || !Number.isFinite(h) || h <= 0) return item;
        return { ...item, h: round3(Math.max(0.25, Math.min(10_000, h))) };
      }),
    }),
  );
}

/** Moves one item by `dx`/`dy` % (arrow keys), clamped inside the artboard. */
export function nudgeItem(
  project: Project,
  pageIndex: number,
  id: string,
  itemId: string,
  dx: number,
  dy: number,
): unknown {
  return withItem(project, pageIndex, id, itemId, (item) => ({
    ...item,
    ...moveBox(item, dx, dy),
  }));
}

/**
 * Bring forward / send back: swaps stacking with the next item above (or
 * below). Equal values are spread out first so every item has its own level.
 */
export function restackItem(
  project: Project,
  pageIndex: number,
  id: string,
  itemId: string,
  by: 'forward' | 'backward',
): unknown {
  const section = sectionAt(project, pageIndex, id);
  const canvas = section ? freeCanvas(section) : null;
  if (!canvas) return project;
  const order = [...canvas.items].sort((a, b) => a.z - b.z);
  const at = order.findIndex((i) => i.id === itemId);
  const to = by === 'forward' ? at + 1 : at - 1;
  if (at < 0 || to < 0 || to >= order.length) return project;
  const moved = order.splice(at, 1);
  order.splice(to, 0, ...moved);
  const z = new Map(order.map((item, i) => [item.id, i]));
  return withCanvas(project, pageIndex, id, (c) => ({
    ...c,
    items: c.items.map((item) => ({ ...item, z: z.get(item.id) ?? item.z })),
  }));
}

/** Changes an item's content or look (text, size, alt text, link...). The store validates it. */
export function updateFreeItem(
  project: Project,
  pageIndex: number,
  id: string,
  itemId: string,
  patch: Record<string, unknown>,
): unknown {
  return withItem(project, pageIndex, id, itemId, (item) => {
    // Empty optional values are left out (a link may be empty: it then shows as text).
    return Object.fromEntries(
      Object.entries({ ...item, ...patch }).filter(
        ([key, value]) => value !== undefined && (value !== '' || key === 'href'),
      ),
    );
  });
}

/** "Return to optimized layout". `dropped` lists items the block could not take back. */
export function returnToFlow(
  project: Project,
  pageIndex: number,
  id: string,
): { project: unknown; dropped: string[] } {
  const section = sectionAt(project, pageIndex, id);
  if (!section) return { project, dropped: [] };
  const back = freeToFlow(section);
  return {
    project: withSection(project, pageIndex, id, () => back.section),
    dropped: back.dropped,
  };
}

/** Width of the artboard on a 768 px tablet (the page's side padding is 4vw each side). */
const TABLET_BOARD_PX = 768 * 0.92;
/** Smallest comfortable text size, in px. */
const READABLE_PX = 12;

/** Text and buttons that would be smaller than 12 px on a tablet (to a tenth of a px). */
export function readableSizeWarnings(canvas: FreeCanvas): { item: string; message: string }[] {
  return canvas.items.flatMap((item) => {
    const size = item.type === 'text' || item.type === 'button' ? item.size : undefined;
    if (size === undefined) return [];
    const px = Math.round((size / 100) * TABLET_BOARD_PX * 10) / 10;
    if (px >= READABLE_PX) return [];
    return [{ item: item.id, message: 'This text may be too small to read on tablets.' }];
  });
}

/** All small-text warnings of a section as one entry (null when there are none). */
export function readabilityGroup(canvas: FreeCanvas): { items: string[]; message: string } | null {
  const items = readableSizeWarnings(canvas).map((w) => w.item);
  if (items.length === 0) return null;
  const n = items.length;
  return { items, message: `${n} ${n === 1 ? 'item' : 'items'} may be too small on tablets` };
}

/** How much two items must overlap (in % of the artboard each way) before a hint shows. */
const OVERLAP = 0.5;

/**
 * Text that overlaps another item: a gentle hint, never a blocker (text over a
 * picture can be on purpose). Uses the measured text heights.
 */
export function overlapWarnings(canvas: FreeCanvas): { item: string; message: string }[] {
  const meets = (a: Box, b: Box) =>
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > OVERLAP &&
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > OVERLAP;
  return canvas.items
    .filter((item) => item.type === 'text')
    .filter((item) => canvas.items.some((other) => other.id !== item.id && meets(item, other)))
    .map((item) => ({ item: item.id, message: 'This text overlaps another item.' }));
}

/** A short name for an item in lists and messages. */
export function itemLabel(item: FreeItem): string {
  const clip = (text: string) => {
    const one = text.replace(/\s+/g, ' ').trim();
    return one.length > 32 ? `${one.slice(0, 31)}…` : one;
  };
  switch (item.type) {
    case 'text':
      return `${item.style === 'title' ? 'Title' : item.style === 'subtitle' ? 'Subtitle' : 'Text'}: ${clip(item.text)}`;
    case 'image':
      return item.imageAlt?.trim() ? `Picture: ${clip(item.imageAlt)}` : 'Picture';
    case 'video':
      return item.title?.trim() ? `Video: ${clip(item.title)}` : 'Video';
    case 'button':
      return `Button: ${clip(item.label)}`;
  }
}
