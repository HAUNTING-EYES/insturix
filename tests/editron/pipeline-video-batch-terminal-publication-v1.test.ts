import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  recordPipelineVideoBatchTerminalV1,
  type PipelineVideoBatchTerminalPublicationPortV1,
} from '@/lib/editron/services/pipeline-video-batch-terminal-publication-v1';
import type { Project } from '@/lib/editron/services/project-service';
import type { ProjectRevisionV1 } from '@/lib/editron/services/project-revision-v1';

vi.mock('@/lib/editron/services/project-service', () => ({
  ProjectMutationConflictError: class ProjectMutationConflictError extends Error {},
  projectService: {},
}));

const REVISION_12: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 12,
  compatibilityUpdatedAt: '2026-09-02T04:00:00.000Z',
};

function project(overrides: Partial<Project> & Record<string, unknown> = {}): Project {
  return {
    projectId: 'project_1',
    userId: 'user_1',
    name: 'Agency batch',
    overlays: [],
    aspectRatio: '16:9',
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 1_800,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date(REVISION_12.compatibilityUpdatedAt),
    projectRevision: REVISION_12.value,
    visibility: 'private',
    projectStatus: 'active',
    ...overrides,
  } as Project;
}

function store(initialProject = project(), revision = REVISION_12) {
  const loadProjectForMutation = vi.fn(async () => ({ project: initialProject, revision }));
  const saveProjectWithReceipt = vi.fn(async (_userId, projectId, _state, options) => ({
    schemaVersion: 1 as const,
    projectId,
    revision: {
      schemaVersion: 1 as const,
      value: options.expectedRevision.value + 1,
      compatibilityUpdatedAt: '2026-09-02T04:01:00.000Z',
    },
    committedAt: '2026-09-02T04:01:00.000Z',
  }));
  return {
    port: { loadProjectForMutation, saveProjectWithReceipt } as PipelineVideoBatchTerminalPublicationPortV1,
    saveProjectWithReceipt,
  };
}

function completedInput(projectStore: PipelineVideoBatchTerminalPublicationPortV1) {
  return {
    userId: 'user_1',
    projectId: 'project_1',
    batchId: 'batch_1',
    terminalStatus: 'completed' as const,
    completed: 3,
    failed: 0,
    totalScenes: 3,
    now: new Date('2026-09-02T04:01:00.000Z'),
    projectStore,
  };
}

describe('pipeline-video terminal project publication V1', () => {
  it('records exact successful completion without clearing an existing attention status', async () => {
    const setup = store(project({ projectStatus: 'needs-attention' }));
    const result = await recordPipelineVideoBatchTerminalV1(completedInput(setup.port));

    const updates = setup.saveProjectWithReceipt.mock.calls[0]?.[3].projectUpdates;
    expect(updates).not.toHaveProperty('projectStatus');
    expect(updates.pipelineVideoBatchTerminalPublicationsV1).toEqual([
      expect.objectContaining({
        batchId: 'batch_1',
        terminalStatus: 'completed',
        countIntegrity: 'EXACT',
        projectStatusDisposition: 'KEPT_CURRENT',
        beforeRevision: REVISION_12,
      }),
    ]);
    expect(result.observedProjectRevision.value).toBe(13);
  });

  it('marks failed and partial batches as needs-attention', async () => {
    for (const facts of [
      { terminalStatus: 'failed' as const, completed: 0, failed: 3, totalScenes: 3 },
      { terminalStatus: 'partial' as const, completed: 2, failed: 1, totalScenes: 3 },
    ]) {
      const setup = store();
      await recordPipelineVideoBatchTerminalV1({
        ...completedInput(setup.port),
        ...facts,
      });
      expect(setup.saveProjectWithReceipt.mock.calls[0]?.[3].projectUpdates).toMatchObject({
        projectStatus: 'needs-attention',
      });
    }
  });

  it('treats duplicate-counter overrun as partial attention evidence', async () => {
    const setup = store();
    await recordPipelineVideoBatchTerminalV1({
      ...completedInput(setup.port),
      terminalStatus: 'partial',
      completed: 4,
      failed: 0,
      totalScenes: 3,
    });

    const publication = setup.saveProjectWithReceipt.mock.calls[0]?.[3]
      .projectUpdates.pipelineVideoBatchTerminalPublicationsV1;
    expect(publication).toEqual([
      expect.objectContaining({ countIntegrity: 'OVERCOUNT' }),
    ]);
  });

  it('replays identical terminal facts without a second project write', async () => {
    const firstStore = store();
    const first = await recordPipelineVideoBatchTerminalV1(completedInput(firstStore.port));
    const replayStore = store(project({
      projectRevision: 13,
      updatedAt: new Date('2026-09-02T04:01:00.000Z'),
      pipelineVideoBatchTerminalPublicationsV1: [first.publication],
    }), {
      schemaVersion: 1,
      value: 13,
      compatibilityUpdatedAt: '2026-09-02T04:01:00.000Z',
    });

    const replay = await recordPipelineVideoBatchTerminalV1(completedInput(replayStore.port));
    expect(replay.replayed).toBe(true);
    expect(replay.receipt).toBeNull();
    expect(replayStore.saveProjectWithReceipt).not.toHaveBeenCalled();
  });

  it('blocks inconsistent terminal claims and malformed history', async () => {
    const setup = store();
    await expect(recordPipelineVideoBatchTerminalV1({
      ...completedInput(setup.port),
      completed: 2,
    })).rejects.toMatchObject({ reason: 'INVALID_TERMINAL_FACTS' });
    await expect(recordPipelineVideoBatchTerminalV1({
      ...completedInput(setup.port),
      terminalStatus: 'partial',
      completed: 0,
      failed: 3,
    })).rejects.toMatchObject({ reason: 'INVALID_TERMINAL_FACTS' });

    const malformed = store(project({
      pipelineVideoBatchTerminalPublicationsV1: [{ schemaVersion: 1, batchId: 'batch_1' }],
    }));
    await expect(recordPipelineVideoBatchTerminalV1(
      completedInput(malformed.port),
    )).rejects.toMatchObject({ reason: 'INVALID_PROJECT_HISTORY' });
    expect(malformed.saveProjectWithReceipt).not.toHaveBeenCalled();
  });

  it('wires the terminal receipt directly into Director preparation', () => {
    const worker = readFileSync('app/api/internal/workers/pipeline/video/route.ts', 'utf8');

    expect(worker).toContain('recordPipelineVideoBatchTerminalV1');
    expect(worker).toContain('directorExpectedRevision = terminal.observedProjectRevision');
    expect(worker).toContain('expectedRevision: directorExpectedRevision');
    expect(worker).not.toContain('refreshProjectStatus(');
    expect(worker.indexOf('recordPipelineVideoBatchTerminalV1')).toBeLessThan(
      worker.indexOf('preparePipelineDirectorDispatchV1'),
    );
  });
});
