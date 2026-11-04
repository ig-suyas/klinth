# Klinth: Build Prompt

You are building **Klinth**, a free visual website builder for people with no coding background. Users pick a premium template, edit it visually, add images, videos and embeds, optionally ask AI (their own Gemini key) to write or restyle sections, and **export a ready-to-host repository** (ZIP or pushed straight to their GitHub). The exported site carries **no Klinth badge or watermark**.

This file is the single source of truth. Work **one phase per session**. Never build ahead.

---

## 0. HOW EVERY SESSION WORKS (read this first, always)

1. Read `handoff.md` first. If it does not exist, you are starting **Phase 0**.
2. Read the **global sections (1 to 8)** of this file and **only the section of the next unfinished phase** (section 9). Do not re-scan the whole repo. `handoff.md` is your memory.
3. Say in 3 to 5 lines what you will do. Then do it. Do not wait for approval unless this file says "STOP AND ASK".
4. Finish the phase's **Definition of Done**. Run all tests and lint. Fix failures.
5. Update `handoff.md` using the template in section 10. Commit locally (rules in section 7).
6. Stop. Tell the owner: "Phase N done. Start a new session for Phase N+1."
7. **Token economy:** the owner is on a small plan. Keep replies short, no long summaries, no re-reading files you already know, no giant outputs. Prefer targeted edits over rewrites.

**Skills.** Where the owner has these skills installed, use them where they fit: `/architect` (Phase 0), `/frontend` (Phases 2, 3 and the AI skill in Phase 5), `/test` (every phase), `/backend` (API standards for the Worker in Phase 5), `/is-secure`, `/performance`, `/observe`, `/legal-pack` (Phase 7), `/ship`, `/pre-deployment-check` (Phase 8). If a skill is not available, say so in one line and apply the same standards yourself.

**Never** ask for, type or store the owner's passwords, tokens or API keys. Never create accounts. If a step needs a login (GitHub, Cloudflare), tell the owner exactly what to do and wait.

---

## 1. PRODUCT

- **Name:** Klinth. **Repo name:** `Klinth`.
- **Inspiration:** Framer-style building, but an **original** product: different name, different theme, different UI, no copied assets or code, and simpler for non-coders. Do not imitate Framer's branding or visual identity.
- **Goal:** goodwill, users and fame. **No money for now.** No paid plan, no ads, no watermark or badge anywhere.
- **Hard constraint:** total running cost is **₹0**, except an optional domain. Use only free tiers that **stop at the limit** (Cloudflare Pages, Workers, KV, Durable Objects free plan). Never pick a pay-as-you-go service that can bill automatically. Check current free-tier limits before relying on them.
- **Audience:** non-coders making portfolios, link pages and small business sites. Every label, button and message must be plain language. No jargon.
- **Scope at launch:** portfolios and small sites only (up to a handful of pages or one long page). No CMS, no e-commerce, no accounts.

### What the user can do

1. Start from one of **2 premium templates** (1: personal portfolio; 2: small business or link-in-bio landing page).
2. Edit text, colors, fonts and layout through simple controls; click a section in the preview to edit it. Add, reorder, duplicate and delete sections. Undo and redo. Preview as desktop, tablet and phone.
3. Upload **images** and **small videos (max 25 MB)**, or paste a **YouTube/Vimeo** link.
4. Add a **Custom code** block (paste HTML/CSS/JS, for example a shader from a free library).
5. Click the **AI icon** on any section, describe what they want, and get a result written with Klinth's hidden design skill, using **their own Gemini key**.
6. **Export:** download a ZIP, or **Connect GitHub** and push the repo (and optionally turn on GitHub Pages).

### Locked decisions

