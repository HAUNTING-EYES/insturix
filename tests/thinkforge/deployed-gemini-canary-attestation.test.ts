import { describe, expect, it } from 'vitest';

import {
  buildThinkForgeDeployedGeminiCanaryAttestation,
  type ThinkForgeCanaryEnvironment,
} from '@/lib/thinkforge/operations/deployed-gemini-canary-attestation';

function safeEnvironment(overrides: ThinkForgeCanaryEnvironment = {}): ThinkForgeCanaryEnvironment {
  const runId = 'canary01';
  return {
    THINKFORGE_DEPLOYED_CANARY_MODE: '1',
    THINKFORGE_DEPLOYED_CANARY_RUN_ID: runId,
    THINKFORGE_DEPLOYED_CANARY_REDIS_SCOPE: runId,
    THINKFORGE_DEPLOYED_CANARY_ATTESTATION_SECRET: 'canary-secret',
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb://canary.example.test',
    BRAND_VAULT_MONGODB_URI: 'mongodb://canary.example.test',
    MONGODB_DB_NAME: `thinkforge_e2e_${runId}`,
    THINKFORGE_MONGODB_DB_NAME: `thinkforge_e2e_${runId}`,
    EDITRON_MONGODB_DB_NAME: `thinkforge_e2e_${runId}`,
    BRAND_VAULT_MONGODB_DB_NAME: `thinkforge_e2e_brandvault_${runId}`,
    UPSTASH_REDIS_REST_URL: 'https://redis.example.test',
    UPSTASH_REDIS_REST_TOKEN: 'isolated-token',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_canary',
    CLERK_SECRET_KEY: 'sk_test_canary',
    GEMINI_API_KEY: 'canary-gemini-key',
    VERCEL_GIT_COMMIT_SHA: 'a1234567890abcdef1234567890abcdef1234567',
    VERCEL_URL: 'thinkforge-canary.example.test',
    ...overrides,
  };
}

describe('deployed Gemini canary attestation', () => {
  it('accepts only an isolated, test-Clerk, Gemini-only deployment', () => {
    const attestation = buildThinkForgeDeployedGeminiCanaryAttestation(safeEnvironment());

    expect(attestation.safe).toBe(true);
    expect(attestation.failures).toEqual([]);
    expect(attestation.deployment).toEqual({
      gitCommitSha: 'a1234567890abcdef1234567890abcdef1234567',
      host: 'thinkforge-canary.example.test',
    });
  });

  it('rejects an accidental fixture, legacy Google route, and media credential', () => {
    const attestation = buildThinkForgeDeployedGeminiCanaryAttestation(safeEnvironment({
      THINKFORGE_E2E_MODE: '1',
      GOOGLE_API_KEY: 'legacy-google-key',
      FAL_AI_API_KEY: 'media-key',
    }));

    expect(attestation.safe).toBe(false);
    expect(attestation.failures).toEqual(expect.arrayContaining([
      'e2e_fixture_enabled',
      'provider_route_not_gemini_only',
      'external_media_or_background_integration_enabled',
    ]));
  });

  it('rejects a deployment whose database names cannot be tied to the disposable run', () => {
    const attestation = buildThinkForgeDeployedGeminiCanaryAttestation(safeEnvironment({
      MONGODB_DB_NAME: 'production',
    }));

    expect(attestation.safe).toBe(false);
    expect(attestation.isolation.runScopedDatabases).toBe(false);
    expect(attestation.failures).toContain('database_scope_not_isolated');
  });
});
