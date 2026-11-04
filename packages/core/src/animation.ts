/**
 * Animation presets for sections and the parts inside them (heading, pictures,
 * buttons, cards, video thumbnail). Settings are closed enums and whole-number
 * ranges, so nothing the owner types reaches the CSS. The exporter writes
 * `css/anim.css` and `js/anim.js` only for pages that use them.
 *
 * Progressive enhancement: the markup and the static rules never hide anything.
 * Only `js/anim.js` hides a later section's parts (`k-wait-*`) and shows them as
 * they scroll in (`k-in-*`). The first section carries `k-in-*` already, so it
 * plays on load with CSS alone. All motion sits behind
 * `prefers-reduced-motion: no-preference` and moves only transform and opacity
 * (blur-in also softens with `filter`, and is a plain fade on phones).
 */
import { z } from 'zod';
import type { BlockType } from './blocks.ts';
import { escapeHtml as esc } from './html.ts';

/** Appear once the element scrolls into view. */
export const ENTRANCE_PRESETS = ['fade', 'slideUp', 'zoom', 'blurIn'] as const;
/** Headings only: the text appears piece by piece. */
export const TEXT_PRESETS = ['words', 'letters', 'typewriter'] as const;
/** Pictures, buttons and cards react to the pointer. */
export const HOVER_PRESETS = ['lift', 'tilt', 'glow'] as const;

export const ANIMATION_PRESETS = [
  ...ENTRANCE_PRESETS,
  ...TEXT_PRESETS,
  'maskWipe',
  'parallax',
  'marquee',
  ...HOVER_PRESETS,
] as const;
export type AnimationPreset = (typeof ANIMATION_PRESETS)[number];

/** What in a section can move. `section` is the whole content of the section. */
export const ANIMATION_TARGETS = [
  'section',
  'heading',
  'media',
  'buttons',
  'cards',
  'video',
] as const;
export type AnimationTarget = (typeof ANIMATION_TARGETS)[number];

export const ANIMATION_SPEEDS = ['slow', 'normal', 'fast'] as const;
export type AnimationSpeed = (typeof ANIMATION_SPEEDS)[number];
export const ANIMATION_REPEATS = ['once', 'always'] as const;

/** Longest wait before an animation starts, in milliseconds. */
export const MAX_ANIMATION_DELAY = 2000;
/** Most animated sections on one page (keeps pages light; also an import limit). */
export const MAX_ANIMATED_SECTIONS = 40;

export const animationSchema = z
  .object({
    preset: z.enum(ANIMATION_PRESETS),
    speed: z.enum(ANIMATION_SPEEDS).optional(),
    /** Milliseconds before it starts. */
    delay: z.number().int().min(0).max(MAX_ANIMATION_DELAY).optional(),
    /** `always`: plays again every time it comes back into view. */
    repeat: z.enum(ANIMATION_REPEATS).optional(),
  })
  .strict();

export const sectionAnimationSchema = z
  .object({
    section: animationSchema.optional(),
    heading: animationSchema.optional(),
    media: animationSchema.optional(),
    buttons: animationSchema.optional(),
    cards: animationSchema.optional(),
    video: animationSchema.optional(),
  })
  .strict();

export type Animation = z.infer<typeof animationSchema>;
export type SectionAnimation = z.infer<typeof sectionAnimationSchema>;
export type SplitMode = (typeof TEXT_PRESETS)[number];

const TARGETS: Record<BlockType, readonly AnimationTarget[]> = {
  hero: ['section', 'heading', 'media', 'buttons'],
  about: ['section', 'heading', 'media'],
  textImage: ['section', 'heading', 'media', 'buttons'],
  gallery: ['section', 'heading', 'media'],
  video: ['section', 'heading', 'video'],
  projects: ['section', 'heading', 'media', 'cards'],
  testimonials: ['section', 'heading', 'cards'],
  links: ['section', 'heading', 'media', 'cards'],
  contact: ['section', 'heading', 'buttons'],
  customCode: ['section'],
  spacer: [],
  footer: [],
};

/** Blocks with one big picture, where parallax fits. */
const PARALLAX_BLOCKS: ReadonlySet<BlockType> = new Set(['hero', 'about', 'textImage']);

/** The parts of a `type` section that can be animated, in the order the editor lists them. */
export function animationTargets(type: BlockType): readonly AnimationTarget[] {
  return TARGETS[type];
}

