import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/services/editron/analysis/route';

const mocks = vi.hoisted(() => ({
  analyzeProjectFiveTrackV2: vi.fn(),
  auth: vi.fn(),
  checkExpensiveRateLimit: vi.fn(),
  collection: vi.fn(),
  detectCinematicMoments: vi.fn(),
  generateEditDecisionList: vi.fn(),
  getAnalysis: vi.fn(),
  loadProjectForMutation: vi.fn(),
  ProjectNotFoundOrForbiddenError: class extends Error {},
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/editron/services/five-track-analysis', () => ({
  getAnalysis: mocks.getAnalysis,
}));
vi.mock('@/lib/editron/services/project-five-track-analysis-v2', () => ({
  analyzeProjectFiveTrackV2: mocks.analyzeProjectFiveTrackV2,
}));
vi.mock('@/lib/editron/services/project-service', () => ({
  ProjectNotFoundOrForbiddenError: mocks.ProjectNotFoundOrForbiddenError,
  projectService: {
    loadProjectForMutation: mocks.loadProjectForMutation,
  },
}));
vi.mock('@/lib/editron/services/reactive-edit-engine', () => ({
  generateEditDecisionList: mocks.generateEditDecisionList,
}));
vi.mock('@/lib/editron/services/cinematic-moment-detector', () => ({
  detectCinematicMoments: mocks.detectCinematicMoments,
}));
vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MEDIA_ASSETS: 'media_assets' },
  getDatabase: vi.fn(async () => ({ collection: mocks.collection })),
}));
vi.mock('@/lib/editron/utils/rate-limiter', () => ({
  checkExpensiveRateLimit: mocks.checkExpensiveRateLimit,
}));

describe('Editron project-scoped analysis route', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      if (vi.isMockFunction(mock)) mock.mockReset();
    }
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.loadProjectForMutation.mockResolvedValue(snapshot(7));
    mocks.analyzeProjectFiveTrackV2.mockResolvedValue(evidence(7));
    mocks.checkExpensiveRateLimit.mockResolvedValue({ success: true, reset: 0 });
    mocks.generateEditDecisionList.mockReturnValue({
      projectId: 'proj_1',
      totalDecisions: 1,
      decisions: [{ type: 'zoom', frame: 30, params: {} }],
    });
    mocks.detectCinematicMoments.mockReturnValue([]);
  });

  it('keeps cached suggestions provider-free and uses only admitted evidence', async () => {
    const response = await POST(request({
      projectId: 'proj_1',
      mode: 'cached-suggestions',
    }) as never);

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      success: true,
      mode: 'cached-suggestions',
      assets: { skipped: true, cached: 1 },
      timelineSuggestionAdmission: {
        disposition: 'ALL_AVAILABLE_ANALYSES_ADMITTED',
        admittedOverlayIds: [1],
      },
      editDecisionList: { totalDecisions: 1 },
    });
    expect(mocks.checkExpensiveRateLimit).not.toHaveBeenCalled();
    expect(mocks.loadProjectForMutation).toHaveBeenCalledTimes(1);
    expect(mocks.analyzeProjectFiveTrackV2).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'CACHE_ONLY' }),
    );
    expect(mocks.generateEditDecisionList).toHaveBeenCalledWith(
      [expect.objectContaining({ _timelineOffsetFrames: 30 })],
      10_000,
      expect.any(Object),
    );
  });

  it('checks project access before rate limiting or provider admission', async () => {
    mocks.loadProjectForMutation.mockRejectedValueOnce(
      new mocks.ProjectNotFoundOrForbiddenError(),
    );

    const response = await POST(request({ projectId: 'proj_1' }) as never);

    expect(response.status).toBe(404);
    expect(mocks.checkExpensiveRateLimit).not.toHaveBeenCalled();
    expect(mocks.analyzeProjectFiveTrackV2).not.toHaveBeenCalled();
  });

  it('reloads the project and consumes only freshly rebound cache evidence', async () => {
    mocks.loadProjectForMutation
      .mockResolvedValueOnce(snapshot(7))
      .mockResolvedValueOnce(snapshot(8));
    mocks.analyzeProjectFiveTrackV2
      .mockResolvedValueOnce({
        ...evidence(7),
        mode: 'FULL',
        analyzed: 1,
        cached: 0,
      })
      .mockResolvedValueOnce(evidence(8));

    const response = await POST(request({ projectId: 'proj_1' }) as never);

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      projectRevision: 8,
      assets: { analyzed: 1, cached: 0 },
    });
    expect(mocks.loadProjectForMutation).toHaveBeenCalledTimes(2);
    expect(mocks.analyzeProjectFiveTrackV2).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        mode: 'FULL',
        project: expect.objectContaining({ projectRevision: 7 }),
        projectRevisionV1: revision(7),
      }),
    );
    expect(mocks.analyzeProjectFiveTrackV2).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        mode: 'CACHE_ONLY',
        project: expect.objectContaining({ projectRevision: 8 }),
        projectRevisionV1: revision(8),
      }),
    );
    expect(mocks.loadProjectForMutation.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.checkExpensiveRateLimit.mock.invocationCallOrder[0]);
  });

  it('exposes same-revision timestamp evidence without admitting it to the EDL', async () => {
    const full = timestampEvidence(7, true);
    mocks.analyzeProjectFiveTrackV2
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce(timestampEvidence(7, false));

    const response = await POST(request({ projectId: 'proj_1' }) as never);

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      analyzedCount: 1,
      analysisBlocks: [],
      timelineSuggestionAdmission: {
        disposition: 'BLOCKED',
        admittedOverlayIds: [],
        blocks: [{
          overlayId: 1,
          reason: 'PROJECT_COORDINATE_FIVE_TRACK_CONSUMER_REQUIRED',
        }],
      },
      projectCoordinateAnalysisSummaries: [{
        overlayId: 1,
        evidenceAuthority: 'EXACT_V3_TIMESTAMP_BOUND',
        materializationSha256: '4'.repeat(64),
        mutationAuthority:
          'REQUIRES_DEDICATED_PROJECT_COORDINATE_FIVE_TRACK_CONSUMER',
        vision: { sceneChanges: ['30'] },
      }],
    });
    expect(mocks.generateEditDecisionList).toHaveBeenCalledWith(
      [],
      10_000,
      expect.any(Object),
    );
  });

  it('fails loudly before suggestion generation for corrupt project timing', async () => {
    mocks.loadProjectForMutation.mockResolvedValue({
      project: { ...project(7), fps: 0 },
      revision: revision(7),
    });

    const response = await POST(request({
      projectId: 'proj_1',
      mode: 'cached-suggestions',
    }) as never);

    expect(response.status).toBe(409);
    await expect(json(response)).resolves.toMatchObject({
      error: 'PROJECT_TIMELINE_INVALID',
    });
    expect(mocks.generateEditDecisionList).not.toHaveBeenCalled();
  });
});

