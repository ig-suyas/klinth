# Handoff

## Phase status

| Phase                        | Status                    |
| ---------------------------- | ------------------------- |
| 0 Scaffold and architecture  | done                      |
| 1 Core engine                | done (reviewed, hardened) |
| 2 Blocks and templates       | done                      |
| 3 Editor UI                  | done                      |
| 4 Media, embeds, custom code | done                      |
| 5 AI Worker, key vault, AI   | not started               |
| 6 GitHub connect, export     | not started               |
| 7 Hardening                  | not started               |
| 8 Deploy, launch, push       | not started               |

## 1. Current state

Phase 4 done. Pictures: upload (JPG/PNG/WebP/GIF, checked by first bytes; SVG refused), resized to
2000 px wide and compressed to WebP in the browser (small GIFs kept to stay animated). Videos:
MP4/WebM only, hard cap 25 MiB with a "use YouTube or Vimeo" hint. "Pictures and videos" window
(top bar, also the picker from the inspector): upload, drag and drop, size, "used in N places",
delete with confirm + Undo, repo-size warning over 60 MB. Video block: YouTube/Vimeo link (strict
id parsing, embed code refused with its own message) rendered as a click-to-load facade that
falls back to a plain link, or an uploaded `<video>`. Custom code block with trust notice, 200 KB
limit; inline on export, nested `sandbox="allow-scripts"` frame in the preview. `npm run check`
and `npm run build` green: 390 unit tests (core 303, templates 27, editor 58, api 2). `npm run
e2e`: 5 Playwright tests green (media flow incl. exported site opened from disk, sandbox attack).

**Remote:** `origin` = `github.com/ig-suyas/klinth`. Only Phase 0 is pushed; later commits are local.

## 2. Goal

Next: Phase 5 (key vault, `/ai/generate` Worker with the private skill from KV, rate limiter, AI
panel, quota banner, "Test my key"). Overall: free, no-login site builder exporting plain HTML
repos at ₹0.

## 3. Files

- `packages/core/src/embed.ts` : `parseVideoUrl` (YouTube/Vimeo id only), player/page URLs
- `packages/core/src/media.ts` : `MAX_VIDEO_BYTES`, `REPO_WARN_BYTES`, `assetUsage`,
  `removeAsset`, `sectionAssetIds`, `formatBytes`
- `packages/core/src/render-blocks.ts` : video facade/file, custom code; `preview` option marks
  files `data-k-asset` (no src) and sandboxes code. `site-assets.ts`: video CSS, facade loader JS
- `apps/editor/src/media/process.ts` : sniffing, resize/compress, video checks (pure + canvas)
- `apps/editor/src/media/files.ts` : Blob cache, `uploadFile`, `useAssetUrl`, `useLibrary` store
- `apps/editor/src/media/MediaLibrary.tsx` : "Pictures and videos" window and picker
- `apps/editor/src/inspector/MediaFields.tsx` : picture (+ description), video, code fields
- `apps/editor/src/lib/storage.ts` : `loadAsset`, `pruneAssets` (unused files older than 1 day)
- `apps/editor/src/preview/bridge.ts` : receives `assets` Blobs, fits code frames, capture click
- `apps/editor/e2e/media.spec.ts` : media/embed/export flow and sandbox attack test
- Earlier: `state/store.ts`, `state/sections.ts`, `preview/document.ts`, `inspector/fields.ts`,
  `panels/*`, `ui/*`, `e2e/editor.spec.ts`; `.claude/launch.json` (untracked)

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
- Preview files: the editor posts Blobs to the frame on `ready`; the opaque-origin frame makes its
  own `blob:` URLs. Works in Chrome; avoids huge data URLs in `srcdoc` on every keystroke.
- Picking a new upload adds the asset and sets the prop in one `change` (one undo step). Binaries
  stay in IndexedDB until a later open prunes unused ones, so Undo after delete works.
- Bridge click handler runs in the capture phase and the site script skips `defaultPrevented`
  clicks, so the preview never loads YouTube/Vimeo players (they fail inside the sandbox anyway).
- Sandbox test proves: editor DOM, preview DOM, localStorage and cookies blocked; fake `edit`
  messages from code are ignored (editor checks `event.source`).

## 5. What didn't work

- Playwright does not map clicks through CSS transforms on iframes, so clicks in the scaled preview
  miss. E2E runs at a 2000 px wide viewport (no scaling). Real users are not affected.
- Clicking inside the preview from the Claude browser pane needs coordinate clicks, which need a
  screenshot (owner rule: none). Use Playwright for anything inside the frame.
- Writing ` `-style escapes through the Write/Edit tools turns them into raw characters; use
  `String.fromCharCode` instead (see `scriptJson` in `preview/document.ts`).
- Python edits on Windows write CRLF; run Prettier after them.
- jsdom never fires `loadedmetadata`; video tests use fake timers for the 5 s fallback.
- Playwright clicked the old section's inspector while it faded out (AnimatePresence `wait`), so
  an upload went to the wrong section. Tests now wait for the new panel. A very fast real user
  could hit the same 180 ms window; consider `inert` on the exiting panel.

## 6. What is still left to do

1. Phase 5: AI-generated custom code must need an explicit confirm (3.4). Verify Cloudflare free
   limits and a current free-tier Gemini model first.
2. Phase 6: a re-imported project file has no media bytes (export then says a file is missing).
   Decide: include `assets/` when re-importing a repo, or ask to re-upload. Unused files are
   still exported (the library shows "Not used yet").
3. Phase 7: editor CSP must allow inline `<style>`/`<script>` in the `srcdoc` frame plus `blob:`
   images/media; consider a separate preview origin. Bundle is 599 kB (191 kB gzip): split Motion/
   Zod or lazy-load. Storage checks in a real browser: quota, eviction, private mode. Lighthouse
   was not re-run after the video CSS/JS (small); re-run on both templates.
4. Item-level inline editing (project titles, quotes) is inspector-only.
5. Props changed without a version bump (no users yet). After launch, any prop change needs a
   migration. `stash@{0}` (old Phase 2 WIP) can be dropped.