/** The presets that fit `target` in a `type` section. */
export function animationPresets(
  type: BlockType,
  target: AnimationTarget,
): readonly AnimationPreset[] {
  if (!TARGETS[type].includes(target)) return [];
  switch (target) {
    case 'section':
      return ENTRANCE_PRESETS;
    case 'heading':
      return [...ENTRANCE_PRESETS, ...TEXT_PRESETS, 'marquee'];
    case 'media':
      return [
        ...ENTRANCE_PRESETS,
        'maskWipe',
        ...(PARALLAX_BLOCKS.has(type) ? (['parallax'] as const) : []),
        ...(type === 'gallery' ? (['marquee'] as const) : []),
        ...HOVER_PRESETS,
      ];
    case 'buttons':
    case 'cards':
      return [...ENTRANCE_PRESETS, ...HOVER_PRESETS];
    case 'video':
      // Only the thumbnail moves; the player itself never does.
      return [...ENTRANCE_PRESETS, 'maskWipe'];
  }
}

/** Plays when it scrolls into view (so speed, delay and repeat apply). */
export function isEntrance(preset: AnimationPreset): boolean {
  return (
    (ENTRANCE_PRESETS as readonly string[]).includes(preset) ||
    (TEXT_PRESETS as readonly string[]).includes(preset) ||
    preset === 'maskWipe'
  );
}

/** Why `animation` does not fit a `type` section, or null when it does. */
export function animationProblem(type: BlockType, animation: SectionAnimation): string | null {
  for (const target of ANIMATION_TARGETS) {
    const setting = animation[target];
    if (!setting) continue;
    if (!TARGETS[type].includes(target)) return 'This section has nothing to animate there';
    if (!animationPresets(type, target).includes(setting.preset)) {
      return 'That animation does not fit this part of the section';
    }
  }
  return null;
}

/** True when the section has at least one animation. */
export function hasAnimation(animation: SectionAnimation | undefined): boolean {
  return animation !== undefined && ANIMATION_TARGETS.some((t) => animation[t] !== undefined);
}

/** True when any section on the page is animated (the page then links the animation files). */
export function pageAnimates(page: {
  sections: readonly { animation?: SectionAnimation | undefined }[];
}): boolean {
  return page.sections.some((s) => hasAnimation(s.animation));
}

/** The heading split the section asks for, if any. */
export function headingSplit(animation: SectionAnimation | undefined): SplitMode | undefined {
  const preset = animation?.heading?.preset;
  return (TEXT_PRESETS as readonly string[]).includes(preset ?? '')
    ? (preset as SplitMode)
    : undefined;
}

// ---- Markup ----

const DURATION: Record<AnimationSpeed, string> = { slow: '1.1s', normal: '.7s', fast: '.45s' };
/** Time between two pieces of a split heading. */
const STEP: Record<SplitMode, Record<AnimationSpeed, string>> = {
  words: { slow: '.08s', normal: '.06s', fast: '.04s' },
  letters: { slow: '.04s', normal: '.028s', fast: '.018s' },
  typewriter: { slow: '.09s', normal: '.06s', fast: '.04s' },
};

const wholeMs = (value: number | undefined): number =>
  Math.min(MAX_ANIMATION_DELAY, Math.max(0, Math.round(Number(value) || 0)));

/**
 * Classes and attributes for an animated `<section>`; both '' when it has none,
 * so unanimated pages stay byte-identical. Every value comes from a closed list
 * or a whole number in range.
 */
export function sectionAnimationMarkup(
  animation: SectionAnimation | undefined,
  first: boolean,
): { classes: string; attrs: string } {
  if (!animation || !hasAnimation(animation)) return { classes: '', attrs: '' };
  const used = ANIMATION_TARGETS.flatMap((t) => {
    const a = animation[t];
    return a ? [[t, a] as const] : [];
  });
  const enter = used.filter(([, a]) => isEntrance(a.preset)).map(([t]) => t);
  const again = used
    .filter(([, a]) => isEntrance(a.preset) && a.repeat === 'always')
    .map(([t]) => t);
  const vars = used.flatMap(([t, a]) => {
    const speed = a.speed ?? 'normal';
    if (a.preset === 'marquee') return [`--k-${t}-dur:${DURATION[speed]}`];
    if (!isEntrance(a.preset)) return [];
    const step = (TEXT_PRESETS as readonly string[]).includes(a.preset)
      ? [`--k-${t}-step:${STEP[a.preset as SplitMode][speed]}`]
      : [];
    return [`--k-${t}-dur:${DURATION[speed]}`, `--k-${t}-delay:${wholeMs(a.delay)}ms`, ...step];
  });
  const classes = ` k-anim${first ? enter.map((t) => ` k-in-${t}`).join('') : ''}`;
  const attrs =
    used.map(([t, a]) => ` data-anim-${t}="${esc(a.preset)}"`).join('') +
    (enter.length ? ` data-k-enter="${enter.join(' ')}"` : '') +
    (again.length ? ` data-k-again="${again.join(' ')}"` : '') +
    (vars.length ? ` style="${vars.join(';')}"` : '');
  return { classes, attrs };
}

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/** Letters as people see them (an emoji with a skin tone stays one piece). */
function graphemes(word: string): string[] {
  return segmenter ? Array.from(segmenter.segment(word), (s) => s.segment) : Array.from(word);
}

