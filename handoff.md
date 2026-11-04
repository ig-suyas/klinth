# Handoff

## Phase status

| Phase                        | Status                    |
| ---------------------------- | ------------------------- |
| 0 Scaffold and architecture  | done                      |
| 1 Core engine                | done (reviewed, hardened) |
| 2 Blocks and templates       | done                      |
| 3 Editor UI                  | not started               |
| 4 Media, embeds, custom code | not started               |
| 5 AI Worker, key vault, AI   | not started               |
| 6 GitHub connect, export     | not started               |
| 7 Hardening                  | not started               |
| 8 Deploy, launch, push       | not started               |

## 1. Current state

Phase 2 done. Every v1 block has strict typed props (Zod discriminated union). The renderer writes
a premium, responsive, accessible site: sticky header with menu, skip link, hero layouts, numbered
project covers, index list, facts, quotes, link page, contact (mailto, tel, optional form), footer
outside `<main>`, monogram favicon, staggered scroll reveal. Two templates: **portfolio** (light
paper, didone serif, sharp) and **landing** (dark green and saffron, grotesk, rounded, link page).
`npm run check` and `npm run build` green: 307 tests (core 259, templates 27, editor 19, api 2).
`stash@{0}` (old Phase 2 WIP) is now merged by hand and can be dropped.

**Remote:** `origin` = `github.com/ig-suyas/klinth`. Only Phase 0 is pushed; later commits are local.

## 2. Goal

Next: Phase 3, the editor UI (panels, sandboxed preview with click-to-select, inspector, undo/redo,
autosave, template picker, tour, Playwright flow). Overall: free, no-login site builder exporting
plain HTML repos at ₹0.

## 3. Files

- `packages/core/src/blocks.ts` : strict prop schemas per block, `singleLine`, `BlockProps<T>`
- `packages/core/src/schema.ts` : `sectionSchema` is a discriminated union; asset `width`/`height`
- `packages/core/src/render.ts` : page shell, header/menu, h1 rule, footer, monogram favicon
- `packages/core/src/render-blocks.ts` : one renderer per block (`renderBlock` switch)
- `packages/core/src/site-assets.ts` : exported `site.css` and `site.js`
- `packages/core/src/contrast.ts` : `contrastRatio`, `mixSrgb`, `themeContrastIssues` (for editor warnings)
- `packages/core/src/tokens.ts` : 9 font stacks; heading weight/tracking derived from the font
- `packages/core/src/blocks.test.ts` : schema, structure, block and contrast tests
- `packages/templates/src/{portfolio,landing}.ts` : the two templates (`create()` returns a fresh copy)
- `packages/templates/src/blocks.ts` : `blockDefinitions` (plain labels, descriptions, starting props)
- `packages/templates/src/__snapshots__/` : rendered HTML/CSS/JS/favicon snapshots per template

## 4. What worked

- **Lighthouse 12, mobile, both templates: Performance 100, Accessibility 100, Best Practices 100,
  SEO 100.** LCP 0.9 s, CLS 0, TBT 0 ms. Run against the exported files on a local node server with
  Chrome, screenshot audits skipped. The scripts are not in the repo (scratchpad only).
- Headless Chrome (puppeteer-core) at 375 and 1280 px: no horizontal overflow, no console errors,
  every revealed element ends visible; with reduced motion no reveal classes are added at all.
- System font stacks only (no font host, no font files): fast, offline, Lighthouse-friendly.
- First section is never hidden by the reveal (keeps LCP fast); only `.status` and `.actions` get
  a short CSS rise. Menu is a `<details>` (works without JS, no layout jump); JS only closes it.
- Bold-section soft text and card mixes are shared constants (`BOLD_MUTED_MIX` 0.9,
  `BOLD_CARD_MIX` 0.08) used by both the CSS and the contrast check. The default accent moved to
  `#b13a0b` to pass AA there.
- Secrets are now checked **before** schema validation (core `serializeProject` and editor
  `saveProject`), so a key-like prop gets the clear "key or token" message.
- Snapshot folders are ignored by ESLint and Prettier (Prettier would otherwise rewrite them).

## 5. What didn't work

- "Visual snapshot tests" are **text snapshots** of the rendered files (`toMatchFileSnapshot`), not
  pixel screenshots: the owner's global rule forbids generating screenshots unless asked. Add
  Playwright `toHaveScreenshot` only if the owner asks for it.
- The Claude browser pane runs hidden, which stops IntersectionObserver; use headless Chrome for
  motion checks.
- Writing TS source through `node -e` from Bash breaks on template literals and `'`; use Edit.
- Lighthouse warns "no text compression" on the local server only; real hosts compress.

## 6. What is still left to do

1. Phase 3: use `templates[].create()`, `blockDefinitions` and `themeContrastIssues` (warn when a
   color pick is hard to read). The preview needs CSS/JS inlined into `srcdoc` (pages link
   `css/site.css` and `js/site.js`). Real-browser storage checks from the Phase 1 list still apply
   (quota, eviction, private mode, multi-tab, `BroadcastChannel`, reload on `conflict`).
2. Props changed from loose JSON to strict schemas without a version bump (no users yet). After
   launch, any prop change needs a migration.
3. `video` and `customCode` still render placeholders (Phase 4). Decide on SVG uploads in Phase 4.
4. Images have no `srcset` yet; Phase 4 compression should write sizes (`width`/`height` exist).
5. CSP still deferred to Phase 7 (exported-site meta and editor `_headers`).
6. Before Phase 5: verify Cloudflare free limits and a current free-tier Gemini model.
