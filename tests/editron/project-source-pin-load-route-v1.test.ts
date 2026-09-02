import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectAssetSourceUnverifiableErrorV1 }
  from '@/lib/editron/services/asset-resolver';
import { classifyProjectLoadResponse }
  from '@/components/editron/project/use-project-load-guard';

const state = vi.hoisted(() => ({
  assets: [] as Array<Record<string, unknown>>,
  authUserId: 'user-a' as string | null,
  findFilter: null as Record<string, unknown> | null,
  filenameLookupError: null as Error | null,
  loadError: null as Error | null,
  project: null as Record<string, unknown> | null,
}));

const mocks = vi.hoisted(() => ({
  loadProject: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: state.authUserId })),
}));

vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: {
    loadProject: mocks.loadProject,
    deleteProject: vi.fn(),
  },
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MEDIA_ASSETS: 'mediaAssets' },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      find: vi.fn((filter: Record<string, unknown>) => {
        state.findFilter = filter;
        return {
          project: vi.fn(() => ({
            toArray: vi.fn(async () => {
              if (state.filenameLookupError) throw state.filenameLookupError;
              return state.assets;
            }),
          })),
        };
      }),
    })),
  })),
}));

import { GET } from '../../app/api/services/editron/projects/[projectId]/route';

describe('project source-pin load route V1', () => {
  beforeEach(() => {
    state.assets = [];
    state.authUserId = 'user-a';
    state.findFilter = null;
    state.filenameLookupError = null;
    state.loadError = null;
    state.project = { projectId: 'project-a', overlays: [] };
    mocks.loadProject.mockReset();
    mocks.loadProject.mockImplementation(async () => {
      if (state.loadError) throw state.loadError;
      return state.project;
    });
  });

  it('requires authentication before loading a project', async () => {
    state.authUserId = null;

    const response = await GET({} as never, routeParams());

    expect(response.status).toBe(401);
    expect(mocks.loadProject).not.toHaveBeenCalled();
  });

  it('reports the project proxy pin even when the shared asset has another master-pinned overlay', async () => {
    state.assets = [{ assetId: 'shared-video', filename: 'interview.mov' }];
    state.project = {
      projectId: 'project-a',
      overlays: [
        videoOverlay(1, proxyPin('project-a', 1, 'shared-video')),
        videoOverlay(2, proxyPin('project-a', 2, 'shared-video')),
        videoOverlay(3, masterPin('project-a', 3, 'shared-video')),
        videoOverlay(4, masterPin('project-a', 4, 'master-only-video')),
      ],
    };

    const response = await GET({} as never, routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(state.findFilter).toEqual({
      assetId: { $in: ['shared-video'] },
    });
    expect(state.findFilter).not.toHaveProperty('isProxy');
    expect(payload.proxyAssets).toEqual([{
      assetId: 'shared-video',
      filename: 'interview.mov',
      overlayIds: [1, 2],
      selectionAuthority: 'PROJECT_SOURCE_PIN',
      sourceRole: 'PROXY',
      sourceVersionSha256: 'a'.repeat(64),
    }]);
  });

  it('does not infer proxy selection for an unpinned or master-pinned overlay', async () => {
    state.project = {
      projectId: 'project-a',
      overlays: [
        videoOverlay(1),
        videoOverlay(2, masterPin('project-a', 2, 'shared-video')),
      ],
    };

    const response = await GET({} as never, routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).not.toHaveProperty('proxyAssets');
    expect(state.findFilter).toBeNull();
  });

  it('keeps validated proxy status when optional filename enrichment is unavailable', async () => {
    state.filenameLookupError = new Error('label store unavailable');
    state.project = {
      projectId: 'project-a',
      overlays: [videoOverlay(1, proxyPin('project-a', 1, 'shared-video'))],
    };

    const response = await GET({} as never, routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.proxyAssets).toEqual([
      expect.objectContaining({
        assetId: 'shared-video',
        filename: null,
        selectionAuthority: 'PROJECT_SOURCE_PIN',
      }),
    ]);
  });

  it('surfaces source-pin admission failure as structured 409', async () => {
    state.loadError = new ProjectAssetSourceUnverifiableErrorV1({
      projectId: 'project-a',
      overlayId: 7,
      assetId: 'shared-video',
      reason: 'SOURCE_PIN_SCOPE_MISMATCH',
    });

    const response = await GET({} as never, routeParams());
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual({
      success: false,
      error: 'Project video source is unverifiable for overlay 7 (SOURCE_PIN_SCOPE_MISMATCH).',
      code: 'PROJECT_VIDEO_SOURCE_UNVERIFIABLE',
      details: {
        projectId: 'project-a',
        overlayId: 7,
        assetId: 'shared-video',
        reason: 'SOURCE_PIN_SCOPE_MISMATCH',
      },
    });
  });

  it('classifies media-integrity blocks separately from missing and transient projects', () => {
    expect(classifyProjectLoadResponse(409, {
      code: 'PROJECT_VIDEO_SOURCE_UNVERIFIABLE',
      error: 'Exact project media could not be verified.',
      details: { reason: 'SOURCE_PIN_SCOPE_MISMATCH' },
    })).toEqual({
      status: 'blocked',
      message: 'Exact project media could not be verified.',
      reason: 'SOURCE_PIN_SCOPE_MISMATCH',
    });
    expect(classifyProjectLoadResponse(404, null)).toMatchObject({
      status: 'missing',
    });
    expect(classifyProjectLoadResponse(503, null)).toMatchObject({
      status: 'retryable',
    });
  });
});

function routeParams(projectId = 'project-a') {
  return { params: Promise.resolve({ projectId }) };
}

function videoOverlay(id: number, sourceVersionPinV1?: Record<string, unknown>) {
  return {
    id,
    type: 'video',
    assetId: sourceVersionPinV1?.assetId ?? `video-${id}`,
    ...(sourceVersionPinV1 ? { sourceVersionPinV1 } : {}),
  };
}

function proxyPin(projectId: string, overlayId: number, assetId: string) {
  return {
    projectId,
    overlayId,
    assetId,
    sourceRole: 'PROXY',
    sourceVersionSha256: 'a'.repeat(64),
  };
}

function masterPin(projectId: string, overlayId: number, assetId: string) {
  return {
    projectId,
    overlayId,
    assetId,
    sourceRole: 'MASTER',
    sourceVersionSha256: 'b'.repeat(64),
  };
}
