/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { headersFor, pagesHeadersFile } from './src/security/headers.ts';

/**
 * Security headers: written to `_headers` for Cloudflare Pages on build, and
 * sent by `vite preview` so the end-to-end tests run under the same policy.
 * (The dev server skips them: Vite's hot reload needs inline scripts.)
 */
function securityHeaders(apiBaseUrl: string | undefined): Plugin {
  return {
    name: 'klinth-security-headers',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: pagesHeadersFile(apiBaseUrl) });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '/').split('?')[0] ?? '/';
        for (const [name, value] of Object.entries(headersFor(path, apiBaseUrl))) {
          res.setHeader(name, value);
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    securityHeaders(
      loadEnv(mode, process.cwd(), 'VITE_').VITE_API_BASE_URL ?? 'http://localhost:8787',
    ),
  ],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // Playwright tests live in e2e/ and run with `npm run e2e`.
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
