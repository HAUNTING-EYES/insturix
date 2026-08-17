import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const thinkForgeE2EMode = process.env.THINKFORGE_E2E_MODE === '1';
const thinkForgeBaseUrl = process.env.THINKFORGE_E2E_BASE_URL?.trim() || 'http://127.0.0.1:3101';
const activeBaseUrl = thinkForgeE2EMode
  ? thinkForgeBaseUrl
  : process.env.EDITRON_E2E_BASE_URL?.trim() || 'http://127.0.0.1:3000';
const testEnvironment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const thinkForgeE2EDatabaseUri = process.env.THINKFORGE_E2E_DATABASE_URI?.trim();
const thinkForgeE2ERedisRestUrl = process.env.THINKFORGE_E2E_REDIS_REST_URL?.trim();
const thinkForgeE2ERedisRestToken = process.env.THINKFORGE_E2E_REDIS_REST_TOKEN?.trim();
const thinkForgeE2ERunId = process.env.THINKFORGE_E2E_RUN_ID?.trim() || '';
const thinkForgeE2EApplicationDatabaseName = thinkForgeE2ERunId
  ? `thinkforge_e2e_${thinkForgeE2ERunId}`
  : '';
const thinkForgeE2EBrandVaultDatabaseName = thinkForgeE2ERunId
  ? `thinkforge_e2e_brandvault_${thinkForgeE2ERunId}`
  : '';

if (thinkForgeE2EMode) {
  const parsed = new URL(activeBaseUrl);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !parsed.port) {
    throw new Error('ThinkForge E2E must use an explicit localhost base URL with a port.');
  }
  if (!['post', 'carousel', 'script', 'auto'].includes(process.env.THINKFORGE_E2E_WRITER_FIXTURE?.trim() || '')) {
    throw new Error('ThinkForge E2E requires THINKFORGE_E2E_WRITER_FIXTURE=auto, post, carousel, or script.');
  }
  if (!/^[a-z0-9]{1,12}$/i.test(thinkForgeE2ERunId)) {
    throw new Error('ThinkForge E2E requires a 1-12 character alphanumeric THINKFORGE_E2E_RUN_ID.');
  }
  if (!thinkForgeE2EDatabaseUri) {
    throw new Error('ThinkForge E2E requires THINKFORGE_E2E_DATABASE_URI for an isolated QA database.');
  }
  if (!thinkForgeE2ERedisRestUrl || !thinkForgeE2ERedisRestToken) {
    throw new Error('ThinkForge E2E requires explicit Redis credentials for production idempotency checks.');
  }
  const requestedBrandVaultDatabase = process.env.THINKFORGE_E2E_BRAND_VAULT_DATABASE_NAME?.trim();
  if (requestedBrandVaultDatabase && requestedBrandVaultDatabase !== thinkForgeE2EBrandVaultDatabaseName) {
    throw new Error('ThinkForge E2E derives its Brand Vault database from THINKFORGE_E2E_RUN_ID; custom database names are forbidden.');
  }
  process.env.THINKFORGE_E2E_BRAND_VAULT_DATABASE_NAME = thinkForgeE2EBrandVaultDatabaseName;
}

const thinkForgeE2EEnvironment = {
  ...testEnvironment,
  // Never inherit a developer's normal ThinkForge database or retrieval services.
  MONGODB_URI: thinkForgeE2EDatabaseUri ?? '',
  BRAND_VAULT_MONGODB_URI: thinkForgeE2EDatabaseUri ?? '',
  BRAND_VAULT_MONGODB_DB_NAME: thinkForgeE2EBrandVaultDatabaseName ?? '',
  // The ThinkForge shell loads the active-brand selector through Editron's brands route.
  // Keep that dependency inside the same run-scoped database instead of disabling it.
  EDITRON_MONGODB_DB_NAME: thinkForgeE2EApplicationDatabaseName,
  // Startup instrumentation imports the shared database client, which fails closed without
  // a database name. The run ID makes this database disposable and isolated from local data.
  MONGODB_DB_NAME: thinkForgeE2EApplicationDatabaseName,
  THINKFORGE_MONGODB_DB_NAME: thinkForgeE2EApplicationDatabaseName,
  BRAND_VAULT_PERSISTENCE: 'mongo',
  UPSTASH_VECTOR_REST_URL: '',
  UPSTASH_VECTOR_REST_TOKEN: '',
  UPSTASH_REDIS_REST_URL: thinkForgeE2ERedisRestUrl ?? '',
  UPSTASH_REDIS_REST_TOKEN: thinkForgeE2ERedisRestToken ?? '',
  QSTASH_TOKEN: '',
  QSTASH_URL: '',
  QSTASH_CURRENT_SIGNING_KEY: '',
  QSTASH_NEXT_SIGNING_KEY: '',
  // The fixture returns before model generation. This invalid key makes any accidental
  // direct provider call fail rather than using a developer or production credential.
  GEMINI_API_KEY: '',
  GOOGLE_GENERATIVE_AI_API_KEY: '',
  GOOGLE_API_KEY: 'thinkforge-e2e-no-network',
  OPENROUTER_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  OPENAI_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  PERPLEXITY_API_KEY: '',
  REPLICATE_API_TOKEN: '',
  FAL_AI_API_KEY: '',
  BLOB_READ_WRITE_TOKEN: '',
  AWS_ACCESS_KEY_ID: '',
  AWS_SECRET_ACCESS_KEY: '',
  AWS_SESSION_TOKEN: '',
  R2_ACCESS_KEY_ID: '',
  R2_SECRET_ACCESS_KEY: '',
  CLOUDFLARE_API_TOKEN: '',
  CLICKATRON_E2E_MEDIA_FIXTURE: 'completed',
  // Clerk validates the token's authorized-party claim. Match it to the isolated
  // local origin instead of inheriting a deployment-only authorized-party list.
  NEXT_PUBLIC_AUTHORIZED_PARTIES: new URL(activeBaseUrl).origin,
};

const authStatePath =
  (thinkForgeE2EMode
    ? process.env.THINKFORGE_E2E_AUTH_STATE_PATH?.trim()
    : process.env.EDITRON_E2E_AUTH_STATE_PATH?.trim()) ||
  join(tmpdir(), thinkForgeE2EMode ? 'thinkforge-playwright' : 'editron-playwright', 'clerk-user.json');

if (thinkForgeE2EMode) {
  process.env.THINKFORGE_E2E_AUTH_STATE_PATH = authStatePath;
} else {
  process.env.EDITRON_E2E_AUTH_STATE_PATH = authStatePath;
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: thinkForgeE2EMode
    ? /thinkforge-browser\.spec\.ts/
    : /editron-chat-browser\.spec\.ts/,
  outputDir: '.artifacts/playwright/results',
  globalSetup: thinkForgeE2EMode
    ? './tests/e2e/thinkforge-browser.setup.ts'
    : './tests/e2e/editron-clerk.setup.ts',
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
    baseURL: activeBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: thinkForgeE2EMode ? 'thinkforge-chromium' : 'editron-chat-chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: thinkForgeE2EMode ? undefined : authStatePath,
      },
    },
  ],
  ...(thinkForgeE2EMode
    ? {
        webServer: {
          command: `pnpm dev --port ${new URL(activeBaseUrl).port}`,
          url: activeBaseUrl,
          reuseExistingServer: false,
          timeout: 180_000,
          env: thinkForgeE2EEnvironment,
        },
      }
    : {}),
});
