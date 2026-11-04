/**
 * The exported site's stylesheet and script. Theme values arrive as CSS custom
 * properties (see `themeToCss`); nothing here depends on the editor.
 *
 * Each section sets local colors (`--fg`, `--muted`, `--card`...) from its
 * background, so components read the same names on plain, tinted and bold sections.
 */
import { BOLD_CARD_MIX, BOLD_MUTED_MIX } from './contrast.ts';

const pct = (n: number): string => `${Math.round(n * 100)}%`;

export const SITE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-padding-top:5rem}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
body{margin:0;background:var(--color-bg);color:var(--color-text);font-family:var(--font-body);font-size:1.0625rem;line-height:1.65;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
img{max-width:100%;height:auto;display:block}
h1,h2,h3,h4{font-family:var(--font-heading);font-weight:var(--heading-weight);letter-spacing:var(--heading-tracking);line-height:1.08;margin:0;text-wrap:balance}
p{margin:0}
a{color:var(--link);text-decoration-thickness:1px;text-underline-offset:.2em}
a:hover{text-decoration-thickness:2px}
:focus-visible{outline:3px solid var(--ring);outline-offset:3px;border-radius:2px}
::selection{background:var(--color-accent);color:var(--color-accent-text)}
.wrap{width:100%;max-width:76rem;margin:0 auto;padding:0 clamp(1.25rem,4vw,3rem)}
.skip{position:absolute;left:1rem;top:-4rem;z-index:20;padding:.75rem 1rem;background:var(--color-accent);color:var(--color-accent-text);border-radius:var(--radius)}
.skip:focus{top:1rem}

/* ---- Section colors ---- */
body,.block,.site-footer{--fg:var(--color-text);--muted:var(--color-muted);--link:var(--color-accent);--ring:var(--color-accent);--card:var(--color-surface);--line:color-mix(in srgb,var(--color-text) 14%,transparent);--btn-bg:var(--color-accent);--btn-fg:var(--color-accent-text)}
.block{position:relative;background:var(--color-bg);color:var(--fg);padding-block:clamp(calc(var(--space)*9),11vw,calc(var(--space)*17))}
.bg-tinted{background:var(--color-surface);--card:var(--color-bg)}
.bg-bold{background:var(--color-accent);--fg:var(--color-accent-text);--muted:color-mix(in srgb,var(--color-accent-text) ${pct(BOLD_MUTED_MIX)},var(--color-accent));--link:var(--color-accent-text);--ring:var(--color-accent-text);--card:color-mix(in srgb,var(--color-accent-text) ${pct(BOLD_CARD_MIX)},var(--color-accent));--line:color-mix(in srgb,var(--color-accent-text) 28%,transparent);--btn-bg:var(--color-accent-text);--btn-fg:var(--color-accent)}
.bg-plain+.bg-plain{padding-top:0}

/* ---- Header ---- */
.site-header{position:sticky;top:0;z-index:10;background:var(--color-bg);border-bottom:1px solid var(--line)}
.bar{display:flex;align-items:center;justify-content:space-between;gap:1.5rem;min-height:4.25rem}
.brand{font-family:var(--font-heading);font-weight:var(--heading-weight);letter-spacing:var(--heading-tracking);font-size:1.25rem;color:var(--fg);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nav{position:relative}
.nav-links,.menu-panel{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.25rem 1.75rem}
.nav a{display:inline-block;padding:.5rem 0;color:var(--fg);text-decoration:none;font-size:.9375rem;background:linear-gradient(currentColor,currentColor) 0 calc(100% - .35rem)/0 1px no-repeat;transition:background-size .35s cubic-bezier(.2,.7,.2,1)}
.nav a:hover,.nav a[aria-current="page"]{background-size:100% 1px}
.menu{display:none}
.menu summary{list-style:none;cursor:pointer;padding:.5rem 1rem;border:1px solid var(--line);border-radius:999px;font-size:.9375rem}
.menu summary::-webkit-details-marker{display:none}
.menu-panel{position:absolute;right:0;top:calc(100% + .75rem);flex-direction:column;min-width:13rem;padding:.75rem 1.25rem;background:var(--color-bg);border:1px solid var(--line);border-radius:min(var(--radius),16px);box-shadow:0 24px 48px -24px rgb(0 0 0 / .35)}
@media (max-width:47.99rem){.has-menu .nav-links{display:none}.has-menu .menu{display:block}.nav-links{gap:.25rem 1rem}}

/* ---- Shared text ---- */
.head{display:grid;gap:calc(var(--space)*2.5);max-width:46rem;margin-bottom:clamp(calc(var(--space)*5),6vw,calc(var(--space)*9))}
.eyebrow{display:flex;align-items:center;gap:.75rem;font-family:var(--font-body);font-size:.8125rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.eyebrow::before{content:"";width:1.75rem;height:1px;background:currentColor}
.title{font-size:clamp(2.1rem,1.2rem + 3.6vw,4.25rem)}
h1.title{font-size:clamp(2.6rem,1.4rem + 5vw,5.5rem)}
.intro,.lede{font-size:clamp(1.125rem,1rem + .4vw,1.375rem);line-height:1.55;color:var(--muted);max-width:40rem}
.prose{display:grid;gap:1.1em;max-width:38rem}
.button{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;min-height:3rem;padding:.8rem 1.6rem;border:1px solid var(--btn-bg);border-radius:var(--radius);background:var(--btn-bg);color:var(--btn-fg);font:inherit;font-weight:600;font-size:1rem;line-height:1.2;text-decoration:none;cursor:pointer;transition:transform .25s cubic-bezier(.2,.7,.2,1),box-shadow .25s}
.button:hover{transform:translateY(-2px);box-shadow:0 12px 24px -12px color-mix(in srgb,var(--btn-bg) 70%,transparent)}
.button-ghost{background:transparent;color:var(--fg);border-color:var(--line)}
.button-ghost:hover{border-color:var(--fg);box-shadow:none}
span.button{cursor:default}

/* ---- Hero ---- */
.block-hero{padding-block:clamp(calc(var(--space)*8),10vw,calc(var(--space)*16)) clamp(calc(var(--space)*9),12vw,calc(var(--space)*18))}
.hero{display:grid;gap:clamp(2.5rem,6vw,5rem);align-items:end}
.hero-text{display:grid;gap:calc(var(--space)*3);justify-items:start}
.display{font-size:clamp(3.1rem,1.6rem + 7.4vw,9rem);line-height:.94;letter-spacing:calc(var(--heading-tracking) - .01em);max-width:14ch}
h2.display{font-size:clamp(2.4rem,1.4rem + 4.6vw,6rem)}
.lede{max-width:36rem}
.actions{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:calc(var(--space)*1)}
.status{display:inline-flex;align-items:center;gap:.6rem;padding:.4rem .9rem .4rem .7rem;border:1px solid var(--line);border-radius:999px;font-size:.875rem;color:var(--fg)}
.dot{width:.5rem;height:.5rem;border-radius:50%;background:var(--link);box-shadow:0 0 0 0 color-mix(in srgb,var(--link) 55%,transparent)}
.hero-media img,.about-media img,.split-media img{width:100%;border-radius:var(--radius);object-fit:cover}
.hero-media img{aspect-ratio:4/5}
.hero-centered .hero-text{justify-items:center;text-align:center;margin-inline:auto;max-width:56rem}
.hero-centered .display{max-width:none}
.hero-centered .lede{margin-inline:auto}
.hero-centered .hero-media{max-width:40rem;margin-inline:auto}
@media (min-width:48rem){
.hero-editorial.has-media{grid-template-columns:1fr minmax(14rem,22rem)}
.hero-split.has-media{grid-template-columns:1.1fr .9fr;align-items:center}
.hero-split .display{font-size:clamp(2.8rem,1.4rem + 5vw,6.5rem)}
}

/* ---- About, text and picture ---- */
.about,.split{display:grid;gap:clamp(2.5rem,6vw,6rem);align-items:start}
.about-media img{aspect-ratio:4/5}
.about-text .head{margin-bottom:calc(var(--space)*4)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:0;margin:calc(var(--space)*6) 0 0;border-top:1px solid var(--line)}
.facts div{padding:1.1rem 1.25rem 1.1rem 0;border-bottom:1px solid var(--line)}
.facts dt{font-size:.8125rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.facts dd{margin:.35rem 0 0;font-family:var(--font-heading);font-size:1.375rem;letter-spacing:var(--heading-tracking)}
.split-media img{aspect-ratio:5/4}
.split .head{margin-bottom:calc(var(--space)*3)}
@media (min-width:48rem){
.about.has-media{grid-template-columns:minmax(14rem,.8fr) 1.2fr}
.split{grid-template-columns:1fr 1fr;align-items:center}
.split-left .split-media{order:-1}
.split.no-media{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);align-items:start}
.split.no-media .prose{font-size:1.1875rem;padding-top:.5rem}
}

/* ---- Work: cards and index ---- */
.cards{list-style:none;margin:0;padding:0;display:grid;gap:clamp(2rem,4vw,3.5rem) clamp(1.25rem,3vw,2.5rem);grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),1fr))}
.card{position:relative;display:grid;gap:1.25rem;align-content:start}
.cover{position:relative;overflow:hidden;aspect-ratio:4/3;border-radius:var(--radius);background:var(--card);isolation:isolate}
.cover img{width:100%;height:100%;object-fit:cover;transition:transform .9s cubic-bezier(.2,.7,.2,1)}
.cover::before{content:"";position:absolute;inset:0;z-index:-1;transition:transform .9s cubic-bezier(.2,.7,.2,1)}
.cover-1::before{background:radial-gradient(90% 80% at 85% 10%,color-mix(in srgb,var(--color-accent) 70%,var(--card)),transparent 70%),linear-gradient(160deg,var(--card),color-mix(in srgb,var(--color-accent) 22%,var(--card)))}
.cover-2::before{background:radial-gradient(70% 90% at 10% 100%,color-mix(in srgb,var(--color-accent) 60%,var(--card)),transparent 70%),linear-gradient(20deg,color-mix(in srgb,var(--color-text) 10%,var(--card)),var(--card))}
.cover-3::before{background:conic-gradient(from 210deg at 70% 60%,var(--card),color-mix(in srgb,var(--color-accent) 45%,var(--card)),var(--card) 60%)}
.cover-4::before{background:radial-gradient(60% 60% at 30% 30%,color-mix(in srgb,var(--color-accent) 55%,var(--card)),transparent 70%),radial-gradient(50% 50% at 80% 80%,color-mix(in srgb,var(--color-text) 14%,var(--card)),transparent 70%),var(--card)}
.cover-num{position:absolute;left:clamp(1rem,3vw,1.75rem);bottom:clamp(.5rem,2vw,1rem);font-family:var(--font-heading);font-weight:var(--heading-weight);letter-spacing:var(--heading-tracking);font-size:clamp(4.5rem,10vw,8rem);line-height:1;color:var(--fg)}
.card:hover .cover img,.card:hover .cover::before{transform:scale(1.04)}
.card-body{display:grid;gap:.6rem}
.card-meta{font-size:.8125rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.card-title{font-size:clamp(1.5rem,1.2rem + 1vw,2rem)}
.card-text,.row-text{color:var(--muted);max-width:34rem}
.more{justify-self:start;font-weight:600;color:var(--fg)}
.stretch::after{content:"";position:absolute;inset:0;border-radius:var(--radius)}
.index{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.index li{position:relative;display:grid;grid-template-columns:2.5rem 1fr;gap:.5rem 1.5rem;padding:clamp(1.5rem,3vw,2.25rem) 0;border-bottom:1px solid var(--line)}
.num{font-size:.875rem;color:var(--muted);padding-top:.5rem;font-variant-numeric:tabular-nums}
.row-main{display:grid;gap:.6rem}
.row-title{font-size:clamp(1.5rem,1.1rem + 1.6vw,2.5rem)}
.row-meta{grid-column:2;font-size:.875rem;color:var(--muted)}
@media (min-width:48rem){.index li{grid-template-columns:4rem 1fr 12rem}.row-meta{grid-column:auto;text-align:right;padding-top:.6rem}}

/* ---- Gallery ---- */
.gallery{list-style:none;margin:0;padding:0;display:grid;gap:clamp(.75rem,2vw,1.5rem);grid-template-columns:repeat(auto-fill,minmax(min(100%,16rem),1fr))}
.gallery figure{margin:0;display:grid;gap:.6rem}
.gallery img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--radius)}
.gallery figcaption{font-size:.9375rem;color:var(--muted)}

