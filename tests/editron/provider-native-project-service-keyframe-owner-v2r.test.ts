import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { createProviderNativeEpisodeResumeCheckpointV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import { projectProposalStateV2R }
  from '@/lib/editron/research/open-ended-planner/project-service-proposal-state-v2r';
import type { ProjectServiceIsolatedOperatorOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-clone-owner-v2r';
import { createProviderNativeProjectServiceCloneOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-clone-owner-v2r';
import { createProviderNativeProjectServiceCutOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-cut-owner-v2r';
import { createProviderNativeProjectServiceKeyframeOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-keyframe-owner-v2r';
import type { ProviderNativeToolExecutionV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import type { Project, ProjectRevisionV1 }
  from '@/lib/editron/services/project-service';

type JsonRecord = Record<string, unknown>;

const USER_ID = 'keyframe-owner-user';
const PROJECT_ID = 'keyframe-owner-project';
const REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 12,
  compatibilityUpdatedAt: '2026-08-23T19:00:00.000Z',
};
const BASE_REVISION = `project-revision-v1:${hashCanonicalJsonV1(REVISION)}`;
const CHECKPOINT = createProviderNativeEpisodeResumeCheckpointV2R({
  route: {
    routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
    claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
  },
  episodeId: 'keyframe-owner-episode',
  contextSha256: 'c'.repeat(64),
  toolSetSha256: 'd'.repeat(64),
  completedTurns: [{ turn: 1, marker: 'committed-read-prefix' }],
});

describe('ProjectService isolated focal-scale keyframe owner V2R', () => {
  it('applies supplied local-frame scale values and preserves existing tracks', async () => {
    const source = project();
    const owner = createProviderNativeProjectServiceKeyframeOwnerV2R();
    const execution = await owner.execute(directInput(
      source,
      keyframeCall(2, BASE_REVISION),
    ));

    expect(execution).toMatchObject({
      disposition: 'OK',
      evidenceIds: ['EV-FORM'],
      output: { receipt: { status: 'PASS', proof: {
        ownerRef: 'lib/editron/services/keyframe-mutation.ts#buildKeyframeMutationPatch',
        overlayId: 104,
        property: 'scale',
        keyframeCount: 2,
        focalPoint: { x: 0.74, y: 0.5 },
        formAuthority: 'UPSTREAM_RESOLVER_SUPPLIED_VALUES_NOT_SELECTED_HERE',
      } } },
    });
    expect(receiptRevision(execution)).toMatch(/^project-proposal-v2r:[a-f0-9]{64}$/);
    const animated = source.overlays[1] as unknown as JsonRecord;
    expect(animated.styles).toMatchObject({ opacity: 1, transformOrigin: '74% 50%' });
    expect(animated.keyframeTracks).toEqual([
      { property: 'opacity', keyframes: [
        { frame: 0, value: 1, easing: 'linear' },
        { frame: 119, value: 1, easing: 'linear' },
      ] },
      { property: 'scale', keyframes: [
        { frame: 0, value: 1, easing: 'ease-in-out' },
        { frame: 30, value: 1.08, easing: 'ease-out' },
      ] },
    ]);
  });

  it('chains cut then focal-scale keyframes through one clone revision origin', async () => {
    const canonical = project();
    const cut = createProviderNativeProjectServiceCutOwnerV2R();
    const keyframes = createProviderNativeProjectServiceKeyframeOwnerV2R();
    const resolved = await createProviderNativeProjectServiceCloneOwnerV2R({
      projectService: { loadProjectForMutation: async () => snapshot(canonical) },
      isolatedOperatorOwner: dispatch(cut, keyframes),
    }).resolve(scope());

    const cutExecution = await resolved.isolatedClone.executeIsolated({
      operatorId: 'cut_section', turn: 2, arguments: {
        projectId: PROJECT_ID,
        expectedProjectRevision: resolved.currentRevision.projectRevision,
        targetRange: { startFrame: 40, endFrame: 50 },
        evidenceIds: ['EV-CUT'],
      },
    });
    const keyframeExecution = await resolved.isolatedClone.executeIsolated(
      keyframeCall(3, receiptRevision(cutExecution)),
    );
    expect(keyframeExecution).toMatchObject({
      disposition: 'OK',
      output: { receipt: { proof: {
        changedPaths: expect.arrayContaining([expect.stringContaining('keyframeTracks')]),
      } } },
    });
    const receipt = await resolved.isolatedClone.finalizeProposalReceipt?.();
    expect(receipt).toMatchObject({
      canonicalUnchanged: true,
      operationReceipts: [
        { operatorId: 'cut_section', turn: 2 },
        { operatorId: 'set_keyframes', turn: 3 },
      ],
    });
    expect(canonical.durationInFrames).toBe(220);
    expect((canonical.overlays[1] as unknown as JsonRecord).keyframeTracks)
      .toEqual([expect.objectContaining({ property: 'opacity' })]);
  });

  it('fails closed on ambiguous forms, invalid local ranges, and stale revisions', async () => {
    const owner = createProviderNativeProjectServiceKeyframeOwnerV2R();
    const cases = [
      {
        call: keyframeCall(2, 'forged-revision'),
        disposition: 'CONFLICT',
        code: 'PROJECTSERVICE_ISOLATED_KEYFRAME_REVISION_CONFLICT',
      },
      {
        call: without(keyframeCall(2, BASE_REVISION), 'focalPoint'),
        disposition: 'UNVERIFIABLE',
        code: 'PROJECTSERVICE_ISOLATED_KEYFRAME_FOCAL_REQUIRED',
      },
      {
        call: withArguments(keyframeCall(2, BASE_REVISION), { property: 'x' }),
        disposition: 'UNVERIFIABLE',
        code: 'PROJECTSERVICE_ISOLATED_KEYFRAME_PROPERTY_UNSUPPORTED',
      },
      {
        call: withArguments(keyframeCall(2, BASE_REVISION), { keyframes: [
          { frame: 0, value: 1, easing: 'linear' },
          { frame: 120, value: 1.08, easing: 'ease-out' },
        ] }),
        disposition: 'UNVERIFIABLE',
        code: 'PROJECTSERVICE_ISOLATED_KEYFRAME_POINTS_INVALID',
      },
    ];
    for (const testCase of cases) {
      const source = project();
      const before = hashCanonicalJsonV1(projectProposalStateV2R(source));
      await expect(owner.execute(directInput(source, testCase.call)))
        .resolves.toMatchObject({
          disposition: testCase.disposition,
          output: { code: testCase.code },
        });
      expect(hashCanonicalJsonV1(projectProposalStateV2R(source))).toBe(before);
    }
  });

  it('rejects a forged committed replay result', async () => {
    const owner = createProviderNativeProjectServiceKeyframeOwnerV2R();
    const call = keyframeCall(2, BASE_REVISION);
    const execution = await owner.execute(directInput(project(), call));
    const forged = structuredClone(execution) as ProviderNativeToolExecutionV2R;
    const receipt = forged.output.receipt as JsonRecord;
    receipt.projectRevision = 'forged';

    await expect(owner.replayCommitted?.({
      ...directInput(project(), call),
      recordedExecution: forged,
    })).rejects.toThrow('PROJECTSERVICE_ISOLATED_KEYFRAME_REPLAY_MISMATCH');
  });
});

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

function directInput(source: Project, call: ReturnType<typeof keyframeCall>) {
  return {
    tenantId: 'tenant-1', userId: USER_ID, projectId: PROJECT_ID,
    checkpoint: CHECKPOINT, project: source, baseRevision: REVISION,
    currentProjectRevision: BASE_REVISION, call,
  };
}

function keyframeCall(turn: number, expectedProjectRevision: string) {
  return {
    operatorId: 'set_keyframes', turn, arguments: {
      projectId: PROJECT_ID,
      expectedProjectRevision,
      overlayId: 104,
      property: 'scale',
      keyframes: [
        { frame: 0, value: 1, easing: 'ease-in-out' },
        { frame: 30, value: 1.08, easing: 'ease-out' },
      ],
      focalPoint: { x: 0.74, y: 0.5 },
      evidenceIds: ['EV-FORM'],
    },
  } as const;
}

function withArguments(
  call: ReturnType<typeof keyframeCall>,
  values: Readonly<JsonRecord>,
): ReturnType<typeof keyframeCall> {
  const result: unknown = { ...call, arguments: { ...call.arguments, ...values } };
  return result as ReturnType<typeof keyframeCall>;
}

function without(
  call: ReturnType<typeof keyframeCall>,
  field: keyof ReturnType<typeof keyframeCall>['arguments'],
): ReturnType<typeof keyframeCall> {
  const argumentsCopy = { ...call.arguments } as JsonRecord;
  delete argumentsCopy[field];
  const result: unknown = { ...call, arguments: argumentsCopy };
  return result as ReturnType<typeof keyframeCall>;
}

function receiptRevision(execution: Readonly<ProviderNativeToolExecutionV2R>): string {
  return String((execution.output.receipt as JsonRecord).projectRevision);
}

function scope() {
  return { tenantId: 'tenant-1', userId: USER_ID, projectId: PROJECT_ID,
    checkpoint: CHECKPOINT };
}

function snapshot(value: Project) {
  return { project: structuredClone(value), revision: REVISION };
}

function project(): Project {
  return {
    projectId: PROJECT_ID, userId: USER_ID, name: 'Keyframe owner project',
    overlays: [
      { id: 101, type: 'video', assetId: 'opening', src: '/opening.mp4', row: 0,
        from: 0, durationInFrames: 100, sourceStartFrame: 0, videoStartTime: 0,
        styles: { opacity: 1 } },
      { id: 104, type: 'video', assetId: 'product', src: '/product.mp4', row: 0,
        from: 100, durationInFrames: 120, sourceStartFrame: 0, videoStartTime: 0,
        styles: { opacity: 1 }, keyframeTracks: [{ property: 'opacity', keyframes: [
          { frame: 0, value: 1, easing: 'linear' },
          { frame: 119, value: 1, easing: 'linear' },
        ] }] },
    ] as unknown as Project['overlays'],
    aspectRatio: '16:9', playerDimensions: { width: 1920, height: 1080 },
    fps: 30, durationInFrames: 220,
    createdAt: new Date('2026-08-23T18:00:00.000Z'),
    updatedAt: new Date(REVISION.compatibilityUpdatedAt),
    projectRevision: REVISION.value, visibility: 'private',
  };
}
