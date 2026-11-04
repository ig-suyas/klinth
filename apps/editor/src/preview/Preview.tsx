import { sectionAssetIds } from '@klinth/core';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFontUrls } from '../lib/fonts.ts';
import { assetBlobs } from '../media/files.ts';
import { HEADER_ID } from '../state/header.ts';
import { setSectionProps, type Props } from '../state/sections.ts';
import { removeHeaderNow } from '../state/useHeaderActions.ts';
import { useEditor, type Device } from '../state/store.ts';
import { PREVIEW_PATH } from '../security/headers.ts';
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

/** The window of the shown page: the inner frame of the preview.html shell. */
export function siteWindow(el: HTMLIFrameElement | null): Window | null {
  // `frames[0]` may be read across origins once the shell has its inner frame.
  // Before that, or when the shell failed to load (a 404 page has no frames),
  // Chrome and Safari throw a SecurityError instead of returning undefined.
  try {
    return el?.contentWindow?.frames[0] ?? null;
  } catch {
    return null;
  }
}

/** How long the preview shell may take to say it is ready before the user is told. */
export const PREVIEW_LOAD_TIMEOUT_MS = 10_000;

/**
 * The live preview: the real rendered page in a sandboxed frame. The frame
 * gets `allow-scripts` only (no same-origin), so it cannot read the editor,
 * its storage or the saved key. It talks to the editor through postMessage.
 * It loads the `preview.html` shell once (its own, looser security policy, so
 * pasted custom code can run) and then gets each redraw by message, which needs
 * no network. The shown page lives in the shell's inner frame.
 */
export function Preview() {
  const project = useEditor((s) => s.project);
  const pageIndex = useEditor((s) => s.pageIndex);
  const device = useEditor((s) => s.device);
  const frame = useRef<HTMLIFrameElement>(null);
  const scrollY = useRef(0);
  const loads = useRef(0);
  /** The latest page to show; handed over when the preview page says it is ready. */
  const pending = useRef('');
  /** The shell has loaded and listens for pages. */
  const hostReady = useRef(false);
  const shownPage = useRef(pageIndex);
  /** Section to show after a header link switched the page. */
  const scrollTo = useRef<string | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState({ width: 0, height: 0 });
  const fontUrls = useFontUrls(project?.theme);
  /** "Preview animations" (or a newly picked animation): the next redraw plays them. */
  const replay = useEditor((s) => s.animationReplay);
  const shownReplay = useRef(replay);

  /** Hands the latest page to the shell, which shows it in a fresh inner frame. */
  const sendPage = (el: HTMLIFrameElement) =>
    el.contentWindow?.postMessage(
      { source: 'klinth-editor', type: 'render', html: pending.current },
      '*',
    );

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
      const play = shownReplay.current !== replay;
      shownReplay.current = replay;
      pending.current = buildPreviewDocument(project, pageIndex, {
        origin: window.location.origin,
        interactive: true,
        calm: loads.current > 1 && !play,
        scrollY: scrollY.current,
        scrollTo: scrollTo.current,
        selectedId: useEditor.getState().selectedId,
        fontUrls,
      });
      scrollTo.current = null;
      if (hostReady.current) sendPage(frame.current);
      else if (!frame.current.getAttribute('src')) frame.current.setAttribute('src', PREVIEW_PATH);
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [project, pageIndex, fontUrls, replay]);

  // The shell never said it is ready (offline on first visit, or the host served
  // an error page): say so instead of showing an empty white box.
  const hasProject = project !== null;
  useEffect(() => {
    if (!hasProject) return;
    const timer = setTimeout(() => {
      if (!hostReady.current) {
        useEditor
          .getState()
          .notify('The preview could not load. Check your connection, then reload the page.');
      }
    }, PREVIEW_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hasProject]);

  // Messages from the frame. Checked by source and by schema; anything else is ignored.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!frame.current || !event.source) return;
      const fromShell = event.source === frame.current.contentWindow;
      if (!fromShell && event.source !== siteWindow(frame.current)) return;
      const parsed = previewMessageSchema.safeParse(event.data);
      if (!parsed.success) return;
      const message = parsed.data;
      // The shell only says it is ready; everything else must come from the page.
      if (fromShell !== (message.type === 'host')) return;
      const state = useEditor.getState();
      switch (message.type) {
        case 'host':
          hostReady.current = true;
          if (pending.current) sendPage(frame.current);
          break;
        case 'ready': {
          // Hand the page its pictures and videos; the frame cannot read browser storage.
          const { projectId, project: current, pageIndex: index } = state;
          const page = current?.pages[index];
          if (!projectId || !current || !page) break;
          const target = siteWindow(frame.current);
          const ids = sectionAssetIds(page.sections);
          void assetBlobs(projectId, ids).then(
            (items) => {
              if (items.length && target && siteWindow(frame.current) === target) {
                target.postMessage({ source: 'klinth-editor', type: 'assets', items }, '*');
              }
            },
            () => state.notify('Some pictures could not be loaded from browser storage.'),
          );
          break;
        }
        case 'scroll':
          scrollY.current = message.y;
          break;
        case 'select':
          state.select(message.id);
          break;
        case 'header':
          state.select(HEADER_ID);
          break;
        case 'removeHeader':
          removeHeaderNow();
          break;
        case 'navigate': {
          const index = state.project?.pages.findIndex((p) => p.slug === message.page) ?? -1;
          if (index < 0) break;
          scrollTo.current = message.anchor ?? null;
          state.setPage(index);
          break;
        }
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
        siteWindow(frame.current)?.postMessage(
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
