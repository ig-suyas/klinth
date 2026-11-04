/**
 * @klinth/core: project schema, design tokens, renderer and exporter.
 * Shared by the editor and the Worker. Must never depend on the DOM
 * (enforced by tsconfig `lib` without "DOM").
 */

export * from './schema.ts';
export {
  BACKGROUNDS,
  MAX_CUSTOM_CODE,
  blockPropSchemas,
  type Background,
  type BlockPropSchemas,
  type BlockProps,
  type BlockType,
  type LinkProps,
} from './blocks.ts';
export * from './tokens.ts';
export {
  BUNDLED_FONTS,
  FONTS_DIR,
  fontFaceCss,
  fontLicense,
  fontPath,
  themeFonts,
  type FontFile,
} from './fonts.ts';
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
export {
  MAX_EMBED_URL_LENGTH,
  PROVIDER_NAME,
  embedPageUrl,
  embedPlayerUrl,
  looksLikeEmbedCode,
  parseVideoUrl,
  type VideoEmbed,
  type VideoProvider,
} from './embed.ts';
export {
  MAX_VIDEO_BYTES,
  REPO_WARN_BYTES,
  assetBytes,
  assetUsage,
  formatBytes,
  keepAssetRefs,
  removeAsset,
  sectionAssetIds,
} from './media.ts';
export * from './ai.ts';
export { sampleProject } from './sample.ts';
