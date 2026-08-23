import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { bindProviderNativeDurableOutcomeProofReceiptV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-durable-outcome-proof-v2r';
import {
  buildProviderNativeEpisodeDurableJobInputV2R,
  persistProviderNativeEpisodeCheckpointV2R,
  restoreProviderNativeEpisodeDurableStateV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-episode-durable-job-v2r';
import {
  createProviderNativeProposalRecoveryStateV2R,
  proposalRecoveryWriterTurnsV2R,
  type ProviderNativeProposalRecoveryStateV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-proposal-recovery-v2r';
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
const CANONICAL_BASE_REVISION = 'project-revision-v1:canonical-r7';
const BASE_STATE_SHA = 'e'.repeat(64);
const PREFIX_STATE_SHA = 'f'.repeat(64);
const FINAL_STATE_SHA = '1'.repeat(64);

describe('provider-native durable recovery worker V2R', () => {
  it('resumes only the suffix and accepts the exact isolated outcome proof once', async () => {
    const setup = await preparedJob();
    let suffixCall = 0;
    const invoke = vi.fn(async (request: Readonly<SerializedProviderNativeTurnV2R>) => {
      suffixCall += 1;
      return suffixCall === 1 ? shakeResponse(request) : finishResponse();
    });
    const executeIsolated = vi.fn(async () => execution({
      receipt: { status: 'PASS', projectRevision: 'revision-44' },
    }));
    const resolver = vi.fn(async () => artifacts({
      invoke, executeIsolated,
      proposalReceiptFactory: durableProposalReceipt,
      outcomeProofFactory: durableOutcomeProofReceipt,
    }));

    const result = await runProviderNativeEpisodeDurableWorkerV2R({
      store: setup.freshStore, jobId: setup.jobId, workerId: 'worker-b',
      artifactResolver: { resolve: resolver }, clock: () => RESUME_AT,
    });

    if (result.kind !== 'completed') {
      throw new Error(`UNEXPECTED_WORKER_RESULT:${JSON.stringify(result)}`);
    }
    expect(result).toMatchObject({
      kind: 'completed', durableDisposition: 'PASS',
      episodeReceipt: {
        selectedOperatorIds: ELIGIBLE,
        terminal: { disposition: 'READY_FOR_PROOF' },
      },
      proposalReceiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      outcomeProofReceiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
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
        disposition: 'PASS',
        proofReferences: [
          { proofSha256: result.resumedReceiptSha256, disposition: 'PASS' },
          { proofSha256: result.proposalReceiptSha256, disposition: 'PASS' },
          { proofSha256: result.outcomeProofReceiptSha256, disposition: 'PASS' },
        ],
      },
    });

    const duplicate = await runProviderNativeEpisodeDurableWorkerV2R({
      store: setup.freshStore, jobId: setup.jobId, workerId: 'worker-c',
      artifactResolver: { resolve: resolver }, clock: () => RESUME_AT,
    });
    expect(duplicate).toEqual({ kind: 'skipped', reason: 'terminal' });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith(expect.objectContaining({
      proposalRecoveryState: setup.proposalRecoveryState,
    }));
    const durableState = restoreProviderNativeEpisodeDurableStateV2R(persisted!);
    expect(durableState.proposalRecoveryState).toMatchObject({
      isolatedWorkingProjectRevision: 'revision-44',
      isolatedWorkingStateSha256: FINAL_STATE_SHA,
      operations: [{ turn: 3 }, { turn: 4 }],
    });
  });

  it('dead-letters a changed proof-eligible proposal without an outcome proof owner', async () => {
    const setup = await preparedJob();
    let suffixCall = 0;
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
        proposalReceiptFactory: durableProposalReceipt,
      }) },
      clock: () => RESUME_AT,
    });
    expect(result).toEqual({
      kind: 'dead_letter', jobId: setup.jobId,
      errorCode: 'PROVIDER_NATIVE_DURABLE_OUTCOME_PROOF_OWNER_REQUIRED',
    });
  });

  it('dead-letters a re-signed outcome proof bound to the wrong final state', async () => {
    const setup = await preparedJob();
    let suffixCall = 0;
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
        proposalReceiptFactory: durableProposalReceipt,
        outcomeProofFactory: (input) => durableOutcomeProofReceipt({
          ...input,
          proposalReceipt: {
            ...input.proposalReceipt,
            finalStateSha256: '4'.repeat(64),
          },
        }),
      }) },
      clock: () => RESUME_AT,
    });
    expect(result).toEqual({
      kind: 'dead_letter', jobId: setup.jobId,
      errorCode: 'PROVIDER_NATIVE_DURABLE_OUTCOME_PROOF_SUBJECT_MISMATCH',
    });
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
        proposalReceiptFactory: (state) => ({
          ...durableProposalReceipt(state), finalStateSha256: '0'.repeat(64),
        }),
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

  it('rejects a ProjectService proposal owner without distinct revision identities', async () => {
    const setup = await preparedJob();
    const invoke = vi.fn();
    const executeIsolated = vi.fn();
    const result = await runProviderNativeEpisodeDurableWorkerV2R({
      store: setup.freshStore, jobId: setup.jobId, workerId: 'worker-b',
      artifactResolver: { resolve: async () => artifacts({
        invoke, executeIsolated,
        proposalReceiptFactory: durableProposalReceipt,
        omitProposalRevisionBinding: true,
      }) },
      clock: () => RESUME_AT,
    });

    expect(result).toEqual({
      kind: 'dead_letter', jobId: setup.jobId,
      errorCode: 'PROVIDER_NATIVE_DURABLE_PROPOSAL_REVISION_BINDING_REQUIRED',
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(executeIsolated).not.toHaveBeenCalled();
  });

  it('resumes from the isolated working revision while keeping the canonical base distinct', async () => {
    const setup = await preparedJob();
    const invoke = vi.fn(async () => finishResponse());
    const result = await runProviderNativeEpisodeDurableWorkerV2R({
      store: setup.freshStore, jobId: setup.jobId, workerId: 'worker-b',
      artifactResolver: { resolve: async () => artifacts({
        invoke, executeIsolated: vi.fn(),
      }) },
      clock: () => RESUME_AT,
    });

    expect(result).toMatchObject({ kind: 'completed', durableDisposition: 'UNVERIFIABLE' });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('rejects a forged proposal revision binding before provider execution', async () => {
    const setup = await preparedJob();
    const invoke = vi.fn();
    const result = await runProviderNativeEpisodeDurableWorkerV2R({
      store: setup.freshStore, jobId: setup.jobId, workerId: 'worker-b',
      artifactResolver: { resolve: async () => artifacts({
        invoke, executeIsolated: vi.fn(), forgeProposalRevisionBinding: true,
      }) },
      clock: () => RESUME_AT,
    });

    expect(result).toEqual({
      kind: 'dead_letter', jobId: setup.jobId,
      errorCode: 'PROVIDER_NATIVE_DURABLE_PROPOSAL_REVISION_BINDING_INVALID',
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects a recovery-capable proposal owner that cannot capture the next state', async () => {
    const setup = await preparedJob();
    const invoke = vi.fn();
    const result = await runProviderNativeEpisodeDurableWorkerV2R({
      store: setup.freshStore, jobId: setup.jobId, workerId: 'worker-b',
      artifactResolver: { resolve: async () => artifacts({
        invoke, executeIsolated: vi.fn(), omitProposalRecoveryCapture: true,
      }) },
      clock: () => RESUME_AT,
    });

    expect(result).toEqual({
      kind: 'dead_letter', jobId: setup.jobId,
      errorCode: 'PROVIDER_NATIVE_DURABLE_PROPOSAL_RECOVERY_CAPTURE_REQUIRED',
    });
    expect(invoke).not.toHaveBeenCalled();
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
  const proposalRecoveryState = recoveryState(checkpoint);
  await persistProviderNativeEpisodeCheckpointV2R({
    store, jobId: created.job.jobId, tenantId: 'tenant-1', userId: 'user-1',
    leaseToken: claim.leaseToken, expectedSequence: 0, checkpoint,
    proposalRecoveryState,
    now: new Date(START.getTime() + 1),
  });
  return {
    jobId: created.job.jobId, checkpoint, proposalRecoveryState,
    freshStore: new DurableWorkflowJobStoreV1(async () => collection.asCollection()),
  };
}

function artifacts(overrides: Readonly<{
  invoke: ProviderNativeDurableResolvedArtifactsV2R['invoke'];
  executeIsolated: ProviderNativeDurableResolvedArtifactsV2R['isolatedClone']['executeIsolated'];
  proposalReceiptFactory?: (
    state: Readonly<ProviderNativeProposalRecoveryStateV2R>,
  ) => Readonly<ProviderNativeDurableProposalReceiptV2R>;
  outcomeProofFactory?: (
    input: Parameters<NonNullable<
      ProviderNativeDurableResolvedArtifactsV2R['isolatedClone']['finalizeOutcomeProof']
    >>[0],
  ) => ReturnType<typeof durableOutcomeProofReceipt>;
  context?: ProviderNativeEpisodeContextV2R;
  omitProposalRevisionBinding?: boolean;
  canonicalBaseProjectRevision?: string;
  isolatedWorkingProjectRevision?: string;
  forgeProposalRevisionBinding?: boolean;
  omitProposalRecoveryCapture?: boolean;
}>): ProviderNativeDurableResolvedArtifactsV2R {
  const canonicalBaseProjectRevision = overrides.canonicalBaseProjectRevision
    ?? CANONICAL_BASE_REVISION;
  const isolatedWorkingProjectRevision = overrides.isolatedWorkingProjectRevision ?? 'revision-43';
  let latestRecovery: Readonly<ProviderNativeProposalRecoveryStateV2R> | undefined;
  const proposalRevisionMaterial = {
    schemaVersion: 1 as const,
    authority: 'PROJECTSERVICE_ISOLATED_PROPOSAL_REVISION_BINDING' as const,
    canonicalBaseProjectRevision,
    canonicalBaseStateSha256: BASE_STATE_SHA,
    isolatedWorkingProjectRevision,
    isolatedWorkingStateSha256: PREFIX_STATE_SHA,
  };
  return {
    context: overrides.context ?? CONTEXT,
    eligibleOperatorIds: ELIGIBLE,
    currentRevision: {
      origin: 'PROJECTSERVICE_CURRENT_REVISION_READ',
      projectRevision: canonicalBaseProjectRevision,
      readReceiptId: 'revision-read-43', readReceiptSha256: 'd'.repeat(64),
    },
    isolatedClone: {
      origin: 'PROJECTSERVICE_REVISION_CLONE', projectRevision: canonicalBaseProjectRevision,
      stateSha256: BASE_STATE_SHA,
      ...(!overrides.omitProposalRevisionBinding ? { proposalRevisionBinding: {
        ...proposalRevisionMaterial,
        bindingSha256: overrides.forgeProposalRevisionBinding
          ? '0'.repeat(64) : hashCanonicalJsonV1(proposalRevisionMaterial),
      } } : {}),
      executeIsolated: overrides.executeIsolated,
      ...(!overrides.omitProposalRecoveryCapture ? {
        captureProposalRecoveryState: async (checkpoint) => {
          latestRecovery = recoveryState(checkpoint, canonicalBaseProjectRevision);
          return latestRecovery;
        },
      } : {}),
      ...(overrides.proposalReceiptFactory ? {
        finalizeProposalReceipt: async () => {
          if (!latestRecovery) throw new Error('TEST_RECOVERY_STATE_NOT_CAPTURED');
          return overrides.proposalReceiptFactory!(latestRecovery);
        },
      } : {}),
      ...(overrides.outcomeProofFactory ? {
        finalizeOutcomeProof: async (input) => overrides.outcomeProofFactory!(input),
      } : {}),
    },
    invoke: overrides.invoke,
  };
}

function durableOutcomeProofReceipt(input: Readonly<{
  episodeReceipt: Readonly<{ receiptSha256: string; episodeId: string }>;
  resumedReceiptSha256: string;
  proposalReceipt: Readonly<ProviderNativeDurableProposalReceiptV2R>;
}>) {
  const proofId = 'render-proof-1';
  return bindProviderNativeDurableOutcomeProofReceiptV2R({
    tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1',
    episodeId: input.episodeReceipt.episodeId,
    subject: {
      episodeReceiptSha256: input.episodeReceipt.receiptSha256,
      resumedReceiptSha256: input.resumedReceiptSha256,
      proposalReceiptSha256: input.proposalReceipt.receiptSha256,
      finalStateSha256: input.proposalReceipt.finalStateSha256,
    },
    proofPolicy: {
      policyId: 'test-render-policy', policyVersion: 'v1',
      policySha256: '2'.repeat(64),
    },
    obligations: [{
      obligationId: 'rendered-outcome', kind: 'render', disposition: 'PASS',
      proofReferenceIds: [proofId],
    }],
    proofReferences: [{ proofId, proofSha256: '3'.repeat(64), disposition: 'PASS' }],
    observedAt: '2026-08-23T15:06:00.000Z',
    summary: 'The exact isolated proposal passed the injected test proof owner.',
  });
}

function durableProposalReceipt(
  recovery: Readonly<ProviderNativeProposalRecoveryStateV2R>,
): Readonly<ProviderNativeDurableProposalReceiptV2R> {
  const operationReceipts = recovery.operations.map((operation) => {
    const operationMaterial = {
      operatorId: operation.operatorId,
      turn: operation.turn,
      callSha256: operation.callSha256,
      beforeStateSha256: operation.beforeStateSha256,
      afterStateSha256: operation.afterStateSha256,
      changedPaths: ['$.overlays[0].styles'],
      executionSha256: operation.recordedExecutionSha256,
    };
    return {
      ...operationMaterial,
      operationReceiptSha256: hashCanonicalJsonV1(operationMaterial),
    };
  });
  const material = {
    schemaVersion: 1 as const,
    authority: 'PROJECTSERVICE_ISOLATED_PROPOSAL_NO_PROJECT_MUTATION' as const,
    episodeId: CONTEXT.episodeId,
    projectId: 'project-1',
    baseProjectRevision: recovery.canonicalBaseProjectRevision,
    baseStateSha256: recovery.canonicalBaseStateSha256,
    finalStateSha256: recovery.isolatedWorkingStateSha256,
    changedPaths: ['$.overlays[0].styles.shake'],
    operationReceipts,
    canonicalProjectRevisionAfter: recovery.canonicalBaseProjectRevision,
    canonicalStateSha256After: recovery.canonicalBaseStateSha256,
    canonicalUnchanged: true as const,
  };
  return { ...material, receiptSha256: hashCanonicalJsonV1(material) };
}

function recoveryState(
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
  canonicalBaseProjectRevision = CANONICAL_BASE_REVISION,
): Readonly<ProviderNativeProposalRecoveryStateV2R> {
  const writers = proposalRecoveryWriterTurnsV2R(checkpoint);
  const states = [BASE_STATE_SHA, PREFIX_STATE_SHA, FINAL_STATE_SHA];
  if (writers.length > states.length - 1) throw new Error('TEST_RECOVERY_STATE_RANGE_EXHAUSTED');
  return createProviderNativeProposalRecoveryStateV2R({
    checkpoint,
    projectId: 'project-1',
    canonicalBaseProjectRevision,
    canonicalBaseStateSha256: BASE_STATE_SHA,
    operations: writers.map((writer, index) => ({
      turn: writer.turn,
      beforeStateSha256: states[index],
      afterStateSha256: states[index + 1],
    })),
  });
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
