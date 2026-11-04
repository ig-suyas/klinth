import {
  ANIM_CSS_PATH,
  FREE_CSS_PATH,
  ANIM_JS_PATH,
  CUSTOM_CSS_PATH,
  CUSTOM_JS_PATH,
  HEADER_CSS_PATH,
  HEADER_JS_PATH,
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
  selectedId?: string | null;
  /** Section anchor to show first (after following a header link from another page). */
  scrollTo?: string | null;
  /** `data:` addresses of the bundled fonts by file name (see lib/fonts.ts). */
  fontUrls?: Readonly<Record<string, string>>;
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
  const extraCss =
    previewFontCss(project, options.fontUrls) +
    PREVIEW_CSS +
    (options.interactive ? BRIDGE_CSS : '') +
    (options.calm ? CALM_CSS : '');
  const config = {
    origin: options.origin,
    scrollY: options.scrollY ?? 0,
    selected: options.selectedId ?? null,
    page: page.slug,
    scrollTo: options.scrollTo ?? null,
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
      .replace(`<link rel="stylesheet" href="${CUSTOM_CSS_PATH}">\n`, () => custom.css)
      .replace(`<script src="${CUSTOM_JS_PATH}"></script>\n`, () => custom.js)
      .replace('<script src="js/site.js" defer></script>', () => '')
      // Thumbnails run no scripts at all (their frame forbids them).
      .replace('</body>', () =>
        options.interactive
          ? `<script>${js}${headerJs ? `\n${headerJs}` : ''}${animJs ? `\n${animJs}` : ''}</script>\n${bridge}</body>`
          : '</body>',
      )
  );
}

/** Messages the preview frame may send. Anything else is ignored. */
export const previewMessageSchema = z.discriminatedUnion('type', [
  /** The empty preview page has loaded and waits for the page to show. */
  z.object({ source: z.literal('klinth-preview'), type: z.literal('host') }),
  z.object({ source: z.literal('klinth-preview'), type: z.literal('ready') }),
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
  }),
]);

export type PreviewMessage = z.infer<typeof previewMessageSchema>;
