import { describe, expect, it, vi } from 'vitest';

import type { DurableWorkflowJobRecordV1 } from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 } from '@/lib/editron/services/durable-workflow-job-store-v1';
import { NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-ffmpeg-encoder-v1';
import { NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-materializer-v1';
import {
  assertNativeMediaFinalRenderPreparationWorkerMessageV1,
  dispatchNativeMediaFinalRenderPreparationJobV1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_MESSAGE_VERSION_V1,
  recoverNativeMediaFinalRenderPreparationJobsV1,
  type NativeMediaFinalRenderPreparationDispatchEnvironmentV1,
  type NativeMediaFinalRenderPreparationQStashPublisherV1,
} from '@/lib/editron/services/native-media-final-render-preparation-durable-dispatch-v1';
import { createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1 }
  from '@/lib/editron/services/native-media-final-render-preparation-delivery-retry-policy-v1';
import { createNativeMediaFinalRenderPreparationRetryPolicyRegistryV1 }
  from '@/lib/editron/services/native-media-final-render-preparation-delivery-retry-policy-registry-v1';
import { createOrGetNativeMediaFinalRenderPreparationJobV1 }
  from '@/lib/editron/services/native-media-final-render-preparation-job-v1';
import { createNativeMediaFinalRenderPreparationRuntimePolicyV1 }
  from '@/lib/editron/services/native-media-final-render-preparation-runtime-policy-v1';
import { NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-profile-v1';
import { NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-r2-private-artifact-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const START = new Date('2026-08-30T02:00:00.000Z');
const sha = (character: string) => character.repeat(64);
const ENV: NativeMediaFinalRenderPreparationDispatchEnvironmentV1 = {
  QSTASH_TOKEN: 'qstash-token',
  QSTASH_CURRENT_SIGNING_KEY: 'current-signing-key',
  QSTASH_NEXT_SIGNING_KEY: 'next-signing-key',
  VERCEL_URL: 'editron-preview.example.test',
};
type PublishInputV1 = Parameters<
  NativeMediaFinalRenderPreparationQStashPublisherV1['publishJSON']
>[0];
type PublishResultV1 = ReturnType<
  NativeMediaFinalRenderPreparationQStashPublisherV1['publishJSON']
>;

describe('native final-render preparation durable dispatch v1', () => {
  it('fails configuration before creating a durable job', async () => {
    const createOrGet = vi.fn();
    const policy = retryPolicy(1, 7_000, 90);
    await expect(dispatchNativeMediaFinalRenderPreparationJobV1({
      ...dispatchInput(policy),
      jobStore: { createOrGet, recordDispatch: vi.fn() },
      env: { ...ENV, QSTASH_NEXT_SIGNING_KEY: undefined },
      publisher: publisher('unused'),
      now: START,
    })).rejects.toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_DISPATCH_MISSING_QSTASH_SIGNING_KEYS',
    );
    expect(createOrGet).not.toHaveBeenCalled();
  });

  it('publishes only version and jobId with the active policy and records replay', async () => {
    const setup = jobStore();
    const policy = retryPolicy(1, 7_000, 90);
    const publishJSON = vi.fn<[PublishInputV1], PublishResultV1>(
      async () => ({ messageId: 'message-1' }),
    );
    const input = {
      ...dispatchInput(policy), jobStore: setup.store, env: ENV,
      publisher: { publishJSON }, now: START,
    };

    const first = await dispatchNativeMediaFinalRenderPreparationJobV1(input);
    expect(first).toMatchObject({ state: 'dispatched', created: true, messageId: 'message-1' });
    const published = publishJSON.mock.calls[0]![0] as PublishInputV1;
    expect(published.url).toBe(
      'https://editron-preview.example.test/api/internal/workers/native-media-final-render-preparation',
    );
    expect(published.body).toEqual({
      version: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_MESSAGE_VERSION_V1,
      jobId: first.jobId,
    });
    expect(Object.keys(published.body as object).sort()).toEqual(['jobId', 'version']);
    expect(published).toMatchObject({ retries: 1, retryDelay: '7000', timeout: 90 });
    expect(published.deduplicationId).toBe(first.jobId);

    await expect(dispatchNativeMediaFinalRenderPreparationJobV1(input)).resolves.toMatchObject({
      state: 'already_dispatched', jobId: first.jobId, created: false,
    });
    expect(publishJSON).toHaveBeenCalledOnce();
  });

  it('rejects a request bound to a policy other than the registry active policy', async () => {
    const setup = jobStore();
    const active = retryPolicy(1, 7_000, 90);
    const other = retryPolicy(2, 8_000, 120);
    const input = dispatchInput(active);
    await expect(dispatchNativeMediaFinalRenderPreparationJobV1({
      ...input,
      request: request(other),
      jobStore: setup.store,
      env: ENV,
      publisher: publisher('unused'),
      now: START,
    })).rejects.toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_DELIVERY_RETRY_POLICY_BINDING_MISMATCH',
    );
    expect(setup.collection.snapshot()).toEqual([]);
  });

  it('recovers an old job through its retained policy after active rotation', async () => {
    const setup = jobStore();
    const oldPolicy = retryPolicy(1, 7_000, 90);
    const activePolicy = retryPolicy(2, 8_000, 120);
    const created = await createOrGetNativeMediaFinalRenderPreparationJobV1({
      jobStore: setup.store,
      request: { tenantId: 'tenant-1', userId: 'user-1', orgId: null, ...request(oldPolicy) },
      deliveryRetryPolicy: oldPolicy,
      now: START,
    });
    const otherKind = { ...created.job, jobId: 'dwj_other', operationKind: 'other_operation' };
    const publishJSON = vi.fn<[PublishInputV1], PublishResultV1>(
      async () => ({ messageId: 'message-recovery' }),
    );
    const result = await recoverNativeMediaFinalRenderPreparationJobsV1({
      jobStore: {
        listRecoverable: vi.fn(async () => [created.job, otherKind]),
        recordDispatch: setup.store.recordDispatch.bind(setup.store),
      },
      policyRegistry: registry(activePolicy, [oldPolicy]),
      staleBefore: new Date(START.getTime() + 60_000),
      now: new Date(START.getTime() + 120_000),
      env: ENV,
      publisher: { publishJSON },
    });

    expect(result).toMatchObject({ scanned: 2, eligible: 1, skipped: 1 });
    expect(result.results).toEqual([{
      state: 'dispatched', jobId: created.job.jobId, messageId: 'message-recovery',
    }]);
    const published = publishJSON.mock.calls[0]![0] as PublishInputV1;
    expect(published).toMatchObject({ retries: 1, retryDelay: '7000', timeout: 90 });
    expect(published.deduplicationId).toMatch(/^[a-f0-9]{64}$/);
  });

  it('reports an unavailable historical policy without publishing or substituting active',
    async () => {
      const setup = jobStore();
      const oldPolicy = retryPolicy(1, 7_000, 90);
      const activePolicy = retryPolicy(2, 8_000, 120);
      const created = await createOrGetNativeMediaFinalRenderPreparationJobV1({
        jobStore: setup.store,
        request: { tenantId: 'tenant-1', userId: 'user-1', orgId: null, ...request(oldPolicy) },
        deliveryRetryPolicy: oldPolicy,
        now: START,
      });
      const publishJSON = vi.fn(async () => ({ messageId: 'must-not-publish' }));
      const result = await recoverNativeMediaFinalRenderPreparationJobsV1({
        jobStore: {
          listRecoverable: vi.fn(async () => [created.job]),
          recordDispatch: setup.store.recordDispatch.bind(setup.store),
        },
        policyRegistry: registry(activePolicy, []),
        staleBefore: new Date(START.getTime() + 60_000),
        now: new Date(START.getTime() + 120_000),
        env: ENV,
        publisher: { publishJSON },
      });

      expect(result.results).toEqual([{
        state: 'policy_unavailable',
        jobId: created.job.jobId,
        reason: 'RETRY_POLICY_UNAVAILABLE',
      }]);
      expect(publishJSON).not.toHaveBeenCalled();
    });

  it('rejects extra or missing worker-message fields', () => {
    expect(() => assertNativeMediaFinalRenderPreparationWorkerMessageV1({
      version: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_MESSAGE_VERSION_V1,
      jobId: 'dwj_1', sourceUrl: 'https://must-not-enter.example/source.mov',
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_DISPATCH_WORKER_MESSAGE_INVALID');
    expect(() => assertNativeMediaFinalRenderPreparationWorkerMessageV1({
      jobId: 'dwj_1',
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_DISPATCH_WORKER_MESSAGE_INVALID');
  });
});

function dispatchInput(policy: ReturnType<typeof retryPolicy>) {
  return {
    actor: { tenantId: 'tenant-1', userId: 'user-1', orgId: null },
    request: request(policy),
    policyRegistry: registry(policy, []),
  };
}

function request(policy: ReturnType<typeof retryPolicy>) {
  return {
    projectId: 'project-1', sequenceId: 'main',
    projectRevision: {
      schemaVersion: 1 as const, value: 12, compatibilityUpdatedAt: START.toISOString(),
    },
    admissionReceiptSha256: sha('7'),
    budgetReservation: { reservationId: 'render-budget-1', bindingSha256: sha('0') },
    exactSourceRequest: {
      overlayId: 'overlay-1', assetId: 'asset-1', overlayTimingSha256: sha('1'),
      assetTimingStateSha256: sha('2'), sourceVersionSha256: sha('3'),
      storageVersionSha256: sha('4'), sourceBindingSha256: sha('5'),
      sourcePtsCadenceMapStateSha256V3: sha('6'), renderNativeAudio: true,
    },
    policyBindings: {
      materializerPolicyVersion: NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1,
      materializerPolicySha256: sha('8'),
      encoderPolicyVersion: NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1,
      encoderPolicySha256: sha('9'),
      privateArtifactPolicyVersion:
        NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
      privateArtifactPolicySha256: sha('a'),
      runtimePolicy: createNativeMediaFinalRenderPreparationRuntimePolicyV1({
        executionBudget: {
          ownerId: 'TEST_RENDER_BUDGET_OWNER', ownerVersion: 'TEST_RENDER_BUDGET_OWNER_V1',
          policySha256: sha('b'),
        },
        retryPolicy: {
          ownerId: policy.ownerId,
          ownerVersion: policy.ownerVersion,
          policySha256: policy.policySha256,
        },
        heartbeatPolicySha256: sha('c'),
      }),
    },
    executionProfile: {
      workerImageDigest: `sha256:${sha('d')}`,
      compatibilityProfileVersion: NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1,
      compatibilityReceiptSha256: sha('e'),
    },
  } as const;
}

function retryPolicy(retries: number, retryDelayMs: number, timeoutSeconds: number) {
  return createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1({
    durableJob: { maxAttempts: 5, retentionMs: 7 * 24 * 60 * 60 * 1_000 },
    qstashDelivery: { retries, retryDelayMs, timeoutSeconds },
    workerRetry: { delayMs: 1_000 },
  });
}

function registry(
  activePolicy: ReturnType<typeof retryPolicy>,
  retainedPolicies: readonly ReturnType<typeof retryPolicy>[],
) {
  return createNativeMediaFinalRenderPreparationRetryPolicyRegistryV1({
    activePolicy, retainedPolicies,
  });
}

function jobStore() {
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  return {
    collection,
    store: new DurableWorkflowJobStoreV1(async () => collection.asCollection()),
  };
}

function publisher(messageId: string) {
  return { publishJSON: vi.fn(async () => ({ messageId })) };
}
