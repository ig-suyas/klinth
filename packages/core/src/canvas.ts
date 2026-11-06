/**
 * Blank canvas: a section placed freely from the start (see free.ts), with a
 * height in % of the screen height or in px, a smallest height and a color,
 * gradient or picture behind it.
 *
 * The artboard keeps the free layout's maths (positions in % of its width,
 * nominal height = width / aspect). Its aspect is the content width over the
 * chosen height on a reference screen (1440 x 900, content 1120 px wide), so
 * there the artboard fills the section exactly; on other screens the section
 * keeps its height and the artboard sits in its middle, scaled like every free
 * layout. Colors reach CSS only as three whole numbers each.
 */
import {
  CANVAS_MAX_DIM,
  CANVAS_MAX_MIN_HEIGHT,
  CANVAS_PX,
  CANVAS_VH,
  type BlockProps,
} from './blocks.ts';
import { contrastRatio } from './contrast.ts';
import {
  FREE_TOLERANCE,
  MAX_FREE_ASPECT,
  MIN_FREE_ASPECT,
  MIN_FREE_SIZE,
  type FreeCanvas,
} from './free.ts';
import { escapeHtml as esc } from './html.ts';
import type { Asset } from './schema.ts';

type CanvasProps = BlockProps<'canvas'>;

/** The presets, in % of the screen height. */
export const CANVAS_PRESET_VH = { quarter: 25, half: 50, threeQuarter: 75, full: 100 } as const;
/** Custom heights when none is typed yet. */
export const CANVAS_DEFAULT_VH = 50;
export const CANVAS_DEFAULT_PX = 480;
/** The screen the artboard's shape is worked out for: content width and screen height in px. */
export const CANVAS_REF = { width: 1120, viewport: 900 } as const;

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
const finiteOr = (n: number | undefined, fallback: number): number =>
  n !== undefined && Number.isFinite(n) ? n : fallback;

/** The chosen height: a share of the screen height (`vh`) or a fixed size (`px`). */
export function canvasHeight(p: CanvasProps): { unit: 'vh' | 'px'; value: number } {
  const preset = p.height ?? 'half';
  if (preset !== 'custom') return { unit: 'vh', value: CANVAS_PRESET_VH[preset] };
  if (p.heightUnit === 'px') {
    return {
      unit: 'px',
      value: Math.round(
        clamp(finiteOr(p.heightPx, CANVAS_DEFAULT_PX), CANVAS_PX.min, CANVAS_PX.max),
      ),
    };
  }
  return {
    unit: 'vh',
    value: Math.round(clamp(finiteOr(p.heightVh, CANVAS_DEFAULT_VH), CANVAS_VH.min, CANVAS_VH.max)),
  };
}

/** The smallest height in px (0 = none). */
export function canvasMinHeight(p: CanvasProps): number {
  return Math.round(clamp(finiteOr(p.minHeight, 0), 0, CANVAS_MAX_MIN_HEIGHT));
}

/** The section's height in px on a screen `viewportHeight` px tall. */
export function canvasHeightPx(p: CanvasProps, viewportHeight: number): number {
  const { unit, value } = canvasHeight(p);
  const h = unit === 'vh' ? (value * Math.max(0, finiteOr(viewportHeight, 0))) / 100 : value;
  return Math.max(h, canvasMinHeight(p));
}

const round = (n: number, places: number): number => {
  const f = 10 ** places;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
};

/** Artboard width / height so it fills the section on the reference screen. */
export function canvasAspect(
  p: CanvasProps,
  ref: { width: number; viewport: number } = CANVAS_REF,
): number {
  const h = Math.max(1, canvasHeightPx(p, ref.viewport));
  return round(clamp(ref.width / h, MIN_FREE_ASPECT, MAX_FREE_ASPECT), 4);
}

/**
 * The canvas after a height change: the new shape, with every item kept where
 * it is on screen (same distance from the top, same size). The artboard never
 * becomes too short for its lowest item; then it stops at that item.
 */
export function resizeCanvas(canvas: FreeCanvas, p: CanvasProps): FreeCanvas {
  const old = canvas.aspect;
  let next = canvasAspect(p);
  const bottom = Math.max(0, ...canvas.items.map((i) => i.y + i.h));
  // Vertical numbers scale by next / old; the lowest item must stay within 100%.
  if (bottom > 100 * (old / next)) {
    next = clamp(
      Math.floor(((100 * old) / bottom) * 10_000) / 10_000,
      MIN_FREE_ASPECT,
      MAX_FREE_ASPECT,
    );
  }
  const f = next / old;
  if (f === 1) return { ...canvas, aspect: next };
  const items = canvas.items.map((item) => {
    const h = round(clamp(item.h * f, MIN_FREE_SIZE, 100 + 2 * FREE_TOLERANCE), 3);
    const y = round(clamp(item.y * f, -FREE_TOLERANCE, 100 + FREE_TOLERANCE - h), 3);
    return { ...item, y, h };
  });
  return { ...canvas, aspect: next, items };
}

