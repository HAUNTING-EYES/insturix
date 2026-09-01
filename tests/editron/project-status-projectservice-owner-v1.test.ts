import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  transitionProjectStatus,
  type ProjectStatusMutationPortV1,
} from '@/lib/shared/project-status';
import type { Project } from '@/lib/editron/services/project-service';
import type { ProjectRevisionV1 } from '@/lib/editron/services/project-revision-v1';

const mocks = vi.hoisted(() => ({ emitBrandEvent: vi.fn() }));

vi.mock('@/lib/shared/brand-events', () => ({
  emitBrandEvent: mocks.emitBrandEvent,
}));
vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(),
}));
vi.mock('@/lib/editron/services/project-service', () => ({
  ProjectMutationConflictError: class ProjectMutationConflictError extends Error {},
  ProjectNotFoundOrForbiddenError: class ProjectNotFoundOrForbiddenError extends Error {},
  projectService: {},
}));

const REVISION_2: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 2,
  compatibilityUpdatedAt: '2026-09-02T05:00:00.000Z',
};

function project(overrides: Partial<Project> = {}): Project {
  return {
    projectId: 'project_1',
    userId: 'user_1',
    name: 'Agency lifecycle',
    overlays: [],
    aspectRatio: '16:9',
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 1_800,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date(REVISION_2.compatibilityUpdatedAt),
    projectRevision: REVISION_2.value,
    visibility: 'private',
    status: 'editing',
    statusHistory: [],
    ...overrides,
  };
}

function store(initialProject = project()) {
  const loadProjectForMutation = vi.fn(async () => ({
    project: initialProject,
    revision: REVISION_2,
  }));
  const saveProjectWithReceipt = vi.fn(async (_userId, projectId, _state, options) => ({
    schemaVersion: 1 as const,
    projectId,
    revision: {
      schemaVersion: 1 as const,
      value: options.expectedRevision.value + 1,
      compatibilityUpdatedAt: '2026-09-02T05:01:00.000Z',
    },
    committedAt: '2026-09-02T05:01:00.000Z',
  }));
  return {
    port: { loadProjectForMutation, saveProjectWithReceipt } as ProjectStatusMutationPortV1,
    loadProjectForMutation,
    saveProjectWithReceipt,
  };
}

describe('Project status ProjectService owner V1', () => {
  beforeEach(() => {
    mocks.emitBrandEvent.mockReset().mockResolvedValue(undefined);
  });

  it('commits an allowed transition through the exact owner-scoped revision', async () => {
    const setup = store();
    const result = await transitionProjectStatus(
      'project_1',
      'user_1',
      'rendering',
      'render_started',
      undefined,
      setup.port,
    );

    expect(setup.loadProjectForMutation).toHaveBeenCalledWith('user_1', 'project_1');
    expect(setup.saveProjectWithReceipt).toHaveBeenCalledWith(
      'user_1',
      'project_1',
      expect.objectContaining({ projectId: 'project_1' }),
      expect.objectContaining({
        expectedRevision: REVISION_2,
        projectUpdates: expect.objectContaining({
          status: 'rendering',
          statusHistory: [expect.objectContaining({
            from: 'editing',
            to: 'rendering',
            trigger: 'render_started',
          })],
        }),
      }),
    );
    expect(result.success).toBe(true);
    expect(result.receipt?.revision.value).toBe(3);
    expect(mocks.emitBrandEvent).toHaveBeenCalledOnce();
  });

  it('records bounded failure evidence and clears it only on an allowed recovery', async () => {
    const failing = store();
    await transitionProjectStatus(
      'project_1',
      'user_1',
      'failed',
      'render_failed',
      { message: 'Renderer stopped', service: 'cloudrun' },
      failing.port,
    );
    expect(failing.saveProjectWithReceipt.mock.calls[0]?.[3].projectUpdates).toMatchObject({
      status: 'failed',
      lastError: {
        message: 'Renderer stopped',
        service: 'cloudrun',
      },
    });

    const recovery = store(project({ status: 'failed' }));
    await transitionProjectStatus(
      'project_1',
      'user_1',
      'editing',
      'manual_recovery',
      undefined,
      recovery.port,
    );
    expect(recovery.saveProjectWithReceipt.mock.calls[0]?.[3].projectUpdates.lastError).toBeNull();
  });

  it('rejects invalid transitions and malformed history without writing', async () => {
    const invalidTransition = store();
    await expect(transitionProjectStatus(
      'project_1',
      'user_1',
      'published',
      'skip_pipeline',
      undefined,
      invalidTransition.port,
    )).resolves.toMatchObject({ success: false });
    expect(invalidTransition.saveProjectWithReceipt).not.toHaveBeenCalled();

    const malformedHistory = store(project({
      statusHistory: [{ from: 'editing' } as any],
    }));
    await expect(transitionProjectStatus(
      'project_1',
      'user_1',
      'rendering',
      'render_started',
      undefined,
      malformedHistory.port,
    )).resolves.toMatchObject({
      success: false,
      error: 'Project status history is malformed or unbounded',
    });
    expect(malformedHistory.saveProjectWithReceipt).not.toHaveBeenCalled();
  });

  it('reports a full project-revision conflict instead of overwriting a newer edit', async () => {
    const setup = store();
    const { ProjectMutationConflictError } = await import('@/lib/editron/services/project-service');
    setup.saveProjectWithReceipt.mockRejectedValueOnce(new ProjectMutationConflictError(REVISION_2));

    await expect(transitionProjectStatus(
      'project_1',
      'user_1',
      'rendering',
      'render_started',
      undefined,
      setup.port,
    )).resolves.toEqual({
      success: false,
      previousStatus: 'editing',
      error: 'Status changed concurrently',
    });
    expect(mocks.emitBrandEvent).not.toHaveBeenCalled();
  });

  it('removes the direct projects-collection mutation from the shared owner', () => {
    const source = readFileSync('lib/shared/project-status.ts', 'utf8');
    const transitionSection = source.slice(
      source.indexOf('export async function transitionProjectStatus'),
      source.indexOf('// ==================== Query ===================='),
    );

    expect(transitionSection).toContain('loadProjectForMutation');
    expect(transitionSection).toContain('saveProjectWithReceipt');
    expect(transitionSection).not.toContain("collection('projects')");
    expect(transitionSection).not.toContain('findOneAndUpdate');
  });
});
