# Klinth security report (Phase 7)

**Date:** 2026-11-04. **Depth:** Standard (baseline, uploads/user content, AI, OAuth, abuse limits).
**Scope:** editor SPA (`apps/editor`), Worker (`workers/api`), exporter (`packages/core`).
**Assumptions:** no accounts, no database, no personal data stored server-side (confirmed in code).
**Not tested:** live Cloudflare deployment (Phase 8), real GitHub OAuth app, real Gemini quota,
DDoS, Cloudflare account and GitHub account settings (owner-only).

## Findings

### F1. Editor had no Content-Security-Policy (High, fixed, confirmed)

- **Where:** `apps/editor` (no `_headers`, no CSP). The editor holds the unlocked Gemini key in memory.
- **Impact:** any XSS would run with full access to the key and IndexedDB.
- **Fix:** `src/security/headers.ts` builds strict headers (`script-src 'self'`, `connect-src`
  self + Worker + `api.github.com`, `object-src/base-uri 'none'`, `frame-ancestors 'none'`, nosniff,
  Referrer-Policy, Permissions-Policy, HSTS). Written to `dist/_headers` at build time.
  The preview moved from `srcdoc` (which inherits the editor CSP and would have broken custom code)
  to a `/preview.html` shell with its own policy, still sandboxed without same-origin.
- **Verification:** `e2e/security.spec.ts` checks the headers and that an injected inline script is
  blocked; the whole Playwright suite now runs against the production build under the real policy
  with no violations; `e2e/media.spec.ts` proves custom code still cannot reach the editor.

### F2. Worker read request bodies without a streaming cap (Low, fixed, confirmed)

- **Where:** `workers/api/src/ai.ts`, `github.ts` (`request.text()` before the size check).
- **Impact:** a chunked body with no Content-Length was read in full (CPU/memory waste, within
  Cloudflare's own 100 MB cap).
- **Fix:** `readCappedText` in `http.ts` stops reading past 64 KB / 4 KB.
- **Verification:** `index.test.ts` "stops reading a body without a length".

### Checked, no issue found

- Secrets: no keys or tokens in git history (only fake test tokens); `skill.md`, `.dev.vars`
  git-ignored. `npm audit`: 0 vulnerabilities. No source maps in the production build.
- Worker: Origin allow-list on every route, CORS without credentials, Zod on input and output,
  fixed upstream hosts (no SSRF), 30/h per IP Durable Object bucket + burst guard, 60 s / 15 s
  timeouts, logs only `{route, outcome}`, invocation logs off (they would record the key header).
- OAuth: PKCE S256 + random state, redirect URI pinned to the allowed origin, token kept in memory.
- Output safety: renderer escapes all text, URL allow-list (https/mailto/tel/page links), no
  `innerHTML`/`eval` with user data, embeds accept a URL only, custom code double-sandboxed in the
  editor.
- Key vault: PBKDF2-SHA-256 600k → AES-GCM, passphrase never stored.

## Summary

| Severity | Open | Fixed |
| -------- | ---- | ----- |
| Critical | 0    | 0     |
| High     | 0    | 1     |
| Medium   | 0    | 0     |
| Low      | 0    | 1     |

**Launch verdict:** Ready with conditions: deploy with the generated `_headers`, set
`ALLOWED_ORIGINS` and `VITE_API_BASE_URL` to the real https addresses, turn on 2FA for the GitHub
and Cloudflare accounts, and re-run this review after Phase 8.

## Remaining risks (accepted)

- The preview's own CSP is loose by design (custom code may load https scripts); it is isolated by
  the sandbox (opaque origin, no forms, no top navigation).
- Exported sites with custom code ship without a CSP (documented in the export README).
- `wrangler tail` shows request headers (the key) to the owner while it runs.
- The vault cannot protect against malicious extensions while unlocked (stated in the UI).
- A determined user may infer the private skill's style from outputs (stated in docs).

## Needs a human

- Terms and Privacy (`apps/editor/public/terms.html`, `privacy.html`) are plain-language drafts:
  have a lawyer review them (India DPDP Act, GDPR if EU visitors) before launch.

_This is an AI review. It can miss things, including library zero-days, DDoS, phishing and insider
risk. No review can make an app unhackable; the goal is to raise the cost of attacks._
