import { ANIMATION_PRESETS, ANIM_CSS, ANIM_JS, sampleProject, type Project } from '@klinth/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildPreviewDocument } from '../preview/document.ts';
import { BRIDGE_JS, CALM_CSS } from '../preview/bridge.ts';
import { PRESET_LABELS, TARGET_LABELS, setSectionAnimation } from './animation.ts';
import { useEditor } from './store.ts';

/** The value, or a failed test when it is missing. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('missing value');
  return value;
}

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
const state = () => useEditor.getState();
const hero = () => state().project?.pages[0]?.sections[0];

beforeEach(() => {
  state().open('p1', clone(), 1);
});

describe('animation edits', () => {
  it('sets, changes and removes one part, and drops the empty setting', () => {
    expect(
      state().change((p) => setSectionAnimation(p, 0, 'hero', 'heading', { preset: 'words' })),
    ).toBeNull();
    expect(hero()?.animation).toEqual({ heading: { preset: 'words' } });
    state().change((p) =>
      setSectionAnimation(p, 0, 'hero', 'media', { preset: 'parallax', speed: 'slow' }),
    );
    expect(hero()?.animation).toEqual({
      heading: { preset: 'words' },
      media: { preset: 'parallax', speed: 'slow' },
    });
    state().change((p) => setSectionAnimation(p, 0, 'hero', 'heading', null));
    state().change((p) => setSectionAnimation(p, 0, 'hero', 'media', null));
    expect('animation' in must(hero())).toBe(false);
  });

  it('refuses a preset that does not fit, so nothing broken is saved', () => {
    const problem = state().change((p) =>
      setSectionAnimation(p, 0, 'hero', 'heading', { preset: 'parallax' }),
    );
    expect(problem).toMatch(/does not fit/);
    expect(hero()?.animation).toBeUndefined();
  });

  it('counts replays for the Preview animations button', () => {
    const before = state().animationReplay;
    state().replayAnimations();
    expect(state().animationReplay).toBe(before + 1);
  });

  it('has a plain label for every preset and part', () => {
    for (const preset of ANIMATION_PRESETS) expect(PRESET_LABELS[preset]).toMatch(/^[A-Z][a-z]/);
    expect(TARGET_LABELS.media).toBe('Pictures');
  });
});

describe('animations in the preview', () => {
  const animated = () => {
    const p = clone();
    must(must(p.pages[0]).sections[0]).animation = { heading: { preset: 'letters' } };
    return p;
  };

  it('inlines the animation styles and script', () => {
    const doc = buildPreviewDocument(animated(), 0, {
      origin: 'http://localhost',
      interactive: true,
    });
    expect(doc).toContain(ANIM_CSS);
    expect(doc).toContain(ANIM_JS.slice(0, 200));
    expect(doc).not.toContain('css/anim.css');
    expect(doc).not.toContain('js/anim.js');
    expect(doc).toContain('data-k-split');
  });

  it('stays still on calm redraws and in thumbnails', () => {
    const calm = buildPreviewDocument(animated(), 0, {
      origin: 'http://localhost',
      interactive: true,
      calm: true,
    });
    expect(CALM_CSS).toContain('.k-anim');
    expect(calm).toContain(CALM_CSS);
    const thumb = buildPreviewDocument(animated(), 0, { origin: 'x', interactive: false });
    expect(thumb).not.toContain('<script');
  });

  it('keeps the preview script valid (it now flattens split headings for editing)', () => {
    expect(() => new Function(BRIDGE_JS)).not.toThrow();
    expect(BRIDGE_JS).toContain("hasAttribute('data-k-split')");
  });

  it('adds nothing when the page has no animation', () => {
    const doc = buildPreviewDocument(clone(), 0, { origin: 'http://localhost', interactive: true });
    expect(doc).not.toContain('k-anim{');
    expect(doc).not.toContain(ANIM_JS.slice(0, 200));
  });
});
