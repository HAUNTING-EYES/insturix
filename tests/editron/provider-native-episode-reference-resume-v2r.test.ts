import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  bindProviderNativeReferenceInputV2R,
  PROVIDER_NATIVE_REFERENCE_ARM_V2R,
  PROVIDER_NATIVE_REFERENCE_INPUT_VERSION_V2R,
  type ProviderNativeReferenceInputV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-reference-input-v2r';
import {
  createProviderNativeEpisodeResumeCheckpointV2R,
  PROVIDER_NATIVE_EPISODE_RESUME_REFERENCE_BOUND_VERSION_V2R,
  PROVIDER_NATIVE_EPISODE_RESUME_VERSION_V2R,
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
  episodeId: 'stage25-reference-resume-episode-1',
  objective: 'Use the supplied reference while aligning cuts to measured impacts.',
  activeTarget: { taskId: 'REFERENCE-RESUME-01', requirement: 'reference-bound beat sync' },
  revisionBinding: { projectId: 'project-1', expectedProjectRevision: 'revision-42' },
  projectState: { projectId: 'project-1', projectRevision: 'revision-42' },
  evidence: [{ evidenceId: 'ev-audio-1', kind: 'MEASURED_AUDIO' }],
  preservationRules: ['Never resume against changed reference media.'],
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
          },
        },
      ],
    },
  },
  budget: { maxTurns: 4, maxOutputTokensPerTurn: 512, maxIdenticalCalls: 1 },
};

const ELIGIBLE = [
  'find_audio_moment',
  'sync_cuts_to_beats',
  'apply_camera_shake',
] as const;

const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const ONE_PIXEL_PNG_SHA256 = createHash('sha256')
  .update(Buffer.from(ONE_PIXEL_PNG, 'base64'))
  .digest('hex');
const REFERENCE_INPUT: ProviderNativeReferenceInputV2R = {
  version: PROVIDER_NATIVE_REFERENCE_INPUT_VERSION_V2R,
  arm: PROVIDER_NATIVE_REFERENCE_ARM_V2R,
  referenceId: 'ref_resume_0001',
  referenceAssetSha256: 'b'.repeat(64),
  resolution: 'high',
  frames: [
    {
      frameId: 'frame_000001', timestampUs: '0', mimeType: 'image/png',
      bytesBase64: ONE_PIXEL_PNG, bytesSha256: ONE_PIXEL_PNG_SHA256,
    },
    {
      frameId: 'frame_000002', timestampUs: '1000000', mimeType: 'image/png',
      bytesBase64: ONE_PIXEL_PNG, bytesSha256: ONE_PIXEL_PNG_SHA256,
    },
  ],
};

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

