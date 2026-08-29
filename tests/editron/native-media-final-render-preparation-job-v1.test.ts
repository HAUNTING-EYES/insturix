import { describe, expect, it } from 'vitest';

import type { DurableWorkflowJobRecordV1 } from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 } from '@/lib/editron/services/durable-workflow-job-store-v1';
import {
  assertNativeMediaFinalRenderPreparationJobInputV1,
  buildNativeMediaFinalRenderPreparationJobContractV1,
  createOrGetNativeMediaFinalRenderPreparationJobV1,
  NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_PROFILE_V1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1,
} from '@/lib/editron/services/native-media-final-render-preparation-job-v1';
import { createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1 }
  from '@/lib/editron/services/native-media-final-render-preparation-delivery-retry-policy-v1';
import { NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1 } from '@/lib/editron/services/native-media-final-render-ffmpeg-encoder-v1';
import { NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1 } from '@/lib/editron/services/native-media-final-render-materializer-v1';
import { NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1 } from '@/lib/editron/services/native-media-final-render-profile-v1';
import { createNativeMediaFinalRenderPreparationRuntimePolicyV1 } from '@/lib/editron/services/native-media-final-render-preparation-runtime-policy-v1';
import { NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1 } from '@/lib/editron/services/native-media-final-render-r2-private-artifact-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const sha = (character: string) => character.repeat(64);
const NOW = new Date('2026-08-30T00:00:00.000Z');

function request(overlayId = 'overlay_exact_1') {
  return {
    overlayId,
    assetId: `asset_${overlayId}`,
    overlayTimingSha256: sha('1'),
    assetTimingStateSha256: sha('2'),
    sourceVersionSha256: sha('3'),
    storageVersionSha256: sha('4'),
    sourceBindingSha256: sha('5'),
    sourcePtsCadenceMapStateSha256V3: sha('6'),
    renderNativeAudio: true,
  } as const;
}

function input() {
  return {
    tenantId: 'tenant_1',
    userId: 'user_1',
    orgId: null,
    projectId: 'project_1',
    sequenceId: 'main',
    projectRevision: {
      schemaVersion: 1 as const,
      value: 12,
      compatibilityUpdatedAt: '2026-08-30T00:00:00.000Z',
    },
    admissionReceiptSha256: sha('7'),
    budgetReservation: { reservationId: 'render_budget_1', bindingSha256: sha('d') },
    exactSourceRequest: request(),
    policyBindings: {
      materializerPolicyVersion: NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1,
      materializerPolicySha256: sha('8'),
      encoderPolicyVersion: NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1,
      encoderPolicySha256: sha('9'),
      privateArtifactPolicyVersion:
        NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
      privateArtifactPolicySha256: sha('a'),
      runtimePolicy: runtimePolicy(),
    },
    executionProfile: {
      workerImageDigest: `sha256:${sha('b')}`,
      compatibilityProfileVersion: NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1,
      compatibilityReceiptSha256: sha('c'),
    },
  } as const;
}