/* ---- Video ---- */
.block-video .head{margin-bottom:clamp(calc(var(--space)*4),5vw,calc(var(--space)*7))}
.video-frame{position:relative;aspect-ratio:16/9;overflow:hidden;border-radius:var(--radius);background:var(--card)}
.video-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.video-facade{position:absolute;inset:0;display:grid;place-items:center;color:var(--fg);text-decoration:none;background:radial-gradient(70% 90% at 80% 10%,color-mix(in srgb,var(--color-accent) 55%,var(--card)),transparent 70%),radial-gradient(60% 80% at 10% 100%,color-mix(in srgb,var(--color-text) 16%,var(--card)),transparent 70%),var(--card)}
.play{display:grid;place-items:center;width:clamp(4.5rem,9vw,6.5rem);aspect-ratio:1;border-radius:50%;background:var(--btn-bg);box-shadow:0 18px 40px -16px color-mix(in srgb,var(--btn-bg) 80%,transparent);transition:transform .35s cubic-bezier(.2,.7,.2,1)}
.play::before{content:"";width:0;height:0;margin-left:12%;border-style:solid;border-width:.85rem 0 .85rem 1.4rem;border-color:transparent transparent transparent var(--btn-fg)}
.video-facade:hover .play{transform:scale(1.06)}
.video-note{position:absolute;left:1.25rem;bottom:1rem;font-size:.8125rem;letter-spacing:.06em;color:var(--muted)}
.video-file video{display:block;width:100%;height:auto;border-radius:var(--radius);background:#000}
.caption{margin-top:1rem;font-size:.9375rem;color:var(--muted);max-width:40rem}

/* ---- Testimonials ---- */
.quotes{display:grid;gap:clamp(1.25rem,3vw,2rem);grid-template-columns:repeat(auto-fit,minmax(min(100%,19rem),1fr))}
.quote{margin:0;display:flex;flex-direction:column;justify-content:space-between;gap:2rem;padding:clamp(1.75rem,3vw,2.5rem);background:var(--card);border-radius:var(--radius)}
.quote blockquote{margin:0;display:grid;gap:1em;font-family:var(--font-heading);font-size:clamp(1.25rem,1.1rem + .5vw,1.5rem);line-height:1.4;letter-spacing:var(--heading-tracking)}
.quote blockquote::before{content:"\\201C";display:block;height:.55em;font-size:3.5em;line-height:1;color:var(--link)}
.quote figcaption{display:grid;gap:.15rem;font-size:.9375rem}
.who{font-weight:600}
.role{color:var(--muted)}

/* ---- Links ---- */
.linkpage{max-width:34rem;margin-inline:auto;display:grid;justify-items:center;text-align:center}
.linkpage .head{justify-items:center;margin-bottom:calc(var(--space)*5)}
.linkpage .eyebrow::before{display:none}
.avatar img{width:7rem;height:7rem;border-radius:50%;object-fit:cover;margin-bottom:calc(var(--space)*3)}
.linklist{list-style:none;margin:0;padding:0;display:grid;gap:.75rem;width:100%}
.linkbtn{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:3.5rem;padding:1rem 1.5rem;border:1px solid var(--line);border-radius:var(--radius);background:var(--card);color:var(--fg);font-weight:600;text-decoration:none;text-align:left;transition:background-color .3s,color .3s,border-color .3s,transform .3s cubic-bezier(.2,.7,.2,1)}
a.linkbtn:hover{background:var(--btn-bg);color:var(--btn-fg);border-color:var(--btn-bg);transform:translateY(-2px)}
.arrow{transition:transform .3s cubic-bezier(.2,.7,.2,1)}
a.linkbtn:hover .arrow{transform:translateX(4px)}

/* ---- Contact ---- */
.contact{display:grid;gap:clamp(2.5rem,6vw,6rem);align-items:start}
.contact-details{display:grid;gap:1rem;justify-items:start}
.big-link{font-family:var(--font-heading);font-weight:var(--heading-weight);letter-spacing:var(--heading-tracking);font-size:clamp(1.6rem,1rem + 3vw,3.5rem);line-height:1.1;color:var(--fg);text-decoration-thickness:2px;text-underline-offset:.15em;overflow-wrap:anywhere}
.phone{color:var(--muted);font-size:1.125rem}
.form{display:grid;gap:1.25rem;padding:clamp(1.5rem,3vw,2.5rem);background:var(--card);border-radius:var(--radius)}
.form label{display:grid;gap:.5rem;font-size:.9375rem;font-weight:600}
.form input,.form textarea{width:100%;padding:.85rem 1rem;border:1px solid color-mix(in srgb,var(--fg) 35%,transparent);border-radius:min(var(--radius),12px);background:var(--color-bg);color:var(--color-text);font:inherit;font-weight:400}
.form textarea{resize:vertical;min-height:8rem}
.form input:focus-visible,.form textarea:focus-visible{outline-offset:1px}
.form .button{justify-self:start}
@media (min-width:48rem){.contact.has-form{grid-template-columns:1fr 1fr}}

/* ---- Footer and spacer ---- */
.site-footer{border-top:1px solid var(--line);color:var(--muted);font-size:.9375rem}
.foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1rem 2rem;padding-block:2.25rem}
.foot-links{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.5rem 1.5rem}
.site-footer a{color:var(--fg);text-decoration:none}
.site-footer a:hover{text-decoration:underline}
.spacer-small{height:calc(var(--space)*2)}.spacer-medium{height:calc(var(--space)*6)}.spacer-large{height:calc(var(--space)*12)}
.block-spacer{padding:0}