export interface SplitText {
  /** One HTML string per line, escaped. */
  lines: string[];
  /** The whole text on one line, for `aria-label`. */
  label: string;
  /** Number of pieces (words or letters). */
  count: number;
}

/**
 * Splits text into words or letters for a heading animation. Every piece is
 * `aria-hidden`; the heading gets `label` as its `aria-label`, and the words
 * themselves stay in the page (search engines and copy and paste still see them).
 */
export function splitLines(text: string, mode: SplitMode): SplitText {
  let index = 0;
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);
  const lines = rows.map((row) =>
    row
      .split(/\s+/)
      .map((word) => {
        if (mode === 'words') {
          return `<span class="k-w" aria-hidden="true"><span style="--i:${index++}">${esc(word)}</span></span>`;
        }
        const letters = graphemes(word)
          .map((g) => `<span class="k-c" style="--i:${index++}">${esc(g)}</span>`)
          .join('');
        return `<span class="k-w" aria-hidden="true">${letters}</span>`;
      })
      .join(' '),
  );
  return { lines, label: rows.join(' ').replace(/\s+/g, ' '), count: index };
}

/** `splitLines` with the lines joined by `<br>`. */
export function splitText(
  text: string,
  mode: SplitMode,
): { html: string; label: string; count: number } {
  const split = splitLines(text, mode);
  return { html: split.lines.join('<br>'), label: split.label, count: split.count };
}

/** Attributes for a split heading element. */
export function splitAttrs(split: { label: string; count: number }): string {
  return ` data-k-split aria-label="${esc(split.label)}" style="--n:${split.count}"`;
}

// ---- Stylesheet ----

/** Where each part sits inside its section (selector suffixes after the section). */
const SEL: Record<AnimationTarget, string> = {
  section: '>.wrap',
  heading: ' :is(.title,.display)',
  media: ' :is(.hero-media,.about-media,.split-media,.gallery figure,.cover,.avatar)',
  buttons: ' .button',
  cards: ' :is(.cards>li,.index>li,.quotes>figure,.linklist>li)',
  video: ' .video-facade',
};
const EASE = 'cubic-bezier(.2,.7,.2,1)';
const KEYFRAME: Record<(typeof ENTRANCE_PRESETS)[number], string> = {
  fade: 'k-fade',
  slideUp: 'k-up',
  zoom: 'k-zoom',
  blurIn: 'k-blur',
};

const dur = (t: AnimationTarget): string => `var(--k-${t}-dur,.7s)`;
/** Start time; list items (cards, gallery pictures) follow one another. */
const start = (t: AnimationTarget): string => `calc(var(--k-${t}-delay,0ms) + var(--i,0)*80ms)`;
const pieceStart = `calc(var(--k-heading-delay,0ms) + var(--i,0)*var(--k-heading-step,.06s))`;
const is = (t: AnimationTarget, presets: readonly string[]): string =>
  `:is(${presets.map((p) => `[data-anim-${t}=${p}]`).join(',')})`;

const WITH_ENTRANCE: AnimationTarget[] = [
  'section',
  'heading',
  'media',
  'buttons',
  'cards',
  'video',
];
const WITH_HOVER: AnimationTarget[] = ['media', 'buttons', 'cards'];

/** Each preset names its keyframes in a variable, so one rule per part plays them all. */
function entranceRules(): string {
  return WITH_ENTRANCE.map((t) => {
    const names = ENTRANCE_PRESETS.map((p) => `[data-anim-${t}=${p}]{--k-${t}-kf:${KEYFRAME[p]}}`);
    const presets = is(t, ENTRANCE_PRESETS);
    return `${names.join('')}
.k-wait-${t}${presets}${SEL[t]}{opacity:0}
.k-in-${t}${presets}${SEL[t]}{animation:var(--k-${t}-kf) ${dur(t)} ${EASE} ${start(t)} both}`;
  }).join('\n');
}

