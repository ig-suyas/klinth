import { escapeHtml as esc } from './html.ts';
import { assetPath, renderBlock, renderFooter, type BlockCtx } from './render-blocks.ts';
import type { Asset, Page, Project, Section } from './schema.ts';
import {
  HEADER_CSS,
  HEADER_JS,
  SITE_CSS,
  SITE_CSS_BASE,
  SITE_JS,
  SITE_JS_BASE,
} from './site-assets.ts';
import { fontFaceCss, fontLicense, fontPath, themeFonts } from './fonts.ts';
import { themeToCss } from './tokens.ts';
import { firstSectionBackground, headerCta, headerLayout, headerToCss } from './header.ts';
import { headerShown, navLinkHref, sectionAnchor } from './nav.ts';
import {
  ANIM_CSS,
  ANIM_CSS_PATH,
  ANIM_JS,
  ANIM_JS_PATH,
  headingSplit,
  pageAnimates,
  sectionAnimationMarkup,
} from './animation.ts';
import { freeCanvas, freeTitle } from './free.ts';
import { FREE_CSS, FREE_CSS_PATH, pageHasFree, renderFreeBoard } from './render-free.ts';

export { assetPath };

export interface SiteFile {
  path: string;
  content: string | Uint8Array;
}

export function pagePath(page: Page): string {
  return page.slug === '' ? 'index.html' : `${page.slug}.html`;
}

const sectionHeading = (s: Section): string => {
  const canvas = freeCanvas(s);
  if (canvas) return freeTitle(canvas);
  return 'heading' in s.props ? (s.props.heading ?? '').trim() : '';
};
const sectionNavLabel = (s: Section): string =>
  'navLabel' in s.props ? (s.props.navLabel ?? '').trim() : '';
const sectionBackground = (s: Section): string =>
  'background' in s.props ? (s.props.background ?? 'plain') : 'plain';

interface NavItem {
  href: string;
  label: string;
  current: boolean;
}

/**
 * The owner's chosen links (skipping any whose page or section is gone); without
 * a choice, pages when there are several (unless the menu is off), otherwise
 * sections the user named for the menu.
 */
function navItems(project: Project, page: Page): NavItem[] {
  if (project.meta.navLinks) {
    return project.meta.navLinks.flatMap((link) => {
      const href = navLinkHref(project, link, page);
      const current = link.target.kind === 'page' && link.target.page === page.slug;
      return href ? [{ href, label: link.label, current }] : [];
    });
  }
  if (project.pages.length > 1 && project.meta.pageMenu !== false) {
    return project.pages.map((p) => ({ href: pagePath(p), label: p.title, current: p === page }));
  }
  return page.sections
    .filter((s) => s.type !== 'footer' && sectionNavLabel(s))
    .map((s) => ({ href: `#${sectionAnchor(s)}`, label: sectionNavLabel(s), current: false }));
}

/** Up to this many links stay visible on phones; more go behind a "Menu" button. */
const INLINE_NAV_MAX = 3;

/** Header classes from the header settings; none when the project has no settings (old look). */
function headerClasses(project: Project, page: Page): string {
  const header = project.meta.header;
  if (!header) return '';
  const style = project.meta.headerStyle ?? 'bar';
  const classes = [
    'hdr',
    `hdr-${headerLayout(style, header)}`,
    `hdr-${header.background}`,
    header.sticky ? 'hdr-sticky' : 'hdr-static',
  ];
  if (header.background === 'transparent') {
    classes.push(`hdr-on-${firstSectionBackground(page.sections)}`);
    // Starts see-through over the first section; site.js drops `is-top` once the page scrolls.
    if (header.sticky) classes.push('is-top');
  }
  return ` ${classes.join(' ')}`;
}

function renderBrand(project: Project, home: string, ctx: HeaderCtx): string {
  const logo = project.meta.header?.logo;
  const asset = logo ? ctx.assets.get(logo.image) : undefined;
  if (logo && asset?.kind === 'image') {
    const src = ctx.preview
      ? ` data-k-asset="${esc(asset.id)}"`
      : ` src="${esc(assetPath(asset))}"`;
    const size =
      asset.width && asset.height ? ` width="${asset.width}" height="${asset.height}"` : '';
    return `<a class="brand brand-logo" href="${home}"><img${src} alt="${esc(logo.imageAlt)}"${size} decoding="async"></a>`;
  }
  return `<a class="brand" href="${home}">${esc(project.meta.title)}</a>`;
}

interface HeaderCtx {
  assets: ReadonlyMap<string, Asset>;
  preview: boolean;
  /** Editor preview: the header can be clicked to select it. */
  editable: boolean;
}

