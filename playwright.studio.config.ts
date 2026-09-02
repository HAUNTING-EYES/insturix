import { defineConfig, devices } from '@playwright/test';

/**
 * Studio shell browser E2E — self-contained config: no editron/thinkforge
 * global setup (those provision engine fixtures the studio spec doesn't
 * need). The spec authenticates itself via the Clerk dev-instance backdoor.
 * Expects the dev server on 127.0.0.1:3000 (start `pnpm dev` first).
 */
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: '.artifacts/playwright/studio-report',
  reporter: [['list']],
  use: {
    baseURL: process.env.STUDIO_E2E_BASE_URL?.trim() || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'studio-shell-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
