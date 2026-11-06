import type { BlockProps, LinkProps } from './blocks.ts';
import { PROVIDER_NAME, embedPageUrl, embedPlayerUrl, parseVideoUrl } from './embed.ts';
import { escapeHtml as esc, safeUrl } from './html.ts';
import type { Asset, Section } from './schema.ts';
import { splitAttrs, splitLines, splitText, type SplitMode } from './animation.ts';
import { videoLayout, videoMaxWidth, videoStyled } from './video.ts';

/** Per-section render context. */
export interface BlockCtx {
  assets: ReadonlyMap<string, Asset>;
  /** Heading level of the section title: 1 for the page's first heading, otherwise 2. */
  level: 1 | 2;
  /** True for the first section: its images load straight away (they are likely on screen). */
  first: boolean;
  /** Editor preview only: mark text the user can edit in place. Never set for exports. */
  editable?: boolean | undefined;
  /**
   * Editor preview only: files get no address (the editor hands them to the
   * frame) and custom code runs in a nested sandboxed frame. Never set for exports.
   */
  preview?: boolean | undefined;
  /** The section's heading appears word by word or letter by letter (see animation.ts). */
  split?: SplitMode | undefined;
}

/** In the editor preview, names the prop an element shows so it can be edited in place. */
function field(ctx: { editable?: boolean | undefined }, name: string): string {
  return ctx.editable ? ` data-k-field="${name}" data-k-from="${name}"` : '';
}

/**
 * In the editor preview, names the prop path an element shows (`buttons.0`,
 * `items.2.image`), so the editor can measure it when the owner places the
 * section freely (see free.ts). Paths are built here, never from user text.
 */