function renderHeader(project: Project, page: Page, ctx: HeaderCtx): string {
  const items = navItems(project, page);
  const cta = project.meta.header ? headerCta(project.meta.header) : null;
  const list = items
    .map((item) => {
      const current = item.current ? ' aria-current="page"' : '';
      return `<li><a href="${esc(item.href)}"${current}>${esc(item.label)}</a></li>`;
    })
    .join('');
  // With a button, phones show it inside the menu so the bar never overflows.
  const collapse = items.length > INLINE_NAV_MAX || (cta !== null && items.length > 0);
  const ctaItem = cta
    ? `<li class="menu-cta"><a class="button" href="${esc(cta.href)}">${esc(cta.label)}</a></li>`
    : '';
  // A <details> menu works without JavaScript and causes no layout jump.
  const menu = collapse
    ? `<details class="menu"><summary>Menu</summary><ul class="menu-panel" role="list">${list}${ctaItem}</ul></details>`
    : '';
  const nav = list
    ? `<nav class="nav${collapse ? ' has-menu' : ''}" aria-label="Main"><ul class="nav-links" role="list">${list}</ul>${menu}</nav>`
    : '';
  const button = cta
    ? `<a class="button header-cta" href="${esc(cta.href)}">${esc(cta.label)}</a>`
    : '';
  const home = project.pages.length > 1 ? 'index.html' : '#top';
  const style = project.meta.headerStyle ?? 'bar';
  const classes = `site-header header-${style}${headerClasses(project, page)}${cta ? ' has-cta' : ''}`;
  const marker = ctx.editable ? ' data-k-header' : '';
  return `<header class="${classes}" id="top"${marker}><div class="wrap bar">${renderBrand(project, home, ctx)}${nav}${button}</div></header>`;
}

const MONOGRAM_PATH = 'favicon.svg';

/** Header rules and script, as separate files when only some pages show the header. */
export const HEADER_CSS_PATH = 'css/header.css';
export const HEADER_JS_PATH = 'js/header.js';

/** Which pages show the header: all (one stylesheet as before), none, or some (split files). */
function headerMode(project: Project): 'all' | 'none' | 'some' {
  const shown = project.pages.filter((p) => headerShown(project, p)).length;
  return shown === project.pages.length ? 'all' : shown === 0 ? 'none' : 'some';
}

/** Where the site-wide custom code is exported. Separate files, so nothing is ever inlined. */
export const CUSTOM_CSS_PATH = 'css/custom.css';
export const CUSTOM_JS_PATH = 'js/custom.js';

/** The site-wide CSS and JavaScript, each '' when there is none. */
export function siteCode(project: Project): { css: string; js: string } {
  const css = project.siteCode?.css ?? '';
  const js = project.siteCode?.js ?? '';
  return { css: css.trim() ? css : '', js: js.trim() ? js : '' };
}

const withNewline = (code: string): string => (code.endsWith('\n') ? code : `${code}\n`);

function faviconAsset(project: Project, assets: ReadonlyMap<string, Asset>): Asset | undefined {
  const asset = project.meta.favicon ? assets.get(project.meta.favicon) : undefined;
  return asset?.kind === 'image' ? asset : undefined;
}

/** A favicon from the site's first letter, so browsers never ask for a missing one. */
function monogram(project: Project): string {
  const letter = Array.from(project.meta.title.trim())[0]?.toUpperCase() ?? '';
  const { accent, accentText } = project.theme.colors;
  const radius = Math.min(project.theme.radius, 24);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${radius}" fill="${accent}"/><text x="32" y="34" dominant-baseline="central" text-anchor="middle" font-family="system-ui, sans-serif" font-size="36" font-weight="700" fill="${accentText}">${esc(letter)}</text></svg>\n`;
}

export interface RenderOptions {
  /**
   * Editor preview only: marks sections and editable text with `data-k-*`
   * attributes. Exports never set it, so exported files stay editor-free.
   */
  editable?: boolean;
  /**
   * Editor preview only: files are marked with `data-k-asset` instead of an
   * address, and custom code runs in a nested sandboxed frame. Exports never set it.
   */
  preview?: boolean;
}

/** Preloads the heading font so the first big heading does not shift. Not in the preview. */
function preloadFonts(project: Project, options: RenderOptions): string {
  if (options.preview) return '';
  const [first] = themeFonts(project.theme);
  return first
    ? `<link rel="preload" href="${esc(fontPath(first))}" as="font" type="font/woff2" crossorigin>
`
    : '';
}

