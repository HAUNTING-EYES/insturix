import { describe, expect, it } from 'vitest';

import {
  assertMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1,
  createMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1,
  MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_POLICY_KIND_V1,
  resolveMediaSourceAudioEvidenceBackfillRecoveryLeaseExpiryV1,
  resolveMediaSourceAudioEvidenceBackfillRecoveryRetryAtV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-attempt-policy-v1';

describe('MediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1', () => {
  it('creates a self-hashed immutable policy and revalidates it', () => {
    const policy = attemptPolicy();

    expect(policy).toMatchObject({
      schemaVersion: 1,
      kind:
        MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_POLICY_KIND_V1,
      maxAttempts: 4,
      leaseMs: 60_000,
      retryBaseMs: 1_000,
      retryMaxMs: 2_500,
      policySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(assertMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1(
      structuredClone(policy),
    )).toEqual(policy);
  });

  it('rejects field expansion and any hash-bound material tamper', () => {
    const policy = attemptPolicy();

    expect(() => assertMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1({
      ...policy,
      unownedFallback: true,
    })).toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_POLICY_FIELDS_INVALID',
    );
    expect(() => assertMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1({
      ...policy,
      maxAttempts: 5,
    })).toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_POLICY_HASH_INVALID',
    );
  });

  it.each([
    [{ maxAttempts: 0 }, 'MAX_ATTEMPTS_INVALID'],
    [{ maxAttempts: 21 }, 'MAX_ATTEMPTS_INVALID'],
    [{ leaseMs: 999 }, 'LEASE_MS_INVALID'],
    [{ leaseMs: 86_400_001 }, 'LEASE_MS_INVALID'],
    [{ retryBaseMs: 999 }, 'RETRY_BASE_MS_INVALID'],
    [{ retryMaxMs: 999 }, 'RETRY_MAX_MS_INVALID'],
    [{ retryMaxMs: 604_800_001 }, 'RETRY_MAX_MS_INVALID'],
  ])('rejects an out-of-policy numeric bound: %o', (change, code) => {
    expect(() => createMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1({
      maxAttempts: 4,
      leaseMs: 60_000,
      retryBaseMs: 1_000,
      retryMaxMs: 2_500,
      ...change,
    })).toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_POLICY_' + code,
    );
  });

  it('resolves the exact lease boundary without rounding', () => {
    expect(resolveMediaSourceAudioEvidenceBackfillRecoveryLeaseExpiryV1(
      attemptPolicy(),
      '2026-08-30T22:00:00.123Z',
    )).toBe('2026-08-30T22:01:00.123Z');
  });

  it('uses bounded exponential retry and returns null at exhaustion', () => {
    const policy = attemptPolicy();
    const attemptedAt = '2026-08-30T22:00:00.000Z';

    expect(resolveMediaSourceAudioEvidenceBackfillRecoveryRetryAtV1(
      policy,
      1,
      attemptedAt,
    )).toBe('2026-08-30T22:00:01.000Z');
    expect(resolveMediaSourceAudioEvidenceBackfillRecoveryRetryAtV1(
      policy,
      2,
      attemptedAt,
    )).toBe('2026-08-30T22:00:02.000Z');
    expect(resolveMediaSourceAudioEvidenceBackfillRecoveryRetryAtV1(
      policy,
      3,
      attemptedAt,
    )).toBe('2026-08-30T22:00:02.500Z');
    expect(resolveMediaSourceAudioEvidenceBackfillRecoveryRetryAtV1(
      policy,
      4,
      attemptedAt,
    )).toBeNull();
  });

  it('rejects invalid attempt/time inputs and unrepresentable expiry', () => {
    const policy = attemptPolicy();

    expect(() => resolveMediaSourceAudioEvidenceBackfillRecoveryRetryAtV1(
      policy,
      0,
      '2026-08-30T22:00:00.000Z',
    )).toThrow('ATTEMPT_NUMBER_INVALID');
    expect(() => resolveMediaSourceAudioEvidenceBackfillRecoveryRetryAtV1(
      policy,
      5,
      '2026-08-30T22:00:00.000Z',
    )).toThrow('ATTEMPT_NUMBER_INVALID');
    expect(() => resolveMediaSourceAudioEvidenceBackfillRecoveryRetryAtV1(
      policy,
      1,
      '2026-08-30 22:00:00Z',
    )).toThrow('ATTEMPTED_AT_INVALID');
    expect(() => resolveMediaSourceAudioEvidenceBackfillRecoveryLeaseExpiryV1(
      policy,
      '+275760-09-13T00:00:00.000Z',
    )).toThrow('LEASE_EXPIRY_INVALID');
  });
});

function attemptPolicy() {
  return createMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1({
    maxAttempts: 4,
    leaseMs: 60_000,
    retryBaseMs: 1_000,
    retryMaxMs: 2_500,
  });
}
