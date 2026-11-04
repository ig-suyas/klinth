import type { BlockProps, LinkProps } from './blocks.ts';
import { escapeHtml as esc, safeUrl } from './html.ts';
import type { Asset, Section } from './schema.ts';

/** Per-section render context. */
export interface BlockCtx {
  assets: ReadonlyMap<string, Asset>;
  /** Heading level of the section title: 1 for the page's first heading, otherwise 2. */
  level: 1 | 2;
  /** True for the first section: its images load straight away (they are likely on screen). */
  first: boolean;
  /** Editor preview only: mark text the user can edit in place. Never set for exports. */
  editable?: boolean | undefined;
}

/** In the editor preview, names the prop an element shows so it can be edited in place. */
function field(ctx: { editable?: boolean | undefined }, name: string): string {
  return ctx.editable ? ` data-k-field="${name}"` : '';
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

// ---- Small helpers. Every piece of user text goes through `esc`. ----

/** Escaped text; single line breaks become `<br>`. */
function lines(text: string): string {
  return esc(text.trim()).replace(/\r?\n/g, '<br>');
}

/** Paragraphs split on blank lines. */
function paras(text: string | undefined, className = '', attrs = ''): string {
  const cls = (className ? ` class="${className}"` : '') + attrs;
  return (text ?? '')
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p${cls}>${lines(p)}</p>`)
    .join('');
}

function heading(text: string | undefined, level: number, className: string, attrs = ''): string {
  if (!text?.trim()) return '';
  return `<h${level} class="${className}"${attrs}>${lines(text)}</h${level}>`;
}

function link(item: LinkProps | undefined, className: string, inner?: string): string {
  if (!item) return '';
  const label = esc(item.label);
  if (!label) return '';
  const content = inner ?? label;
  const href = safeUrl(item.href);
  if (!href) return `<span class="${className}">${content}</span>`;
  const external = href.startsWith('https:') ? ' rel="noopener noreferrer"' : '';
  return `<a class="${className}" href="${esc(href)}"${external}>${content}</a>`;
}

interface ImageRef {
  image?: string | undefined;
  imageAlt?: string | undefined;
}

function img(ref: ImageRef, ctx: BlockCtx): string {
  const asset = ref.image ? ctx.assets.get(ref.image) : undefined;
  if (!asset || asset.kind !== 'image') return '';
  const size =
    asset.width && asset.height ? ` width="${asset.width}" height="${asset.height}"` : '';
  const loading = ctx.first ? ' fetchpriority="high"' : ' loading="lazy"';
  return `<img src="${esc(assetPath(asset))}" alt="${esc(ref.imageAlt ?? '')}"${size}${loading} decoding="async">`;
}

interface HeadProps {
  eyebrow?: string | undefined;
  heading?: string | undefined;
  intro?: string | undefined;
}

/** Eyebrow, title and intro shared by most blocks. */
function head(p: HeadProps, ctx: BlockCtx, className = 'head'): string {
  const parts =
    (p.eyebrow ? `<p class="eyebrow"${field(ctx, 'eyebrow')}>${esc(p.eyebrow)}</p>` : '') +
    heading(p.heading, ctx.level, 'title', field(ctx, 'heading')) +
    paras(p.intro, 'intro', field(ctx, 'intro'));
  return parts ? `<div class="${className}">${parts}</div>` : '';
}

const has = (html: string, className: string): string => (html ? ` ${className}` : '');

// ---- Blocks ----

function hero(p: BlockProps<'hero'>, ctx: BlockCtx): string {
  const layout = p.layout ?? 'editorial';
  const media = img(p, ctx);
  const actions = (p.buttons ?? [])
    .map((b, i) => link(b, i === 0 ? 'button' : 'button button-ghost'))
    .join('');
  const text =
    (p.status
      ? `<p class="status"><span class="dot" aria-hidden="true"></span>${esc(p.status)}</p>`
      : '') +
    (p.eyebrow ? `<p class="eyebrow"${field(ctx, 'eyebrow')}>${esc(p.eyebrow)}</p>` : '') +
    heading(p.heading, ctx.level, 'display', field(ctx, 'heading')) +
    paras(p.subheading, 'lede', field(ctx, 'subheading')) +
    (actions ? `<div class="actions">${actions}</div>` : '');
  return `<div class="hero hero-${layout}${has(media, 'has-media')}"><div class="hero-text">${text}</div>${
    media ? `<div class="hero-media">${media}</div>` : ''
  }</div>`;
}

function about(p: BlockProps<'about'>, ctx: BlockCtx): string {
  const media = img(p, ctx);
  const facts = (p.facts ?? [])
    .map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`)
    .join('');
  return `<div class="about${has(media, 'has-media')}">${
    media ? `<div class="about-media">${media}</div>` : ''
  }<div class="about-text">${head(p, ctx)}<div class="prose">${paras(p.body, '', field(ctx, 'body'))}</div>${
    facts ? `<dl class="facts">${facts}</dl>` : ''
  }</div></div>`;
}

