import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getStoryboard: vi.fn(),
  deductCredits: vi.fn(),
  createProject: vi.fn(),
  findProjectBySessionId: vi.fn(),
  saveProject: vi.fn(),
  getDatabase: vi.fn(),
  addProjectToLink: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/pipeline/storyboard-db', () => ({ getStoryboard: mocks.getStoryboard }));
vi.mock('@/lib/services/creditsService', () => ({
  CreditsService: { deductCredits: mocks.deductCredits },
}));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: {
    createProject: mocks.createProject,
    findProjectBySessionId: mocks.findProjectBySessionId,
    saveProject: mocks.saveProject,
  },
}));
vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { PROJECTS: 'projects' },
  getDatabase: mocks.getDatabase,
}));
vi.mock('@/lib/pipeline/bgm-service', () => ({
  buildMusicPrompt: vi.fn(),
  isBGMAvailable: vi.fn(() => false),
}));
vi.mock('@/lib/editron/services/audio-worker-dispatch', () => ({ dispatchAudioJob: vi.fn() }));
vi.mock('@/lib/pipeline/sfx-service', () => ({ isSFXAvailable: vi.fn(() => false) }));
vi.mock('@/lib/pipeline/edit-direction-applier', () => ({ applyEditDirections: vi.fn() }));
vi.mock('@/lib/editron/services/five-track-analysis', () => ({
  getAnalysis: vi.fn(),
  selectBestSegment: vi.fn(),
}));
vi.mock('@/lib/shared/project-links', () => ({ addProjectToLink: mocks.addProjectToLink }));

import { POST } from '../../app/api/services/pipeline/storyboard/[id]/finalize/route';

function makeRequest(body: Record<string, unknown> = {}) {
  return { json: vi.fn().mockResolvedValue(body) };
}

describe('storyboard finalize production coverage gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.deductCredits.mockResolvedValue({ success: true });
    mocks.getDatabase.mockResolvedValue({
      collection: vi.fn(() => ({ updateOne: vi.fn(), insertOne: vi.fn() })),
    });
  });

  it('returns 409 before credit deduction or project creation when production coverage is incomplete', async () => {
    mocks.getStoryboard.mockResolvedValue({
      storyboardId: 'sb_incomplete',
      userId: 'user_1',
      sourceSessionId: 'tf_session_1',
      title: 'Incomplete production storyboard',
      status: 'ready',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      productionManifest: {
        version: 1,
        sourceService: 'thinkforge',
        sourceSessionId: 'tf_session_1',
        expectedSceneCount: 2,
        expectedStoryboardImages: 2,
        expectedVideoClips: 1,
        coveragePolicy: 'production-require-all-scenes',
        warnings: [],
      },
      scenes: [
        {
          sceneIndex: 0,
          imageUrl: 'https://cdn.example.com/scene-0.png',
          status: 'generated',
          generationHistory: [],
          descriptor: {
            sceneIndex: 0,
            title: 'Hook',
            narration: 'A hook',
            visualDescription: 'A single generated scene',
            durationSeconds: 5,
            mood: 'urgent',
            assetRecommendation: 'ai-video',
          },
        },
      ],
    });

    const response = await POST(makeRequest({ requireVideoCoverage: true }) as any, {
      params: Promise.resolve({ id: 'sb_incomplete' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      success: false,
      reason: 'production-coverage-incomplete',
      retryable: true,
      coverageIssue: {
        reason: 'scene-count-incomplete',
        expected: 2,
        actual: 1,
      },
    });
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.findProjectBySessionId).not.toHaveBeenCalled();
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.saveProject).not.toHaveBeenCalled();
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });
});