describe('provider-native reference identity across interruption and resume V2R', () => {
  it('reattaches the exact reference and resumes only the suffix', async () => {
    const checkpoint = await interruptReferenceEpisode();
    const expectedManifestSha256 = bindProviderNativeReferenceInputV2R(
      REFERENCE_INPUT,
    ).manifestSha256;
    const invoke = vi.fn(async (
      request: Readonly<SerializedProviderNativeTurnV2R>,
    ): Promise<ProviderNativeInvokeResponseV2R> => {
      const body = JSON.stringify(request.body);
      expect(body).toContain(checkpoint.checkpointSha256);
      expect(body).toContain(expectedManifestSha256);
      expect(body).toContain(`data:image/png;base64,${ONE_PIXEL_PNG}`);
      expect(body).not.toContain('prefix-find-audio');
      expect(body).not.toContain('revision-43');
      return finish();
    });
    const executeIsolated = vi.fn();

    const receipt = await runProviderNativeToolEpisodeV2R({
      route: ROUTE,
      context: CONTEXT,
      eligibleOperatorIds: ELIGIBLE,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      referenceInput: REFERENCE_INPUT,
      resumeCheckpoint: checkpoint,
      resumeCurrentProjectRevision: 'revision-43',
      invoke,
      executeIsolated,
    });

    expect(checkpoint).toMatchObject({
      checkpointVersion: PROVIDER_NATIVE_EPISODE_RESUME_REFERENCE_BOUND_VERSION_V2R,
      referenceInputManifestSha256: expectedManifestSha256,
      nextTurn: 3,
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(executeIsolated).not.toHaveBeenCalled();
    expect(receipt.selectedOperatorIds).toEqual([
      'find_audio_moment',
      'sync_cuts_to_beats',
    ]);
    expect(receipt.terminal.disposition).toBe('READY_FOR_PROOF');
    expect(receipt.stateEffects).toEqual([]);
  });

  it('rejects missing, changed and previously unbound references before invocation', async () => {
    const checkpoint = await interruptReferenceEpisode();
    const invoke = vi.fn(async (): Promise<ProviderNativeInvokeResponseV2R> => {
      throw new Error('TEST_PROVIDER_INVOKE_MUST_NOT_RUN');
    });
    const executeIsolated = vi.fn(async (): Promise<
      Readonly<ProviderNativeToolExecutionV2R>
    > => {
      throw new Error('TEST_ISOLATED_EXECUTION_MUST_NOT_RUN');
    });

    await expect(resume(checkpoint, undefined, invoke, executeIsolated)).rejects
      .toThrow('PROVIDER_NATIVE_RESUME_REFERENCE_INPUT_REQUIRED');
    await expect(resume(checkpoint, {
      ...REFERENCE_INPUT,
      referenceId: 'ref_resume_changed',
    }, invoke, executeIsolated)).rejects
      .toThrow('PROVIDER_NATIVE_RESUME_REFERENCE_INPUT_MISMATCH');

    // V1 remains the exact legacy identity. A newly supplied reference cannot
    // be smuggled into a checkpoint that never committed its manifest hash.
    const legacy = createProviderNativeEpisodeResumeCheckpointV2R({
      route: checkpoint.route,
      episodeId: checkpoint.episodeId,
      contextSha256: checkpoint.contextSha256,
      toolSetSha256: checkpoint.toolSetSha256,
      completedTurns: checkpoint.completedTurns,
    });
    expect(legacy.checkpointVersion).toBe(PROVIDER_NATIVE_EPISODE_RESUME_VERSION_V2R);
    await expect(resume(legacy, REFERENCE_INPUT, invoke, executeIsolated)).rejects
      .toThrow('PROVIDER_NATIVE_RESUME_REFERENCE_INPUT_UNBOUND');
    expect(invoke).not.toHaveBeenCalled();
    expect(executeIsolated).not.toHaveBeenCalled();
  });
});

async function interruptReferenceEpisode(): Promise<
  Readonly<ProviderNativeEpisodeResumeCheckpointV2R>
> {
  let invocation = 0;
  let captured: Readonly<ProviderNativeEpisodeResumeCheckpointV2R> | null = null;
  await expect(runProviderNativeToolEpisodeV2R({
    route: ROUTE,
    context: CONTEXT,
    eligibleOperatorIds: ELIGIBLE,
    argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
    referenceInput: REFERENCE_INPUT,
    invoke: async () => {
      invocation += 1;
      return invocation === 1
        ? openAiCall('prefix-find-audio', 'find_audio_moment', {
            projectId: 'project-1', query: 'measured strong music impacts',
          })
        : openAiCall('prefix-sync', 'sync_cuts_to_beats', {
            projectId: 'project-1',
            expectedProjectRevision: 'revision-42',
            overlayIds: ['overlay-video-1'],
            beatSyncConstraints: BEAT_CONSTRAINTS,
            evidenceIds: ['ev-audio-1'],
            argumentReferences: [{
              targetField: 'beatPlan', resultReferenceId: 'result_t1_1',
            }],
          });
    },
    executeIsolated: async ({ operatorId }) => operatorId === 'find_audio_moment'
      ? execution({ result: BEAT_PLAN, evidence: { evidenceId: 'ev-audio-1' } })
      : execution({
          receipt: { status: 'PASS', projectRevision: 'revision-43' },
          result: {
            alignedBoundaries: [119, 239, 359, 479],
            finalHitOverlayId: 'overlay-video-1',
            finalStrongPeakFrame: 479,
          },
        }),
    onTurnCommitted: ({ checkpoint }) => {
      captured = checkpoint;
      if (checkpoint.nextTurn === 3) {
        throw new Error('TEST_INTENTIONAL_REFERENCE_WORKER_INTERRUPTION');
      }
    },
  })).rejects.toThrow('TEST_INTENTIONAL_REFERENCE_WORKER_INTERRUPTION');
  if (!captured) throw new Error('TEST_REFERENCE_CHECKPOINT_NOT_CAPTURED');
  return captured;
}

function resume(
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
  referenceInput: Readonly<ProviderNativeReferenceInputV2R> | undefined,
  invoke: (
    request: Readonly<SerializedProviderNativeTurnV2R>,
  ) => Promise<ProviderNativeInvokeResponseV2R>,
  executeIsolated: (
    call: Readonly<{
      operatorId: string;
      arguments: Readonly<JsonRecord>;
      turn: number;
    }>,
  ) => Promise<Readonly<ProviderNativeToolExecutionV2R>>,
) {
  return runProviderNativeToolEpisodeV2R({
    route: ROUTE,
    context: CONTEXT,
    eligibleOperatorIds: ELIGIBLE,
    argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
    ...(referenceInput ? { referenceInput } : {}),
    resumeCheckpoint: checkpoint,
    resumeCurrentProjectRevision: 'revision-43',
    invoke,
    executeIsolated,
  });
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

function finish() {
  return openAiCall('finish-reference-resume', 'finish_editron_research_episode', {
    disposition: 'READY_FOR_PROOF',
    reasonCodes: ['MODEL_READY_FOR_PROOF'],
    evidenceIds: [],
    summary: 'The isolated edit is complete; rendered acceptance proof has not run.',
  });
}
