import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  AlyzitronProjectPublicationBlockedErrorV1,
  bindAlyzitronProjectAnalysisV1,
  commitAlyzitronProjectAnalysisV1,
  type AlyzitronProjectPublicationPortV1,
} from '@/lib/editron/services/alyzitron-project-publication-v1';
import type { Project } from '@/lib/editron/services/project-service';
import type { ProjectRevisionV1 } from '@/lib/editron/services/project-revision-v1';

vi.mock('@/lib/editron/services/project-service', () => ({
  ProjectMutationConflictError: class ProjectMutationConflictError extends Error {},
  projectService: {},
}));

const REVISION_7: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 7,
  compatibilityUpdatedAt: '2026-09-02T00:00:00.000Z',
};

function project(): Project {
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
    updatedAt: new Date(REVISION_7.compatibilityUpdatedAt),
    projectRevision: REVISION_7.value,
    visibility: 'private',
  };
}

function store(revision = REVISION_7) {
  const loadProjectForMutation = vi.fn(async () => ({ project: project(), revision }));
  const saveProjectWithReceipt = vi.fn(async (_userId, projectId, _state, options) => ({
    schemaVersion: 1 as const,
    projectId,
    revision: {
      schemaVersion: 1 as const,
      value: options.expectedRevision.value + 1,
      compatibilityUpdatedAt: '2026-09-02T00:01:00.000Z',
    },
    committedAt: '2026-09-02T00:01:00.000Z',
  }));
  return {
    port: { loadProjectForMutation, saveProjectWithReceipt } as AlyzitronProjectPublicationPortV1,
    loadProjectForMutation,
    saveProjectWithReceipt,
  };
}

async function binding(projectStore: AlyzitronProjectPublicationPortV1) {
  return bindAlyzitronProjectAnalysisV1({
    userId: 'user_1',
    projectId: 'project_1',
    taskId: 'task_1',
    sourceUrl: 'https://cdn.example.com/render/project_1.mp4',
    sourceBackend: 'r2',
    mediaKind: 'video',
    durationMs: 60_000,
    now: new Date('2026-09-02T00:00:10.000Z'),
    projectStore,
  });
}

