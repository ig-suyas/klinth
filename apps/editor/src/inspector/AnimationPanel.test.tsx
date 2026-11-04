import { sampleProject, type Project, type Section } from '@klinth/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from '../state/store.ts';
import { AnimationPanel } from './AnimationPanel.tsx';

/** The value, or a failed test when it is missing. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('missing value');
  return value;
}

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
const state = () => useEditor.getState();
const hero = (): Section => {
  const section = state().project?.pages[0]?.sections[0];
  if (!section) throw new Error('no hero');
  return section;
};

beforeEach(() => {
  act(() => state().open('p1', clone(), 1));
});

describe('animation panel', () => {
  it('picks a part and a preset, then speed, delay and when it plays', () => {
    const { rerender } = render(<AnimationPanel section={hero()} />);
    const panel = screen.getByRole('region', { name: 'Animation' });
    const part = within(panel).getByLabelText('What moves');
    expect(
      within(part)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Whole section', 'Heading', 'Pictures', 'Buttons']);
    fireEvent.change(part, { target: { value: 'heading' } });
    rerender(<AnimationPanel section={hero()} />);
    const presets = within(panel).getByRole('radiogroup', { name: 'Animation' });
    fireEvent.click(within(presets).getByLabelText(/Word by word/));
    expect(hero().animation).toEqual({ heading: { preset: 'words' } });
    rerender(<AnimationPanel section={hero()} />);

    fireEvent.click(within(panel).getByLabelText('Slow'));
    rerender(<AnimationPanel section={hero()} />);
    fireEvent.change(within(panel).getByLabelText(/Wait before it starts/), {
      target: { value: '0.5' },
    });
    rerender(<AnimationPanel section={hero()} />);
    fireEvent.click(within(panel).getByLabelText('Every time it comes into view'));
    expect(hero().animation?.heading).toEqual({
      preset: 'words',
      speed: 'slow',
      delay: 500,
      repeat: 'always',
    });

    // Choosing it plays it in the preview; the button replays everything.
    const before = state().animationReplay;
    fireEvent.click(within(panel).getByRole('button', { name: 'Preview animations' }));
    expect(state().animationReplay).toBe(before + 1);
  });

  it('hides timing for hover effects and removes with None', () => {
    const { rerender } = render(<AnimationPanel section={hero()} />);
    const panel = screen.getByRole('region', { name: 'Animation' });
    fireEvent.change(within(panel).getByLabelText('What moves'), { target: { value: 'buttons' } });
    rerender(<AnimationPanel section={hero()} />);
    fireEvent.click(within(panel).getByLabelText(/Lift on hover/));
    rerender(<AnimationPanel section={hero()} />);
    expect(hero().animation).toEqual({ buttons: { preset: 'lift' } });
    expect(within(panel).queryByLabelText(/Wait before it starts/)).toBeNull();
    expect(within(panel).queryByLabelText('Every time it comes into view')).toBeNull();
    fireEvent.click(within(panel).getByLabelText(/^None/));
    expect(hero().animation).toBeUndefined();
  });

  it('says when a section has nothing to animate', () => {
    const p = clone();
    must(p.pages[0]).sections.unshift({ id: 'gap', type: 'spacer', props: {} });
    act(() => state().open('p1', p, 1));
    render(<AnimationPanel section={must(must(must(state().project).pages[0]).sections[0])} />);
    expect(screen.queryByRole('region', { name: 'Animation' })).toBeNull();
  });
});
