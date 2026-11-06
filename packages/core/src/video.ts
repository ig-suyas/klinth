/**
 * Video look and multi-video layouts. Everything here is optional: a video
 * section without any of these settings renders exactly as before (no extra
 * files). Sizes, radius and border reach CSS only as checked whole numbers in
 * custom properties; shapes, frames and layouts only as classes from closed lists.
 *
 * `css/video.css` is linked from pages with a styled video section and
 * `js/video.js` from those and from pages with two or more videos (so only one
 * plays at a time). Without JavaScript every layout still shows every video:
 * the carousel is a row that scrolls and snaps, the deck is a plain column.
 */
import type { BlockProps, VideoRatio, VideoSize } from './blocks.ts';
import { parseVideoUrl } from './embed.ts';
import { freeCanvas } from './free.ts';
import type { Page } from './schema.ts';

export const VIDEO_CSS_PATH = 'css/video.css';
export const VIDEO_JS_PATH = 'js/video.js';

type VideoProps = BlockProps<'video'>;

/** Largest width in px of each size, per shape (a tall video needs less width). */
export const VIDEO_WIDTHS: Readonly<
  Record<VideoRatio, Readonly<Record<Exclude<VideoSize, 'full'>, number>>>
> = {
  landscape: { small: 480, medium: 720, large: 960 },
  vertical: { small: 240, medium: 320, large: 400 },
  square: { small: 320, medium: 440, large: 560 },
  portrait: { small: 280, medium: 380, large: 480 },
};

/** True when the section uses any look or layout setting (it then needs `css/video.css`). */
export function videoStyled(p: VideoProps): boolean {
  return (
    p.ratio !== undefined ||
    p.size !== undefined ||
    p.maxWidth !== undefined ||
    p.radius !== undefined ||
    p.shadow !== undefined ||
    p.border !== undefined ||
    p.frame !== undefined ||
    p.poster !== undefined ||
    p.play !== undefined ||
    p.titleBar !== undefined ||
    p.autoplay !== undefined ||
    p.controls !== undefined ||
    p.layout !== undefined ||
    (p.videos?.length ?? 0) > 0
  );
}

/**
 * The largest width of each video in px, or null for the full content width.
 * A custom width wins; without a size, landscape videos are full width (as
 * before) and the others medium.
 */
export function videoMaxWidth(p: VideoProps): number | null {
  if (p.maxWidth !== undefined && Number.isInteger(p.maxWidth)) return p.maxWidth;
  const ratio = p.ratio ?? 'landscape';
  const size = p.size ?? (ratio === 'landscape' ? 'full' : 'medium');
  return size === 'full' ? null : VIDEO_WIDTHS[ratio][size];
}

/** How many videos the section can actually play (links that parse, uploaded files). */
export function videoCount(p: VideoProps): number {
  const playable = (v: { embedUrl?: string | undefined; video?: string | undefined }) =>
    (v.embedUrl !== undefined && parseVideoUrl(v.embedUrl) !== null) || v.video !== undefined;
  return [p, ...(p.videos ?? [])].filter(playable).length;
}

/** The layout actually used: one video is always `single`; several default to a grid. */
export function videoLayout(p: VideoProps): NonNullable<VideoProps['layout']> {
  if (videoCount(p) < 2) return 'single';
  return p.layout ?? 'grid';
}

/** The page has a styled video section (it links `css/video.css`). */
export function pageVideoCss(page: Pick<Page, 'sections'>): boolean {
  return page.sections.some(
    (s) => s.type === 'video' && freeCanvas(s) === null && videoStyled(s.props),
  );
}

/** The page needs `js/video.js`: a styled video section, or two or more videos in all. */
export function pageVideoJs(page: Pick<Page, 'sections'>): boolean {
  if (pageVideoCss(page)) return true;
  let count = 0;
  for (const s of page.sections) {
    const canvas = freeCanvas(s);
    if (canvas) count += canvas.items.filter((i) => i.type === 'video').length;
    else if (s.type === 'video') count += videoCount(s.props);
  }
  return count >= 2;
}

/** Phones narrower than this see one video at a time. */
const PHONE = '(max-width:37.49rem)';

