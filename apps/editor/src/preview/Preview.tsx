import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { setSectionProps, type Props } from '../state/sections.ts';
import { useEditor, type Device } from '../state/store.ts';
import { buildPreviewDocument, previewMessageSchema } from './document.ts';

/** Frame widths per device, in CSS pixels of the previewed site. */
export const DEVICE_WIDTH: Record<Device, number> = {
  /** The narrowest desktop layout; wider spaces show the frame at full width. */
  desktop: 1280,
  tablet: 768,
  phone: 390,
};

/** How long the preview waits after a change before it redraws. */
const PREVIEW_DELAY_MS = 120;

/**
 * The live preview: the real rendered page in a sandboxed frame. The frame
 * gets `allow-scripts` only (no same-origin), so it cannot read the editor,
 * its storage or the saved key. It talks to the editor through postMessage.
 */
export function Preview() {
  const project = useEditor((s) => s.project);
  const pageIndex = useEditor((s) => s.pageIndex);
  const device = useEditor((s) => s.device);
  const frame = useRef<HTMLIFrameElement>(null);
  const scrollY = useRef(0);
  const loads = useRef(0);
  const shownPage = useRef(pageIndex);
  const area = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = area.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSpace({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Typing stays smooth: the frame reloads shortly after the last change.
  useEffect(() => {
    if (!project) return;
    const timer = setTimeout(() => {
      if (!frame.current) return;
      if (shownPage.current !== pageIndex) scrollY.current = 0;
      shownPage.current = pageIndex;
      loads.current += 1;
      frame.current.srcdoc = buildPreviewDocument(project, pageIndex, {
        origin: window.location.origin,
        interactive: true,
        calm: loads.current > 1,
        scrollY: scrollY.current,
        selectedId: useEditor.getState().selectedId,
      });
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [project, pageIndex]);

  // Messages from the frame. Checked by source and by schema; anything else is ignored.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const parsed = previewMessageSchema.safeParse(event.data);
      if (!parsed.success) return;
      const message = parsed.data;
      const state = useEditor.getState();
      switch (message.type) {
        case 'ready':
          break;
        case 'scroll':
          scrollY.current = message.y;
          break;
        case 'select':
          state.select(message.id);
          break;
        case 'edit': {
          const section = state.project?.pages[state.pageIndex]?.sections.find(
            (s) => s.id === message.id,
          );
          if (!section) return;
          const props: Props = section.props;
          const problem = state.change((p) =>
            setSectionProps(p, state.pageIndex, message.id, {
              ...props,
              [message.field]: message.value,
            }),
          );
          if (problem) state.notify(`That text could not be saved: ${problem}`);
          break;
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Selecting in the list or inspector highlights the section in the frame.
  useEffect(
    () =>
      useEditor.subscribe((state, previous) => {
        if (state.selectedId === previous.selectedId) return;
        frame.current?.contentWindow?.postMessage(
          { source: 'klinth-editor', type: 'select', id: state.selectedId },
          '*',
        );
      }),
    [],
  );

  const logical = Math.max(DEVICE_WIDTH[device], device === 'desktop' ? space.width : 0);
  // Narrow windows still show the real desktop layout, scaled down to fit.
  const scale = space.width ? Math.min(1, space.width / logical) : 1;
  return (
    <div
      ref={area}
      className="relative flex min-h-0 min-w-0 flex-1 justify-center overflow-hidden p-4 lg:p-6"
      data-tour="preview"
    >
      <div
        className="relative h-full shrink-0 overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(29,27,24,.08),0_8px_28px_-12px_rgba(29,27,24,.25)] ring-1 ring-line"
        style={{ width: `${Math.round(logical * scale)}px` }}
      >
        <iframe
          ref={frame}
          title="Preview of your site"
          sandbox="allow-scripts"
          className="block origin-top-left border-0"
          style={{
            width: `${logical}px`,
            height: space.height ? `${space.height / scale}px` : '100%',
            transform: scale < 1 ? `scale(${scale})` : undefined,
          }}
        />
      </div>
    </div>
  );
}