function textImage(p: BlockProps<'textImage'>, ctx: BlockCtx): string {
  const media = img(p, ctx);
  const side = p.imageSide ?? 'right';
  const button = link(p.button, 'button');
  return `<div class="split split-${side}${media ? '' : ' no-media'}"><div class="split-text">${head(p, ctx)}<div class="prose">${paras(p.body, '', field(ctx, 'body'))}${
    button ? `<p>${button}</p>` : ''
  }</div></div>${media ? `<div class="split-media">${media}</div>` : ''}</div>`;
}

function gallery(p: BlockProps<'gallery'>, ctx: BlockCtx): string {
  const items = (p.images ?? [])
    .map((item) => {
      const picture = img(item, ctx);
      if (!picture) return '';
      const caption = item.caption ? `<figcaption>${esc(item.caption)}</figcaption>` : '';
      return `<li><figure>${picture}${caption}</figure></li>`;
    })
    .join('');
  return `${head(p, ctx)}${items ? `<ul class="gallery" role="list">${items}</ul>` : ''}`;
}

function video(p: BlockProps<'video'>, ctx: BlockCtx): string {
  // Uploads and YouTube/Vimeo embeds arrive in Phase 4; until then show the text only.
  return `${head(p, ctx)}${paras(p.caption, 'intro', field(ctx, 'caption'))}`;
}

const pad = (n: number): string => String(n).padStart(2, '0');

function projects(p: BlockProps<'projects'>, ctx: BlockCtx): string {
  const items = p.items ?? [];
  const sub = ctx.level + 1;
  if (p.layout === 'list') {
    const rows = items
      .map((item, i) => {
        const meta = [item.tag, item.year].filter(Boolean).map((m) => esc(m ?? ''));
        return `<li><span class="num" aria-hidden="true">${pad(i + 1)}</span><div class="row-main">${heading(item.title, sub, 'row-title')}${paras(item.description, 'row-text')}${link(item.link, 'more')}</div>${
          meta.length ? `<p class="row-meta">${meta.join('<br>')}</p>` : ''
        }</li>`;
      })
      .join('');
    return `${head(p, ctx)}${rows ? `<ol class="index" role="list">${rows}</ol>` : ''}`;
  }
  const cards = items
    .map((item, i) => {
      const picture =
        img(item, { ...ctx, first: false }) ||
        `<span class="cover-num" aria-hidden="true">${pad(i + 1)}</span>`;
      const meta = [item.tag, item.year].filter(Boolean).map((m) => esc(m ?? ''));
      return `<li class="card"><div class="cover cover-${(i % 4) + 1}">${picture}</div><div class="card-body">${
        meta.length
          ? `<p class="card-meta">${meta.join('<span aria-hidden="true"> · </span>')}</p>`
          : ''
      }${heading(item.title, sub, 'card-title')}${paras(item.description, 'card-text')}${link(item.link, 'more stretch')}</div></li>`;
    })
    .join('');
  return `${head(p, ctx)}${cards ? `<ul class="cards" role="list">${cards}</ul>` : ''}`;
}