function wipeRules(): string {
  return (['media', 'video'] as const)
    .map((t) => {
      const el = `[data-anim-${t}=maskWipe]${SEL[t]}`;
      return `${el}::after{content:"";position:absolute;inset:0;z-index:1;background:var(--card);transform:scaleX(0);transform-origin:100% 50%;pointer-events:none}
.k-wait-${t}${el}::after{transform:none}
.k-in-${t}${el}::after{animation:k-wipe ${dur(t)} cubic-bezier(.65,0,.35,1) ${start(t)} both}
.k-in-${t}${el} :is(img,.play){animation:k-settle calc(${dur(t)}*1.6) ${EASE} ${start(t)} both}`;
    })
    .join('\n');
}

function hoverRules(): string {
  return WITH_HOVER.map((t) => {
    const at = (p: string) => `[data-anim-${t}=${p}]${SEL[t]}`;
    return `${at('lift')}{transition:transform .3s ${EASE}}
${at('lift')}:is(:hover,:focus-within){transform:translateY(-6px)}
${at('tilt')}{transition:transform .45s ${EASE}}
${at('tilt')}:is(:hover,:focus-within){transform:perspective(60rem) rotateX(4deg) rotateY(-5deg) translateY(-4px)}
${at('glow')}{position:relative}
${at('glow')}::after{content:"";position:absolute;inset:0;z-index:1;border-radius:var(--radius);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--color-accent) 70%,transparent),0 18px 48px -14px color-mix(in srgb,var(--color-accent) 80%,transparent);opacity:0;transition:opacity .3s ease;pointer-events:none}
${at('glow')}:is(:hover,:focus-within)::after{opacity:1}`;
  }).join('\n');
}

const ENTER_MEDIA = [...ENTRANCE_PRESETS, 'maskWipe'];

/**
 * The site's own scroll reveal steps aside wherever a chosen animation moves the
 * same thing, so nothing animates twice. Only matters with motion allowed.
 */
const YIELD = `[data-anim-section] :is(.reveal,.head.reveal),${is('heading', [...ENTRANCE_PRESETS, ...TEXT_PRESETS])} .head.reveal,${is('cards', ENTRANCE_PRESETS)} :is(.cards,.index,.quotes,.linklist)>.reveal,[data-anim-media] .gallery>.reveal{opacity:1;transform:none;transition-property:none}
[data-anim-section] .reveal-mask,${is('media', [...ENTER_MEDIA, 'parallax'])} .reveal-mask,[data-anim-video] .reveal-mask{clip-path:none;transition-property:none}
[data-anim-section] .reveal-mask :is(img,video),${is('media', ENTER_MEDIA)} .reveal-mask :is(img,video){transform:none;transition-property:none}
[data-anim-media=parallax] .reveal-mask img{transition-property:none}
[data-anim-section] :is(.status,.actions,.line>span),[data-anim-heading] .line>span,${is('buttons', ENTRANCE_PRESETS)} .actions{animation:none}`;

/** Places in a list, so cards and pictures appear one after another. */
const ORDER = Array.from(
  { length: 7 },
  (_, i) =>
    `.k-anim :is(.cards,.index,.quotes,.linklist,.gallery)>:nth-child(${i < 6 ? i + 2 : 'n+8'}){--i:${i + 1}}`,
).join('');

