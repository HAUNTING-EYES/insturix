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
  loadProject: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/editron/services/five-track-analysis', () => ({
  getAnalysis: mocks.getAnalysis,
}));
vi.mock('@/lib/editron/services/project-five-track-analysis-v2', () => ({
  analyzeProjectFiveTrackV2: mocks.analyzeProjectFiveTrackV2,
}));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: { loadProject: mocks.loadProject },
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
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.loadProject.mockResolvedValue(project(7));
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
    expect(mocks.loadProject).toHaveBeenCalledTimes(1);
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
    mocks.loadProject.mockResolvedValueOnce(null);

    const response = await POST(request({ projectId: 'proj_1' }) as never);

    expect(response.status).toBe(404);
    expect(mocks.checkExpensiveRateLimit).not.toHaveBeenCalled();
    expect(mocks.analyzeProjectFiveTrackV2).not.toHaveBeenCalled();
  });

  it('reloads the project and consumes only freshly rebound cache evidence', async () => {
    mocks.loadProject
      .mockResolvedValueOnce(project(7))
      .mockResolvedValueOnce(project(8));
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
    expect(mocks.loadProject).toHaveBeenCalledTimes(2);
    expect(mocks.analyzeProjectFiveTrackV2).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ mode: 'FULL', project: expect.objectContaining({ projectRevision: 7 }) }),
    );
    expect(mocks.analyzeProjectFiveTrackV2).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ mode: 'CACHE_ONLY', project: expect.objectContaining({ projectRevision: 8 }) }),
    );
    expect(mocks.loadProject.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.checkExpensiveRateLimit.mock.invocationCallOrder[0]);
  });

  it('fails loudly before suggestion generation for corrupt project timing', async () => {
    mocks.loadProject.mockResolvedValue({ ...project(7), fps: 0 });

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
      analysisDisposition: 'CACHED',
      analysisBlockReason: null,
      timelineAdmission: {
        disposition: 'ADMITTED',
        timelineOffsetFrames: 30,
      },
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
