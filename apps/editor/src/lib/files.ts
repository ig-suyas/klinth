import {
  buildExport,
  buildZip,
  parseProjectFile,
  serializeProject,
  type Project,
} from '@klinth/core';

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

export function downloadSiteZip(project: Project, assets: ReadonlyMap<string, Uint8Array>): void {
  const zip = buildZip(buildExport(project, assets));
  downloadFile(
    `${fileSlug(project.meta.title)}.zip`,
    zip as Uint8Array<ArrayBuffer>,
    'application/zip',
  );
}

/** Reads a project file the user picked. Throws ProjectError with a plain message. */
export async function importProjectFile(file: Blob): Promise<Project> {
  return parseProjectFile(await file.text());
}
