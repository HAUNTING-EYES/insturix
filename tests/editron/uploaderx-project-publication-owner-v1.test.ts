import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  bindUploaderXProjectVideoV1,
  commitUploaderXProjectVideoV1,
  type UploaderXProjectPublicationPortV1,
} from '@/lib/editron/services/uploaderx-project-publication-v1';
import type { Project } from '@/lib/editron/services/project-service';
import type { ProjectRevisionV1 } from '@/lib/editron/services/project-revision-v1';

vi.mock('@/lib/editron/services/project-service', () => ({
  ProjectMutationConflictError: class ProjectMutationConflictError extends Error {},
  projectService: {},
}));

const REVISION_9: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 9,
  compatibilityUpdatedAt: '2026-09-02T03:00:00.000Z',
};
const OBJECT_KEY_SHA = 'a'.repeat(64);
const CONTENT_SHA = 'b'.repeat(64);

function project(overrides: Partial<Project> & Record<string, unknown> = {}): Project {
  return {
    projectId: 'project_1',
    userId: 'user_1',
    name: 'Agency delivery',
    overlays: [],
    aspectRatio: '16:9',
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 1_800,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date(REVISION_9.compatibilityUpdatedAt),
    projectRevision: REVISION_9.value,
    visibility: 'private',
    pipelineStage: 'thumbnails',
    ...overrides,
  } as Project;
}

function store(initialProject = project(), revision = REVISION_9) {
  const loadProjectForMutation = vi.fn(async () => ({ project: initialProject, revision }));
  const saveProjectWithReceipt = vi.fn(async (_userId, projectId, _state, options) => ({
    schemaVersion: 1 as const,
    projectId,
    revision: {
      schemaVersion: 1 as const,
      value: options.expectedRevision.value + 1,
      compatibilityUpdatedAt: '2026-09-02T03:01:00.000Z',
    },
    committedAt: '2026-09-02T03:01:00.000Z',
  }));
  return {
    port: { loadProjectForMutation, saveProjectWithReceipt } as UploaderXProjectPublicationPortV1,
    loadProjectForMutation,
    saveProjectWithReceipt,
  };
}

async function binding(projectStore: UploaderXProjectPublicationPortV1) {
  return bindUploaderXProjectVideoV1({
    userId: 'user_1',
    projectId: 'project_1',
    videoUuid: 'video_1',
    objectKeySha256: OBJECT_KEY_SHA,
    contentSha256: CONTENT_SHA,
    sizeBytes: 1_024,
    contentType: 'video/mp4',
    now: new Date('2026-09-02T03:00:10.000Z'),
    projectStore,
  });
}

function commitInput(admitted: Awaited<ReturnType<typeof binding>>, projectStore: UploaderXProjectPublicationPortV1) {
  return {
    userId: 'user_1',
    binding: admitted,
    objectKeySha256: OBJECT_KEY_SHA,
    contentSha256: CONTENT_SHA,
    sizeBytes: 1_024,
    contentType: 'video/mp4',
    now: new Date('2026-09-02T03:01:00.000Z'),
    projectStore,
  };
}

