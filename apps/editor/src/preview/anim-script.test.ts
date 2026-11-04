import { ANIM_JS, renderSite, sampleProject, type Project } from '@klinth/core';
import { describe, expect, it } from 'vitest';

/** The value, or a failed test when it is missing. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('missing value');
  return value;
}

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
const exportOf = (p: Project) => renderSite(p);
const text = (files: ReturnType<typeof renderSite>, path: string): string => {
  const file = files.find((f) => f.path === path);
  if (typeof file?.content !== 'string') throw new Error(`${path} missing`);
  return file.content;
};

/** The sample with animations on the hero (first section) and the projects section. */
function animated(): Project {
  const p = clone();
  const [hero, work] = must(p.pages[0]).sections as unknown as Record<string, unknown>[];
  must(hero).animation = { heading: { preset: 'words' } };
  must(work).animation = {
    section: { preset: 'slideUp', repeat: 'always' },
    media: { preset: 'maskWipe' },
  };
  return p;
}

/** Runs the exported script against `html` in this jsdom window. */
function runScript(html: string, opts: { reduce: boolean; io: boolean }) {
  document.body.innerHTML = html;
  const observed: Element[] = [];
  let callback: ((entries: { target: Element; isIntersecting: boolean }[]) => void) | null = null;
  window.matchMedia = ((query: string) => ({
    matches: query.includes('reduce') ? opts.reduce : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  const w = window as unknown as Record<string, unknown>;
  if (opts.io) {
    w.IntersectionObserver = class {
      constructor(cb: typeof callback) {
        callback = cb;
      }
      observe(el: Element) {
        observed.push(el);
      }
      unobserve() {}
      disconnect() {}
    };
  } else delete w.IntersectionObserver;
  new Function(ANIM_JS)();
  return {
    observed,
    enter: (el: Element, isIntersecting = true) => callback?.([{ target: el, isIntersecting }]),
  };
}

describe('the animation script', () => {
  const page = () => {
    const home = text(exportOf(animated()), 'index.html');
    return home.slice(home.indexOf('<main'), home.indexOf('</main>') + 7);
  };

  it('does nothing for visitors who asked for less motion: everything stays shown', () => {
    const run = runScript(page(), { reduce: true, io: true });
    expect(run.observed).toHaveLength(0);
    expect(document.querySelector('[class*="k-wait-"]')).toBeNull();
    expect(document.querySelector('[data-k-clone]')).toBeNull();
  });

  it('does nothing without IntersectionObserver', () => {
    runScript(page(), { reduce: false, io: false });
    expect(document.querySelector('[class*="k-wait-"]')).toBeNull();
  });

  it('hides later sections until they scroll in, and replays the ones set to every time', () => {
    const run = runScript(page(), { reduce: false, io: true });
    const work = must(document.getElementById('work'));
    expect(work.className).toContain('k-wait-section');
    expect(work.className).toContain('k-wait-media');
    run.enter(work);
    expect(work.className).toContain('k-in-section');
    expect(work.className).toContain('k-in-media');
    expect(work.className).not.toContain('k-wait');
    run.enter(work, false);
    // "Every time": the section hides again, the pictures (once) stay.
    expect(work.className).toContain('k-wait-section');
    expect(work.className).toContain('k-in-media');
    // The first section is never hidden.
    expect(must(document.getElementById('hero')).className).not.toContain('k-wait');
  });
});
