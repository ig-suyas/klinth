import { describe, expect, it } from 'vitest';
import {
  EXTRAS_CSS,
  EXTRAS_CSS_PATH,
  EXTRAS_JS,
  EXTRAS_JS_PATH,
  MAX_SHAPES_PER_PAGE,
  MAX_SHAPES_PER_SECTION,
  MIGRATIONS,
  SCHEMA_VERSION,
  SHAPE_KINDS,
  SHAPE_MOTIONS,
  addPage,
  blankProject,
  blockPropSchemas,
  highlightPhrases,
  migrateProject,
  pageExtrasCss,
  pageExtrasJs,
  projectSchema,
  renderSite,
  rotatorPhrase,
  type Project,
} from './index.ts';
import { sampleProject } from './sample.ts';

type AnySection = Project['pages'][number]['sections'][number];

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;

/** A project made from Blank with a second page holding `sections` (like the editor makes it). */
function onSecondPage(sections: Record<string, unknown>[]): Project {
  const { project } = addPage(blankProject(), 'Second page');
  const page = project.pages[1];
  if (!page) throw new Error('no second page');
  page.sections = sections as AnySection[];
  project.assets.push(
    ...['p1', 'p2', 'p3', 'p4'].map((id) => ({
      id,
      kind: 'image' as const,
      name: `${id}.webp`,
      size: 10,
      mime: 'image/webp' as const,
      width: 800,
      height: 1000,
    })),
  );
  return project;
}

const files = (p: Project) => renderSite(p);
const file = (p: Project, path: string): string => {
  const f = files(p).find((x) => x.path === path);
  if (typeof f?.content !== 'string') throw new Error(`${path} missing`);
  return f.content;
};
const has = (p: Project, path: string) => files(p).some((x) => x.path === path);
const sectionHtml = (p: Project, id: string, path = 'second-page.html'): string => {
  const m = new RegExp(`<section id="${id}"[\\s\\S]*?</section>`).exec(file(p, path));
  return m?.[0] ?? '';
};
const valid = (p: Project) => projectSchema.safeParse(p).success;
const ok = <T extends keyof typeof blockPropSchemas>(type: T, props: Record<string, unknown>) =>
  blockPropSchemas[type].safeParse(props).success;

const STAR = { kind: 'starburst', color: 'accent', motion: 'spin', size: 160, x: 80, y: 20 };

