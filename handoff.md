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
| 6 GitHub connect, export     | not started                           |
| 7 Hardening                  | not started                           |
| 8 Deploy, launch, push       | not started                           |

## 1. Current state

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

Next: Phase 6 (GitHub OAuth exchange in the Worker, browser-side repo push via Git Data API,
optional Pages, ZIP polish, re-import). Overall: free, no-login site builder exporting plain HTML
repos at ₹0.

## 3. Files

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

## 4. What worked

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

- The Interactions docs say 401 for a bad key; the live API said 400. Trust live checks.
- `getByLabel('Your Gemini key')` matched the form too (same aria-label); forms now use other
  names. `getByLabel('Heading')` also matches "Text under the heading"; use `exact: true`.
- jsdom has no `crypto.subtle`; vault tests run with `// @vitest-environment node`.

## 6. What is still left to do

1. **Owner:** review `workers/api/skill/skill.md` (or send your own text). It is never committed.
2. Phase 6: GitHub push is not built yet; it must push the `buildExport` file list as is (up to 50
   pages, the same path checks as the ZIP). Re-imported project files have no media bytes (decide: include `assets/` on re-import
   or ask to re-upload). Unused files are still exported.
3. Phase 7: editor CSP must allow `connect-src` to the Worker, `font-src 'self' data:` (preview
   fonts are data: URLs) plus the srcdoc/blob needs; bundle is 633 kB (201 kB gzip), split Motion/Zod or lazy-load the AI panel; consider Turnstile if abuse
   appears. `wrangler tail` still shows headers to the owner (owner-only, short-lived). Lighthouse
   re-run on both templates. Inspector exit animation window (see Phase 4 note: `inert`).
4. Phase 8: create the KV namespace and replace the placeholder id in `wrangler.jsonc`; set
   `ALLOWED_ORIGINS` to the Pages URL; put the skill with `--remote`; set `VITE_API_BASE_URL` to the
   Worker's https URL. Re-check the Gemini model is still stable and free.
5. Item-level inline editing is inspector-only. Props changed without version bumps (no users yet).
   `stash@{0}` (old Phase 2 WIP) can be dropped.
