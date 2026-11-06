/**
 * The preview script swaps one section in place (no reload): only checked
 * messages from the editor, only a section with the same id, the selection
 * kept, animations wired again, and never the text being edited. Fresh jsdom per test.
 */
import type { Project } from '@klinth/core';
import { getTemplate } from '@klinth/templates';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { BRIDGE_JS } from './bridge.ts';
import { buildPreviewDocument } from './document.ts';
import { planUpdate, splitPreview } from './patch.ts';

type Message = Record<string, unknown> & { type: string };

const portfolio = (): Project => {
  const template = getTemplate('portfolio');
  if (!template) throw new Error('missing template');
  return template.create();
};
const docOf = (p: Project) =>
  buildPreviewDocument(p, 0, { origin: 'https://editor.test', interactive: true, calm: true });

function mount(project: Project, selected: string | null = null) {
  // The page without its inline scripts; the bridge runs on its own below.
  const html = docOf(project).replace(/<script>[\s\S]*?<\/script>\n?/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://preview.test/' });
  const w = dom.window;
  const sent: Message[] = [];
  w.postMessage = ((m: Message) => void sent.push(m)) as typeof w.postMessage;
  w.Element.prototype.scrollIntoView = () => {};
  // jsdom has no innerText; the text content is enough here.
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
    get(this: HTMLElement) {
      return this.textContent ?? '';
    },
  });
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
  const fromEditor = (data: Record<string, unknown>, source: unknown = w.top) =>
    w.dispatchEvent(
      new w.MessageEvent('message', {
        data: { source: 'klinth-editor', ...data },
        source: source as Window,
      }),
    );
  return { w, doc: w.document, sent, fromEditor };
}

/** The patch the editor would send for `edit` applied to the portfolio. */
function patchFor(edit: (p: Project) => void) {
  const before = portfolio();
  const after = structuredClone(before);
  edit(after);
  const plan = planUpdate(splitPreview(docOf(before)), splitPreview(docOf(after)));
  if (plan.kind !== 'patch') throw new Error('expected a patch');
  return { before, plan };
}
const setHeading = (i: number, text: string) => (p: Project) => {
  ((p.pages[0]?.sections[i]?.props ?? {}) as Record<string, unknown>).heading = text;
};

