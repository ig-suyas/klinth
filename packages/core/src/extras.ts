/**
 * Extras that work in any section, on any page, any number of times:
 * rotating headline, picture stack, numbered steps, glass cards, quote
 * marquee, expandable sections, decorative shapes and giant text.
 *
 * Everything is optional. A site that uses none of them exports exactly as
 * before (no new files, tags or classes). Otherwise pages that use one link
 * `css/extras.css`, and pages that need behaviour also `js/extras.js` (plain
 * CSS and JavaScript, no libraries). Numbers reach CSS only as checked whole
 * numbers in custom properties; every other choice is a class from a closed list.
 * All movement sits inside `prefers-reduced-motion: no-preference`; the script
 * also checks it before starting anything.
 */
import type { BlockProps } from './blocks.ts';
import { escapeHtml as esc } from './html.ts';
import type { Page, Section } from './schema.ts';

export const EXTRAS_CSS_PATH = 'css/extras.css';
export const EXTRAS_JS_PATH = 'js/extras.js';

/** Section types that always need `css/extras.css`. */
const EXTRA_TYPES: ReadonlySet<string> = new Set([
  'rotator',
  'cardStack',
  'steps',
  'marquee',
  'giantText',
]);
/** Section types whose behaviour needs `js/extras.js`. */
const SCRIPTED_TYPES: ReadonlySet<string> = new Set(['rotator', 'cardStack', 'marquee']);

type AnyProps = Readonly<Record<string, unknown>>;
const propsOf = (s: Pick<Section, 'props'>): AnyProps => s.props as AnyProps;

/** The section folds behind a title row. */
export function sectionFolds(s: Pick<Section, 'props'>): boolean {
  return propsOf(s).fold === true;
}

/** The section's decorative shapes (an empty list when it has none). */
export function sectionShapes(s: Pick<Section, 'props'>): readonly Shape[] {
  const shapes = propsOf(s).shapes;
  return Array.isArray(shapes) ? (shapes as Shape[]) : [];
}

/** The page links `css/extras.css`. */
export function pageExtrasCss(page: Pick<Page, 'sections'>): boolean {
  return page.sections.some(
    (s) =>
      EXTRA_TYPES.has(s.type) ||
      propsOf(s).cardStyle === 'glass' ||
      sectionFolds(s) ||
      sectionShapes(s).length > 0,
  );
}

/** The page links `js/extras.js` (something moves or responds). */
export function pageExtrasJs(page: Pick<Page, 'sections'>): boolean {
  return page.sections.some(
    (s) =>
      SCRIPTED_TYPES.has(s.type) ||
      (s.type === 'giantText' && propsOf(s).reveal === true) ||
      sectionFolds(s),
  );
}

/** The page has a folded section (closed panels are shown when scripts are off). */
export function pageFolds(page: Pick<Page, 'sections'>): boolean {
  return page.sections.some(sectionFolds);
}

/** Without JavaScript nothing stays folded away. Fixed text, no user input. */
export const FOLD_NOSCRIPT =
  '<noscript><style>.xp-panel{grid-template-rows:1fr!important;visibility:visible!important}.xp-inner{overflow:visible!important}.xp-ico{display:none}</style></noscript>\n';

