/**
 * The exported js/video.js (carousel, deck, muted loops, one video at a time),
 * run on real exported markup in a fresh jsdom window per test. jsdom has no
 * layout or media playback, so scrolling and play/pause are stubbed.
 */
import { VIDEO_JS, renderSite, sampleProject, type Project } from '@klinth/core';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const YT2 = 'https://youtu.be/aqz-KE-bpKQ';
const VIMEO = 'https://vimeo.com/76979871';

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('missing value');
  return value;
}

/** The exported home page with one video section using `props`. */
function exported(props: Record<string, unknown>): string {
  const p = JSON.parse(JSON.stringify(sampleProject)) as Project;
  must(p.pages[0]).sections.splice(1, 0, {
    id: 'vid',
    type: 'video',
    props: { heading: 'Watch', ...props },
  } as Project['pages'][number]['sections'][number]);
  p.assets.push(
    { id: 'clip', kind: 'video', name: 'clip.mp4', size: 10, mime: 'video/mp4' },
    { id: 'loop', kind: 'video', name: 'loop.mp4', size: 10, mime: 'video/mp4' },
  );
  const page = renderSite(p).find((f) => f.path === 'index.html');
  return typeof page?.content === 'string' ? page.content : '';
}

interface Run {
  win: Window & typeof globalThis;
  doc: Document;
  scrolls: { left: number; behavior: string }[];
  enter: (el: Element, on?: boolean) => void;
  played: () => HTMLVideoElement[];
}

