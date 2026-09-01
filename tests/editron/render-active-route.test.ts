import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRenderJobChapterOrchestrationV1,
  RenderJobChapterOrchestrationSchema,
  RenderJobSchema,
  type RenderJob,
} from '@/lib/editron/schemas/render-job';
import {
  buildContainedVideoTargetsV1,
  buildProjectRenderSourceSnapshotV1,
  createProjectRenderSnapshotBindingV1,
  type ProjectRenderSnapshotBindingV1,
} from '@/lib/editron/services/project-render-snapshot-binding-v1';
import { CHAPTER_ORCHESTRATION_EXECUTION_KIND } from '@/lib/editron/shared/render-request-payload';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getActiveProjectRenderJobsV1: vi.fn(),
  getActiveRendersForUser: vi.fn(),
  loadProjectForRenderSnapshot: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));

vi.mock('@/lib/editron/services/render-job-service', () => ({
  getActiveProjectRenderJobsV1: mocks.getActiveProjectRenderJobsV1,
  getActiveRendersForUser: mocks.getActiveRendersForUser,
}));

vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: {
    loadProjectForRenderSnapshot: mocks.loadProjectForRenderSnapshot,
  },
}));

import { GET } from '@/app/api/services/editron/render/active/route';

const REVISION = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: '2026-09-01T00:00:00.000Z',
};
const CHAPTER_JOB_ID = 'chr_123456789012';
const CHAPTER_REGION = 'ap-south-1';
const CHAPTER_RESERVED_AT = new Date('2026-09-01T00:00:00.000Z');
const CHAPTER_STARTED_AT = new Date('2026-09-01T00:01:00.000Z');
const CHAPTER_RUNNING_AT = new Date('2026-09-01T00:02:00.000Z');

function makeChapterBinding(): ProjectRenderSnapshotBindingV1 {
  const project = {
    overlays: [],
    durationInFrames: 180,
    fps: 30,
    playerDimensions: { width: 1920, height: 1080 },
  };
  const source = buildProjectRenderSourceSnapshotV1({
    project,
    inputProps: { renderMode: 'active-route-test' },
  });
  return createProjectRenderSnapshotBindingV1({
    artifactKind: 'RENDERED_PREVIEW',
    artifactId: CHAPTER_JOB_ID,
    ownerId: 'owner_1',
    projectId: 'project_1',
    projectRevision: REVISION,
    sequenceId: 'active-route-sequence',
    compositionId: 'active-route-composition',
    renderContract: { renderer: 'remotion-lambda', fps: 30 },
    durationInFrames: 180,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSource: source,
    containedVideoTargets: buildContainedVideoTargetsV1(project.overlays),
  });
}

function makeStrictChapterJob(): RenderJob {
  const binding = makeChapterBinding();
  const orchestration = RenderJobChapterOrchestrationSchema.parse({
    ...createRenderJobChapterOrchestrationV1({
      aggregateJobId: CHAPTER_JOB_ID,
      bindingHash: binding.bindingHash,
      selectedRegion: CHAPTER_REGION,
      reservedAt: CHAPTER_RESERVED_AT,
    }),
    state: 'RUNNING',
    startingAt: CHAPTER_STARTED_AT,
    runningAt: CHAPTER_RUNNING_AT,
    chapterCount: 2,
    progress: 0.42,
    completedChapterCount: 1,
    chapterLayoutManifestHash: 'a'.repeat(64),
  });
  return RenderJobSchema.parse({
    _id: CHAPTER_JOB_ID,
    userId: 'owner_1',
    requestedByUserId: 'user_1',
    projectId: 'project_1',
    status: 'rendering',
    progress: 0.42,
    projectRenderSnapshotBinding: binding,
    artifactState: 'ACTIVE',
    dispatch: {
      version: 1,
      phase: 'NOT_ATTEMPTED',
      billingState: 'PENDING',
      attemptToken: 'active-route-attempt',
      creditIdempotencyKey: 'active-route-credit',
      billingWallet: { type: 'user', clerkUserId: 'owner_1' },
    },
    chapterOrchestration: orchestration,
    startedAt: CHAPTER_STARTED_AT,
    region: CHAPTER_REGION,
    expiresAt: new Date('2026-09-08T00:00:00.000Z'),
    deliveryManifest: {
      version: 'editron-render-delivery-manifest-v1',
      mode: 'embedded',
      createdAt: CHAPTER_RESERVED_AT.toISOString(),
      completedAt: null,
      primaryArtifact: {
        kind: 'mixed-master',
        renderId: CHAPTER_JOB_ID,
        status: 'rendering',
        url: null,
      },
      music: {
        embedded: true,
        removedOverlayIds: [],
        handoff: null,
      },
    },
  });
}

