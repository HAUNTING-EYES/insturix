import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/services/editron/analysis/route';

const mocks = vi.hoisted(() => ({
  analyzeProjectAssets: vi.fn(),
  assembleUnifiedContext: vi.fn(),
  auth: vi.fn(),
  checkExpensiveRateLimit: vi.fn(),
  collection: vi.fn(),
  detectCinematicMoments: vi.fn(),
  generateEditDecisionList: vi.fn(),
  generateUnifiedEditPlan: vi.fn(),
  getAnalysis: vi.fn(),
  findOne: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
}));

vi.mock('@/lib/editron/services/five-track-analysis', () => ({
  analyzeProjectAssets: mocks.analyzeProjectAssets,
  getAnalysis: mocks.getAnalysis,
}));

vi.mock('@/lib/editron/services/reactive-edit-engine', () => ({
  generateEditDecisionList: mocks.generateEditDecisionList,
}));

vi.mock('@/lib/editron/services/cinematic-moment-detector', () => ({
  detectCinematicMoments: mocks.detectCinematicMoments,
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { PROJECTS: 'projects' },
  getDatabase: vi.fn(async () => ({ collection: mocks.collection })),
}));

vi.mock('@/lib/editron/utils/rate-limiter', () => ({
  checkExpensiveRateLimit: mocks.checkExpensiveRateLimit,
}));

vi.mock('@/lib/editron/services/unified-edit-intelligence', () => ({
  assembleUnifiedContext: mocks.assembleUnifiedContext,
  generateUnifiedEditPlan: mocks.generateUnifiedEditPlan,
}));

function request(body: unknown): Request {
  return new Request('http://localhost/api/services/editron/analysis', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('Editron analysis route cached suggestions mode', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();

    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.collection.mockReturnValue({ findOne: mocks.findOne });
    mocks.findOne.mockResolvedValue({
      projectId: 'proj_1',
      userId: 'user_1',
      durationInFrames: 300,
      overlays: [
        { id: 'v1', type: 'video', assetId: 'asset_1', from: 30, row: 2 },
      ],
    });
    mocks.getAnalysis.mockResolvedValue({
      assetId: 'asset_1',
      shots: [],
      motionSegments: [],
      keyframeAnalyses: [],
      subjectTracks: [],
      speechSegments: [],
      musicStructure: null,
    });
    mocks.generateEditDecisionList.mockReturnValue({
      projectId: 'proj_1',
      totalDecisions: 1,
      decisions: [
        {
          type: 'zoom',
          frame: 30,
          confidence: 0.8,
          reason: 'cached signal suggestion',
          params: {},
        },
      ],
    });
    mocks.detectCinematicMoments.mockReturnValue([]);
  });

  it('does not run full analysis or legacy Gemini planning for editor auto suggestions', async () => {
    const response = await POST(request({ projectId: 'proj_1', mode: 'cached-suggestions' }) as any);

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      success: true,
      mode: 'cached-suggestions',
      assets: { skipped: true },
      editDecisionList: { totalDecisions: 1 },
    });
    expect(mocks.checkExpensiveRateLimit).not.toHaveBeenCalled();
    expect(mocks.analyzeProjectAssets).not.toHaveBeenCalled();
    expect(mocks.assembleUnifiedContext).not.toHaveBeenCalled();
    expect(mocks.generateUnifiedEditPlan).not.toHaveBeenCalled();
    expect(mocks.generateEditDecisionList).toHaveBeenCalledTimes(1);
  });
});
