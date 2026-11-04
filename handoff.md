# Handoff

## Phase status

| Phase                        | Status      |
| ---------------------------- | ----------- |
| 0 Scaffold and architecture  | done        |
| 1 Core engine                | not started |
| 2 Blocks and templates       | not started |
| 3 Editor UI                  | not started |
| 4 Media, embeds, custom code | not started |
| 5 AI Worker, key vault, AI   | not started |
| 6 GitHub connect, export     | not started |
| 7 Hardening                  | not started |
| 8 Deploy, launch, push       | not started |

## 1. Current state

Phase 0 done. npm-workspaces monorepo. Editor placeholder page runs (`npm run dev`, :5173). Worker
runs in Wrangler local mode (`npm run dev:api`, :8787) with `/health`, CORS allow-list and 501
placeholders for `/ai/generate` and `/github/oauth`. Lint, format, types, tests (6 tests, 4 packages)
and build all pass. CI workflow exists (not yet run on GitHub; repo not pushed).

## 2. Goal

Next: Phase 1, core engine (Zod schema + migrations hook, tokens, `renderSite()`, exporter file list,
ZIP, IndexedDB persistence, project file import/export, security tests). Overall: free, no-login
visual site builder exporting plain HTML repos at ₹0 running cost.

## 3. Files

- `package.json` : workspaces + root scripts (`dev`, `dev:api`, `check`, `build`), `allowScripts`
- `tsconfig.base.json` : strict TS shared by all packages
- `eslint.config.js`, `.prettierrc.json`, `.prettierignore` : lint/format
- `.github/workflows/ci.yml` : lint, format, typecheck, test, build, `npm audit --audit-level=high`
- `.gitignore`, `.env.example` : secrets and private skill excluded; env var names only
- `packages/core/src/index.ts` : `SCHEMA_VERSION`, `escapeHtml` (tsconfig lib has no DOM on purpose)
- `packages/templates/src/index.ts` : template metadata stub (2 templates)
- `apps/editor/` : Vite 8 + React 19 + Tailwind 4 (`@tailwindcss/vite`) + Motion 14, jsdom tests
- `workers/api/src/index.ts` : Worker skeleton, exported `handle()` for tests
- `workers/api/wrangler.jsonc` : `klinth-api`, `ALLOWED_ORIGINS` var, no bindings yet
- `workers/api/skill/skill.example.md` : test-only skill stand-in (real skill: KV only)
- `docs/ARCHITECTURE.md` : design, diagrams, failure modes, cost, decision records DR-1..DR-7

## 4. What worked

- Versions installed (2026-11-04): Node 24.19, npm 11.17, TS 6.0, ESLint 10.14, typescript-eslint
  8.72, Vitest 5.1, Vite 8.3, React 19.3, Tailwind 4.3, Motion 14.9, Wrangler 4.157, jsdom 30.
- Packages are consumed as TS source (`exports: ./src/index.ts`), no inter-package build.
- Worker tests run in plain Vitest (Node has `Request`/`Response`) by calling `handle()` directly.
- Full check: `npm run check` (~10 s). Editor build ~0.25 s, JS 113 kB gzip (placeholder).
- Free-tier limits: **not yet verified** (not needed in Phase 0). Verify before Phase 5.

## 5. What didn't work

- `npm run dev:api -- --port 8787` from PowerShell: `--` got eaten, Wrangler took `8787` as the entry
  file. Fixed by putting `--port 8787` in the Worker's `dev` script.
- npm 11 blocks install scripts by default. `esbuild` and `workerd` approved via
  `npm approve-scripts` (pinned by version in `allowScripts`); re-approve after upgrading them.

## 6. What is still left to do

1. Phase 1 (see prompt section 9). Add `zod`, `idb`, `fflate` when needed.
2. Before Phase 5: verify Cloudflare free limits (Workers, KV, Durable Objects) and a current
   free-tier Gemini model; consider `@cloudflare/vitest-pool-workers` for Durable Object tests.
3. Playwright not installed yet (Phase 3 adds it).
4. Editor CSP via `apps/editor/public/_headers` is Phase 7.
5. Known: `npm audit` shows a moderate minimatch advisory inside ESLint (dev only); recheck later.
6. The prompt file is `klinth-prompt.md` (layout in the prompt says `prompt.md`).
