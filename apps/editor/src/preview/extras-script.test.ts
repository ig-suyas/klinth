/**
 * The exported js/extras.js (rotating headline, picture stack, quote marquee,
 * expandable sections, giant text reveal), run on real exported markup in a
 * fresh jsdom window per test. Timers are collected by hand so each tick is explicit.
 */
import { EXTRAS_JS, addPage, blankProject, renderSite, type Project } from '@klinth/core';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('missing value');
  return value;
}

/** A second page made from Blank with these sections, exported. */
function exported(sections: Record<string, unknown>[]): string {
  const { project } = addPage(blankProject(), 'Extras');
  must(project.pages[1]).sections = sections as Project['pages'][number]['sections'];
  project.assets.push(
    ...['p1', 'p2', 'p3'].map((id) => ({
      id,
      kind: 'image' as const,
      name: `${id}.webp`,
      size: 10,
      mime: 'image/webp' as const,
      width: 800,
      height: 1000,
    })),
  );
  const page = renderSite(project).find((f) => f.path === 'extras.html');
  return typeof page?.content === 'string' ? page.content : '';
}

interface Run {
  win: Window & typeof globalThis;
  doc: Document;
  /** Runs every repeating timer once. */
  tick: () => void;
  /** How many repeating timers are running. */
  timers: () => number;
  enter: (el: Element, on?: boolean) => void;
}

function run(html: string, opts: { reduce?: boolean; io?: boolean } = {}): Run {
  // Visual, so document.hidden is false (hidden tabs pause the timers).
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://site.test/',
    pretendToBeVisual: true,
  });
  const win = dom.window as unknown as Window & typeof globalThis;
  const doc = win.document;
  win.matchMedia = ((query: string) => ({
    matches: query.includes('reduce') ? opts.reduce === true : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof win.matchMedia;
  const intervals = new Map<number, () => void>();
  let next = 1;
  win.setInterval = ((fn: () => void) => {
    const id = next++;
    intervals.set(id, fn);
    return id;
  }) as unknown as typeof win.setInterval;
  win.clearInterval = ((id: number) => {
    intervals.delete(id);
  }) as unknown as typeof win.clearInterval;
  win.setTimeout = ((fn: () => void) => {
    fn();
    return 0;
  }) as unknown as typeof win.setTimeout;
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
  win.eval(EXTRAS_JS);
  return {
    win,
    doc,
    tick: () => [...intervals.values()].forEach((fn) => fn()),
    timers: () => intervals.size,
    enter: (el, on = true) => io?.([{ target: el, isIntersecting: on }]),
  };
}

const key = (r: Run, el: Element, k: string) =>
  el.dispatchEvent(new r.win.KeyboardEvent('keydown', { key: k, bubbles: true }));

// ---- Expandable ----

const FOLDS = [
  { id: 'faq', type: 'textImage', props: { body: 'Answer', fold: true, foldTitle: 'Question' } },
  { id: 'open', type: 'about', props: { heading: 'Hi', fold: true, foldOpen: true } },
];

describe('expandable section', () => {
  it('a real button toggles aria-expanded, the class and inert', () => {
    const r = run(exported(FOLDS));
    const btn = must(r.doc.querySelector<HTMLButtonElement>('#faq-xp'));
    const panel = must(r.doc.getElementById('faq-xp-panel'));
    const fold = must(btn.closest('.xp'));
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.getAttribute('aria-controls')).toBe('faq-xp-panel');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hasAttribute('inert')).toBe(true);
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(fold.classList.contains('is-open')).toBe(true);
    expect(panel.hasAttribute('inert')).toBe(false);
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(fold.classList.contains('is-open')).toBe(false);
    expect(panel.hasAttribute('inert')).toBe(true);
  });

  it('starts open when asked, and Escape inside an open panel closes it and returns focus', () => {
    const r = run(exported(FOLDS));
    const btn = must(r.doc.querySelector<HTMLButtonElement>('#open-xp'));
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(must(r.doc.getElementById('open-xp-panel')).hasAttribute('inert')).toBe(false);
    const inside = must(r.doc.querySelector('#open-xp-panel .title'));
    key(r, inside, 'Escape');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(r.doc.activeElement).toBe(btn);
  });

  it('works the same with reduced motion (instant, no animation class)', () => {
    const r = run(exported(FOLDS), { reduce: true });
    const btn = must(r.doc.querySelector<HTMLButtonElement>('#faq-xp'));
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(must(btn.closest('.xp')).classList.contains('is-moving')).toBe(false);
  });
});

