import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required deployed Gemini canary environment variable: ${name}`);
  return value;
}

function deriveTestEmail(baseEmail: string, runId: string): string {
  const [local, domain, ...extra] = baseEmail.split('@');
  if (!local || !domain || extra.length > 0) {
    throw new Error('THINKFORGE_CANARY_BASE_EMAIL must be a valid disposable test address.');
  }
  return `${local.split('+')[0]}+${runId}@${domain}`;
}

function requireRunId(): string {
  const runId = requireEnv('THINKFORGE_CANARY_RUN_ID');
  if (!/^[a-z0-9]{1,12}$/i.test(runId)) {
    throw new Error('THINKFORGE_CANARY_RUN_ID must be 1-12 alphanumeric characters.');
  }
  return runId;
}

function requireApprovedSpend(): string {
  if (requireEnv('THINKFORGE_CANARY_APPROVAL') !== 'APPROVE_ONE_SYNTHETIC_GEMINI_CANARY') {
    throw new Error('THINKFORGE_CANARY_APPROVAL must explicitly approve one synthetic Gemini canary.');
  }
  const value = requireEnv('THINKFORGE_CANARY_APPROVED_MAX_USD');
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 0.5) {
    throw new Error('THINKFORGE_CANARY_APPROVED_MAX_USD must be greater than 0 and no more than 0.50.');
  }
  return value;
}

const canaryUrl = new URL(requireEnv('THINKFORGE_CANARY_BASE_URL'));
if (canaryUrl.protocol !== 'https:' || canaryUrl.hostname === 'localhost' || canaryUrl.hostname === '127.0.0.1') {
  throw new Error('THINKFORGE_CANARY_BASE_URL must be an HTTPS deployed canary, never localhost.');
}
const allowedHost = requireEnv('THINKFORGE_CANARY_ALLOWED_HOST').toLowerCase();
if (canaryUrl.host.toLowerCase() !== allowedHost) {
  throw new Error('THINKFORGE_CANARY_BASE_URL does not match the explicit canary host allowlist.');
}

const runId = requireRunId();
const expectedCommit = requireEnv('THINKFORGE_CANARY_EXPECTED_COMMIT').toLowerCase();
if (!/^[a-f0-9]{7,64}$/.test(expectedCommit)) {
  throw new Error('THINKFORGE_CANARY_EXPECTED_COMMIT must be a Git SHA.');
}
const approvedSpend = requireApprovedSpend();
const baseEmail = requireEnv('THINKFORGE_CANARY_BASE_EMAIL');
const testPublishableKey = requireEnv('THINKFORGE_CANARY_CLERK_PUBLISHABLE_KEY');
const testSecretKey = requireEnv('THINKFORGE_CANARY_CLERK_SECRET_KEY');
if (!testPublishableKey.startsWith('pk_test_') || !testSecretKey.startsWith('sk_test_')) {
  throw new Error('The deployed Gemini canary requires a disposable Clerk test instance.');
}

Object.assign(process.env, {
  THINKFORGE_E2E_MODE: '1',
  THINKFORGE_E2E_RUN_ID: runId,
  THINKFORGE_E2E_DATABASE_URI: requireEnv('THINKFORGE_CANARY_DATABASE_URI'),
  THINKFORGE_E2E_BRAND_VAULT_DATABASE_NAME: `thinkforge_e2e_brandvault_${runId}`,
  THINKFORGE_E2E_REDIS_REST_URL: requireEnv('THINKFORGE_CANARY_REDIS_REST_URL'),
  THINKFORGE_E2E_REDIS_REST_TOKEN: requireEnv('THINKFORGE_CANARY_REDIS_REST_TOKEN'),
  THINKFORGE_E2E_BASE_EMAIL: baseEmail,
  THINKFORGE_E2E_USER_EMAIL: deriveTestEmail(baseEmail, runId),
  THINKFORGE_E2E_BRAND_ID: `brand_${runId}`,
  THINKFORGE_E2E_WRITER_FIXTURE: '',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: testPublishableKey,
  CLERK_SECRET_KEY: testSecretKey,
  THINKFORGE_CANARY_EXPECTED_COMMIT: expectedCommit,
  THINKFORGE_CANARY_APPROVED_MAX_USD: approvedSpend,
  THINKFORGE_CANARY_OPERATOR: requireEnv('THINKFORGE_CANARY_OPERATOR'),
  GEMINI_API_KEY: '',
  GOOGLE_API_KEY: '',
  GOOGLE_GENERATIVE_AI_API_KEY: '',
  OPENROUTER_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  OPENAI_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  PERPLEXITY_API_KEY: '',
  FAL_AI_API_KEY: '',
  REPLICATE_API_TOKEN: '',
  BLOB_READ_WRITE_TOKEN: '',
  AWS_ACCESS_KEY_ID: '',
  AWS_SECRET_ACCESS_KEY: '',
  R2_ACCESS_KEY_ID: '',
  R2_SECRET_ACCESS_KEY: '',
  QSTASH_TOKEN: '',
  UPSTASH_VECTOR_REST_URL: '',
  UPSTASH_VECTOR_REST_TOKEN: '',
});

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /thinkforge-deployed-gemini-canary\.spec\.ts/,
  globalSetup: './tests/e2e/thinkforge-browser.setup.ts',
  outputDir: '.artifacts/thinkforge-deployed-canary/results',
  fullyParallel: false,
  forbidOnly: true,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 60_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: '.artifacts/thinkforge-deployed-canary/report', open: 'never' }],
  ],
  use: {
    baseURL: canaryUrl.toString().replace(/\/$/, ''),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{
    name: 'thinkforge-deployed-gemini-canary',
    use: { ...devices['Desktop Chrome'] },
  }],
  // No webServer: this must test the explicitly attested remote deployment.
  metadata: {
    canaryRunId: runId,
    expectedCommit,
    approvedSpend,
    authStatePath: join(tmpdir(), 'thinkforge-deployed-canary', `${runId}.json`),
  },
});
