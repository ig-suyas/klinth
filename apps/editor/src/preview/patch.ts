/**
 * Preview updates without a reload. The preview document is split into its
 * sections (each `<section>` in `<main>` carries a stable `data-section-id`),
 * the styles in `<head>`, and everything else. Comparing two splits says what
 * the frame needs:
 *
 * - only some sections changed: swap just those (`patch`, sections only);
 * - only styles changed (theme colours, fonts, site-wide CSS): new style text in place;
 * - anything else (header, footer, page scripts, sections added, removed or moved,
 *   or a changed section that needs its own script set up again): a full redraw.
 *
 * The section HTML is the renderer's own output (already escaped), the same
 * text a full redraw would show.
 */

const MAIN_OPEN = '<main id="main">\n';
const MAIN_CLOSE = '\n</main>';
const ID = /^<section id="[^"]*" [^>]*?data-section-id="([A-Za-z0-9_-]{1,64})"/;

/**
 * Sections whose page scripts hold on to their elements (marquees, parallax,
 * rotating headlines, stacks, folds, carousels, videos, free layout): when one
 * of them changes, the page is redrawn so those scripts start again.
 */
const SCRIPTED =
  /data-anim-(?:media|heading)="marquee"|data-anim-(?:media|background)="parallax"|data-rotator|data-stack|data-marquee|data-fold|gt-reveal|data-carousel|data-deck|<video|block-free/;

export interface PreviewSplit {
  /** The document without section contents and style text. */
  frame: string;
  /** Text of each `<style>` in `<head>`, in order. */
  styles: string[];
  /** Section ids in page order. */
  order: string[];
  /** Each section's full `<section>` HTML. */
  sections: Map<string, string>;
}

export type PreviewPlan =
  | { kind: 'full' }
  | { kind: 'patch'; sections: { id: string; html: string }[]; styles: string[] | null };

/** Splits a preview document; null when it does not look like one. */
export function splitPreview(doc: string): PreviewSplit | null {
  const start = doc.indexOf(MAIN_OPEN);
  const end = doc.lastIndexOf(MAIN_CLOSE);
  if (start < 0 || end < start) return null;
  const body = doc.slice(start + MAIN_OPEN.length, end);
  const order: string[] = [];
  const sections = new Map<string, string>();
  for (const chunk of body === '' ? [] : body.split(/\n(?=<section id=")/)) {
    const id = ID.exec(chunk)?.[1];
    if (!id || !chunk.endsWith('</section>') || sections.has(id)) return null;
    order.push(id);
    sections.set(id, chunk);
  }
  const outside = `${doc.slice(0, start)}${MAIN_OPEN}${doc.slice(end)}`;
  const headEnd = outside.indexOf('</head>');
  if (headEnd < 0) return null;
  const styles: string[] = [];
  // `<noscript>` content is not a style element while scripts run; it stays in the frame.
  const head = outside
    .slice(0, headEnd)
    .replace(
      /<noscript>[\s\S]*?<\/noscript>|<style([^>]*)>([\s\S]*?)<\/style>/g,
      (match, attrs: string | undefined, css: string | undefined) => {
        if (match.startsWith('<noscript')) return match;
        styles.push(css ?? '');
        return `<style${attrs ?? ''}></style>`;
      },
    );
  return { frame: head + outside.slice(headEnd), styles, order, sections };
}

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** What the frame needs to go from `prev` to `next`. */
export function planUpdate(prev: PreviewSplit | null, next: PreviewSplit | null): PreviewPlan {
  if (!prev || !next) return { kind: 'full' };
  if (prev.frame !== next.frame || !same(prev.order, next.order)) return { kind: 'full' };
  if (prev.styles.length !== next.styles.length) return { kind: 'full' };
  const sections: { id: string; html: string }[] = [];
  for (const id of next.order) {
    const before = prev.sections.get(id) ?? '';
    const after = next.sections.get(id) ?? '';
    if (before === after) continue;
    if (SCRIPTED.test(before) || SCRIPTED.test(after)) return { kind: 'full' };
    sections.push({ id, html: after });
  }
  return { kind: 'patch', sections, styles: same(prev.styles, next.styles) ? null : next.styles };
}
