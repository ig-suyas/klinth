import { fontFaceCss, pagePath, renderSite, themeFonts, type Project } from '@klinth/core';
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
  const extraCss =
    previewFontCss(project, options.fontUrls) +
    PREVIEW_CSS +
    (options.interactive ? BRIDGE_CSS : '') +
    (options.calm ? CALM_CSS : '');
  const config = {
    origin: options.origin,
    scrollY: options.scrollY ?? 0,
    selected: options.selectedId ?? null,
  };
  const bridge = options.interactive
    ? `<script>window.__klinth=${scriptJson(config)};${BRIDGE_JS}</script>\n`
    : '';
  return (
    fileText(files, pagePath(page))
      // The frame has no files next to it, so the favicon would only fail to load.
      .replace(/<link rel="icon" href="[^"]*">\n?/, '')
      // Function replacers: `$` in the inserted text must stay literal.
      .replace(
        '<link rel="stylesheet" href="css/site.css">',
        () => `<style>${css}${extraCss}</style>`,
      )
      .replace('<script src="js/site.js" defer></script>', () => '')
      // Thumbnails run no scripts at all (their frame forbids them).
      .replace('</body>', () =>
        options.interactive ? `<script>${js}</script>\n${bridge}</body>` : '</body>',
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
  z.object({
    source: z.literal('klinth-preview'),
    type: z.literal('scroll'),
    y: z.number().int().min(0).max(1_000_000),
  }),
]);

export type PreviewMessage = z.infer<typeof previewMessageSchema>;
