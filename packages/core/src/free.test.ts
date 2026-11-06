import { describe, expect, it } from 'vitest';
import {
  FREE_CSS,
  FREE_CSS_PATH,
  FREE_TOLERANCE,
  MAX_FREE_ITEMS,
  MAX_FREE_SECTIONS,
  MIGRATIONS,
  SCHEMA_VERSION,
  buildExport,
  flowToFree,
  freeCanvasSchema,
  freeToFlow,
  freeWarnings,
  migrateProject,
  parseProjectFile,
  projectSchema,
  readingOrder,
  removeAsset,
  renderSite,
  assetUsage,
  sectionSchema,
  serializeProject,
  type FreeCanvas,
  type Project,
  type Section,
} from './index.ts';
import { sampleProject } from './sample.ts';
import { TEST_FONTS } from './test-fonts.ts';

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('missing value');
  return value;
}

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
const exportOf = (p: Project) =>
  buildExport(p, new Map(p.assets.map((a) => [a.id, new Uint8Array([1, 2, 3])])), TEST_FONTS);
const fileText = (files: ReturnType<typeof buildExport>, path: string): string => {
  const file = files.find((f) => f.path === path);
  if (typeof file?.content !== 'string') throw new Error(`${path} missing`);
  return file.content;
};

/** A free hero whose items are listed out of reading order on purpose. */
function freeHero(): Section {
  return {
    id: 'free1',
    type: 'hero',
    layout: 'free',
    props: { heading: 'Old heading' },
    canvas: {
      aspect: 2,
      items: [
        { id: 'b', type: 'button', x: 10, y: 70, w: 20, h: 8, z: 3, label: 'Go', href: '#work' },
        {
          id: 't',
          type: 'text',
          style: 'title',
          text: 'Big title',
          size: 5,
          x: 10,
          y: 10,
          w: 60,
          h: 20,
          z: 1,
        },
        {
          id: 'p',
          type: 'text',
          style: 'body',
          text: 'Para one\n\nPara two',
          size: 1.5,
          x: 10,
          y: 40,
          w: 40,
          h: 20,
          z: 1,
        },
        {
          id: 'i',
          type: 'image',
          image: 'img1',
          imageAlt: 'A river map',
          x: 60,
          y: 40,
          w: 30,
          h: 50,
          z: 0,
        },
      ],
    },
  } as Section;
}

/** The sample project with the free hero as its first section. */
function withFree(section: Section = freeHero()): Project {
  const p = clone();
  must(p.pages[0]).sections[0] = section;
  return p;
}

const canvasOf = (s: Section): FreeCanvas => must(s.canvas);
const item = (over: Record<string, unknown> = {}) => ({
  id: 'x',
  type: 'text',
  style: 'body',
  text: 'Hi',
  size: 2,
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  z: 0,
  ...over,
});
const canvas = (items: unknown[], over: Record<string, unknown> = {}) => ({
  aspect: 1.5,
  items,
  ...over,
});
const okCanvas = (c: unknown) => freeCanvasSchema.safeParse(c).success;

/** The `<section>` markup for `id` in an exported page. */
function sectionHtml(html: string, id: string): string {
  const start = html.indexOf(`<section id="${id}"`);
  const end = html.indexOf('</section>', start);
  if (start < 0 || end < 0) throw new Error(`section ${id} missing`);
  return html.slice(start, end + '</section>'.length);
}

const VOID = new Set(['img', 'br', 'input', 'meta', 'link', 'hr', 'source']);
/** True when every opened tag is closed in order (enough to catch broken markup). */
function balanced(html: string): boolean {
  const stack: string[] = [];
  for (const m of html.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/g)) {
    const tag = must(m[1]);
    if (VOID.has(tag)) continue;
    if (m[0].startsWith('</')) {
      if (stack.pop() !== tag) return false;
    } else stack.push(tag);
  }
  return stack.length === 0;
}