describe('extras: validation', () => {
  it('rotating headline: effects, interval range, word count and length', () => {
    const words = [{ word: 'websites' }, { word: 'apps' }];
    for (const effect of ['fade', 'slide', 'typewriter'])
      expect(ok('rotator', { heading: 'We build', words, effect })).toBe(true);
    expect(ok('rotator', { words, interval: 1000 })).toBe(true);
    expect(ok('rotator', { words, interval: 10000 })).toBe(true);
    for (const interval of [999, 10001, 2500.5, Number.NaN, Infinity, '3000'])
      expect(ok('rotator', { words, interval })).toBe(false);
    expect(ok('rotator', { words, effect: 'spin' })).toBe(false);
    expect(ok('rotator', { words: Array.from({ length: 9 }, () => ({ word: 'x' })) })).toBe(false);
    expect(ok('rotator', { words: [{ word: '' }] })).toBe(false);
    expect(ok('rotator', { words: [{ word: 'a\nb' }] })).toBe(false);
    expect(ok('rotator', { words: [{ word: 'x'.repeat(41) }] })).toBe(false);
    expect(ok('rotator', { words, html: '<b>' })).toBe(false);
  });

  it('picture stack: at most 6 pictures, tilt, interval and shape ranges', () => {
    const images = Array.from({ length: 6 }, (_, i) => ({ image: `p${i}`, imageAlt: 'x' }));
    expect(ok('cardStack', { images, auto: true, interval: 2000, tilt: 0, ratio: 'square' })).toBe(
      true,
    );
    expect(ok('cardStack', { images: [...images, { image: 'p7' }] })).toBe(false);
    for (const tilt of [-1, 16, 1.5, Number.NaN]) expect(ok('cardStack', { tilt })).toBe(false);
    for (const interval of [1999, 10001]) expect(ok('cardStack', { interval })).toBe(false);
    expect(ok('cardStack', { ratio: 'wide' })).toBe(false);
    expect(ok('cardStack', { auto: 'yes' })).toBe(false);
  });

  it('glass cards: only the closed list, on card sections', () => {
    for (const type of [
      'projects',
      'testimonials',
      'links',
      'about',
      'steps',
      'marquee',
    ] as const) {
      expect(ok(type, { cardStyle: 'glass' })).toBe(true);
      expect(ok(type, { cardStyle: 'plain' })).toBe(true);
      expect(ok(type, { cardStyle: 'frosted' })).toBe(false);
    }
    expect(ok('hero', { cardStyle: 'glass' })).toBe(false);
  });

  it('quote marquee: speeds, directions, at most 12 quotes', () => {
    const items = [{ quote: 'Great **work**', name: 'Ana' }];
    for (const speed of ['slow', 'normal', 'fast'])
      for (const direction of ['left', 'right'])
        expect(ok('marquee', { items, speed, direction })).toBe(true);
    expect(ok('marquee', { items, speed: 'warp' })).toBe(false);
    expect(ok('marquee', { items: Array.from({ length: 13 }, () => items[0]) })).toBe(false);
  });

  it('expandable: any section but the footer and empty space, title one line', () => {
    expect(ok('textImage', { fold: true, foldTitle: 'More', foldOpen: true })).toBe(true);
    expect(ok('video', { fold: true })).toBe(true);
    expect(ok('customCode', { fold: true })).toBe(true);
    expect(ok('textImage', { fold: 'yes' })).toBe(false);
    expect(ok('textImage', { foldTitle: 'a\nb' })).toBe(false);
    expect(ok('textImage', { foldTitle: 'x'.repeat(121) })).toBe(false);
    expect(ok('footer', { fold: true })).toBe(false);
    expect(ok('spacer', { fold: true })).toBe(false);
  });

  it('shapes: closed lists, whole-number ranges, per section and per page caps', () => {
    for (const kind of SHAPE_KINDS)
      for (const motion of SHAPE_MOTIONS)
        expect(ok('textImage', { shapes: [{ ...STAR, kind, motion }] })).toBe(true);
    const bad = [
      { kind: 'heart' },
      { color: 'red' },
      { color: '#ff0000' },
      { motion: 'bounce' },
      { size: 31 },
      { size: 641 },
      { size: 100.5 },
      { x: -1 },
      { y: 101 },
      { opacity: 9 },
      { opacity: 101 },
      { size: Number.NaN },
      { x: Infinity },
      { size: '100' },
      { path: 'M0 0' },
    ];
    for (const patch of bad)
      expect(ok('textImage', { shapes: [{ ...STAR, ...patch }] }), JSON.stringify(patch)).toBe(
        false,
      );
    const four = Array.from({ length: MAX_SHAPES_PER_SECTION }, () => STAR);
    expect(ok('spacer', { shapes: four })).toBe(true);
    expect(ok('spacer', { shapes: [...four, STAR] })).toBe(false);
    expect(ok('footer', { shapes: [STAR] })).toBe(false);

    const sections = Array.from({ length: MAX_SHAPES_PER_PAGE / 4 + 1 }, (_, i) => ({
      id: `s${i}`,
      type: 'spacer',
      props: { height: 96, shapes: i === 0 ? [STAR] : four.slice(0, 4) },
    }));
    expect(valid(onSecondPage(sections.slice(0, MAX_SHAPES_PER_PAGE / 4)))).toBe(true);
    expect(valid(onSecondPage(sections))).toBe(false);
  });

  it('giant text: fills, sizes, aligns, colors and angle', () => {
    for (const fill of ['accent', 'ink', 'custom'])
      for (const size of ['large', 'huge', 'max'])
        expect(ok('giantText', { heading: 'Hello', fill, size, crop: true, reveal: true })).toBe(
          true,
        );
    expect(
      ok('giantText', { fill: 'custom', color: '#112233', colorTo: '#abcdef', angle: 90 }),
    ).toBe(true);
    expect(ok('giantText', { color: 'red' })).toBe(false);
    expect(ok('giantText', { color: '#123' })).toBe(false);
    expect(ok('giantText', { angle: 361 })).toBe(false);
    expect(ok('giantText', { size: 'tiny' })).toBe(false);
  });

  it('numbered steps: at most 8 steps with a title', () => {
    expect(ok('steps', { items: [{ title: 'Plan', text: 'We talk.' }] })).toBe(true);
    expect(ok('steps', { items: [{ title: '' }] })).toBe(false);
    expect(ok('steps', { items: Array.from({ length: 9 }, () => ({ title: 'x' })) })).toBe(false);
  });
});

