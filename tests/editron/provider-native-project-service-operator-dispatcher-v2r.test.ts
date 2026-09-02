import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { createProviderNativeProjectServiceOperatorDispatcherV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-operator-dispatcher-v2r';
import type { Project, ProjectRevisionV1 }
  from '@/lib/editron/services/project-service';

const REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 7,
  compatibilityUpdatedAt: '2026-08-23T14:00:00.000Z',
};
const PROJECT_REVISION = `project-revision-v1:${hashCanonicalJsonV1(REVISION)}`;

describe('provider-native ProjectService operator dispatcher V2R', () => {
  it('delegates a supported cut to the existing cut owner', async () => {
    const project = fixtureProject();
    const result = await createProviderNativeProjectServiceOperatorDispatcherV2R()
      .execute({
        tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a',
        project, baseRevision: REVISION, currentProjectRevision: PROJECT_REVISION,
        call: {
          operatorId: 'cut_section', turn: 1,
          arguments: {
            projectId: 'project-a', expectedProjectRevision: PROJECT_REVISION,
            targetRange: { startFrame: 30, endFrame: 60 }, evidenceIds: [],
          },
        },
      });

    expect(result.disposition).toBe('OK');
    expect(project.durationInFrames).toBe(90);
  });

  it('delegates an explicit overlay form to the isolated overlay owner', async () => {
    const project = fixtureProject();
    const result = await createProviderNativeProjectServiceOperatorDispatcherV2R({
      profile: 'RHC02_OVERLAY_RESEARCH_V1',
    })
      .execute({
        tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a',
        project, baseRevision: REVISION, currentProjectRevision: PROJECT_REVISION,
        call: {
          operatorId: 'add_overlay', turn: 1,
          arguments: {
            projectId: 'project-a', expectedProjectRevision: PROJECT_REVISION,
            type: 'image', assetId: 'rhc02-still-a', start: 30, duration: 30,
            row: 1, x: 0, y: 0, width: 640, height: 720,
            styles: { objectFit: 'cover', opacity: 1 },
            evidenceIds: ['EV-RHC02-STILL-A'],
          },
        },
      });

    expect(result).toMatchObject({
      disposition: 'OK',
      output: { receipt: { proof: { overlayId: 2, overlayType: 'image' } } },
    });
    expect(project.overlays[1]).toMatchObject({
      id: 2,
      type: 'image',
      assetId: 'rhc02-still-a',
      left: 64,
      top: 36,
      width: 576,
      height: 648,
    });
  });

  it('reproduces the pre-overlay owner profile only when explicitly pinned', async () => {
    const result = await createProviderNativeProjectServiceOperatorDispatcherV2R({
      profile: 'PRE_OVERLAY_OWNER_MATERIALIZATION_V1',
    }).execute({
      tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a',
      project: fixtureProject(), baseRevision: REVISION,
      currentProjectRevision: PROJECT_REVISION,
      call: {
        operatorId: 'add_overlay', turn: 1,
        arguments: { projectId: 'project-a' },
      },
    });

    expect(result).toMatchObject({
      disposition: 'UNVERIFIABLE',
      output: {
        code: 'PROJECTSERVICE_ISOLATED_DISPATCH_OPERATOR_UNSUPPORTED',
        requestedOperatorId: 'add_overlay',
        supportedOperatorIds: ['cut_section', 'set_keyframes'],
      },
    });
  });

  it('fails unknown operations closed instead of falling through to keyframes', async () => {
    const dispatcher = createProviderNativeProjectServiceOperatorDispatcherV2R();
    const input = {
      tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a',
      project: fixtureProject(), baseRevision: REVISION,
      currentProjectRevision: PROJECT_REVISION,
      call: { operatorId: 'add_transition', turn: 1, arguments: {} },
    } as const;

    await expect(dispatcher.execute(input)).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      output: {
        code: 'PROJECTSERVICE_ISOLATED_DISPATCH_OPERATOR_UNSUPPORTED',
        requestedOperatorId: 'add_transition',
        supportedOperatorIds: ['cut_section', 'set_keyframes'],
      },
    });
    await expect(dispatcher.replayCommitted!({
      ...input,
      checkpoint: {} as never,
      recordedExecution: {} as never,
    })).rejects.toThrow('PROJECTSERVICE_ISOLATED_DISPATCH_REPLAY_UNSUPPORTED');
  });
});

function fixtureProject(): Project {
  return {
    projectId: 'project-a', userId: 'user-a', name: 'Dispatcher fixture',
    overlays: [{
      id: 1, type: 'video', from: 0, durationInFrames: 120,
      row: 0, left: 0, top: 0, width: 1280, height: 720,
      rotation: 0, isDragging: false,
      sourceStartFrame: 0, styles: { opacity: 1 },
      content: 'https://example.invalid/source.mp4',
    } as unknown as Project['overlays'][number]],
    aspectRatio: '16:9', playerDimensions: { width: 1920, height: 1080 },
    fps: 30, durationInFrames: 120,
    createdAt: new Date('2026-08-23T13:00:00.000Z'),
    updatedAt: new Date(REVISION.compatibilityUpdatedAt),
    projectRevision: REVISION.value, visibility: 'private',
  };
}
