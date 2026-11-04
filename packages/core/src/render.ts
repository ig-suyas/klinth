import { escapeHtml as esc, safeUrl } from './html.ts';
import type { Asset, Page, Project, Section } from './schema.ts';
import { themeToCss } from './tokens.ts';

export interface SiteFile {
  path: string;
  content: string | Uint8Array;
}

const EXT: Record<Asset['mime'], string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export function assetPath(asset: Asset): string {
  return `assets/${asset.id}.${EXT[asset.mime]}`;
}

export function pagePath(page: Page): string {
  return page.slug === '' ? 'index.html' : `${page.slug}.html`;
}

// ---- Safe prop readers (props are untrusted JSON) ----

type Props = Section['props'];

function str(props: Props, key: string, fallback = ''): string {
  const v = props[key];
  return typeof v === 'string' ? v : fallback;
}

function list(props: Props, key: string): Props[] {
  const v = props[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Props => typeof x === 'object' && x !== null && !Array.isArray(x));
}

interface Ctx {
  assets: Map<string, Asset>;
}

function link(item: Props, className: string): string {
  const href = safeUrl(str(item, 'href'));
  const label = esc(str(item, 'label'));
  if (!label) return '';
  if (!href) return `<span class="${className}">${label}</span>`;
  const external = href.startsWith('https:') ? ' rel="noopener noreferrer"' : '';
  return `<a class="${className}" href="${esc(href)}"${external}>${label}</a>`;
}

function image(props: Props, ctx: Ctx, key = 'image'): string {
  const asset = ctx.assets.get(str(props, key));
  if (!asset || asset.kind !== 'image') return '';
  const alt = esc(str(props, `${key}Alt`));
  return `<img src="${esc(assetPath(asset))}" alt="${alt}" loading="lazy" decoding="async">`;
}

function heading(props: Props, tag: 'h1' | 'h2' = 'h2'): string {
  const text = str(props, 'heading');
  return text ? `<${tag}>${esc(text)}</${tag}>` : '';
}

function paragraphs(props: Props, key = 'body'): string {
  return str(props, key)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join('');
}

// ---- Blocks ----

type BlockRenderer = (props: Props, ctx: Ctx) => string;

const BLOCKS: Record<Section['type'], BlockRenderer> = {
  hero: (p) =>
    `${heading(p, 'h1')}${paragraphs(p, 'subheading')}${list(p, 'buttons')
      .map((b) => link(b, 'button'))
      .join('')}`,
  about: (p, ctx) => `${image(p, ctx)}${heading(p)}${paragraphs(p)}`,
  textImage: (p, ctx) =>
    `<div class="split"><div>${heading(p)}${paragraphs(p)}</div>${image(p, ctx)}</div>`,
  gallery: (p, ctx) =>
    `${heading(p)}<div class="grid">${list(p, 'images')
      .map((img) => image(img, ctx))
      .join('')}</div>`,
  // Embeds and uploads land in Phase 4; until then show the caption only.
  video: (p) => `${heading(p)}${paragraphs(p, 'caption')}`,
  projects: (p, ctx) =>
    `${heading(p)}<div class="grid">${list(p, 'items')
      .map(
        (item) =>
          `<article class="card">${image(item, ctx)}<h3>${esc(str(item, 'title'))}</h3>${paragraphs(item, 'description')}${link(item, 'more')}</article>`,
      )
      .join('')}</div>`,
  testimonials: (p) =>
    `${heading(p)}<div class="grid">${list(p, 'items')
      .map(
        (item) =>
          `<figure class="card"><blockquote>${esc(str(item, 'quote'))}</blockquote><figcaption>${esc(str(item, 'name'))}</figcaption></figure>`,
      )
      .join('')}</div>`,
  links: (p) =>
    `${heading(p)}<ul class="links">${list(p, 'items')
      .map((item) => link(item, 'button'))
      .filter(Boolean)
      .map((a) => `<li>${a}</li>`)
      .join('')}</ul>`,
  contact: (p) => {
    const email = str(p, 'email');
    const mail = email ? safeUrl(`mailto:${email}`) : null;
    return `${heading(p)}${paragraphs(p)}${mail ? `<a class="button" href="${esc(mail)}">${esc(email)}</a>` : ''}`;
  },
  footer: (p) => `<p>${esc(str(p, 'text'))}</p>`,
  // Custom code is rendered in Phase 4 together with its sandboxed preview.
  customCode: () => '',
  spacer: (p) => {
    const size = p.size === 'small' || p.size === 'large' ? p.size : 'medium';
    return `<div class="spacer spacer-${size}" aria-hidden="true"></div>`;
  },
};