| Topic | Decision |
|---|---|
| Accounts | **None.** No login, no database. Projects are saved **in the user's browser** (IndexedDB) and can be exported and re-imported as a project file. |
| Gemini key | Held **in the browser only**, **remembered but encrypted with a passphrase** (details in 5.1). Never stored on our side. |
| AI calls | Go **through a Cloudflare Worker**, which holds the private design skill and calls Gemini with the user's key. The skill is never sent to the browser. |
| Rate limit | **About 30 AI calls per hour per IP** (balanced). |
| Queue | **Not needed in v1** (single request per AI call). Use concurrency limits and timeouts. |
| Backend | **Cloudflare Workers only** (AI proxy, GitHub OAuth exchange). No servers, no database. |
| GitHub | **ZIP download and "Connect GitHub" push**. |
| Media | Images are compressed and included in the repo. **Videos up to 25 MB** can be uploaded; larger ones must be embeds. |
| Custom code | **Allowed**, previewed in a **sandboxed frame**, runs for real only on the exported site. |
| Output tech | Exported site is plain **HTML, CSS and JavaScript** (no framework, no build step needed to host it). |

---

## 2. TECH STACK

**Editor (static single-page app)**
- Vite + React + TypeScript (strict) + Tailwind CSS. **Motion (Framer Motion)** for editor animations (install via npm).
- State: a small store (Zustand or similar) with undo/redo history. Validation: **Zod**. Local persistence: **IndexedDB** (via `idb`). ZIP: `fflate` or `JSZip`.
- Tests: Vitest + Testing Library, Playwright for the main flows.
- Host: **Cloudflare Pages free plan**.

**Exported site**
- Plain HTML, CSS (design tokens as CSS variables), small vanilla JS (scroll reveal with IntersectionObserver, menu, lazy embeds). No runtime library, no tracking, no badge. Fonts: use bundled open-license fonts or system fonts; do not call third-party font hosts by default.

**Workers (TypeScript, Wrangler)**
- `ai` Worker: `/ai/generate`. `github` Worker routes: OAuth code exchange. Rate limiting with a **Durable Object** (SQLite-backed, free plan) token bucket per IP, plus Cloudflare's built-in rate limit binding as a short-window burst guard. Workers KV for the private skill text. **Cloudflare Turnstile** (free) on the first AI call if abuse appears.

**Repo layout (monorepo)**
```
/apps/editor        Vite + React app
/packages/core      project schema (Zod), design tokens, renderer, exporter  (shared, no DOM)
/packages/templates the 2 templates + block definitions
/workers/api        Cloudflare Worker(s)
/docs               ARCHITECTURE.md
handoff.md  prompt.md  README.md
```

---

## 3. SYSTEM DESIGN

```
Browser (Klinth editor, Cloudflare Pages)
  |- Project (JSON) <-> IndexedDB         (no server, no login)
  |- Preview: sandboxed iframe (srcdoc) rendered by packages/core
  |- Key vault: Gemini key encrypted with passphrase (WebCrypto)
  |- Export: ZIP in the browser (fflate)
  |
  |-- AI request -----> Cloudflare Worker /ai/generate
  |      header: X-Gemini-Key (user's key, HTTPS only)         |- rate limit (Durable Object, 30/h per IP)
  |      body: instruction + current section JSON              |- adds PRIVATE skill (from KV) + JSON schema
  |                                                            |- calls Gemini REST with the user's key
  |   <-- validated section JSON only (never the prompt) ------|- validates output with Zod, never echoes skill
  |
  |-- GitHub connect --> Worker /github/oauth (code -> token exchange only)
  |   then browser calls api.github.com directly with the token (kept in memory only)
  |   create repo -> blobs/tree/commit -> optional enable Pages
```

### 3.1 One source of truth: the renderer
`packages/core` exposes `renderSite(project) -> { path: content }[]`. The **live preview and the exporter use the same function**, so what users see is exactly what they export. Templates and blocks are data plus render functions; nothing in the exported HTML depends on the editor.

### 3.2 Project model (Zod, versioned)
`Project { schemaVersion, meta (title, language, favicon), theme (tokens: colors, fonts, radius, spacing), pages[ { slug, title, sections[ { id, type, props } ] } ], assets[ { id, kind, name, size, mime } ] }`. Block types for v1: Hero, About, Text+Image, Gallery, Video (embed or upload), Projects/Work cards, Testimonials, Links (link-in-bio), Contact, Footer, Custom code, Spacer. The project file **never contains an API key or token** (test this).