/** Loads `html` in a new window and runs the script (reduced motion on or off). */
function run(html: string, opts: { reduce?: boolean; io?: boolean } = {}): Run {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://site.test/' });
  const win = dom.window;
  const doc = win.document;
  win.matchMedia = ((query: string) => ({
    matches: query.includes('reduce') ? opts.reduce === true : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof win.matchMedia;
  // Playback: `paused` follows play()/pause(), and `play` events fire like a browser's.
  const state = new WeakMap<object, boolean>();
  const proto = win.HTMLMediaElement.prototype;
  Object.defineProperty(proto, 'paused', {
    configurable: true,
    get(this: object) {
      return state.get(this) ?? true;
    },
  });
  proto.play = function (this: HTMLMediaElement) {
    state.set(this, false);
    this.dispatchEvent(new win.Event('play'));
    return Promise.resolve();
  };
  proto.pause = function (this: HTMLMediaElement) {
    state.set(this, true);
  };
  const scrolls: Run['scrolls'] = [];
  for (const track of doc.querySelectorAll<HTMLElement>('.vc-track')) {
    track.scrollTo = ((o: { left: number; behavior: string }) => {
      scrolls.push(o);
    }) as unknown as typeof track.scrollTo;
  }
  let io: ((entries: { target: Element; isIntersecting: boolean }[]) => void) | null = null;
  const w = win as unknown as Record<string, unknown>;
  if (opts.io !== false) {
    w.IntersectionObserver = class {
      constructor(cb: typeof io) {
        io = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  } else delete w.IntersectionObserver;
  win.eval(VIDEO_JS);
  return {
    win,
    doc,
    scrolls,
    enter: (el, on = true) => io?.([{ target: el, isIntersecting: on }]),
    played: () => [...doc.querySelectorAll('video')].filter((v) => !v.paused),
  };
}

const three = {
  embedUrl: YT,
  videos: [
    { embedUrl: YT2, title: 'Second' },
    { embedUrl: VIMEO, title: 'Third' },
  ],
};

const key = (r: Run, el: Element, k: string) =>
  el.dispatchEvent(new r.win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const pointer = (r: Run, el: Element, type: string, x: number, y = 0) =>
  el.dispatchEvent(new r.win.MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
const active = (r: Run) =>
  [...r.doc.querySelectorAll('.vc-slide')].findIndex((s) => s.classList.contains('is-active'));
const click = (r: Run, el: Element) =>
  el.dispatchEvent(new r.win.MouseEvent('click', { bubbles: true, cancelable: true }));

describe('carousel', () => {
  it('starts on the first slide with its controls shown', () => {
    const r = run(exported({ ...three, layout: 'carousel' }));
    const c = must(r.doc.querySelector('[data-carousel]'));
    expect(c.classList.contains('is-ready')).toBe(true);
    expect(must(r.doc.querySelector<HTMLElement>('.vc-nav')).hidden).toBe(false);
    expect(active(r)).toBe(0);
    const slides = [...r.doc.querySelectorAll('.vc-slide')];
    expect(slides.map((s) => s.hasAttribute('inert'))).toEqual([false, true, true]);
    expect(must(r.doc.querySelector<HTMLButtonElement>('.vc-prev')).disabled).toBe(true);
    expect(r.doc.querySelector('.vc-dot')?.getAttribute('aria-current')).toBe('true');
  });

  it('moves with the arrow keys, Home and End, and stops at the ends', () => {
    const r = run(exported({ ...three, layout: 'carousel' }));
    const track = must(r.doc.querySelector('.vc-track'));
    key(r, track, 'ArrowRight');
    expect(active(r)).toBe(1);
    expect(r.doc.querySelectorAll('.vc-dot')[1]?.getAttribute('aria-current')).toBe('true');
    expect(r.doc.querySelector('.v-sr')?.textContent).toBe('Video 2 of 3');
    key(r, track, 'End');
    expect(active(r)).toBe(2);
    expect(must(r.doc.querySelector<HTMLButtonElement>('.vc-next')).disabled).toBe(true);
    key(r, track, 'ArrowRight');
    expect(active(r)).toBe(2);
    key(r, track, 'Home');
    expect(active(r)).toBe(0);
    key(r, track, 'ArrowLeft');
    expect(active(r)).toBe(0);
    // Other keys are left alone.
    expect(key(r, track, 'a')).toBe(true);
  });

  it('moves with the arrows and dots', () => {
    const r = run(exported({ ...three, layout: 'carousel' }));
    click(r, must(r.doc.querySelector('.vc-next')));
    expect(active(r)).toBe(1);
    click(r, must(r.doc.querySelectorAll('.vc-dot')[2]));
    expect(active(r)).toBe(2);
    click(r, must(r.doc.querySelector('.vc-prev')));
    expect(active(r)).toBe(1);
  });

  it('follows a swipe past 40 px, ignores small or vertical moves, and does not play on a swipe', () => {
    const r = run(exported({ ...three, layout: 'carousel' }));
    const track = must(r.doc.querySelector('.vc-track'));
    pointer(r, track, 'pointerdown', 300);
    pointer(r, track, 'pointerup', 200);
    expect(active(r)).toBe(1);
    // The click that ends a swipe does not load the player under it.
    click(r, must(r.doc.querySelectorAll('a.video-facade')[1]));
    expect(r.doc.querySelector('iframe')).toBeNull();
    pointer(r, track, 'pointerdown', 100);
    pointer(r, track, 'pointerup', 220);
    expect(active(r)).toBe(0);
    pointer(r, track, 'pointerdown', 100);
    pointer(r, track, 'pointerup', 80);
    expect(active(r)).toBe(0);
    pointer(r, track, 'pointerdown', 100, 0);
    pointer(r, track, 'pointerup', 40, 200);
    expect(active(r)).toBe(0);
    // A swipe the browser turned into scrolling (touch) does nothing extra.
    pointer(r, track, 'pointerdown', 300);
    track.dispatchEvent(new r.win.Event('pointercancel'));
    pointer(r, track, 'pointerup', 100);
    expect(active(r)).toBe(0);
  });

  it('scrolls smoothly, or instantly with reduced motion', () => {
    const smooth = run(exported({ ...three, layout: 'carousel' }));
    click(smooth, must(smooth.doc.querySelector('.vc-next')));
    expect(smooth.scrolls.at(-1)?.behavior).toBe('smooth');
    const calm = run(exported({ ...three, layout: 'carousel' }), { reduce: true });
    click(calm, must(calm.doc.querySelector('.vc-next')));
    expect(calm.scrolls.at(-1)?.behavior).toBe('auto');
  });

  it('pauses the video and closes the player when the slide changes', () => {
    const r = run(
      exported({
        video: 'clip',
        layout: 'carousel',
        videos: [{ embedUrl: YT2 }, { video: 'clip' }],
      }),
    );
    const first = must(r.doc.querySelector('video'));
    void first.play();
    expect(first.paused).toBe(false);
    key(r, must(r.doc.querySelector('.vc-track')), 'ArrowRight');
    expect(first.paused).toBe(true);
    click(r, must(r.doc.querySelector('a.video-facade')));
    expect(r.doc.querySelectorAll('.vc-slide')[1]?.querySelector('iframe')).not.toBeNull();
    key(r, must(r.doc.querySelector('.vc-track')), 'ArrowRight');
    expect(r.doc.querySelector('iframe')).toBeNull();
    expect(r.doc.querySelectorAll('.vc-slide')[1]?.querySelector('a.video-facade')).not.toBeNull();
  });
});

describe('deck', () => {
  it('stacks the cards and cycles them with the arrow', () => {
    const r = run(exported({ ...three, layout: 'deck' }));
    const cards = [...r.doc.querySelectorAll<HTMLElement>('.vd-card')];
    const depths = () => cards.map((c) => c.style.getPropertyValue('--d'));
    expect(must(r.doc.querySelector('[data-deck]')).classList.contains('is-ready')).toBe(true);
    expect(depths()).toEqual(['0', '1', '2']);
    expect(cards.map((c) => c.hasAttribute('inert'))).toEqual([false, true, true]);
    click(r, must(r.doc.querySelector('.vd-next')));
    expect(depths()).toEqual(['2', '0', '1']);
    expect(cards[1]?.classList.contains('is-front')).toBe(true);
    expect(r.doc.querySelector('.vd-count')?.textContent).toBe('2 / 3');
    click(r, must(r.doc.querySelector('.vd-next')));
    click(r, must(r.doc.querySelector('.vd-next')));
    expect(depths()).toEqual(['0', '1', '2']);
    key(r, must(r.doc.querySelector('.vd-next')), 'ArrowLeft');
    expect(r.doc.querySelector('.vd-count')?.textContent).toBe('3 / 3');
  });

  it('pauses the front video when it goes to the back', () => {
    const r = run(exported({ video: 'clip', layout: 'deck', videos: [{ video: 'clip' }] }));
    const first = must(r.doc.querySelector('video'));
    void first.play();
    click(r, must(r.doc.querySelector('.vd-next')));
    expect(first.paused).toBe(true);
  });
});

describe('one video at a time', () => {
  it('pauses the other uploaded videos when one starts', () => {
    const r = run(exported({ video: 'clip', layout: 'grid', videos: [{ video: 'clip' }] }));
    const [a, b] = [...r.doc.querySelectorAll('video')];
    void must(a).play();
    void must(b).play();
    expect(r.played()).toEqual([b]);
  });

  it('closes a loaded player when another video starts, and the other way round', () => {
    const r = run(
      exported({ embedUrl: YT, layout: 'grid', videos: [{ embedUrl: YT2 }, { video: 'clip' }] }),
    );
    const [one, two] = [...r.doc.querySelectorAll('a.video-facade')];
    click(r, must(one));
    expect(r.doc.querySelectorAll('iframe')).toHaveLength(1);
    expect(r.doc.querySelector('iframe')?.src).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0',
    );
    click(r, must(two));
    const frames = [...r.doc.querySelectorAll('iframe')];
    expect(frames).toHaveLength(1);
    expect(frames[0]?.src).toContain('aqz-KE-bpKQ');
    // The first facade is back, ready to play again.
    expect(r.doc.querySelectorAll('a.video-facade')).toHaveLength(1);
    void must(r.doc.querySelector('video')).play();
    expect(r.doc.querySelectorAll('iframe')).toHaveLength(0);
    expect(r.doc.querySelectorAll('a.video-facade')).toHaveLength(2);
  });

  it('never loads a player from another host', () => {
    const r = run(exported({ embedUrl: YT, layout: 'grid', videos: [{ embedUrl: YT2 }] }));
    const facade = must(r.doc.querySelector('a.video-facade'));
    facade.setAttribute('data-embed', 'https://evil.example/embed/x');
    click(r, facade);
    expect(r.doc.querySelector('iframe')).toBeNull();
  });

  it('keeps silent loops playing when a video with sound starts', () => {
    const r = run(
      exported({ video: 'clip', autoplay: true, layout: 'grid', videos: [{ video: 'clip' }] }),
    );
    const [loop, other] = [...r.doc.querySelectorAll('video')];
    r.enter(must(loop));
    expect(must(loop).paused).toBe(false);
    must(other).removeAttribute('data-autoplay');
    void must(other).play();
    expect(must(loop).paused).toBe(false);
  });
});

describe('silent loops and reduced motion', () => {
  it('plays a loop only while it is on screen', () => {
    const r = run(exported({ video: 'clip', autoplay: true, controls: false }));
    const v = must(r.doc.querySelector('video'));
    expect(v.muted).toBe(true);
    expect(v.paused).toBe(true);
    r.enter(v);
    expect(v.paused).toBe(false);
    r.enter(v, false);
    expect(v.paused).toBe(true);
    expect(v.controls).toBe(false);
  });

  it('never plays by itself with reduced motion and shows the controls instead', () => {
    const r = run(exported({ video: 'clip', autoplay: true, controls: false }), { reduce: true });
    const v = must(r.doc.querySelector('video'));
    r.enter(v);
    expect(v.paused).toBe(true);
    expect(v.controls).toBe(true);
  });

  it('starts a loop straight away without IntersectionObserver', () => {
    const r = run(exported({ video: 'clip', autoplay: true }), { io: false });
    expect(must(r.doc.querySelector('video')).paused).toBe(false);
  });
});