describe('extras: export', () => {
  it('nothing new is written for a project without them (old sites unchanged)', () => {
    const p = clone();
    expect(has(p, EXTRAS_CSS_PATH)).toBe(false);
    expect(has(p, EXTRAS_JS_PATH)).toBe(false);
    expect(file(p, 'index.html')).not.toContain('extras');
    expect(file(p, 'index.html')).not.toContain('<noscript>');
  });

  it('rotating headline: full phrase as the name, first word shown, widest word reserves room', () => {
    const p = onSecondPage([
      {
        id: 'rot',
        type: 'rotator',
        props: {
          heading: 'We build',
          words: [{ word: 'websites' }, { word: 'apps' }, { word: '<b>x</b>' }],
          after: 'that last.',
          effect: 'typewriter',
          interval: 3000,
        },
      },
    ]);
    expect(valid(p)).toBe(true);
    const html = sectionHtml(p, 'rot');
    expect(html).toContain('data-rotator');
    expect(html).toContain('data-interval="3000"');
    expect(html).toContain('rot-typewriter');
    expect(html).toContain('aria-label="We build websites, apps, &lt;b&gt;x&lt;/b&gt; that last."');
    expect(html).toMatch(/<span class="rot-w is-on" style="--n:8">websites<\/span>/);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>');
    // The words sit in one grid cell (the widest word sets the width), hidden from readers.
    expect(html).toMatch(/<span class="rot-words" aria-hidden="true">/);
    // The page's first heading is its h1.
    expect(html).toMatch(/<h1 class="rot-title"/);
    expect(rotatorPhrase({ heading: 'We', words: [{ word: 'a' }, { word: 'b' }] })).toBe('We a, b');
    expect(file(p, 'second-page.html')).toContain(
      `<link rel="stylesheet" href="${EXTRAS_CSS_PATH}">`,
    );
    expect(file(p, 'second-page.html')).toContain(
      `<script src="${EXTRAS_JS_PATH}" defer></script>`,
    );
    // The home page has none, so it links neither file.
    expect(file(p, 'index.html')).not.toContain(EXTRAS_CSS_PATH);
  });

  it('picture stack: tilted cards with depth, arrows, live count, auto shuffle', () => {
    const p = onSecondPage([
      {
        id: 'stk',
        type: 'cardStack',
        props: {
          heading: 'Moments',
          images: [
            { image: 'p1', imageAlt: 'One' },
            { image: 'p2', imageAlt: 'Two' },
            { image: 'p3', imageAlt: 'Three' },
            { image: 'missing', imageAlt: 'gone' },
          ],
          auto: true,
          interval: 4000,
          tilt: 7,
        },
      },
    ]);
    const html = sectionHtml(p, 'stk');
    expect(html).toContain('data-stack');
    expect(html).toContain('data-auto="4000"');
    expect(html).toContain('style="--tilt:7"');
    expect(html).toContain('role="region" aria-roledescription="carousel" aria-label="Moments"');
    expect(html.match(/class="stk-card[ "]/g)).toHaveLength(3);
    expect(html).toContain('style="--d:0;--sg:1"');
    expect(html).toContain('style="--d:2;--sg:1"');
    expect(html).toContain('aria-label="Previous picture"');
    expect(html).toContain('aria-label="Next picture"');
    expect(html).toContain('aria-live="polite">1 / 3</p>');
    expect(html).toContain('stk-pause');
    expect(html).toContain('src="assets/p1.webp"');
    expect(html).toContain('width="800" height="1000"');
  });

  it('glass cards: a class on the section, CSS with blur and a reduced-motion-safe lift', () => {
    const p = onSecondPage([
      {
        id: 'st',
        type: 'steps',
        props: { heading: 'How it works', cardStyle: 'glass', items: [{ title: 'Plan' }] },
      },
      {
        id: 'pr',
        type: 'projects',
        props: { cardStyle: 'glass', items: [{ title: 'One' }] },
      },
    ]);
    expect(sectionHtml(p, 'st')).toMatch(/class="block block-steps cs-glass bg-plain"/);
    expect(sectionHtml(p, 'st')).toContain('<ol class="steps" role="list">');
    expect(sectionHtml(p, 'st')).toContain('<span class="step-num" aria-hidden="true">01</span>');
    expect(sectionHtml(p, 'pr')).toMatch(/class="block block-projects cs-glass bg-plain"/);
    expect(EXTRAS_CSS).toContain('backdrop-filter:blur(');
    // Steps and glass need no script.
    expect(file(p, 'second-page.html')).not.toContain(EXTRAS_JS_PATH);
    expect(has(p, EXTRAS_JS_PATH)).toBe(false);
  });

  it('quote marquee: highlighted phrases, duration from the count, a hidden pause button', () => {
    const p = onSecondPage([
      {
        id: 'mq',
        type: 'marquee',
        props: {
          heading: 'Kind words',
          speed: 'fast',
          direction: 'right',
          items: [
            { quote: 'They were **brilliant** to <work> with', name: 'Ana', role: 'CEO' },
            { quote: 'Fast and **kind**.', name: 'Ben' },
          ],
        },
      },
    ]);
    const html = sectionHtml(p, 'mq');
    expect(html).toContain('data-marquee');
    expect(html).toContain('mq-right');
    expect(html).toMatch(/style="--mq-dur:\d+"/);
    expect(html).toContain('<mark class="hl">brilliant</mark>');
    expect(html).toContain('&lt;work&gt;');
    expect(html).not.toContain('<work>');
    expect(html).toContain('<button type="button" class="mq-toggle" hidden>Pause</button>');
    expect(highlightPhrases('a **<i>** b')).toBe('a <mark class="hl">&lt;i&gt;</mark> b');
    expect(highlightPhrases('no ** pair')).toBe('no ** pair');
  });

  it('expandable: a real button with aria-expanded and aria-controls around any content', () => {
    const p = onSecondPage([
      {
        id: 'faq',
        type: 'textImage',
        props: { heading: 'Details', body: 'Hidden text', fold: true, foldTitle: 'Read more' },
      },
      {
        id: 'vid',
        type: 'video',
        props: { heading: 'Clip', fold: true, foldOpen: true, foldTitle: 'Watch' },
      },
    ]);
    const closed = sectionHtml(p, 'faq');
    expect(closed).toMatch(/class="block block-textImage has-fold bg-plain"/);
    expect(closed).toContain(
      '<button type="button" class="xp-btn" id="faq-xp" aria-expanded="false" aria-controls="faq-xp-panel">',
    );
    expect(closed).toContain('id="faq-xp-panel" role="region" aria-labelledby="faq-xp"');
    expect(closed).toContain('Hidden text');
    expect(closed).toMatch(/<div class="xp" data-fold>/);
    const open = sectionHtml(p, 'vid');
    expect(open).toMatch(/<div class="xp is-open" data-fold>/);
    expect(open).toContain('aria-expanded="true"');
    // Without scripts closed panels are shown (no content locked away).
    expect(file(p, 'second-page.html')).toMatch(
      /<noscript><style>[^<]*\.xp-panel[^<]*<\/style><\/noscript>/,
    );
    expect(EXTRAS_CSS).toContain('grid-template-rows');
  });

  it('shapes: decorative SVG, numbers only in custom properties, never user markup', () => {
    const p = onSecondPage([
      {
        id: 'band',
        type: 'spacer',
        props: {
          height: 160,
          shapes: [
            { ...STAR, opacity: 60, speed: 'slow' },
            { kind: 'blob', color: 'muted', motion: 'float', size: 240, x: 10, y: 90 },
            { kind: 'rings', color: 'text', motion: 'pulse', size: 120, x: 50, y: 50 },
            { kind: 'grid', color: 'surface', motion: 'none', size: 200, x: 0, y: 0 },
          ],
        },
      },
    ]);
    const html = sectionHtml(p, 'band');
    expect(html).toMatch(/class="block block-spacer has-shapes bg-plain"/);
    expect(html).toContain('<div class="shp-layer" aria-hidden="true">');
    expect(html.match(/<svg class="shp /g)).toHaveLength(4);
    expect(html).toContain('shp-starburst shp-c-accent shp-m-spin shp-v-slow');
    expect(html).toContain('style="--sx:80;--sy:20;--ss:160;--so:0.6"');
    expect(html).toContain('focusable="false"');
    // Only shapes: no script needed.
    expect(has(p, EXTRAS_JS_PATH)).toBe(false);
  });

  it('giant text: gradient fill, crop class on the section, custom colors as numbers', () => {
    const p = onSecondPage([
      {
        id: 'big',
        type: 'giantText',
        props: {
          heading: 'HELLO',
          fill: 'custom',
          color: '#112233',
          colorTo: '#ffeedd',
          angle: 45,
          crop: true,
          reveal: true,
          size: 'max',
        },
      },
    ]);
    const html = sectionHtml(p, 'big');
    expect(html).toMatch(/class="block block-giantText gt-crop bg-plain"/);
    expect(html).toMatch(/<h1 class="giant gt-max gt-f-custom gt-reveal"/);
    expect(html).toContain('--g1:17,34,51;--g2:255,238,221;--ga:45');
    expect(EXTRAS_CSS).toContain('background-clip:text');
    // The reveal needs the script.
    expect(file(p, 'second-page.html')).toContain(EXTRAS_JS_PATH);
  });

  it('pageExtrasCss / pageExtrasJs decide per page', () => {
    const page = (sections: Record<string, unknown>[]) => ({ sections: sections as AnySection[] });
    expect(pageExtrasCss(page([]))).toBe(false);
    expect(pageExtrasCss(page([{ id: 'a', type: 'steps', props: {} }]))).toBe(true);
    expect(pageExtrasJs(page([{ id: 'a', type: 'steps', props: {} }]))).toBe(false);
    expect(pageExtrasJs(page([{ id: 'a', type: 'giantText', props: { reveal: false } }]))).toBe(
      false,
    );
    expect(pageExtrasJs(page([{ id: 'a', type: 'marquee', props: {} }]))).toBe(true);
    expect(pageExtrasJs(page([{ id: 'a', type: 'hero', props: { fold: true } }]))).toBe(true);
  });
});

describe('extras: reduced motion', () => {
  it('every movement sits inside prefers-reduced-motion: no-preference', () => {
    // Strip the no-preference blocks; nothing left may animate or transition.
    const outside = EXTRAS_CSS.replace(
      /@media \(prefers-reduced-motion:no-preference\)[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g,
      '',
    );
    expect(outside).not.toMatch(/animation:[^;}]*(infinite|\d+m?s)/);
    expect(outside).not.toMatch(/transition:/);
    expect(EXTRAS_CSS).toContain('@media (prefers-reduced-motion:no-preference){');
  });

  it('the marquee falls back to a scroll-snap row; the script checks reduced motion', () => {
    expect(EXTRAS_CSS).toContain('scroll-snap-type:x mandatory');
    expect(EXTRAS_JS).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
  });
});

describe('extras: everything on a second page made from Blank', () => {
  it('each component and each animation renders, validates and exports', () => {
    const effects = ['fade', 'slide', 'typewriter'];
    const sections: Record<string, unknown>[] = [
      ...effects.map((effect) => ({
        id: `rot-${effect}`,
        type: 'rotator',
        props: { heading: 'We make', words: [{ word: 'sites' }, { word: 'shops' }], effect },
      })),
      {
        id: 'stack',
        type: 'cardStack',
        props: {
          images: ['p1', 'p2', 'p3'].map((image) => ({ image, imageAlt: image })),
          auto: true,
        },
      },
      { id: 'steps', type: 'steps', props: { cardStyle: 'glass', items: [{ title: 'One' }] } },
      ...['slow', 'normal', 'fast'].map((speed) => ({
        id: `mq-${speed}`,
        type: 'marquee',
        props: { speed, cardStyle: 'glass', items: [{ quote: 'Q **hi**', name: 'N' }] },
      })),
      {
        id: 'fold',
        type: 'about',
        props: { heading: 'About', fold: true, cardStyle: 'glass' },
      },
      {
        id: 'shapes',
        type: 'spacer',
        props: {
          height: 96,
          shapes: SHAPE_MOTIONS.map((motion, i) => ({
            ...STAR,
            kind: SHAPE_KINDS[i % SHAPE_KINDS.length],
            motion,
          })),
        },
      },
      ...['accent', 'ink'].map((fill) => ({
        id: `giant-${fill}`,
        type: 'giantText',
        props: { heading: 'BIG', fill, crop: true, reveal: true },
      })),
    ];
    const p = onSecondPage(sections);
    const parsed = projectSchema.safeParse(p);
    expect(parsed.error?.issues ?? []).toEqual([]);
    const html = file(p, 'second-page.html');
    for (const effect of effects) expect(html).toContain(`rot-${effect}`);
    for (const motion of SHAPE_MOTIONS) expect(html).toContain(`shp-m-${motion}`);
    for (const id of ['stack', 'steps', 'mq-fast', 'fold', 'shapes', 'giant-ink'])
      expect(html).toContain(`<section id="${id}"`);
    expect(has(p, EXTRAS_CSS_PATH)).toBe(true);
    expect(has(p, EXTRAS_JS_PATH)).toBe(true);
    expect(file(p, EXTRAS_JS_PATH)).toBe(EXTRAS_JS);
    // Same sections twice on a page: unique ids for every expandable panel.
    const twice = onSecondPage([
      { id: 'a', type: 'textImage', props: { fold: true } },
      { id: 'b', type: 'textImage', props: { fold: true } },
    ]);
    const twiceHtml = file(twice, 'second-page.html');
    expect(twiceHtml).toContain('id="a-xp-panel"');
    expect(twiceHtml).toContain('id="b-xp-panel"');
  });
});

describe('schema version 9', () => {
  it('upgrades version 8 files without changing them', () => {
    expect(SCHEMA_VERSION).toBe(9);
    expect(Object.keys(MIGRATIONS)).toContain('8');
    const v8 = { ...clone(), schemaVersion: 8 };
    expect(migrateProject(v8)).toEqual({ ...clone(), schemaVersion: 9 });
  });
});
