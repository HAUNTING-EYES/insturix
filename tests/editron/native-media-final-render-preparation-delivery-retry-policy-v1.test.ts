import { describe, expect, it } from 'vitest';

import type { DurableWorkflowJobSnapshotV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import {
  assertNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1,
  createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1,
  createNativeMediaFinalRenderPreparationRetryPolicyOwnerV1,
} from '@/lib/editron/services/native-media-final-render-preparation-delivery-retry-policy-v1';

const CREATED_AT = '2026-08-30T00:00:00.000Z';
const EXPIRES_AT = '2026-08-30T00:10:00.000Z';

describe('native media final-render delivery/retry policy v1', () => {
  it('canonically binds every explicit lifecycle and delivery value', () => {
    const first = policy();
    const second = policy();

    expect(first).toEqual(second);
    expect(first.policySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.durableJob)).toBe(true);
    expect(Object.isFrozen(first.qstashDelivery)).toBe(true);
    expect(assertNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1(first))
      .toEqual(first);
  });

  it('changes identity when any attempt, retention, transport or worker value changes', () => {
    const baseline = policy().policySha256;
    expect(policy({ maxAttempts: 4 }).policySha256).not.toBe(baseline);
    expect(policy({ retentionMs: 700_000 }).policySha256).not.toBe(baseline);
    expect(policy({ retries: 1 }).policySha256).not.toBe(baseline);
    expect(policy({ retryDelayMs: 20_000 }).policySha256).not.toBe(baseline);
    expect(policy({ timeoutSeconds: 90 }).policySha256).not.toBe(baseline);
    expect(policy({ workerRetryDelayMs: 30_000 }).policySha256).not.toBe(baseline);
  });

  it('rejects omitted, extra, invalid and forged policy fields', () => {
    const valid = policy();
    expect(() => createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1({
      durableJob: { maxAttempts: 3, retentionMs: 600_000 },
      qstashDelivery: { retries: 2, retryDelayMs: 10_000, timeoutSeconds: 120 },
    } as never)).toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_DELIVERY_RETRY_POLICY_DECLARATION_FIELDS_INVALID',
    );
    expect(() => createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1({
      durableJob: { maxAttempts: 0, retentionMs: 600_000 },
      qstashDelivery: { retries: 2, retryDelayMs: 10_000, timeoutSeconds: 120 },
      workerRetry: { delayMs: 60_000 },
    })).toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_DELIVERY_RETRY_POLICY_MAX_ATTEMPTS_INVALID',
    );
    expect(() => assertNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1({
      ...valid,
      unexpected: true,
    })).toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_DELIVERY_RETRY_POLICY_POLICY_FIELDS_INVALID',
    );
    expect(() => assertNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1({
      ...valid,
      policySha256: 'f'.repeat(64),
    })).toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_DELIVERY_RETRY_POLICY_POLICY_SHA256_MISMATCH',
    );
  });

  it('issues a deterministic retry decision only for the bound running job', () => {
    const owner = createNativeMediaFinalRenderPreparationRetryPolicyOwnerV1(policy());
    const input = {
      job: job(),
      errorCode: 'SOURCE_DOWNLOAD_TRANSIENT',
      now: new Date('2026-08-30T00:02:00.000Z'),
    };
    const first = owner.decideRetry(input);
    const second = owner.decideRetry(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      disposition: 'RETRY_AT',
      retryAtIso: '2026-08-30T00:03:00.000Z',
    });
    expect(first.decisionSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(owner).toMatchObject({
      ownerId: policy().ownerId,
      ownerVersion: policy().ownerVersion,
      policySha256: policy().policySha256,
    });
  });

  it('dead-letters exhausted or retention-incompatible retries', () => {
    const owner = createNativeMediaFinalRenderPreparationRetryPolicyOwnerV1(policy());
    expect(owner.decideRetry({
      job: job({ attemptCount: 3, remainingAttempts: 0 }),
      errorCode: 'SOURCE_DOWNLOAD_TRANSIENT',
      now: new Date('2026-08-30T00:02:00.000Z'),
    })).toMatchObject({
      disposition: 'DEAD_LETTER', reason: 'ATTEMPTS_EXHAUSTED',
    });
    expect(owner.decideRetry({
      job: job(),
      errorCode: 'SOURCE_DOWNLOAD_TRANSIENT',
      now: new Date('2026-08-30T00:09:30.000Z'),
    })).toMatchObject({
      disposition: 'DEAD_LETTER', reason: 'RETENTION_EXHAUSTED',
    });
  });

  it('rejects status, attempt and retention drift before making a decision', () => {
    const owner = createNativeMediaFinalRenderPreparationRetryPolicyOwnerV1(policy());
    const decide = (overrides: Readonly<Record<string, unknown>>) => owner.decideRetry({
      job: job(overrides),
      errorCode: 'SOURCE_DOWNLOAD_TRANSIENT',
      now: new Date('2026-08-30T00:02:00.000Z'),
    });
    for (const overrides of [
      { status: 'retry_wait' },
      { maxAttempts: 4 },
      { attemptCount: 2, remainingAttempts: 2 },
      { expiresAt: '2026-08-30T00:11:00.000Z' },
    ]) {
      expect(() => decide(overrides)).toThrow(
        'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_DELIVERY_RETRY_POLICY_JOB_LIFECYCLE_BINDING_INVALID',
      );
    }
  });
});

function policy(overrides: Readonly<{
  maxAttempts?: number;
  retentionMs?: number;
  retries?: number;
  retryDelayMs?: number;
  timeoutSeconds?: number;
  workerRetryDelayMs?: number;
}> = {}) {
  return createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1({
    durableJob: {
      maxAttempts: overrides.maxAttempts ?? 3,
      retentionMs: overrides.retentionMs ?? 600_000,
    },
    qstashDelivery: {
      retries: overrides.retries ?? 2,
      retryDelayMs: overrides.retryDelayMs ?? 10_000,
      timeoutSeconds: overrides.timeoutSeconds ?? 120,
    },
    workerRetry: { delayMs: overrides.workerRetryDelayMs ?? 60_000 },
  });
}

function job(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    jobId: 'dwj_exact_render_1',
    status: 'running',
    maxAttempts: 3,
    attemptCount: 1,
    remainingAttempts: 2,
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  } as unknown as DurableWorkflowJobSnapshotV1;
}
