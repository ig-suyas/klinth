import { blankProject, freeCanvas, type Project, type Section } from '@klinth/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useFreeUi } from '../state/free-intent.ts';
import { addSection } from '../state/sections.ts';
import { useEditor } from '../state/store.ts';
import { Inspector } from './Inspector.tsx';

const state = () => useEditor.getState();
const sectionNow = (): Section => {
  const s = state().project?.pages[0]?.sections.find((x) => x.id === state().selectedId);
  if (!s) throw new Error('no section');
  return s;
};

/** Opens a blank project with one section of `type` and selects it. */
function openWith(type: 'canvas' | 'video' | 'spacer') {
  const { project, id } = addSection(blankProject(), 0, type);
  act(() => {
    state().open('p1', project as Project, 1);
    state().select(id);
  });
  useFreeUi.getState().reset();
}

describe('blank canvas settings', () => {
  beforeEach(() => openWith('canvas'));

  it('offers the height presets and shows the custom value only for Custom', () => {
    render(<Inspector />);
    for (const name of ['Quarter', 'Half', 'Three-quarter', 'Full screen', 'Custom']) {
      expect(screen.getByRole('radio', { name })).toBeTruthy();
    }
    expect(screen.getByRole('radio', { name: 'Half' })).toHaveProperty('checked', true);
    expect(screen.queryByLabelText('Custom height')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Full screen' }));
    expect(sectionNow().props).toEqual({ height: 'full' });
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }));
    expect(screen.getByLabelText('Custom height')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Pixels' }));
    fireEvent.change(screen.getByLabelText('Custom height'), { target: { value: '640' } });
    expect(sectionNow().props).toMatchObject({ height: 'custom', heightUnit: 'px', heightPx: 640 });
    expect(freeCanvas(sectionNow())?.aspect).toBe(1.75);
  });

  it('picks a background color as #rrggbb, saving only complete values', () => {
    render(<Inspector />);
    fireEvent.click(screen.getByRole('radio', { name: 'Color' }));
    const hex = screen.getByRole('textbox', { name: 'Color' });
    fireEvent.change(hex, { target: { value: '#12' } });
    fireEvent.change(hex, { target: { value: '#123456' } });
    expect(sectionNow().props).toMatchObject({ fill: 'color', color: '#123456' });
  });

  it('adds items to the empty canvas, selects them, and has no way back to a flow layout', () => {
    render(<Inspector />);
    expect(screen.getByText(/The canvas is empty/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Return to optimized layout' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Heading' }));
    const items = freeCanvas(sectionNow())?.items ?? [];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: 'text', style: 'title', text: 'Your heading' });
    expect(useFreeUi.getState().item).toBe(items[0]?.id);
    fireEvent.change(screen.getByLabelText('Video link'), { target: { value: 'not a link' } });
    expect(screen.getByRole('button', { name: 'Add video' })).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Video link'), {
      target: { value: 'https://vimeo.com/76979871' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add video' }));
    expect(freeCanvas(sectionNow())?.items.map((i) => i.type)).toEqual(['text', 'video']);
    // Each add is one undo step.
    act(() => state().undo());
    expect(freeCanvas(sectionNow())?.items).toHaveLength(1);
  });
});

describe('video and spacer settings', () => {
  it('shows the layout choice only once there are more videos, and controls only for a loop', () => {
    openWith('video');
    render(<Inspector />);
    expect(screen.queryByText('Show the videos as')).toBeNull();
    expect(screen.queryByLabelText('Show player controls')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Vertical 9:16' }));
    expect(sectionNow().props).toMatchObject({ ratio: 'vertical' });
    fireEvent.click(screen.getByRole('button', { name: 'Add a video' }));
    expect(screen.getByText('Show the videos as')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Carousel' }));
    expect(sectionNow().props).toMatchObject({ layout: 'carousel', videos: [{}] });
    fireEvent.click(screen.getByLabelText('Play silently on a loop'));
    expect(sectionNow().props).toMatchObject({ autoplay: true });
    const controls = screen.getByLabelText('Show player controls');
    expect(controls).toHaveProperty('checked', true);
    fireEvent.click(controls);
    expect(sectionNow().props).toMatchObject({ autoplay: true, controls: false });
  });

  it('gives the empty space pixel presets', () => {
    openWith('spacer');
    render(<Inspector />);
    expect(screen.getByRole('radio', { name: '96 px' })).toHaveProperty('checked', true);
    fireEvent.click(screen.getByRole('radio', { name: '240 px' }));
    expect(sectionNow().props).toEqual({ height: 240 });
  });
});