export const ANIM_CSS = `/* Klinth motion presets. Nothing here hides content without its script. */
[data-k-split] .k-w{display:inline-block;white-space:nowrap}
[data-k-split] .k-w>span,[data-k-split] .k-c{display:inline-block}
[data-k-split] .k-c{position:relative}
[data-anim-heading=words] .k-w{overflow:hidden;vertical-align:top;padding-block:.04em .12em;margin-block:-.04em -.12em}
[data-anim-media=maskWipe]${SEL.media}{position:relative;overflow:hidden}
[data-anim-video=maskWipe] .video-facade{overflow:hidden}
[data-anim-media=marquee] .gallery,[data-anim-heading=marquee] :is(.title,.display){overflow-x:auto;scrollbar-width:none}
[data-anim-media=marquee] .gallery::-webkit-scrollbar,[data-anim-heading=marquee] :is(.title,.display)::-webkit-scrollbar{display:none}
[data-anim-media=marquee] .gallery{display:flex;gap:0}
[data-anim-media=marquee] .gallery>li{flex:0 0 clamp(8rem,22vw,13rem);margin-right:clamp(.75rem,2vw,1.5rem)}
[data-anim-heading=marquee] :is(.title,.display){white-space:nowrap;max-width:none}
.k-mq-box,.k-mq-wrap{position:relative}
.k-mq-wrap{min-width:0;max-width:100%}
.k-mq-box{overflow:hidden}
.k-mq-box>.gallery.k-mq{overflow:visible;width:max-content}
span.k-mq{display:inline-block;white-space:nowrap}
span.k-mq>span{display:inline-block;padding-right:.6em}
.k-mq-pause{position:absolute;right:0;bottom:0;z-index:2;padding:.35rem .8rem;border:1px solid var(--line);border-radius:999px;background:var(--color-bg);color:var(--color-text);font:600 .75rem/1.2 var(--font-body);letter-spacing:0;cursor:pointer}
@keyframes k-fade{from{opacity:0}}
@keyframes k-up{from{opacity:0;transform:translateY(1.5rem)}}
@keyframes k-zoom{from{opacity:0;transform:scale(.92)}}
@keyframes k-blur{from{opacity:0;filter:blur(12px);transform:scale(1.04)}}
@keyframes k-rise{from{opacity:0;transform:translateY(.4em)}}
@keyframes k-caret{0%{opacity:1}50%{opacity:0}}
@keyframes k-wipe{from{transform:none}}
@keyframes k-settle{from{transform:scale(1.08)}}
@keyframes k-marquee{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:no-preference){
${ORDER}
${YIELD}
${entranceRules()}
.k-wait-heading[data-anim-heading=words] .k-w>span{transform:translateY(105%)}
.k-in-heading[data-anim-heading=words] .k-w>span{animation:line-up ${dur('heading')} ${EASE} ${pieceStart} both}
.k-wait-heading:is([data-anim-heading=letters],[data-anim-heading=typewriter]) .k-c{opacity:0}
.k-in-heading[data-anim-heading=letters] .k-c{animation:k-rise ${dur('heading')} ${EASE} ${pieceStart} both}
.k-in-heading[data-anim-heading=typewriter] .k-c{animation:k-fade .01s steps(1,end) ${pieceStart} both}
.k-in-heading[data-anim-heading=typewriter] :is(:is(.title,.display)>.k-w:last-child,.line:last-child .k-w:last-child)>.k-c:last-child::after{content:"";position:absolute;left:100%;top:.12em;bottom:.12em;width:.06em;background:currentColor;opacity:0;animation:k-caret .9s steps(1) calc(var(--k-heading-delay,0ms) + var(--n,1)*var(--k-heading-step,.06s)) 3}
${wipeRules()}
[data-anim-media=parallax] .k-px{overflow:hidden;border-radius:var(--radius)}
[data-anim-media=parallax] .k-px img{transform:translate3d(0,var(--k-py,0px),0) scale(1.12)}
.k-mq{animation:k-marquee var(--k-mq-dur,40s) linear infinite}
.k-mq-box:is(:hover,:focus-within,.k-paused) .k-mq,.k-mq-wrap:is(:hover,:focus-within,.k-paused) .k-mq{animation-play-state:paused}
}
@media (prefers-reduced-motion:no-preference) and (hover:hover){
${hoverRules()}
}
@media (prefers-reduced-motion:no-preference) and (max-width:37.5em){
${WITH_ENTRANCE.map((t) => `[data-anim-${t}=blurIn]{--k-${t}-kf:k-fade}`).join('')}
.k-in-media[data-anim-media=maskWipe]${SEL.media} img{animation:none}
}
`;

// ---- Script ----

/**
 * Hides later sections' parts until they scroll in, replays the ones set to
 * "every time", moves parallax pictures and runs marquees. Plain ES5; does
 * nothing for visitors who asked for less motion or in old browsers.
 */
