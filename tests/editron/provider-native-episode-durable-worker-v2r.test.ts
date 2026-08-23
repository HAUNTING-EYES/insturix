import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildProviderNativeEpisodeDurableJobInputV2R,
  persistProviderNativeEpisodeCheckpointV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-episode-durable-job-v2r';
import {
  ProviderNativeDurableRetryableErrorV2R,
  runProviderNativeEpisodeDurableWorkerV2R,
  type ProviderNativeDurableResolvedArtifactsV2R,
  type ProviderNativeDurableProposalReceiptV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-episode-durable-worker-v2r';
import type { ProviderNativeEpisodeResumeCheckpointV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import { buildProviderNativeToolSetV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-catalog-v2r';
import { buildOpaqueResultReferenceToolSetV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-result-references-v2r';
import type { SerializedProviderNativeTurnV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeContextV2R,
  type ProviderNativeToolExecutionV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

type JsonRecord = Record<string, unknown>;

const START = new Date('2026-08-23T15:00:00.000Z');
const RESUME_AT = new Date(START.getTime() + 5 * 60 * 1000 + 1);
const ROUTE = {
  routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
} as const;
const CONTEXT: ProviderNativeEpisodeContextV2R = {
  episodeId: 'durable-worker-episode-1',
  objective: 'Align cuts, then emphasize the writer-selected final hit.',
  activeTarget: { taskId: 'DURABLE-WORKER-1' },
  revisionBinding: { projectId: 'project-1', expectedProjectRevision: 'revision-42' },
  projectState: { projectId: 'project-1', projectRevision: 'revision-42' },
  evidence: [{ evidenceId: 'ev-audio-1', kind: 'MEASURED_AUDIO' }],
  preservationRules: ['Never replay completed mutations or copy a revision literal.'],
  authorityAndPolicy: { mutation: 'ISOLATED_CLONE_ONLY', completeCapabilityDossier: {
    plannerRecordSupplements: [
      { selectableOperatorId: 'sync_cuts_to_beats', inputOrigins: { beatPlan: [{
        origin: 'OPERATOR_OUTPUT', operatorId: 'find_audio_moment', outputField: 'result',
      }] } },
      { selectableOperatorId: 'apply_camera_shake', inputOrigins: {
        expectedProjectRevision: [{ origin: 'OPERATOR_OUTPUT',
          operatorId: 'sync_cuts_to_beats', outputField: 'receipt.projectRevision' }],
        overlayId: [{ origin: 'OPERATOR_OUTPUT', operatorId: 'sync_cuts_to_beats',
          outputField: 'result.finalHitOverlayId' }],
        targetFrame: [{ origin: 'OPERATOR_OUTPUT', operatorId: 'sync_cuts_to_beats',
          outputField: 'result.finalStrongPeakFrame' }],
      } },
    ],
  } },
  budget: { maxTurns: 6, maxOutputTokensPerTurn: 512, maxIdenticalCalls: 1 },
};
const ELIGIBLE = [
  'find_audio_moment', 'sync_cuts_to_beats', 'apply_camera_shake',
] as const;
const BEAT_PLAN = {
  schemaVersion: 'EDITRON_MEASURED_BEAT_PLAN_V2R_1', assetId: 'music-1',
  measuredEvidenceReceiptHash: 'a'.repeat(64),
  strongPeakFrames: [119, 239, 359, 479], finalStrongPeakFrame: 479,
};
const BEAT_CONSTRAINTS = {
  maxSnapFrames: 8, minClipFrames: 20, maxConsecutiveBeatCuts: 4,
  protectedAudioRange: { startFrame: 0, endFrame: 90 },
  protectedBoundaryToleranceFrames: 3,
  sourceDurationFramesByAssetId: { 'asset-1': 600 }, requireSourceHandles: true,
};

describe('provider-native durable recovery worker V2R', () => {
  it('resumes only the suffix and settles READY_FOR_PROOF as UNVERIFIABLE once', async () => {
    const setup = await preparedJob();
    let suffixCall = 0;
    const invoke = vi.fn(async (request: Readonly<SerializedProviderNativeTurnV2R>) => {
      suffixCall += 1;
      return suffixCall === 1 ? shakeResponse(request) : finishResponse();
    });
    const executeIsolated = vi.fn(async () => execution({
      receipt: { status: 'PASS', projectRevision: 'revision-44' },
    }));
    const proposalReceipt = durableProposalReceipt();
    const resolver = vi.fn(async () => artifacts({
      invoke, executeIsolated,
      finalizeProposalReceipt: async () => proposalReceipt,
    }));

    const result = await runProviderNativeEpisodeDurableWorkerV2R({
      store: setup.freshStore, jobId: setup.jobId, workerId: 'worker-b',
      artifactResolver: { resolve: resolver }, clock: () => RESUME_AT,
    });

    if (result.kind !== 'completed') {
      throw new Error(`UNEXPECTED_WORKER_RESULT:${JSON.stringify(result)}`);
    }
    expect(result).toMatchObject({
      kind: 'completed', durableDisposition: 'UNVERIFIABLE',
      episodeReceipt: {
        selectedOperatorIds: ELIGIBLE,
        terminal: { disposition: 'READY_FOR_PROOF' },
      },
      proposalReceiptSha256: proposalReceipt.receiptSha256,
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(executeIsolated).toHaveBeenCalledTimes(1);
    expect(result.episodeReceipt.turns.slice(0, 3)).toEqual(setup.checkpoint.completedTurns);

    const persisted = await setup.freshStore.getAuthorized({
      jobId: setup.jobId, tenantId: 'tenant-1', userId: 'user-1',
    });
    expect(persisted).toMatchObject({
      status: 'completed', resumeState: { sequence: 2 },
      terminalReceipt: {
        disposition: 'UNVERIFIABLE',
        proofReferences: [
          { proofSha256: result.resumedReceiptSha256, disposition: 'UNVERIFIABLE' },
          { proofSha256: proposalReceipt.receiptSha256, disposition: 'PASS' },
        ],
      },
    });

    const duplicate = await runProviderNativeEpisodeDurableWorkerV2R({
      store: setup.freshStore, jobId: setup.jobId, workerId: 'worker-c',
      artifactResolver: { resolve: resolver }, clock: () => RESUME_AT,
    });
    expect(duplicate).toEqual({ kind: 'skipped', reason: 'terminal' });
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('dead-letters a hash-mismatched context before provider or tool execution', async () => {
    const setup = await preparedJob();
    const invoke = vi.fn();
    const executeIsolated = vi.fn();
    const changedContext = { ...CONTEXT, objective: 'forged objective' };
    const result = await runProviderNativeEpisodeDurableWorkerV2R({
      store: setup.freshStore, jobId: setup.jobId, workerId: 'worker-b',
      artifactResolver: { resolve: async () => artifacts({
        invoke, executeIsolated, context: changedContext,
      }) },
      clock: () => RESUME_AT,
    });
    expect(result).toEqual({
      kind: 'dead_letter', jobId: setup.jobId,
      errorCode: 'PROVIDER_NATIVE_DURABLE_CONTEXT_ARTIFACT_MISMATCH',
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(executeIsolated).not.toHaveBeenCalled();
  });

  it('dead-letters a forged ProjectService proposal receipt before durable completion', async () => {
    const setup = await preparedJob();
    let suffixCall = 0;
    const valid = durableProposalReceipt();
    const forged = { ...valid, finalStateSha256: '0'.repeat(64) };
    const result = await runProviderNativeEpisodeDurableWorkerV2R({
      store: setup.freshStore, jobId: setup.jobId, workerId: 'worker-b',
      artifactResolver: { resolve: async () => artifacts({
        invoke: async (request) => {
          suffixCall += 1;
          return suffixCall === 1 ? shakeResponse(request) : finishResponse();
        },
        executeIsolated: async () => execution({
          receipt: { status: 'PASS', projectRevision: 'revision-44' },
        }),
        finalizeProposalReceipt: async () => forged,
      }) },
      clock: () => RESUME_AT,
    });

    expect(result).toEqual({
      kind: 'dead_letter', jobId: setup.jobId,
      errorCode: 'PROVIDER_NATIVE_DURABLE_PROPOSAL_RECEIPT_INVALID',
    });
    expect(await setup.freshStore.getAuthorized({
      jobId: setup.jobId, tenantId: 'tenant-1', userId: 'user-1',
    })).toMatchObject({
      status: 'dead_letter', terminalReceipt: null,
      error: { code: 'PROVIDER_NATIVE_DURABLE_PROPOSAL_RECEIPT_INVALID', retryable: false },
    });
  });

  it('schedules only explicitly retryable artifact failures', async () => {
    const setup = await preparedJob();
    const result = await runProviderNativeEpisodeDurableWorkerV2R({
      store: setup.freshStore, jobId: setup.jobId, workerId: 'worker-b',
      artifactResolver: { resolve: async () => {
        throw new ProviderNativeDurableRetryableErrorV2R(
          'ARTIFACT_STORE_TIMEOUT', 'Artifact owner timed out.',
        );
      } },
      clock: () => RESUME_AT, retryDelayMs: 2_000,
    });
    expect(result).toEqual({
      kind: 'retry_wait', jobId: setup.jobId, errorCode: 'ARTIFACT_STORE_TIMEOUT',
    });
    expect(await setup.freshStore.getAuthorized({
      jobId: setup.jobId, tenantId: 'tenant-1', userId: 'user-1',
    })).toMatchObject({ status: 'retry_wait', nextAttemptAt: '2026-08-23T15:05:02.001Z' });
  });

  it('retries an explicit provider transient from the latest suffix checkpoint', async () => {
    const setup = await preparedJob();
    let suffixCall = 0;
    const result = await runProviderNativeEpisodeDurableWorkerV2R({
      store: setup.freshStore, jobId: setup.jobId, workerId: 'worker-b',
      artifactResolver: { resolve: async () => artifacts({
        invoke: async (request) => {
          suffixCall += 1;
          return suffixCall === 1
            ? shakeResponse(request)
            : { status: 429, body: { error: { message: 'rate limited' } } };
        },
        executeIsolated: async () => execution({
          receipt: { status: 'PASS', projectRevision: 'revision-44' },
        }),
      }) },
      clock: () => RESUME_AT,
    });
    expect(result).toEqual({
      kind: 'retry_wait', jobId: setup.jobId, errorCode: 'PROVIDER_RATE_LIMIT',
    });
    const persisted = await setup.freshStore.getAuthorized({
      jobId: setup.jobId, tenantId: 'tenant-1', userId: 'user-1',
    });
    expect(persisted).toMatchObject({
      status: 'retry_wait', resumeState: { sequence: 2 },
      retryCursor: { resumeSequence: 2 },
    });
    expect(persisted?.retryCursor?.checkpointSha256)
      .toBe((persisted?.resumeState?.payload as JsonRecord).checkpointSha256);
  });

  it('honours cancellation requested while a provider call is in flight', async () => {
    const setup = await preparedJob();
    const invoke = vi.fn(async () => {
      await setup.freshStore.requestCancellation({
        jobId: setup.jobId, tenantId: 'tenant-1', userId: 'user-1',
        requestedBy: 'user-1', reason: 'stop benchmark', now: RESUME_AT,
      });
      return finishResponse();
    });
    const result = await runProviderNativeEpisodeDurableWorkerV2R({
      store: setup.freshStore, jobId: setup.jobId, workerId: 'worker-b',
      artifactResolver: { resolve: async () => artifacts({
        invoke, executeIsolated: vi.fn(),
      }) },
      clock: () => RESUME_AT,
    });
    expect(result).toEqual({ kind: 'cancelled', jobId: setup.jobId });
    expect(await setup.freshStore.getAuthorized({
      jobId: setup.jobId, tenantId: 'tenant-1', userId: 'user-1',
    })).toMatchObject({ status: 'cancelled', terminalReceipt: { disposition: 'CANCELLED' } });
  });

  it('does not steal an active lease or resolve artifacts for a duplicate delivery', async () => {
    const setup = await preparedJob();
    const resolver = vi.fn();
    const result = await runProviderNativeEpisodeDurableWorkerV2R({
      store: setup.freshStore, jobId: setup.jobId, workerId: 'worker-b',
      artifactResolver: { resolve: resolver }, clock: () => START,
    });
    expect(result).toEqual({ kind: 'skipped', reason: 'lease_held' });
    expect(resolver).not.toHaveBeenCalled();
  });
});

async function preparedJob() {
  const checkpoint = await interruptAfterWriter();
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  const store = new DurableWorkflowJobStoreV1(async () => collection.asCollection());
  const toolSet = buildOpaqueResultReferenceToolSetV2R(
    buildProviderNativeToolSetV2R(ELIGIBLE),
  );
  const created = await store.createOrGet(buildProviderNativeEpisodeDurableJobInputV2R({
    tenantId: 'tenant-1', userId: 'user-1', orgId: 'org-1', projectId: 'project-1',
    parentCommandId: null, parentReceiptId: null, idempotencyKey: CONTEXT.episodeId,
    identity: {
      route: ROUTE, episodeId: CONTEXT.episodeId,
      contextSha256: hashCanonicalJsonV1(CONTEXT), toolSetSha256: toolSet.toolSetSha256,
    },
    maxAttempts: 3,
  }), START);
  const claim = await store.claim({ jobId: created.job.jobId, workerId: 'worker-a', now: START });
  if (claim.kind !== 'claimed') throw new Error('expected initial claim');
  await persistProviderNativeEpisodeCheckpointV2R({
    store, jobId: created.job.jobId, tenantId: 'tenant-1', userId: 'user-1',
    leaseToken: claim.leaseToken, expectedSequence: 0, checkpoint,
    now: new Date(START.getTime() + 1),
  });
  return {
    jobId: created.job.jobId, checkpoint,
    freshStore: new DurableWorkflowJobStoreV1(async () => collection.asCollection()),
  };
}

function artifacts(overrides: Readonly<{
  invoke: ProviderNativeDurableResolvedArtifactsV2R['invoke'];
  executeIsolated: ProviderNativeDurableResolvedArtifactsV2R['isolatedClone']['executeIsolated'];
  finalizeProposalReceipt?: NonNullable<
    ProviderNativeDurableResolvedArtifactsV2R['isolatedClone']['finalizeProposalReceipt']
  >;
  context?: ProviderNativeEpisodeContextV2R;
}>): ProviderNativeDurableResolvedArtifactsV2R {
  return {
    context: overrides.context ?? CONTEXT,
    eligibleOperatorIds: ELIGIBLE,
    currentRevision: {
      origin: 'PROJECTSERVICE_CURRENT_REVISION_READ', projectRevision: 'revision-43',
      readReceiptId: 'revision-read-43', readReceiptSha256: 'd'.repeat(64),
    },
    isolatedClone: {
      origin: 'PROJECTSERVICE_REVISION_CLONE', projectRevision: 'revision-43',
      stateSha256: 'e'.repeat(64), executeIsolated: overrides.executeIsolated,
      ...(overrides.finalizeProposalReceipt
        ? { finalizeProposalReceipt: overrides.finalizeProposalReceipt } : {}),
    },
    invoke: overrides.invoke,
  };
}

function durableProposalReceipt(): Readonly<ProviderNativeDurableProposalReceiptV2R> {
  const operationMaterial = {
    operatorId: 'apply_camera_shake', turn: 4,
    beforeStateSha256: 'e'.repeat(64), afterStateSha256: 'f'.repeat(64),
  };
  const material = {
    schemaVersion: 1 as const,
    authority: 'PROJECTSERVICE_ISOLATED_PROPOSAL_NO_PROJECT_MUTATION' as const,
    episodeId: CONTEXT.episodeId,
    projectId: 'project-1',
    baseProjectRevision: 'revision-43',
    baseStateSha256: 'e'.repeat(64),
    finalStateSha256: 'f'.repeat(64),
    changedPaths: ['$.overlays[0].styles.shake'],
    operationReceipts: [{
      ...operationMaterial,
      operationReceiptSha256: hashCanonicalJsonV1(operationMaterial),
    }],
    canonicalProjectRevisionAfter: 'revision-43',
    canonicalStateSha256After: 'e'.repeat(64),
    canonicalUnchanged: true as const,
  };
  return { ...material, receiptSha256: hashCanonicalJsonV1(material) };
}

async function interruptAfterWriter(): Promise<Readonly<ProviderNativeEpisodeResumeCheckpointV2R>> {
  let invocation = 0;
  let captured: Readonly<ProviderNativeEpisodeResumeCheckpointV2R> | null = null;
  await expect(runProviderNativeToolEpisodeV2R({
    route: ROUTE, context: CONTEXT, eligibleOperatorIds: ELIGIBLE,
    argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
    invoke: async () => {
      invocation += 1;
      if (invocation === 1) return call('audio', 'find_audio_moment', {
        projectId: 'project-1', query: 'measured strong music impacts',
      });
      if (invocation === 2) return call('sync-invalid', 'sync_cuts_to_beats', {
        projectId: 'project-1', expectedProjectRevision: 'revision-42',
      });
      return call('sync', 'sync_cuts_to_beats', {
        projectId: 'project-1', expectedProjectRevision: 'revision-42',
        overlayIds: ['overlay-video-1'], beatSyncConstraints: BEAT_CONSTRAINTS,
        evidenceIds: ['ev-audio-1'], argumentReferences: [{
          targetField: 'beatPlan', resultReferenceId: 'result_t1_1',
        }],
      });
    },
    executeIsolated: async ({ operatorId }) => operatorId === 'find_audio_moment'
      ? execution({ result: BEAT_PLAN, evidence: { evidenceId: 'ev-audio-1' } })
      : execution({
          receipt: { status: 'PASS', projectRevision: 'revision-43' },
          result: { alignedBoundaries: [119, 239, 359, 479],
            finalHitOverlayId: 'overlay-video-1', finalStrongPeakFrame: 479 },
        }),
    onTurnCommitted: ({ checkpoint }) => {
      captured = checkpoint;
      if (checkpoint.nextTurn === 4) throw new Error('TEST_WORKER_INTERRUPTION');
    },
  })).rejects.toThrow('TEST_WORKER_INTERRUPTION');
  if (!captured) throw new Error('TEST_CHECKPOINT_NOT_CAPTURED');
  return captured;
}

function shakeResponse(request: Readonly<SerializedProviderNativeTurnV2R>) {
  const body = JSON.stringify(request.body);
  expect(body).toContain('result_t3_1');
  expect(body).not.toContain('revision-43');
  return call('shake', 'apply_camera_shake', {
    projectId: 'project-1',
    effectPlan: { goal: 'Emphasize the final measured impact', formIntent: 'restrained-impact' },
    argumentReferences: [
      { targetField: 'expectedProjectRevision', resultReferenceId: 'result_t3_1' },
      { targetField: 'overlayId', resultReferenceId: 'result_t3_2' },
      { targetField: 'targetFrame', resultReferenceId: 'result_t3_3' },
    ],
  });
}

function finishResponse() {
  return call('finish', 'finish_editron_research_episode', {
    disposition: 'READY_FOR_PROOF', reasonCodes: ['MODEL_READY_FOR_PROOF'],
    evidenceIds: [], summary: 'Ready for bounded rendered proof.',
  });
}

function call(callId: string, name: string, args: JsonRecord) {
  return { status: 200, body: {
    id: `response-${callId}`, model: ROUTE.model, status: 'completed',
    output: [{ type: 'function_call', call_id: callId, name,
      arguments: JSON.stringify(args) }],
  } };
}

function execution(output: JsonRecord): Readonly<ProviderNativeToolExecutionV2R> {
  return { authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION', disposition: 'OK',
    output, evidenceIds: ['ev-audio-1'] };
}