/* ---- Motion (only when the visitor has not asked for less) ---- */
@media (prefers-reduced-motion:no-preference){
.reveal{opacity:0;transform:translateY(12px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}
.reveal.is-visible{opacity:1;transform:none}
.reveal-mask{clip-path:inset(0 0 100% 0);transition:clip-path 1.1s cubic-bezier(.65,0,.35,1)}
.reveal-mask img,.reveal-mask video{transform:scale(1.06);transition:transform 1.4s cubic-bezier(.2,.7,.2,1)}
.reveal-mask.is-visible{clip-path:inset(0)}
.reveal-mask.is-visible img,.reveal-mask.is-visible video{transform:none}
.status,.actions{animation:rise .9s cubic-bezier(.2,.7,.2,1) both}
.actions{animation-delay:.12s}
.dot{animation:pulse 2.4s ease-out infinite}
@keyframes rise{from{opacity:0;transform:translateY(16px)}}
@keyframes pulse{70%{box-shadow:0 0 0 .55rem transparent}100%{box-shadow:0 0 0 0 transparent}}
}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition-duration:.01ms!important;animation:none!important}}
`;

export const SITE_JS = `(function () {
  'use strict';
  // Videos: the YouTube or Vimeo player loads only after the visitor presses play.
  var PLAYERS = ['https://www.youtube-nocookie.com/embed/', 'https://player.vimeo.com/video/'];
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || !e.target.closest) return;
    var facade = e.target.closest('a.video-facade');
    var src = facade && facade.getAttribute('data-embed');
    if (!src || !PLAYERS.some(function (p) { return src.indexOf(p) === 0; })) return;
    e.preventDefault();
    var frame = document.createElement('iframe');
    frame.src = src;
    frame.title = facade.getAttribute('data-title') || 'Video';
    frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    facade.parentNode.replaceChild(frame, facade);
    frame.focus();
  });

  // Menu: close after picking a link or pressing Escape.
  document.querySelectorAll('.menu').forEach(function (menu) {
    menu.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) menu.removeAttribute('open');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.hasAttribute('open')) {
        menu.removeAttribute('open');
        menu.querySelector('summary').focus();
      }
    });
  });

  // Scroll reveal. Skipped for reduced motion; the first section is never hidden.
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;
  var groups = '.cards > li, .index > li, .quotes > figure, .gallery > li, .linklist > li, .facts > div';
  var singles = '.head, .prose, .contact-details, .form';
  // Pictures and video open like a curtain instead of sliding in.
  var media = '.about-media, .split-media, .video-frame, .video-file';
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  var blocks = document.querySelectorAll('main > .block');
  for (var b = 1; b < blocks.length; b++) {
    blocks[b].querySelectorAll(singles + ', ' + groups + ', ' + media).forEach(function (el) {
      if (el.matches(groups)) {
        var index = Array.prototype.indexOf.call(el.parentNode.children, el);
        el.style.transitionDelay = Math.min(index, 5) * 70 + 'ms';
      }
      el.classList.add(el.matches(media) ? 'reveal-mask' : 'reveal');
      io.observe(el);
    });
  }
})();
`;
