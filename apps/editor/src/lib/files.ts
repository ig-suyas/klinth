import {
  MAX_PROJECT_FILE_BYTES,
  MAX_SITE_ZIP_BYTES,
  ProjectError,
  buildExport,
  buildZip,
  parseProjectFile,
  readSiteZip,
  serializeProject,
  type Project,
  type SiteFile,
} from '@klinth/core';
import { loadFontData } from './fonts.ts';

/** Starts a browser download for in-memory bytes or text. */
export function downloadFile(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function fileSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'my-site'
  );
}

export function downloadProjectFile(project: Project): void {
  downloadFile(
    `${fileSlug(project.meta.title)}.klinth.json`,
    serializeProject(project),
    'application/json',
  );
}

/**
 * Every file of the finished site. The ZIP download and the GitHub push both
 * use this one list, so they always hold the same files, byte for byte.
 */
export async function exportFiles(
  project: Project,
  assets: ReadonlyMap<string, Uint8Array>,
): Promise<SiteFile[]> {
  return buildExport(project, assets, await loadFontData(project.theme));
}

export async function downloadSiteZip(
  project: Project,
  assets: ReadonlyMap<string, Uint8Array>,
): Promise<void> {
  const zip = buildZip(await exportFiles(project, assets));
  downloadFile(
    `${fileSlug(project.meta.title)}.zip`,
    zip as Uint8Array<ArrayBuffer>,
    'application/zip',
  );
}

/** Reads a project file the user picked. Throws ProjectError with a plain message. */
export async function importProjectFile(file: Blob): Promise<Project> {
  // Check the byte size first so a huge file is never read into memory.
  if (file.size > MAX_PROJECT_FILE_BYTES) {
    throw new ProjectError('This project file is too large (over 5 MB).');
  }
  return parseProjectFile(await file.text());
}

export interface ImportedProject {
  project: Project;
  /** File bytes by asset id (only from a site ZIP). */
  assets: Map<string, Uint8Array>;
  /** Pictures and videos the project lists but the import did not include. */
  missing: string[];
}

/** ZIP files start with the bytes "PK" 3 4 (or "PK" 5 6 when empty), whatever their name. */
async function isZip(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b && (head[2] === 3 || head[2] === 5);
}

/**
 * Opens a project file (`.klinth.json` / `.klinth/project.json`) or a site ZIP
 * exported by Klinth. A ZIP also brings back the pictures and videos.
 */
export async function importAnyFile(file: Blob): Promise<ImportedProject> {
  if (await isZip(file)) {
    if (file.size > MAX_SITE_ZIP_BYTES) {
      throw new ProjectError('This ZIP is too large to open (over 300 MB).');
    }
    return readSiteZip(new Uint8Array(await file.arrayBuffer()));
  }
  const project = await importProjectFile(file);
  return { project, assets: new Map(), missing: project.assets.map((a) => a.name) };
}

/** A short, plain note about files the user needs to upload again, or null. */
export function missingFilesNote(missing: readonly string[]): string | null {
  if (missing.length === 0) return null;
  const what =
    missing.length === 1 ? '1 picture or video was' : `${missing.length} pictures or videos were`;
  return `${what} not included. Upload again in "Pictures and videos".`;
}