describe('Editron active render route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.loadProjectForRenderSnapshot.mockResolvedValue({
      project: {},
      ownerId: 'owner_1',
      revision: REVISION,
    });
    mocks.getActiveProjectRenderJobsV1.mockResolvedValue({
      ok: true,
      status: 'CURRENT',
      jobs: [],
    });
    mocks.getActiveRendersForUser.mockResolvedValue([]);
  });

  it('returns current strict renders for an access-authorized collaborator', async () => {
    mocks.getActiveProjectRenderJobsV1.mockResolvedValueOnce({
      ok: true,
      status: 'CURRENT',
      jobs: [{
        _id: 'strict_admission',
        providerRenderId: 'strict_provider',
        userId: 'owner_1',
        requestedByUserId: 'user_1',
        projectId: 'project_1',
        status: 'rendering',
        progress: 0.42,
        bucketName: 'render-bucket',
        region: 'ap-south-1',
        startedAt: new Date('2026-09-01T00:01:00.000Z'),
        projectRenderSnapshotBinding: { scope: 'PROJECT_SNAPSHOT' },
      }],
    });

    const response = await GET(new Request(
      'http://localhost/api/services/editron/render/active?projectId=project_1',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getActiveProjectRenderJobsV1).toHaveBeenCalledWith({
      ownerId: 'owner_1',
      requestedByUserId: 'user_1',
      projectId: 'project_1',
      currentProjectRevision: REVISION,
      limit: 10,
    });
    expect(mocks.getActiveRendersForUser).toHaveBeenCalledWith('owner_1');
    expect(body.data.renders).toEqual([expect.objectContaining({
      renderId: 'strict_provider',
      projectId: 'project_1',
      status: 'rendering',
      progress: 42,
      bucketName: 'render-bucket',
      region: 'ap-south-1',
    })]);
  });

  it('returns strict chapter identity without provider fields', async () => {
    mocks.getActiveProjectRenderJobsV1.mockResolvedValueOnce({
      ok: true,
      status: 'CURRENT',
      jobs: [makeStrictChapterJob()],
    });

    const response = await GET(new Request(
      'http://localhost/api/services/editron/render/active?projectId=project_1',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.renders).toEqual([{
      executionKind: CHAPTER_ORCHESTRATION_EXECUTION_KIND,
      orchestrationId: CHAPTER_JOB_ID,
      renderId: CHAPTER_JOB_ID,
      projectId: 'project_1',
      status: 'rendering',
      progress: 42,
      region: CHAPTER_REGION,
      startedAt: CHAPTER_STARTED_AT.toISOString(),
    }]);
    expect(body.data.renders[0]).not.toHaveProperty('bucketName');
    expect(body.data.renders[0]).not.toHaveProperty('providerRenderId');
  });

  it.each([
    {
      name: 'aggregate job ID',
      mutate: (job: RenderJob) => ({
        ...job,
        chapterOrchestration: {
          ...job.chapterOrchestration!,
          aggregateJobId: 'chr_abcdefghijkl',
        },
      }),
    },
    {
      name: 'binding hash',
      mutate: (job: RenderJob) => ({
        ...job,
        chapterOrchestration: {
          ...job.chapterOrchestration!,
          bindingHash: 'b'.repeat(64),
        },
      }),
    },
    {
      name: 'selected region',
      mutate: (job: RenderJob) => ({
        ...job,
        chapterOrchestration: {
          ...job.chapterOrchestration!,
          selectedRegion: 'us-east-1',
        },
      }),
    },
    {
      name: 'provider-bearing parent row',
      mutate: (job: RenderJob) => ({
        ...job,
        providerRenderId: 'provider-parent',
        bucketName: 'provider-bucket',
      }),
    },
    {
      name: 'malformed orchestration',
      mutate: (job: RenderJob) => ({
        ...job,
        chapterOrchestration: {
          ...job.chapterOrchestration!,
          unexpected: true,
        },
      }),
    },
  ])('fails closed for a $name mismatch', async ({ mutate }) => {
    mocks.getActiveProjectRenderJobsV1.mockResolvedValueOnce({
      ok: true,
      status: 'CURRENT',
      jobs: [mutate(makeStrictChapterJob()) as unknown as RenderJob],
    });

    const response = await GET(new Request(
      'http://localhost/api/services/editron/render/active?projectId=project_1',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.renders).toEqual([]);
  });

  it('keeps the unscoped compatibility path legacy-only', async () => {
    mocks.getActiveRendersForUser.mockResolvedValueOnce([
      {
        _id: 'legacy_render',
        userId: 'user_1',
        projectId: 'project_1',
        status: 'rendering',
        progress: 0.5,
        startedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      {
        _id: 'strict_render',
        userId: 'user_1',
        requestedByUserId: 'user_1',
        projectId: 'project_1',
        status: 'rendering',
        startedAt: new Date('2026-09-01T00:01:00.000Z'),
        projectRenderSnapshotBinding: { scope: 'PROJECT_SNAPSHOT' },
      },
      {
        _id: 'chr_legacy123456',
        userId: 'user_1',
        projectId: 'project_1',
        status: 'rendering',
        progress: 0.75,
        bucketName: 'chapter-render',
        region: 'ap-south-1',
        startedAt: new Date('2026-09-01T00:02:00.000Z'),
      },
    ]);

    const response = await GET(new Request(
      'http://localhost/api/services/editron/render/active',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.renders).toHaveLength(2);
    expect(body.data.renders).toContainEqual(expect.objectContaining({
      renderId: 'legacy_render',
      progress: 50,
    }));
    const legacyChapter = body.data.renders.find(
      (render: Record<string, unknown>) => render.renderId === 'chr_legacy123456',
    );
    expect(legacyChapter).toMatchObject({
      renderId: 'chr_legacy123456',
      bucketName: 'chapter-render',
      region: 'ap-south-1',
      progress: 75,
    });
    expect(legacyChapter).not.toHaveProperty('executionKind');
    expect(legacyChapter).not.toHaveProperty('orchestrationId');
    expect(mocks.loadProjectForRenderSnapshot).not.toHaveBeenCalled();
    expect(mocks.getActiveProjectRenderJobsV1).not.toHaveBeenCalled();
  });

  it('does not disclose active renders without current project access', async () => {
    mocks.loadProjectForRenderSnapshot.mockResolvedValueOnce(null);

    const response = await GET(new Request(
      'http://localhost/api/services/editron/render/active?projectId=project_1',
    ));

    expect(response.status).toBe(404);
    expect(mocks.getActiveProjectRenderJobsV1).not.toHaveBeenCalled();
    expect(mocks.getActiveRendersForUser).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated active-render requests', async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });

    const response = await GET(new Request(
      'http://localhost/api/services/editron/render/active?projectId=project_1',
    ));

    expect(response.status).toBe(401);
    expect(mocks.loadProjectForRenderSnapshot).not.toHaveBeenCalled();
  });
});