export const ANIM_JS = `(function () {
  'use strict';
  var sections = document.querySelectorAll('main > .k-anim');
  if (!sections.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var small = window.matchMedia('(max-width: 37.5em)');
  function list(el, name) { var v = el.getAttribute(name); return v ? v.split(' ') : []; }
  function each(items, fn) { Array.prototype.forEach.call(items, fn); }
  function seconds(el, name) { return parseFloat(window.getComputedStyle(el).getPropertyValue(name)) || 0.7; }

  // Entrances. The first section is already shown and plays on load.
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var el = entry.target;
        var again = list(el, 'data-k-again');
        if (entry.isIntersecting) {
          list(el, 'data-k-enter').forEach(function (t) {
            el.classList.remove('k-wait-' + t);
            el.classList.add('k-in-' + t);
          });
          if (!again.length) io.unobserve(el);
        } else {
          again.forEach(function (t) {
            if (!el.classList.contains('k-in-' + t)) return;
            el.classList.remove('k-in-' + t);
            el.classList.add('k-wait-' + t);
          });
        }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    each(sections, function (el) {
      var enter = list(el, 'data-k-enter');
      if (!enter.length) return;
      var shown = enter.some(function (t) { return el.classList.contains('k-in-' + t); });
      if (!shown) enter.forEach(function (t) { el.classList.add('k-wait-' + t); });
      if (!shown || list(el, 'data-k-again').length) io.observe(el);
    });
  }

  // Marquee: copies (hidden from screen readers) make the row loop; a button pauses it.
  function marquee(wrap, box, track, items, speed) {
    // Measured as a row (the classes make the track one line, as wide as its content).
    box.classList.add('k-mq-box');
    track.classList.add('k-mq');
    var width = track.scrollWidth;
    if (!width) {
      box.classList.remove('k-mq-box');
      track.classList.remove('k-mq');
      return;
    }
    var copies = Math.max(1, Math.ceil(box.clientWidth / width));
    for (var c = 1; c < copies * 2; c++) {
      items.forEach(function (item) {
        var copy = item.cloneNode(true);
        copy.setAttribute('aria-hidden', 'true');
        copy.setAttribute('data-k-clone', '');
        copy.removeAttribute('id');
        each(copy.querySelectorAll('a, button, input, select, textarea, [tabindex]'), function (f) { f.setAttribute('tabindex', '-1'); });
        each(copy.querySelectorAll('[id]'), function (n) { n.removeAttribute('id'); });
        track.appendChild(copy);
      });
    }
    track.style.setProperty('--k-mq-dur', Math.max(8, Math.round(width * copies / speed)) + 's');
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'k-mq-pause';
    button.textContent = 'Pause';
    button.addEventListener('click', function () {
      var paused = wrap.classList.toggle('k-paused');
      button.textContent = paused ? 'Play' : 'Pause';
    });
    wrap.appendChild(button);
  }
  each(document.querySelectorAll('[data-anim-media=marquee] .gallery'), function (row) {
    var section = row.closest('.k-anim');
    var box = document.createElement('div');
    row.parentNode.insertBefore(box, row);
    box.appendChild(row);
    marquee(box, box, row, Array.prototype.slice.call(row.children), 35 / seconds(section, '--k-media-dur'));
  });
  each(document.querySelectorAll('[data-anim-heading=marquee] .title, [data-anim-heading=marquee] .display'), function (heading) {
    var section = heading.closest('.k-anim');
    var wrap = document.createElement('div');
    wrap.className = 'k-mq-wrap';
    heading.parentNode.insertBefore(wrap, heading);
    wrap.appendChild(heading);
    var track = document.createElement('span');
    var item = document.createElement('span');
    while (heading.firstChild) item.appendChild(heading.firstChild);
    track.appendChild(item);
    heading.appendChild(track);
    marquee(wrap, heading, track, [item], 35 / seconds(section, '--k-heading-dur'));
  });

  // Parallax: big pictures move a little slower than the page. Off on small phones.
  var layers = [];
  each(document.querySelectorAll('[data-anim-media=parallax]'), function (section) {
    each(section.querySelectorAll('.hero-media, .about-media, .split-media'), function (m) {
      if (m.querySelector('img')) layers.push(m);
    });
  });
  if (!layers.length) return;
  var ticking = false;
  function move() {
    ticking = false;
    if (small.matches) return;
    var view = window.innerHeight;
    layers.forEach(function (m) {
      var box = m.getBoundingClientRect();
      if (box.bottom < 0 || box.top > view) return;
      var limit = box.height * 0.05;
      var shift = (box.top + box.height / 2 - view / 2) * -0.12;
      m.style.setProperty('--k-py', Math.max(-limit, Math.min(limit, shift)).toFixed(1) + 'px');
    });
  }
  function toggle() {
    layers.forEach(function (m) { m.classList.toggle('k-px', !small.matches); });
    move();
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(move); }
  }, { passive: true });
  window.addEventListener('resize', move, { passive: true });
  if (small.addEventListener) small.addEventListener('change', toggle);
  toggle();
})();
`;

export const ANIM_CSS_PATH = 'css/anim.css';
export const ANIM_JS_PATH = 'js/anim.js';
