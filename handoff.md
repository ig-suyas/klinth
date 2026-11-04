# Handoff

## Phase status

| Phase                        | Status                                |
| ---------------------------- | ------------------------------------- |
| 0 Scaffold and architecture  | done                                  |
| 1 Core engine                | done (reviewed, hardened)             |
| 2 Blocks and templates       | done                                  |
| 3 Editor UI                  | done                                  |
| 4 Media, embeds, custom code | done                                  |
| 5 AI Worker, key vault, AI   | done (owner to review the skill text) |
| 5.5 Blank start, multi-page  | done                                  |
| 6 GitHub connect, export     | done (live push needs owner's app)    |
| 7 Hardening                  | done                                  |
| 8 Deploy, launch, push       | not started                           |

## 1. Current state

**Phase 7 (hardening):** Report in `security-report.md` (0 open high/critical). Editor CSP and
headers from `apps/editor/src/security/headers.ts` → `dist/_headers` on build and sent by
`vite preview`; Playwright now runs on the production build (port 4173) under that policy.
Preview redesign forced by CSP: `srcdoc` inherits the parent's CSP, so the preview frame loads
`public/preview.html` once (own looser CSP, `frame-ancestors 'self'`) and the editor posts each
redraw; the shell shows it in a fresh inner `srcdoc` frame (title "Your site"), so redraws need
no network (works offline). Bridge talks to `window.top`; editor accepts `host` only from the
shell, the rest only from the inner frame. Worker bodies read with a streaming cap
(`readCappedText`). Bundle: Editor and StartScreen lazy (`React.lazy`), editor prefetched from the
start screen; first visit ~180 kB gzip JS (was 212), main 126 kB (react-dom + zod + core + fflate).
Error boundary also around the start screen, plain "could not finish loading" for chunk errors,
logs only error name/message. Data loss: `lib/safety.ts` (`navigator.storage.persist()`,
backup timestamp per project set by project-file/ZIP download and GitHub publish, reminder after
15 edits with no backup or one older than 7 days, 28 when storage is kept), "You are offline"
banner, `beforeunload` also on a failed save (`ui/SafetyBanners.tsx`). Legal: `public/terms.html`,
`privacy.html`, `legal.css`, linked from the start screen footer and the AI helper window
(drafts, lawyer review needed). Accessibility: axe (`@axe-core/playwright`) on start screen, both
templates in the editor and legal pages: 0 serious/critical (WCAG 2.1 AA tags). Tests: 566 unit
(core 360, templates 27, editor 123, api 56) and 16 e2e (new `security`, `a11y`, `offline`).

**Phase 6 (GitHub, export polish):** Export menu has "Publish to GitHub". Dialog: repo name
(suggested from the title, remembered per project in localStorage, name only), New / "One I
published before", "Turn on GitHub Pages" (on by default, off for private), "Make private".
Scope is `public_repo`, or `repo` only when Pages or private is chosen (Pages API needs `repo`).
Sign-in: OAuth + PKCE S256 + random state in a popup opened inside the click; callback page
`public/github-callback.html` (+ `.js`, no inline script) sends `{code,state}` over a same-origin
`BroadcastChannel('klinth-github')` (works even if GitHub's COOP cuts `window.opener`). Worker
`GET /github/config` (public client id or null) and `POST /github/oauth` (Origin check, burst guard,
Zod, redirect must be `<allowed origin>/github-callback.html`, fixed upstream, 15 s timeout, logs
`{route,outcome}` only). Token: zustand memory only; gone on reload; "Disconnect" button.
Push (`github/api.ts`): create repo with `auto_init` (Git Data API can't write to an empty repo) or
update one that already has `.klinth/project.json` (refuses other repos); local Git blob SHA-1 per
file; unchanged files reuse the existing sha, text goes inline in the tree, binaries/empty files
via `/git/blobs` one at a time (returned sha must match); tree without `base_tree` (stale files
removed); commit; ref PATCH `force:false`; then reads the tree back and requires every path+sha to
equal the local set (proves push == ZIP); Pages POST (409 = already on). Plain errors: signed out
(401, clears session), name taken (offers "Update that repository instead"), not found, not Klinth,
slow down (403 rate limit / 429 / retry-after), offline, mismatch, Stop (AbortSignal, branch only
moves at the end). ZIP polish: unused uploads are left out of the files _and_ the exported
project.json (`exportedProject`); README adds "Change your site later" and a folder guide.
Re-import: "Open a project file or site ZIP" (ZIP detected by `PK` bytes, not name). `readSiteZip`
reads only `.klinth/project.json` + `assets/*` (also inside one top folder, e.g. GitHub's
"Download ZIP"), size caps checked before unpacking, media saved before the project; a project
file alone shows "n pictures or videos were not included. Upload again…". Tests: 550 unit (core
360, templates 27, editor 109, api 54) and 9 e2e (new `e2e/github.spec.ts`: popup sign-in → push →
Pages → pushed files == ZIP bytes → token absent from localStorage/sessionStorage/IndexedDB and the
project → gone after reload; ZIP re-import round-trip is byte-identical).
**Not yet done:** a live push to real GitHub (needs the owner's OAuth app, see section 6).

**Phase 5.5 (blank start, pages):** "Start blank" card next to the two templates (`blankProject()`
in core: one empty home page, default theme). New "Pages" panel above Sections: switch, add (asks
for a name), rename, move up/down, delete (with Undo notice), "n of 50", and a "Show a menu of all
pages at the top" checkbox (`meta.pageMenu`, optional, off = header lists named sections only).
Core `pages.ts`: `slugify` (NFKD, ASCII, max 60, fallback `page`), `uniqueSlug` (case-insensitive,
skips reserved `index assets css js fonts readme` and Windows device names, `-2`, `-3`...),
`addPage` (cap `MAX_PAGES` = 50), `renamePage` (address follows the name; every `href` to the old
page is rewritten, anchors kept; home stays `index.html`), `deletePage` (never the home page or the
last page; links to it become empty, so they render as text), `movePage` (home always first).
Schema: max 50 pages, home must be first, and any page link (`about.html`, `index.html#x`) must
point to an existing page. `safeUrl` now allows page links (still no paths, `..` or other files).
Link fields suggest page files. Export/ZIP/project file need no change: same 5 MB file limit, safe
path check and case-insensitive duplicate check; a 50-page ZIP round-trip is tested. Tests: 498 unit
(core 351, templates 27, editor 77, api 43) and 7 e2e (new `e2e/pages.spec.ts`). Phase 1 tests
updated on purpose: `page.html` is now an allowed link, page limit test uses 51.

Phase 5 done. Key vault (PBKDF2-SHA-256 600k → AES-GCM, only ciphertext/salt/IV in localStorage,
key in memory only, optional 30 min auto-lock, Forget, Test my key, honest note). "Remember" can be
unticked to keep the key for the tab only. AI helper: sparkle button on every section row and
"Ask AI" in the inspector open an inline panel ("What do you want?", idea chips, Stop, Undo
notice). AI-written custom code needs "I have read this code and I trust it". Quota banner over
the preview. "AI helper" window in the top bar. Worker `/ai/generate` and `/ai/test` with Origin
check, 64 KB cap, Zod, burst guard + Durable Object bucket (30/h per IP, `Retry-After`),
extraction refusal, skill from KV, Gemini Interactions API, Zod on output, skill-echo guard, file-id
filter. `npm run check` and `npm run build` green: 453 unit tests (core 308, templates 27, editor
75, api 43). `npm run e2e`: 6 Playwright tests green (new `e2e/ai.spec.ts`, Worker mocked). Also
checked by hand: editor in the browser → local `wrangler dev` Worker (real DO, rate limit binding,
local KV) → live Gemini with a made-up key → plain "key not accepted" message; logs show only
`{route, outcome}`.

**Design pass (after owner feedback, /frontend):** bundled open-license fonts (OFL, latin subset,
self-hosted, no font host): portfolio Fraunces + Instrument Sans, business Bricolage Grotesque +
Figtree, editor UI Fraunces + Instrument Sans. Exports add `fonts/*.woff2` (~60-70 KB per site),
`fonts/LICENSE.txt` and a heading-font preload. The preview gets fonts as cached `data:` URLs (no
flash on reload, works in the script-free thumbnails). Template header blur removed; scroll reveal
is now a mask reveal for media plus a short fade for text. AI panel is an "ink" surface
(`.surface-ink` swaps tokens) with a designed writing state, a result state listing what changed
("Changed: Heading.") and inline Undo; how-it-works steps in the AI helper window. Measured: AI
panel text contrast at least 8.4:1, fields 14:1. Tests now 460 unit (core 313, templates 27,
editor 77, api 43) and 6 e2e (ZIP holds real WOFF2 files; preview frame has Fraunces loaded).

**Skill:** rewritten to the /frontend standard (about 1,030 words, ~1,400 tokens) at
`workers/api/skill/skill.md` (git-ignored): request reading, voice, lengths, truth rules, a playbook
per block, rhythm, custom code rules. Examples are kept under 8 words so the echo guard never blocks
them. **Owner should review it.** Local KV: `npm run skill:local -w @klinth/api`.

**Remote:** `origin` = `github.com/ig-suyas/klinth`. Only Phase 0 is pushed; later commits are local.

## 2. Goal

Next: Phase 8 (deploy, launch checks, push). Before it, optionally the owner's live GitHub push test (section 6). Overall: free, no-login site builder exporting plain HTML
repos at ₹0.

## 3. Files

- `workers/api/src/github.ts` (+ test) : `/github/config`, `/github/oauth` code→token exchange
- `workers/api/.dev.vars.example` : local GitHub app id/secret names
- `apps/editor/src/github/oauth.ts` (+ test) : PKCE, popup, BroadcastChannel, memory-only session
- `apps/editor/src/github/api.ts` (+ test with a fake GitHub keeping real blob ids) : push, Pages
- `apps/editor/src/github/GitHubDialog.tsx` : publish dialog (form, progress, done)
- `apps/editor/public/github-callback.html`, `.js` : OAuth callback page
- `apps/editor/src/lib/files.ts` : `exportFiles` (one list for ZIP and push), `importAnyFile`
- `packages/core/src/site-zip.ts` (+ test) : `readSiteZip`; `export.ts` : `exportedProject`,
  `siteFileBytes`, README text
- `apps/editor/e2e/github.spec.ts` : push and ZIP re-import end to end
- `packages/core/src/ai.ts` : shared AI contract (request/response/error schemas, limits, header)
- `packages/core/src/media.ts` : `keepAssetRefs` (drops file ids the AI invented)
- `workers/api/src/ai.ts` : `/ai/generate`, `/ai/test` handlers, rate-limit wiring, outcome logs
- `workers/api/src/gemini.ts` : Interactions API call, retries, error mapping, Zod→Gemini schema
- `workers/api/src/prompt.ts` : public fixed rules + private skill + section input
- `workers/api/src/guard.ts` : extraction refusal, 8-word skill-echo guard
- `workers/api/src/rate-limit.ts` : pure token bucket + `RateLimiter` Durable Object
- `workers/api/src/http.ts` : CORS, JSON helpers, plain messages and statuses per error code
- `workers/api/wrangler.jsonc` : vars (model, thinking), KV (placeholder id), DO + migration, BURST
- `apps/editor/src/ai/vault.ts`, `store.ts`, `api.ts` : vault, in-memory key state, Worker client
- `apps/editor/src/ai/KeyForms.tsx`, `AiSettings.tsx`, `AiPanel.tsx`, `QuotaBanner.tsx` : UI
- `apps/editor/e2e/ai.spec.ts` : key → ask → unlock after reload → quota banner → forget
- `packages/core/src/fonts.ts`, `font-license.ts`, `test-fonts.ts` : bundled font list, @font-face,
  OFL licence text, stand-in bytes for tests. `buildExport` now takes font bytes (3rd argument)
- `apps/editor/src/lib/fonts.ts` : font URLs (fontsource packages), bytes for export, `data:` URLs
  for the preview, `installEditorFonts` (FontFace API, no inline CSS)
- `apps/editor/src/ai/changes.ts` : plain names of changed settings for the AI result
- `packages/core/src/pages.ts`, `links.ts`, `pages.test.ts` : page add/rename/move/delete, slugs,
  link walking (`collectHrefs`, `mapHrefs`), blank project
- `apps/editor/src/panels/PagesPanel.tsx` : page list UI; `e2e/pages.spec.ts`
- `.claude/launch.json` (untracked) : now also `api` (wrangler dev on 8787)

- `apps/editor/src/security/headers.ts` (+ test) : CSP/headers, `_headers` text; `vite.config.ts` plugin
- `apps/editor/public/preview.html` : preview shell (own CSP, inner srcdoc frame)
- `apps/editor/src/lib/safety.ts` (+ test), `src/ui/SafetyBanners.tsx` : backup reminder, offline
- `apps/editor/public/terms.html`, `privacy.html`, `legal.css` : legal pages
- `apps/editor/e2e/security.spec.ts`, `a11y.spec.ts`, `offline.spec.ts`; `security-report.md`

## 4. What worked

- Cloudflare Pages `_headers`: rules matching one path combine; `! Header` detaches an earlier one.
- `frames[0]` and `location`/`postMessage` work across opaque origins, so the editor can reach the
  inner preview window without same-origin.
- Verified 2026-11-04 (docs.github.com, GitHub changelog 2025-07-14): OAuth apps support PKCE,
  S256 only, not required. `POST /repos/{o}/{r}/pages` needs the `repo` scope for OAuth tokens.
  API version header `2022-11-28` (2026-03-10 also exists; ours is still supported). GitHub asks
  apps not to send content-creating requests in parallel, so blobs go one by one.
- Push uploads few blobs: text files go inline in the tree, and re-publishing reuses unchanged
  files by local Git sha (an unchanged republish makes zero blob calls and no commit).
- Verified 2026-11-04 (official docs, now under aistudio.google.com): stable free models
  `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`; Pro models are paid-only
  since 2026-04-01; `gemini-2.5-flash` routes to 3.5-flash-lite from 2026-12-01. Free RPM/RPD are
  only shown per project in AI Studio (not published). RPD resets at midnight Pacific.
- Google recommends the Interactions API (`POST /v1beta/interactions`, `Api-Revision: 2026-05-20`,
  `x-goog-api-key`, `system_instruction`, `response_format{mime_type,schema}`,
  `generation_config{max_output_tokens,thinking_level}`, `store:false`). Output text is in
  `steps[type=model_output].content[type=text].text`; `status` `incomplete` = cut off.
- Gemini 3.6+ ignores `temperature` and will reject it later, so it is not sent (prompt said "low
  temperature"; this is the replacement). `minimal` thinking works on 3.6 Flash and 3.5 Flash-Lite,
  not on 3.8 Flash (change `GEMINI_THINKING_LEVEL` with the model).
- Live check: a bad key returns **400 INVALID_ARGUMENT, reason API_KEY_INVALID** (old Google error
  format, sometimes wrapped in an array), not the documented 401. Mapping matches both formats;
  429 with `PerDay`/`quota_exceeded` → quota banner, `PerMinute`/`rate_limit_exceeded` → "busy".
- Cloudflare free (verified 2026-11-04): Workers 100k req/day, 10 ms CPU, 50 subrequests, no wall
  limit on fetch; DO 100k req/day, SQLite only (`new_sqlite_classes`), 5 GB; KV 100k reads/day,
  1k writes/day, 25 MiB values, `cacheTtl` min 30 s; rate limit binding period 10 or 60 s
  (approximate, per location), needs wrangler ≥ 4.36.
- Classic fetch-style Durable Object (no `cloudflare:workers` import) keeps plain Vitest working;
  tests drive the real `RateLimiter` class with in-memory storage.
- `wrangler deploy --dry-run` bundles fine: 816 KiB / 134 KiB gzip.
- Workers invocation logs are turned off in `wrangler.jsonc`: they would record request headers
  (the key). Our own logs are `{route, outcome}` only; tests spy on every console method.

## 5. What didn't work

- Detecting a ZIP by file name failed for Playwright downloads (no extension); now by `PK` bytes.
- Python `open(...,'w')` on Windows wrote CRLF; use `newline=''` or run Prettier after.
- The Interactions docs say 401 for a bad key; the live API said 400. Trust live checks.
- `getByLabel('Your Gemini key')` matched the form too (same aria-label); forms now use other
  names. `getByLabel('Heading')` also matches "Text under the heading"; use `exact: true`.
- jsdom has no `crypto.subtle`; vault tests run with `// @vitest-environment node`.

- A `srcdoc` (and blob:/data:) frame inherits the embedder's CSP, even when sandboxed; that is
  why the preview needed its own served page.
- Reloading `preview.html` per redraw (location.replace) broke offline (HTML is not cached);
  `document.write` reuse would leak blob URLs and globals. A persistent shell + inner srcdoc works.
- Playwright `page.evaluate(new Function)` is not blocked by CSP; test with an injected `<script>`.
- axe flagged contrast on the start screen mid-entrance animation; test with reduced motion.
- A click within ~300 ms of reloading the editor can be lost (AI e2e now waits for the preview).
  Not reproduced by hand; watch for it.

## 6. What is still left to do

1. **Owner:** review `workers/api/skill/skill.md` (or send your own text). It is never committed.
2. **Owner (live GitHub test, Phase 6 "done when"):** create a GitHub OAuth app (Settings →
   Developer settings → OAuth Apps → New): homepage `http://localhost:5173`, callback
   `http://localhost:5173/github-callback.html`. Put its id and a new secret in
   `workers/api/.dev.vars` (copy `.dev.vars.example`), run `npm run dev:api` and `npm run dev`,
   then Export → Publish to GitHub with a throwaway name. Delete the test repo afterwards.
   Production needs a second app (or updated URLs) with the Pages address in Phase 8.
3. Phase 7 leftovers (low): Lighthouse re-run on both templates (templates unchanged in Phase 7);
   Turnstile only if abuse appears; `wrangler tail` shows headers to the owner; Inspector exit
   animation `inert` window; zod v4 is ~360 KB source in the main chunk (zod/mini would cut it).
   **Owner/lawyer:** review Terms and Privacy; contact link points to `github.com/ig-suyas/klinth/issues`,
   change it if the public repo differs. Turn on 2FA for GitHub and Cloudflare.
4. Phase 8: create the KV namespace and replace the placeholder id in `wrangler.jsonc`; set
   `ALLOWED_ORIGINS` to the Pages URL; put the skill with `--remote`; set `VITE_API_BASE_URL` (also
   feeds `connect-src` in the generated `_headers`, so set it at build time) to the
   Worker's https URL. Re-check the Gemini model is still stable and free.
5. Item-level inline editing is inspector-only. Props changed without version bumps (no users yet).
   `stash@{0}` (old Phase 2 WIP) can be dropped.
