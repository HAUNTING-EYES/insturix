import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  analyzeClipAudioService: vi.fn(),
  resolveAssetUrl: vi.fn(),
  sampleVideoClip: vi.fn(),
  sendVideoToGemini: vi.fn(),
}));

vi.hoisted(() => {
  process.env.MONGODB_URI ??= 'mongodb://localhost:27017/editron-test';
  process.env.MONGODB_DB_NAME ??= 'editron-test';
});

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: T[]) => structuredClone(overlays),
    resolveAssetUrl: mocks.resolveAssetUrl,
  },
}));

vi.mock('@/lib/editron/services/media', () => ({
  analyzeClipAudioService: mocks.analyzeClipAudioService,
}));

vi.mock('@/lib/editron/services/media/analysis-service', () => ({
  sampleVideoClip: mocks.sampleVideoClip,
  sendVideoToGemini: mocks.sendVideoToGemini,
}));

import { createTools } from '@/lib/editron/agent/tools';
import { projectService } from '@/lib/editron/services/project-service';

const BASE_PROJECT = {
  projectId: 'proj_analysis_tools',
  userId: 'user_analysis_tools',
  name: 'Analysis tool fixture',
  aspectRatio: '16:9',
  playerDimensions: { width: 1280, height: 720 },
  fps: 30,
  durationInFrames: 900,
  createdAt: new Date('2026-07-18T00:00:00.000Z'),
  updatedAt: new Date('2026-07-18T00:00:00.000Z'),
  visibility: 'private',
};

function loadWith(overlays: Array<Record<string, any>>) {
  vi.spyOn(projectService, 'loadProject').mockResolvedValue({
    ...BASE_PROJECT,
    overlays: structuredClone(overlays),
  } as any);
}

