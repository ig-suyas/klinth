# Handoff

## Phase status

| Phase                        | Status                    |
| ---------------------------- | ------------------------- |
| 0 Scaffold and architecture  | done                      |
| 1 Core engine                | done (reviewed, hardened) |
| 2 Blocks and templates       | not started (WIP stashed) |
| 3 Editor UI                  | not started               |
| 4 Media, embeds, custom code | not started               |
| 5 AI Worker, key vault, AI   | not started               |
| 6 GitHub connect, export     | not started               |
| 7 Hardening                  | not started               |
| 8 Deploy, launch, push       | not started               |

## 1. Current state

Phase 1 done, then given a high-effort review (attack tests first, then small fixes). `packages/core`:
versioned Zod schema, migrations hook, tokens, `renderSite()`, exporter, deterministic ZIP, project
file import/export, secret guard. Editor: hardened IndexedDB storage and file helpers (no UI yet).
`npm run check` and `npm run build` green: 254 tests (core 232, editor 19, templates 1, api 2).

**Stash:** uncommitted Phase 2 work found during the review (new `packages/core/src/blocks.ts` with typed
block props, plus `schema.ts` edits; it did not typecheck) is saved as `stash@{0}`
("phase2-wip-not-from-review"). It did not come from a Klinth session. Restoring it will conflict in
`schema.ts` (the review changed that file): merge by hand and keep the review's checks.

**Remote:** `origin` = `github.com/ig-suyas/klinth`. Phase 0 (`6df961c`) is already on `origin/main`
(pushed before the review). Phase 1 and the review commit are local only.

## 2. Goal

Next: Phase 2, the v1 blocks with real props and the 2 premium templates (Lighthouse 95+, visual
snapshot tests). Overall: free, no-login visual site builder exporting plain HTML repos at ₹0.

## 3. Files