const oneLine = (text: string | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();

/** The whole rotating headline as one sentence: text before, every word, text after. */
export function rotatorPhrase(
  p: Pick<BlockProps<'rotator'>, 'heading' | 'words' | 'after'>,
): string {
  const words = (p.words ?? []).map((w) => oneLine(w.word)).filter(Boolean);
  return [oneLine(p.heading), words.join(', '), oneLine(p.after)].filter(Boolean).join(' ');
}

/** Escaped text with `**phrases**` turned into highlights (escaping first, so no markup gets in). */
export function highlightPhrases(text: string): string {
  return esc(text).replace(/\*\*([^*\r\n]+?)\*\*/g, '<mark class="hl">$1</mark>');
}

/** A whole number for CSS, clamped again (the schema already checked it). */
export const cssWhole = (n: unknown, min: number, max: number, fallback: number): number =>
  typeof n === 'number' && Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;

// ---- Decorative shapes ----

type Shape = NonNullable<BlockProps<'textImage'>['shapes']>[number];

const KINDS = new Set(['starburst', 'blob', 'rings', 'grid']);
const COLORS = new Set(['accent', 'text', 'muted', 'surface']);
const MOTIONS = new Set(['none', 'spin', 'float', 'pulse']);
const SPEEDS = new Set(['slow', 'normal', 'fast']);
const pick = (value: unknown, allowed: ReadonlySet<string>, fallback: string): string =>
  typeof value === 'string' && allowed.has(value) ? value : fallback;

/** Fixed drawings on a 100 x 100 box; nothing here comes from the project. */
const SHAPE_SVG: Record<string, string> = {
  starburst: (() => {
    const pts: string[] = [];
    for (let i = 0; i < 24; i += 1) {
      const r = i % 2 === 0 ? 50 : 30;
      const a = (Math.PI * i) / 12 - Math.PI / 2;
      pts.push(`${(50 + r * Math.cos(a)).toFixed(1)} ${(50 + r * Math.sin(a)).toFixed(1)}`);
    }
    return `<path fill="currentColor" d="M${pts.join('L')}Z"/>`;
  })(),
  blob: '<path fill="currentColor" d="M50 4C66 4 80 12 88 26 96 40 98 58 90 72 82 86 66 96 50 96 33 96 18 88 10 74 2 60 4 42 12 28 20 14 34 4 50 4Z"/>',
  rings:
    '<g fill="none" stroke="currentColor" stroke-width="3"><circle cx="50" cy="50" r="47"/><circle cx="50" cy="50" r="35"/><circle cx="50" cy="50" r="23"/><circle cx="50" cy="50" r="11"/></g>',
  grid: (() => {
    const dots: string[] = [];
    for (let y = 10; y <= 90; y += 20)
      for (let x = 10; x <= 90; x += 20) dots.push(`<circle cx="${x}" cy="${y}" r="4"/>`);
    return `<g fill="currentColor">${dots.join('')}</g>`;
  })(),
};

/** The shapes behind a section's content (decorative: hidden from screen readers). '' when none. */
export function renderShapes(s: Pick<Section, 'props'>): string {
  const shapes = sectionShapes(s);
  if (shapes.length === 0) return '';
  const svgs = shapes
    .slice(0, 4)
    .map((shape) => {
      const kind = pick(shape.kind, KINDS, 'starburst');
      const classes = [
        'shp',
        `shp-${kind}`,
        `shp-c-${pick(shape.color, COLORS, 'accent')}`,
        `shp-m-${pick(shape.motion, MOTIONS, 'none')}`,
        `shp-v-${pick(shape.speed, SPEEDS, 'normal')}`,
      ].join(' ');
      const opacity = cssWhole(shape.opacity, 10, 100, 100) / 100;
      const style = `--sx:${cssWhole(shape.x, 0, 100, 85)};--sy:${cssWhole(shape.y, 0, 100, 20)};--ss:${cssWhole(shape.size, 32, 640, 160)};--so:${opacity}`;
      return `<svg class="${classes}" style="${style}" viewBox="0 0 100 100" focusable="false">${SHAPE_SVG[kind] ?? ''}</svg>`;
    })
    .join('');
  return `<div class="shp-layer" aria-hidden="true">${svgs}</div>`;
}

// ---- Expandable sections ----

/**
 * Wraps any section content in a title row (a real button with
 * aria-expanded/aria-controls) and a panel. `id` is the section's anchor
 * (already a checked id), so ids stay unique on the page.
 */
export function wrapFold(s: Pick<Section, 'props'>, id: string, content: string): string {
  if (!sectionFolds(s)) return content;
  const p = propsOf(s);
  const open = p.foldOpen === true;
  const title = oneLine(typeof p.foldTitle === 'string' ? p.foldTitle : '') || 'Show more';
  const btn = esc(`${id}-xp`);
  const panel = esc(`${id}-xp-panel`);
  return `<div class="xp${open ? ' is-open' : ''}" data-fold><div class="wrap xp-bar"><button type="button" class="xp-btn" id="${btn}" aria-expanded="${open ? 'true' : 'false'}" aria-controls="${panel}"><span class="xp-label">${esc(title)}</span><span class="xp-ico" aria-hidden="true"></span></button></div><div class="xp-panel" id="${panel}" role="region" aria-labelledby="${btn}"><div class="xp-inner"><div class="xp-pad">${content}</div></div></div></div>`;
}

/** Extra classes for the `<section>` ('' when none, so old markup stays the same). */
export function extraSectionClasses(s: Pick<Section, 'type' | 'props'>): string {
  const p = propsOf(s);
  return (
    (p.cardStyle === 'glass' ? ' cs-glass' : '') +
    (s.type === 'giantText' && p.crop === true ? ' gt-crop' : '') +
    (sectionFolds(s) ? ' has-fold' : '') +
    (sectionShapes(s).length > 0 ? ' has-shapes' : '')
  );
}

const PHONE = '(max-width:37.49rem)';
const GLASS = '.cs-glass :is(.card,.quote,.index>li,.facts>div,.linkbtn,.step,.mq-card)';

export const EXTRAS_CSS = `.x-btn{display:inline-grid;place-items:center;min-width:2.75rem;height:2.75rem;padding:0 .9rem;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--fg);font:inherit;font-size:.9375rem;line-height:1;cursor:pointer}
.x-btn:focus-visible,.xp-btn:focus-visible,.stk-cards:focus-visible,.mq-view:focus-visible{outline:2px solid var(--link);outline-offset:4px}
.rot{max-width:62rem}
.rot-al-center{margin-inline:auto;text-align:center}
.rot-title{margin:0;font-family:var(--font-heading);font-weight:var(--heading-weight);letter-spacing:var(--heading-tracking);font-size:clamp(2.25rem,6.5vw,5.25rem);line-height:1.06;text-wrap:balance}
.rot-words{display:inline-grid;max-width:100%;color:var(--link)}
.rot-al-center .rot-words{justify-items:center}
.rot-w{grid-area:1/1;opacity:0;overflow-wrap:anywhere}
.rot-w.is-on{opacity:1}
.rot-intro{margin:1.25rem 0 0;max-width:40rem;font-size:1.125rem;color:var(--muted)}
.rot-al-center .rot-intro{margin-inline:auto}
.stk{position:relative;display:grid;justify-items:center;gap:1.25rem;margin-top:clamp(1.5rem,4vw,2.5rem)}
.block-cardStack{overflow-x:clip}
.stk-cards{display:grid;width:min(100% - 5rem,var(--stk-w,22rem));touch-action:pan-y;border-radius:var(--radius)}
.stk-square{--stk-ar:1/1;--stk-w:24rem}.stk-landscape{--stk-ar:4/3;--stk-w:30rem}
.stk-card{grid-area:1/1;min-width:0;z-index:calc(10 - var(--d,0));transform:translate(calc(var(--d,0)*var(--sg,1)*.9rem),calc(var(--d,0)*-.5rem)) rotate(calc(var(--d,0)*var(--sg,1)*var(--tilt,6)*1deg)) scale(calc(1 - var(--d,0)*.04))}
.stk-card.is-far{opacity:0}
.stk-card figure{margin:0;border-radius:var(--radius);overflow:hidden;background:var(--card);box-shadow:0 1px 2px rgb(0 0 0/.08),0 18px 40px -18px rgb(0 0 0/.45)}
.stk-card img{display:block;width:100%;height:auto;aspect-ratio:var(--stk-ar,4/5);object-fit:cover}
.stk-card figcaption{padding:.6rem .9rem;font-size:.875rem;color:var(--muted)}
.stk.is-ready .stk-card.is-front{cursor:pointer}
.stk-nav{display:flex;align-items:center;gap:.5rem}
.stk-nav[hidden]{display:flex;visibility:hidden}
.stk-btn[hidden]{display:none}
.stk-count{margin:0;min-width:3.5rem;text-align:center;font-size:.875rem}
.steps{list-style:none;margin:clamp(1.5rem,4vw,2.5rem) 0 0;padding:0;display:grid;gap:clamp(1rem,2.5vw,1.5rem);grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))}
.step{display:grid;align-content:start;gap:.6rem;padding:clamp(1.5rem,3vw,2rem);border-radius:var(--radius);background:var(--card);border:1px solid var(--line)}
.step-num{font-family:var(--font-heading);font-size:clamp(2rem,4vw,2.75rem);line-height:1;color:var(--link)}
.step-title{margin:0;font-size:1.25rem}
.step-text{margin:0;color:var(--muted)}
${GLASS}{background:color-mix(in srgb,var(--card) 58%,transparent);-webkit-backdrop-filter:blur(14px) saturate(1.4);backdrop-filter:blur(14px) saturate(1.4);border:1px solid color-mix(in srgb,var(--fg) 12%,transparent);border-radius:var(--radius);box-shadow:0 1px 1px rgb(0 0 0/.04),0 20px 44px -26px rgb(0 0 0/.45)}
.cs-glass .card{padding:clamp(.75rem,2vw,1rem) clamp(.75rem,2vw,1rem) 1.25rem}
.cs-glass .index>li{padding-inline:1.25rem;margin-bottom:.75rem}
.cs-glass .facts{gap:.75rem;border-top:0}
.cs-glass .facts>div{padding:1rem 1.25rem}
.mq{position:relative;margin-top:clamp(1.5rem,4vw,2.5rem)}
.mq-view{overflow-x:auto;scroll-snap-type:x mandatory;overscroll-behavior-x:contain;scrollbar-width:thin;padding-block:.5rem;border-radius:var(--radius)}
.mq-track{--mq-gap:clamp(.75rem,2vw,1.25rem);list-style:none;margin:0;padding:0;display:flex;gap:var(--mq-gap);width:max-content}
.mq-card{flex:0 0 auto;width:min(78vw,22rem);scroll-snap-align:start;display:flex;margin:0;padding:clamp(1.25rem,3vw,1.75rem);background:var(--card);border-radius:var(--radius)}
.mq-card figure{margin:0;display:flex;flex-direction:column;justify-content:space-between;gap:1.25rem}
.mq-card blockquote{margin:0;font-size:1.0625rem;line-height:1.55}
.mq-card blockquote p{margin:0}
.mq-card blockquote p+p{margin-top:.75rem}
.mq-who{display:block;font-weight:600}
.mq-role{display:block;color:var(--muted);font-size:.875rem}
.hl{background:color-mix(in srgb,var(--link) 22%,transparent);color:inherit;padding:0 .12em;border-radius:.2em}
.mq-bar{display:flex;justify-content:flex-end;margin-top:.75rem}
.mq-toggle{display:inline-grid;place-items:center;min-width:2.75rem;height:2.75rem;padding:0 1rem;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--fg);font:inherit;font-size:.875rem;cursor:pointer}
.mq-toggle[hidden]{display:inline-grid;visibility:hidden}
.mq-toggle:focus-visible{outline:2px solid var(--link);outline-offset:3px}
.mq.is-moving .mq-view{overflow:hidden;scroll-snap-type:none;-webkit-mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent);mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent)}
.mq.is-moving .mq-track{padding-right:var(--mq-gap);will-change:transform}
.cs-glass .mq.is-moving .mq-card{-webkit-backdrop-filter:none;backdrop-filter:none}
.block.has-fold{padding-block:clamp(1.25rem,3vw,2rem)}
.xp-btn{display:flex;align-items:center;justify-content:space-between;gap:1rem;width:100%;min-height:3.5rem;padding:1rem 0;border:0;border-bottom:1px solid var(--line);background:none;color:var(--fg);font:inherit;font-family:var(--font-heading);font-weight:var(--heading-weight);font-size:clamp(1.25rem,2.4vw,1.625rem);letter-spacing:var(--heading-tracking);text-align:left;cursor:pointer}
.xp-ico{flex:none;width:.55em;height:.55em;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:translateY(-25%) rotate(45deg)}
.xp.is-open .xp-ico{transform:translateY(25%) rotate(-135deg)}
.xp-panel{display:grid;grid-template-rows:0fr;visibility:hidden}
.xp.is-open>.xp-panel{grid-template-rows:1fr;visibility:visible}
.xp-inner{min-height:0}
.xp:not(.is-open) .xp-inner,.xp.is-moving .xp-inner{overflow:hidden}
.xp-pad{padding-top:clamp(1.5rem,4vw,2.5rem)}
.xp-pad>.wrap{padding-bottom:.25rem}
.has-shapes{isolation:isolate}
.shp-layer{position:absolute;inset:0;z-index:-1;overflow:hidden;pointer-events:none}
.shp{--sd:24;position:absolute;left:calc(var(--sx,85)*1%);top:calc(var(--sy,20)*1%);width:min(calc(var(--ss,160)*1px),45vw);height:auto;aspect-ratio:1;translate:-50% -50%;opacity:var(--so,1)}
.shp-c-accent{color:var(--color-accent)}.shp-c-text{color:var(--fg)}.shp-c-muted{color:var(--muted)}.shp-c-surface{color:var(--color-surface)}
.bg-bold .shp-c-accent{color:var(--color-accent-text)}
.shp-v-slow{--sd:40}.shp-v-fast{--sd:12}
.gt{display:grid;gap:clamp(1rem,3vw,1.75rem)}
.gt-al-center{text-align:center;justify-items:center}.gt-al-right{text-align:right;justify-items:end}
.gt-intro{margin:0;max-width:40rem;font-size:1.125rem;color:var(--muted)}
.giant{--gfa:var(--color-accent);--gfb:var(--fg);margin:0;max-width:100%;font-family:var(--font-heading);font-weight:var(--heading-weight);letter-spacing:-.04em;line-height:.9;overflow-wrap:anywhere;color:var(--fg)}
.gt-large{font-size:clamp(3.5rem,13vw,10rem)}.gt-huge{font-size:clamp(4.5rem,18vw,15rem)}.gt-max{font-size:clamp(5rem,24vw,22rem)}
.gt-f-ink{--gfa:var(--fg);--gfb:var(--muted)}
.gt-f-custom{--gfa:rgb(var(--g1));--gfb:rgb(var(--g2))}
.bg-bold .gt-f-accent{--gfa:var(--fg);--gfb:color-mix(in srgb,var(--fg) 55%,var(--color-accent))}
@supports (background-clip:text) or (-webkit-background-clip:text){.giant{background:linear-gradient(calc(var(--ga,100)*1deg),var(--gfa),var(--gfb));-webkit-background-clip:text;background-clip:text;color:transparent;padding-bottom:.06em}}
.gt-crop{padding-bottom:0;overflow:hidden}
.gt-crop .giant{margin-bottom:-.2em}
.gt-wait{opacity:0;transform:translateY(.25em)}
@keyframes rot-type{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0)}}
@keyframes mq-move{to{transform:translateX(-50%)}}
@keyframes shp-spin{to{rotate:360deg}}
@keyframes shp-float{from{transform:translateY(-8%)}to{transform:translateY(8%)}}
@keyframes shp-pulse{from{scale:.9}to{scale:1.08}}
@media (prefers-reduced-motion:no-preference){
.rot-fade .rot-w{transition:opacity .5s ease}
.rot-slide .rot-w{transform:translateY(.45em);transition:opacity .45s ease,transform .55s cubic-bezier(.2,.7,.2,1)}
.rot-slide .rot-w.is-on{transform:none}
.rot-slide .rot-w.is-out{transform:translateY(-.45em)}
.rot-typewriter .rot-w.is-in{animation:rot-type calc(var(--n,8)*.07s) steps(var(--n,8),end) both}
.stk-card{transition:transform .55s cubic-bezier(.2,.7,.2,1),opacity .4s ease}
${GLASS}{transition:opacity .7s ease,transform .4s cubic-bezier(.2,.7,.2,1),box-shadow .4s ease}
.mq.is-moving .mq-track{animation:mq-move calc(var(--mq-dur,40)*var(--mq-k,1)*1s) linear infinite}
.mq-right.is-moving .mq-track{animation-direction:reverse}
.mq.is-moving .mq-view:hover .mq-track,.mq.is-moving .mq-view:focus-within .mq-track,.mq.is-paused .mq-track{animation-play-state:paused}
.xp-panel{transition:grid-template-rows .45s cubic-bezier(.2,.7,.2,1),visibility .45s}
.xp-ico{transition:transform .3s ease}
.shp-m-spin{animation:shp-spin calc(var(--sd)*1s) linear infinite}
.shp-m-float{animation:shp-float calc(var(--sd)*.25s) ease-in-out infinite alternate}
.shp-m-pulse{animation:shp-pulse calc(var(--sd)*.2s) ease-in-out infinite alternate}
.gt-reveal{transition:opacity .9s ease,transform 1.1s cubic-bezier(.2,.7,.2,1)}
}
@media (prefers-reduced-motion:no-preference) and (hover:hover){
.stk:hover .stk-card:not(.is-front){transform:translate(calc(var(--d,0)*var(--sg,1)*2.6rem),calc(var(--d,0)*-.25rem)) rotate(calc(var(--d,0)*var(--sg,1)*var(--tilt,6)*1.8deg)) scale(calc(1 - var(--d,0)*.03))}
${GLASS}:hover{transform:translateY(-4px);box-shadow:0 1px 1px rgb(0 0 0/.05),0 28px 54px -26px rgb(0 0 0/.5)}
}
@media ${PHONE}{
.stk-cards{width:min(100% - 3rem,var(--stk-w,22rem))}
}
`;

/**
 * Behaviour for the extras. Each part looks only at its own markers, so it
 * does nothing on pages without them. With reduced motion nothing starts by
 * itself; every control still works.
 */
export const EXTRAS_JS = `(function () {
  'use strict';
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(mq && mq.matches); }
  function onReduce(fn) {
    if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (reduced()) fn(); });
  }
  var slice = function (list) { return Array.prototype.slice.call(list); };
  function all(sel) { return slice(document.querySelectorAll(sel)); }
  var hasIO = 'IntersectionObserver' in window;

  // Expandable sections: a real button, aria-expanded, closed panels are inert.
  all('[data-fold]').forEach(function (fold) {
    var btn = fold.querySelector('.xp-btn');
    var panel = btn && document.getElementById(btn.getAttribute('aria-controls'));
    if (!panel) return;
    var timer = 0;
    function set(open, focus) {
      fold.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) panel.removeAttribute('inert'); else panel.setAttribute('inert', '');
      if (focus) btn.focus();
      if (reduced()) return;
      fold.classList.add('is-moving');
      clearTimeout(timer);
      timer = setTimeout(function () { fold.classList.remove('is-moving'); }, 500);
    }
    if (!fold.classList.contains('is-open')) panel.setAttribute('inert', '');
    btn.addEventListener('click', function () { set(btn.getAttribute('aria-expanded') !== 'true', false); });
    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && fold.classList.contains('is-open')) { e.stopPropagation(); set(false, true); }
    });
    function fromHash() {
      var id = window.location.hash.slice(1);
      var target = id && document.getElementById(id);
      if (target && panel.contains(target) && !fold.classList.contains('is-open')) set(true, false);
    }
    fromHash();
    window.addEventListener('hashchange', fromHash);
  });

  // Rotating headline: one word at a time, paused on hover, off screen and in hidden tabs.
  all('[data-rotator]').forEach(function (rot) {
    var words = slice(rot.querySelectorAll('.rot-w'));
    if (words.length < 2 || reduced()) return;
    var ms = parseInt(rot.getAttribute('data-interval'), 10);
    if (!(ms >= 1000 && ms <= 10000)) ms = 2500;
    var i = 0, held = false, seen = true, loops = 0;
    function show(n) {
      // The first word is painted at once (it is the main heading); later words animate in.
      words.forEach(function (w, k) {
        w.classList.toggle('is-out', k === i && k !== n);
        w.classList.toggle('is-on', k === n);
        w.classList.toggle('is-in', k === n);
      });
      i = n;
    }
    rot.addEventListener('mouseenter', function () { held = true; });
    rot.addEventListener('mouseleave', function () { held = false; });
    if (hasIO) new IntersectionObserver(function (en) { seen = en[0].isIntersecting; }).observe(rot);
    // Stops on the first word after a few rounds, so nothing moves for ever.
    var timer = setInterval(function () {
      if (held || !seen || document.hidden) return;
      var n = (i + 1) % words.length;
      if (n === 0 && ++loops >= 4) { clearInterval(timer); }
      show(n);
    }, ms);
    onReduce(function () { clearInterval(timer); show(0); });
  });

  // Picture stack: arrows, keys, a click on the front card, swipes, optional auto shuffle.
  all('[data-stack]').forEach(function (root) {
    var list = root.querySelector('.stk-cards');
    var nav = root.querySelector('.stk-nav');
    var cards = slice(root.querySelectorAll('.stk-card'));
    if (!list || !nav || cards.length < 2) return;
    var count = nav.querySelector('.stk-count');
    var pause = nav.querySelector('.stk-pause');
    var n = cards.length, front = 0, held = false, stopped = false, suppress = 0;
    function show(k) {
      front = ((k % n) + n) % n;
      cards.forEach(function (card, j) {
        var d = (j - front + n) % n;
        card.style.setProperty('--d', String(Math.min(d, 4)));
        card.style.setProperty('--sg', d % 2 ? '-1' : '1');
        card.classList.toggle('is-front', d === 0);
        card.classList.toggle('is-far', d > 3);
        if (d === 0) card.removeAttribute('inert'); else card.setAttribute('inert', '');
      });
      if (count) count.textContent = (front + 1) + ' / ' + n;
    }
    nav.querySelector('.stk-prev').addEventListener('click', function () { show(front - 1); });
    nav.querySelector('.stk-next').addEventListener('click', function () { show(front + 1); });
    root.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'ArrowRight') show(front + 1);
      else if (k === 'ArrowLeft') show(front - 1);
      else if (k === 'Home') show(0);
      else if (k === 'End') show(n - 1);
      else return;
      e.preventDefault();
    });
    list.addEventListener('click', function (e) {
      if (Date.now() < suppress) return;
      var card = e.target.closest && e.target.closest('.stk-card');
      if (card && card.classList.contains('is-front')) show(front + 1);
    });
    var sx = null, sy = 0;
    list.addEventListener('pointerdown', function (e) { if (e.button) return; sx = e.clientX; sy = e.clientY; });
    list.addEventListener('pointercancel', function () { sx = null; });
    list.addEventListener('dragstart', function (e) { e.preventDefault(); });
    list.addEventListener('pointerup', function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
      suppress = Date.now() + 400;
      show(front + (dx < 0 ? 1 : -1));
    });
    root.addEventListener('mouseenter', function () { held = true; });
    root.addEventListener('mouseleave', function () { held = false; });
    root.addEventListener('focusin', function () { held = true; });
    root.addEventListener('focusout', function (e) { if (!root.contains(e.relatedTarget)) held = false; });
    var ms = parseInt(root.getAttribute('data-auto'), 10);
    if (ms >= 2000 && ms <= 10000 && !reduced()) {
      var timer = setInterval(function () {
        if (!held && !stopped && !document.hidden) show(front + 1);
      }, ms);
      if (pause) {
        pause.hidden = false;
        pause.addEventListener('click', function () {
          stopped = !stopped;
          pause.textContent = stopped ? 'Play' : 'Pause';
        });
      }
      onReduce(function () { clearInterval(timer); if (pause) pause.hidden = true; });
    }
    nav.hidden = false;
    root.classList.add('is-ready');
    show(0);
  });

  // Quote marquee: copies make the loop seamless; hover, focus or the button pause it.
  all('[data-marquee]').forEach(function (root) {
    var view = root.querySelector('.mq-view');
    var track = root.querySelector('.mq-track');
    var toggle = root.querySelector('.mq-toggle');
    if (!view || !track || !toggle || reduced()) return;
    var cards = slice(track.children);
    // Enough copies to fill a wide screen when there are only a few quotes (counted, never
    // measured, so loading the page forces no layout).
    var k = Math.min(5, Math.max(1, Math.ceil(5 / cards.length)));
    function copy(card) {
      var c = card.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      c.setAttribute('inert', '');
      track.appendChild(c);
    }
    for (var r = 1; r < k * 2; r++) cards.forEach(copy);
    root.style.setProperty('--mq-k', String(k));
    root.classList.add('is-moving');
    toggle.hidden = false;
    toggle.addEventListener('click', function () {
      var paused = !root.classList.contains('is-paused');
      root.classList.toggle('is-paused', paused);
      toggle.textContent = paused ? 'Play' : 'Pause';
    });
    onReduce(function () { root.classList.add('is-paused'); toggle.textContent = 'Play'; });
  });

  // Giant text rises into view on scroll (never the first section, never with reduced motion).
  if (!reduced() && hasIO) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.remove('gt-wait');
        en.target.classList.add('gt-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    all('main > .block').slice(1).forEach(function (block) {
      slice(block.querySelectorAll('.gt-reveal')).forEach(function (el) {
        el.classList.add('gt-wait');
        io.observe(el);
      });
    });
  }
})();
`;