function renderPage(
  project: Project,
  page: Page,
  assets: ReadonlyMap<string, Asset>,
  options: RenderOptions,
): string {
  const editable = options.editable === true;
  const { meta } = project;
  const shown = headerShown(project, page);
  // Only when some pages hide the header do the others load its own files.
  const split = shown && headerMode(project) === 'some';
  const code = siteCode(project);
  const animates = pageAnimates(page);
  const free = pageHasFree(page);
  const title = page.slug === '' ? meta.title : `${page.title} | ${meta.title}`;
  const favicon = faviconAsset(project, assets);
  const icon = favicon ? assetPath(favicon) : MONOGRAM_PATH;
  const description = meta.description
    ? `\n<meta name="description" content="${esc(meta.description)}">`
    : '';

  const main = page.sections.filter((s) => s.type !== 'footer');
  const footers = page.sections.filter((s) => s.type === 'footer');
  // The page's first heading is its <h1>; every other section title is an <h2>.
  const h1 = main.findIndex((s) => sectionHeading(s) !== '');
  const body = main
    .map((section, i) => {
      const ctx: BlockCtx = {
        assets,
        level: i === h1 ? 1 : 2,
        first: i === 0,
        editable,
        preview: options.preview === true,
        split: headingSplit(section.animation),
      };
      const bg = sectionBackground(section);
      const marker = editable ? ` data-k-section="${esc(section.id)}"` : '';
      const anim = sectionAnimationMarkup(section.animation, i === 0);
      const canvas = freeCanvas(section);
      const layout = canvas ? ' block-free' : '';
      const inner = canvas ? renderFreeBoard(canvas, ctx) : renderBlock(section, ctx);
      return `<section id="${esc(sectionAnchor(section))}" class="block block-${section.type}${layout} bg-${bg}${anim.classes}"${marker}${anim.attrs}><div class="wrap">${inner}</div></section>`;
    })
    .join('\n');
  const footer = footers
    .map((s) => (s.type === 'footer' ? renderFooter(s.props, editable ? s.id : undefined) : ''))
    .join('');

  return `<!doctype html>
<html lang="${esc(meta.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>${description}
<link rel="icon" href="${esc(icon)}">
<meta name="theme-color" content="${esc(project.theme.colors.background)}">
${preloadFonts(project, options)}<link rel="stylesheet" href="css/site.css">
${animates ? `<link rel="stylesheet" href="${ANIM_CSS_PATH}">\n` : ''}${free ? `<link rel="stylesheet" href="${FREE_CSS_PATH}">\n` : ''}${split ? `<link rel="stylesheet" href="${HEADER_CSS_PATH}">\n` : ''}${code.css ? `<link rel="stylesheet" href="${CUSTOM_CSS_PATH}">\n` : ''}<script src="js/site.js" defer></script>
${animates ? `<script src="${ANIM_JS_PATH}" defer></script>\n` : ''}${split ? `<script src="${HEADER_JS_PATH}" defer></script>\n` : ''}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${shown ? `${renderHeader(project, page, { assets, preview: options.preview === true, editable })}\n` : ''}<main id="main">
${body}
</main>
${footer ? `<footer class="site-footer">${footer}</footer>\n` : ''}${code.js ? `<script src="${CUSTOM_JS_PATH}"></script>\n` : ''}</body>
</html>
`;
}

/**
 * Renders the whole site as text files. Shared by the live preview and the
 * exporter, so what users see is exactly what they export. Asset binaries are
 * added by the exporter.
 */
export function renderSite(project: Project, options: RenderOptions = {}): SiteFile[] {
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const fonts = themeFonts(project.theme);
  const code = siteCode(project);
  const mode = headerMode(project);
  return [
    ...project.pages.map((page) => ({
      path: pagePath(page),
      content: renderPage(project, page, assets, options),
    })),
    // The preview loads fonts through the bridge (its frame has no files next to it).
    {
      path: 'css/site.css',
      content:
        (options.preview ? '' : fontFaceCss(fonts)) +
        themeToCss(project.theme) +
        (mode === 'all' ? headerToCss(project) + SITE_CSS : SITE_CSS_BASE),
    },
    { path: 'js/site.js', content: mode === 'all' ? SITE_JS : SITE_JS_BASE },
    ...(mode === 'some'
      ? [
          { path: HEADER_CSS_PATH, content: headerToCss(project) + HEADER_CSS },
          { path: HEADER_JS_PATH, content: HEADER_JS },
        ]
      : []),
    ...(project.pages.some(pageAnimates)
      ? [
          { path: ANIM_CSS_PATH, content: ANIM_CSS },
          { path: ANIM_JS_PATH, content: ANIM_JS },
        ]
      : []),
    ...(project.pages.some(pageHasFree) ? [{ path: FREE_CSS_PATH, content: FREE_CSS }] : []),
    ...(code.css ? [{ path: CUSTOM_CSS_PATH, content: withNewline(code.css) }] : []),
    ...(code.js ? [{ path: CUSTOM_JS_PATH, content: withNewline(code.js) }] : []),
    ...(faviconAsset(project, assets) ? [] : [{ path: MONOGRAM_PATH, content: monogram(project) }]),
    ...(fonts.length > 0 ? [{ path: `fonts/LICENSE.txt`, content: fontLicense(fonts) }] : []),
  ];
}
