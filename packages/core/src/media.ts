import type { Project, Section } from './schema.ts';

/** Largest video upload. Cloudflare Pages also refuses single files over 25 MiB. */
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
/** Above this total, the editor warns that the site is getting heavy to load and publish. */
export const REPO_WARN_BYTES = 60 * 1024 * 1024;

/** Props that point at an uploaded file. */
const ASSET_KEYS = new Set(['image', 'video']);

type Json = unknown;

function visit(value: Json, onRef: (id: string) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, onRef);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (ASSET_KEYS.has(key) && typeof child === 'string') onRef(child);
      else visit(child, onRef);
    }
  }
}

/** How many places (sections, the site icon) use each file. Unused files are absent. */
export function assetUsage(project: Project): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const page of project.pages) for (const s of page.sections) visit(s.props, add);
  if (project.meta.favicon) add(project.meta.favicon);
  if (project.meta.header?.logo) add(project.meta.header.logo.image);
  return counts;
}

/** Ids of the files a list of sections uses (for example one page). */
export function sectionAssetIds(sections: readonly Section[]): Set<string> {
  const ids = new Set<string>();
  for (const s of sections) visit(s.props, (id) => ids.add(id));
  return ids;
}

/**
 * Copy of `value` without file references outside `allowed`. Used on AI
 * answers, so the AI can keep or drop a section's files but never invent one.
 */
export function keepAssetRefs<T>(value: T, allowed: ReadonlySet<string>): T {
  const walk = (node: Json): Json => {
    if (Array.isArray(node)) return node.map(walk);
    if (typeof node !== 'object' || node === null) return node;
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key, child]) => !(ASSET_KEYS.has(key) && !allowed.has(String(child))))
        .map(([key, child]) => [key, walk(child)]),
    );
  };
  return walk(value) as T;
}

function strip(value: Json, id: string): Json {
  if (Array.isArray(value)) return value.map((item) => strip(item, id));
  if (typeof value !== 'object' || value === null) return value;
  const entries = Object.entries(value).filter(
    ([key, child]) => !(ASSET_KEYS.has(key) && child === id),
  );
  // A picture's description goes with the picture.
  const removedImage = 'image' in value && value.image === id;
  return Object.fromEntries(
    entries
      .filter(([key]) => !(removedImage && key === 'imageAlt'))
      .map(([key, child]) => [key, strip(child, id)]),
  );
}

/** Removes a file and every reference to it. Gallery pictures that used it are dropped. */
export function removeAsset(project: Project, id: string): Project {
  const dropEmptyPictures = (section: Section): Section => {
    if (section.type !== 'gallery' || !section.props.images) return section;
    const images = section.props.images.filter((item) => item.image !== id);
    return { ...section, props: { ...section.props, images } };
  };
  const { favicon, ...rest } = project.meta;
  const meta = favicon === id ? rest : { ...project.meta };
  // A removed logo picture means the header goes back to the site name.
  if (meta.header?.logo?.image === id) {
    const header = { ...meta.header };
    delete header.logo;
    meta.header = header;
  }
  return {
    ...project,
    meta,
    pages: project.pages.map((page) => ({
      ...page,
      sections: page.sections.map((s) => strip(dropEmptyPictures(s), id) as Section),
    })),
    assets: project.assets.filter((a) => a.id !== id),
  };
}

/** Total bytes of all uploaded files. */
export function assetBytes(project: Project): number {
  return project.assets.reduce((sum, a) => sum + a.size, 0);
}

/** Size in plain words: "840 KB", "12.5 MB". */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
