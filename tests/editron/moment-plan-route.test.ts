import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scene = {
  id: 'scene_1',
  source: 'https://cdn.test/demo.mp4',
  startTime: 1,
  endTime: 4,
  durationSec: 3,
  objects: [],
  faces: [],
  detectedText: [],
  transcription: 'product reveal',
  hasSpeech: true,
};

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  buildAssetContextMap: vi.fn(),
  checkMomentCoverage: vi.fn(),
  cutToMoment: vi.fn(),
  generateEditronEmbedding: vi.fn(),
  getDatabase: vi.fn(),
  planProjectEdit: vi.fn(),
  readProjectAssetAnalyses: vi.fn(),
  scenesFromAssetAnalyses: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { PROJECTS: 'projects', MEDIA_ASSETS: 'mediaAssets' },
  getDatabase: mocks.getDatabase,
}));
vi.mock('@/lib/editron/storyline/asset-analysis-reader', () => ({
  readProjectAssetAnalyses: mocks.readProjectAssetAnalyses,
}));
vi.mock('@/lib/editron/storyline/multi-asset-compose', () => ({
  buildAssetContextMap: mocks.buildAssetContextMap,
  scenesFromAssetAnalyses: mocks.scenesFromAssetAnalyses,
}));
vi.mock('@/lib/editron/storyline/moment-planning-service', () => ({
  planProjectEdit: mocks.planProjectEdit,
  checkMomentCoverage: mocks.checkMomentCoverage,
}));
vi.mock('@/lib/editron/storyline/cutting', () => ({
  cutToMoment: mocks.cutToMoment,
}));
vi.mock('@/lib/editron/services/gemini-embedding', () => ({
  generateEditronEmbedding: mocks.generateEditronEmbedding,
}));

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/services/editron/auto-edit/moment-plan', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function mockDb() {
  const project = {
    projectId: 'proj_1',
    userId: 'user_1',
    sourceAssetIds: ['asset_1'],
    productionBrief: {
      output: { platform: 'youtube', format: 'auto-edit', count: 1, aspectRatio: '16:9', targetDurationSec: null },
      brand: null,
      entryPoint: 'upload',
      resolution: { fieldConfidence: {}, confirmed: [], inferred: [] },
    },
  };
  return {
    collection(name: string) {
      if (name === 'projects') return { findOne: vi.fn(async () => project) };
      if (name === 'mediaAssets') {
        return {
          find: vi.fn(() => ({
            toArray: vi.fn(async () => [{ assetId: 'asset_1', cachedUrl: 'https://cdn.test/demo.mp4', uploadedAt: new Date('2026-07-10T00:00:00.000Z') }]),
          })),
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
}

describe('moment-plan route', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.getDatabase.mockResolvedValue(mockDb());
    mocks.readProjectAssetAnalyses.mockResolvedValue([{ assetId: 'asset_1' }]);
    mocks.buildAssetContextMap.mockReturnValue(new Map());
    mocks.scenesFromAssetAnalyses.mockReturnValue([scene]);
    mocks.generateEditronEmbedding.mockResolvedValue([1, 0, 0]);
    mocks.planProjectEdit.mockResolvedValue({ plan: { decisions: [], storyline: { clips: [] }, statement: 'ok' }, feasibility: { status: 'ready' } });
    mocks.checkMomentCoverage.mockResolvedValue({ verdict: 'have', best: { scene }, candidates: [], statement: 'have it' });
    mocks.cutToMoment.mockResolvedValue({ verdict: 'cut', windows: [{ startSec: 1, endSec: 3, confidence: 0.9 }], clips: [scene], statement: 'cut' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('plans requested moments with scenes loaded from persisted asset analyses', async () => {
    const { POST } = await import('@/app/api/services/editron/auto-edit/moment-plan/route');
    const response = await POST(request({ projectId: 'proj_1', mode: 'plan', requests: [{ text: 'product reveal', priority: 'must' }] }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({ success: true, mode: 'plan', projectId: 'proj_1', sceneCount: 1 }));
    expect(mocks.readProjectAssetAnalyses).toHaveBeenCalledWith(expect.anything(), 'proj_1');
    expect(mocks.scenesFromAssetAnalyses).toHaveBeenCalledWith([{ assetId: 'asset_1' }], { assetContexts: expect.any(Map) });
    expect(mocks.planProjectEdit).toHaveBeenCalledWith(
      [scene],
      expect.objectContaining({ output: expect.objectContaining({ platform: 'youtube' }) }),
      [{ text: 'product reveal', priority: 'must' }],
      expect.objectContaining({ embed: expect.any(Function), verify: expect.any(Function) }),
    );
  });

  it('checks coverage and cuts the verified scene for cut mode', async () => {
    const { POST } = await import('@/app/api/services/editron/auto-edit/moment-plan/route');
    const response = await POST(request({ projectId: 'proj_1', mode: 'cut', query: 'product reveal' }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({ success: true, mode: 'cut', coverage: expect.objectContaining({ verdict: 'have' }), cut: expect.objectContaining({ verdict: 'cut' }) }));
    expect(mocks.checkMomentCoverage).toHaveBeenCalledWith([scene], 'product reveal', expect.objectContaining({ embed: expect.any(Function), verify: expect.any(Function) }));
    expect(mocks.cutToMoment).toHaveBeenCalledWith(scene, { text: 'product reveal' }, expect.any(Function));
  });
});