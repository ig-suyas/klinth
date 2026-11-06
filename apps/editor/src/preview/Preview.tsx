import { sectionAssetIds, type Project } from '@klinth/core';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFontUrls } from '../lib/fonts.ts';
import { assetBlobs } from '../media/files.ts';
import { HEADER_ID } from '../state/header.ts';
import { useFreeUi } from '../state/free-intent.ts';
import { setSectionProps, type Props } from '../state/sections.ts';
import { removeHeaderNow } from '../state/useHeaderActions.ts';
import { useEditor, type Device } from '../state/store.ts';
import { PREVIEW_PATH } from '../security/headers.ts';
import { buildPreviewDocument, previewMessageSchema } from './document.ts';
import { handleFreeMessage, isFreeMessage } from './free-messages.ts';
import { planUpdate, splitPreview, type PreviewSplit } from './patch.ts';

/** Frame widths per device, in CSS pixels of the previewed site. */
export const DEVICE_WIDTH: Record<Device, number> = {
  /** The narrowest desktop layout; wider spaces show the frame at full width. */
  desktop: 1280,
  tablet: 768,
  phone: 390,
};

/** How long the preview waits after the last change before it updates (typing stays smooth). */
export const PREVIEW_DELAY_MS = 300;

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

/**
 * True when `source` is one of the shell's inner frames: the page shown, or the
 * next one being built under it during a full redraw.
 */
function innerFrame(el: HTMLIFrameElement | null, source: MessageEventSource | null): boolean {
  try {
    const frames = el?.contentWindow?.frames;
    if (!frames || !source) return false;
    for (let i = 0; i < frames.length; i++) if (frames[i] === source) return true;
  } catch {
    // Not loaded yet (see siteWindow).
  }
  return false;
}

/** Where the reader is in the preview, kept across full redraws. */
interface Place {
  y: number;
  anchor: string | null;
  offset: number;
  bottom: boolean;
}
const TOP: Place = { y: 0, anchor: null, offset: 0, bottom: false };

/** How long the preview shell may take to say it is ready before the user is told. */
export const PREVIEW_LOAD_TIMEOUT_MS = 10_000;

/**
 * The live preview: the real rendered page in a sandboxed frame. The frame
 * gets `allow-scripts` only (no same-origin), so it cannot read the editor,
 * its storage or the saved key. It talks to the editor through postMessage.
 * It loads the `preview.html` shell once (its own, looser security policy, so
 * pasted custom code can run) and then gets each redraw by message, which needs
 * no network. The shown page lives in the shell's inner frame.
 *
 * Most changes never redraw the page: the new document is compared with the
 * shown one (patch.ts) and only the changed sections, or the new style text,
 * are swapped in place, so the scroll place, focus and selection stay. A full
 * redraw (header, footer, page scripts, sections added or removed, another
 * page) is built under the shown page and keeps the reader's place.
 */
