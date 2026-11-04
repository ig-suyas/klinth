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

  it('edits site-wide CSS and JavaScript behind a trust notice', () => {
    render(<ThemePanel />);
    const area = screen.getByRole('region', { name: 'Custom code for every page' });
    expect(area).toHaveTextContent(
      'This code runs on your published site. Only paste code you trust.',
    );
    fireEvent.change(within(area).getByLabelText(/Custom CSS/), {
      target: { value: 'h1 { letter-spacing: 0 }' },
    });
    fireEvent.change(within(area).getByLabelText(/Custom JavaScript/), {
      target: { value: 'console.log(1);' },
    });
    expect(project()?.siteCode).toEqual({ css: 'h1 { letter-spacing: 0 }', js: 'console.log(1);' });
    expect(area).toHaveTextContent('24 bytes of 200 KB');
  });

  it('refuses site-wide code over about 200 KB and says why', () => {
    render(<ThemePanel />);
    const area = screen.getByRole('region', { name: 'Custom code for every page' });
    fireEvent.change(within(area).getByLabelText(/Custom JavaScript/), {
      target: { value: 'a'.repeat(200_001) },
    });
    expect(project()?.siteCode?.js ?? '').toBe('');
    expect(within(area).getByRole('alert')).toHaveTextContent('Keep custom code under 200 KB');
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