function from(ctx: { editable?: boolean | undefined }, path: string): string {
  return ctx.editable ? ` data-k-from="${path}"` : '';
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
export function lines(text: string): string {
  return esc(text.trim()).replace(/\r?\n/g, '<br>');
}

/** Paragraphs split on blank lines. */
export function paras(text: string | undefined, className = '', attrs = ''): string {
  const cls = (className ? ` class="${className}"` : '') + attrs;
  return (text ?? '')
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p${cls}>${lines(p)}</p>`)
    .join('');
}

function heading(
  text: string | undefined,
  level: number,
  className: string,
  attrs = '',
  split?: SplitMode,
): string {
  if (!text?.trim()) return '';
  if (split) {
    const pieces = splitText(text, split);
    return `<h${level} class="${className}"${attrs}${splitAttrs(pieces)}>${pieces.html}</h${level}>`;
  }
  return `<h${level} class="${className}"${attrs}>${lines(text)}</h${level}>`;
}

function link(item: LinkProps | undefined, className: string, inner?: string, attrs = ''): string {
  if (!item) return '';
  const label = esc(item.label);
  if (!label) return '';
  const content = inner ?? label;
  const href = safeUrl(item.href);
  if (!href) return `<span class="${className}"${attrs}>${content}</span>`;
  const external = href.startsWith('https:') ? ' rel="noopener noreferrer"' : '';
  return `<a class="${className}" href="${esc(href)}"${external}${attrs}>${content}</a>`;
}

interface ImageRef {
  image?: string | undefined;
  imageAlt?: string | undefined;
}

/** Where a file is loaded from: its export path, or (in the preview) a marker the editor fills. */
export function source(asset: Asset, ctx: BlockCtx): string {
  return ctx.preview ? ` data-k-asset="${esc(asset.id)}"` : ` src="${esc(assetPath(asset))}"`;
}

export const sizeAttrs = (asset: Asset): string =>
  asset.width && asset.height ? ` width="${asset.width}" height="${asset.height}"` : '';

function img(ref: ImageRef, ctx: BlockCtx, path = 'image'): string {
  const asset = ref.image ? ctx.assets.get(ref.image) : undefined;
  if (!asset || asset.kind !== 'image') return '';
  const loading = ctx.first ? ' fetchpriority="high"' : ' loading="lazy"';
  return `<img${source(asset, ctx)} alt="${esc(ref.imageAlt ?? '')}"${sizeAttrs(asset)}${loading} decoding="async"${from(ctx, path)}>`;
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
    heading(p.heading, ctx.level, 'title', field(ctx, 'heading'), ctx.split) +
    paras(p.intro, 'intro', field(ctx, 'intro'));
  return parts ? `<div class="${className}">${parts}</div>` : '';
}

const has = (html: string, className: string): string => (html ? ` ${className}` : '');

// ---- Blocks ----

/**
 * Poster headline: each line sits in its own mask so it can rise into view.
 * The space between lines keeps the words apart for screen readers and search.
 */
function posterHeading(
  text: string | undefined,
  level: number,
  attrs: string,
  split?: SplitMode,
): string {
  const rows = (text ?? '')
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);
  if (rows.length === 0) return '';
  // A word or letter animation splits inside each line's mask.
  const pieces = split ? splitLines(rows.join('\n'), split) : null;
  const inner = rows
    .map(
      (row, i) =>
        `<span class="line"><span>${pieces ? (pieces.lines[i] ?? '') : esc(row)}</span></span>`,
    )
    .join(' ');
  return `<h${level} class="display"${attrs}${pieces ? splitAttrs(pieces) : ''}>${inner}</h${level}>`;
}

function hero(p: BlockProps<'hero'>, ctx: BlockCtx): string {
  const layout = p.layout ?? 'editorial';
  if (layout === 'poster') return posterHero(p, ctx);
  const media = img(p, ctx);
  const actions = (p.buttons ?? [])
    .map((b, i) =>
      link(b, i === 0 ? 'button' : 'button button-ghost', undefined, from(ctx, `buttons.${i}`)),
    )
    .join('');
  const text =
    (p.status
      ? `<p class="status"${from(ctx, 'status')}><span class="dot" aria-hidden="true"></span>${esc(p.status)}</p>`
      : '') +
    (p.eyebrow ? `<p class="eyebrow"${field(ctx, 'eyebrow')}>${esc(p.eyebrow)}</p>` : '') +
    heading(p.heading, ctx.level, 'display', field(ctx, 'heading'), ctx.split) +
    paras(p.subheading, 'lede', field(ctx, 'subheading')) +
    (actions ? `<div class="actions">${actions}</div>` : '');
  return `<div class="hero hero-${layout}${has(media, 'has-media')}"><div class="hero-text">${text}</div>${
    media ? `<div class="hero-media">${media}</div>` : ''
  }</div>`;
}

function posterHero(p: BlockProps<'hero'>, ctx: BlockCtx): string {
  const media = img(p, ctx);
  const actions = (p.buttons ?? [])
    .map((b, i) =>
      link(b, i === 0 ? 'button' : 'button button-ghost', undefined, from(ctx, `buttons.${i}`)),
    )
    .join('');
  const top =
    (p.eyebrow ? `<p class="eyebrow"${field(ctx, 'eyebrow')}>${esc(p.eyebrow)}</p>` : '') +
    (p.status
      ? `<p class="status"${from(ctx, 'status')}><span class="dot" aria-hidden="true"></span>${esc(p.status)}</p>`
      : '');
  const foot =
    paras(p.subheading, 'lede', field(ctx, 'subheading')) +
    (actions ? `<div class="actions">${actions}</div>` : '');
  return `<div class="hero hero-poster${has(media, 'has-media')}">${top ? `<div class="poster-top">${top}</div>` : ''}${posterHeading(
    p.heading,
    ctx.level,
    field(ctx, 'heading'),
    ctx.split,
  )}<div class="poster-rule" aria-hidden="true"></div>${foot ? `<div class="poster-foot">${foot}</div>` : ''}${
    media ? `<div class="hero-media">${media}</div>` : ''
  }</div>`;
}

function about(p: BlockProps<'about'>, ctx: BlockCtx): string {
  const media = img(p, ctx);
  const facts = (p.facts ?? [])
    .map(
      (f, i) =>
        `<div><dt${from(ctx, `facts.${i}.label`)}>${esc(f.label)}</dt><dd${from(ctx, `facts.${i}.value`)}>${esc(f.value)}</dd></div>`,
    )
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
  const button = link(p.button, 'button', undefined, from(ctx, 'button'));
  return `<div class="split split-${side}${media ? '' : ' no-media'}"><div class="split-text">${head(p, ctx)}<div class="prose">${paras(p.body, '', field(ctx, 'body'))}${
    button ? `<p>${button}</p>` : ''
  }</div></div>${media ? `<div class="split-media">${media}</div>` : ''}</div>`;
}

function gallery(p: BlockProps<'gallery'>, ctx: BlockCtx): string {
  const items = (p.images ?? [])
    .map((item, i) => {
      const picture = img(item, ctx, `images.${i}.image`);
      if (!picture) return '';
      const caption = item.caption
        ? `<figcaption${from(ctx, `images.${i}.caption`)}>${esc(item.caption)}</figcaption>`
        : '';
      return `<li><figure>${picture}${caption}</figure></li>`;
    })
    .join('');
  return `${head(p, ctx)}${items ? `<ul class="gallery" role="list">${items}</ul>` : ''}`;
}

/**
 * A YouTube or Vimeo video as a "click to load" facade: nothing loads from the
 * video site until the visitor presses play. Without scripts it is a plain link.
 * Every address is rebuilt from the parsed id, never copied from user input.
 */
export function videoEmbed(url: string, title: string): string {
  const embed = parseVideoUrl(url);
  if (!embed) return '';
  const provider = PROVIDER_NAME[embed.provider];
  const label = `Play video${title ? `: ${title}` : ''} (loads the ${provider} player)`;
  return `<div class="video-frame"><a class="video-facade" href="${esc(embedPageUrl(embed))}" data-embed="${esc(embedPlayerUrl(embed))}" data-title="${esc(title || 'Video')}" aria-label="${esc(label)}" rel="noopener noreferrer"><span class="play" aria-hidden="true"></span><span class="video-note" aria-hidden="true">${provider} · loads when you press play</span></a></div>`;
}

function videoFile(id: string | undefined, title: string, ctx: BlockCtx): string {
  const asset = id ? ctx.assets.get(id) : undefined;
  if (!asset || asset.kind !== 'video') return '';
  return `<div class="video-file"${from(ctx, 'video')}><video${source(asset, ctx)} controls playsinline preload="metadata"${sizeAttrs(asset)} aria-label="${esc(title || 'Video')}"></video></div>`;
}

function video(p: BlockProps<'video'>, ctx: BlockCtx): string {
  // Any look or layout setting: the styled player (needs css/video.css). None: as before.
  if (videoStyled(p)) return styledVideo(p, ctx);
  const title = (p.heading ?? '').replace(/\s+/g, ' ').trim();
  const embed = p.embedUrl ? videoEmbed(p.embedUrl, title) : '';
  // The player box is what the owner sees and drags, so it carries the marker.
  const marked = embed.replace(
    '<div class="video-frame"',
    () => `<div class="video-frame"${from(ctx, 'embedUrl')}`,
  );
  const media = marked || videoFile(p.video, title, ctx);
  return `${head(p, ctx)}${media}${paras(p.caption, 'caption', field(ctx, 'caption'))}`;
}

interface VideoEntry {
  embedUrl?: string | undefined;
  video?: string | undefined;
  poster?: string | undefined;
  /** Text of the title bar ('' = no bar). */
  bar: string;
  /** Its name for screen readers. */
  title: string;
  /** Prop path prefix (`''` or `videos.2.`), for the editor's free-layout markers. */
  path: string;
}

const oneLine = (text: string | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();

/** The main video, then the list, as entries; ones with nothing to play are dropped. */
function videoEntries(p: BlockProps<'video'>, ctx: BlockCtx): VideoEntry[] {
  const heading = oneLine(p.heading);
  const main: VideoEntry = {
    embedUrl: p.embedUrl,
    video: p.video,
    poster: p.poster,
    bar: oneLine(p.titleBar),
    title: oneLine(p.titleBar) || heading,
    path: '',
  };
  const more = (p.videos ?? []).map((v, i): VideoEntry => ({
    embedUrl: v.embedUrl,
    video: v.video,
    poster: v.poster,
    bar: oneLine(v.title),
    title: oneLine(v.title) || (heading ? `${heading} ${i + 2}` : `Video ${i + 2}`),
    path: `videos.${i}.`,
  }));
  return [main, ...more].filter(
    (e) =>
      (e.embedUrl !== undefined && parseVideoUrl(e.embedUrl) !== null) ||
      ctx.assets.get(e.video ?? '')?.kind === 'video',
  );
}

/** A picture used as a thumbnail or poster, or undefined. */
function posterAsset(id: string | undefined, ctx: BlockCtx): Asset | undefined {
  const asset = id ? ctx.assets.get(id) : undefined;
  return asset?.kind === 'image' ? asset : undefined;
}

/** One player: the click-to-load facade (with its thumbnail) or the uploaded file. */
function videoMedia(
  e: VideoEntry,
  p: BlockProps<'video'>,
  ctx: BlockCtx,
  first: boolean,
  marked: boolean,
): string {
  const poster = posterAsset(e.poster, ctx);
  const embed = e.embedUrl ? parseVideoUrl(e.embedUrl) : null;
  if (embed) {
    const provider = PROVIDER_NAME[embed.provider];
    const label = `Play video${e.title ? `: ${e.title}` : ''} (loads the ${provider} player)`;
    const thumb = poster
      ? `<img class="video-poster"${source(poster, ctx)} alt=""${sizeAttrs(poster)}${first ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`
      : '';
    return `<div class="video-frame${poster ? ' has-poster' : ''}"${marked ? from(ctx, `${e.path}embedUrl`) : ''}><a class="video-facade" href="${esc(embedPageUrl(embed))}" data-embed="${esc(embedPlayerUrl(embed))}" data-title="${esc(e.title || 'Video')}" aria-label="${esc(label)}" rel="noopener noreferrer">${thumb}<span class="play" aria-hidden="true"></span><span class="video-note" aria-hidden="true">${provider} · loads when you press play</span></a></div>`;
  }
  const asset = e.video ? ctx.assets.get(e.video) : undefined;
  if (!asset || asset.kind !== 'video') return '';
  const posterAttr = poster
    ? ctx.preview
      ? ` data-k-poster="${esc(poster.id)}"`
      : ` poster="${esc(assetPath(poster))}"`
    : '';
  // Controls can only be hidden on a silent loop; otherwise visitors could not start it.
  const controls = p.autoplay === true && p.controls === false ? '' : ' controls';
  // No `autoplay` attribute: js/video.js starts the loop on screen, never with reduced motion.
  const loop = p.autoplay === true ? ' muted loop data-autoplay' : '';
  return `<div class="video-file"${marked ? from(ctx, `${e.path}video`) : ''}><video${source(asset, ctx)}${posterAttr}${controls} playsinline preload="metadata"${loop}${sizeAttrs(asset)} aria-label="${esc(e.title || 'Video')}"></video></div>`;
}

/** A whole number for CSS, clamped again (the schema already checked it). */
const cssInt = (n: number, min: number, max: number): number =>
  Math.round(Math.min(Math.max(n, min), max));

/**
 * A video section with a look or several videos. Classes come from closed
 * lists only; sizes are whole numbers in custom properties.
 */
function styledVideo(p: BlockProps<'video'>, ctx: BlockCtx): string {
  const entries = videoEntries(p, ctx);
  const layout = entries.length < 2 ? 'single' : videoLayout(p);
  const ratio = p.ratio ?? 'landscape';
  const classes = [
    'vids',
    `vids-${layout}`,
    `vr-${ratio}`,
    `vf-${p.frame ?? 'plain'}`,
    `vs-${p.shadow ?? 'none'}`,
    `pl-${p.play ?? 'circle'}`,
    ...(p.ratio !== undefined ? ['has-ratio'] : []),
    ...(p.radius !== undefined ? ['vid-r'] : []),
    ...((p.border ?? 0) > 0 ? ['vid-b'] : []),
  ];
  const max = videoMaxWidth(p);
  const style =
    (max !== null ? `--vmax:${cssInt(max, 1, 100000)};` : '') +
    (p.radius !== undefined ? `--vrad:${cssInt(p.radius, 0, 48)};` : '') +
    ((p.border ?? 0) > 0 ? `--vbw:${cssInt(p.border ?? 0, 0, 8)};` : '');
  // Players in a carousel or deck move around, so only the other layouts carry markers.
  const marked = layout === 'single' || layout === 'grid';
  const cards = entries.map((e, i) => {
    const media = videoMedia(e, p, ctx, ctx.first && i === 0, marked);
    const bar = e.bar ? `<p class="vid-bar"><span>${esc(e.bar)}</span></p>` : '';
    return `<div class="vid">${bar}<div class="vid-media">${media}</div></div>`;
  });
  const attrs = ` class="${classes.join(' ')}"${style ? ` style="${style}"` : ''}`;
  const n = cards.length;
  const name = esc(oneLine(p.heading) || 'Videos');
  let body: string;
  if (n === 0) body = '';
  else if (layout === 'grid') {
    body = `<ul${attrs} role="list">${cards.map((c) => `<li>${c}</li>`).join('')}</ul>`;
  } else if (layout === 'carousel') {
    const slides = cards
      .map(
        (c, i) =>
          `<div class="vc-slide" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${n}">${c}</div>`,
      )
      .join('');
    const dots = cards
      .map(
        (_, i) => `<button type="button" class="vc-dot" aria-label="Show video ${i + 1}"></button>`,
      )
      .join('');
    body = `<div${attrs} data-carousel role="region" aria-roledescription="carousel" aria-label="${name}"><div class="vc-track" tabindex="0">${slides}</div><div class="vc-nav" hidden><button type="button" class="vc-btn vc-prev" aria-label="Previous video"><span aria-hidden="true">←</span></button><div class="vc-dots">${dots}</div><button type="button" class="vc-btn vc-next" aria-label="Next video"><span aria-hidden="true">→</span></button></div><p class="v-sr" aria-live="polite"></p></div>`;
  } else if (layout === 'deck') {
    const stack = cards
      .map(
        (c, i) =>
          `<div class="vd-card" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${n}">${c}</div>`,
      )
      .join('');
    body = `<div${attrs} data-deck role="region" aria-roledescription="carousel" aria-label="${name}"><div class="vd-stack">${stack}</div><div class="vd-nav" hidden><button type="button" class="vc-btn vd-prev" aria-label="Previous video"><span aria-hidden="true">←</span></button><p class="vd-count" aria-live="polite">1 / ${n}</p><button type="button" class="vc-btn vd-next" aria-label="Next video"><span aria-hidden="true">→</span></button></div></div>`;
  } else {
    body = `<div${attrs}>${cards.join('')}</div>`;
  }
  return `${head(p, ctx)}${body}${paras(p.caption, 'caption', field(ctx, 'caption'))}`;
}

