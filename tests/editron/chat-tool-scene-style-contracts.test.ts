import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditDNA: vi.fn(),
  extractEditDNA: vi.fn(),
  getStoryboard: vi.fn(),
  getStoryboardByProjectId: vi.fn(),
  loadProfile: vi.fn(),
}));

vi.hoisted(() => {
  process.env.MONGODB_URI ??= 'mongodb://localhost:27017/editron-test';
  process.env.MONGODB_DB_NAME ??= 'editron-test';
  process.env.VERCEL_URL = 'preview.example.test';
});

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: T[]) => structuredClone(overlays),
    resolveAssetUrl: vi.fn(async () => 'https://cdn.example.com/resolved.mp4'),
  },
}));

vi.mock('@/lib/pipeline/storyboard-db', () => ({
  getStoryboard: mocks.getStoryboard,
  getStoryboardByProjectId: mocks.getStoryboardByProjectId,
}));

vi.mock('@/lib/editron/services/style-transfer-service', () => ({
  applyEditDNA: mocks.applyEditDNA,
  extractEditDNA: mocks.extractEditDNA,
  loadProfile: mocks.loadProfile,
}));

import { createTools } from '@/lib/editron/agent/tools';
import { projectService } from '@/lib/editron/services/project-service';

const BASE_PROJECT = {
  projectId: 'proj_scene_style',
  userId: 'user_scene_style',
  name: 'Scene and style fixture',
  aspectRatio: '16:9',
  playerDimensions: { width: 1280, height: 720 },
  fps: 30,
  durationInFrames: 600,
  overlays: [{ id: 1, type: 'video', assetId: 'asset-reference', from: 0, durationInFrames: 600 }],
  createdAt: new Date('2026-07-18T00:00:00.000Z'),
  updatedAt: new Date('2026-07-18T00:00:00.000Z'),
  visibility: 'private',
};

function toolNamed(name: string) {
  const candidate = createTools('user_scene_style', 'proj_scene_style')
    .find((tool) => tool.name === name);
  expect(candidate, `${name} should be registered`).toBeDefined();
  return candidate as unknown as { invoke: (input: Record<string, unknown>) => Promise<string> };
}

function parseEnvelope(raw: string) {
  return JSON.parse(raw) as {
    status: 'success' | 'error';
    data: Record<string, any> | null;
    error: { code?: string; message: string } | null;
  };
}

function dnaFixture() {
  return {
    profileId: 'dna-reference-1',
    sourceName: 'Reference cut',
    cutRhythm: { avgCutsPerMinute: 18 },
    transitions: { dominant: 'hard-cut' },
    colorGrade: { temperature: 'warm' },
    textStyle: { family: 'sans-serif' },
    musicStyle: { energy: 'restrained' },
    pacing: { overall: 'measured' },
    graphicsDensity: 'low',
  };
}

describe('chat scene and style tool contracts', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    vi.spyOn(projectService, 'loadProject').mockResolvedValue(structuredClone(BASE_PROJECT) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('dispatches requested scene video regeneration with feedback to the linked storyboard', async () => {
    mocks.getStoryboardByProjectId.mockResolvedValue({ storyboardId: 'sb-1' });
    mocks.getStoryboard.mockResolvedValue({
      storyboardId: 'sb-1',
      scenes: [{ sceneIndex: 0 }, { sceneIndex: 1 }, { sceneIndex: 2 }],
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      async: true,
      batchId: 'video-batch-1',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = parseEnvelope(await toolNamed('regenerate_scene').invoke({
      sceneIndex: 1,
      target: 'video',
      feedback: 'Keep the garment, but use warmer window light.',
    }));

    expect(result, JSON.stringify(result)).toMatchObject({
      status: 'success',
      data: {
        sceneIndex: 1,
        target: 'video',
        storyboardId: 'sb-1',
        results: [expect.stringContaining('video-batch-1')],
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://preview.example.test/api/services/pipeline/storyboard/sb-1/generate-videos',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sceneIndices: [1], userId: 'user_scene_style' }),
      }),
    );
    expect(mocks.getStoryboard).toHaveBeenCalledWith('sb-1', 'user_scene_style');
  });

  it('extracts a named reference profile from the requested overlay', async () => {
    mocks.extractEditDNA.mockResolvedValue(dnaFixture());

    const result = parseEnvelope(await toolNamed('extract_style').invoke({
      videoOverlayId: '1',
      sourceName: 'Reference cut',
    }));

    expect(result, JSON.stringify(result)).toMatchObject({
      status: 'success',
      data: {
        profileId: 'dna-reference-1',
        sourceName: 'Reference cut',
        cutRhythm: { avgCutsPerMinute: 18 },
        colorGrade: { temperature: 'warm' },
        graphicsDensity: 'low',
      },
    });
    expect(mocks.extractEditDNA).toHaveBeenCalledWith({
      videoOverlayId: '1',
      videoUrl: undefined,
      sourceName: 'Reference cut',
      userId: 'user_scene_style',
      projectId: 'proj_scene_style',
    });
  });

  it('returns a reference-derived action plan and rejects unknown profiles', async () => {
    const dna = dnaFixture();
    mocks.loadProfile.mockResolvedValueOnce(dna).mockResolvedValueOnce(null);
    mocks.applyEditDNA.mockResolvedValue({
      summary: 'Match measured pacing and warm grade.',
      actions: [
        { type: 'color', description: 'Warm the image', aiChatPrompt: 'Apply a subtle warm grade.' },
        { type: 'pacing', description: 'Use measured cuts', aiChatPrompt: 'Preserve complete thoughts.' },
      ],
    });

    const planned = parseEnvelope(await toolNamed('apply_style').invoke({ profileId: 'dna-reference-1' }));
    const missing = parseEnvelope(await toolNamed('apply_style').invoke({ profileId: 'dna-missing' }));

    expect(planned, JSON.stringify(planned)).toMatchObject({
      status: 'success',
      data: {
        summary: 'Match measured pacing and warm grade.',
        actions: [
          { type: 'color', aiChatPrompt: 'Apply a subtle warm grade.' },
          { type: 'pacing', aiChatPrompt: 'Preserve complete thoughts.' },
        ],
      },
    });
    expect(mocks.applyEditDNA).toHaveBeenCalledWith('proj_scene_style', 'user_scene_style', dna);
    expect(missing).toMatchObject({
      status: 'error',
      error: { message: "Style profile 'dna-missing' not found. Use extract_style first to create a profile." },
    });
  });
});
