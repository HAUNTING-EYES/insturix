import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { createProviderNativeEpisodeResumeCheckpointV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import { createProviderNativeProjectServiceCloneOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-clone-owner-v2r';
import { createProviderNativeProjectServiceCutOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-cut-owner-v2r';
import { createProviderNativeProjectServiceCutProofOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-cut-proof-owner-v2r';
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
      disposition: 'PASS',
      obligations: [
        { obligationId: 'cut-state', disposition: 'PASS' },
        { obligationId: 'cut-render', disposition: 'PASS' },
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
      obligations: [{ disposition: 'PASS' }, { disposition: 'UNVERIFIABLE' }],
    });
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
  const resolved = await cloneOwner.resolve({
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
  const episodeReceipt = receipt(call, execution);
  const proof = await resolved.isolatedClone.finalizeOutcomeProof?.({
    episodeReceipt,
    resumedReceiptSha256: 'd'.repeat(64),
    proposalReceipt,
  });
  if (!proof) throw new Error('TEST_OUTCOME_PROOF_MISSING');
  return { proof, canonical };
}

function receipt(
  call: Readonly<{ operatorId: string; arguments: Readonly<Record<string, unknown>>; turn: number }>,
  execution: Readonly<ProviderNativeToolExecutionV2R>,
): Readonly<ProviderNativeEpisodeReceiptV2R> {
  const material = {
    receiptVersion: PROVIDER_NATIVE_EPISODE_VERSION_V2R,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    route: CHECKPOINT.route, episodeId: CHECKPOINT.episodeId,
    contextSha256: CHECKPOINT.contextSha256, toolSetSha256: CHECKPOINT.toolSetSha256,
    argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES' as const,
    selectedOperatorIds: ['cut_section'],
    turns: [{
      turn: call.turn,
      modelCall: { callId: 'call-1', name: call.operatorId, arguments: call.arguments },
      normalizedArguments: call.arguments,
      execution,
    }],
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
): Phase0RenderedStillEvidence {
  const capturedAt = '2026-08-23T10:05:00.000Z';
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
  };
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
