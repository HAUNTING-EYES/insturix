import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { createProviderNativeProjectServiceCloneOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-clone-owner-v2r';
import { createProviderNativeProjectServiceOverlayOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-overlay-owner-v2r';
import type { ProviderNativeToolExecutionV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import type { Project, ProjectRevisionV1 }
  from '@/lib/editron/services/project-service';

const USER_ID = 'overlay-owner-user';
const PROJECT_ID = 'overlay-owner-project';
const REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 13,
  compatibilityUpdatedAt: '2026-08-27T03:00:00.000Z',
};
const PROJECT_REVISION = `project-revision-v1:${hashCanonicalJsonV1(REVISION)}`;

describe('ProjectService isolated overlay owner V2R', () => {
  it('uses the extracted live form on a clone and issues a deterministic revision', async () => {
    const canonical = fixtureProject();
    const project = structuredClone(canonical);
    const owner = createProviderNativeProjectServiceOverlayOwnerV2R();
    const call = imageCall(PROJECT_REVISION);
    const execution = await owner.execute(executeInput(project, call));

    expect(execution).toMatchObject({
      authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION',
      disposition: 'OK',
      output: {
        receipt: {
          status: 'PASS',
          projectRevision: expect.stringMatching(/^project-proposal-v2r:[a-f0-9]{64}$/),
          proof: {
            authority: 'PROJECTSERVICE_ISOLATED_ADD_OVERLAY_PROPOSAL_WRITER_V2R_1',
            ownerRef: 'lib/editron/agent/chat-add-overlay-form.ts#buildChatAddOverlayForm',
            canonicalMutationOwnerCalled: false,
            changedPaths: ['$.overlays[1]'],
            overlayId: 11,
            overlayType: 'image',
            projectFrameRange: { startFrame: 300, endExclusiveFrame: 390 },
            resolvedPosition: { left: 54, top: 96, width: 486, height: 1728 },
            evidenceReferenceValidation:
              'OPAQUE_REFERENCES_CARRIED_UPSTREAM_EVIDENCE_OWNER_REQUIRED',
          },
        },
      },
      evidenceIds: ['EV-RHC02-STILL-A'],
    });
    expect(canonical.overlays).toHaveLength(1);
    expect(project.overlays).toHaveLength(2);
    expect(project.overlays[1]).toMatchObject({
      id: 11,
      type: 'image',
      assetId: 'rhc02-still-a',
      from: 300,
      durationInFrames: 90,
      row: 2,
      left: 54,
      top: 96,
      width: 486,
      height: 1728,
    });
    expect((project.overlays[1] as unknown as { styles: object }).styles)
      .not.toHaveProperty('borderRadius');

    const replayProject = fixtureProject();
    const replayed = await owner.replayCommitted?.({
      ...executeInput(replayProject, call),
      checkpoint: {} as never,
      recordedExecution: execution,
    });
    expect(hashCanonicalJsonV1(replayed)).toBe(hashCanonicalJsonV1(execution));
    expect(replayProject.overlays[1]).toEqual(project.overlays[1]);
  });

  it('participates in clone finalization without touching the canonical snapshot', async () => {
    const canonical = fixtureProject();
    let snapshotReads = 0;
    const resolved = await createProviderNativeProjectServiceCloneOwnerV2R({
      projectService: {
        loadProjectForMutation: async () => {
          snapshotReads += 1;
          return { project: structuredClone(canonical), revision: structuredClone(REVISION) };
        },
      },
      isolatedOperatorOwner: createProviderNativeProjectServiceOverlayOwnerV2R(),
    }).resolveFresh!({
      tenantId: 'tenant-a',
      userId: USER_ID,
      projectId: PROJECT_ID,
      episodeId: 'overlay-owner-episode',
    });

    const execution = await resolved.isolatedClone.executeIsolated(
      imageCall(resolved.currentRevision.projectRevision),
    );
    const receipt = await resolved.isolatedClone.finalizeProposalReceipt?.();

    expect(execution.disposition).toBe('OK');
    expect(receipt).toMatchObject({
      canonicalUnchanged: true,
      changedPaths: ['$.overlays[1]'],
      operationReceipts: [{ operatorId: 'add_overlay', turn: 1 }],
    });
    expect(snapshotReads).toBeGreaterThanOrEqual(2);
    expect(canonical.overlays).toHaveLength(1);
  });

  it.each([
    {
      name: 'stale revision',
      argumentsPatch: { expectedProjectRevision: 'forged-revision' },
      disposition: 'CONFLICT',
      code: 'PROJECTSERVICE_ISOLATED_OVERLAY_REVISION_CONFLICT',
    },
    {
      name: 'missing media evidence',
      argumentsPatch: { evidenceIds: [] },
      disposition: 'UNVERIFIABLE',
      code: 'PROJECTSERVICE_ISOLATED_OVERLAY_MEDIA_EVIDENCE_REQUIRED',
    },
    {
      name: 'range beyond the project',
      argumentsPatch: { start: 870, duration: 90 },
      disposition: 'UNVERIFIABLE',
      code: 'PROJECTSERVICE_ISOLATED_OVERLAY_RANGE_UNVERIFIABLE',
    },
    {
      name: 'unresolved intent field',
      argumentsPatch: { intent: { layout: 'split' } },
      disposition: 'UNVERIFIABLE',
      code: 'PROJECTSERVICE_ISOLATED_OVERLAY_ARGUMENT_UNSUPPORTED',
    },
    {
      name: 'invalid forced row',
      argumentsPatch: { row: -1 },
      disposition: 'UNVERIFIABLE',
      code: 'PROJECTSERVICE_ISOLATED_OVERLAY_ROW_INVALID',
    },
  ])('fails $name closed without changing the clone', async ({
    argumentsPatch, disposition, code,
  }) => {
    const project = fixtureProject();
    const call = imageCall(PROJECT_REVISION);
    const execution = await createProviderNativeProjectServiceOverlayOwnerV2R()
      .execute(executeInput(project, {
        ...call,
        arguments: { ...call.arguments, ...argumentsPatch },
      }));

    expect(execution).toMatchObject({ disposition, output: { code } });
    expect(project.overlays).toHaveLength(1);
  });

  it('keeps exact external font binding as an explicit form gap', async () => {
    const project = fixtureProject();
    const execution = await createProviderNativeProjectServiceOverlayOwnerV2R()
      .execute(executeInput(project, {
        operatorId: 'add_overlay',
        turn: 1,
        arguments: {
          projectId: PROJECT_ID,
          expectedProjectRevision: PROJECT_REVISION,
          type: 'text',
          text: 'How we shipped it',
          start: 300,
          duration: 90,
          styles: { fontFamily: 'Noto Sans' },
          evidenceIds: [],
        },
      }));

    expect(execution).toMatchObject({
      disposition: 'UNVERIFIABLE',
      output: { code: 'PROJECTSERVICE_ISOLATED_OVERLAY_FORM_INPUT_INVALID' },
    });
    expect(project.overlays).toHaveLength(1);
  });

  it('detects a recorded execution mismatch during deterministic replay', async () => {
    const owner = createProviderNativeProjectServiceOverlayOwnerV2R();
    const call = imageCall(PROJECT_REVISION);
    const execution = await owner.execute(executeInput(fixtureProject(), call));
    const forged = structuredClone(execution) as ProviderNativeToolExecutionV2R;
    (forged.output.receipt as Record<string, unknown>).projectRevision = 'forged';

    await expect(owner.replayCommitted?.({
      ...executeInput(fixtureProject(), call),
      checkpoint: {} as never,
      recordedExecution: forged,
    })).rejects.toThrow('PROJECTSERVICE_ISOLATED_OVERLAY_REPLAY_MISMATCH');
  });
});

function imageCall(expectedProjectRevision: string) {
  return {
    operatorId: 'add_overlay',
    turn: 1,
    arguments: {
      projectId: PROJECT_ID,
      expectedProjectRevision,
      type: 'image',
      assetId: 'rhc02-still-a',
      start: 300,
      duration: 90,
      row: 2,
      x: 0,
      y: 0,
      width: 540,
      height: 1920,
      styles: { objectFit: 'cover', opacity: 1 },
      evidenceIds: ['EV-RHC02-STILL-A'],
    },
  } as const;
}

function executeInput(project: Project, call: ReturnType<typeof imageCall> | Readonly<{
  operatorId: string;
  turn: number;
  arguments: Readonly<Record<string, unknown>>;
}>) {
  return {
    tenantId: 'tenant-a',
    userId: USER_ID,
    projectId: PROJECT_ID,
    project,
    baseRevision: REVISION,
    currentProjectRevision: PROJECT_REVISION,
    call,
  };
}

function fixtureProject(): Project {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: 'Overlay owner fixture',
    overlays: [{
      id: 10,
      type: 'video',
      from: 0,
      durationInFrames: 900,
      sourceStartFrame: 0,
      row: 0,
      left: 0,
      top: 0,
      width: 1080,
      height: 1920,
      rotation: 0,
      isDragging: false,
      styles: { opacity: 1 },
      content: 'https://example.invalid/interview.mp4',
    } as unknown as Project['overlays'][number]],
    aspectRatio: '9:16',
    playerDimensions: { width: 1080, height: 1920 },
    fps: 30,
    durationInFrames: 900,
    createdAt: new Date('2026-08-27T02:00:00.000Z'),
    updatedAt: new Date(REVISION.compatibilityUpdatedAt),
    projectRevision: REVISION.value,
    visibility: 'private',
  };
}