- `packages/core/src/schema.ts` : Zod schemas; reserved slugs, unique ids, single-line text, prop-name rules
- `packages/core/src/migrations.ts` : `runMigrations` (v0+), `assertPlainJson` (depth/keys), `migrateProject`
- `packages/core/src/tokens.ts` : theme schema (hex colors, closed font-stack list), `themeToCss`
- `packages/core/src/html.ts` : `escapeHtml`, `safeUrl` (https/mailto/tel/#anchor only), `hasControlChar`
- `packages/core/src/render.ts` : `renderSite`, block renderers (basic markup), base CSS, site JS
- `packages/core/src/export.ts` : `buildExport` (3.6 layout + README), `buildZip` (path guard, deterministic)
- `packages/core/src/project-file.ts` : `serializeProject`/`parseProjectFile`, `containsSecret`, `assertNoSecrets`
- `packages/core/src/review.test.ts` : the review's attack tests (items 1 to 7 and 9)
- `apps/editor/src/lib/storage.ts` : IndexedDB with `StorageError` codes, revisions, damaged-record handling
- `apps/editor/src/lib/storage.review.test.ts` : quota, unavailable, blocked, versionchange, two tabs, corruption
- `apps/editor/src/lib/files.ts` : download project file / site ZIP, import project file (size checked first)

## 4. What worked

- Deps: zod 4.6.7, fflate 0.8.3, idb 8.0.4, fake-indexeddb 6.2.7 (dev).
- Held on the first try (tests kept): the URL allow-list (60+ hostile inputs: tab/newline/control
  chars, entity and percent encoding, `data:`, `vbscript:`, `//`, userinfo, long input, ReDoS input),
  escaping in text and attributes (`"><script>`, `</style>`, `</script>`, backticks, bidi and
  full-width tricks), CSS tokens (hex-only colors, int ranges, fixed font list, NaN/Infinity).
- Fixed in the review (each had a failing test first):
  - Paths: slug `index` collided with the home page; added reserved slugs (`index`, `assets`, `css`,
    `js`, `readme`) and Windows device names (`con`, `nul`, `com1`...), slug max 60. Asset ids must be
    unique case-insensitively and avoid device names. Section ids are unique per page. `buildZip`
    refuses unsafe or case-colliding paths.
  - Text: titles, page titles, asset names and the description are single-line (no newline/control
    chars), so nothing can be injected into README.md or `<title>`.
  - Prop names must be plain identifiers. Zod 4 **silently drops** a `__proto__` key instead of rejecting
    it, so `assertPlainJson` rejects `__proto__`/`constructor`/`prototype` before validation.
  - Secrets: the name check was exact-match on JSON text (missed `geminiApiKey`, `githubToken`,
    `authToken`, `clientSecret`...). It now walks objects and arrays at any depth, checking camelCase,
    snake and kebab name words plus `AIza…`, `ghp_/gho_/ghu_/ghs_/ghr_…`, `github_pat_…` values. No false
    positives on `keyline`, `monkey`, "token of thanks" etc. It now also blocks **IndexedDB saves**
    (before, only export and import were checked).
  - Import: depth limit 16 (iterative walk, no stack overflow), migrations accept v0, a crashing or
    bad migration step becomes a plain `ProjectError`. The editor checks `Blob.size` before reading.
  - ZIP: fflate writes DOS time from **local** time fields, so a `…Z` date gave different bytes in
    different time zones. The date is now built from local parts on each call, entries are sorted, and
    os=Unix with mode 0644 is fixed. Tested under UTC, IST and LA, plus a mutation check.
  - Storage: a failed open was cached forever (now retried); added `blocking` (close for a newer tab),
    `blocked` (reject instead of hanging) and `terminated` (reopen) handlers; quota, security and
    version errors map to plain `StorageError` codes; `listProjects` lists damaged records instead of
    crashing; `loadProject` reports `damaged` and keeps the record (`loadRawProject` rescues it);
    `saveProject` takes a base revision and throws `conflict` instead of overwriting another tab.
- Offline: exported sample unzipped to disk; a script checks every `src`/`href` exists locally and
  nothing loads from the internet (only `<a>` links are remote). Result: OFFLINE OK.
- Git: no AI attribution in any commit message (checked all refs).

## 5. What didn't work

- jsdom's `DOMException` is not `instanceof Error` and cloned typed arrays come from another realm, so
  storage reads `error.name` and uses `ArrayBuffer.isView` instead of `instanceof`.
- Assigning `process.env.TZ = undefined` sets the string "undefined"; delete the key to restore.
- Storing `Blob` in fake-indexeddb under jsdom loses `arrayBuffer()`; assets are stored as `Uint8Array`.
- sed with backslashes from Bash on Windows is unreliable; use the Edit tool for regex-heavy edits.
  No Python on this machine.

## 6. What is still left to do

1. **Real-browser checks for Phase 3** (fake-indexeddb cannot prove these): real quota errors (Chrome
   reports them on transaction abort, Safari often as `UnknownError`), eviction and
   `navigator.storage.persist()`, private-mode behaviour in Safari/Firefox, true multi-tab
   `versionchange`/`blocked` across processes, durability after a browser restart, and large
   `Uint8Array` assets. Phase 3 should also use `BroadcastChannel` to tell other tabs about saves, and
   reload on `conflict`.
2. Phase 2: restore `stash@{0}` (see section 1). `containsSecret` flags props whose name words include
   token/secret/password/passphrase/credential/authorization or `…key` after api/gemini/access/auth/
   private/secret, so block props must avoid those names.
3. `video` and `customCode` render placeholders only (Phase 4). SVG uploads are allowed: harmless in
   `<img>`, but scripts would run if an SVG is opened directly. Decide in Phase 4.
4. **CSP deferred to Phase 7:** exported-site CSP meta not added yet (check `'self'` behaviour over
   `file://` first; prompt 5.5). Editor CSP via `_headers` also Phase 7.
5. Before Phase 5: verify Cloudflare free limits and a current free-tier Gemini model.
6. Playwright arrives in Phase 3. `npm audit`: moderate minimatch advisory in ESLint (dev only).