describe('UploaderX ProjectService publication owner V1', () => {
  it('binds owner, content and storage identity before upload publication', async () => {
    const setup = store();
    const admitted = await binding(setup.port);

    expect(setup.loadProjectForMutation).toHaveBeenCalledWith('user_1', 'project_1');
    expect(admitted).toMatchObject({
      projectRevision: REVISION_9,
      videoUuid: 'video_1',
      objectKeySha256: OBJECT_KEY_SHA,
      contentSha256: CONTENT_SHA,
      sizeBytes: 1_024,
      contentType: 'video/mp4',
    });
  });

  it('publishes the uploaded video through one exact ProjectService CAS', async () => {
    const setup = store();
    const admitted = await binding(setup.port);
    const result = await commitUploaderXProjectVideoV1(commitInput(admitted, setup.port));

    expect(setup.saveProjectWithReceipt).toHaveBeenCalledWith(
      'user_1',
      'project_1',
      expect.objectContaining({ projectId: 'project_1' }),
      expect.objectContaining({
        expectedRevision: REVISION_9,
        projectUpdates: expect.objectContaining({
          pipelineStage: 'publish',
          uploaderXVideoPublicationsV1: [expect.objectContaining({
            videoUuid: 'video_1',
            admittedProjectRevision: REVISION_9,
          })],
        }),
      }),
    );
    expect(result.replayed).toBe(false);
  });

  it('does not regress a completed project back to publish', async () => {
    const setup = store(project({ pipelineStage: 'complete' }));
    const admitted = await binding(setup.port);
    await commitUploaderXProjectVideoV1(commitInput(admitted, setup.port));

    const updates = setup.saveProjectWithReceipt.mock.calls[0]?.[3].projectUpdates;
    expect(updates).not.toHaveProperty('pipelineStage');
    expect(updates.uploaderXVideoPublicationsV1).toEqual([
      expect.objectContaining({
        stageDisposition: 'KEPT_COMPLETE',
        effectivePipelineStage: 'complete',
      }),
    ]);
  });

  it('replays a committed video without another project mutation', async () => {
    const firstStore = store();
    const admitted = await binding(firstStore.port);
    const first = await commitUploaderXProjectVideoV1(commitInput(admitted, firstStore.port));
    const replayStore = store(project({
      projectRevision: 10,
      updatedAt: new Date('2026-09-02T03:01:00.000Z'),
      uploaderXVideoPublicationsV1: [first.publication],
    }), {
      schemaVersion: 1,
      value: 10,
      compatibilityUpdatedAt: '2026-09-02T03:01:00.000Z',
    });

    const replay = await commitUploaderXProjectVideoV1(commitInput(admitted, replayStore.port));
    expect(replay.replayed).toBe(true);
    expect(replay.receipt).toBeNull();
    expect(replayStore.saveProjectWithReceipt).not.toHaveBeenCalled();
  });

  it('blocks stale or content-swapped publication without writing', async () => {
    const firstStore = store();
    const admitted = await binding(firstStore.port);
    const staleStore = store(project({ projectRevision: 10 }), {
      schemaVersion: 1,
      value: 10,
      compatibilityUpdatedAt: '2026-09-02T03:00:30.000Z',
    });

    await expect(commitUploaderXProjectVideoV1(
      commitInput(admitted, staleStore.port),
    )).rejects.toMatchObject({ reason: 'STALE_PROJECT_REVISION' });
    await expect(commitUploaderXProjectVideoV1({
      ...commitInput(admitted, staleStore.port),
      contentSha256: 'c'.repeat(64),
    })).rejects.toMatchObject({ reason: 'SOURCE_IDENTITY_MISMATCH' });
    expect(staleStore.saveProjectWithReceipt).not.toHaveBeenCalled();
  });

  it('blocks malformed history rather than trusting a false replay', async () => {
    const firstStore = store();
    const admitted = await binding(firstStore.port);
    const malformedStore = store(project({
      uploaderXVideoPublicationsV1: [{ schemaVersion: 1, videoUuid: 'video_1' }],
    }));

    await expect(commitUploaderXProjectVideoV1(
      commitInput(admitted, malformedStore.port),
    )).rejects.toMatchObject({ reason: 'INVALID_PROJECT_HISTORY' });
    expect(malformedStore.saveProjectWithReceipt).not.toHaveBeenCalled();
  });

  it('removes both legacy fail-open project writers from the uploader route', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/services/uploaderx/videos/route.ts'),
      'utf8',
    );

    expect(route.indexOf('bindUploaderXProjectVideoV1')).toBeLessThan(
      route.indexOf('await uploadUploaderXObject'),
    );
    expect(route).toContain('commitUploaderXProjectVideoV1');
    expect(route).toContain('status: "PENDING"');
    expect(route).toContain('status: "UNVERIFIABLE"');
    expect(route).not.toContain('updateProjectMetadata(');
    expect(route).not.toContain('refreshProjectStatus(');
  });
});
