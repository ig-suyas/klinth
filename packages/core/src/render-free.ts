/**
 * Renders a free section's artboard (see free.ts). Each item is a real element
 * (h1/h2/h3, p, img, a, the video facade) in reading order, so screen readers,
 * search engines and phones get a sensible order whatever the visual layout.
 * Inline styles carry only CSS custom properties made from validated numbers.
 */
import { escapeHtml as esc, safeUrl } from './html.ts';
import { freeCanvas, readingOrder, type FreeCanvas, type FreeItem } from './free.ts';
import { lines, paras, sizeAttrs, source, videoEmbed, type BlockCtx } from './render-blocks.ts';

/** Linked only from pages that have a free section. */
export const FREE_CSS_PATH = 'css/free.css';

/** Phones narrower than this get the stacked (or phone) layout. */
const PHONE = '(max-width:37.49rem)';

export const FREE_CSS = `.free-board{position:relative;width:100%;aspect-ratio:var(--ar);container-type:inline-size}
.free-board>.free-item{position:absolute;left:calc(var(--x)*1%);top:calc(var(--y)*1%);width:calc(var(--w)*1%);height:calc(var(--h)*1%);z-index:var(--z);margin:0;max-width:none}
.free-text{font-size:calc(var(--fs)*1cqw);color:var(--fg);overflow-wrap:break-word}
.free-title,.free-subtitle{line-height:1.08}
.free-body{line-height:1.5}
.free-body>p+p{margin-top:.75em}
.free-center{text-align:center}
.free-end{text-align:end}
.free-board>.free-image{object-fit:cover;border-radius:var(--radius)}
.free-board>.free-contain{object-fit:contain}
.free-video>.video-frame{height:100%;aspect-ratio:auto}
.free-board>.free-button{min-height:0;padding:0 1em;font-size:calc(var(--fs,1.4)*1cqw)}
@media ${PHONE}{
.free-stack{aspect-ratio:auto;display:flex;flex-direction:column;align-items:flex-start;gap:calc(var(--space)*2)}
.free-stack>.free-item{position:static;width:auto;height:auto;max-width:100%}
.free-stack>.free-text,.free-stack>.free-video{align-self:stretch}
.free-stack>.free-title{font-size:clamp(2rem,1.2rem + 4vw,2.6rem)}
.free-stack>.free-subtitle{font-size:1.35rem}
.free-stack>.free-body{font-size:1.0625rem}
.free-stack>.free-button{min-height:3rem;padding:.8rem 1.6rem;font-size:1rem}
.free-stack>.free-image{width:100%;height:auto;object-fit:initial}
.free-stack .video-frame{height:auto;aspect-ratio:16/9}
.free-phone{aspect-ratio:var(--par)}
.free-phone>.free-item{left:calc(var(--px)*1%);top:calc(var(--py)*1%);width:calc(var(--pw)*1%);height:calc(var(--ph)*1%)}
.free-phone>.free-hide{display:none}
}
`;

/** True when the page has at least one free section (it then links `css/free.css`). */
export function pageHasFree(page: {
  sections: readonly Parameters<typeof freeCanvas>[0][];
}): boolean {
  return page.sections.some((s) => freeCanvas(s) !== null);
}

/** A validated number as CSS text: at most 3 decimals, never an exponent. */
function num(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
}

function vars(entries: [string, number | undefined][]): string {
  return entries
    .filter((e): e is [string, number] => e[1] !== undefined && Number.isFinite(e[1]))
    .map(([k, v]) => `--${k}:${num(v)};`)
    .join('');
}

function itemAttrs(item: FreeItem, canvas: FreeCanvas, classes: string, ctx: BlockCtx): string {
  const phone = canvas.phoneAspect !== undefined ? item.phone : undefined;
  const size = item.type === 'text' || item.type === 'button' ? item.size : undefined;
  const style = vars([
    ['x', item.x],
    ['y', item.y],
    ['w', item.w],
    ['h', item.h],
    ['z', item.z],
    ['fs', size],
    ['px', phone?.x],
    ['py', phone?.y],
    ['pw', phone?.w],
    ['ph', phone?.h],
  ]);
  const hide = phone?.hidden ? ' free-hide' : '';
  const marker = ctx.editable ? ` data-k-item="${esc(item.id)}"` : '';
  return ` class="${classes}${hide}" style="${style}" data-free="${esc(item.id)}"${marker}`;
}

function renderItem(
  item: FreeItem,
  canvas: FreeCanvas,
  ctx: BlockCtx,
  level: (style: 'title' | 'subtitle') => number,
): string {
  switch (item.type) {
    case 'text': {
      const align = item.align && item.align !== 'start' ? ` free-${item.align}` : '';
      const attrs = itemAttrs(item, canvas, `free-item free-text free-${item.style}${align}`, ctx);
      if (item.style === 'body') return `<div${attrs}>${paras(item.text)}</div>`;
      const h = level(item.style);
      return `<h${h}${attrs}>${lines(item.text)}</h${h}>`;
    }
    case 'image': {
      const asset = ctx.assets.get(item.image);
      if (!asset || asset.kind !== 'image') return '';
      const fit = item.fit === 'contain' ? ' free-contain' : '';
      const loading = ctx.first ? ' fetchpriority="high"' : ' loading="lazy"';
      return `<img${itemAttrs(item, canvas, `free-item free-image${fit}`, ctx)}${source(asset, ctx)} alt="${esc(item.imageAlt ?? '')}"${sizeAttrs(asset)}${loading} decoding="async">`;
    }
    case 'video': {
      const player = videoEmbed(item.embedUrl, (item.title ?? '').trim());
      return player
        ? `<div${itemAttrs(item, canvas, 'free-item free-video', ctx)}>${player}</div>`
        : '';
    }
    case 'button': {
      const variant = item.variant === 'ghost' ? 'button button-ghost' : 'button';
      const attrs = itemAttrs(item, canvas, `${variant} free-item free-button`, ctx);
      const url = safeUrl(item.href);
      // Like every other link: an unsafe or empty address renders as plain text.
      if (!url) return `<span${attrs}>${esc(item.label)}</span>`;
      const external = url.startsWith('https:') ? ' rel="noopener noreferrer"' : '';
      return `<a${attrs} href="${esc(url)}"${external}>${esc(item.label)}</a>`;
    }
  }
}

/** The artboard of a free section (the inside of its `.wrap`). */
export function renderFreeBoard(canvas: FreeCanvas, ctx: BlockCtx): string {
  let titled = false;
  const level = (style: 'title' | 'subtitle'): number => {
    if (style === 'subtitle') return ctx.level + 1;
    // Only the first title takes the section's level (the page's single h1, or h2).
    const h = titled ? 2 : ctx.level;
    titled = true;
    return h;
  };
  const mode = canvas.phoneAspect !== undefined ? 'free-phone' : 'free-stack';
  const style = vars([
    ['ar', canvas.aspect],
    ['par', canvas.phoneAspect],
  ]);
  const items = readingOrder(canvas)
    .map((item) => renderItem(item, canvas, ctx, level))
    .join('');
  return `<div class="free-board ${mode}" style="${style}">${items}</div>`;
}