### 3.3 Media
- Images: client-side compress and resize (canvas to WebP, max width about 2000 px), keep originals out of the repo. Videos: accept only common web formats, **hard cap 25 MB**, show a clear message and suggest embedding for larger files. Warn when the total repo size gets large.
- Embeds: accept **only a URL**, parse the video ID with strict patterns (YouTube via `youtube-nocookie.com`, Vimeo), render a lazy "click to load" facade. **Never accept raw iframe HTML.**

### 3.4 Custom code block
Pasted HTML/CSS/JS is **not trusted**. In the editor it runs only inside a nested iframe with `sandbox="allow-scripts"` and **no `allow-same-origin`**, so it cannot read the editor, the saved key, storage or other tabs. Size limit about 200 KB. A clear notice: "This code runs on your published site. Only paste code you trust." AI-generated code blocks require an explicit user confirm.

### 3.5 GitHub push
Worker only exchanges the OAuth `code` for a token and returns it; **no token is stored or logged server-side**. The browser keeps the token in memory only and calls the GitHub API (create repo, Git Data API for blobs, tree, commit, update ref; optional enable Pages). Default scope `public_repo`; ask for broader scope only if the user wants a private repo. Handle errors (name taken, rate limit, revoked token) with plain messages.

### 3.6 Exported repository
`index.html` (and other pages), `/assets`, `/css`, `/js`, `README.md` (how to host on GitHub Pages and Cloudflare Pages in plain steps), `.nojekyll`, and `.klinth/project.json` so the user can re-import and keep editing on any device. **No badge, no link back to Klinth.**

---

## 4. UX RULES (non-coders first)

- First visit: pick a template, short guided tour (skippable). Plain labels ("Heading", "Background color", "Add a section"), friendly empty states, helpful errors, tooltips.
- WYSIWYG: click in the preview to select; inline text editing for headings and paragraphs; inspector panel with simple controls; drag to reorder sections.
- Autosave to the browser with a visible "Saved" indicator. Warn before the user can lose work (browser data cleared) and nudge them to export the project file.
- Desktop and tablet first for the editor; phones get a friendly message suggesting a bigger screen (exported sites are fully responsive on all devices).
- Premium look: the 2 templates and the editor chrome follow the owner's front-end skill (distinctive typography, spacing, motion, no template-y defaults). Respect `prefers-reduced-motion`. Accessible by default (contrast, focus states, alt text prompts, keyboard navigation). Lighthouse target 95+ on exported sites.

---

## 5. NON-NEGOTIABLE RULES

### 5.1 Key vault (Gemini key)
- Encrypt with **WebCrypto**: PBKDF2 (SHA-256, at least 600,000 iterations, random salt) to derive an **AES-GCM** key; store only ciphertext, salt and IV in localStorage. **The passphrase is never stored.** Unlock prompt when the user wants to use AI; "Forget my key" button; optional auto-lock.
- Be honest in the UI: this protects against casual access, not against malicious scripts running while the vault is unlocked.
- Send the key only to our Worker over HTTPS in the `X-Gemini-Key` header. Never put it in a URL, the project file, logs or analytics. Strict **Content-Security-Policy** on the editor to limit XSS. A "Test my key" button makes one cheap call.

