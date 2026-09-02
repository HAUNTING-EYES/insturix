import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ClickatronProjectPublicationBlockedErrorV1,
  commitClickatronThumbnailProjectV1,
  resolveClickatronThumbnailProjectBindingV1,
  type ClickatronProjectPublicationPortV1,
} from '@/lib/editron/services/clickatron-project-publication-v1';
import type { Project } from '@/lib/editron/services/project-service';
import type { ProjectRevisionV1 } from '@/lib/editron/services/project-revision-v1';

vi.mock('@/lib/editron/services/project-service', () => ({
  ProjectMutationConflictError: class ProjectMutationConflictError extends Error {},
  projectService: {},
}));

const REVISION_4: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 4,
  compatibilityUpdatedAt: '2026-09-02T02:00:00.000Z',
};

function project(overrides: Partial<Project> & Record<string, unknown> = {}): Project {
  return {
    projectId: 'project_1',
    userId: 'user_1',
    name: 'Agency launch',
    overlays: [],
    aspectRatio: '16:9',
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 1_800,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date(REVISION_4.compatibilityUpdatedAt),
    projectRevision: REVISION_4.value,
    visibility: 'private',
    pipelineStage: 'analyze',
    ...overrides,
  } as Project;
}

function store(initialProject = project(), revision = REVISION_4) {
  const loadProjectForMutation = vi.fn(async () => ({
    project: initialProject,
    revision,
  }));
  const saveProjectWithReceipt = vi.fn(async (_userId, projectId, _state, options) => ({
    schemaVersion: 1 as const,
    projectId,
    revision: {
      schemaVersion: 1 as const,
      value: options.expectedRevision.value + 1,
      compatibilityUpdatedAt: '2026-09-02T02:01:00.000Z',
    },
    committedAt: '2026-09-02T02:01:00.000Z',
  }));
  return {
    port: { loadProjectForMutation, saveProjectWithReceipt } as ClickatronProjectPublicationPortV1,
    loadProjectForMutation,
    saveProjectWithReceipt,
  };
}

async function binding(projectStore: ClickatronProjectPublicationPortV1) {
  return resolveClickatronThumbnailProjectBindingV1({
    userId: 'user_1',
    projectId: 'project_1',
    thumbnailId: 'clickatron:session_1:variation_1',
    sessionId: 'session_1',
    variationId: 'variation_1',
    thumbnailSource: 'gs://agency/final-thumbnail.png',
    now: new Date('2026-09-02T02:00:10.000Z'),
    projectStore,
  });
}

