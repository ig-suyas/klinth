import {
  ANIM_CSS_PATH,
  FREE_BLOCKS,
  MAX_FREE_ITEMS,
  bindPathSchema,
  freeCanvas,
  FREE_CSS_PATH,
  ANIM_JS_PATH,
  CUSTOM_CSS_PATH,
  CUSTOM_JS_PATH,
  HEADER_CSS_PATH,
  HEADER_JS_PATH,
  VIDEO_CSS_PATH,
  VIDEO_JS_PATH,
  EXTRAS_CSS_PATH,
  EXTRAS_JS_PATH,
  fontFaceCss,
  pagePath,
  renderSite,
  siteCode,
  themeFonts,
  type Project,
} from '@klinth/core';
import { z } from 'zod';
import { BRIDGE_CSS, BRIDGE_JS, CALM_CSS, PREVIEW_CSS } from './bridge.ts';

export interface PreviewOptions {
  /** The editor's origin; the frame only posts messages to it. */
  origin: string;
  /** Adds the click-to-select and edit-in-place script. Off for template thumbnails. */
  interactive: boolean;
  /** Turns off the scroll reveal (for reloads after an edit). */
  calm?: boolean;
  scrollY?: number;
  /** The section in view and how far from the top it starts (kept across a full redraw). */
  anchor?: string | null;
  offset?: number;
  /** The reader was at the very bottom: stay there. */
  bottom?: boolean;
  selectedId?: string | null;
  /** Section anchor to show first (after following a header link from another page). */
  scrollTo?: string | null;
  /** `data:` addresses of the bundled fonts by file name (see lib/fonts.ts). */
  fontUrls?: Readonly<Record<string, string>>;
  /** Number of this full redraw; the page answers `ready` with it. */
  load?: number;
  /** The selected item of a free section (its frame is drawn after the redraw). */
  freeItem?: string | null;
}

/** `@font-face` rules for the fonts that are loaded; the rest use their fallbacks. */
function previewFontCss(project: Project, urls: Readonly<Record<string, string>> = {}): string {
  const fonts = themeFonts(project.theme).filter((f) => urls[f.file]);
  return fontFaceCss(fonts, (f) => urls[f.file] ?? '');
}

