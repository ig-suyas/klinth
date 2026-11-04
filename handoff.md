# Handoff

## Phase status

| Phase                        | Status      |
| ---------------------------- | ----------- |
| 0 Scaffold and architecture  | done        |
| 1 Core engine                | done        |
| 2 Blocks and templates       | not started |
| 3 Editor UI                  | not started |
| 4 Media, embeds, custom code | not started |
| 5 AI Worker, key vault, AI   | not started |
| 6 GitHub connect, export     | not started |
| 7 Hardening                  | not started |
| 8 Deploy, launch, push       | not started |

## 1. Current state

Phase 1 done. `packages/core` has the versioned Zod schema, migrations hook, tokens, `renderSite()`,
exporter, ZIP builder and project-file import/export with a secret guard. Editor has IndexedDB
persistence and download/import helpers (no UI yet). `npm run check` green: 43 tests total
(core 36, editor 4, templates 1, api 2). Sample project exports to a static site that opens offline
(all relative paths, no remote CSS/JS/fonts).

## 2. Goal

Next: Phase 2, the v1 blocks with real props and the 2 premium templates (Lighthouse 95+, visual
snapshot tests). Overall: free, no-login visual site builder exporting plain HTML repos at ₹0.

## 3. Files

- `packages/core/src/schema.ts` : Project/Page/Section/Asset Zod schemas, `BLOCK_TYPES`, `SCHEMA_VERSION`
- `packages/core/src/migrations.ts` : `runMigrations` (pure steps), `migrateProject`, `ProjectError`
- `packages/core/src/tokens.ts` : theme schema (hex colors, closed font-stack list), `themeToCss`
- `packages/core/src/html.ts` : `escapeHtml`, `safeUrl` (https/mailto/tel/#anchor only)
- `packages/core/src/render.ts` : `renderSite`, block renderers (basic markup), base CSS, site JS
- `packages/core/src/export.ts` : `buildExport` (3.6 layout + README) and `buildZip` (fflate, deterministic)
- `packages/core/src/project-file.ts` : `serializeProject`/`parseProjectFile`, `containsSecret`
- `packages/core/src/sample.ts` : hard-coded 2-page sample project (fixture)
- `apps/editor/src/lib/storage.ts` : idb stores `projects` and `assets` ([projectId, assetId] → Uint8Array)
- `apps/editor/src/lib/files.ts` : download project file / site ZIP, import project file

## 4. What worked

- Deps: zod 4.6.7, fflate 0.8.3, idb 8.0.4, fake-indexeddb (dev, editor tests).
- Core has no DOM/Node types, so `safeUrl` uses explicit regexes instead of `URL`.
- Schema is `.strict()` everywhere: unknown fields (e.g. `geminiKey`) are rejected; ids, colors, slugs
  are regex-checked so nothing can break out of HTML attributes or CSS.
- Pages export as `index.html` / `<slug>.html` at root so relative links work over `file://`.
- ZIP uses a fixed mtime, so the same project gives byte-identical ZIPs (useful for Phase 6 parity).

## 5. What didn't work

- Storing `Blob` in fake-indexeddb under jsdom loses `arrayBuffer()`; assets are stored as `Uint8Array`.
- ESLint `no-control-regex` blocks `\u0000` ranges; control chars are checked with `charCodeAt`.
- sed with backslashes from Bash on Windows is unreliable; use the Edit tool for regex-heavy edits.

## 6. What is still left to do

1. Phase 2: give each block a typed props schema (props are generic JSON now, read defensively).
2. `video` and `customCode` render placeholders only (Phase 4). Exported-site CSP meta not added yet
   (check `'self'` behaviour over `file://` before adding; prompt 5.5).
3. `containsSecret` flags any prop named `token`/`secret`/`password`; block props must avoid those names.
4. Before Phase 5: verify Cloudflare free limits and a current free-tier Gemini model.
5. Playwright arrives in Phase 3. `npm audit`: moderate minimatch advisory in ESLint (dev only).