function request(body: unknown): Request {
  return new Request('http://localhost/api/services/editron/analysis', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function project(projectRevision: number) {
  return {
    projectId: 'proj_1',
    userId: 'user_1',
    projectRevision,
    fps: 30,
    durationInFrames: 300,
    overlays: [],
  };
}

function revision(value: number) {
  return {
    schemaVersion: 1,
    value,
    compatibilityUpdatedAt: `2026-08-31T00:00:0${value}.000Z`,
  };
}

function snapshot(projectRevision: number) {
  return {
    project: project(projectRevision),
    revision: revision(projectRevision),
  };
}

function evidence(projectRevision: number) {
  return {
    schemaVersion: 2,
    kind: 'EDITRON_PROJECT_FIVE_TRACK_ANALYSIS_V2',
    projectId: 'proj_1',
    projectRevision,
    mode: 'CACHE_ONLY',
    analyzed: 0,
    cached: 1,
    failed: 0,
    timedOut: false,
    overlays: [{
      overlayId: 1,
      assetId: 'asset_1',
      analysis: analysis(),
      projectCoordinateAnalysis: null,
      analysisDisposition: 'CACHED',
      analysisBlockReason: null,
      timelineAdmission: {
        disposition: 'ADMITTED',
        timelineOffsetFrames: 30,
      },
    }],
  };
}

function timestampEvidence(projectRevision: number, analyzed: boolean) {
  const projectCoordinateAnalysis = analyzed
    ? {
        disposition: 'ANALYZED',
        sourceVersionSha256: '1'.repeat(64),
        storageVersionSha256: '2'.repeat(64),
        sourcePtsCadenceMapStateSha256V3: '3'.repeat(64),
        materialization: { materializationSha256: '4'.repeat(64) },
        vision: {
          sceneChanges: ['30'],
          deadVisualRanges: [],
          gestures: [],
          onScreenText: [],
          summary: 'Interview',
          theme: null,
        },
      }
    : null;
  return {
    ...evidence(projectRevision),
    mode: analyzed ? 'FULL' : 'CACHE_ONLY',
    analyzed: analyzed ? 1 : 0,
    cached: 0,
    overlays: [{
      overlayId: 1,
      assetId: 'asset_1',
      analysis: null,
      projectCoordinateAnalysis,
      analysisDisposition: analyzed
        ? 'PROJECT_COORDINATE_ANALYZED'
        : 'UNAVAILABLE',
      analysisBlockReason: analyzed ? null : 'TIMESTAMP_ANALYSIS_CACHE_MISS',
      timelineAdmission: analyzed
        ? {
            disposition: 'BLOCKED',
            reason: 'PROJECT_COORDINATE_FIVE_TRACK_CONSUMER_REQUIRED',
          }
        : { disposition: 'BLOCKED', reason: 'ANALYSIS_UNAVAILABLE' },
    }],
  };
}

function analysis() {
  return {
    assetId: 'asset_1',
    userId: 'user_1',
    status: 'complete',
    durationMs: 1000,
    analyzedAt: new Date('2026-08-31T00:00:00.000Z'),
    shots: [],
    motionSegments: [],
    motionPeaks: [],
    audio: null,
    keyframeAnalyses: [],
    subjectTracks: [],
    speechSegments: [],
    musicStructure: null,
    naturalCutPoints: [],
    audioSyncPoints: [],
  };
}
