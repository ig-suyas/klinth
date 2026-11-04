# Klinth

A free visual website builder for people who don't code. Pick a template, edit it visually, and
export a ready-to-host website (ZIP or straight to your GitHub). No account, no badge, no tracking.

**Use it:** https://klinth.pages.dev (free, works in your browser, your projects stay on your device).

## Run it locally

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
```

```bash
npm run dev
```

Opens the editor at http://localhost:5173.

```bash
npm run dev:api
```

Runs the API Worker locally at http://localhost:8787 (check http://localhost:8787/health). First
copy `workers/api/.dev.vars.example` to `workers/api/.dev.vars` (it sets the local editor address).

### AI helper (optional)

The AI helper needs the private design skill in the Worker's local KV. Put your skill text in
`workers/api/skill/skill.md` (this folder is ignored by git), then:

```bash
npm run skill:local -w @klinth/api
```

In the editor, click **AI helper** and paste your own free Gemini key from Google AI Studio. Tests
never call Gemini; they use fake answers.

## Checks

```bash
npm run check
```

Runs lint, format check, type check and all tests. CI runs the same plus build and a dependency audit.

## Project layout

- `apps/editor`: the editor (Vite, React, TypeScript, Tailwind, Motion)
- `packages/core`: project format, renderer and exporter (no browser APIs)
- `packages/templates`: the two templates and their blocks
- `workers/api`: the Cloudflare Worker for AI and GitHub sign-in
- `docs/ARCHITECTURE.md`: how it all fits together

## Configuration

Variable names are listed in `.env.example`. Real values never go in git.

## Deploy (free, Cloudflare)

Everything runs on Cloudflare's free plan, which stops at its limits instead of billing. You need a
free Cloudflare account. Run these from the repository folder.

1. Log in once: `npx wrangler login`
2. Create the skill storage: `npx wrangler kv namespace create SKILL` (in `workers/api`), and put
   the printed id in `workers/api/wrangler.jsonc` under `kv_namespaces`.
3. Set `ALLOWED_ORIGINS` in `workers/api/wrangler.jsonc` to your editor address (for example
   `https://klinth.pages.dev`).
4. Upload the private skill (`workers/api/skill/skill.md`, never committed):
   `npm run skill:remote -w @klinth/api`
5. Deploy the Worker: `npm run deploy:api`. Note its `https://...workers.dev` address.
6. GitHub publishing (optional): create a GitHub OAuth app with homepage = your editor address and
   callback = `<editor address>/github-callback.html`. Put its Client ID in `GITHUB_CLIENT_ID`
   (`wrangler.jsonc`), then store the secret (Wrangler asks for the value):
   `npx wrangler secret put GITHUB_CLIENT_SECRET --name klinth-api`, then `npm run deploy:api` again.
7. Put the Worker address in `apps/editor/.env.deploy` (`VITE_API_BASE_URL=...`). It also goes into
   the editor's security policy, so set it before building.
8. First time only: `npx wrangler pages project create klinth --production-branch main --force`
   (`--force` makes a classic Pages project instead of a Worker).
9. Deploy the editor: `npm run deploy:editor`. Security headers come from the generated `_headers`.

Check it: `https://<worker>/health` answers `{"ok":true}`, and the editor opens and shows a preview.

**Custom domain (optional, the only thing that costs money):** add it to the Pages project in the
Cloudflare dashboard (Workers & Pages → klinth → Custom domains), then add the new address to
`ALLOWED_ORIGINS`, update the GitHub OAuth app URLs, and redeploy both.

## License

To be decided.