describe('Clickatron ProjectService publication owner V1', () => {
  it('binds the selected source to the owner and exact project revision', async () => {
    const setup = store();
    const admitted = await binding(setup.port);

    expect(setup.loadProjectForMutation).toHaveBeenCalledWith('user_1', 'project_1');
    expect(admitted).toMatchObject({
      schemaVersion: 1,
      thumbnailId: 'clickatron:session_1:variation_1',
      projectId: 'project_1',
      projectRevision: REVISION_4,
    });
    expect(admitted.thumbnailSourceSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('advances an earlier project stage through one exact ProjectService CAS', async () => {
    const setup = store();
    const admitted = await binding(setup.port);
    const result = await commitClickatronThumbnailProjectV1({
      userId: 'user_1',
      thumbnailSource: 'gs://agency/final-thumbnail.png',
      binding: admitted,
      now: new Date('2026-09-02T02:01:00.000Z'),
      projectStore: setup.port,
    });

    expect(setup.saveProjectWithReceipt).toHaveBeenCalledWith(
      'user_1',
      'project_1',
      expect.objectContaining({ projectId: 'project_1' }),
      expect.objectContaining({
        expectedRevision: REVISION_4,
        projectUpdates: expect.objectContaining({
          pipelineStage: 'thumbnails',
          clickatronThumbnailPublicationsV1: [expect.objectContaining({
            thumbnailId: admitted.thumbnailId,
            admittedProjectRevision: REVISION_4,
            effectivePipelineStage: 'thumbnails',
          })],
        }),
      }),
    );
    expect(result.replayed).toBe(false);
    expect(result.receipt?.revision.value).toBe(5);
  });

  it('records a selection without regressing a project already at publish', async () => {
    const setup = store(project({ pipelineStage: 'publish' }));
    const admitted = await binding(setup.port);
    await commitClickatronThumbnailProjectV1({
      userId: 'user_1',
      thumbnailSource: 'gs://agency/final-thumbnail.png',
      binding: admitted,
      projectStore: setup.port,
    });

    const updates = setup.saveProjectWithReceipt.mock.calls[0]?.[3].projectUpdates;
    expect(updates).not.toHaveProperty('pipelineStage');
    expect(updates.clickatronThumbnailPublicationsV1).toEqual([
      expect.objectContaining({
        stageDisposition: 'KEPT_CURRENT_STAGE',
        effectivePipelineStage: 'publish',
      }),
    ]);
  });

  it('reconciles a committed publication after a task-receipt crash', async () => {
    const admission = store();
    const admitted = await binding(admission.port);
    const first = await commitClickatronThumbnailProjectV1({
      userId: 'user_1',
      thumbnailSource: 'gs://agency/final-thumbnail.png',
      binding: admitted,
      now: new Date('2026-09-02T02:01:00.000Z'),
      projectStore: admission.port,
    });
    const replayStore = store(project({
      projectRevision: 5,
      updatedAt: new Date('2026-09-02T02:01:00.000Z'),
      clickatronThumbnailPublicationsV1: [first.publication],
    }), {
      schemaVersion: 1,
      value: 5,
      compatibilityUpdatedAt: '2026-09-02T02:01:00.000Z',
    });

    const replay = await commitClickatronThumbnailProjectV1({
      userId: 'user_1',
      thumbnailSource: 'gs://agency/final-thumbnail.png',
      binding: admitted,
      projectStore: replayStore.port,
    });

    expect(replay.replayed).toBe(true);
    expect(replay.receipt).toBeNull();
    expect(replayStore.saveProjectWithReceipt).not.toHaveBeenCalled();
  });

  it('blocks stale and source-swapped commits without mutating the project', async () => {
    const admission = store();
    const admitted = await binding(admission.port);
    const stale = store(project({ projectRevision: 5 }), {
      schemaVersion: 1,
      value: 5,
      compatibilityUpdatedAt: '2026-09-02T02:00:30.000Z',
    });

    await expect(commitClickatronThumbnailProjectV1({
      userId: 'user_1',
      thumbnailSource: 'gs://agency/final-thumbnail.png',
      binding: admitted,
      projectStore: stale.port,
    })).rejects.toMatchObject({ reason: 'STALE_PROJECT_REVISION' });
    await expect(commitClickatronThumbnailProjectV1({
      userId: 'user_1',
      thumbnailSource: 'gs://agency/swapped.png',
      binding: admitted,
      projectStore: stale.port,
    })).rejects.toBeInstanceOf(ClickatronProjectPublicationBlockedErrorV1);
    expect(stale.saveProjectWithReceipt).not.toHaveBeenCalled();
  });

  it('blocks malformed publication history instead of trusting a false replay receipt', async () => {
    const admission = store();
    const admitted = await binding(admission.port);
    const malformed = store(project({
      clickatronThumbnailPublicationsV1: [{
        schemaVersion: 1,
        thumbnailId: admitted.thumbnailId,
        thumbnailSourceSha256: admitted.thumbnailSourceSha256,
      }],
    }));

    await expect(commitClickatronThumbnailProjectV1({
      userId: 'user_1',
      thumbnailSource: 'gs://agency/final-thumbnail.png',
      binding: admitted,
      projectStore: malformed.port,
    })).rejects.toMatchObject({ reason: 'INVALID_PROJECT_HISTORY' });
    expect(malformed.saveProjectWithReceipt).not.toHaveBeenCalled();
  });

  it('removes the legacy fail-open project writer from the Clickatron route', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/services/clickatron/session/[id]/commit/route.ts'),
      'utf8',
    );

    expect(route).toContain('resolveClickatronThumbnailProjectBindingV1');
    expect(route).toContain('commitClickatronThumbnailProjectV1');
    expect(route).toContain("status: 'PENDING'");
    expect(route).toContain("status: 'BLOCKED'");
    expect(route).toContain("status: 'UNVERIFIABLE'");
    expect(route).not.toContain('updateProjectMetadata(');
  });
});
