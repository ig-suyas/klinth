import { strFromU8, unzipSync } from 'fflate';
import { MAX_VIDEO_BYTES } from './media.ts';
import { ProjectError } from './migrations.ts';
import { MAX_PROJECT_FILE_BYTES, parseProjectFile } from './project-file.ts';
import { assetPath } from './render.ts';
import type { Project } from './schema.ts';

/** Largest site ZIP Klinth will open. GitHub and Cloudflare Pages sites stay well under this. */
export const MAX_SITE_ZIP_BYTES = 300 * 1024 * 1024;

const PROJECT_FILE = '.klinth/project.json';
/** Pictures are compressed far below this; videos are capped at 25 MB. */
const MAX_ASSET_BYTES = MAX_VIDEO_BYTES + 1024 * 1024;

export interface SiteZipContents {
  project: Project;
  /** File bytes by asset id. */
  assets: Map<string, Uint8Array>;
  /** Names of listed files that were not in the ZIP (the user can upload them again). */
  missing: string[];
}

/**
 * Opens a site ZIP exported by Klinth (or GitHub's "Download ZIP", which puts
 * everything in one top folder) and returns the project with its media.
 * Only `.klinth/project.json` and `assets/*` are read; size limits are checked
 * before anything is unpacked.
 */
export function readSiteZip(zip: Uint8Array): SiteZipContents {
  if (zip.byteLength > MAX_SITE_ZIP_BYTES) {
    throw new ProjectError('This ZIP is too large to open (over 300 MB).');
  }
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip, {
      filter: (file) => {
        const isProject = file.name === PROJECT_FILE || file.name.endsWith(`/${PROJECT_FILE}`);
        const isAsset = /(^|\/)assets\/[^/]+$/.test(file.name);
        if (isProject && file.originalSize > MAX_PROJECT_FILE_BYTES) {
          throw new ProjectError('The project file inside this ZIP is too large (over 5 MB).');
        }
        if (isAsset && file.originalSize > MAX_ASSET_BYTES) {
          throw new ProjectError(`The file ${file.name} inside this ZIP is too large.`);
        }
        return isProject || isAsset;
      },
    });
  } catch (error) {
    if (error instanceof ProjectError) throw error;
    throw new ProjectError('This file is not a ZIP that Klinth can open.');
  }

  const projectNames = Object.keys(entries).filter((n) => n.endsWith(PROJECT_FILE));
  // Exactly one project, either at the top or inside one top folder.
  const projectName = projectNames.find((n) => n.split('/').length <= 3);
  if (!projectName || projectNames.length > 1) {
    throw new ProjectError(
      'This ZIP has no Klinth project inside. Use a ZIP downloaded from Klinth.',
    );
  }
  const prefix = projectName.slice(0, projectName.length - PROJECT_FILE.length);
  const project = parseProjectFile(strFromU8(entries[projectName] ?? new Uint8Array()));

  const assets = new Map<string, Uint8Array>();
  const missing: string[] = [];
  for (const asset of project.assets) {
    const data = entries[`${prefix}${assetPath(asset)}`];
    if (data) assets.set(asset.id, data);
    else missing.push(asset.name);
  }
  return { project, assets, missing };
}