function testimonials(p: BlockProps<'testimonials'>, ctx: BlockCtx): string {
  const quotes = (p.items ?? [])
    .map(
      (q) =>
        `<figure class="quote"><blockquote>${paras(q.quote)}</blockquote><figcaption><span class="who">${esc(q.name)}</span>${
          q.role ? `<span class="role">${esc(q.role)}</span>` : ''
        }</figcaption></figure>`,
    )
    .join('');
  return `${head(p, ctx)}${quotes ? `<div class="quotes">${quotes}</div>` : ''}`;
}

function links(p: BlockProps<'links'>, ctx: BlockCtx): string {
  const avatar = img(p, ctx);
  const items = (p.items ?? [])
    .map((item) =>
      link(
        item,
        'linkbtn',
        `<span>${esc(item.label)}</span><span class="arrow" aria-hidden="true">→</span>`,
      ),
    )
    .filter(Boolean)
    .map((a) => `<li>${a}</li>`)
    .join('');
  return `<div class="linkpage">${avatar ? `<div class="avatar">${avatar}</div>` : ''}${head(p, ctx)}${
    items ? `<ul class="linklist" role="list">${items}</ul>` : ''
  }</div>`;
}

function contact(p: BlockProps<'contact'>, ctx: BlockCtx): string {
  const mail = p.email ? safeUrl(`mailto:${p.email.trim()}`) : null;
  const tel = p.phone ? safeUrl(`tel:${p.phone.replace(/\s+/g, '')}`) : null;
  const details =
    (mail && p.email ? `<a class="big-link" href="${esc(mail)}">${esc(p.email.trim())}</a>` : '') +
    (tel && p.phone ? `<a class="phone" href="${esc(tel)}">${esc(p.phone)}</a>` : '');
  const action = p.formAction ? safeUrl(p.formAction) : null;
  const form =
    action && action.startsWith('https:')
      ? `<form class="form" action="${esc(action)}" method="post"><label>Your name<input name="name" autocomplete="name" required maxlength="120"></label><label>Your email<input type="email" name="email" autocomplete="email" required maxlength="254"></label><label>Message<textarea name="message" rows="5" required maxlength="5000"></textarea></label><button class="button" type="submit">${esc(p.buttonLabel || 'Send message')}</button></form>`
      : '';
  return `<div class="contact${has(form, 'has-form')}"><div class="contact-text">${head(p, ctx)}${
    details ? `<div class="contact-details">${details}</div>` : ''
  }</div>${form}</div>`;
}

function spacer(p: BlockProps<'spacer'>): string {
  return `<div class="spacer spacer-${p.size ?? 'medium'}" aria-hidden="true"></div>`;
}

/** Renders the inside of one section (not the footer, which the page renders). */
export function renderBlock(section: Section, ctx: BlockCtx): string {
  switch (section.type) {
    case 'hero':
      return hero(section.props, ctx);
    case 'about':
      return about(section.props, ctx);
    case 'textImage':
      return textImage(section.props, ctx);
    case 'gallery':
      return gallery(section.props, ctx);
    case 'video':
      return video(section.props, ctx);
    case 'projects':
      return projects(section.props, ctx);
    case 'testimonials':
      return testimonials(section.props, ctx);
    case 'links':
      return links(section.props, ctx);
    case 'contact':
      return contact(section.props, ctx);
    case 'spacer':
      return spacer(section.props);
    // Custom code is rendered in Phase 4 together with its sandboxed preview.
    case 'customCode':
    case 'footer':
      return '';
  }
}

/** The site footer: text, links and a way back to the top. */
export function renderFooter(p: BlockProps<'footer'>, editSectionId?: string): string {
  const items = (p.links ?? [])
    .map((l) => link(l, 'foot-link'))
    .filter(Boolean)
    .map((a) => `<li>${a}</li>`)
    .join('');
  const edit = editSectionId === undefined ? {} : { editable: true };
  const marker = editSectionId === undefined ? '' : ` data-k-section="${esc(editSectionId)}"`;
  return `<div class="wrap foot"${marker}>${p.text ? `<p class="foot-text"${field(edit, 'text')}>${esc(p.text)}</p>` : ''}${
    items ? `<ul class="foot-links" role="list">${items}</ul>` : ''
  }<a class="totop" href="#top">Back to top <span aria-hidden="true">↑</span></a></div>`;
}
