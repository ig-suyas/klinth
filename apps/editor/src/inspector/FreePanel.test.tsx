import { freeCanvas, type Project, type Section } from '@klinth/core';
import { getTemplate } from '@klinth/templates';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { convertToFree } from '../state/free.ts';
import { useFreeUi } from '../state/free-intent.ts';
import { useEditor } from '../state/store.ts';
import { FreePanel } from './FreePanel.tsx';

const state = () => useEditor.getState();
const hero = (): Section => {
  const section = state().project?.pages[0]?.sections[0];
  if (!section) throw new Error('no hero');
  return section;
};

beforeEach(() => {
  const template = getTemplate('portfolio');
  if (!template) throw new Error('missing template');
  const p = template.create();
  const id = p.pages[0]?.sections[0]?.id ?? '';
  const result = convertToFree(p, 0, id, {
    width: 1000,
    height: 500,
    elements: [
      { from: 'eyebrow', x: 0, y: 0, width: 200, height: 20, fontSize: 14 },
      { from: 'heading', x: 0, y: 40, width: 700, height: 160, fontSize: 80 },
      { from: 'subheading', x: 0, y: 220, width: 560, height: 60, fontSize: 15 },
      { from: 'buttons.0', x: 0, y: 320, width: 170, height: 48, fontSize: 16 },
      { from: 'buttons.1', x: 190, y: 320, width: 170, height: 48, fontSize: 16 },
    ],
  });
  if ('problem' in result) throw new Error(result.problem);
  act(() => state().open('p1', result.project as Project, 1));
  useFreeUi.getState().reset();
});

describe('free layout things to check', () => {
  it('shows one grouped tablet warning per section with one Show button', () => {
    render(<FreePanel section={hero()} />);
    const list = screen.getByRole('list', { name: 'Things to check' });
    expect(within(list).getAllByText(/too small/)).toHaveLength(1);
    expect(within(list).getByText('4 items may be too small on tablets')).toBeTruthy();
    const show = within(list).getAllByRole('button', { name: /^Show/ });
    expect(show).toHaveLength(1);
    fireEvent.click(must(show[0]));
    const canvas = freeCanvas(hero());
    const small = (canvas?.items ?? []).filter((i) => i.from !== 'heading').map((i) => i.id);
    expect(useFreeUi.getState().hint?.items).toEqual(expect.arrayContaining(small));
    expect(useFreeUi.getState().hint?.items).toHaveLength(4);
  });
});

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('missing value');
  return value;
}