/** Makes a JSON value safe to place inside an inline `<script>`. */
function scriptJson(value: unknown): string {
  // Escape `<`, U+2028 and U+2029 as JSON unicode escapes.
  const unsafe = new RegExp('[<' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');
  return JSON.stringify(value).replace(
    unsafe,
    (c) => BACKSLASH + 'u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}

const BACKSLASH = String.fromCharCode(92);

/**
 * Pasted CSS for an inline `<style>`. Every `<` becomes the CSS escape `\3c `
 * (same character inside CSS strings, never markup), so it cannot end the element.
 */
const styleText = (css: string): string => css.replace(/</g, () => `${BACKSLASH}3c `);

/**
 * The owner's site-wide code, live only in the interactive preview: that page
 * runs in the shell's inner frame, sandboxed without same-origin. Thumbnails
 * (script-free, editor policy) never get it. The JavaScript travels as a JSON
 * string and runs as a script element, so `</script>` inside it is harmless.
 */
function previewSiteCode(project: Project, interactive: boolean): { css: string; js: string } {
  const code = siteCode(project);
  if (!interactive) return { css: '', js: '' };
  return {
    css: code.css ? `<style data-k-site-css>${styleText(code.css)}</style>\n` : '',
    js: code.js
      ? `<script data-k-site-js>(function(){var s=document.createElement('script');s.textContent=${scriptJson(code.js)};document.body.appendChild(s);})();</script>\n`
      : '',
  };
}

function fileText(files: ReturnType<typeof renderSite>, path: string): string {
  const file = files.find((f) => f.path === path);
  return typeof file?.content === 'string' ? file.content : '';
}

/**
 * Builds the preview of one page as a single HTML document for the sandboxed
 * frame. It uses the same `renderSite` as the export, with the stylesheet and
 * script inlined because a `srcdoc` frame cannot load the site's relative files.
 */
export function buildPreviewDocument(
  project: Project,
  pageIndex: number,
  options: PreviewOptions,
): string {
  const page = project.pages[pageIndex] ?? project.pages[0];
  if (!page) return '';
  // `preview`: files are filled in by the bridge, custom code runs in a nested sandbox.
  const files = renderSite(project, { editable: options.interactive, preview: true });
  const css = fileText(files, 'css/site.css');
  const js = fileText(files, 'js/site.js');
  const html = fileText(files, pagePath(page));
  // Only when some pages hide the header; inlined on the pages that show it.
  const headerJsTag = `<script src="${HEADER_JS_PATH}" defer></script>\n`;
  const headerJs = html.includes(headerJsTag) ? fileText(files, HEADER_JS_PATH) : '';
  const custom = previewSiteCode(project, options.interactive);
  // Only on pages with an animation; their own files, inlined like the rest.
  const animJsTag = `<script src="${ANIM_JS_PATH}" defer></script>\n`;
  const animJs = html.includes(animJsTag) ? fileText(files, ANIM_JS_PATH) : '';
  // Only on pages with styled or several videos (carousel, deck, one at a time).
  const videoJsTag = `<script src="${VIDEO_JS_PATH}" defer></script>\n`;
  const videoJs = html.includes(videoJsTag) ? fileText(files, VIDEO_JS_PATH) : '';
  // Only on pages with a rotating headline, stack, marquee, fold or giant text reveal.
  const extrasJsTag = `<script src="${EXTRAS_JS_PATH}" defer></script>\n`;
  const extrasJs = html.includes(extrasJsTag) ? fileText(files, EXTRAS_JS_PATH) : '';
  const extraCss =
    previewFontCss(project, options.fontUrls) +
    PREVIEW_CSS +
    (options.interactive ? BRIDGE_CSS : '') +
    (options.calm ? CALM_CSS : '');
  const config = {
    origin: options.origin,
    load: options.load ?? 0,
    scrollY: options.scrollY ?? 0,
    anchor: options.anchor ?? null,
    offset: options.offset ?? 0,
    bottom: options.bottom === true,
    selected: options.selectedId ?? null,
    page: page.slug,
    scrollTo: options.scrollTo ?? null,
    // Sections whose elements may be dragged out of the optimized layout, and free ones.
    freeable: page.sections
      .filter((s) => FREE_BLOCKS.has(s.type) && freeCanvas(s) === null)
      .map((s) => s.id),
    free: page.sections.filter((s) => freeCanvas(s) !== null).map((s) => s.id),
    item: options.freeItem ?? null,
  };
  const bridge = options.interactive
    ? `<script>window.__klinth=${scriptJson(config)};${BRIDGE_JS}</script>\n`
    : '';
  return (
    html
      // The frame has no files next to it, so the favicon would only fail to load.
      .replace(/<link rel="icon" href="[^"]*">\n?/, '')
      // Function replacers: `$` in the inserted text must stay literal.
      .replace(
        '<link rel="stylesheet" href="css/site.css">',
        () => `<style>${css}${extraCss}</style>`,
      )
      .replace(
        `<link rel="stylesheet" href="${HEADER_CSS_PATH}">\n`,
        () => `<style>${fileText(files, HEADER_CSS_PATH)}</style>\n`,
      )
      .replace(headerJsTag, () => '')
      .replace(
        `<link rel="stylesheet" href="${ANIM_CSS_PATH}">\n`,
        () => `<style>${fileText(files, ANIM_CSS_PATH)}</style>\n`,
      )
      .replace(animJsTag, () => '')
      .replace(
        `<link rel="stylesheet" href="${FREE_CSS_PATH}">\n`,
        () => `<style>${fileText(files, FREE_CSS_PATH)}</style>\n`,
      )
      .replace(
        `<link rel="stylesheet" href="${VIDEO_CSS_PATH}">\n`,
        () => `<style>${fileText(files, VIDEO_CSS_PATH)}</style>\n`,
      )
      .replace(videoJsTag, () => '')
      .replace(
        `<link rel="stylesheet" href="${EXTRAS_CSS_PATH}">\n`,
        () => `<style>${fileText(files, EXTRAS_CSS_PATH)}</style>\n`,
      )
      .replace(extrasJsTag, () => '')
      .replace(`<link rel="stylesheet" href="${CUSTOM_CSS_PATH}">\n`, () => custom.css)
      .replace(`<script src="${CUSTOM_JS_PATH}"></script>\n`, () => custom.js)
      .replace('<script src="js/site.js" defer></script>', () => '')
      // Thumbnails run no scripts at all (their frame forbids them).
      .replace('</body>', () =>
        options.interactive
          ? `<script>${js}${headerJs ? `\n${headerJs}` : ''}${animJs ? `\n${animJs}` : ''}${videoJs ? `\n${videoJs}` : ''}${extrasJs ? `\n${extrasJs}` : ''}</script>\n${bridge}</body>`
          : '</body>',
      )
  );
}

const sectionId = z.string().max(64);
const itemId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
/** Pixels in the preview: finite and of a sane size. */
const px = z.number().finite().min(-100_000).max(100_000);
const percent = z.number().finite().min(-1_000).max(1_000);

/** Messages the preview frame may send. Anything else is ignored. */
export const previewMessageSchema = z.discriminatedUnion('type', [
  /** The empty preview page has loaded and waits for the page to show. */
  z.object({ source: z.literal('klinth-preview'), type: z.literal('host') }),
  z.object({
    source: z.literal('klinth-preview'),
    type: z.literal('ready'),
    load: z.number().int().min(0).max(1_000_000_000).optional(),
  }),
  z.object({
    source: z.literal('klinth-preview'),
    type: z.literal('select'),
    id: z.string().max(64),
  }),
  z.object({
    source: z.literal('klinth-preview'),
    type: z.literal('edit'),
    id: z.string().max(64),
    field: z.enum(['eyebrow', 'heading', 'intro', 'subheading', 'body', 'caption', 'text']),
    value: z.string().max(10_000),
  }),
  /** The header was clicked (not one of its links). */
  z.object({ source: z.literal('klinth-preview'), type: z.literal('header') }),
  /** The "×" on the header toolbar. */
  z.object({ source: z.literal('klinth-preview'), type: z.literal('removeHeader') }),
  /** A header link to another page (and maybe a section on it): the preview switches page. */
  z.object({
    source: z.literal('klinth-preview'),
    type: z.literal('navigate'),
    page: z
      .string()
      .max(60)
      .regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/),
    anchor: z
      .string()
      .regex(/^[A-Za-z][\w-]{0,63}$/)
      .optional(),
  }),
  z.object({
    source: z.literal('klinth-preview'),
    type: z.literal('scroll'),
    y: z.number().int().min(0).max(1_000_000),
    /** The first section in view, and where it starts in the window. */
    anchor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .optional(),
    offset: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    bottom: z.boolean().optional(),
  }),
  /** A section swap did not fit the page: the editor redraws it whole. */
  z.object({ source: z.literal('klinth-preview'), type: z.literal('patchFailed') }),
  /** Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y pressed inside the preview. */
  z.object({
    source: z.literal('klinth-preview'),
    type: z.literal('history'),
    action: z.enum(['undo', 'redo']),
  }),
  /** A double-clicked element was dragged past the threshold: ask before going free. */
  z.object({
    source: z.literal('klinth-preview'),
    type: z.literal('freeIntent'),
    id: sectionId,
    from: bindPathSchema,
    dx: px,
    dy: px,
    measure: z.object({
      width: z.number().finite().positive().max(100_000),
      height: z.number().finite().positive().max(100_000),
      elements: z
        .array(
          z.object({
            from: bindPathSchema,
            x: px,
            y: px,
            width: z.number().finite().min(0).max(100_000),
            height: z.number().finite().min(0).max(100_000),
            fontSize: z.number().finite().positive().max(1_000).optional(),
            lineHeight: z.number().finite().positive().max(10_000).optional(),
          }),
        )
        .max(MAX_FREE_ITEMS),
    }),
  }),
  /** Where the element is while the pointer is still held after a `freeIntent`. */
  z.object({ source: z.literal('klinth-preview'), type: z.literal('freeDrag'), dx: px, dy: px }),
  /** The pointer was let go after a `freeIntent`. */
  z.object({ source: z.literal('klinth-preview'), type: z.literal('freeDrop'), dx: px, dy: px }),
  /** An item of a free section was selected (or none). */
  z.object({
    source: z.literal('klinth-preview'),
    type: z.literal('freeSelect'),
    id: sectionId,
    item: itemId.nullable(),
  }),
  /** An item was moved, resized or nudged; the preview already shows it. */
  z.object({
    source: z.literal('klinth-preview'),
    type: z.literal('freeChange'),
    id: sectionId,
    item: itemId,
    box: z.object({ x: percent, y: percent, w: percent, h: percent }),
    /** New text size (cqw) after a corner handle scaled the item; clamped again by the editor. */
    size: z.number().finite().min(0).max(100).optional(),
    nudge: z.literal(true).optional(),
    phone: z.literal(true).optional(),
  }),
  /** How tall the text items really are (in % of the artboard height), measured after drawing. */
  z.object({
    source: z.literal('klinth-preview'),
    type: z.literal('freeMeasure'),
    id: sectionId,
    items: z
      .array(z.object({ item: itemId, h: z.number().finite().positive().max(10_000) }))
      .min(1)
      .max(MAX_FREE_ITEMS),
  }),
  /** Text of a free item edited in place. */
  z.object({
    source: z.literal('klinth-preview'),
    type: z.literal('freeText'),
    id: sectionId,
    item: itemId,
    text: z.string().min(1).max(10_000),
  }),
]);

export type PreviewMessage = z.infer<typeof previewMessageSchema>;