describe('free canvas schema', () => {
  it('accepts a free section and keeps flow as the default', () => {
    expect(sectionSchema.safeParse(freeHero()).success).toBe(true);
    expect(projectSchema.safeParse(withFree()).success).toBe(true);
    const flow = must(clone().pages[0]).sections[0];
    expect(must(flow).layout).toBeUndefined();
    expect(projectSchema.safeParse(clone()).success).toBe(true);
  });

  it('allows positions a little past the edges, never more', () => {
    const t = FREE_TOLERANCE;
    expect(okCanvas(canvas([item({ x: -t, y: -t })]))).toBe(true);
    expect(okCanvas(canvas([item({ x: 100 - 10 + t })]))).toBe(true);
    expect(okCanvas(canvas([item({ x: -t - 0.01 })]))).toBe(false);
    expect(okCanvas(canvas([item({ y: -t - 0.01 })]))).toBe(false);
    expect(okCanvas(canvas([item({ x: 95, w: 10 })]))).toBe(false); // ends at 105
    expect(okCanvas(canvas([item({ y: 95, h: 10 })]))).toBe(false);
    expect(okCanvas(canvas([item({ w: 0 })]))).toBe(false);
    expect(okCanvas(canvas([item({ h: -5 })]))).toBe(false);
    expect(okCanvas(canvas([item({ w: 1000 })]))).toBe(false);
  });

  it(`holds at most ${MAX_FREE_ITEMS} items`, () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => item({ id: `i${i}` }));
    expect(okCanvas(canvas(many(MAX_FREE_ITEMS)))).toBe(true);
    expect(okCanvas(canvas(many(MAX_FREE_ITEMS + 1)))).toBe(false);
  });

  it('refuses unknown item types, unknown fields and duplicate ids', () => {
    expect(okCanvas(canvas([item({ type: 'shape' })]))).toBe(false);
    expect(okCanvas(canvas([item({ type: 'html', html: '<b>x</b>' })]))).toBe(false);
    expect(okCanvas(canvas([item({ style: 'banner' })]))).toBe(false);
    expect(okCanvas(canvas([item({ css: 'color:red' })]))).toBe(false);
    expect(okCanvas(canvas([item(), item()]))).toBe(false);
    expect(okCanvas(canvas([item()], { background: 'red' }))).toBe(false);
  });

  it('refuses non-number and non-finite geometry (no free-text CSS)', () => {
    for (const bad of [
      '10',
      '10%;background:url(https://evil.example)',
      'calc(1px)',
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(okCanvas(canvas([item({ x: bad })]))).toBe(false);
      expect(okCanvas(canvas([item({ size: bad })]))).toBe(false);
    }
    expect(okCanvas(canvas([item({ z: 1.5 })]))).toBe(false);
    expect(okCanvas(canvas([item({ z: -1 })]))).toBe(false);
    expect(okCanvas(canvas([item({ size: 0 })]))).toBe(false);
    expect(okCanvas(canvas([item({ size: 500 })]))).toBe(false);
    expect(okCanvas(canvas([item()], { aspect: 0 }))).toBe(false);
    expect(okCanvas(canvas([item()], { aspect: 1e6 }))).toBe(false);
    expect(okCanvas(canvas([item()], { aspect: '16/9' }))).toBe(false);
  });

  it('refuses unsafe links, embed code and other video sites', () => {
    const geometry = { x: 0, y: 0, w: 10, h: 10, z: 0 };
    const button = (href: string) => ({ id: 'b', type: 'button', label: 'Go', href, ...geometry });
    expect(okCanvas(canvas([button('https://example.com')]))).toBe(true);
    expect(okCanvas(canvas([button('javascript:alert(1)')]))).toBe(false);
    expect(okCanvas(canvas([button('data:text/html,<script>')]))).toBe(false);
    const vid = (embedUrl: string) => ({ id: 'v', type: 'video', embedUrl, ...geometry });
    expect(okCanvas(canvas([vid('https://www.youtube.com/watch?v=dQw4w9WgXcQ')]))).toBe(true);
    expect(okCanvas(canvas([vid('https://evil.example/video')]))).toBe(false);
    expect(okCanvas(canvas([vid('<iframe src="https://youtube.com/embed/x">')]))).toBe(false);
  });

  it('refuses binding paths that could reach object prototypes', () => {
    for (const from of ['__proto__', 'constructor', 'items.0.prototype', 'a..b', 'a.b.c.d.e']) {
      expect(okCanvas(canvas([item({ from })]))).toBe(false);
    }
    expect(okCanvas(canvas([item({ from: 'items.0.title' })]))).toBe(true);
  });

  it('checks reading order and phone layouts', () => {
    expect(okCanvas(canvas([item()], { readingOrder: ['x'] }))).toBe(true);
    expect(okCanvas(canvas([item()], { readingOrder: ['nope'] }))).toBe(false);
    expect(okCanvas(canvas([item()], { readingOrder: ['x', 'x'] }))).toBe(false);
    // A phone layout needs a phone box on every item.
    expect(okCanvas(canvas([item()], { phoneAspect: 0.5 }))).toBe(false);
    const phone = { x: 0, y: 0, w: 100, h: 20 };
    expect(okCanvas(canvas([item({ phone })], { phoneAspect: 0.5 }))).toBe(true);
    expect(okCanvas(canvas([item({ phone: { ...phone, x: 101 } })], { phoneAspect: 0.5 }))).toBe(
      false,
    );
  });

  it('needs a canvas exactly when the layout is free, and only on content sections', () => {
    const { canvas: c, ...noCanvas } = freeHero();
    const page = (sections: unknown[]) => {
      const p = clone() as unknown as { pages: { sections: unknown[] }[] };
      must(p.pages[0]).sections = sections;
      return projectSchema.safeParse(p).success;
    };
    expect(page([noCanvas])).toBe(false);
    expect(page([{ ...noCanvas, layout: 'flow', canvas: c }])).toBe(false);
    expect(page([{ ...noCanvas, layout: 'flow' }])).toBe(true);
    expect(page([{ ...freeHero(), layout: 'grid' }])).toBe(false);
    expect(page([{ id: 'f', type: 'footer', props: {}, layout: 'free', canvas: c }])).toBe(false);
    expect(page([{ id: 's', type: 'spacer', props: {}, layout: 'free', canvas: c }])).toBe(false);
  });

  it(`allows up to ${MAX_FREE_SECTIONS} free sections per page (import limit)`, () => {
    const sections = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ ...freeHero(), id: `f${i}` }));
    const p = clone();
    must(p.pages[0]).sections = sections(MAX_FREE_SECTIONS);
    expect(projectSchema.safeParse(p).success).toBe(true);
    must(p.pages[0]).sections = sections(MAX_FREE_SECTIONS + 1);
    expect(projectSchema.safeParse(p).success).toBe(false);
  });

  it('only lets a free section animate as a whole', () => {
    const s = { ...freeHero(), animation: { section: { preset: 'fade' } } } as Section;
    expect(projectSchema.safeParse(withFree(s)).success).toBe(true);
    const t = { ...freeHero(), animation: { heading: { preset: 'words' } } } as Section;
    expect(projectSchema.safeParse(withFree(t)).success).toBe(false);
  });
});