export function Preview() {
  const project = useEditor((s) => s.project);
  const pageIndex = useEditor((s) => s.pageIndex);
  const device = useEditor((s) => s.device);
  const frame = useRef<HTMLIFrameElement>(null);
  const place = useRef<Place>(TOP);
  /** Full redraws sent; the page answers `ready` with its number. */
  const loads = useRef(0);
  /** The number of the last full redraw that said it is ready. */
  const readyLoad = useRef(0);
  /** What the frame shows, split into sections and styles (null: unknown, redraw). */
  const shown = useRef<PreviewSplit | null>(null);
  /** A swap did not fit the page: the next update redraws it whole. */
  const forceFull = useRef(false);
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
  /**
   * A project the preview already shows because it made the change itself
   * (moving a free item): that one change needs no redraw, so dragging and
   * arrow-key nudges stay smooth and keep keyboard focus in the frame.
   */
  const live = useRef<Project | null>(null);
  /** A redraw is waiting for its timer (then a "live" change must not cancel it). */
  const scheduled = useRef(false);
  /** Goes up to force a redraw (a change the preview showed was refused). */
  const [redraws, setRedraws] = useState(0);

  /** Hands the latest page to the shell, which shows it in a fresh inner frame. */
  const sendPage = (el: HTMLIFrameElement) =>
    el.contentWindow?.postMessage(
      { source: 'klinth-editor', type: 'render', html: pending.current },
      '*',
    );

  /** Hands a page its pictures and videos (all, or those of some sections); it cannot read storage. */
  const sendAssets = (target: Window, only?: readonly string[]) => {
    const { projectId, project: current, pageIndex: index, notify } = useEditor.getState();
    const page = current?.pages[index];
    if (!projectId || !page) return;
    const sections = only ? page.sections.filter((s) => only.includes(s.id)) : page.sections;
    const ids = sectionAssetIds(sections);
    if (!ids.size) return;
    void assetBlobs(projectId, ids).then(
      (items) => {
        if (items.length && innerFrame(frame.current, target)) {
          target.postMessage({ source: 'klinth-editor', type: 'assets', items }, '*');
        }
      },
      () => notify('Some pictures could not be loaded from browser storage.'),
    );
  };

  useLayoutEffect(() => {
    const el = area.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSpace({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Typing stays smooth: the preview updates shortly after the last change. Undo and
  // redo are changes like any other, so they take the same way.
  useEffect(() => {
    if (!project) return;
    if (project === live.current && !scheduled.current) {
      // The frame changed itself (free layout); what it shows is no longer known here.
      live.current = null;
      shown.current = null;
      return;
    }
    live.current = null;
    scheduled.current = true;
    const timer = setTimeout(() => {
      scheduled.current = false;
      const el = frame.current;
      if (!el) return;
      const pageChanged = shownPage.current !== pageIndex;
      shownPage.current = pageIndex;
      const play = shownReplay.current !== replay;
      shownReplay.current = replay;
      const base = {
        origin: window.location.origin,
        interactive: true,
        calm: loads.current > 0 && !play,
        fontUrls,
      };
      // Compared without the per-redraw details (place, selection), which only a full redraw needs.
      const next = splitPreview(buildPreviewDocument(project, pageIndex, base));
      const target = siteWindow(el);
      const settled = hostReady.current && loads.current > 0 && readyLoad.current === loads.current;
      const plan =
        target && settled && !pageChanged && !play && !forceFull.current && !scrollTo.current
          ? planUpdate(shown.current, next)
          : ({ kind: 'full' } as const);
      if (plan.kind === 'patch' && target) {
        shown.current = next;
        if (plan.sections.length || plan.styles) {
          target.postMessage(
            {
              source: 'klinth-editor',
              type: 'patch',
              sections: plan.sections,
              styles: plan.styles,
            },
            '*',
          );
          if (plan.sections.length)
            sendAssets(
              target,
              plan.sections.map((s) => s.id),
            );
        }
        return;
      }
      forceFull.current = false;
      if (pageChanged) place.current = TOP;
      loads.current += 1;
      pending.current = buildPreviewDocument(project, pageIndex, {
        ...base,
        load: loads.current,
        scrollY: place.current.y,
        anchor: place.current.anchor,
        offset: place.current.offset,
        bottom: place.current.bottom,
        scrollTo: scrollTo.current,
        selectedId: useEditor.getState().selectedId,
        freeItem: useFreeUi.getState().item,
      });
      shown.current = next;
      scrollTo.current = null;
      if (hostReady.current) sendPage(el);
      else if (!el.getAttribute('src')) el.setAttribute('src', PREVIEW_PATH);
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [project, pageIndex, fontUrls, replay, redraws]);

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
      if (!fromShell && !innerFrame(frame.current, event.source)) return;
      const parsed = previewMessageSchema.safeParse(event.data);
      if (!parsed.success) return;
      const message = parsed.data;
      // The shell only says it is ready; everything else must come from the page.
      if (fromShell !== (message.type === 'host')) return;
      const state = useEditor.getState();
      if (isFreeMessage(message)) {
        handleFreeMessage(message, {
          shown: (shown) => {
            live.current = shown;
          },
          redraw: () => setRedraws((n) => n + 1),
        });
        return;
      }
      switch (message.type) {
        case 'host':
          hostReady.current = true;
          if (pending.current) sendPage(frame.current);
          break;
        case 'ready':
          if (message.load !== undefined) readyLoad.current = message.load;
          // Hand the page its pictures and videos; the frame cannot read browser storage.
          sendAssets(event.source as Window);
          break;
        case 'scroll':
          place.current = {
            y: message.y,
            anchor: message.anchor ?? null,
            offset: message.offset ?? 0,
            bottom: message.bottom === true,
          };
          break;
        case 'patchFailed':
          forceFull.current = true;
          setRedraws((n) => n + 1);
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

  // Free layout: the answer to the warning, and the item picked in the settings panel.
  useEffect(() => {
    const post = (message: Record<string, unknown>) =>
      siteWindow(frame.current)?.postMessage({ source: 'klinth-editor', ...message }, '*');
    useFreeUi.getState().setBridge((accept) => post({ type: 'freeDecision', accept }));
    const stop = useFreeUi.subscribe((state, previous) => {
      if (state.item !== previous.item) post({ type: 'freeItem', item: state.item });
      if (state.hint && state.hint !== previous.hint) {
        post({ type: 'freeHint', items: state.hint.items });
      }
    });
    return () => {
      stop();
      useFreeUi.getState().setBridge(null);
    };
  }, []);

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
