import { REPO_WARN_BYTES, assetBytes, formatBytes, type Asset, type Project } from '@klinth/core';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { loadAsset, saveAsset } from '../lib/storage.ts';
import { useEditor } from '../state/store.ts';
import { MediaError, newAssetId, prepareImage, prepareVideo } from './process.ts';

/**
 * Uploaded files in the editor: a cache of their bytes as Blobs (shared by the
 * file list, the inspector and the preview), the upload step, and the state of
 * the "Pictures and videos" window.
 */

const blobs = new Map<string, Blob>();
const key = (projectId: string, id: string) => `${projectId}/${id}`;

function mimeOf(project: Project | null, id: string): string {
  return project?.assets.find((a) => a.id === id)?.mime ?? 'application/octet-stream';
}

/** The file's bytes as a Blob, loaded from browser storage once and then cached. */
export async function assetBlob(projectId: string, id: string): Promise<Blob | undefined> {
  const cached = blobs.get(key(projectId, id));
  if (cached) return cached;
  const data = await loadAsset(projectId, id);
  if (!data) return undefined;
  const blob = new Blob([data as Uint8Array<ArrayBuffer>], {
    type: mimeOf(useEditor.getState().project, id),
  });
  blobs.set(key(projectId, id), blob);
  return blob;
}

/** Blobs of several files; missing ones are left out. */
export async function assetBlobs(projectId: string, ids: Iterable<string>) {
  const entries = await Promise.all(
    Array.from(new Set(ids), async (id) => [id, await assetBlob(projectId, id)] as const),
  );
  return entries.flatMap(([id, blob]) => (blob ? [{ id, blob }] : []));
}

/** A temporary address for showing a file in the editor. Released when unused. */
export function useAssetUrl(id: string | undefined): string | undefined {
  const projectId = useEditor((s) => s.projectId);
  const [url, setUrl] = useState<{ id: string; url: string }>();
  useEffect(() => {
    if (!id || !projectId) return;
    let alive = true;
    let made: string | undefined;
    void assetBlob(projectId, id).then(
      (blob) => {
        if (!alive || !blob) return;
        made = URL.createObjectURL(blob);
        setUrl({ id, url: made });
      },
      () => undefined,
    );
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id, projectId]);
  return url && url.id === id ? url.url : undefined;
}

/**
 * Prepares a file and stores its bytes. Returns the new asset, which the
 * caller adds to the project in the same change that uses it (one undo step).
 */
export async function uploadFile(file: File, kind: Asset['kind']): Promise<Asset> {
  const { projectId, project } = useEditor.getState();
  if (!projectId || !project) throw new MediaError('No project is open.');
  const prepared = kind === 'image' ? await prepareImage(file) : await prepareVideo(file);
  const current = useEditor.getState().project ?? project;
  const id = newAssetId(
    prepared.kind,
    current.assets.map((a) => a.id),
  );
  await saveAsset(projectId, id, prepared.data);
  blobs.set(
    key(projectId, id),
    new Blob([prepared.data as Uint8Array<ArrayBuffer>], { type: prepared.mime }),
  );
  return {
    id,
    kind: prepared.kind,
    name: prepared.name,
    size: prepared.data.byteLength,
    mime: prepared.mime,
    ...(prepared.width && prepared.height
      ? { width: prepared.width, height: prepared.height }
      : {}),
  };
}

/** Adds a new asset to a project (no-op when there is none). */
export function withAsset(project: Project, asset: Asset | undefined): Project {
  return asset ? { ...project, assets: [...project.assets, asset] } : project;
}

/** A plain warning once the site's files get heavy, or null. */
export function sizeWarning(project: Project): string | null {
  const total = assetBytes(project);
  return total > REPO_WARN_BYTES
    ? `Your pictures and videos add up to ${formatBytes(total)}. Big sites load slowly and can be hard to publish. Try removing unused files, or use YouTube or Vimeo links for videos.`
    : null;
}

// ---- The "Pictures and videos" window ----

export type LibraryRequest =
  | { mode: 'manage' }
  | { mode: 'pick'; kind: Asset['kind']; onPick: (asset: Asset, isNew: boolean) => void };

export const useLibrary = create<{
  request: LibraryRequest | null;
  open: (request: LibraryRequest) => void;
  close: () => void;
}>()((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));
