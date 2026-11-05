/**
 * The preview script's free layout gestures, run in a fresh jsdom window per
 * test (jsdom has no layout, so sizes are stubbed).
 */
import { FREE_CSS, freeCanvas, renderSite, type Project } from '@klinth/core';
import { getTemplate } from '@klinth/templates';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { convertToFree } from '../state/free.ts';
import { BRIDGE_JS } from './bridge.ts';

type Message = Record<string, unknown> & { type: string };

const portfolio = (): Project => {
  const template = getTemplate('portfolio');
  if (!template) throw new Error('missing template');
  return template.create();
};
const heroId = (p: Project) => p.pages[0]?.sections[0]?.id ?? '';

function freeProject(): Project {
  const p = portfolio();
  const result = convertToFree(p, 0, heroId(p), {
    width: 1000,
    height: 500,
    elements: [
      { from: 'heading', x: 0, y: 40, width: 700, height: 160, fontSize: 80 },
      { from: 'subheading', x: 0, y: 220, width: 560, height: 60, fontSize: 21 },
    ],
  });
  if ('problem' in result) throw new Error(result.problem);
  return result.project as Project;
}

function mount(project: Project, extra: Record<string, unknown> = {}) {
  const files = renderSite(project, { editable: true, preview: true });
  const page = files.find((f) => f.path === 'index.html')?.content;
  if (typeof page !== 'string') throw new Error('no page');
  const html = page.replace('</head>', `<style>${FREE_CSS}</style></head>`);
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://preview.test/' });
  const w = dom.window;
  const sent: Message[] = [];
  let now = 1_000_000;
  w.Date.now = () => now;
  w.postMessage = ((m: Message) => void sent.push(m)) as typeof w.postMessage;
  w.Element.prototype.getBoundingClientRect = function (this: Element) {
    const big = this.classList.contains('free-board') || this.classList.contains('wrap');
    const width = big ? 1000 : 200;
    const height = big ? 500 : 40;
    return { left: 0, top: 0, x: 0, y: 0, width, height, right: width, bottom: height } as DOMRect;
  };
  const sections = project.pages[0]?.sections ?? [];
  const cfg = {
    origin: 'https://editor.test',
    scrollY: 0,
    selected: null,
    page: '',
    scrollTo: null,
    freeable: sections.filter((s) => s.type !== 'footer' && !s.layout).map((s) => s.id),
    free: sections.filter((s) => s.layout === 'free').map((s) => s.id),
    item: null,
    ...extra,
  };
  w.eval(`window.__klinth=${JSON.stringify(cfg)};`);
  w.eval(BRIDGE_JS);
  const at = (x: number, y: number) => ({
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerId: 1,
    button: 0,
    isPrimary: true,
  });
  return {
    w,
    sent,
    of: (type: string) => sent.filter((m) => m.type === type),
    tick: (ms: number) => {
      now += ms;
    },
    down: (el: Element, x = 10, y = 10) =>
      el.dispatchEvent(new w.PointerEvent('pointerdown', at(x, y))),
    move: (el: Element, x: number, y: number) =>
      el.dispatchEvent(new w.PointerEvent('pointermove', at(x, y))),
    up: (el: Element, x: number, y: number) => {
      el.dispatchEvent(new w.PointerEvent('pointerup', at(x, y)));
      el.dispatchEvent(new w.MouseEvent('click', at(x, y)));
    },
    key: (key: string, opts: KeyboardEventInit = {}) =>
      w.document.dispatchEvent(
        new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }),
      ),
    fromEditor: (data: Record<string, unknown>) =>
      w.dispatchEvent(
        new w.MessageEvent('message', { data: { source: 'klinth-editor', ...data }, source: w }),
      ),
  };
}

const must = <T>(v: T | null | undefined): T => {
  if (v === null || v === undefined) throw new Error('missing');
  return v;
};