describe('reading order and warnings', () => {
  it('reads top to bottom, then left to right', () => {
    expect(readingOrder(canvasOf(freeHero())).map((i) => i.id)).toEqual(['t', 'p', 'i', 'b']);
  });

  it('lets a manual order go first', () => {
    const c = { ...canvasOf(freeHero()), readingOrder: ['b', 'i'] };
    expect(readingOrder(c).map((i) => i.id)).toEqual(['b', 'i', 't', 'p']);
  });

  it('warns about pictures without a description', () => {
    expect(freeWarnings(freeHero())).toEqual([]);
    const s = freeHero();
    const pic = must(canvasOf(s).items.find((i) => i.id === 'i')) as { imageAlt?: string };
    pic.imageAlt = '  ';
    expect(freeWarnings(s)).toEqual([{ item: 'i', message: expect.stringMatching(/describe/i) }]);
  });
});

describe('flow to free and back', () => {
  /** What the editor would measure for the sample hero, in pixels inside its `.wrap`. */
  const measured = {
    width: 1137,
    height: 523.4,
    elements: [
      { from: 'heading', x: 0, y: 12.25, width: 702.6, height: 188.1, fontSize: 84 },
      { from: 'subheading', x: 0, y: 230.5, width: 560, height: 61.3, fontSize: 21.25 },
      { from: 'buttons.0', x: 0, y: 330.75, width: 171.4, height: 48 },
      { from: 'nothing.here', x: 0, y: 0, width: 10, height: 10 },
      { from: 'layout', x: 0, y: 0, width: 10, height: 10 },
    ],
  };
  const sampleHero = (): Section => must(must(clone().pages[0]).sections[0]);

  it('keeps every measured element where it was (within half a pixel)', () => {
    const { section, skipped } = flowToFree(sampleHero(), measured);
    expect(section.layout).toBe('free');
    expect(skipped).toEqual(['nothing.here', 'layout']);
    const c = canvasOf(section);
    expect(c.aspect).toBeCloseTo(measured.width / measured.height, 3);
    const boardHeight = measured.width / c.aspect;
    for (const [i, el] of measured.elements.slice(0, 3).entries()) {
      const it = must(c.items[i]);
      expect(Math.abs((it.x / 100) * measured.width - el.x)).toBeLessThan(0.5);
      expect(Math.abs((it.y / 100) * boardHeight - el.y)).toBeLessThan(0.5);
      expect(Math.abs((it.w / 100) * measured.width - el.width)).toBeLessThan(0.5);
      expect(Math.abs((it.h / 100) * boardHeight - el.height)).toBeLessThan(0.5);
    }
    const [title, lede, button] = c.items;
    expect(title).toMatchObject({
      type: 'text',
      style: 'title',
      text: 'Asha Rao',
      from: 'heading',
    });
    expect(lede).toMatchObject({ type: 'text', style: 'body', from: 'subheading' });
    expect(button).toMatchObject({ type: 'button', label: 'See my work', href: '#work' });
    // Font size follows the board width, so it looks the same at any width.
    expect(must(title as { size?: number }).size).toBeCloseTo((84 / measured.width) * 100, 2);
    expect(sectionSchema.safeParse(section).success).toBe(true);
    expect(projectSchema.safeParse(withFree(section)).success).toBe(true);
  });

  it('pulls slightly-outside measurements back inside the tolerance', () => {
    const { section } = flowToFree(sampleHero(), {
      width: 1000,
      height: 500,
      elements: [{ from: 'heading', x: -200, y: 480, width: 1400, height: 100, fontSize: 40 }],
    });
    const [it] = canvasOf(section).items;
    expect(must(it).x).toBeGreaterThanOrEqual(-FREE_TOLERANCE);
    expect(must(it).x + must(it).w).toBeLessThanOrEqual(100 + FREE_TOLERANCE);
    expect(must(it).y + must(it).h).toBeLessThanOrEqual(100 + FREE_TOLERANCE);
  });

  it('refuses impossible measurements', () => {
    for (const width of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => flowToFree(sampleHero(), { width, height: 100, elements: [] })).toThrow();
    }
  });

  it('takes pictures with their description and keeps only a whole-section animation', () => {
    const work: Section = {
      ...must(must(clone().pages[0]).sections[1]),
      animation: { section: { preset: 'fade' }, cards: { preset: 'glow' } },
    };
    const { section } = flowToFree(work, {
      width: 1000,
      height: 800,
      elements: [{ from: 'items.0.image', x: 0, y: 100, width: 300, height: 200 }],
    });
    expect(canvasOf(section).items[0]).toMatchObject({
      type: 'image',
      image: 'img1',
      imageAlt: 'A river map',
    });
    expect(section.animation).toEqual({ section: { preset: 'fade' } });
  });

  it('returns to the optimized layout, writing edits back and dropping positions', () => {
    const { section } = flowToFree(must(must(clone().pages[0]).sections[0]), measured);
    const c = canvasOf(section);
    (c.items[0] as { text: string }).text = 'Asha Rao, illustrator';
    (c.items[2] as { label: string }).label = 'Look around';
    c.items.push(item({ id: 'extra', text: 'Added on the canvas' }) as never);
    const back = freeToFlow(section);
    expect(back.section.layout).toBeUndefined();
    expect(back.section.canvas).toBeUndefined();
    expect(back.dropped).toEqual(['extra']);
    expect(back.section.props).toMatchObject({
      heading: 'Asha Rao, illustrator',
      subheading: 'I draw maps, books & brands.',
      buttons: [{ label: 'Look around', href: '#work' }],
    });
    expect(sectionSchema.safeParse(back.section).success).toBe(true);
  });

  it('round-trips flow -> free -> flow unchanged when nothing was edited', () => {
    const hero = must(must(clone().pages[0]).sections[0]);
    const back = freeToFlow(flowToFree(hero, measured).section);
    expect(back.section).toEqual(hero);
    expect(back.dropped).toEqual([]);
  });

  it('drops a written-back value the block cannot hold instead of breaking the section', () => {
    const { section } = flowToFree(must(must(clone().pages[0]).sections[0]), measured);
    (canvasOf(section).items[0] as { text: string }).text = 'x'.repeat(4000); // heading max 200
    const back = freeToFlow(section);
    expect(back.dropped).toEqual([canvasOf(section).items[0]?.id]);
    expect(back.section.props).toMatchObject({ heading: 'Asha Rao' });
  });
});

