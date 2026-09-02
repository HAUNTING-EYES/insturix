import { defineConfig } from '@playwright/test';

import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  testMatch: /editron-fast-user-qa\.spec\.ts/,
  use: {
    ...baseConfig.use,
    // The fast QA spec owns an always-on trace so passing journeys leave evidence.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
