export const THINKFORGE_DEPLOYED_GEMINI_CANARY_ATTESTATION_VERSION = 1 as const;
export const THINKFORGE_DEPLOYED_GEMINI_CANARY_MODE_ENV = 'THINKFORGE_DEPLOYED_CANARY_MODE' as const;
export const THINKFORGE_DEPLOYED_GEMINI_CANARY_SECRET_ENV = 'THINKFORGE_DEPLOYED_CANARY_ATTESTATION_SECRET' as const;

export type ThinkForgeCanaryEnvironment = Record<string, string | undefined>;

export type ThinkForgeDeployedGeminiCanaryAttestation = {
  version: typeof THINKFORGE_DEPLOYED_GEMINI_CANARY_ATTESTATION_VERSION;
  mode: 'deployed-gemini-canary';
  safe: boolean;
  failures: string[];
  deployment: {
    gitCommitSha: string | null;
    host: string | null;
  };
  isolation: {
    runId: string | null;
    runScopedDatabases: boolean;
    taggedDedicatedRedis: boolean;
    testClerk: boolean;
    e2eFixtureDisabled: boolean;
  };
  providers: {
    geminiConfigured: boolean;
    nonGeminiProviderKeysDisabled: boolean;
  };
  externalIntegrationsDisabled: boolean;
};

const NON_GEMINI_PROVIDER_ENV = [
  'GOOGLE_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'OPENROUTER_API_KEY',
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'PERPLEXITY_API_KEY',
] as const;

const EXTERNAL_INTEGRATION_ENV = [
  'FAL_AI_API_KEY',
  'REPLICATE_API_TOKEN',
  'BLOB_READ_WRITE_TOKEN',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_API_TOKEN',
  'GOOGLE_CLOUD_PROJECT',
  'GCS_BUCKET_NAME',
  'UPSTASH_VECTOR_REST_URL',
  'UPSTASH_VECTOR_REST_TOKEN',
  'QSTASH_TOKEN',
  'QSTASH_URL',
  'QSTASH_CURRENT_SIGNING_KEY',
  'QSTASH_NEXT_SIGNING_KEY',
] as const;

function read(env: ThinkForgeCanaryEnvironment, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}

function has(env: ThinkForgeCanaryEnvironment, key: string): boolean {
  return Boolean(read(env, key));
}

function validRunId(value: string | undefined): value is string {
  return Boolean(value && /^[a-z0-9]{1,12}$/i.test(value));
}

function readHost(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(`https://${value}`).host;
  } catch {
    return null;
  }
}

function hasOnlyExpectedDatabaseNames(env: ThinkForgeCanaryEnvironment, runId: string): boolean {
  const expectedApplication = `thinkforge_e2e_${runId}`;
  const expectedBrandVault = `thinkforge_e2e_brandvault_${runId}`;
  return read(env, 'MONGODB_DB_NAME') === expectedApplication
    && read(env, 'THINKFORGE_MONGODB_DB_NAME') === expectedApplication
    && read(env, 'EDITRON_MONGODB_DB_NAME') === expectedApplication
    && read(env, 'BRAND_VAULT_MONGODB_DB_NAME') === expectedBrandVault
    && has(env, 'MONGODB_URI')
    && has(env, 'BRAND_VAULT_MONGODB_URI');
}

function disabledKeys(env: ThinkForgeCanaryEnvironment, keys: readonly string[]): boolean {
  return keys.every((key) => !has(env, key));
}

/**
 * Creates a non-secret deployment attestation. It verifies only configuration
 * facts that make a paid remote canary safe enough to execute once.
 */
export function buildThinkForgeDeployedGeminiCanaryAttestation(
  env: ThinkForgeCanaryEnvironment = process.env,
): ThinkForgeDeployedGeminiCanaryAttestation {
  const failures: string[] = [];
  const runId = read(env, 'THINKFORGE_DEPLOYED_CANARY_RUN_ID');
  const gitCommitSha = read(env, 'VERCEL_GIT_COMMIT_SHA') ?? null;
  const host = readHost(read(env, 'VERCEL_URL'));

  if (read(env, THINKFORGE_DEPLOYED_GEMINI_CANARY_MODE_ENV) !== '1') {
    failures.push('canary_mode_not_enabled');
  }
  if (read(env, 'NODE_ENV') !== 'production') failures.push('runtime_not_production');
  if (!validRunId(runId)) failures.push('invalid_canary_run_id');

  const runScopedDatabases = validRunId(runId) && hasOnlyExpectedDatabaseNames(env, runId);
  if (!runScopedDatabases) failures.push('database_scope_not_isolated');

  const taggedDedicatedRedis = validRunId(runId)
    && read(env, 'THINKFORGE_DEPLOYED_CANARY_REDIS_SCOPE') === runId
    && has(env, 'UPSTASH_REDIS_REST_URL')
    && has(env, 'UPSTASH_REDIS_REST_TOKEN');
  if (!taggedDedicatedRedis) failures.push('redis_scope_not_attested');

  const testClerk = read(env, 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY')?.startsWith('pk_test_') === true
    && read(env, 'CLERK_SECRET_KEY')?.startsWith('sk_test_') === true;
  if (!testClerk) failures.push('clerk_test_instance_required');

  const e2eFixtureDisabled = read(env, 'THINKFORGE_E2E_MODE') !== '1'
    && !has(env, 'THINKFORGE_E2E_WRITER_FIXTURE')
    && !has(env, 'CLICKATRON_E2E_MEDIA_FIXTURE');
  if (!e2eFixtureDisabled) failures.push('e2e_fixture_enabled');

  const geminiConfigured = has(env, 'GEMINI_API_KEY');
  if (!geminiConfigured) failures.push('gemini_key_missing');
  const nonGeminiProviderKeysDisabled = disabledKeys(env, NON_GEMINI_PROVIDER_ENV);
  if (!nonGeminiProviderKeysDisabled) failures.push('provider_route_not_gemini_only');

  const externalIntegrationsDisabled = disabledKeys(env, EXTERNAL_INTEGRATION_ENV);
  if (!externalIntegrationsDisabled) failures.push('external_media_or_background_integration_enabled');

  if (!has(env, THINKFORGE_DEPLOYED_GEMINI_CANARY_SECRET_ENV)) {
    failures.push('attestation_secret_missing');
  }
  if (!gitCommitSha || !/^[a-f0-9]{7,64}$/i.test(gitCommitSha)) {
    failures.push('deployment_commit_unavailable');
  }
  if (!host) failures.push('deployment_host_unavailable');

  return {
    version: THINKFORGE_DEPLOYED_GEMINI_CANARY_ATTESTATION_VERSION,
    mode: 'deployed-gemini-canary',
    safe: failures.length === 0,
    failures: [...new Set(failures)].sort(),
    deployment: { gitCommitSha, host },
    isolation: { runId: validRunId(runId) ? runId : null, runScopedDatabases, taggedDedicatedRedis, testClerk, e2eFixtureDisabled },
    providers: { geminiConfigured, nonGeminiProviderKeysDisabled },
    externalIntegrationsDisabled,
  };
}
