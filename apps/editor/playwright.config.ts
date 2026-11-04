import { defineConfig, devices } from '@playwright/test';

// The production build under `vite preview`, so every flow runs under the real
// security headers (the dev server cannot send them).
const PORT = 4173;

const EXTRA_BROWSERS = (process.env.E2E_BROWSERS ?? (process.env.CI ? 'firefox,webkit' : ''))
  .split(',')
  .map((name) => name.trim())
  .filter((name) => name === 'firefox' || name === 'webkit');

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Wide enough that the desktop preview is not scaled: Playwright does not map
    // clicks through CSS transforms on frames.
    viewport: { width: 2000, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    // First-visit checks also run in Firefox and Safari's engine (CI installs them;
    // locally pick them with E2E_BROWSERS=chromium,webkit).
    ...EXTRA_BROWSERS.map((name) => ({
      name,
      testMatch: /fresh-start\.spec\.ts$/,
      use: {
        ...devices[name === 'firefox' ? 'Desktop Firefox' : 'Desktop Safari'],
        viewport: { width: 2000, height: 1000 },
      },
    })),
    {
      name: 'chromium',
      // Locally, use the installed Chrome (no browser download on a small laptop).
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 2000, height: 1000 },
        ...(process.env.CI ? {} : { channel: 'chrome' }),
      },
    },
  ],
  webServer: {
    command: 'npx vite build && npx vite preview',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
