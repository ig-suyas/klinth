import { strToU8, zipSync, type Zippable } from 'fflate';
import { serializeProject } from './project-file.ts';
import { assetPath, renderSite, type SiteFile } from './render.ts';
import type { Project } from './schema.ts';
import { ProjectError } from './migrations.ts';

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

## Keep editing

The file \`.klinth/project.json\` holds your project. Import it into Klinth on any device to keep editing.
`;
}

/**
 * Builds every file of the exported repository (section 3.6).
 * `assetData` holds the binary of each asset by id.
 */
export function buildExport(
  project: Project,
  assetData: ReadonlyMap<string, Uint8Array>,
): SiteFile[] {
  const assets = project.assets.map((asset) => {
    const data = assetData.get(asset.id);
    if (!data) throw new ProjectError(`The file "${asset.name}" is missing. Upload it again.`);
    return { path: assetPath(asset), content: data };
  });
  return [
    ...renderSite(project),
    ...assets,
    { path: 'README.md', content: exportReadme(project) },
    { path: '.nojekyll', content: '' },
    { path: '.klinth/project.json', content: serializeProject(project) },
  ];
}

/** Packs files into a ZIP archive. */
export function buildZip(files: readonly SiteFile[]): Uint8Array {
  const tree: Zippable = {};
  for (const file of files) {
    const data = typeof file.content === 'string' ? strToU8(file.content) : file.content;
    // Media is already compressed; storing it avoids wasted work.
    tree[file.path] = [data, { level: typeof file.content === 'string' ? 6 : 0 }];
  }
  return zipSync(tree, { mtime: new Date('2020-01-01T00:00:00Z') });
}