describe('Alyzitron ProjectService publication owner V1', () => {
  it('binds the whole analyzed source to owner, task and exact project revision', async () => {
    const setup = store();
    const result = await binding(setup.port);

    expect(setup.loadProjectForMutation).toHaveBeenCalledWith('user_1', 'project_1');
    expect(result).toMatchObject({
      schemaVersion: 1,
      taskId: 'task_1',
      projectId: 'project_1',
      projectRevision: REVISION_7,
      sourceAccessBasis: 'REGISTERED_USER_UPLOAD',
      wholeSourceRangeMs: { startInclusive: 0, endExclusive: 60_000 },
    });
    expect(result.sourceIdentitySha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('commits bounded analysis only through the exact ProjectService revision', async () => {
    const setup = store();
    const admitted = await binding(setup.port);
    const committed = await commitAlyzitronProjectAnalysisV1({
      userId: 'user_1',
      taskId: 'task_1',
      taskSourceUrl: 'https://cdn.example.com/render/project_1.mp4',
      binding: admitted,
      result: {
        overallScore: 84,
        category: 'explainer',
        strengths: ['Clear hook'],
        weaknesses: ['Slow middle'],
        contentIntent: 'own_content',
      },
      now: new Date('2026-09-02T00:01:00.000Z'),
      projectStore: setup.port,
    });

    expect(setup.saveProjectWithReceipt).toHaveBeenCalledWith(
      'user_1',
      'project_1',
      expect.objectContaining({ projectId: 'project_1' }),
      expect.objectContaining({
        expectedRevision: REVISION_7,
        projectUpdates: expect.objectContaining({
          qualityScore: 84,
          alyzitronAnalysis: expect.objectContaining({
            taskId: 'task_1',
            analyzedProjectRevision: REVISION_7,
            predecessor: { taskId: 'task_1', state: 'completed' },
            invalidatedBy: 'ANY_PROJECT_REVISION_CHANGE',
          }),
        }),
      }),
    );
    expect(committed.receipt?.revision.value).toBe(8);
    expect(committed.replayed).toBe(false);
  });

  it('recognizes an already committed task without writing the project twice', async () => {
    const setup = store();
    const admitted = await binding(setup.port);
    const alreadyCommitted = {
      ...project(),
      projectRevision: 8,
      updatedAt: new Date('2026-09-02T00:01:00.000Z'),
      alyzitronAnalysis: {
        taskId: 'task_1',
        sourceIdentitySha256: admitted.sourceIdentitySha256,
        analyzedProjectRevision: REVISION_7,
      },
    };
    setup.loadProjectForMutation.mockResolvedValueOnce({
      project: alreadyCommitted,
      revision: {
        schemaVersion: 1,
        value: 8,
        compatibilityUpdatedAt: '2026-09-02T00:01:00.000Z',
      },
    });

    const replay = await commitAlyzitronProjectAnalysisV1({
      userId: 'user_1',
      taskId: 'task_1',
      taskSourceUrl: 'https://cdn.example.com/render/project_1.mp4',
      binding: admitted,
      result: {
        overallScore: 84,
        category: 'explainer',
        strengths: [],
        weaknesses: [],
        contentIntent: 'own_content',
      },
      projectStore: setup.port,
    });

    expect(replay.replayed).toBe(true);
    expect(replay.receipt).toBeNull();
    expect(replay.observedProjectRevision.value).toBe(8);
    expect(setup.saveProjectWithReceipt).not.toHaveBeenCalled();
  });

  it('blocks a changed project instead of attaching old-render quality to the new edit', async () => {
    const admissionStore = store();
    const admitted = await binding(admissionStore.port);
    const staleStore = store({
      schemaVersion: 1,
      value: 8,
      compatibilityUpdatedAt: '2026-09-02T00:00:30.000Z',
    });

    await expect(commitAlyzitronProjectAnalysisV1({
      userId: 'user_1',
      taskId: 'task_1',
      taskSourceUrl: 'https://cdn.example.com/render/project_1.mp4',
      binding: admitted,
      result: {
        overallScore: 84,
        category: 'explainer',
        strengths: [],
        weaknesses: [],
        contentIntent: 'own_content',
      },
      projectStore: staleStore.port,
    })).rejects.toMatchObject({
      code: 'ALYZITRON_PROJECT_PUBLICATION_BLOCKED',
      reason: 'STALE_PROJECT_REVISION',
    });
    expect(staleStore.saveProjectWithReceipt).not.toHaveBeenCalled();
  });

  it('blocks a swapped source before reading or mutating the project', async () => {
    const setup = store();
    const admitted = await binding(setup.port);
    setup.loadProjectForMutation.mockClear();

    await expect(commitAlyzitronProjectAnalysisV1({
      userId: 'user_1',
      taskId: 'task_1',
      taskSourceUrl: 'https://cdn.example.com/render/attacker.mp4',
      binding: admitted,
      result: {
        overallScore: 84,
        category: 'explainer',
        strengths: [],
        weaknesses: [],
        contentIntent: 'own_content',
      },
      projectStore: setup.port,
    })).rejects.toBeInstanceOf(AlyzitronProjectPublicationBlockedErrorV1);
    expect(setup.loadProjectForMutation).not.toHaveBeenCalled();
    expect(setup.saveProjectWithReceipt).not.toHaveBeenCalled();
  });

  it('removes both legacy unfenced project writers from the Alyzitron routes', () => {
    const analyzeRoute = readFileSync(
      join(process.cwd(), 'app/api/services/alyzitron/analyze/route.ts'),
      'utf8',
    );
    const processorRoute = readFileSync(
      join(process.cwd(), 'app/api/services/alyzitron/processor/route.ts'),
      'utf8',
    );

    expect(analyzeRoute).toContain('bindAlyzitronProjectAnalysisV1');
    expect(analyzeRoute).not.toContain('updateProjectMetadata(');
    expect(processorRoute).toContain('commitAlyzitronProjectAnalysisV1');
    expect(processorRoute).toContain("status: 'BLOCKED'");
    expect(processorRoute).toContain("status: 'UNVERIFIABLE'");
    expect(processorRoute).toContain('Already processed; project publication reconciled');
    expect(processorRoute).toContain("status: 'PENDING'");
    expect(processorRoute).not.toContain('collection(COLLECTIONS.PROJECTS).updateOne');
  });
});