/** `#rrggbb` as three whole numbers, or null for anything else. */
export function hexToRgb(hex: string | undefined): [number, number, number] | null {
  const m = hex ? /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) : null;
  if (!m) return null;
  return [parseInt(m[1] ?? '', 16), parseInt(m[2] ?? '', 16), parseInt(m[3] ?? '', 16)];
}

const rgbVars = (prefix: string, rgb: readonly number[]): string =>
  `--${prefix}r:${rgb[0]};--${prefix}g:${rgb[1]};--${prefix}b:${rgb[2]};`;

/** True when white text reads better than dark text on the canvas background. */
export function canvasIsDark(p: CanvasProps): boolean {
  const fill = p.fill ?? 'none';
  const dark = (hex: string | undefined) =>
    hexToRgb(hex) !== null &&
    contrastRatio(hex as string, '#ffffff') > contrastRatio(hex as string, '#111111');
  if (fill === 'color') return dark(p.color);
  if (fill === 'gradient')
    return (
      hexToRgb(p.color) !== null && hexToRgb(p.colorTo) !== null && dark(p.color) && dark(p.colorTo)
    );
  if (fill === 'image') return p.image !== undefined && finiteOr(p.dim, 0) >= 40;
  return false;
}

/** Classes on the `<section>` of a blank canvas. */
export function canvasClasses(p: CanvasProps): string {
  return ` canvas-${canvasHeight(p).unit}${canvasIsDark(p) ? ' canvas-dark' : ''}`;
}

interface CanvasCtx {
  assets: ReadonlyMap<string, Asset>;
  first: boolean;
  /** Where a file is loaded from (its path, or the preview's marker). */
  source: (asset: Asset) => string;
  sizeAttrs: (asset: Asset) => string;
}

/** What sits behind the artboard: nothing, a color, a gradient or a picture. */
function canvasFill(p: CanvasProps, ctx: CanvasCtx): string {
  const fill = p.fill ?? 'none';
  if (fill === 'color') {
    const c = hexToRgb(p.color);
    return c
      ? `<div class="canvas-fill fill-color" style="${rgbVars('c1', c)}" aria-hidden="true"></div>`
      : '';
  }
  if (fill === 'gradient') {
    const a = hexToRgb(p.color);
    const b = hexToRgb(p.colorTo);
    if (!a || !b) return '';
    const angle = Math.round(clamp(finiteOr(p.angle, 180), 0, 360));
    return `<div class="canvas-fill fill-gradient" style="${rgbVars('c1', a)}${rgbVars('c2', b)}--ga:${angle};" aria-hidden="true"></div>`;
  }
  if (fill === 'image') {
    const asset = p.image ? ctx.assets.get(p.image) : undefined;
    if (!asset || asset.kind !== 'image') return '';
    const loading = ctx.first ? ' fetchpriority="high"' : ' loading="lazy"';
    const dim = Math.round(clamp(finiteOr(p.dim, 0), 0, CANVAS_MAX_DIM));
    return `<img class="canvas-fill canvas-img"${ctx.source(asset)} alt=""${ctx.sizeAttrs(asset)}${loading} decoding="async">${
      dim > 0
        ? `<div class="canvas-fill canvas-dim" style="--dim:${dim};" aria-hidden="true"></div>`
        : ''
    }`;
  }
  return '';
}

/** The inside of a blank canvas `<section>`: its background, then the sized area with the artboard. */
export function renderCanvasInner(p: CanvasProps, board: string, ctx: CanvasCtx): string {
  const { value } = canvasHeight(p);
  const min = canvasMinHeight(p);
  const style = `--ch:${value};${min > 0 ? `--cmin:${min};` : ''}`;
  return `${canvasFill(p, ctx)}<div class="wrap canvas-wrap" style="${esc(style)}">${board}</div>`;
}

/** Blank canvas rules, added to `css/free.css` only when the site has a blank canvas. */
export const CANVAS_CSS = `.block-canvas{position:relative;isolation:isolate;padding-block:0;overflow:hidden}
.canvas-wrap{display:grid;align-content:center;min-height:max(calc(var(--cmin,0)*1px),calc(var(--ch,50)*1vh))}
.canvas-vh>.canvas-wrap{min-height:max(calc(var(--cmin,0)*1px),calc(var(--ch,50)*1svh))}
.canvas-px>.canvas-wrap{min-height:max(calc(var(--cmin,0)*1px),calc(var(--ch,480)*1px))}
.canvas-fill{position:absolute;inset:0;z-index:-1;width:100%;height:100%;pointer-events:none}
img.canvas-fill{max-width:none;object-fit:cover}
.fill-color{background:rgb(var(--c1r) var(--c1g) var(--c1b))}
.fill-gradient{background:linear-gradient(calc(var(--ga,180)*1deg),rgb(var(--c1r) var(--c1g) var(--c1b)),rgb(var(--c2r) var(--c2g) var(--c2b)))}
.canvas-dim{background:rgb(0 0 0/calc(var(--dim,0)*1%))}
.canvas-dark{--fg:#fff;--muted:rgb(255 255 255/.8);--link:#fff;--ring:#fff;--line:rgb(255 255 255/.3);color:#fff}
`;
