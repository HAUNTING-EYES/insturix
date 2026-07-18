import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const authStatePath =
  process.env.EDITRON_E2E_AUTH_STATE_PATH?.trim() ||
  join(tmpdir(), 'editron-playwright', 'clerk-user.json');

process.env.EDITRON_E2E_AUTH_STATE_PATH = authStatePath;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /editron-chat-browser\.spec\.ts/,
  outputDir: '.artifacts/playwright/results',
  globalSetup: './tests/e2e/editron-clerk.setup.ts',
  fullyParallel: false,
  forbidOnly: true,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 180_000,
  expect: {
    timeout: 25_000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: '.artifacts/playwright/report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.EDITRON_E2E_BASE_URL?.trim() || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'editron-chat-chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: authStatePath,
      },
    },
  ],
});
