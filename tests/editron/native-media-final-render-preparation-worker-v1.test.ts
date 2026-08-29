import { describe, expect, it, vi } from 'vitest';

import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobRecordV1,
} from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 } from '@/lib/editron/services/durable-workflow-job-store-v1';
import { NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-ffmpeg-encoder-v1';
import {
  buildNativeMediaFinalRenderPreparationJobContractV1,
  createOrGetNativeMediaFinalRenderPreparationJobV1,
} from '@/lib/editron/services/native-media-final-render-preparation-job-v1';
import { createNativeMediaFinalRenderPreparationRuntimePolicyV1 }
  from '@/lib/editron/services/native-media-final-render-preparation-runtime-policy-v1';
import { NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-materializer-v1';
import { NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-profile-v1';
import { NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-r2-private-artifact-v1';
import { createNativeMediaFinalRenderArtifactV1 }
  from '@/lib/editron/services/native-media-final-render-source-preparation-v1';
import {
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OWNER_ID_V1,
  runNativeMediaFinalRenderPreparationWorkerV1,
  type NativeMediaFinalRenderArtifactPreparationOwnerV1,
  type NativeMediaFinalRenderPreparationBudgetOwnerV1,
} from '@/lib/editron/services/native-media-final-render-preparation-worker-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const START = new Date('2026-08-30T01:00:00.000Z');
const sha = (character: string) => character.repeat(64);

describe('native final-render durable preparation worker v1', () => {
  it('authorizes, prepares, persists URL-free state, completes, and resettles terminal replay',
    async () => {
      const fixture = await workerFixture();

      expect(await fixture.run()).toMatchObject({
        kind: 'completed', jobId: fixture.jobId, disposition: 'PASS',
      });
      const completed = await fixture.snapshot();
      expect(completed).toMatchObject({
        status: 'completed',
        resumeState: { sequence: 1 },
        terminalReceipt: { disposition: 'PASS' },
      });
      expect(completed?.terminalReceipt?.proofReferences.map(({ proofId }) => proofId))
        .toEqual([
          'execution-budget-authorization', 'exact-render-artifact',
          'exact-render-result', 'runtime-profile-receipt',
        ]);
      expect(JSON.stringify(completed?.resumeState)).not.toMatch(/sourceUrl|https?:\/\//i);
      expect(fixture.preparationOwner.prepare).toHaveBeenCalledTimes(1);
      expect(fixture.budgetOwner.authorize).toHaveBeenCalledTimes(1);
      expect(fixture.budgetOwner.settleTerminal).toHaveBeenCalledTimes(1);

      expect(await fixture.run()).toEqual({ kind: 'skipped', reason: 'terminal' });
      expect(fixture.preparationOwner.prepare).toHaveBeenCalledTimes(1);
      expect(fixture.budgetOwner.authorize).toHaveBeenCalledTimes(1);
      expect(fixture.budgetOwner.settleTerminal).toHaveBeenCalledTimes(2);
    });

  it('resumes the persisted artifact without preparing again after a lost completion response',
    async () => {
      const fixture = await workerFixture();
      let failComplete = true;
      const failingStore = storePorts(fixture.jobStore, async (args) => {
        if (failComplete) {
          failComplete = false;
          throw new Error('simulated completion transport loss');
        }
        return fixture.jobStore.complete(args);
      });

      expect(await fixture.run({ jobStore: failingStore })).toEqual({
        kind: 'retry_wait',
        jobId: fixture.jobId,
        errorCode:
          'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_POST_RESUME_TRANSITION_FAILED',
      });
      expect(await fixture.snapshot()).toMatchObject({
        status: 'retry_wait', resumeState: { sequence: 1 },
      });

      fixture.advance(1_001);
      expect(await fixture.run()).toMatchObject({ kind: 'completed', disposition: 'PASS' });
      expect(fixture.preparationOwner.prepare).toHaveBeenCalledTimes(1);
      expect(fixture.budgetOwner.authorize).toHaveBeenCalledTimes(2);
    });

  it('dead-letters a canonically rehashed but forged resume result without re-preparing',
    async () => {
      const fixture = await workerFixture();
      const failingStore = storePorts(fixture.jobStore, async () => {
        throw new Error('simulated completion transport loss');
      });
      expect(await fixture.run({ jobStore: failingStore })).toMatchObject({ kind: 'retry_wait' });
      const record = fixture.collection.snapshot()
        .find(({ jobId }) => jobId === fixture.jobId)!;
      const forgedPayload = {
        ...record.resumeState!.payload,
        publishHandle: `nmfrpubv1_${sha('e')}`,
      };
      await fixture.collection.updateOne(
        { _id: fixture.jobId },
        { $set: { resumeState: {
          ...record.resumeState,
          payload: forgedPayload,
          stateSha256: hashDurableWorkflowJobJsonV1(forgedPayload),
        } } },
      );

      fixture.advance(1_001);
      expect(await fixture.run()).toEqual({
        kind: 'dead_letter',
        jobId: fixture.jobId,
        errorCode: 'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RESUME_INVALID',
      });
      expect(fixture.preparationOwner.prepare).toHaveBeenCalledTimes(1);
      expect(fixture.budgetOwner.settleTerminal).toHaveBeenCalledTimes(1);
    });

  it('terminalizes an owner-proved materialization gap as UNVERIFIABLE', async () => {
    const fixture = await workerFixture();
    fixture.preparationOwner.prepare.mockResolvedValueOnce({
      disposition: 'UNVERIFIABLE',
      diagnosticCode: 'NATIVE_MEDIA_FINAL_RENDER_SOURCE_SCOPE_STALE',
      proofSha256: sha('f'),
    });

    expect(await fixture.run()).toMatchObject({
      kind: 'completed', disposition: 'UNVERIFIABLE',
    });
    const completed = await fixture.snapshot();
    expect(completed).toMatchObject({
      status: 'completed', resumeState: null,
      terminalReceipt: { disposition: 'UNVERIFIABLE' },
    });
    expect(completed?.terminalReceipt?.proofReferences).toEqual([
      {
        proofId: 'execution-budget-authorization',
        proofSha256: sha('e'),
        disposition: 'PASS',
      },
      {
        proofId: 'exact-render-preparation',
        proofSha256: sha('f'),
        disposition: 'UNVERIFIABLE',
      },
    ]);
  });

  it('blocks a denied budget before materialization and settles the dead letter', async () => {
    const fixture = await workerFixture();
    fixture.budgetOwner.authorize.mockResolvedValueOnce({
      disposition: 'BLOCKED',
      errorCode: 'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_BUDGET_NOT_AUTHORIZED',
      retryable: false,
    });

    expect(await fixture.run()).toEqual({
      kind: 'dead_letter',
      jobId: fixture.jobId,
      errorCode: 'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_BUDGET_NOT_AUTHORIZED',
    });
    expect(fixture.preparationOwner.prepare).not.toHaveBeenCalled();
    expect(fixture.budgetOwner.settleTerminal).toHaveBeenCalledTimes(1);
  });

  it('rejects worker-image drift before budget or materialization access', async () => {
    const fixture = await workerFixture();
    expect(await fixture.run({
      runtimeContract: {
        ...fixture.runtimeContract,
        executionProfile: {
          ...fixture.runtimeContract.executionProfile,
          workerImageDigest: `sha256:${sha('0')}`,
        },
      },
    })).toEqual({
      kind: 'dead_letter',
      jobId: fixture.jobId,
      errorCode: 'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RUNTIME_BINDING_MISMATCH',
    });
    expect(fixture.budgetOwner.authorize).not.toHaveBeenCalled();
    expect(fixture.preparationOwner.prepare).not.toHaveBeenCalled();
  });

  it('honours cancellation observed inside the long-running preparation owner', async () => {
    const fixture = await workerFixture();
    fixture.preparationOwner.prepare.mockImplementationOnce(async ({ lifecycle }) => {
      await fixture.jobStore.requestCancellation({
        jobId: fixture.jobId,
        tenantId: 'tenant_1',
        userId: 'user_1',
        requestedBy: 'user_1',
        reason: 'cancel_exact_render_preparation',
        now: fixture.now(),
      });
      await lifecycle.heartbeat();
      return { disposition: 'PREPARED', publishHandle: 'unreachable', artifact: artifact(
        fixture.contract.payload,
      ) };
    });

    expect(await fixture.run()).toEqual({ kind: 'cancelled', jobId: fixture.jobId });
    expect(await fixture.snapshot()).toMatchObject({
      status: 'cancelled', terminalReceipt: { disposition: 'CANCELLED' },
    });
    expect(fixture.budgetOwner.settleTerminal).toHaveBeenCalledTimes(1);
  });
});

async function workerFixture() {
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  const jobStore = new DurableWorkflowJobStoreV1(async () => collection.asCollection());
  let nowMs = START.getTime();
  const request = jobRequest();
  const created = await createOrGetNativeMediaFinalRenderPreparationJobV1({
    jobStore,
    request,
    now: new Date(nowMs),
  });
  const contract = buildNativeMediaFinalRenderPreparationJobContractV1(request);
  const runtimeContract = Object.freeze({
    policyBindings: request.policyBindings,
    executionProfile: request.executionProfile,
  });
  const budgetOwner = {
    ownerId: 'TEST_RENDER_BUDGET_OWNER',
    ownerVersion: 'TEST_RENDER_BUDGET_OWNER_V1',
    authorize: vi.fn<
      Parameters<NativeMediaFinalRenderPreparationBudgetOwnerV1['authorize']>,
      ReturnType<NativeMediaFinalRenderPreparationBudgetOwnerV1['authorize']>
    >(async () => ({
      disposition: 'AUTHORIZED' as const,
      reservationId: request.budgetReservation.reservationId,
      reservationBindingSha256: request.budgetReservation.bindingSha256,
      authorizationReceiptSha256: sha('e'),
    })),
    settleTerminal: vi.fn(async () => undefined),
  };
  const preparationOwner = {
    ownerId: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OWNER_ID_V1,
    ownerVersion: NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1,
    prepare: vi.fn<
      Parameters<NativeMediaFinalRenderArtifactPreparationOwnerV1['prepare']>,
      ReturnType<NativeMediaFinalRenderArtifactPreparationOwnerV1['prepare']>
    >(async () => ({
      disposition: 'PREPARED' as const,
      publishHandle: `nmfrpubv1_${sha('d')}`,
      artifact: artifact(contract.payload),
    })),
  };
  const retryPolicyOwner = {
    ownerId: 'TEST_RENDER_RETRY_POLICY',
    ownerVersion: 'TEST_RENDER_RETRY_POLICY_V1',
    nextRetryAt: vi.fn(async ({ now }: { now: Date }) => new Date(now.getTime() + 1_000)),
  };
  const base = {
    jobStore,
    jobId: created.job.jobId,
    workerId: 'render-preparation-worker-1',
    runtimeContract,
    budgetOwner,
    preparationOwner,
    retryPolicyOwner,
    clock: () => new Date(nowMs),
  };
  return {
    ...base,
    collection,
    contract,
    now: () => new Date(nowMs),
    advance: (ms: number) => { nowMs += ms; },
    snapshot: () => jobStore.getAuthorized({
      jobId: created.job.jobId, tenantId: 'tenant_1', userId: 'user_1',
    }),
    run: (overrides: Partial<Parameters<
      typeof runNativeMediaFinalRenderPreparationWorkerV1>[0]> = {}) => (
      runNativeMediaFinalRenderPreparationWorkerV1({ ...base, ...overrides })
    ),
  };
}

function jobRequest() {
  return {
    tenantId: 'tenant_1', userId: 'user_1', orgId: null,
    projectId: 'project_1', sequenceId: 'main',
    projectRevision: {
      schemaVersion: 1 as const,
      value: 12,
      compatibilityUpdatedAt: START.toISOString(),
    },
    admissionReceiptSha256: sha('7'),
    budgetReservation: { reservationId: 'render_budget_1', bindingSha256: sha('0') },
    exactSourceRequest: {
      overlayId: 'overlay_1', assetId: 'asset_1', overlayTimingSha256: sha('1'),
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
      runtimePolicy: runtimePolicy(),
    },
    executionProfile: {
      workerImageDigest: `sha256:${sha('b')}`,
      compatibilityProfileVersion: NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1,
      compatibilityReceiptSha256: sha('c'),
    },
  } as const;
}

function runtimePolicy() {
  return createNativeMediaFinalRenderPreparationRuntimePolicyV1({
    executionBudget: {
      ownerId: 'TEST_RENDER_BUDGET_OWNER',
      ownerVersion: 'TEST_RENDER_BUDGET_OWNER_V1',
      policySha256: sha('e'),
    },
    retryPolicy: {
      ownerId: 'TEST_RENDER_RETRY_POLICY',
      ownerVersion: 'TEST_RENDER_RETRY_POLICY_V1',
      policySha256: sha('f'),
    },
    heartbeatPolicySha256: sha('0'),
  });
}

function artifact(
  job: ReturnType<typeof buildNativeMediaFinalRenderPreparationJobContractV1>['payload'],
) {
  const source = job.exactSourceRequest;
  return createNativeMediaFinalRenderArtifactV1({
    schemaVersion: 1,
    kind: 'EDITRON_NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_V1',
    artifactHandle: `nmfrv1_${sha('d')}`,
    projectId: job.projectId,
    sequenceId: job.sequenceId,
    projectRevision: job.projectRevision,
    overlayId: source.overlayId,
    assetId: source.assetId,
    overlayTimingSha256: source.overlayTimingSha256,
    assetTimingStateSha256: source.assetTimingStateSha256,
    sourceVersionSha256: source.sourceVersionSha256,
    storageVersionSha256: source.storageVersionSha256,
    sourceBindingSha256: source.sourceBindingSha256,
    sourcePtsCadenceMapStateSha256V3: source.sourcePtsCadenceMapStateSha256V3,
    transformSha256: sha('f'),
    projectRate: { numerator: '30', denominator: '1' },
    timelineStartFrame: '90', timelineFrameCount: '60',
    artifactProfile: 'EDITRON_EXACT_TIMESTAMP_AV_MEZZANINE_V1',
    container: 'matroska', videoCodec: 'h264', pixelFormat: 'gbrp',
    videoFrameCount: '60', decodedFrameSequenceSha256: sha('1'),
    remotionCompatibilityReceiptSha256: job.executionProfile.compatibilityReceiptSha256,
    audio: {
      disposition: 'EMBEDDED_EXACT_NATIVE_PCM', audioCodec: 'pcm_s32le',
      audioMappingSha256: sha('2'), sourceDecodedPcmSha256: sha('3'),
      artifactDecodedPcmSha256: sha('4'),
      decodedPcmEquivalenceReceiptSha256: sha('5'), sampleRate: '48000',
      channelCount: 2, decodedSampleFrameCount: '96000',
    },
    contentType: 'video/x-matroska', artifactContentSha256: sha('d'),
    artifactByteLength: '123456',
  });
}

function storePorts(
  store: DurableWorkflowJobStoreV1,
  complete: DurableWorkflowJobStoreV1['complete'],
): Parameters<typeof runNativeMediaFinalRenderPreparationWorkerV1>[0]['jobStore'] {
  return {
    claim: store.claim.bind(store),
    heartbeat: store.heartbeat.bind(store),
    saveResumeState: store.saveResumeState.bind(store),
    complete,
    retryOrDeadLetter: store.retryOrDeadLetter.bind(store),
    markCancelled: store.markCancelled.bind(store),
    getAuthorized: store.getAuthorized.bind(store),
  };
}