describe('native final-render durable preparation job binding v1', () => {
  it('creates one idempotent shared-store job per exact source', async () => {
    const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
    const jobStore = new DurableWorkflowJobStoreV1(async () => collection.asCollection());
    const first = await createOrGetNativeMediaFinalRenderPreparationJobV1({
      jobStore, request: input(), deliveryRetryPolicy: deliveryRetryPolicy(), now: NOW,
    });
    const replay = await createOrGetNativeMediaFinalRenderPreparationJobV1({
      jobStore, request: input(), deliveryRetryPolicy: deliveryRetryPolicy(),
      now: new Date(NOW.getTime() + 1_000),
    });
    const secondSource = await createOrGetNativeMediaFinalRenderPreparationJobV1({
      jobStore,
      request: { ...input(), exactSourceRequest: request('overlay_exact_2') },
      deliveryRetryPolicy: deliveryRetryPolicy(),
      now: NOW,
    });

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.job.jobId).toBe(first.job.jobId);
    expect(secondSource.job.jobId).not.toBe(first.job.jobId);
    expect(first.job).toMatchObject({
      operationOwner: 'NATIVE_MEDIA_FINAL_RENDER',
      operationKind: 'native_media_final_render_prepare_source',
      projectId: 'project_1',
      maxAttempts: deliveryRetryPolicy().durableJob.maxAttempts,
      budgetReservation: { reservationId: 'render_budget_1', bindingSha256: sha('d') },
      input: { schemaId: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1 },
    });
    expect(JSON.stringify(first.job.input.payload)).not.toMatch(/sourceUrl|https?:\/\//i);
    expect(Date.parse(first.job.expiresAt) - Date.parse(first.job.createdAt))
      .toBe(deliveryRetryPolicy().durableJob.retentionMs);
    expect(collection.snapshot()).toHaveLength(2);
  });

  it('rejects delivery/retry policy drift before durable job creation', async () => {
    const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
    const jobStore = new DurableWorkflowJobStoreV1(async () => collection.asCollection());

    await expect(createOrGetNativeMediaFinalRenderPreparationJobV1({
      jobStore,
      request: input(),
      deliveryRetryPolicy: deliveryRetryPolicy({ workerRetryDelayMs: 2_000 }),
      now: NOW,
    })).rejects.toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_DELIVERY_RETRY_POLICY_BINDING_MISMATCH',
    );
    expect(collection.snapshot()).toEqual([]);
  });

  it('binds exact project, admission, source, policy and worker-image identity without URLs', () => {
    const contract = buildNativeMediaFinalRenderPreparationJobContractV1(input());

    expect(contract.operationIdentity).toMatch(/^nmfrprep_[a-f0-9]{64}$/);
    expect(contract.bindingSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(contract.payload).toMatchObject({
      version: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1,
      projectId: 'project_1',
      sequenceId: 'main',
      artifactProfile: NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_PROFILE_V1,
      admissionReceiptSha256: sha('7'),
    });
    expect(contract.dependencies.map(({ dependencyId }) => dependencyId)).toEqual([
      'admission-receipt',
      'encoder-policy',
      'exact-source-request',
      'execution-budget',
      'execution-budget-policy',
      'heartbeat-policy',
      'materializer-policy',
      'private-artifact-policy',
      'project-revision',
      'retry-policy',
      'runtime-policy',
      'runtime-profile-receipt',
      'worker-image',
    ]);
    expect(JSON.stringify(contract)).not.toMatch(/sourceUrl|https:\/\//);
    expect(Object.isFrozen(contract.payload.exactSourceRequest)).toBe(true);
  });

  it('is canonical across object-key order and changes for material scope changes', () => {
    const first = buildNativeMediaFinalRenderPreparationJobContractV1(input());
    const reordered = buildNativeMediaFinalRenderPreparationJobContractV1({
      ...input(),
      exactSourceRequest: {
        renderNativeAudio: true,
        sourcePtsCadenceMapStateSha256V3: sha('6'),
        sourceBindingSha256: sha('5'),
        storageVersionSha256: sha('4'),
        sourceVersionSha256: sha('3'),
        assetTimingStateSha256: sha('2'),
        overlayTimingSha256: sha('1'),
        assetId: 'asset_overlay_exact_1',
        overlayId: 'overlay_exact_1',
      },
    });
    const changed = buildNativeMediaFinalRenderPreparationJobContractV1({
      ...input(),
      projectRevision: { ...input().projectRevision, value: 13 },
    });

    expect(reordered).toEqual(first);
    expect(changed.operationIdentity).not.toBe(first.operationIdentity);
    expect(buildNativeMediaFinalRenderPreparationJobContractV1({
      ...input(),
      exactSourceRequest: request('overlay_exact_2'),
    }).operationIdentity).not.toBe(first.operationIdentity);
    expect(buildNativeMediaFinalRenderPreparationJobContractV1({
      ...input(),
      budgetReservation: { reservationId: 'render_budget_2', bindingSha256: sha('e') },
    }).operationIdentity).not.toBe(first.operationIdentity);
    expect(buildNativeMediaFinalRenderPreparationJobContractV1({
      ...input(),
      policyBindings: {
        ...input().policyBindings,
        runtimePolicy: runtimePolicy({ retryPolicySha256: sha('1') }),
      },
    }).operationIdentity).not.toBe(first.operationIdentity);
  });

  it('rejects forged fields, request hashes, aggregate inputs and execution profiles', () => {
    const valid = buildNativeMediaFinalRenderPreparationJobContractV1(input()).payload;
    expect(() => assertNativeMediaFinalRenderPreparationJobInputV1({
      ...valid,
      unexpected: true,
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_FIELDS_INVALID');
    expect(() => assertNativeMediaFinalRenderPreparationJobInputV1({
      ...valid,
      exactSourceRequestSha256: sha('f'),
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_REQUEST_HASH_INVALID');
    expect(() => assertNativeMediaFinalRenderPreparationJobInputV1({
      ...valid,
      exactSourceRequest: [request(), request()],
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_REQUEST_INVALID');
    expect(() => assertNativeMediaFinalRenderPreparationJobInputV1({
      ...valid,
      budgetReservation: null,
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_BUDGET_INVALID');
    expect(() => assertNativeMediaFinalRenderPreparationJobInputV1({
      ...valid,
      budgetReservation: { ...valid.budgetReservation, unexpected: true },
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_BUDGET_FIELDS_INVALID');
    expect(() => assertNativeMediaFinalRenderPreparationJobInputV1({
      ...valid,
      budgetReservation: { ...valid.budgetReservation, bindingSha256: 'not-a-sha' },
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_BUDGET_RESERVATION_BINDING_SHA256_INVALID');
    expect(() => assertNativeMediaFinalRenderPreparationJobInputV1({
      ...valid,
      version: 'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_V1_2',
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_VERSION_INVALID');
    expect(() => buildNativeMediaFinalRenderPreparationJobContractV1({
      ...input(),
      executionProfile: {
        ...input().executionProfile,
        workerImageDigest: sha('b'),
      },
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_EXECUTION_PROFILE_INVALID');
  });

  it('rejects policy and profile drift', () => {
    const valid = buildNativeMediaFinalRenderPreparationJobContractV1(input()).payload;
    expect(() => assertNativeMediaFinalRenderPreparationJobInputV1({
      ...valid,
      executionProfile: {
        ...valid.executionProfile,
        compatibilityProfileVersion: 'EDITRON_UNKNOWN_PROFILE',
      },
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_EXECUTION_PROFILE_INVALID');
    expect(() => assertNativeMediaFinalRenderPreparationJobInputV1({
      ...valid,
      policyBindings: {
        ...valid.policyBindings,
        encoderPolicyVersion: 'EDITRON_UNKNOWN_ENCODER',
      },
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_POLICY_VERSION_INVALID');
    expect(() => assertNativeMediaFinalRenderPreparationJobInputV1({
      ...valid,
      policyBindings: {
        ...valid.policyBindings,
        runtimePolicy: {
          ...valid.policyBindings.runtimePolicy,
          bindingSha256: sha('0'),
        },
      },
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_RUNTIME_POLICY_BINDING_MISMATCH');

    const { runtimePolicy: _runtimePolicy, ...legacyPolicyBindings } = input().policyBindings;
    expect(_runtimePolicy).toBeDefined();
    expect(() => buildNativeMediaFinalRenderPreparationJobContractV1({
      ...input(),
      policyBindings: legacyPolicyBindings as never,
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_POLICY_FIELDS_INVALID');
  });
});

function runtimePolicy(overrides: Readonly<{
  retryPolicySha256?: string;
}> = {}) {
  const policy = deliveryRetryPolicy();
  return createNativeMediaFinalRenderPreparationRuntimePolicyV1({
    executionBudget: {
      ownerId: 'EXACT_RENDER_BUDGET_OWNER',
      ownerVersion: '3',
      policySha256: sha('e'),
    },
    retryPolicy: {
      ownerId: policy.ownerId,
      ownerVersion: policy.ownerVersion,
      policySha256: overrides.retryPolicySha256 ?? policy.policySha256,
    },
    heartbeatPolicySha256: sha('0'),
  });
}

function deliveryRetryPolicy(overrides: Readonly<{
  workerRetryDelayMs?: number;
}> = {}) {
  return createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1({
    durableJob: { maxAttempts: 5, retentionMs: 7 * 24 * 60 * 60 * 1_000 },
    qstashDelivery: { retries: 2, retryDelayMs: 10_000, timeoutSeconds: 120 },
    workerRetry: { delayMs: overrides.workerRetryDelayMs ?? 1_000 },
  });
}