/**
 * Reports the code's height to the preview so the frame fits it. It runs
 * inside the same sandbox as the user's code and can only send a number.
 */
const CODE_FRAME_SCRIPT =
  "<script>(function(){function h(){parent.postMessage({source:'klinth-code',height:Math.ceil(document.body?document.body.scrollHeight:0)},'*')}addEventListener('load',h);if(window.ResizeObserver)new ResizeObserver(h).observe(document.documentElement)})()</script>";

/**
 * Custom code. The published site runs it as pasted (the user is told to paste
 * only code they trust). The editor preview never does: it gets a nested frame
 * with `allow-scripts` only, so the code cannot reach the editor or its storage.
 */
function customCode(p: BlockProps<'customCode'>, ctx: BlockCtx): string {
  const code = p.code ?? '';
  if (!code.trim()) {
    return ctx.preview
      ? '<p class="code-empty">Custom code: paste your code in the settings panel.</p>'
      : '';
  }
  if (!ctx.preview) return `<div class="custom-code">${code}</div>`;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}</style></head><body>${code}${CODE_FRAME_SCRIPT}</body></html>`;
  return `<p class="code-note">Custom code preview. It runs for real on your published site.</p><iframe class="code-frame" sandbox="allow-scripts" title="Custom code preview" srcdoc="${esc(doc)}"></iframe>`;
}

const pad = (n: number): string => String(n).padStart(2, '0');

function projects(p: BlockProps<'projects'>, ctx: BlockCtx): string {
  const items = p.items ?? [];
  const sub = ctx.level + 1;
  if (p.layout === 'list') {
    const rows = items
      .map((item, i) => {
        const meta = [item.tag, item.year].filter(Boolean).map((m) => esc(m ?? ''));
        return `<li><span class="num" aria-hidden="true">${pad(i + 1)}</span><div class="row-main">${heading(item.title, sub, 'row-title', from(ctx, `items.${i}.title`))}${paras(item.description, 'row-text', from(ctx, `items.${i}.description`))}${link(item.link, 'more', undefined, from(ctx, `items.${i}.link`))}</div>${
          meta.length ? `<p class="row-meta">${meta.join('<br>')}</p>` : ''
        }</li>`;
      })
      .join('');
    return `${head(p, ctx)}${rows ? `<ol class="index" role="list">${rows}</ol>` : ''}`;
  }
  const cards = items
    .map((item, i) => {
      const picture =
        img(item, { ...ctx, first: false }, `items.${i}.image`) ||
        `<span class="cover-num" aria-hidden="true">${pad(i + 1)}</span>`;
      const meta = [item.tag, item.year].filter(Boolean).map((m) => esc(m ?? ''));
      return `<li class="card"><div class="cover cover-${(i % 4) + 1}">${picture}</div><div class="card-body">${
        meta.length
          ? `<p class="card-meta">${meta.join('<span aria-hidden="true"> · </span>')}</p>`
          : ''
      }${heading(item.title, sub, 'card-title', from(ctx, `items.${i}.title`))}${paras(item.description, 'card-text', from(ctx, `items.${i}.description`))}${link(item.link, 'more stretch', undefined, from(ctx, `items.${i}.link`))}</div></li>`;
    })
    .join('');
  return `${head(p, ctx)}${cards ? `<ul class="cards" role="list">${cards}</ul>` : ''}`;
}

function testimonials(p: BlockProps<'testimonials'>, ctx: BlockCtx): string {
  const quotes = (p.items ?? [])
    .map(
      (q, i) =>
        `<figure class="quote"><blockquote${from(ctx, `items.${i}.quote`)}>${paras(q.quote)}</blockquote><figcaption><span class="who"${from(ctx, `items.${i}.name`)}>${esc(q.name)}</span>${
          q.role ? `<span class="role"${from(ctx, `items.${i}.role`)}>${esc(q.role)}</span>` : ''
        }</figcaption></figure>`,
    )
    .join('');
  return `${head(p, ctx)}${quotes ? `<div class="quotes">${quotes}</div>` : ''}`;
}

function links(p: BlockProps<'links'>, ctx: BlockCtx): string {
  const avatar = img(p, ctx);
  const items = (p.items ?? [])
    .map((item, i) =>
      link(
        item,
        'linkbtn',
        `<span>${esc(item.label)}</span><span class="arrow" aria-hidden="true">→</span>`,
        from(ctx, `items.${i}`),
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
    (mail && p.email
      ? `<a class="big-link" href="${esc(mail)}"${from(ctx, 'email')}>${esc(p.email.trim())}</a>`
      : '') +
    (tel && p.phone
      ? `<a class="phone" href="${esc(tel)}"${from(ctx, 'phone')}>${esc(p.phone)}</a>`
      : '');
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
  // A height in px (a checked whole number) wins over the named sizes.
  if (p.height !== undefined && Number.isInteger(p.height)) {
    const px = Math.min(Math.max(p.height, 8), 480);
    return `<div class="spacer" style="height:${px}px" aria-hidden="true"></div>`;
  }
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
    case 'customCode':
      return customCode(section.props, ctx);
    // The page renders the footer, and a blank canvas's artboard (it is always free).
    case 'footer':
    case 'canvas':
      return '';
  }
}

/** True when the footer uses alignment, offset or padding (it then needs `FOOTER_CSS`). */
export function footerPositioned(p: BlockProps<'footer'>): boolean {
  return (
    p.textAlign !== undefined ||
    p.linksAlign !== undefined ||
    p.topAlign !== undefined ||
    p.offset !== undefined ||
    p.padding !== undefined
  );
}

/** A validated number as CSS text: at most 3 decimals, never an exponent. */
function cssNum(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
}

const ALIGN = new Set<string>(['left', 'center', 'right']);
/** The class for a group's alignment; only values from the closed list reach the markup. */
const alignClass = (value: string | undefined, fallback: string): string =>
  ` al-${value !== undefined && ALIGN.has(value) ? value : fallback}`;

/**
 * The site footer: text, links and a way back to the top (unless `backToTop` is false).
 * Without alignment, offset or padding the markup is the same as before. Returns ''
 * when nothing would be shown.
 */
export function renderFooter(
  p: BlockProps<'footer'>,
  editSectionId?: string,
  backToTop = true,
): string {
  const linkItems = (p.links ?? [])
    .map((l) => link(l, 'foot-link'))
    .filter(Boolean)
    .map((a) => `<li>${a}</li>`)
    .join('');
  if (!p.text && !linkItems && !backToTop) return '';
  const edit = editSectionId === undefined ? {} : { editable: true };
  const marker = editSectionId === undefined ? '' : ` data-k-section="${esc(editSectionId)}"`;
  const positioned = footerPositioned(p);
  const column =
    p.textAlign !== undefined || p.linksAlign !== undefined || p.topAlign !== undefined;
  const al = (value: string | undefined, fallback: string) =>
    column ? alignClass(value, fallback) : '';
  const parts = `${p.text ? `<p class="foot-text${al(p.textAlign, 'left')}"${field(edit, 'text')}>${esc(p.text)}</p>` : ''}${
    linkItems
      ? `<ul class="foot-links${al(p.linksAlign, 'left')}" role="list">${linkItems}</ul>`
      : ''
  }${backToTop ? `<a class="totop${al(p.topAlign, 'right')}" href="#top">Back to top <span aria-hidden="true">↑</span></a>` : ''}`;
  if (!positioned) return `<div class="wrap foot"${marker}>${parts}</div>`;
  const vars: string[] = [];
  if (p.padding !== undefined && Number.isFinite(p.padding)) {
    vars.push(`--fpad:${cssNum(Math.min(Math.max(p.padding, 0), 8))};`);
  }
  if (p.offset !== undefined && Number.isFinite(p.offset)) {
    const x = Math.min(Math.max(p.offset, -20), 20);
    vars.push(`--fl:${cssNum(Math.max(x, 0))};--fr:${cssNum(Math.max(-x, 0))};`);
  }
  const style = vars.length ? ` style="${vars.join('')}"` : '';
  return `<div class="wrap foot foot-set"${style}${marker}><div class="foot-in${column ? ' foot-col' : ''}">${parts}</div></div>`;
}
