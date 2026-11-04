import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

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
    command: 'npm run dev',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
