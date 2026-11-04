# Handoff

## Phase status

| Phase                        | Status                    |
| ---------------------------- | ------------------------- |
| 0 Scaffold and architecture  | done                      |
| 1 Core engine                | done (reviewed, hardened) |
| 2 Blocks and templates       | done                      |
| 3 Editor UI                  | done                      |
| 4 Media, embeds, custom code | not started               |
| 5 AI Worker, key vault, AI   | not started               |
| 6 GitHub connect, export     | not started               |
| 7 Hardening                  | not started               |
| 8 Deploy, launch, push       | not started               |

## 1. Current state

Phase 3 done. The editor works end to end: start screen (template cards with live thumbnails,
saved projects, open a project file), editor with top bar (all projects, page picker, computer /
tablet / phone preview, undo/redo with Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, save status, Export menu:
ZIP or project file), left sections list (drag reorder with Motion `Reorder`, up/down, duplicate,
delete with an Undo notice, "Add a section"), center sandboxed preview (click to select, click the
text again to type in place, Enter saves, Escape cancels), right inspector (section fields from
the block schemas, or "Site style": name, description, 4 ready-made palettes, 6 colors with
contrast warnings, fonts, roundness, spacing). Autosave, first-run tour, phone notice, error
boundary. `npm run check` and `npm run build` green: 336 unit tests (core 261, templates 27,
editor 46, api 2). `npm run e2e`: 3 Playwright tests green (full flow incl. ZIP contents, Escape,
drag).

**Remote:** `origin` = `github.com/ig-suyas/klinth`. Only Phase 0 is pushed; later commits are local.

## 2. Goal

Next: Phase 4 (image upload and compression, 25 MB videos, asset manager, repo-size warning,
YouTube/Vimeo facade, Custom code block with sandboxed preview and trust notice). Overall: free,
no-login site builder exporting plain HTML repos at ₹0.

## 3. Files

- `packages/core/src/render.ts`, `render-blocks.ts` : `renderSite(project, { editable })` adds
  preview-only `data-k-section` / `data-k-field` (exports unchanged; snapshots untouched)
- `apps/editor/src/state/store.ts` : Zustand store, validated `change()`, undo/redo, notices
- `apps/editor/src/state/sections.ts` : pure section ops (add, duplicate, delete, move, reorder)
- `apps/editor/src/state/useAutosave.ts` : queued autosave, `flushSave()`, BroadcastChannel conflicts
- `apps/editor/src/preview/{document,bridge,Preview}.ts(x)` : srcdoc builder, frame script, frame
- `apps/editor/src/inspector/fields.ts` : plain-language field specs; limits read from schemas
- `apps/editor/src/inspector/{Inspector,Fields,ThemePanel}.tsx` : right panel controls
- `apps/editor/src/panels/{TopBar,SectionsPanel}.tsx`, `StartScreen.tsx`, `Editor.tsx`, `App.tsx`
- `apps/editor/src/ui/{Icon,Tour,Notice}.tsx` : own SVG icon set, tour, notice bar
- `apps/editor/e2e/editor.spec.ts`, `playwright.config.ts` : Playwright flow (`npm run e2e`)
- `.claude/launch.json` (untracked) : dev server entry for the Claude browser pane

## 4. What worked

- Playwright uses the installed Chrome locally (`channel: 'chrome'`, no browser download); CI runs
  `npx playwright install --with-deps chromium` then `npm run e2e`.
- Desktop preview renders at 1280 px and is scaled down to fit (1440 px window: scale 0.59).
- Preview reloads `srcdoc` 120 ms after a change, restores scroll, and turns off the scroll reveal
  after the first load so edits do not flicker.
- Field specs are checked against schemas by tests (every prop shown or listed as later/unused,
  choices equal enum options, new list items valid). The tests caught hero `intro` (not rendered,
  now hidden) and new links defaulting to an invalid `https://` (now empty).
- Links keep an invalid draft locally and only save valid addresses (`javascript:` never saved).

## 5. What didn't work

- Playwright does not map clicks through CSS transforms on iframes, so clicks in the scaled preview
  miss. E2E runs at a 2000 px wide viewport (no scaling). Real users are not affected.
- Clicking inside the preview from the Claude browser pane needs coordinate clicks, which need a
  screenshot (owner rule: none). Use Playwright for anything inside the frame.
- Writing ` `-style escapes through the Write/Edit tools turns them into raw characters; use
  `String.fromCharCode` instead (see `scriptJson` in `preview/document.ts`).
- Python edits on Windows write CRLF; run Prettier after them.

## 6. What is still left to do

1. Phase 4: "Add a section" hides gallery, video and custom code (`ADDABLE_BLOCKS` in
   `inspector/fields.ts`), and the inspector hides `image`, `imageAlt`, `images`, `code`
   (`LATER_PROPS`). Turn them on with the media work. The preview frame cannot load blob URLs of the
   editor origin reliably; inline images as data URLs or pass bytes via postMessage.
2. Phase 7: editor CSP must allow inline `<style>`/`<script>` inside the `srcdoc` frame (it inherits
   the editor CSP); consider a hash or a separate preview origin. Bundle is 571 kB (182 kB gzip);
   split Motion/Zod or lazy-load the editor. Storage checks still to do in a real browser: quota,
   eviction, private mode.
3. Item-level inline editing (project titles, quotes) is inspector-only; top-level text fields are
   editable in place. Add more `data-k-field` paths later if users want it.
4. Props changed to strict schemas without a version bump (no users yet). After launch, any prop
   change needs a migration. `stash@{0}` (old Phase 2 WIP) can be dropped.
5. Before Phase 5: verify Cloudflare free limits and a current free-tier Gemini model.
