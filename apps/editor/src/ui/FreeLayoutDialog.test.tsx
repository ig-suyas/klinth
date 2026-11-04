import { getTemplate } from '@klinth/templates';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { receiveFreeDrop, receiveFreeIntent, useFreeUi } from '../state/free-intent.ts';
import { useEditor } from '../state/store.ts';
import { FreeLayoutDialog } from './FreeLayoutDialog.tsx';

function ask() {
  const id = useEditor.getState().project?.pages[0]?.sections[0]?.id ?? '';
  act(() => {
    receiveFreeIntent({
      id,
      from: 'heading',
      dx: 20,
      dy: 0,
      measure: {
        width: 1000,
        height: 500,
        elements: [{ from: 'heading', x: 0, y: 40, width: 700, height: 160, fontSize: 80 }],
      },
    });
    receiveFreeDrop(20, 0);
  });
}

describe('FreeLayoutDialog', () => {
  let post: ReturnType<typeof vi.fn<(accept: boolean) => void>>;
  beforeEach(() => {
    localStorage.clear();
    const template = getTemplate('portfolio');
    if (!template) throw new Error('missing template');
    useEditor.getState().open('p1', template.create(), 0);
    useFreeUi.getState().reset();
    post = vi.fn<(accept: boolean) => void>();
    useFreeUi.getState().setBridge(post);
  });

  it('stays hidden until the preview asks', () => {
    render(<FreeLayoutDialog />);
    expect(screen.queryByRole('dialog')).toBeNull();
    ask();
    const dialog = screen.getByRole('dialog', { name: /free positioning/i });
    expect(dialog).toHaveTextContent(
      'Free positioning can hurt your SEO, accessibility and how the page looks on phones. Continue?',
    );
    expect(screen.getByRole('button', { name: 'Yes, use free layout' })).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Don’t ask again for this section' }),
    ).toBeInTheDocument();
  });

  it('starts on the safe answer and keeps focus inside', () => {
    render(<FreeLayoutDialog />);
    ask();
    const no = screen.getByRole('button', { name: 'No, keep the optimized layout' });
    const yes = screen.getByRole('button', { name: 'Yes, use free layout' });
    const box = screen.getByRole('checkbox');
    expect(no).toHaveFocus();
    // Tab from the last control wraps to the first, Shift+Tab from the first to the last.
    const order = [box, yes, no];
    const last = order[order.length - 1] as HTMLElement;
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(order[0]).toHaveFocus();
    fireEvent.keyDown(order[0] as HTMLElement, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('Escape means No', async () => {
    render(<FreeLayoutDialog />);
    ask();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(post).toHaveBeenCalledWith(false);
    expect(useEditor.getState().project?.pages[0]?.sections[0]?.layout).toBeUndefined();
  });

  it('Yes turns the section free', async () => {
    render(<FreeLayoutDialog />);
    ask();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, use free layout' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(post).toHaveBeenCalledWith(true);
    expect(useEditor.getState().project?.pages[0]?.sections[0]?.layout).toBe('free');
  });
});
