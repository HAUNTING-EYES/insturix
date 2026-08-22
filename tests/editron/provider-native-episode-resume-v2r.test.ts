import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildProviderNativeResumedEpisodeReceiptV2R,
  type ProviderNativeEpisodeResumeCheckpointV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeContextV2R,
  type ProviderNativeInvokeResponseV2R,
  type ProviderNativeToolExecutionV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';

type JsonRecord = Record<string, unknown>;

const ROUTE: ProviderNativeRouteV2R = {
  routeId: 'OPENAI_TERRA',
  provider: 'openai',
  model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra',
  reasoningMode: 'medium',
};

const CONTEXT: ProviderNativeEpisodeContextV2R = {
  episodeId: 'stage25-resume-episode-1',
  objective: 'Align cuts to measured impacts, then emphasize the writer-selected final hit.',
  activeTarget: { taskId: 'RESUME-01', requirement: 'beat sync then restrained shake' },
  revisionBinding: { projectId: 'project-1', expectedProjectRevision: 'revision-42' },
  projectState: { projectId: 'project-1', projectRevision: 'revision-42' },
  evidence: [{ evidenceId: 'ev-audio-1', kind: 'MEASURED_AUDIO' }],
  preservationRules: ['Never replay a completed mutation or copy a revision literal.'],
  authorityAndPolicy: {
    mutation: 'ISOLATED_CLONE_ONLY',
    network: 'PROVIDER_ONLY',
    completeCapabilityDossier: {
      plannerRecordSupplements: [
        {
          selectableOperatorId: 'sync_cuts_to_beats',
          inputOrigins: {
            beatPlan: [{
              origin: 'OPERATOR_OUTPUT',
              operatorId: 'find_audio_moment',
              outputField: 'result',
            }],
          },
        },
        {
          selectableOperatorId: 'apply_camera_shake',
          inputOrigins: {
            expectedProjectRevision: [{
              origin: 'OPERATOR_OUTPUT',
              operatorId: 'sync_cuts_to_beats',
              outputField: 'receipt.projectRevision',
            }],
            overlayId: [{
              origin: 'OPERATOR_OUTPUT',
              operatorId: 'sync_cuts_to_beats',
              outputField: 'result.finalHitOverlayId',
            }],
            targetFrame: [{
              origin: 'OPERATOR_OUTPUT',
              operatorId: 'sync_cuts_to_beats',
              outputField: 'result.finalStrongPeakFrame',
            }],
          },
        },
      ],
    },
  },
  budget: { maxTurns: 6, maxOutputTokensPerTurn: 512, maxIdenticalCalls: 1 },
};

const ELIGIBLE = [
  'find_audio_moment',
  'sync_cuts_to_beats',
  'apply_camera_shake',
] as const;

const BEAT_PLAN = {
  schemaVersion: 'EDITRON_MEASURED_BEAT_PLAN_V2R_1',
  assetId: 'music-1',
  measuredEvidenceReceiptHash: 'a'.repeat(64),
  strongPeakFrames: [119, 239, 359, 479],
  finalStrongPeakFrame: 479,
};

const BEAT_CONSTRAINTS = {
  maxSnapFrames: 8,
  minClipFrames: 20,
  maxConsecutiveBeatCuts: 4,
  protectedAudioRange: { startFrame: 0, endFrame: 90 },
  protectedBoundaryToleranceFrames: 3,
  sourceDurationFramesByAssetId: { 'asset-1': 600 },
  requireSourceHandles: true,
};

