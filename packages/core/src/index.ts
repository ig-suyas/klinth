/**
 * @klinth/core: project schema, design tokens, renderer and exporter.
 * Shared by the editor and the Worker. Must never depend on the DOM
 * (enforced by tsconfig `lib` without "DOM").
 */

export * from './schema.ts';
export {
  BACKGROUNDS,
  blockPropSchemas,
  type Background,
  type BlockPropSchemas,
  type BlockProps,
  type BlockType,
  type LinkProps,
} from './blocks.ts';
export * from './tokens.ts';
export {
  MIN_TEXT_CONTRAST,
  contrastRatio,
  mixSrgb,
  themeContrastIssues,
  type ContrastIssue,
} from './contrast.ts';
export { escapeHtml, hasControlChar, safeUrl } from './html.ts';
export {
  MAX_DEPTH,
  MIGRATIONS,
  ProjectError,
  assertPlainJson,
  migrateProject,
  runMigrations,
} from './migrations.ts';
export {
  MAX_PROJECT_FILE_BYTES,
  assertNoSecrets,
  containsSecret,
  parseProjectFile,
  serializeProject,
} from './project-file.ts';
export { assetPath, pagePath, renderSite, type RenderOptions, type SiteFile } from './render.ts';
export { buildExport, buildZip } from './export.ts';
export { sampleProject } from './sample.ts';