export const VIDEO_CSS = `.vids{--vr:16/9;--vrn:1.7778;display:grid;gap:clamp(1rem,2.5vw,1.75rem);min-width:0}
.vr-vertical{--vr:9/16;--vrn:.5625}.vr-square{--vr:1/1;--vrn:1}.vr-portrait{--vr:4/5;--vrn:.8}
.vid{width:100%;max-width:min(calc(var(--vmax,100000)*1px),calc(85vh*var(--vrn)));margin-inline:auto;min-width:0}
.vid-media{position:relative;overflow:hidden;border-radius:var(--radius)}
.vid-r .vid-media{border-radius:calc(var(--vrad,0)*1px)}
.vid-b .vid-media{border:calc(var(--vbw,0)*1px) solid var(--line)}
.vids .video-frame{aspect-ratio:var(--vr);border-radius:0}
.vids .video-file video{border-radius:0}
.has-ratio .video-file video{aspect-ratio:var(--vr);object-fit:cover}
.vs-soft .vid-media{box-shadow:0 18px 40px -22px rgb(0 0 0/.45)}
.vs-strong .vid-media{box-shadow:0 32px 70px -26px rgb(0 0 0/.6)}
.vf-card .vid,.vf-glass .vid{padding:clamp(.5rem,1.4vw,.875rem);border-radius:calc(var(--vrad,16)*1px + .5rem)}
.vf-card .vid{background:var(--card);box-shadow:0 1px 2px rgb(0 0 0/.06),0 14px 34px -20px rgb(0 0 0/.35)}
.vf-glass .vid{background:color-mix(in srgb,var(--card) 60%,transparent);border:1px solid color-mix(in srgb,var(--fg) 14%,transparent);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4)}
.vid-bar{display:flex;align-items:center;gap:.5rem;margin:0 0 .6rem;font-size:.9375rem;font-weight:600;color:var(--fg);min-width:0}
.vid-bar::before{content:"";flex:none;width:.5rem;height:.5rem;border-radius:50%;background:var(--link)}
.vid-bar span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.video-poster{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.video-facade .play{position:relative;z-index:1}
.video-facade .video-note{z-index:1}
.has-poster .video-note{color:#fff;text-shadow:0 1px 3px rgb(0 0 0/.75)}
.pl-square .play{border-radius:min(var(--radius),1.25rem)}
.pl-minimal .play{width:clamp(3.25rem,6vw,4rem);background:rgb(0 0 0/.55);border:2px solid #fff;box-shadow:none}
.pl-minimal .play::before{border-color:transparent transparent transparent #fff;border-width:.6rem 0 .6rem 1rem}
.vids-grid{list-style:none;margin:0;padding:0;grid-template-columns:repeat(auto-fit,minmax(min(100%,var(--vcol,18rem)),1fr));align-items:start}
.vids-grid.vr-vertical,.vids-grid.vr-portrait{--vcol:13rem}.vids-grid.vr-square{--vcol:15rem}
.vids-carousel,.vids-deck{position:relative;display:block}
.vc-track{position:relative;display:flex;gap:clamp(.75rem,2vw,1.25rem);overflow-x:auto;scroll-snap-type:x mandatory;overscroll-behavior-x:contain;scrollbar-width:none;padding:.75rem calc((100% - min(100%,calc(var(--vmax,100000)*1px),calc(85vh*var(--vrn))))/2)}
.vc-track::-webkit-scrollbar{display:none}
.vc-track:focus-visible{outline:2px solid var(--link);outline-offset:4px}
.vc-slide{flex:0 0 min(100%,calc(var(--vmax,100000)*1px),calc(85vh*var(--vrn)));scroll-snap-align:center;min-width:0}
.vc-slide>.vid{max-width:none}
.vc-nav,.vd-nav{display:flex;align-items:center;justify-content:center;gap:.5rem;margin-top:1rem}
.vc-nav[hidden],.vd-nav[hidden]{display:none}
.vc-btn{display:grid;place-items:center;width:2.75rem;height:2.75rem;padding:0;border-radius:50%;border:1px solid var(--line);background:var(--card);color:var(--fg);font:inherit;font-size:1.125rem;line-height:1;cursor:pointer}
.vc-btn:disabled{opacity:.4;cursor:default}
.vc-dots{display:flex;flex-wrap:wrap;justify-content:center}
.vc-dot{display:grid;place-items:center;width:1.75rem;height:2.75rem;padding:0;border:0;background:none;cursor:pointer}
.vc-dot::before{content:"";width:.5rem;height:.5rem;border-radius:.25rem;background:var(--fg);opacity:.35}
.vc-dot[aria-current="true"]::before{width:1.25rem;opacity:1}
.vids-carousel.is-ready .vc-slide:not(.is-active){transform:scale(.88);opacity:.55}
.vd-stack{display:grid;gap:clamp(1rem,2.5vw,1.75rem)}
.vids-deck.is-ready .vd-stack{gap:0;padding-top:2.25rem;width:100%;max-width:min(calc(var(--vmax,100000)*1px),calc(85vh*var(--vrn)));margin-inline:auto}
.vids-deck.is-ready .vd-card{grid-area:1/1;min-width:0;transform-origin:50% 0;transform:translateY(calc(var(--d,0)*-.9rem)) scale(calc(1 - var(--d,0)*.06));z-index:calc(20 - var(--d,0))}
.vids-deck.is-ready .vd-card:not(.is-front){pointer-events:none}
.vids-deck.is-ready .vd-card.is-gone{opacity:0}
.vids-deck.is-ready .vd-card>.vid{max-width:none}
.vd-count{margin:0;min-width:3.5rem;text-align:center;font-size:.875rem;color:var(--fg)}
.v-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@media (prefers-reduced-motion:no-preference){
.vc-track{scroll-behavior:smooth}
.vc-slide{transition:transform .45s cubic-bezier(.2,.7,.2,1),opacity .45s ease}
.vids-deck.is-ready .vd-card{transition:transform .5s cubic-bezier(.2,.7,.2,1),opacity .4s ease}
}
@media ${PHONE}{
.vc-track{padding-inline:0}
.vc-slide{flex-basis:100%}
.vids-carousel.is-ready .vc-slide:not(.is-active){transform:none}
}
`;