describe('moving an element out of the optimized layout', () => {
  it('asks only after a double-click and a drag past about 8 px', () => {
    const p = portfolio();
    const t = mount(p);
    const h1 = must(t.w.document.querySelector('h1'));
    t.down(h1);
    t.up(h1, 10, 10);
    t.down(h1);
    t.move(h1, 15, 13);
    expect(t.of('freeIntent')).toHaveLength(0);
    t.move(h1, 22, 14);
    const [intent] = t.of('freeIntent');
    expect(intent).toMatchObject({ id: heroId(p), from: 'heading', dx: 12, dy: 4 });
    const measure = intent?.measure as { width: number; elements: { from: string }[] };
    expect(measure.width).toBe(1000);
    expect(measure.elements.map((e) => e.from)).toEqual(
      expect.arrayContaining(['heading', 'subheading', 'buttons.0', 'buttons.1', 'eyebrow']),
    );
    // The element follows the pointer while the question is open.
    expect(h1.getAttribute('style') ?? '').toContain('--k-drag');
    t.move(h1, 60, 40);
    t.up(h1, 60, 40);
    expect(t.of('freeDrop')).toEqual([expect.objectContaining({ dx: 50, dy: 30 })]);
    expect(t.of('freeIntent')).toHaveLength(1);
  });

  it('never asks on plain clicks, text selection or small drags', () => {
    const t = mount(portfolio());
    const h1 = must(t.w.document.querySelector('h1'));
    // One click, then a long drag (selecting text).
    t.down(h1);
    t.move(h1, 200, 60);
    t.up(h1, 200, 60);
    t.tick(1000);
    // Two slow clicks are not a double-click.
    t.down(h1);
    t.up(h1, 10, 10);
    t.tick(700);
    t.down(h1);
    t.move(h1, 200, 60);
    t.up(h1, 200, 60);
    t.tick(1000);
    // A double-click with a tiny wobble.
    t.down(h1);
    t.up(h1, 10, 10);
    t.down(h1);
    t.move(h1, 14, 15);
    t.up(h1, 14, 15);
    expect(t.of('freeIntent')).toHaveLength(0);
  });

  it('No puts the element back where it was', () => {
    const t = mount(portfolio());
    const h1 = must(t.w.document.querySelector('h1'));
    t.down(h1);
    t.up(h1, 10, 10);
    t.down(h1);
    t.move(h1, 40, 40);
    t.up(h1, 40, 40);
    t.fromEditor({ type: 'freeDecision', accept: false });
    expect(h1.getAttribute('style') ?? '').not.toContain('--k-drag');
    expect(h1.classList.contains('k-pending')).toBe(false);
    expect(h1.classList.contains('k-move')).toBe(false);
  });
});