// ---- Picture stack ----

const STACK = (props: Record<string, unknown> = {}) => [
  {
    id: 'stk',
    type: 'cardStack',
    props: {
      heading: 'Moments',
      images: ['p1', 'p2', 'p3'].map((image) => ({ image, imageAlt: image })),
      ...props,
    },
  },
];

function stack(r: Run) {
  const root = must(r.doc.querySelector<HTMLElement>('[data-stack]'));
  const cards = [...root.querySelectorAll<HTMLElement>('.stk-card')];
  return {
    root,
    cards,
    front: () => cards.findIndex((c) => c.classList.contains('is-front')),
    depths: () => cards.map((c) => c.style.getPropertyValue('--d')),
    count: () => root.querySelector('.stk-count')?.textContent,
    btn: (name: string) => must(root.querySelector<HTMLButtonElement>(`.stk-${name}`)),
  };
}

describe('picture stack', () => {
  it('arrow keys, Home and End shuffle; only the front card is reachable; count is announced', () => {
    const r = run(exported(STACK()));
    const s = stack(r);
    expect(s.root.classList.contains('is-ready')).toBe(true);
    expect(s.front()).toBe(0);
    expect(s.cards[1]?.hasAttribute('inert')).toBe(true);
    key(r, s.root, 'ArrowRight');
    expect(s.front()).toBe(1);
    expect(s.depths()).toEqual(['2', '0', '1']);
    expect(s.count()).toBe('2 / 3');
    expect(s.cards[1]?.hasAttribute('inert')).toBe(false);
    expect(s.cards[0]?.hasAttribute('inert')).toBe(true);
    key(r, s.root, 'ArrowLeft');
    expect(s.front()).toBe(0);
    key(r, s.root, 'ArrowLeft');
    expect(s.front()).toBe(2);
    key(r, s.root, 'Home');
    expect(s.front()).toBe(0);
    key(r, s.root, 'End');
    expect(s.front()).toBe(2);
    // The list itself can take focus, so the keys work without a mouse.
    expect(s.root.querySelector('.stk-cards')?.getAttribute('tabindex')).toBe('0');
  });

  it('arrows, a click on the front card and a swipe shuffle too', () => {
    const r = run(exported(STACK()));
    const s = stack(r);
    s.btn('next').click();
    expect(s.front()).toBe(1);
    s.btn('prev').click();
    expect(s.front()).toBe(0);
    s.cards[0]?.click();
    expect(s.front()).toBe(1);
    const list = must(s.root.querySelector('.stk-cards'));
    const P = r.win.PointerEvent ?? r.win.MouseEvent;
    list.dispatchEvent(new P('pointerdown', { clientX: 200, clientY: 10, bubbles: true }));
    list.dispatchEvent(new P('pointerup', { clientX: 100, clientY: 12, bubbles: true }));
    expect(s.front()).toBe(2);
  });

  it('shuffles by itself, pauses on hover, focus and the Pause button', () => {
    const r = run(exported(STACK({ auto: true, interval: 3000 })));
    const s = stack(r);
    expect(r.timers()).toBe(1);
    r.tick();
    expect(s.front()).toBe(1);
    s.root.dispatchEvent(new r.win.MouseEvent('mouseenter'));
    r.tick();
    expect(s.front()).toBe(1);
    s.root.dispatchEvent(new r.win.MouseEvent('mouseleave'));
    r.tick();
    expect(s.front()).toBe(2);
    const pause = s.btn('pause');
    expect(pause.hidden).toBe(false);
    pause.click();
    expect(pause.textContent).toBe('Play');
    r.tick();
    expect(s.front()).toBe(2);
    pause.click();
    expect(pause.textContent).toBe('Pause');
    s.root.dispatchEvent(new r.win.FocusEvent('focusin', { bubbles: true }));
    r.tick();
    expect(s.front()).toBe(2);
  });

  it('reduced motion: never shuffles by itself, keys still work', () => {
    const r = run(exported(STACK({ auto: true })), { reduce: true });
    const s = stack(r);
    expect(r.timers()).toBe(0);
    expect(s.btn('pause').hidden).toBe(true);
    key(r, s.root, 'ArrowRight');
    expect(s.front()).toBe(1);
  });
});