function toolNamed(name: string) {
  const candidate = createTools('user_analysis_tools', 'proj_analysis_tools')
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

describe('chat deep-analysis tool contracts', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('analyzes the explicitly requested audio asset and exact time window', async () => {
    loadWith([
      { id: 1, type: 'video', assetId: 'asset-wrong', name: 'Opening.mp4', from: 0, durationInFrames: 900 },
      { id: 2, type: 'sound', assetId: 'asset-interview', name: 'Interview.wav', from: 0, durationInFrames: 900 },
    ]);
    mocks.analyzeClipAudioService.mockResolvedValue({
      summary: { clarity: 'clean except one pause' },
      silenceGapsFrames: [{ startFrame: 180, endFrame: 210 }],
      fillers: [{ word: 'um', startFrame: 230, endFrame: 235 }],
      problematicFrames: [{ startFrame: 180, endFrame: 210, reason: 'long silence' }],
    });

    const result = parseEnvelope(await toolNamed('analyze_clip_audio').invoke({
      assetId: 'asset-interview',
      startTime: '00:05',
      endTime: '00:10',
    }));

    expect(result, JSON.stringify(result)).toMatchObject({
      status: 'success',
      data: {
        type: 'audio',
        analyzedOverlay: { id: 2, assetId: 'asset-interview', type: 'sound' },
        startFrame: 150,
        endFrame: 300,
        timestamps: { start: '00:05', end: '00:10' },
        message: 'Detected 1 removable audio segments',
      },
    });
    expect(mocks.analyzeClipAudioService).toHaveBeenCalledWith({
      projectId: 'proj_analysis_tools',
      userId: 'user_analysis_tools',
      source: 'asset',
      assetId: 'asset-interview',
      startFrame: 150,
      endFrame: 300,
      timelineStartFrame: 150,
      fps: 30,
    });
  });

  it('samples moved audio from source time and returns findings in edited-timeline time', async () => {
    loadWith([{
      id: 3,
      type: 'sound',
      assetId: 'asset-moved-interview',
      name: 'Moved interview.wav',
      from: 300,
      durationInFrames: 300,
      startFromSound: 90,
    }]);
    mocks.analyzeClipAudioService.mockResolvedValue({
      summary: { clarity: 'one pause' },
      silenceGapsFrames: [{ startFrame: 330, endFrame: 360 }],
      fillers: [],
      problematicFrames: [{ startFrame: 330, endFrame: 360, reason: 'long silence' }],
    });

    const result = parseEnvelope(await toolNamed('analyze_clip_audio').invoke({
      assetId: 'asset-moved-interview',
    }));

    expect(result, JSON.stringify(result)).toMatchObject({
      status: 'success',
      data: {
        analyzedOverlay: { id: 3, assetId: 'asset-moved-interview' },
        startFrame: 300,
        endFrame: 600,
        silenceGapsFrames: [{ startFrame: 330, endFrame: 360 }],
      },
    });
    expect(mocks.analyzeClipAudioService).toHaveBeenCalledWith({
      projectId: 'proj_analysis_tools',
      userId: 'user_analysis_tools',
      source: 'asset',
      assetId: 'asset-moved-interview',
      startFrame: 90,
      endFrame: 390,
      timelineStartFrame: 300,
      fps: 30,
    });
  });

  it('samples the named visual clip in source time and maps one-fps findings back to timeline frames', async () => {
    loadWith([
      { id: 10, type: 'video', assetId: 'asset-interview', name: 'Interview.mp4', from: 0, durationInFrames: 300 },
      {
        id: 11,
        type: 'video',
        assetId: 'asset-broll',
        name: 'b-roll',
        from: 300,
        durationInFrames: 300,
        videoStartTime: 120,
      },
    ]);
    mocks.resolveAssetUrl.mockResolvedValue('https://cdn.example.com/b-roll.mp4');
    mocks.sampleVideoClip.mockResolvedValue('D:/tmp/sample-b-roll.mp4');
    mocks.sendVideoToGemini.mockResolvedValue({
      sceneChanges: [1, 4],
      deadVisualRanges: [[2, 3]],
      gestures: [{ label: 'hands demonstrate product', frame: 2 }],
      onScreenText: [{ text: 'NEW', frame: 3 }],
      summary: 'Product detail B-roll with hand movement.',
      theme: 'product-demo',
    });

    const result = parseEnvelope(await toolNamed('analyze_clip_video').invoke({ target: 'b-roll' }));

    expect(result, JSON.stringify(result)).toMatchObject({
      status: 'success',
      data: {
        analyzedOverlay: { id: 11, name: 'b-roll', from: 300, durationInFrames: 300 },
        startFrame: 300,
        endFrame: 600,
        vision: {
          sceneChanges: [330, 420],
          deadVisualRanges: [[360, 390]],
          summary: 'Product detail B-roll with hand movement.',
          theme: 'product-demo',
        },
      },
    });
    expect(mocks.resolveAssetUrl).toHaveBeenCalledWith('asset-broll', 'user_analysis_tools');
    expect(mocks.sampleVideoClip).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'proj_analysis_tools',
      assetId: 'asset-broll',
      assetUrl: 'https://cdn.example.com/b-roll.mp4',
      startFrame: 120,
      endFrame: 420,
      targetSampleFps: 1,
    }));
    expect(mocks.sendVideoToGemini).toHaveBeenCalledWith({
      filePath: 'D:/tmp/sample-b-roll.mp4',
      prompt: '',
    });
  });

  it('does not analyze the first clip when an explicit asset ID is absent from the timeline', async () => {
    loadWith([
      { id: 20, type: 'video', assetId: 'asset-real', name: 'Real clip.mp4', from: 0, durationInFrames: 300 },
    ]);

    const result = parseEnvelope(await toolNamed('analyze_clip_video').invoke({ assetId: 'asset-missing' }));

    expect(result).toMatchObject({
      status: 'error',
      error: { message: 'Requested asset asset-missing is not present on this project timeline.' },
    });
    expect(mocks.resolveAssetUrl).not.toHaveBeenCalled();
    expect(mocks.sampleVideoClip).not.toHaveBeenCalled();
    expect(mocks.sendVideoToGemini).not.toHaveBeenCalled();
  });

  it('fails ambiguous multi-clip analysis instead of silently selecting the first clip', async () => {
    loadWith([
      { id: 30, type: 'video', assetId: 'asset-a', name: 'Angle A.mp4', from: 0, durationInFrames: 300 },
      { id: 31, type: 'video', assetId: 'asset-b', name: 'Angle B.mp4', from: 300, durationInFrames: 300 },
    ]);

    const result = parseEnvelope(await toolNamed('analyze_clip_video').invoke({}));

    expect(result).toMatchObject({
      status: 'error',
      error: { message: 'Analysis target is ambiguous across 2 media overlays. Resolve or select one clip before analysis.' },
    });
    expect(mocks.sampleVideoClip).not.toHaveBeenCalled();
  });
});
