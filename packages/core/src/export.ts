import { strToU8, zipSync, type Zippable } from 'fflate';
import { serializeProject } from './project-file.ts';
import { fontPath, themeFonts } from './fonts.ts';
import { assetPath, renderSite, type SiteFile } from './render.ts';
import type { Project } from './schema.ts';
import { ProjectError } from './migrations.ts';

function hasCustomCode(project: Project): boolean {
  return project.pages.some((page) =>
    page.sections.some((s) => s.type === 'customCode' && (s.props.code ?? '').trim() !== ''),
  );
}

function exportReadme(project: Project): string {
  return `# ${project.meta.title}

This folder is a complete website. It is plain HTML, CSS and JavaScript, so any static host works.

## Put it online with GitHub Pages

1. Create a new repository on github.com and upload every file in this folder.
2. Open the repository's Settings, then Pages.
3. Under "Branch", pick \`main\` and the \`/ (root)\` folder, then Save.
4. After a minute your site is live at the address GitHub shows.

## Put it online with Cloudflare Pages

1. Sign in at dash.cloudflare.com and open Workers & Pages.
2. Choose Create, then Pages, then "Upload assets".
3. Drag this folder in and deploy. No build settings are needed.

${
  hasCustomCode(project)
    ? `## About your custom code

This site contains code you pasted into a Custom code section. It runs exactly as pasted, so
only keep code you trust. Because of it, the site does not set a strict Content-Security-Policy.

`
    : ''
}## Keep editing

The file \`.klinth/project.json\` holds your project. Import it into Klinth on any device to keep editing.
`;
}

/**
 * Builds every file of the exported repository (section 3.6).
 * `assetData` holds the binary of each asset by id; `fontData` each bundled
 * font file by file name (the editor loads them; core has no binaries).
 */
export function buildExport(
  project: Project,
  assetData: ReadonlyMap<string, Uint8Array>,
  fontData: ReadonlyMap<string, Uint8Array>,
): SiteFile[] {
  const assets = project.assets.map((asset) => {
    const data = assetData.get(asset.id);
    if (!data) throw new ProjectError(`The file "${asset.name}" is missing. Upload it again.`);
    return { path: assetPath(asset), content: data };
  });
  const fonts = themeFonts(project.theme).map((font) => {
    const data = fontData.get(font.file);
    if (!data) throw new ProjectError(`The font "${font.family}" could not be loaded. Try again.`);
    return { path: fontPath(font), content: data };
  });
  return [
    ...renderSite(project),
    ...assets,
    ...fonts,
    { path: 'README.md', content: exportReadme(project) },
    { path: '.nojekyll', content: '' },
    { path: '.klinth/project.json', content: serializeProject(project) },
  ];
}

/** A relative path of plain segments: no `..`, no leading `/`, no backslashes or drive letters. */
const SAFE_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$|^\.[A-Za-z0-9_-]+$/;

function assertSafePaths(files: readonly SiteFile[]): void {
  const seen = new Set<string>();
  for (const { path } of files) {
    const segments = path.split('/');
    if (!segments.every((s) => SAFE_SEGMENT.test(s) && !s.includes('..'))) {
      throw new ProjectError(`The export has an unsafe file name: ${path}`);
    }
    // Case-insensitive: Windows and macOS treat `A.html` and `a.html` as one file.
    const key = path.toLowerCase();
    if (seen.has(key)) throw new ProjectError(`The export has two files named ${path}`);
    seen.add(key);
  }
}

/**
 * DOS timestamps in ZIP files are written from *local* time fields, so the date
 * is built from local parts on every call: any time zone writes the same bytes.
 */
const fixedMtime = (): Date => new Date(2020, 0, 1, 0, 0, 0);
/** Unix "made by" with a regular file, mode rw-r--r--. */
const UNIX = 3;
const FILE_ATTRS = 0o100644 << 16;

/** Packs files into a ZIP archive. Same files in give the same bytes out. */
export function buildZip(files: readonly SiteFile[]): Uint8Array {
  assertSafePaths(files);
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const mtime = fixedMtime();
  const tree: Zippable = {};
  for (const file of sorted) {
    const isText = typeof file.content === 'string';
    const data = typeof file.content === 'string' ? strToU8(file.content) : file.content;
    // Media is already compressed; storing it avoids wasted work.
    tree[file.path] = [data, { level: isText ? 6 : 0, mtime, os: UNIX, attrs: FILE_ATTRS }];
  }
  return zipSync(tree, { mtime, os: UNIX, attrs: FILE_ATTRS });
}
