import { escapeHtml as esc } from './html.ts';
import { assetPath, renderBlock, renderFooter, type BlockCtx } from './render-blocks.ts';
import type { Asset, Page, Project, Section } from './schema.ts';
import { SITE_CSS, SITE_JS } from './site-assets.ts';
import { themeToCss } from './tokens.ts';

export { assetPath };

export interface SiteFile {
  path: string;
  content: string | Uint8Array;
}

export function pagePath(page: Page): string {
  return page.slug === '' ? 'index.html' : `${page.slug}.html`;
}

const sectionHeading = (s: Section): string =>
  'heading' in s.props ? (s.props.heading ?? '').trim() : '';
const sectionNavLabel = (s: Section): string =>
  'navLabel' in s.props ? (s.props.navLabel ?? '').trim() : '';
const sectionBackground = (s: Section): string =>
  'background' in s.props ? (s.props.background ?? 'plain') : 'plain';

interface NavItem {
  href: string;
  label: string;
  current: boolean;
}

/** Pages when there are several; otherwise sections the user named for the menu. */
function navItems(project: Project, page: Page): NavItem[] {
  if (project.pages.length > 1) {
    return project.pages.map((p) => ({ href: pagePath(p), label: p.title, current: p === page }));
  }
  return page.sections
    .filter((s) => s.type !== 'footer' && sectionNavLabel(s))
    .map((s) => ({ href: `#${s.id}`, label: sectionNavLabel(s), current: false }));
}

/** Up to this many links stay visible on phones; more go behind a "Menu" button. */
const INLINE_NAV_MAX = 3;

function renderHeader(project: Project, page: Page): string {
  const items = navItems(project, page);
  const list = items
    .map((item) => {
      const current = item.current ? ' aria-current="page"' : '';
      return `<li><a href="${esc(item.href)}"${current}>${esc(item.label)}</a></li>`;
    })
    .join('');
  const collapse = items.length > INLINE_NAV_MAX;
  // A <details> menu works without JavaScript and causes no layout jump.
  const menu = collapse
    ? `<details class="menu"><summary>Menu</summary><ul class="menu-panel" role="list">${list}</ul></details>`
    : '';
  const nav = list
    ? `<nav class="nav${collapse ? ' has-menu' : ''}" aria-label="Main"><ul class="nav-links" role="list">${list}</ul>${menu}</nav>`
    : '';
  const home = project.pages.length > 1 ? 'index.html' : '#top';
  return `<header class="site-header" id="top"><div class="wrap bar"><a class="brand" href="${home}">${esc(project.meta.title)}</a>${nav}</div></header>`;
}

const MONOGRAM_PATH = 'favicon.svg';

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
}

function renderPage(
  project: Project,
  page: Page,
  assets: ReadonlyMap<string, Asset>,
  editable: boolean,
): string {
  const { meta } = project;
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
      const ctx: BlockCtx = { assets, level: i === h1 ? 1 : 2, first: i === 0, editable };
      const bg = sectionBackground(section);
      const marker = editable ? ` data-k-section="${esc(section.id)}"` : '';
      return `<section id="${esc(section.id)}" class="block block-${section.type} bg-${bg}"${marker}><div class="wrap">${renderBlock(section, ctx)}</div></section>`;
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
<link rel="stylesheet" href="css/site.css">
<script src="js/site.js" defer></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${renderHeader(project, page)}
<main id="main">
${body}
</main>
${footer ? `<footer class="site-footer">${footer}</footer>\n` : ''}</body>
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
  return [
    ...project.pages.map((page) => ({
      path: pagePath(page),
      content: renderPage(project, page, assets, options.editable === true),
    })),
    { path: 'css/site.css', content: themeToCss(project.theme) + SITE_CSS },
    { path: 'js/site.js', content: SITE_JS },
    ...(faviconAsset(project, assets) ? [] : [{ path: MONOGRAM_PATH, content: monogram(project) }]),
  ];
}
