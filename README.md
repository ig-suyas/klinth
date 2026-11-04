# Klinth

A free visual website builder for people who don't code. Pick a template, edit it visually, and
export a ready-to-host website (ZIP or straight to your GitHub). No account, no badge, no tracking.

> Status: early development. See `handoff.md` for progress.

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

Runs the API Worker locally at http://localhost:8787 (check http://localhost:8787/health).

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

Variable names are listed in `.env.example`. Real values never go in git. Deploy steps arrive in a
later phase.

## License

To be decided.