// ---- Rotating headline ----

const ROT = [
  {
    id: 'rot',
    type: 'rotator',
    props: {
      heading: 'We build',
      words: [{ word: 'sites' }, { word: 'shops' }, { word: 'brands' }],
      interval: 2000,
    },
  },
];

describe('rotating headline', () => {
  it('swaps the shown word on each tick; the heading keeps its full name', () => {
    const r = run(exported(ROT));
    const title = must(r.doc.querySelector('.rot-title'));
    const on = () => r.doc.querySelector('.rot-w.is-on')?.textContent;
    expect(on()).toBe('sites');
    r.tick();
    expect(on()).toBe('shops');
    r.tick();
    expect(on()).toBe('brands');
    r.tick();
    expect(on()).toBe('sites');
    expect(title.getAttribute('aria-label')).toBe('We build sites, shops, brands');
  });

  it('reduced motion: shows the first word and never starts', () => {
    const r = run(exported(ROT), { reduce: true });
    expect(r.timers()).toBe(0);
    expect(r.doc.querySelector('.rot-w.is-on')?.textContent).toBe('sites');
  });
});

// ---- Marquee ----

const MQ = [
  {
    id: 'mq',
    type: 'marquee',
    props: {
      items: [
        { quote: 'Lovely **work**', name: 'Ana' },
        { quote: 'Fast', name: 'Ben' },
      ],
    },
  },
];

describe('quote marquee', () => {
  it('adds hidden copies, moves, and the button pauses and plays', () => {
    const r = run(exported(MQ));
    const root = must(r.doc.querySelector('[data-marquee]'));
    // Two quotes fill a wide screen three times over, then the loop doubles that.
    const cards = root.querySelectorAll('.mq-card');
    expect(cards).toHaveLength(12);
    const copies = root.querySelectorAll('.mq-card[aria-hidden="true"]');
    expect(copies).toHaveLength(10);
    expect(root.getAttribute('style')).toContain('--mq-k: 3');
    expect(copies[0]?.hasAttribute('inert')).toBe(true);
    expect(root.classList.contains('is-moving')).toBe(true);
    const toggle = must(root.querySelector<HTMLButtonElement>('.mq-toggle'));
    expect(toggle.hidden).toBe(false);
    toggle.click();
    expect(root.classList.contains('is-paused')).toBe(true);
    expect(toggle.textContent).toBe('Play');
    toggle.click();
    expect(root.classList.contains('is-paused')).toBe(false);
    expect(toggle.textContent).toBe('Pause');
  });

  it('reduced motion: stays a scroll-snap row with no copies and no button', () => {
    const r = run(exported(MQ), { reduce: true });
    const root = must(r.doc.querySelector('[data-marquee]'));
    expect(root.querySelectorAll('.mq-card')).toHaveLength(2);
    expect(root.classList.contains('is-moving')).toBe(false);
    expect(must(root.querySelector<HTMLButtonElement>('.mq-toggle')).hidden).toBe(true);
  });
});

// ---- Giant text ----

const GIANT = [
  { id: 'intro', type: 'spacer', props: { height: 96 } },
  { id: 'big', type: 'giantText', props: { heading: 'HELLO', reveal: true } },
];

describe('giant text reveal', () => {
  it('waits below the fold and appears on scroll', () => {
    const r = run(exported(GIANT));
    const big = must(r.doc.querySelector('.giant'));
    expect(big.classList.contains('gt-wait')).toBe(true);
    r.enter(big);
    expect(big.classList.contains('gt-in')).toBe(true);
    expect(big.classList.contains('gt-wait')).toBe(false);
  });

  it('reduced motion or no IntersectionObserver: never hidden', () => {
    for (const opts of [{ reduce: true }, { io: false }]) {
      const r = run(exported(GIANT), opts);
      expect(must(r.doc.querySelector('.giant')).classList.contains('gt-wait')).toBe(false);
    }
  });
});
