import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ANIMATION_PRESETS,
  ANIM_JS,
  addPage,
  blankProject,
  canvasAspect,
  renderSite,
  type Project,
  type Section,
} from '@klinth/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PRESET_HELP, PRESET_LABELS, TARGET_LABELS } from '../state/animation.ts';
import { useEditor } from '../state/store.ts';
import { AnimationPanel } from './AnimationPanel.tsx';

const state = () => useEditor.getState();

/** Blank start, a second page with an About section and a Blank canvas, second page open. */
function secondPage(): Project {
  const { project } = addPage(blankProject(), 'Second page');
  const page = project.pages[1];
  if (!page) throw new Error('no second page');
  page.sections = [
    { id: 'about', type: 'about', props: { heading: 'About us' } },
    {
      id: 'board',
      type: 'canvas',
      layout: 'free',
      canvas: { aspect: canvasAspect({}), items: [] },
      props: {},
    },
  ] as Section[];
  return project;
}

const section = (id: string): Section => {
  const found = state().project?.pages[1]?.sections.find((s) => s.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
};

beforeEach(() => {
  act(() => {
    state().open('p2', secondPage(), 1);
    state().setPage(1);
  });
});

describe('new animation presets in the editor (second page from Blank)', () => {
  it('has plain words and a live sample for every preset', () => {
    expect(TARGET_LABELS.background).toBe('Background');
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    for (const preset of ANIMATION_PRESETS) {
      expect(PRESET_LABELS[preset]).toMatch(/^[A-Z][a-z]/);
      expect(PRESET_HELP[preset]).toMatch(/\.$/);
      expect(css, preset).toContain(`[data-preset='${preset}']`);
    }
  });

  it('sets a moving gradient with a speed but no wait or repeat', () => {
    const { rerender } = render(<AnimationPanel section={section('about')} />);
    const panel = screen.getByRole('region', { name: 'Animation' });
    const part = within(panel).getByLabelText('What moves');
    expect(
      within(part)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Whole section', 'Background', 'Heading', 'Pictures']);
    fireEvent.change(part, { target: { value: 'background' } });
    rerender(<AnimationPanel section={section('about')} />);
    const presets = within(panel).getByRole('radiogroup', { name: 'Animation' });
    fireEvent.click(within(presets).getByLabelText(/Moving gradient/));
    rerender(<AnimationPanel section={section('about')} />);
    fireEvent.click(within(panel).getByLabelText('Fast'));
    expect(section('about').animation).toEqual({
      background: { preset: 'gradient', speed: 'fast' },
    });
    expect(within(panel).queryByLabelText(/Wait before it starts/)).toBeNull();
  });

  it('offers section transitions with timing, and only whole-section parts on a canvas', () => {
    const { rerender, unmount } = render(<AnimationPanel section={section('about')} />);
    const panel = screen.getByRole('region', { name: 'Animation' });
    const presets = within(panel).getByRole('radiogroup', { name: 'Animation' });
    fireEvent.click(within(presets).getByLabelText(/Rise into place/));
    rerender(<AnimationPanel section={section('about')} />);
    fireEvent.click(within(panel).getByLabelText('Every time it comes into view'));
    expect(section('about').animation).toEqual({ section: { preset: 'rise', repeat: 'always' } });
    unmount();

    render(<AnimationPanel section={section('board')} />);
    const canvasPanel = screen.getByRole('region', { name: 'Animation' });
    const part = within(canvasPanel).getByLabelText('What moves');
    expect(
      within(part)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Whole section', 'Background']);
    fireEvent.change(part, { target: { value: 'background' } });
    fireEvent.click(within(canvasPanel).getByLabelText(/Parallax background/));
    expect(section('board').animation).toEqual({ background: { preset: 'parallax' } });
  });
});

describe('background parallax in the exported script', () => {
  function run(reduce: boolean) {
    const p = secondPage();
    const about = p.pages[1]?.sections[0] as Section;
    about.animation = { background: { preset: 'parallax' } };
    const page = renderSite(p).find((f) => f.path === 'second-page.html');
    const html = typeof page?.content === 'string' ? page.content : '';
    document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce') ? reduce : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    new Function(ANIM_JS)();
    return document.querySelector<HTMLElement>('[data-anim-background=parallax]');
  }

  it('moves the background layer, never the content', () => {
    const el = run(false);
    expect(el?.classList.contains('k-bpx')).toBe(true);
    expect(el?.style.getPropertyValue('--k-by')).toMatch(/^-?\d+(\.\d)?px$/);
    expect(el?.querySelector('.wrap')?.getAttribute('style') ?? '').not.toContain('--k-by');
  });

  it('does nothing for visitors who asked for less motion', () => {
    const el = run(true);
    expect(el?.classList.contains('k-bpx')).toBe(false);
    expect(el?.style.getPropertyValue('--k-by')).toBe('');
  });
});