describe('free export', () => {
  const html = (p: Project) => fileText(exportOf(p), 'index.html');

  it('writes real semantic elements in reading order', () => {
    const out = sectionHtml(html(withFree()), 'free1');
    expect(out).toContain('class="block block-hero block-free bg-plain"');
    const order = [...out.matchAll(/data-free="([a-z]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['t', 'p', 'i', 'b']);
    expect(out).toMatch(/<h1 [^>]*data-free="t"[^>]*>Big title<\/h1>/);
    expect(out).toMatch(/<div [^>]*data-free="p"[^>]*><p>Para one<\/p><p>Para two<\/p><\/div>/);
    expect(out).toMatch(/<img [^>]*src="assets\/img1\.webp" alt="A river map"/);
    expect(out).toMatch(/<a class="button free-item[^"]*" [^>]*href="#work"[^>]*>Go<\/a>/);
    expect(balanced(out)).toBe(true);
  });

  it('keeps one h1 per page and makes later titles h2', () => {
    const s = freeHero();
    canvasOf(s).items.push(
      item({ id: 'u', style: 'title', text: 'Second', y: 80 }) as never,
      item({ id: 'v', style: 'subtitle', text: 'Small', y: 85 }) as never,
    );
    const page = html(withFree(s));
    expect(page.match(/<h1\b/g)).toHaveLength(1);
    expect(page).toMatch(/<h2 [^>]*data-free="u"/);
    expect(page).toMatch(/<h2 [^>]*data-free="v"/);
    // Not the first section: its title is an h2, its subtitles h3.
    const p = clone();
    must(p.pages[0]).sections.splice(1, 0, s);
    const second = sectionHtml(html(p), 'free1');
    expect(second).toMatch(/<h2 [^>]*data-free="t"/);
    expect(second).toMatch(/<h3 [^>]*data-free="v"/);
  });

  it('builds styles only from validated numbers', () => {
    const out = sectionHtml(html(withFree()), 'free1');
    const styles = [...out.matchAll(/style="([^"]*)"/g)].map((m) => must(m[1]));
    expect(styles.length).toBe(5); // board + 4 items
    for (const style of styles) expect(style).toMatch(/^(--[a-z]+:-?\d+(\.\d+)?;)+$/);
  });

  it('escapes text, alt and labels', () => {
    const s = freeHero();
    const items = canvasOf(s).items as unknown as Record<string, unknown>[];
    must(items[1]).text = '</h1><script>alert(1)</script>';
    must(items[3]).imageAlt = '" onerror="alert(1)';
    must(items[0]).label = '<img src=x onerror=alert(1)>';
    const out = sectionHtml(html(withFree(s)), 'free1');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img src=x');
    expect(out).not.toContain('" onerror="');
    expect(out).toContain('&lt;/h1&gt;&lt;script&gt;');
    expect(balanced(out)).toBe(true);
  });

  it('plays YouTube and Vimeo through the click-to-load facade', () => {
    const s = freeHero();
    canvasOf(s).items.push({
      id: 'v',
      type: 'video',
      embedUrl: 'https://youtu.be/dQw4w9WgXcQ',
      x: 0,
      y: 90,
      w: 40,
      h: 10,
      z: 0,
    });
    const out = sectionHtml(html(withFree(s)), 'free1');
    expect(out).toContain('class="video-facade"');
    expect(out).not.toContain('<iframe');
    expect(balanced(out)).toBe(true);
  });

  it('links css/free.css only on pages with a free section', () => {
    const files = exportOf(withFree());
    expect(fileText(files, FREE_CSS_PATH)).toBe(FREE_CSS);
    expect(fileText(files, 'index.html')).toContain(
      `<link rel="stylesheet" href="${FREE_CSS_PATH}">`,
    );
    expect(fileText(files, 'about.html')).not.toContain(FREE_CSS_PATH);
    const plain = exportOf(clone());
    expect(plain.some((f) => f.path === FREE_CSS_PATH)).toBe(false);
    expect(fileText(plain, 'index.html')).not.toContain('free');
  });

  it('stacks in reading order on small phones unless phone boxes are set', () => {
    const out = sectionHtml(html(withFree()), 'free1');
    expect(out).toContain('class="free-board free-stack"');
    // The phone rule turns the board into a column; DOM order is the reading order.
    expect(FREE_CSS).toMatch(
      /@media \(max-width:37\.49rem\)\{[^@]*\.free-stack\{[^}]*flex-direction:column/,
    );
    expect(FREE_CSS).toMatch(/\.free-stack>\.free-item\{[^}]*position:static/);
    const s = freeHero();
    const c = canvasOf(s);
    c.phoneAspect = 0.6;
    for (const it of c.items) it.phone = { x: 5, y: it.y, w: 90, h: 5 };
    const phoned = sectionHtml(html(withFree(s)), 'free1');
    expect(phoned).toContain('class="free-board free-phone"');
    expect(phoned).toMatch(/--px:5;--py:10;--pw:90;--ph:5;/);
    expect(FREE_CSS).toMatch(/\.free-phone>\.free-item\{[^}]*left:calc\(var\(--px\)\*1%\)/);
  });

  it('marks items for the editor only in the preview', () => {
    const page = (opts: Parameters<typeof renderSite>[1]) =>
      String(must(renderSite(withFree(), opts)[0]).content);
    const preview = page({ editable: true, preview: true });
    expect(preview).toContain('data-k-item="t"');
    expect(preview).toContain('data-k-asset="img1"');
    expect(page({})).not.toContain('data-k-item');
  });

  it('counts free pictures as used and removes them with the file', () => {
    const p = withFree();
    // The sample uses img1 in its projects section too; drop that use first.
    must(p.pages[0]).sections.splice(1, 1);
    expect(assetUsage(p).get('img1')).toBe(1);
    const exported = exportOf(p);
    expect(exported.some((f) => f.path === 'assets/img1.webp')).toBe(true);
    const removed = removeAsset(p, 'img1');
    const c = canvasOf(must(must(removed.pages[0]).sections[0]));
    expect(c.items.map((i) => i.id)).toEqual(['b', 't', 'p']);
    expect(projectSchema.safeParse(removed).success).toBe(true);
  });
});

describe('versions, round trips and the key guard', () => {
  it('upgrades version 4 files without changing them', () => {
    expect(SCHEMA_VERSION).toBe(10);
    expect(typeof MIGRATIONS[4]).toBe('function');
    const v4 = { ...clone(), schemaVersion: 4 };
    const upgraded = migrateProject(v4);
    expect(upgraded).toEqual({ ...clone(), schemaVersion: SCHEMA_VERSION });
  });

  it('round-trips an existing project and a free project through the project file', () => {
    for (const p of [clone(), withFree()]) {
      expect(parseProjectFile(serializeProject(p))).toEqual(p);
    }
  });

  it('refuses keys and tokens hidden in free items', () => {
    const s = freeHero();
    (canvasOf(s).items[1] as { text: string }).text = `key AIza${'a'.repeat(35)}`;
    expect(() => serializeProject(withFree(s))).toThrow(/key or token/);
    const file = JSON.stringify(withFree(s));
    expect(() => parseProjectFile(file)).toThrow(/key or token/);
    const named = JSON.parse(JSON.stringify(withFree())) as Record<string, unknown>;
    const c = (named as unknown as Project).pages[0]?.sections[0]?.canvas as unknown as Record<
      string,
      unknown
    >;
    c.apiKey = 'x';
    expect(() => parseProjectFile(JSON.stringify(named))).toThrow(/key or token/);
  });
});
