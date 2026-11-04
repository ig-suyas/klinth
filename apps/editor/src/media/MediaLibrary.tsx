import { assetBytes, assetUsage, formatBytes, removeAsset, type Asset } from '@klinth/core';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useEditor } from '../state/store.ts';
import { Icon } from '../ui/Icon.tsx';
import { sizeWarning, uploadFile, useAssetUrl, useLibrary, withAsset } from './files.ts';
import { IMAGE_ACCEPT, MediaError, VIDEO_ACCEPT } from './process.ts';

const KIND_WORD: Record<Asset['kind'], string> = { image: 'picture', video: 'video' };

function kindOf(file: File): Asset['kind'] {
  return file.type.startsWith('video/') ? 'video' : 'image';
}

/**
 * "Pictures and videos": every file in the project, with upload, size and
 * where it is used. Also opens as a picker from the inspector.
 */
export function MediaLibrary() {
  const request = useLibrary((s) => s.request);
  return <AnimatePresence>{request ? <LibraryDialog key="library" /> : null}</AnimatePresence>;
}

function LibraryDialog() {
  const request = useLibrary((s) => s.request);
  const close = useLibrary((s) => s.close);
  const project = useEditor((s) => s.project);
  const change = useEditor((s) => s.change);
  const notify = useEditor((s) => s.notify);
  const reduce = useReducedMotion();
  const dialog = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [close]);

  if (!request || !project) return null;
  const pick = request.mode === 'pick' ? request : null;
  const usage = assetUsage(project);
  const shown = project.assets.filter((a) => !pick || a.kind === pick.kind);
  const warning = sizeWarning(project);
  const title = pick ? `Choose a ${KIND_WORD[pick.kind]}` : 'Pictures and videos';
  const accept = pick
    ? pick.kind === 'image'
      ? IMAGE_ACCEPT
      : VIDEO_ACCEPT
    : `${IMAGE_ACCEPT},${VIDEO_ACCEPT}`;

  const upload = async (files: File[]) => {
    if (busy || files.length === 0) return;
    setProblem(null);
    const list = pick ? files.slice(0, 1) : files;
    for (const file of list) {
      const kind = pick ? pick.kind : kindOf(file);
      setBusy(`Getting “${file.name}” ready…`);
      try {
        const asset = await uploadFile(file, kind);
        if (pick) {
          pick.onPick(asset, true);
          close();
          return;
        }
        const failed = change((p) => withAsset(p, asset));
        if (failed) throw new MediaError(`That file could not be added: ${failed}`);
      } catch (error) {
        setProblem(
          error instanceof Error
            ? error.message
            : 'That file could not be added. Please try again.',
        );
        break;
      }
    }
    setBusy(null);
    const latest = useEditor.getState().project;
    const warn = latest ? sizeWarning(latest) : null;
    if (warn && !warning) notify('Your site is getting large. See Pictures and videos.');
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void upload(Array.from(e.dataTransfer.files));
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <motion.div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-title"
        tabIndex={-1}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: reduce ? 0 : 6 }}
        transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={onDrop}
        className={`flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-panel shadow-[0_24px_60px_-20px_rgba(29,27,24,.45)] outline-none ${
          dragging ? 'border-accent ring-4 ring-accent-wash' : 'border-line'
        }`}
      >
        <header className="flex items-start gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="library-title" className="font-display text-2xl">
              {title}
            </h2>
            <p className="help">
              {project.assets.length === 1 ? '1 file' : `${project.assets.length} files`} ·{' '}
              {formatBytes(assetBytes(project))} in total. Pictures are made smaller automatically.
              Videos: MP4 or WebM, up to 25 MB.
            </p>
          </div>
          <button type="button" className="icon-btn size-9" aria-label="Close" onClick={close}>
            <Icon name="close" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {warning ? (
            <p
              role="status"
              className="flex gap-2 rounded-lg border border-accent/40 bg-accent-wash px-3 py-2 text-sm leading-relaxed"
            >
              <Icon name="warn" className="mt-0.5 size-4 shrink-0 text-accent" />
              {warning}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy !== null}
              onClick={() => input.current?.click()}
            >
              <Icon name="upload" />
              {pick ? `Upload a ${KIND_WORD[pick.kind]}` : 'Upload files'}
            </button>
            <input
              ref={input}
              type="file"
              className="sr-only"
              tabIndex={-1}
              aria-label="Upload files"
              accept={accept}
              multiple={!pick}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                void upload(files);
              }}
            />
            <p className="text-sm text-ink-soft" role="status">
              {busy ?? 'Or drag files here.'}
            </p>
          </div>
          {problem ? (
            <p role="alert" className="error-text text-sm">
              {problem}
            </p>
          ) : null}

          {shown.length === 0 ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
              <p className="font-display text-lg">
                {pick ? `No ${KIND_WORD[pick.kind]}s yet.` : 'No pictures or videos yet.'}
              </p>
              <p className="help max-w-sm">
                Upload one from your computer. It stays in this browser until you export your site.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
              {shown.map((asset) => (
                <AssetTile
                  key={asset.id}
                  asset={asset}
                  uses={usage.get(asset.id) ?? 0}
                  onPick={
                    pick
                      ? () => {
                          pick.onPick(asset, false);
                          close();
                        }
                      : undefined
                  }
                  onDelete={() => {
                    const failed = change((p) => removeAsset(p, asset.id));
                    if (failed) setProblem(`That file could not be deleted: ${failed}`);
                    else notify(`Deleted “${asset.name}”.`, true);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function AssetTile({
  asset,
  uses,
  onPick,
  onDelete,
}: {
  asset: Asset;
  uses: number;
  onPick: (() => void) | undefined;
  onDelete: () => void;
}) {
  const url = useAssetUrl(asset.id);
  const [confirming, setConfirming] = useState(false);
  const used =
    uses === 0 ? 'Not used yet' : uses === 1 ? 'Used in 1 place' : `Used in ${uses} places`;
  const preview =
    asset.kind === 'image' ? (
      url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : null
    ) : url ? (
      <video src={url} muted preload="metadata" className="size-full object-cover" />
    ) : null;

  return (
    <li className="overflow-hidden rounded-xl border border-line bg-panel" data-asset={asset.id}>
      <div className="relative aspect-[4/3] bg-sunk">
        {preview}
        {asset.kind === 'video' ? (
          <span className="absolute top-2 left-2 rounded-full bg-ink/75 px-2 py-0.5 text-[0.6875rem] font-semibold text-panel">
            Video
          </span>
        ) : null}
        {onPick ? (
          <button
            type="button"
            className="absolute inset-0 grid place-items-end p-2 opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100"
            aria-label={`Use ${asset.name}`}
            onClick={onPick}
          >
            <span className="btn btn-primary min-h-8">Use this</span>
          </button>
        ) : null}
      </div>
      <div className="space-y-0.5 px-3 py-2">
        <p className="truncate text-sm font-medium" title={asset.name}>
          {asset.name}
        </p>
        <p className="text-xs text-ink-soft">
          {formatBytes(asset.size)} · {used}
        </p>
        {confirming ? (
          <div className="mt-2 space-y-2">
            <p className="text-xs leading-snug">
              {uses > 0
                ? `Delete it? It will be removed from ${uses === 1 ? 'the place' : `the ${uses} places`} that use it.`
                : 'Delete this file?'}
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                className="btn btn-line min-h-8 flex-1 hover:text-danger"
                onClick={onDelete}
              >
                Delete
              </button>
              <button
                type="button"
                className="btn btn-quiet min-h-8 flex-1"
                onClick={() => setConfirming(false)}
              >
                Keep
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="mt-1 -ml-1 inline-flex items-center gap-1 rounded px-1 text-xs text-ink-soft hover:text-danger"
            aria-label={`Delete ${asset.name}`}
            onClick={() => setConfirming(true)}
          >
            <Icon name="trash" className="size-3.5" />
            Delete
          </button>
        )}
      </div>
    </li>
  );
}
