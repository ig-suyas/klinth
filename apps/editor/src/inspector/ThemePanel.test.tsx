import { THEME_PRESETS, blankProject } from '@klinth/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from '../state/store.ts';
import { ThemePanel } from './ThemePanel.tsx';

const project = () => useEditor.getState().project;

beforeEach(() => {
  act(() => useEditor.getState().open('p1', blankProject(), 1));
});

describe('site style panel', () => {
  it('applies a preset in one click and keeps it editable', () => {
    render(<ThemePanel />);
    const looks = screen.getByRole('group', { name: 'Ready-made looks' });
    expect(within(looks).getAllByRole('button')).toHaveLength(THEME_PRESETS.length);
    const midnight = THEME_PRESETS.find((p) => p.id === 'midnight');
    fireEvent.click(within(looks).getByRole('button', { name: /Midnight/ }));
    expect(project()?.theme.colors).toEqual(midnight?.colors);
    expect(project()?.theme.fonts).toEqual(midnight?.fonts);
    expect(project()?.theme.preset).toBe('midnight');
    expect(within(looks).getByRole('button', { name: /Midnight/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Editing a color afterwards works and the look is no longer marked as the preset.
    fireEvent.change(screen.getByLabelText('Accent', { exact: true }), {
      target: { value: '#ffcc00' },
    });
    expect(project()?.theme.colors.accent).toBe('#ffcc00');
    expect(project()?.theme.preset).toBeUndefined();
  });

  it('changes the header style with keyboard-friendly radio buttons', () => {
    render(<ThemePanel />);
    const group = screen.getByRole('group', { name: 'Header style' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('value'))).toEqual([
      'bar',
      'pill',
      'centered',
      'minimal',
    ]);
    expect(within(group).getByLabelText(/Top bar/)).toBeChecked();
    fireEvent.click(within(group).getByLabelText(/Floating pill/));
    expect(project()?.meta.headerStyle).toBe('pill');
    expect(within(group).getByLabelText(/Floating pill/)).toBeChecked();
  });
});
