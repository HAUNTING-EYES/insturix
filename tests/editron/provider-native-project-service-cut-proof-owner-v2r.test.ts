import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { createProviderNativeEpisodeResumeCheckpointV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import { PROVIDER_NATIVE_EXECUTION_BOUND_OUTCOME_PROOF_VERSION_V2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-durable-outcome-proof-v2r';
import { createProviderNativeProjectServiceCloneOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-clone-owner-v2r';
import type { ProjectServiceIsolatedOperatorOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-clone-owner-v2r';
import { createProviderNativeProjectServiceCutOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-cut-owner-v2r';
import { createProviderNativeProjectServiceCutProofOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-cut-proof-owner-v2r';
import { createProviderNativeProjectServiceKeyframeOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-keyframe-owner-v2r';
import {
  PROVIDER_NATIVE_EPISODE_VERSION_V2R,
  type ProviderNativeEpisodeReceiptV2R,
  type ProviderNativeToolExecutionV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import type { Phase0RenderedStillEvidence }
  from '@/lib/editron/services/phase0-rendered-evidence-worker';
import type { Project, ProjectRevisionV1 }
  from '@/lib/editron/services/project-service';

type CutProofOwnerOptions = NonNullable<Parameters<
  typeof createProviderNativeProjectServiceCutProofOwnerV2R
>[0]>;
type RenderEvidenceBuilder = NonNullable<CutProofOwnerOptions['buildRenderedEvidence']>;

const REVISION: ProjectRevisionV1 = {
  schemaVersion: 1, value: 7,
  compatibilityUpdatedAt: '2026-08-23T10:00:00.000Z',
};
const CHECKPOINT = createProviderNativeEpisodeResumeCheckpointV2R({
  route: {
    routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
    claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
  },
  episodeId: 'cut-proof-episode-1', contextSha256: 'a'.repeat(64),
  toolSetSha256: 'b'.repeat(64),
  completedTurns: [{ turn: 1, marker: 'committed-prefix' }],
});

describe('ProjectService isolated cut rendered-proof owner V2R', () => {
  it('binds the exact cut state and complete boundary renders as PASS', async () => {
    const render = vi.fn(async (_project, options) =>
      renderedEvidence('completed', options.requestedSampleFrames ?? []));
    const result = await exercise(render);

    expect(result.proof).toMatchObject({
      version: PROVIDER_NATIVE_EXECUTION_BOUND_OUTCOME_PROOF_VERSION_V2R,
      disposition: 'PASS',
      subject: {
        executionTrace: {
          kind: 'RESUMED_EPISODE_RECEIPT',
          receiptSha256: 'd'.repeat(64),
        },
      },
      obligations: [
        { obligationId: 'edit-state', disposition: 'PASS' },
        { obligationId: 'cut-render', disposition: 'PASS' },
        { obligationId: 'cut-visual', disposition: 'PASS' },
      ],
    });
    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0][0]).toMatchObject({ durationInFrames: 90 });
    expect(render.mock.calls[0][1]).toMatchObject({
      requestedSampleFrames: [29, 30],
      baselineProject: expect.objectContaining({ durationInFrames: 120 }),
      comparisonMode: 'mutation-delta',
    });
    expect(result.canonical.durationInFrames).toBe(120);
  });

  it('keeps a skipped renderer UNVERIFIABLE instead of fabricating PASS', async () => {
    const result = await exercise(async (_project, options) =>
      renderedEvidence('skipped', options?.requestedSampleFrames ?? []));
    expect(result.proof).toMatchObject({
      disposition: 'UNVERIFIABLE',
      obligations: [
        { disposition: 'PASS' },
        { disposition: 'UNVERIFIABLE' },
        { disposition: 'UNVERIFIABLE' },
      ],
    });
  });

  it('proves a fresh execution without inventing checkpoint history', async () => {
    const render = vi.fn(async (_project, options) =>
      renderedEvidence('completed', options.requestedSampleFrames ?? []));

    const result = await exercise(render, 'FRESH_EPISODE_RECEIPT');
    expect(result.proof).toMatchObject({
      disposition: 'PASS',
      subject: {
        executionTrace: {
          kind: 'FRESH_EPISODE_RECEIPT',
          receiptSha256: result.episodeReceipt.receiptSha256,
        },
      },
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it('keeps completed but uninspected stills UNVERIFIABLE', async () => {
    const result = await exercise(async (_project, options) => {
      const evidence = renderedEvidence(
        'completed',
        options?.requestedSampleFrames ?? [],
      );
      delete evidence.renderedAestheticReport;
      return evidence;
    });
    expect(result.proof).toMatchObject({
      disposition: 'UNVERIFIABLE',
      obligations: [
        { obligationId: 'edit-state', disposition: 'PASS' },
        { obligationId: 'cut-render', disposition: 'PASS' },
        { obligationId: 'cut-visual', disposition: 'UNVERIFIABLE' },
      ],
    });
  });

  it('proves cut and focal-scale state against separate exact visual baselines', async () => {
    const render = vi.fn(async (_project, options) =>
      renderedEvidence('completed', options.requestedSampleFrames ?? [], 104));
    const result = await exerciseCombined(render);

    expect(result.proof).toMatchObject({
      disposition: 'PASS',
      obligations: [
        { obligationId: 'edit-state', disposition: 'PASS' },
        { obligationId: 'cut-render', disposition: 'PASS' },
        { obligationId: 'cut-visual', disposition: 'PASS' },
        { obligationId: 'focal-scale-render', disposition: 'PASS' },
        { obligationId: 'focal-scale-visual', disposition: 'PASS' },
      ],
    });
    expect(render).toHaveBeenCalledTimes(2);
    expect(render.mock.calls[0][1]).toMatchObject({
      requestedSampleFrames: [39, 40],
      baselineProject: expect.objectContaining({ durationInFrames: 220 }),
    });
    expect(render.mock.calls[1][1]).toMatchObject({
      requestedSampleFrames: [120],
      auditedOverlayIds: [104],
      baselineProject: expect.objectContaining({
        durationInFrames: 210,
        overlays: expect.arrayContaining([
          expect.objectContaining({ id: 104, from: 90 }),
        ]),
      }),
    });
    const focalBaseline = render.mock.calls[1][1].baselineProject as Project;
    expect(focalBaseline.overlays.find(({ id }) => id === 104)?.keyframeTracks)
      .toBeUndefined();
    expect(result.canonical.durationInFrames).toBe(220);
  });

  it('returns FAIL when inspected focal output is pixel-identical', async () => {
    let renderCount = 0;
    const result = await exerciseCombined(async (_project, options) => {
      renderCount += 1;
      return renderedEvidence(
        'completed',
        options?.requestedSampleFrames ?? [],
        104,
        renderCount === 2,
      );
    });
    expect(result.proof.disposition).toBe('FAIL');
    expect(result.proof.obligations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        obligationId: 'focal-scale-visual', disposition: 'FAIL',
      }),
    ]));
  });

  it('rejects completed evidence bound to another project or frame request', async () => {
    const wrongProject = await exercise(async (_project, options) => ({
      ...renderedEvidence('completed', options?.requestedSampleFrames ?? []),
      projectId: 'project-2',
    }));
    const wrongFrames = await exercise(async (_project, options) => ({
      ...renderedEvidence('completed', options?.requestedSampleFrames ?? []),
      requestedSampleFrames: [0],
    }));

    expect(wrongProject.proof.disposition).toBe('UNVERIFIABLE');
    expect(wrongFrames.proof.disposition).toBe('UNVERIFIABLE');
  });
});

async function exercise(
  buildRenderedEvidence: RenderEvidenceBuilder,
  executionTraceKind: 'FRESH_EPISODE_RECEIPT' | 'RESUMED_EPISODE_RECEIPT'
    = 'RESUMED_EPISODE_RECEIPT',
) {
  const canonical = project();
  const cloneOwner = createProviderNativeProjectServiceCloneOwnerV2R({
    projectService: { loadProjectForMutation: async () => ({
      project: structuredClone(canonical), revision: REVISION,
    }) },
    isolatedOperatorOwner: createProviderNativeProjectServiceCutOwnerV2R(),
    isolatedOutcomeProofOwner: createProviderNativeProjectServiceCutProofOwnerV2R({
      buildRenderedEvidence,
      now: () => '2026-08-23T10:05:00.000Z',
    }),
  });
  const resolved = executionTraceKind === 'FRESH_EPISODE_RECEIPT'
    ? await cloneOwner.resolveFresh!({
        tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1',
        episodeId: CHECKPOINT.episodeId,
      })
    : await cloneOwner.resolve({
        tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1',
        checkpoint: CHECKPOINT,
      });
  const call = {
    operatorId: 'cut_section',
    arguments: {
      projectId: 'project-1',
      expectedProjectRevision: resolved.currentRevision.projectRevision,
      targetRange: { startFrame: 30, endFrame: 60 },
      evidenceIds: ['ev-silence-1'],
    },
    turn: 2,
  } as const;
  const execution = await resolved.isolatedClone.executeIsolated(call);
  if (execution.disposition !== 'OK') throw new Error('TEST_CUT_EXECUTION_FAILED');
  const proposalReceipt = await resolved.isolatedClone.finalizeProposalReceipt?.();
  if (!proposalReceipt) throw new Error('TEST_PROPOSAL_RECEIPT_MISSING');
  const episodeReceipt = receipt([{ call, execution }]);
  const proof = await resolved.isolatedClone.finalizeExecutionBoundOutcomeProof?.({
    episodeReceipt,
    executionTrace: {
      kind: executionTraceKind,
      receiptSha256: executionTraceKind === 'FRESH_EPISODE_RECEIPT'
        ? episodeReceipt.receiptSha256 : 'd'.repeat(64),
    },
    proposalReceipt,
  });
  if (!proof) throw new Error('TEST_OUTCOME_PROOF_MISSING');
  return { proof, canonical, episodeReceipt };
}

async function exerciseCombined(
  buildRenderedEvidence: RenderEvidenceBuilder,
) {
  const canonical = combinedProject();
  const cut = createProviderNativeProjectServiceCutOwnerV2R();
  const keyframes = createProviderNativeProjectServiceKeyframeOwnerV2R();
  const cloneOwner = createProviderNativeProjectServiceCloneOwnerV2R({
    projectService: { loadProjectForMutation: async () => ({
      project: structuredClone(canonical), revision: REVISION,
    }) },
    isolatedOperatorOwner: dispatch(cut, keyframes),
    isolatedOutcomeProofOwner: createProviderNativeProjectServiceCutProofOwnerV2R({
      buildRenderedEvidence,
      now: () => '2026-08-23T10:05:00.000Z',
    }),
  });
  const resolved = await cloneOwner.resolve({
    tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1',
    checkpoint: CHECKPOINT,
  });
  const cutCall = {
    operatorId: 'cut_section', turn: 2, arguments: {
      projectId: 'project-1',
      expectedProjectRevision: resolved.currentRevision.projectRevision,
      targetRange: { startFrame: 40, endFrame: 50 },
      evidenceIds: ['ev-cut'],
    },
  } as const;
  const cutExecution = await resolved.isolatedClone.executeIsolated(cutCall);
  if (cutExecution.disposition !== 'OK') throw new Error('TEST_CUT_EXECUTION_FAILED');
  const focalCall = {
    operatorId: 'set_keyframes', turn: 3, arguments: {
      projectId: 'project-1',
      expectedProjectRevision: receiptRevision(cutExecution),
      overlayId: 104, property: 'scale',
      keyframes: [
        { frame: 0, value: 1, easing: 'ease-in-out' },
        { frame: 30, value: 1.08, easing: 'ease-out' },
      ],
      focalPoint: { x: 0.74, y: 0.5 },
      evidenceIds: ['ev-focal'],
    },
  } as const;
  const focalExecution = await resolved.isolatedClone.executeIsolated(focalCall);
  if (focalExecution.disposition !== 'OK') {
    throw new Error('TEST_FOCAL_EXECUTION_FAILED');
  }
  const proposalReceipt = await resolved.isolatedClone.finalizeProposalReceipt?.();
  if (!proposalReceipt) throw new Error('TEST_PROPOSAL_RECEIPT_MISSING');
  const proof = await resolved.isolatedClone.finalizeExecutionBoundOutcomeProof?.({
    episodeReceipt: receipt([
      { call: cutCall, execution: cutExecution },
      { call: focalCall, execution: focalExecution },
    ]),
    executionTrace: {
      kind: 'RESUMED_EPISODE_RECEIPT',
      receiptSha256: 'd'.repeat(64),
    },
    proposalReceipt,
  });
  if (!proof) throw new Error('TEST_OUTCOME_PROOF_MISSING');
  return { proof, canonical };
}

function receipt(
  entries: readonly Readonly<{
    call: {
      operatorId: string;
      arguments: Readonly<Record<string, unknown>>;
      turn: number;
    };
    execution: Readonly<ProviderNativeToolExecutionV2R>;
  }>[],
): Readonly<ProviderNativeEpisodeReceiptV2R> {
  const material = {
    receiptVersion: PROVIDER_NATIVE_EPISODE_VERSION_V2R,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    route: CHECKPOINT.route, episodeId: CHECKPOINT.episodeId,
    contextSha256: CHECKPOINT.contextSha256, toolSetSha256: CHECKPOINT.toolSetSha256,
    argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES' as const,
    selectedOperatorIds: entries.map(({ call }) => call.operatorId),
    turns: entries.map(({ call, execution }, index) => ({
      turn: call.turn,
      modelCall: {
        callId: `call-${index + 1}`,
        name: call.operatorId,
        arguments: call.arguments,
      },
      normalizedArguments: call.arguments,
      execution,
    })),
    terminal: {
      disposition: 'READY_FOR_PROOF' as const,
      reasonCodes: ['MODEL_READY_FOR_PROOF'], evidenceIds: [], summary: 'Ready.',
    },
    productOutcome: 'NOT_EVALUATED_ADAPTER_ONLY' as const,
    stateEffects: [] as const,
    transcriptSha256: 'c'.repeat(64),
  };
  return { ...material, receiptSha256: hashCanonicalJsonV1(material) };
}

function renderedEvidence(
  status: Phase0RenderedStillEvidence['status'],
  frames: number[],
  activeOverlayId = 1,
  forceNoDelta = false,
): Phase0RenderedStillEvidence {
  const capturedAt = '2026-08-23T10:05:00.000Z';
  const reportFrames = frames.map((frame, index) => {
    const changed = !forceNoDelta && (frames.length === 1 || index > 0);
    return {
      frame,
      activeOverlayIds: [activeOverlayId],
      activeOverlayTypes: ['video'],
      fullStill: `https://example.invalid/${frame}.png`,
      baselineStill: `https://example.invalid/baseline-${frame}.png`,
      mutationPixelCount: changed ? 20 : 0,
      sampledPixelCount: 100,
      report: { status: 'pass' as const, score: 1, issues: [] },
    };
  });
  const mutationChangedFrameCount = reportFrames.filter(
    ({ mutationPixelCount }) => mutationPixelCount > 0,
  ).length;
  return {
    version: 'editron-phase0-rendered-still-evidence-v1',
    status, statusReason: status === 'completed' ? null : 'test-render-skipped',
    source: 'phase0-rendered-evidence-worker', projectId: 'project-1',
    capturedAt, completedAt: capturedAt,
    functionName: 'test-renderer', serveUrl: 'https://example.invalid/remotion',
    region: 'test', sampleLimit: frames.length, requestedSampleFrames: frames,
    renderedFrames: status === 'completed' ? frames.map((frame) => ({
      frame, url: `https://example.invalid/${frame}.png`, outKey: `${frame}.png`,
      bucketName: 'test', renderId: `render-${frame}`, sizeInBytes: 100,
      baselineUrl: `https://example.invalid/baseline-${frame}.png`,
    })) : [],
    failedFrames: [],
    artifactPackStatus: status === 'completed' ? 'ready' : 'not-renderable',
    artifactPackIssues: status === 'completed' ? [] : ['test-render-skipped'],
    ...(status === 'completed' ? {
      renderedAestheticReport: {
        summary: {
          status: mutationChangedFrameCount ? 'pass' : 'fail',
          absoluteQualityStatus: 'pass',
          mutationStatus: mutationChangedFrameCount ? 'pass' : 'fail',
          mutationChangedFrameCount,
          sampledFrames: frames.length,
        },
        frames: reportFrames,
      },
    } : {}),
  };
}

function dispatch(
  cut: Readonly<ProjectServiceIsolatedOperatorOwnerV2R>,
  keyframes: Readonly<ProjectServiceIsolatedOperatorOwnerV2R>,
): Readonly<ProjectServiceIsolatedOperatorOwnerV2R> {
  const owner = (operatorId: string) => operatorId === 'cut_section' ? cut : keyframes;
  return {
    execute: async (input) => owner(input.call.operatorId).execute(input),
    replayCommitted: async (input) => owner(input.call.operatorId).replayCommitted!(input),
  };
}

function receiptRevision(execution: Readonly<ProviderNativeToolExecutionV2R>): string {
  return String((execution.output.receipt as Record<string, unknown>).projectRevision);
}

function project(): Project {
  return {
    projectId: 'project-1', userId: 'user-1', name: 'Project',
    overlays: [{
      id: 1, type: 'video', startFrame: 0, endFrame: 120,
      from: 0, durationInFrames: 120, sourceStartFrame: 0,
      styles: { opacity: 1 }, content: 'https://example.invalid/source.mp4',
    } as unknown as Project['overlays'][number]],
    aspectRatio: '16:9', playerDimensions: { width: 1920, height: 1080 },
    fps: 30, durationInFrames: 120,
    createdAt: new Date('2026-08-23T09:00:00.000Z'),
    updatedAt: new Date(REVISION.compatibilityUpdatedAt),
    projectRevision: REVISION.value, visibility: 'private',
  };
}

function combinedProject(): Project {
  return {
    projectId: 'project-1', userId: 'user-1', name: 'Combined proof project',
    overlays: [
      {
        id: 101, type: 'video', assetId: 'opening', src: '/opening.mp4', row: 0,
        from: 0, durationInFrames: 100, sourceStartFrame: 0, videoStartTime: 0,
        styles: { opacity: 1 },
      },
      {
        id: 104, type: 'video', assetId: 'product', src: '/product.mp4', row: 0,
        from: 100, durationInFrames: 120, sourceStartFrame: 0, videoStartTime: 0,
        styles: { opacity: 1 },
      },
    ] as unknown as Project['overlays'],
    aspectRatio: '16:9', playerDimensions: { width: 1920, height: 1080 },
    fps: 30, durationInFrames: 220,
    createdAt: new Date('2026-08-23T09:00:00.000Z'),
    updatedAt: new Date(REVISION.compatibilityUpdatedAt),
    projectRevision: REVISION.value, visibility: 'private',
  };
}
