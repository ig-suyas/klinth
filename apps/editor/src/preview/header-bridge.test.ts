/**
 * The header toolbar ("×" Remove header) in the preview script: a single click
 * only selects the header, a double-click shows the toolbar, and clicking
 * elsewhere, Esc or selecting something else hides it. Fresh jsdom per test.
 */
import { renderSite, type Project } from '@klinth/core';
import { getTemplate } from '@klinth/templates';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { BRIDGE_JS } from './bridge.ts';

type Message = Record<string, unknown> & { type: string };

const portfolio = (): Project => {
  const template = getTemplate('portfolio');
  if (!template) throw new Error('missing template');
  return template.create();
};

function mount(selected: string | null = null) {
  const project = portfolio();
  const files = renderSite(project, { editable: true, preview: true });
  const page = files.find((f) => f.path === 'index.html')?.content;
  if (typeof page !== 'string') throw new Error('no page');
  const dom = new JSDOM(page, { runScripts: 'outside-only', url: 'https://preview.test/' });
  const w = dom.window;
  const sent: Message[] = [];
  w.postMessage = ((m: Message) => void sent.push(m)) as typeof w.postMessage;
  w.Element.prototype.scrollIntoView = () => {};
  const sections = project.pages[0]?.sections ?? [];
  const cfg = {
    origin: 'https://editor.test',
    scrollY: 0,
    selected,
    page: '',
    scrollTo: null,
    freeable: [],
    free: [],
    item: null,
  };
  w.eval(`window.__klinth=${JSON.stringify(cfg)};`);
  w.eval(BRIDGE_JS);
  const doc = w.document;
  const header = doc.querySelector('[data-k-header]') as HTMLElement;
  const bar = header.querySelector('.bar') as HTMLElement;
  const section = doc.querySelector('[data-k-section]') as HTMLElement;
  const toolbar = () => doc.querySelector('.k-toolbar') as HTMLElement | null;
  const shown = () => {
    const t = toolbar();
    return t !== null && !t.hidden;
  };
  const opts = { bubbles: true, cancelable: true, view: w };
  const click = (el: Element, detail = 1) =>
    el.dispatchEvent(new w.MouseEvent('click', { ...opts, detail }));
  const dblclick = (el: Element) => {
    click(el, 1);
    click(el, 2);
    el.dispatchEvent(new w.MouseEvent('dblclick', { ...opts, detail: 2 }));
  };
  const key = (el: Element, k: string) =>
    el.dispatchEvent(new w.KeyboardEvent('keydown', { ...opts, key: k }));
  const fromEditor = (data: Record<string, unknown>) =>
    w.dispatchEvent(
      new w.MessageEvent('message', {
        data: { source: 'klinth-editor', ...data },
        source: w.top as unknown as Window,
      }),
    );
  const of = (type: string) => sent.filter((m) => m.type === type);
  return {
    w,
    doc,
    header,
    bar,
    section,
    toolbar,
    shown,
    click,
    dblclick,
    key,
    fromEditor,
    of,
    sections,
  };
}

describe('header toolbar', () => {
  it('a single click only selects the header, with no toolbar', () => {
    const t = mount();
    t.click(t.bar);
    expect(t.header.classList.contains('k-selected')).toBe(true);
    expect(t.of('header')).toHaveLength(1);
    expect(t.shown()).toBe(false);
  });

  it('a double-click shows the toolbar with the remove button', () => {
    const t = mount();
    t.dblclick(t.bar);
    expect(t.shown()).toBe(true);
    const remove = t.toolbar()?.querySelector('button.k-remove') as HTMLButtonElement;
    expect(remove.getAttribute('aria-label')).toBe('Remove header');
    remove.click();
    expect(t.of('removeHeader')).toHaveLength(1);
  });

  it('clicking anywhere else hides it', () => {
    const t = mount();
    t.dblclick(t.bar);
    t.click(t.section);
    expect(t.shown()).toBe(false);
    expect(t.header.classList.contains('k-selected')).toBe(false);
  });

  it('a click on the header again (single) hides the toolbar but keeps it selected', () => {
    const t = mount();
    t.dblclick(t.bar);
    t.click(t.bar);
    expect(t.shown()).toBe(false);
    expect(t.header.classList.contains('k-selected')).toBe(true);
  });

  it('Esc hides it and gives focus back to the header', () => {
    const t = mount();
    t.dblclick(t.bar);
    const remove = t.toolbar()?.querySelector('button') as HTMLButtonElement;
    remove.focus();
    t.key(remove, 'Escape');
    expect(t.shown()).toBe(false);
    expect(t.doc.activeElement).toBe(t.header);
  });

  it('selecting another element from the editor hides it', () => {
    const t = mount();
    t.dblclick(t.bar);
    t.fromEditor({ type: 'select', id: t.section.getAttribute('data-k-section') });
    expect(t.shown()).toBe(false);
  });

  it('can be reached with the keyboard: Tab to the header, Enter opens the toolbar', () => {
    const t = mount();
    expect(t.header.tabIndex).toBe(0);
    t.header.focus();
    t.key(t.header, 'Enter');
    expect(t.shown()).toBe(true);
    expect(t.doc.activeElement?.classList.contains('k-remove')).toBe(true);
    expect(t.of('header')).toHaveLength(1);
  });

  it('Enter on a header link does not open the toolbar', () => {
    const t = mount();
    const link = t.header.querySelector('.nav a') as HTMLElement | null;
    if (!link) return;
    t.key(link, 'Enter');
    expect(t.shown()).toBe(false);
  });

  it('a header selected from the editor shows no toolbar until asked', () => {
    const t = mount('#header');
    expect(t.header.classList.contains('k-selected')).toBe(true);
    expect(t.shown()).toBe(false);
  });
});

describe('header toolbar, leaving the frame', () => {
  it('a click in the editor around the preview (frame loses focus) hides it', () => {
    const t = mount();
    t.dblclick(t.bar);
    t.w.dispatchEvent(new t.w.FocusEvent('blur'));
    expect(t.shown()).toBe(false);
  });
});