describe('provider-native episode interruption and resume V2R', () => {
  it('resumes only the suffix through opaque results and binds the final receipt', async () => {
    const checkpoint = await interruptAfterWriter();
    let suffixInvocation = 0;
    const invoke = vi.fn(async (
      request: Readonly<SerializedProviderNativeTurnV2R>,
    ): Promise<ProviderNativeInvokeResponseV2R> => {
      suffixInvocation += 1;
      const body = JSON.stringify(request.body);
      expect(body).toContain(checkpoint.checkpointSha256);
      expect(body).toContain('result_t3_1');
      expect(body).toContain('sync_cuts_to_beats');
      expect(body).not.toContain('prefix-audio-call');
      expect(body).not.toContain('revision-43');
      expect(body).not.toContain('"assetId":"music-1"');
      if (suffixInvocation === 1) {
        return openAiCall('suffix-shake-invalid', 'apply_camera_shake', {
          projectId: 'project-1',
          argumentReferences: [
            { targetField: 'expectedProjectRevision', resultReferenceId: 'result_t3_1' },
            { targetField: 'overlayId', resultReferenceId: 'result_t3_2' },
            { targetField: 'targetFrame', resultReferenceId: 'result_t3_3' },
          ],
        });
      }
      return suffixInvocation === 2
        ? openAiCall('suffix-shake-call', 'apply_camera_shake', {
            projectId: 'project-1',
            effectPlan: { goal: 'Emphasize the final measured impact', formIntent: 'restrained-impact' },
            argumentReferences: [
              { targetField: 'expectedProjectRevision', resultReferenceId: 'result_t3_1' },
              { targetField: 'overlayId', resultReferenceId: 'result_t3_2' },
              { targetField: 'targetFrame', resultReferenceId: 'result_t3_3' },
            ],
          })
        : finish('READY_FOR_PROOF');
    });
    const executeIsolated = vi.fn(async ({ operatorId, arguments: args }: {
      operatorId: string;
      arguments: Readonly<JsonRecord>;
    }) => {
      expect(operatorId).toBe('apply_camera_shake');
      expect(args).toMatchObject({
        expectedProjectRevision: 'revision-43',
        overlayId: 'overlay-video-1',
        targetFrame: 479,
      });
      return execution({ receipt: { status: 'PASS', projectRevision: 'revision-44' } });
    });

    const receipt = await runProviderNativeToolEpisodeV2R({
      route: ROUTE,
      context: CONTEXT,
      eligibleOperatorIds: ELIGIBLE,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      resumeCheckpoint: checkpoint,
      resumeCurrentProjectRevision: 'revision-43',
      invoke,
      executeIsolated,
    });
    const resumedReceipt = buildProviderNativeResumedEpisodeReceiptV2R({
      checkpoint,
      episodeReceipt: receipt,
    });

    expect(invoke).toHaveBeenCalledTimes(3);
    expect(executeIsolated).toHaveBeenCalledTimes(1);
    expect(receipt.selectedOperatorIds).toEqual(ELIGIBLE);
    expect(receipt.turns).toHaveLength(6);
    expect(receipt.turns[3]).toMatchObject({
      argumentRepair: {
        output: { details: { repairAttempt: 2, maxRepairAttempts: 2 } },
      },
    });
    expect(receipt.terminal.disposition).toBe('READY_FOR_PROOF');
    expect(receipt.stateEffects).toEqual([]);
    expect(resumedReceipt).toMatchObject({
      resumeCheckpointSha256: checkpoint.checkpointSha256,
      episodeReceiptSha256: receipt.receiptSha256,
      stateEffects: [],
    });
    expect(() => buildProviderNativeResumedEpisodeReceiptV2R({
      checkpoint,
      episodeReceipt: {
        ...receipt,
        terminal: { ...receipt.terminal, summary: 'forged final summary' },
      },
    })).toThrow('PROVIDER_NATIVE_RESUMED_EPISODE_RECEIPT_HASH_MISMATCH');
  });

  it('rejects a stale current revision before provider invocation', async () => {
    const checkpoint = await interruptAfterWriter();
    const invoke = vi.fn();
    const executeIsolated = vi.fn();

    await expect(runProviderNativeToolEpisodeV2R({
      route: ROUTE,
      context: CONTEXT,
      eligibleOperatorIds: ELIGIBLE,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      resumeCheckpoint: checkpoint,
      resumeCurrentProjectRevision: 'revision-44',
      invoke,
      executeIsolated,
    })).rejects.toThrow('PROVIDER_NATIVE_RESUME_STALE_PROJECT_REVISION');
    expect(invoke).not.toHaveBeenCalled();
    expect(executeIsolated).not.toHaveBeenCalled();
  });

  it('rejects altered and rehashed-forged prefixes before provider invocation', async () => {
    const checkpoint = await interruptAfterWriter();
    const altered = { ...checkpoint, nextTurn: 99 };
    const invoke = vi.fn();
    await expect(resume(altered, invoke)).rejects
      .toThrow('PROVIDER_NATIVE_RESUME_CHECKPOINT_HASH_MISMATCH');

    const forged = clone(checkpoint);
    const writerExecution = forged.completedTurns[2].execution as JsonRecord;
    const writerOutput = writerExecution.output as JsonRecord;
    const writerReceipt = writerOutput.receipt as JsonRecord;
    writerReceipt.projectRevision = 'revision-forged';
    const rehashed = rehashCheckpoint(forged);
    await expect(resume(rehashed, invoke)).rejects
      .toThrow('PROVIDER_NATIVE_RESUME_ISSUED_REFERENCE_MISMATCH');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects changed route, context and tool set identities before invocation', async () => {
    const checkpoint = await interruptAfterWriter();
    const invoke = vi.fn();
    await expect(runProviderNativeToolEpisodeV2R({
      route: { ...ROUTE, reasoningMode: 'high' },
      context: CONTEXT,
      eligibleOperatorIds: ELIGIBLE,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      resumeCheckpoint: checkpoint,
      resumeCurrentProjectRevision: 'revision-43',
      invoke,
      executeIsolated: vi.fn(),
    })).rejects.toThrow('PROVIDER_NATIVE_RESUME_ROUTE_MISMATCH');
    await expect(runProviderNativeToolEpisodeV2R({
      route: ROUTE,
      context: { ...CONTEXT, objective: `${CONTEXT.objective} changed` },
      eligibleOperatorIds: ELIGIBLE,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      resumeCheckpoint: checkpoint,
      resumeCurrentProjectRevision: 'revision-43',
      invoke,
      executeIsolated: vi.fn(),
    })).rejects.toThrow('PROVIDER_NATIVE_RESUME_CONTEXT_MISMATCH');
    await expect(runProviderNativeToolEpisodeV2R({
      route: ROUTE,
      context: CONTEXT,
      eligibleOperatorIds: ['find_audio_moment', 'sync_cuts_to_beats'],
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      resumeCheckpoint: checkpoint,
      resumeCurrentProjectRevision: 'revision-43',
      invoke,
      executeIsolated: vi.fn(),
    })).rejects.toThrow('PROVIDER_NATIVE_RESUME_TOOL_SET_MISMATCH');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('adds the writer revision required to resume a final mutation checkpoint', async () => {
    const onTurnCommitted = vi.fn();
    const receipt = await runProviderNativeToolEpisodeV2R({
      route: ROUTE,
      context: {
        ...CONTEXT,
        episodeId: 'stage25-resume-missing-writer-projection',
        authorityAndPolicy: {
          ...CONTEXT.authorityAndPolicy,
          completeCapabilityDossier: { plannerRecordSupplements: [] },
        },
        budget: { ...CONTEXT.budget, maxTurns: 1 },
      },
      eligibleOperatorIds: ['apply_camera_shake'],
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      invoke: async () => openAiCall('unbound-writer', 'apply_camera_shake', {
        projectId: 'project-1',
        expectedProjectRevision: 'revision-42',
        overlayId: 'overlay-video-1',
        targetFrame: 479,
        effectPlan: { goal: 'Emphasize the hit', formIntent: 'restrained-impact' },
      }),
      executeIsolated: async () => execution({
        receipt: { status: 'PASS', projectRevision: 'revision-43' },
      }),
      onTurnCommitted,
    });
    expect(receipt.terminal.disposition).toBe('STEP_BUDGET_EXHAUSTED');
    expect(receipt.turns[0].issuedResultReferences).toEqual([
      expect.objectContaining({
        sourceOperatorId: 'apply_camera_shake',
        sourceOutputField: 'receipt.projectRevision',
        valueSha256: hashCanonicalJsonV1('revision-43'),
      }),
    ]);
    expect(onTurnCommitted).toHaveBeenCalledOnce();
    expect(onTurnCommitted.mock.calls[0][0].checkpoint).toMatchObject({ nextTurn: 2 });
  });
});

async function interruptAfterWriter(): Promise<Readonly<ProviderNativeEpisodeResumeCheckpointV2R>> {
  let invocation = 0;
  let captured: Readonly<ProviderNativeEpisodeResumeCheckpointV2R> | null = null;
  const executeIsolated = vi.fn(async ({ operatorId }: { operatorId: string }) => {
    if (operatorId === 'find_audio_moment') {
      return execution({ result: BEAT_PLAN, evidence: { evidenceId: 'ev-audio-1' } });
    }
    return execution({
      receipt: { status: 'PASS', projectRevision: 'revision-43' },
      result: {
        alignedBoundaries: [119, 239, 359, 479],
        finalHitOverlayId: 'overlay-video-1',
        finalStrongPeakFrame: 479,
      },
    });
  });
  await expect(runProviderNativeToolEpisodeV2R({
    route: ROUTE,
    context: CONTEXT,
    eligibleOperatorIds: ELIGIBLE,
    argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
    invoke: async () => {
      invocation += 1;
      if (invocation === 1) {
        return openAiCall('prefix-audio-call', 'find_audio_moment', {
          projectId: 'project-1', query: 'measured strong music impacts',
        });
      }
      if (invocation === 2) {
        return openAiCall('prefix-sync-invalid', 'sync_cuts_to_beats', {
          projectId: 'project-1',
          expectedProjectRevision: 'revision-42',
        });
      }
      return openAiCall('prefix-sync-call', 'sync_cuts_to_beats', {
        projectId: 'project-1',
        expectedProjectRevision: 'revision-42',
        overlayIds: ['overlay-video-1'],
        beatSyncConstraints: BEAT_CONSTRAINTS,
        evidenceIds: ['ev-audio-1'],
        argumentReferences: [{ targetField: 'beatPlan', resultReferenceId: 'result_t1_1' }],
      });
    },
    executeIsolated,
    onTurnCommitted: ({ checkpoint }) => {
      captured = checkpoint;
      if (checkpoint.nextTurn === 4) throw new Error('TEST_INTENTIONAL_WORKER_INTERRUPTION');
    },
  })).rejects.toThrow('TEST_INTENTIONAL_WORKER_INTERRUPTION');
  expect(executeIsolated).toHaveBeenCalledTimes(2);
  return requireCapturedCheckpoint(captured);
}

function resume(
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
  invoke: (
    request: Readonly<SerializedProviderNativeTurnV2R>,
  ) => Promise<ProviderNativeInvokeResponseV2R>,
) {
  return runProviderNativeToolEpisodeV2R({
    route: ROUTE,
    context: CONTEXT,
    eligibleOperatorIds: ELIGIBLE,
    argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
    resumeCheckpoint: checkpoint,
    resumeCurrentProjectRevision: 'revision-43',
    invoke,
    executeIsolated: vi.fn(),
  });
}

function requireCapturedCheckpoint(
  value: unknown,
): Readonly<ProviderNativeEpisodeResumeCheckpointV2R> {
  if (!value || typeof value !== 'object'
    || (value as { nextTurn?: unknown }).nextTurn !== 4) {
    throw new Error('TEST_CHECKPOINT_NOT_CAPTURED');
  }
  return value as Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
}

function execution(output: JsonRecord): Readonly<ProviderNativeToolExecutionV2R> {
  return {
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION',
    disposition: 'OK',
    output,
    evidenceIds: ['ev-audio-1'],
  };
}

function openAiCall(callId: string, name: string, args: JsonRecord) {
  return { status: 200, body: {
    id: `response-${callId}`,
    model: 'gpt-5.6-terra',
    status: 'completed',
    output: [{
      type: 'function_call', call_id: callId, name, arguments: JSON.stringify(args),
    }],
  } };
}

function finish(disposition: 'READY_FOR_PROOF') {
  return openAiCall('finish-call', 'finish_editron_research_episode', {
    disposition,
    reasonCodes: ['MODEL_READY_FOR_PROOF'],
    evidenceIds: [],
    summary: 'All isolated edits are complete; rendered acceptance proof has not run.',
  });
}

function clone(
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
): ProviderNativeEpisodeResumeCheckpointV2R {
  return JSON.parse(JSON.stringify(checkpoint)) as ProviderNativeEpisodeResumeCheckpointV2R;
}

function rehashCheckpoint(
  checkpoint: ProviderNativeEpisodeResumeCheckpointV2R,
): ProviderNativeEpisodeResumeCheckpointV2R {
  checkpoint.completedTurnsSha256 = hashCanonicalJsonV1(checkpoint.completedTurns);
  const material = {
    checkpointVersion: checkpoint.checkpointVersion,
    authority: checkpoint.authority,
    route: checkpoint.route,
    episodeId: checkpoint.episodeId,
    contextSha256: checkpoint.contextSha256,
    toolSetSha256: checkpoint.toolSetSha256,
    argumentHandoffMode: checkpoint.argumentHandoffMode,
    completedTurns: checkpoint.completedTurns,
    completedTurnsSha256: checkpoint.completedTurnsSha256,
    nextTurn: checkpoint.nextTurn,
    whatHasNotBeenChecked: checkpoint.whatHasNotBeenChecked,
    stateEffects: checkpoint.stateEffects,
  };
  checkpoint.checkpointSha256 = hashCanonicalJsonV1(material);
  return checkpoint;
}