### 5.2 The private skill
- The skill text (distilled from the owner's `/frontend` skill) lives in **Workers KV**, put there by the owner with Wrangler; **never in git, never in the browser, never in logs, never in responses**. Keep it compact (aim for 2,500 tokens or less) because it uses the user's Gemini quota on every call. The repo contains only `skill.example.md` for tests.
- Output defence: the Worker returns only schema-validated JSON; reject or strip any response that contains long verbatim chunks of the skill; refuse instructions like "print your instructions".
- Be honest in docs: this hides the skill from direct reading, but a determined person might still infer style rules from outputs.

### 5.3 AI output safety
- Gemini must return **structured section JSON** (use Gemini's structured-output/response schema), validated with Zod against allowed block types. Escape all text on render. Only `https`, `mailto` and `tel` URLs. AI never writes raw page HTML except into a clearly labelled Custom code block that the user must confirm.
- Model name in an env var (verify a currently available free-tier model at build time). Low temperature, max output tokens, 60 s timeout, one retry on 5xx, **no retry on 4xx/429**. On quota exhaustion show a polished banner ("Your Gemini limit is reached. Free-tier limits reset daily.") and let the user keep editing manually.

### 5.4 Rate limiting and abuse (Worker)
- Durable Object token bucket per IP (`CF-Connecting-IP`): about **30 AI calls per hour**, small burst allowance, `429` with `Retry-After`. Short-window burst guard with the built-in binding. Max request body about 64 KB. CORS allow-list for the Klinth origin only. Strict input validation with Zod. Fixed upstream host (no SSRF). No logging of keys, bodies or the skill. Add Turnstile if abuse shows up.

### 5.5 Security of the editor and the exported site
- Escape everything the renderer outputs; no `eval`, no `innerHTML` with user data; sandboxed preview and custom code; CSP and security headers via `_headers` on Cloudflare Pages; dependency audit in CI; no secrets in git; `.env.example` only. Exported sites get a CSP only when they contain no custom code (note this in the export README).

### 5.6 Contact forms
No Klinth-hosted form backend in v1. The Contact block takes the user's **own form endpoint** (for example Formspree or Web3Forms, with a short guide) or falls back to `mailto:`.

### 5.7 Legal and trust
Short Terms and Privacy pages in plain language: data stays in the browser, no accounts, the Worker passes the key through without storing it, GitHub token is not stored, users are responsible for the content and custom code they publish. No tracking by default.

### 5.8 Code quality
TypeScript strict, small pure functions, shared `packages/core` with no DOM dependency, typed APIs, error boundaries, no dead code, meaningful names, consistent formatting (Prettier + ESLint), tests for every core function, no `any`.

---

## 6. ENVIRONMENT NOTES

- The owner is a beginner at deploying apps and has never deployed one. When you reach Phase 8, explain each owner action simply, one at a time (Cloudflare account, Wrangler login, KV, secrets, GitHub OAuth app).
- The owner develops on a small laptop. Keep dev setup light (Vite dev server, Wrangler local mode).
- Free-tier limits change. Verify current Cloudflare, GitHub API and Gemini limits before depending on them, and record what you verified in `handoff.md`.

---

## 7. GIT RULES

- Local commits at the end of every phase (and at logical checkpoints). Conventional style: `feat(core): ...`, `fix(editor): ...`.
- **No AI attribution anywhere:** no `Co-Authored-By` trailer, no "Generated with Claude Code" line, no session links, in commits or PR text.
- Do **not** push until the final phase. In Phase 8, after everything passes, create/push to the GitHub repository **`Klinth`** (use `gh` if the owner is already logged in; otherwise give the exact steps). Never ask for credentials.

---

## 8. DEFINITION OF "GOOD ENOUGH FOR PRODUCTION"

All tests green (unit, Worker tests, Playwright end-to-end: pick template, edit, upload image, embed video, export ZIP), lint and types clean, no secrets in git, security review done (`/is-secure`), performance pass done (`/performance`), accessibility checked, legal pages present, pre-deployment checklist passed (`/pre-deployment-check`), README with setup and deploy steps, `handoff.md` current.

---

## 9. PHASES

### Phase 0: Scaffold and architecture
Use `/architect`. Create the monorepo (section 2), Vite+React editor skeleton, `packages/core`, Worker skeleton (Wrangler, local run), lint/format/test configs, GitHub Actions CI, `.env.example`, `.gitignore` (including any private skill file), README, `docs/ARCHITECTURE.md` (refine sections 1 to 5 with the diagram), first `handoff.md`.
**Done when:** editor and Worker run locally, CI config exists, one trivial test passes per package, `handoff.md` written.

### Phase 1: Core engine
Zod project schema (versioned) with migrations hook, design tokens, `renderSite()`, exporter producing the file list (3.6), ZIP builder, IndexedDB persistence, project file export and import, **security tests** (HTML escaping, URL allow-list, project file never contains a key or token).
**Done when:** a hard-coded sample project renders and exports a working static site that opens correctly offline; tests cover escaping and round-trip import/export.

### Phase 2: Blocks and the two templates
Use `/frontend` and `/test`. Build the v1 blocks (3.2) and **2 premium templates** from the owner's front-end skill. Responsive, accessible, fast, tasteful motion with vanilla JS, `prefers-reduced-motion` respected.
**Done when:** both templates export and score 95+ on Lighthouse (mobile) and look genuinely premium, not template-generic; visual snapshot tests exist.

### Phase 3: Editor UI
Use `/frontend`. Layout: left panel (sections, add), center preview (sandboxed iframe, click to select via `postMessage`), right inspector (simple controls), top bar (device preview, undo/redo, export). Inline text editing, drag reorder, duplicate/delete, theme controls, autosave with indicator, first-run tour, template picker, plain-language copy everywhere, Motion animations.
**Done when:** a non-coder can pick a template, change text/colors/sections and export without help; Playwright covers the flow.

### Phase 4: Media, embeds and custom code
Image upload with compression, video upload with the 25 MB cap, asset manager, repo-size warning, YouTube/Vimeo embed facade (3.3), Custom code block with sandboxed preview and the trust notice (3.4).
**Done when:** media and embeds export correctly; tests prove raw iframe HTML is rejected and sandboxed code cannot reach the editor.

### Phase 5: AI Worker, key vault, AI panel
Use `/backend` standards and `/frontend`. Build: key vault (5.1), `/ai/generate` Worker (prompt assembly with the private skill from KV, Gemini call with per-request key, Zod validation, skill-echo guard), Durable Object rate limiter and burst guard (5.4), quota banner, AI panel on every section ("what do you want?"), "Test my key". Ask the owner to supply the real skill text for KV (STOP AND ASK) or distill a compact one from `/frontend` and let the owner review it.
**Done when:** tests prove the key and skill never appear in logs or responses, the 31st call in an hour is rejected with `Retry-After`, invalid AI output is rejected, quota errors show the banner.

### Phase 6: GitHub connect and export polish
Worker OAuth exchange, browser-side repo creation and commit via the Git Data API, optional Pages enable, ZIP polish, export README, re-import of `.klinth/project.json`. Clear error handling.
**Done when:** a test repo is created and pushed end to end (using a throwaway repo the owner authorises), ZIP and push produce identical files, tokens are never stored.

### Phase 7: Hardening
Run `/is-secure`, `/performance`, `/observe` (minimal: Worker logs without secrets), `/legal-pack` (Terms, Privacy in plain language). Accessibility pass, bundle-size pass, error boundaries, offline behaviour, data-loss warnings.
**Done when:** no high-severity findings open; remaining risks listed in `handoff.md`.

### Phase 8: Deploy, launch checks, push
Use `/ship` and `/pre-deployment-check`. Walk the owner through (one step at a time): Cloudflare Pages deploy, Worker deploy, KV skill upload, secrets, GitHub OAuth app, `_headers`/CSP, optional domain. Smoke tests on the live URLs. **STOP AND ASK** whether the repo should be public or private. When everything passes, **push to the GitHub repository `Klinth`**.
**Done when:** the site and Workers run live on free tiers, the export and GitHub push work in production, README is complete, repository pushed.

---

## 10. handoff.md TEMPLATE (update at the end of every session)

```
# Handoff

## Phase status
| Phase | Status |
|---|---|
| 0 ... 8 | not started / in progress / done |

## 1. Current state
(What exists and runs right now. Which phase is finished or half done.)

## 2. Goal
(The goal of the current/next phase in 1 to 2 lines, and the overall goal.)

## 3. Files
(Key files and folders touched or created, one line each: path : purpose.)

## 4. What worked
(Approaches, commands and decisions that worked. Include numbers like timings and verified free-tier limits.)

## 5. What didn't work
(Failed approaches, errors and why, so they are not repeated.)

## 6. What is still left to do
(Ordered next steps, open questions for the owner, known risks.)
```
Keep it short and factual. It is the only thing the next session reads before starting.
