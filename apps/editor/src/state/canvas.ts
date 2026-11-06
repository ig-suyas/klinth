import {
  freeCanvas,
  parseVideoUrl,
  resizeCanvas,
  type BlockProps,
  type FreeCanvas,
  type FreeItem,
  type Project,
  type Section,
} from '@klinth/core';
import { growBoard } from './free.ts';
import { tidy, type Props } from './sections.ts';

/**
 * Pure edits for blank canvases and for adding items to any free section.
 * Like sections.ts, each returns a new project; the store validates it.
 */

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

/**
 * New settings for a blank canvas. A height change reshapes the artboard
 * (items stay where they are on screen, the lowest is never cut off). Picking
 * a color or gradient for the first time starts from the site's own colors.
 */
export function setCanvasProps(
  project: Project,
  pageIndex: number,
  id: string,
  props: Props,
): unknown {
  const next = tidy(props);
  const { colors } = project.theme;
  if ((next.fill === 'color' || next.fill === 'gradient') && next.color === undefined) {
    next.color = colors.accent;
  }
  if (next.fill === 'gradient' && next.colorTo === undefined) next.colorTo = colors.text;
  return withSection(project, pageIndex, id, (s) => {
    const canvas = freeCanvas(s);
    if (s.type !== 'canvas' || !canvas) return { ...s, props: next };
    return {
      ...s,
      props: next,
      canvas: resizeCanvas(canvas, next as BlockProps<'canvas'>),
    };
  });
}

/** What can be added to a free section from the panel. */
export type NewItem =
  | { type: 'title' | 'subtitle' | 'body' }
  | { type: 'button' }
  | { type: 'image'; image: string; width?: number | undefined; height?: number | undefined }
  | { type: 'video'; embedUrl: string };

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

const TEXT = {
  title: { text: 'Your heading', size: 5, w: 60, lines: 1, leading: 1.15 },
  subtitle: { text: 'A smaller heading', size: 2.5, w: 50, lines: 1, leading: 1.25 },
  body: { text: 'Write a few words here.', size: 1.5, w: 45, lines: 2, leading: 1.5 },
} as const;

/**
 * A new item, a little below and right of the last one added, in front of
 * everything. Pictures and videos keep their shape; a text that would reach
 * below the artboard makes it grow (as when typing).
 */
export function newFreeItem(canvas: FreeCanvas, add: NewItem): FreeItem | null {
  const ids = new Set(canvas.items.map((i) => i.id));
  let n = canvas.items.length + 1;
  while (ids.has(`i${n}`)) n += 1;
  const step = canvas.items.length % 5;
  const ar = canvas.aspect;
  const z = Math.min(9999, Math.max(-1, ...canvas.items.map((i) => i.z)) + 1);
  const place = (w: number, h: number) => {
    const width = Math.min(w, 100);
    const x = Math.min(8 + step * 4, 100 - width);
    const y = Math.max(0, Math.min(8 + step * 6, 100 - h));
    return { id: `i${n}`, x: round3(x), y: round3(y), w: round3(width), h: round3(h), z };
  };
  // Keeps a picture or video inside the artboard at its own shape.
  const fit = (w: number, shape: number) => {
    const h = w * ar * shape;
    return h <= 100 ? [w, h] : [(w * 100) / h, 100];
  };
  switch (add.type) {
    case 'title':
    case 'subtitle':
    case 'body': {
      const t = TEXT[add.type];
      // Text height in % of the artboard: size (% of its width) x lines x line height x aspect.
      const h = Math.min(100, t.size * t.lines * t.leading * ar);
      return { ...place(t.w, h), type: 'text', style: add.type, text: t.text, size: t.size };
    }
    case 'button':
      return {
        ...place(18, Math.min(100, 1.4 * 3.2 * ar)),
        type: 'button',
        label: 'Button',
        href: '',
        size: 1.4,
      };
    case 'image': {
      const shape = add.width && add.height ? add.height / add.width : 0.75;
      const [w = 30, h = 30] = fit(30, shape);
      return { ...place(w, h), type: 'image', image: add.image };
    }
    case 'video': {
      if (!parseVideoUrl(add.embedUrl)) return null;
      const [w = 40, h = 22.5] = fit(40, 9 / 16);
      return { ...place(w, h), type: 'video', embedUrl: add.embedUrl.trim() };
    }
  }
}

/** Adds an item to a free section (a blank canvas or a converted one). */
export function addFreeItem(
  project: Project,
  pageIndex: number,
  id: string,
  add: NewItem,
): { project: unknown; item: string } | { problem: string } {
  const section = project.pages[pageIndex]?.sections.find((s) => s.id === id);
  const canvas = section ? freeCanvas(section) : null;
  if (!section || !canvas) return { problem: 'That section is no longer on this page.' };
  const item = newFreeItem(canvas, add);
  if (!item) return { problem: 'Use a YouTube or Vimeo link.' };
  const next = growBoard({ ...canvas, items: [...canvas.items, item] });
  return {
    project: withSection(project, pageIndex, id, (s) => ({ ...s, canvas: next })),
    item: item.id,
  };
}
