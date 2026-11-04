import { freeCanvas, type Project } from '@klinth/core';
import { getTemplate } from '@klinth/templates';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decideFreeIntent,
  receiveFreeDrag,
  receiveFreeDrop,
  receiveFreeIntent,
  receiveFreeRelease,
  useFreeUi,
} from './free-intent.ts';
import { useEditor } from './store.ts';

const portfolio = (): Project => {
  const template = getTemplate('portfolio');
  if (!template) throw new Error('missing template');
  return template.create();
};
const hero = () => useEditor.getState().project?.pages[0]?.sections[0];

const intent = (id: string) => ({
  id,
  from: 'heading',
  dx: 20,
  dy: 10,
  measure: {
    width: 1000,
    height: 500,
    elements: [
      { from: 'heading', x: 0, y: 40, width: 700, height: 160, fontSize: 80 },
      { from: 'subheading', x: 0, y: 220, width: 560, height: 60, fontSize: 21 },
    ],
  },
});

describe('the free layout warning', () => {
  let post: ReturnType<typeof vi.fn<(accept: boolean) => void>>;
  beforeEach(() => {
    localStorage.clear();
    useEditor.getState().open('p1', portfolio(), 0);
    useFreeUi.getState().reset();
    post = vi.fn<(accept: boolean) => void>();
    useFreeUi.getState().setBridge(post);
  });

  it('asks first and changes nothing while the question is open', () => {
    const before = useEditor.getState().project;
    receiveFreeIntent(intent(hero()?.id ?? ''));
    expect(useFreeUi.getState().asking).toBe(true);
    expect(useEditor.getState().project).toBe(before);
  });

  it('No cancels cleanly: the element goes back and the project is untouched', () => {
    const before = useEditor.getState().project;
    receiveFreeIntent(intent(hero()?.id ?? ''));
    receiveFreeDrop(80, 40);
    decideFreeIntent(false, false);
    expect(post).toHaveBeenCalledWith(false);
    expect(useFreeUi.getState().asking).toBe(false);
    expect(useEditor.getState().project).toBe(before);
    expect(useEditor.getState().past).toHaveLength(0);
    expect(useEditor.getState().save.status).toBe('saved');
  });

  it('Yes converts with the measured positions and keeps the drag', () => {
    const id = hero()?.id ?? '';
    receiveFreeIntent(intent(id));
    receiveFreeDrop(100, 50);
    decideFreeIntent(true, false);
    expect(post).toHaveBeenCalledWith(true);
    const canvas = freeCanvas(hero() ?? ({} as never));
    const heading = canvas?.items.find((i) => i.from === 'heading');
    // Measured at 0%, 8%; the drag adds 10% and 10%.
    expect(heading).toMatchObject({ x: 10, y: 18 });
    expect(useFreeUi.getState().item).toBe(heading?.id);
    expect(useEditor.getState().past).toHaveLength(1);
    expect(useEditor.getState().selectedId).toBe(id);
  });

  it('Yes while the button is still held waits for the drop, then uses it', () => {
    receiveFreeIntent(intent(hero()?.id ?? ''));
    decideFreeIntent(true, false);
    expect(hero()?.layout).toBeUndefined();
    receiveFreeDrop(-1000, 0);
    const heading = freeCanvas(hero() ?? ({} as never))?.items.find((i) => i.from === 'heading');
    expect(heading?.x).toBe(0);
  });

  it('a release over the editor uses the last position the preview reported', () => {
    receiveFreeIntent(intent(hero()?.id ?? ''));
    receiveFreeDrag(300, 0);
    decideFreeIntent(true, false);
    expect(hero()?.layout).toBeUndefined();
    receiveFreeRelease();
    const heading = freeCanvas(hero() ?? ({} as never))?.items.find((i) => i.from === 'heading');
    expect(heading?.x).toBe(30);
  });

  it('remembers "Don’t ask again" per section', () => {
    const id = hero()?.id ?? '';
    receiveFreeIntent(intent(id));
    receiveFreeDrop(0, 0);
    decideFreeIntent(false, true);
    // The next try on that section stays optimized without asking.
    receiveFreeIntent(intent(id));
    expect(useFreeUi.getState().asking).toBe(false);
    expect(post).toHaveBeenLastCalledWith(false);
    expect(hero()?.layout).toBeUndefined();

    // Another section still asks.
    const other = useEditor.getState().project?.pages[0]?.sections[1]?.id ?? '';
    receiveFreeIntent({ ...intent(other), from: 'heading' });
    expect(useFreeUi.getState().asking).toBe(true);
  });

  it('ignores a request for a section that cannot be free', () => {
    const footer = useEditor
      .getState()
      .project?.pages[0]?.sections.find((s) => s.type === 'footer')?.id;
    receiveFreeIntent(intent(footer ?? ''));
    expect(useFreeUi.getState().asking).toBe(false);
    expect(post).toHaveBeenCalledWith(false);
  });
});