describe('inside a free section', () => {
  it('selects, moves and resizes items without asking again', () => {
    const p = freeProject();
    const t = mount(p, { selected: heroId(p) });
    const title = must(t.w.document.querySelector('[data-k-item]'));
    t.down(title, 100, 100);
    t.up(title, 100, 100);
    expect(t.of('freeSelect').at(-1)).toMatchObject({ id: heroId(p), item: 'i1' });

    // Move by 100 px right on a 1000 px board: 10%.
    t.down(title, 100, 100);
    t.move(title, 150, 100);
    t.move(title, 200, 100);
    t.up(title, 200, 100);
    expect(t.of('freeChange').at(-1)).toMatchObject({
      id: heroId(p),
      item: 'i1',
      // Text gets 2% room when it turns free: 70% wide becomes 71.4%.
      box: { x: 10, y: 8, w: 71.4, h: 32 },
    });

    // Resize handle: wider, no question.
    const handle = must(t.w.document.querySelector('.k-handle[data-h="e"]'));
    t.down(handle, 800, 120);
    t.move(handle, 850, 120);
    t.up(handle, 850, 120);
    expect(t.of('freeChange').at(-1)).toMatchObject({ box: { x: 10, w: 76.4 } });
    expect(t.of('freeIntent')).toHaveLength(0);
  });

  it('nudges with the arrow keys and stops at the artboard edge', () => {
    const p = freeProject();
    const canvas = must(freeCanvas(must(p.pages[0]?.sections[0])));
    const t = mount(p, { selected: heroId(p), item: canvas.items[1]?.id });
    t.key('ArrowRight');
    expect(t.of('freeChange').at(-1)).toMatchObject({ item: 'i2', box: { x: 0.5 }, nudge: true });
    t.key('ArrowDown', { shiftKey: true });
    expect(t.of('freeChange').at(-1)).toMatchObject({ box: { y: 49 } });
    for (let i = 0; i < 40; i += 1) t.key('ArrowLeft', { shiftKey: true });
    expect(t.of('freeChange').at(-1)).toMatchObject({ box: { x: 0 } });
    for (let i = 0; i < 40; i += 1) t.key('ArrowRight', { shiftKey: true });
    expect(t.of('freeChange').at(-1)).toMatchObject({ box: { x: 42.88 } });
  });

  it('scales text and its font size together from a corner handle', () => {
    const p = freeProject();
    const t = mount(p, { selected: heroId(p), item: 'i1' });
    const frame = must(t.w.document.querySelector('.k-frame'));
    // Text height is automatic: no top or bottom handles.
    expect(frame.classList.contains('k-text')).toBe(true);
    expect([...frame.querySelectorAll('.k-handle')].map((h) => h.getAttribute('data-h'))).toEqual([
      'nw',
      'ne',
      'e',
      'se',
      'sw',
      'w',
    ]);
    const se = must(t.w.document.querySelector('.k-handle[data-h="se"]'));
    t.down(se, 700, 200);
    t.move(se, 735, 200);
    t.move(se, 770, 200);
    t.up(se, 770, 200);
    const change = t.of('freeChange').at(-1);
    // 71.4% wide plus 7%: everything grows by 78.4 / 71.4, the 8 cqw text too.
    const k = 78.4 / 71.4;
    expect(change).toMatchObject({ item: 'i1', box: { x: 0, y: 8 } });
    const box = change?.box as { w: number };
    expect(box.w).toBeCloseTo(78.4, 2);
    expect(change?.size).toBeCloseTo(8 * k, 2);
    // The height sent is the text's own measured height (40 px on a 500 px board here).
    expect(change).toMatchObject({ box: { h: 8 } });
  });

  it('changes only the width from a side handle, never below the longest word', () => {
    const p = freeProject();
    const t = mount(p, { selected: heroId(p), item: 'i1' });
    const e = must(t.w.document.querySelector('.k-handle[data-h="e"]'));
    t.down(e, 700, 120);
    t.move(e, 650, 120);
    t.up(e, 650, 120);
    const change = t.of('freeChange').at(-1);
    expect(change).toMatchObject({ box: { x: 0, w: 66.4 } });
    expect(change?.size).toBeUndefined();
    // The longest word is 200 px wide here (every element measures 200 px in this test).
    const again = must(t.w.document.querySelector('.k-handle[data-h="e"]'));
    t.down(again, 650, 120);
    t.move(again, 0, 120);
    t.up(again, 0, 120);
    expect(t.of('freeChange').at(-1)).toMatchObject({ box: { w: 20 } });
  });

  it('reports the real height of text so the editor keeps it and grows the board', async () => {
    const p = freeProject();
    const t = mount(p);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const [measured] = t.of('freeMeasure');
    expect(measured).toMatchObject({ id: heroId(p) });
    expect(measured?.items).toEqual(
      expect.arrayContaining([
        { item: 'i1', h: 8 },
        { item: 'i2', h: 8 },
      ]),
    );
  });

  it('highlights the items a warning is about', () => {
    const p = freeProject();
    const t = mount(p, { selected: heroId(p) });
    t.fromEditor({ type: 'freeHint', items: ['i1', 'i2'] });
    const hinted = [...t.w.document.querySelectorAll('.k-hint')].map((el) =>
      el.getAttribute('data-k-item'),
    );
    expect(hinted).toEqual(['i1', 'i2']);
  });

  it('sends undo and redo to the editor', () => {
    const t = mount(freeProject());
    t.key('z', { ctrlKey: true });
    t.key('z', { ctrlKey: true, shiftKey: true });
    t.key('y', { metaKey: true });
    expect(t.of('history').map((m) => m.action)).toEqual(['undo', 'redo', 'redo']);
  });
});