function renderSection(section: Section, ctx: Ctx): string {
  const tag = section.type === 'footer' ? 'footer' : 'section';
  const inner = BLOCKS[section.type](section.props, ctx);
  return `<${tag} id="${esc(section.id)}" class="block block-${section.type}"><div class="wrap">${inner}</div></${tag}>`;
}

function renderNav(project: Project, current: Page): string {
  if (project.pages.length < 2) return '';
  const items = project.pages
    .map((p) => {
      const currentAttr = p === current ? ' aria-current="page"' : '';
      return `<li><a href="${esc(pagePath(p))}"${currentAttr}>${esc(p.title)}</a></li>`;
    })
    .join('');
  return `<nav class="nav" aria-label="Main"><div class="wrap"><ul>${items}</ul></div></nav>`;
}

function renderPage(project: Project, page: Page, ctx: Ctx): string {
  const { meta } = project;
  const title = page.slug === '' ? meta.title : `${page.title} | ${meta.title}`;
  const favicon = meta.favicon ? ctx.assets.get(meta.favicon) : undefined;
  const iconTag =
    favicon?.kind === 'image' ? `\n<link rel="icon" href="${esc(assetPath(favicon))}">` : '';
  const description = meta.description
    ? `\n<meta name="description" content="${esc(meta.description)}">`
    : '';
  const body = page.sections.map((s) => renderSection(s, ctx)).join('\n');
  return `<!doctype html>
<html lang="${esc(meta.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>${description}${iconTag}
<link rel="stylesheet" href="css/site.css">
<script src="js/site.js" defer></script>
</head>
<body>
${renderNav(project, page)}
<main>
${body}
</main>
</body>
</html>
`;
}

const BASE_CSS = `*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--color-bg);color:var(--color-text);font-family:var(--font-body);line-height:1.6}
h1,h2,h3{font-family:var(--font-heading);line-height:1.15;margin:0 0 calc(var(--space)*2)}
h1{font-size:clamp(2.5rem,7vw,5rem)}
h2{font-size:clamp(1.75rem,4vw,2.75rem)}
img{max-width:100%;height:auto;display:block;border-radius:var(--radius)}
a{color:var(--color-accent)}
:focus-visible{outline:3px solid var(--color-accent);outline-offset:3px}
.wrap{max-width:72rem;margin:0 auto;padding:0 calc(var(--space)*3)}
.block{padding:calc(var(--space)*10) 0}
.nav ul,.links{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:calc(var(--space)*2)}
.nav{padding:calc(var(--space)*2) 0}
.links{flex-direction:column;max-width:28rem}
.button{display:inline-block;padding:calc(var(--space)*1.5) calc(var(--space)*3);background:var(--color-accent);color:var(--color-accent-text);border-radius:var(--radius);text-decoration:none;font-weight:600}
.grid{display:grid;gap:calc(var(--space)*3);grid-template-columns:repeat(auto-fill,minmax(16rem,1fr))}
.split{display:grid;gap:calc(var(--space)*5);align-items:center}
@media (min-width:48rem){.split{grid-template-columns:1fr 1fr}}
.card{background:var(--color-surface);border-radius:var(--radius);padding:calc(var(--space)*3);margin:0}
figcaption,.block-footer{color:var(--color-muted)}
.block-footer{padding:calc(var(--space)*4) 0}
.spacer-small{height:calc(var(--space)*2)}.spacer-medium{height:calc(var(--space)*6)}.spacer-large{height:calc(var(--space)*12)}
.reveal{opacity:0;transform:translateY(16px);transition:opacity .6s ease,transform .6s ease}
.reveal.is-visible{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}}
`;

const SITE_JS = `(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.block .wrap').forEach(function (el) {
    el.classList.add('reveal');
    io.observe(el);
  });
})();
`;

/**
 * Renders the whole site as text files. Shared by the live preview and the
 * exporter, so what users see is exactly what they export. Asset binaries are
 * added by the exporter.
 */
export function renderSite(project: Project): SiteFile[] {
  const ctx: Ctx = { assets: new Map(project.assets.map((a) => [a.id, a])) };
  return [
    ...project.pages.map((page) => ({
      path: pagePath(page),
      content: renderPage(project, page, ctx),
    })),
    { path: 'css/site.css', content: themeToCss(project.theme) + BASE_CSS },
    { path: 'js/site.js', content: SITE_JS },
  ];
}