describe('patching one section in the preview', () => {
  it('replaces only that section and keeps the others and the selection', () => {
    const { before, plan } = patchFor(setHeading(1, 'Swapped in place'));
    const id = before.pages[0]?.sections[1]?.id ?? '';
    const first = before.pages[0]?.sections[0]?.id ?? '';
    const { doc, fromEditor } = mount(before, id);
    const keep = doc.querySelector(`[data-section-id="${first}"]`);
    const old = doc.querySelector(`[data-section-id="${id}"]`);
    fromEditor({ type: 'patch', sections: plan.sections, styles: null });
    const now = doc.querySelector(`[data-section-id="${id}"]`);
    expect(now).not.toBe(old);
    expect(now?.textContent).toContain('Swapped in place');
    expect(now?.classList.contains('k-selected')).toBe(true);
    expect(doc.querySelector(`[data-section-id="${first}"]`)).toBe(keep);
  });

  it('puts in new styles in place', () => {
    const { before, plan } = patchFor((p) => {
      p.theme.colors.accent = '#123456';
    });
    const { doc, fromEditor } = mount(before);
    const style = doc.head.querySelector('style');
    fromEditor({ type: 'patch', sections: [], styles: plan.styles });
    expect(doc.head.querySelector('style')).toBe(style);
    expect(doc.head.textContent).toContain('#123456');
  });

  it('wires a replaced animated section again (shown, and replayed every time)', () => {
    const before = portfolio();
    const s = before.pages[0]?.sections[1];
    if (!s) throw new Error('no section');
    s.animation = { section: { preset: 'slideUp', repeat: 'always' } };
    const after = structuredClone(before);
    ((after.pages[0]?.sections[1]?.props ?? {}) as Record<string, unknown>).heading = 'New';
    const plan = planUpdate(splitPreview(docOf(before)), splitPreview(docOf(after)));
    if (plan.kind !== 'patch') throw new Error('expected a patch');
    const { w, doc, fromEditor } = mount(before);
    const observed: Element[] = [];
    (w as unknown as Record<string, unknown>).IntersectionObserver = class {
      observe(el: Element) {
        observed.push(el);
      }
      unobserve() {}
      disconnect() {}
    };
    w.matchMedia = ((q: string) => ({ matches: false, media: q })) as typeof w.matchMedia;
    fromEditor({ type: 'patch', sections: plan.sections, styles: null });
    const now = doc.querySelector(`[data-section-id="${s.id}"]`);
    expect(now?.getAttribute('data-anim-section')).toBe('slideUp');
    expect(now?.classList.contains('k-in-section')).toBe(true);
    expect(observed).toContain(now);
  });

  it('shows site reveal items at once in a replaced section', () => {
    const { before, plan } = patchFor(setHeading(1, 'Shown'));
    const id = before.pages[0]?.sections[1]?.id ?? '';
    const { doc, fromEditor } = mount(before);
    const patched = plan.sections.map((x) => ({
      ...x,
      html: x.html.replace('class="head', 'class="head reveal'),
    }));
    fromEditor({ type: 'patch', sections: patched, styles: null });
    const reveal = doc.querySelector(`[data-section-id="${id}"] .reveal`);
    expect(reveal?.classList.contains('is-visible')).toBe(true);
  });

  it('never replaces the text being edited, and applies it once editing ends', () => {
    const { before, plan } = patchFor(setHeading(1, 'Later'));
    const id = before.pages[0]?.sections[1]?.id ?? '';
    const { w, doc, fromEditor } = mount(before, id);
    const field = doc.querySelector(
      `[data-section-id="${id}"] [data-k-field="heading"]`,
    ) as HTMLElement;
    field.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(field.getAttribute('contenteditable')).toBe('plaintext-only');
    fromEditor({ type: 'patch', sections: plan.sections, styles: null });
    expect(doc.querySelector(`[data-section-id="${id}"] [data-k-field="heading"]`)).toBe(field);
    field.dispatchEvent(new w.KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    expect(doc.querySelector(`[data-section-id="${id}"]`)?.textContent).toContain('Later');
  });

  it('ignores messages that are not from the editor or not well formed, and asks for a redraw', () => {
    const { before, plan } = patchFor(setHeading(1, 'Nope'));
    const id = before.pages[0]?.sections[1]?.id ?? '';
    const { doc, sent, fromEditor } = mount(before);
    const old = doc.querySelector(`[data-section-id="${id}"]`);
    fromEditor({ type: 'patch', sections: plan.sections, styles: null }, null);
    fromEditor({ type: 'patch', sections: 'x', styles: null });
    fromEditor({
      type: 'patch',
      sections: [{ id: 'a"b', html: '<section></section>' }],
      styles: null,
    });
    expect(doc.querySelector(`[data-section-id="${id}"]`)).toBe(old);
    expect(sent.filter((m) => m.type === 'patchFailed')).toHaveLength(0);
    // A section whose id does not match, or two elements: refused, the editor redraws instead.
    fromEditor({
      type: 'patch',
      sections: [{ id, html: '<section data-section-id="other"></section>' }],
      styles: null,
    });
    fromEditor({
      type: 'patch',
      sections: [{ id, html: `${plan.sections[0]?.html ?? ''}<p>extra</p>` }],
      styles: null,
    });
    expect(doc.querySelector(`[data-section-id="${id}"]`)).toBe(old);
    expect(sent.filter((m) => m.type === 'patchFailed')).toHaveLength(2);
  });

  it('reports where the reader is: the section in view and its offset', () => {
    const { before } = patchFor(setHeading(1, 'x'));
    const { w, sent } = mount(before);
    w.dispatchEvent(new w.Event('scroll'));
    return new Promise<void>((done) =>
      setTimeout(() => {
        const scroll = sent.find((m) => m.type === 'scroll');
        expect(scroll).toMatchObject({ y: 0 });
        expect(typeof scroll?.anchor).toBe('string');
        expect(typeof scroll?.offset).toBe('number');
        done();
      }, 250),
    );
  });
});
