import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordProviderCostEvent: vi.fn(),
}));

vi.mock('@/lib/financials/provider-cost-events', () => ({
  recordProviderCostEvent: mocks.recordProviderCostEvent,
}));

import { recordThinkForgeDirectCost } from '@/lib/thinkforge/services/provider-cost-telemetry';

describe('ThinkForge provider cost telemetry', () => {
  beforeEach(() => {
    mocks.recordProviderCostEvent.mockReset().mockResolvedValue({
      ok: true,
      eventId: 'pce_test',
      inserted: true,
      duplicate: false,
    });
  });

  it('records privacy-safe correlation, accepted-profile, provenance, redaction, and retry evidence', async () => {
    await recordThinkForgeDirectCost({
      status: 'failed',
      action: 'script_writer',
      route: '/api/services/thinkforge/chat',
      provider: 'gemini',
      modelName: 'models/gemini-2.5-flash',
      operation: 'llm_structured_direct',
      promptChars: 40,
      outputChars: 20,
      correlationId: 'corr_generation_01',
      profileRecordId: 'profile_b_13',
      profileUpdatedAt: '2026-08-13T00:00:00.000Z',
      profileFingerprint: 'A'.repeat(64),
      factIds: ['project_fact_1', 'global_fact_2', 'project_fact_1'],
      sourceIds: ['brief_user', 'ref_pricing_pdf'],
      redactions: ['email', 'street_address', 'email'],
      redactionCount: 3,
      attempt: 2,
      retryCount: 1,
      failureCode: 'provider_timeout',
      error: new Error('alex@example.com and private Brand Vault values must never be logged'),
    });

    expect(mocks.recordProviderCostEvent).toHaveBeenCalledTimes(1);
    const event = mocks.recordProviderCostEvent.mock.calls[0]?.[0];
    expect(event).toMatchObject({
      status: 'failed',
      service: 'thinkforge',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      units: {
        requestCount: 1,
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        retryCount: 1,
      },
      metadata: {
        correlationId: 'corr_generation_01',
        profileRecordId: 'profile_b_13',
        profileUpdatedAt: '2026-08-13T00:00:00.000Z',
        profileFingerprint: 'a'.repeat(64),
        factIds: ['project_fact_1', 'global_fact_2'],
        sourceIds: ['brief_user', 'ref_pricing_pdf'],
        redactions: ['email', 'street_address'],
        redactionCount: 3,
        attempt: 2,
        failureCode: 'provider_timeout',
        errorClass: 'Error',
      },
    });
    expect(JSON.stringify(event)).not.toContain('alex@example.com');
    expect(JSON.stringify(event)).not.toContain('private Brand Vault values');
  });

  it('drops malformed or potentially sensitive telemetry values while preserving valid opaque IDs', async () => {
    await recordThinkForgeDirectCost({
      status: 'success',
      action: 'research',
      route: '/api/services/thinkforge/research',
      provider: 'gemini',
      modelName: 'gemini-2.5-flash',
      operation: 'llm_search_grounded_direct',
      correlationId: 'alex@example.com',
      profileRecordId: 'Priya Nair',
      profileUpdatedAt: 'DOB 1990-03-14',
      profileFingerprint: 'private brand voice',
      factIds: ['fact_safe', 'alex@example.com', '415-555-0101'],
      sourceIds: ['ref_safe', 'https://private.example.com/source'],
      redactions: ['email', 'alex_sharma'],
      redactionCount: -1,
      attempt: 0,
      retryCount: Number.NaN,
      failureCode: 'alex@example.com',
    });

    const event = mocks.recordProviderCostEvent.mock.calls[0]?.[0];
    expect(event.metadata).toMatchObject({
      factIds: ['fact_safe'],
      sourceIds: ['ref_safe'],
      redactions: ['email'],
    });
    expect(event.metadata.correlationId).toBeUndefined();
    expect(event.metadata.profileRecordId).toBeUndefined();
    expect(event.metadata.profileUpdatedAt).toBeUndefined();
    expect(event.metadata.profileFingerprint).toBeUndefined();
    expect(event.metadata.redactionCount).toBeUndefined();
    expect(event.metadata.attempt).toBeUndefined();
    expect(event.metadata.failureCode).toBeUndefined();
    expect(event.units.retryCount).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain('alex@example.com');
    expect(JSON.stringify(event)).not.toContain('Priya Nair');
    expect(JSON.stringify(event)).not.toContain('private.example.com');
  });
});