/**
 * Carousel, deck, muted loops and "one video at a time". Handles the
 * click-to-load facade itself (before site.js), so it can put the facade back
 * when another video starts or the slide changes. Only player addresses from
 * the two allowed hosts are ever loaded. With reduced motion nothing scrolls
 * smoothly, nothing animates and nothing plays by itself.
 */
export const VIDEO_JS = `(function () {
  'use strict';
  var PLAYERS = ['https://www.youtube-nocookie.com/embed/', 'https://player.vimeo.com/video/'];
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(mq && mq.matches); }
  var slice = function (list) { return Array.prototype.slice.call(list); };
  // Loaded players and the facades they replaced, so a player can be closed again.
  var loaded = [];
  var suppressUntil = 0;

  function unload(frame) {
    for (var i = 0; i < loaded.length; i++) {
      if (loaded[i][0] === frame) {
        if (frame.parentNode) frame.parentNode.replaceChild(loaded[i][1], frame);
        loaded.splice(i, 1);
        return;
      }
    }
  }
  // Pauses everything playing inside root (muted loops too) and closes its players.
  function stopIn(root) {
    slice(root.querySelectorAll('video')).forEach(function (v) { if (!v.paused) v.pause(); });
    loaded.slice().forEach(function (pair) { if (root.contains(pair[0])) unload(pair[0]); });
  }
  // One video with sound at a time: muted loops keep playing.
  function stopOthers(keep) {
    slice(document.querySelectorAll('video')).forEach(function (v) {
      if (v !== keep && !v.paused && !v.hasAttribute('data-autoplay')) v.pause();
    });
    loaded.slice().forEach(function (pair) { if (pair[0] !== keep) unload(pair[0]); });
  }
  function hidden(el) {
    return !!(el.closest && el.closest('.is-ready .vc-slide:not(.is-active), .is-ready .vd-card:not(.is-front)'));
  }

  document.addEventListener('play', function (e) {
    var v = e.target;
    if (v && v.tagName === 'VIDEO' && !v.hasAttribute('data-autoplay')) stopOthers(v);
  }, true);

  document.addEventListener('click', function (e) {
    if (Date.now() < suppressUntil) { e.preventDefault(); e.stopPropagation(); return; }
    if (e.defaultPrevented || !e.target.closest) return;
    var facade = e.target.closest('a.video-facade');
    var src = facade && facade.getAttribute('data-embed');
    if (!src || !PLAYERS.some(function (p) { return src.indexOf(p) === 0; })) return;
    e.preventDefault();
    stopOthers(null);
    var frame = document.createElement('iframe');
    frame.src = src;
    frame.title = facade.getAttribute('data-title') || 'Video';
    frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    loaded.push([frame, facade]);
    facade.parentNode.replaceChild(frame, facade);
    if (frame.focus) frame.focus();
  }, true);

  // Muted loops: play while on screen, never with reduced motion (then they get controls).
  var autos = slice(document.querySelectorAll('video[data-autoplay]'));
  function tryPlay(v) {
    if (reduced() || hidden(v)) return;
    var p = v.play && v.play();
    if (p && p.catch) p.catch(function () { v.controls = true; });
  }
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) tryPlay(en.target); else en.target.pause(); });
  }, { threshold: 0.5 }) : null;
  function calm() { autos.forEach(function (v) { v.pause(); v.controls = true; }); }
  autos.forEach(function (v) {
    v.muted = true;
    if (reduced()) { v.controls = true; return; }
    if (io) io.observe(v); else tryPlay(v);
  });
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (reduced()) calm(); });
  function resume(scope) {
    slice(scope.querySelectorAll('video[data-autoplay]')).forEach(tryPlay);
  }

  // A swipe with a mouse or pen moves one step (touch scrolls natively).
  function swipe(el, step) {
    var sx = null, sy = 0;
    el.addEventListener('pointerdown', function (e) { if (e.button) return; sx = e.clientX; sy = e.clientY; });
    el.addEventListener('pointercancel', function () { sx = null; });
    el.addEventListener('dragstart', function (e) { e.preventDefault(); });
    el.addEventListener('pointerup', function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
      suppressUntil = Date.now() + 400;
      step(dx < 0 ? 1 : -1);
    });
  }
  function keys(el, step, to) {
    el.addEventListener('keydown', function (e) {
      if (e.target && e.target.tagName === 'VIDEO') return;
      var k = e.key;
      if (k === 'ArrowRight') step(1);
      else if (k === 'ArrowLeft') step(-1);
      else if (k === 'Home') to(0);
      else if (k === 'End') to(Infinity);
      else return;
      e.preventDefault();
    });
  }

  slice(document.querySelectorAll('[data-carousel]')).forEach(function (c) {
    var track = c.querySelector('.vc-track');
    var nav = c.querySelector('.vc-nav');
    var slides = track ? slice(track.querySelectorAll('.vc-slide')) : [];
    if (!nav || slides.length < 2) return;
    var prev = nav.querySelector('.vc-prev');
    var next = nav.querySelector('.vc-next');
    var dots = slice(nav.querySelectorAll('.vc-dot'));
    var live = c.querySelector('.v-sr');
    var index = -1;
    function activate(i) {
      if (i === index) return;
      index = i;
      slides.forEach(function (s, k) {
        s.classList.toggle('is-active', k === i);
        if (k === i) s.removeAttribute('inert');
        else { s.setAttribute('inert', ''); stopIn(s); }
      });
      dots.forEach(function (d, k) {
        if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
      prev.disabled = i === 0;
      next.disabled = i === slides.length - 1;
      if (live) live.textContent = 'Video ' + (i + 1) + ' of ' + slides.length;
      resume(slides[i]);
    }
    function nearest() {
      var mid = track.scrollLeft + track.clientWidth / 2, best = 0, gap = Infinity;
      slides.forEach(function (s, k) {
        var d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - mid);
        if (d < gap) { gap = d; best = k; }
      });
      return best;
    }
    function go(i) {
      i = Math.max(0, Math.min(slides.length - 1, i));
      activate(i);
      var s = slides[i];
      var left = Math.max(0, s.offsetLeft - (track.clientWidth - s.offsetWidth) / 2);
      if (typeof track.scrollTo === 'function') track.scrollTo({ left: left, behavior: reduced() ? 'auto' : 'smooth' });
      else track.scrollLeft = left;
    }
    var timer = 0;
    track.addEventListener('scroll', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { activate(nearest()); }, 90);
    }, { passive: true });
    prev.addEventListener('click', function () { go(index - 1); });
    next.addEventListener('click', function () { go(index + 1); });
    dots.forEach(function (d, k) { d.addEventListener('click', function () { go(k); }); });
    keys(c, function (by) { go(index + by); }, go);
    swipe(track, function (by) { go(index + by); });
    nav.hidden = false;
    c.classList.add('is-ready');
    activate(0);
  });

  slice(document.querySelectorAll('[data-deck]')).forEach(function (d) {
    var cards = slice(d.querySelectorAll('.vd-card'));
    var nav = d.querySelector('.vd-nav');
    if (!nav || cards.length < 2) return;
    var count = nav.querySelector('.vd-count');
    var front = 0;
    function show(i) {
      var n = cards.length;
      front = ((i % n) + n) % n;
      cards.forEach(function (card, k) {
        var depth = (k - front + n) % n;
        card.style.setProperty('--d', String(Math.min(depth, 3)));
        card.classList.toggle('is-front', depth === 0);
        card.classList.toggle('is-gone', depth > 2);
        if (depth === 0) card.removeAttribute('inert');
        else { card.setAttribute('inert', ''); stopIn(card); }
      });
      if (count) count.textContent = (front + 1) + ' / ' + n;
      resume(cards[front]);
    }
    nav.querySelector('.vd-prev').addEventListener('click', function () { show(front - 1); });
    nav.querySelector('.vd-next').addEventListener('click', function () { show(front + 1); });
    keys(d, function (by) { show(front + by); }, function (i) { show(Math.min(i, cards.length - 1)); });
    swipe(d.querySelector('.vd-stack'), function (by) { show(front + by); });
    nav.hidden = false;
    d.classList.add('is-ready');
    show(0);
  });
})();
`;
