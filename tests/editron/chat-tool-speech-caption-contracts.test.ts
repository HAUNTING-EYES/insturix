import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  analyzeContent: vi.fn(),
  analysisToTimelineFrames: vi.fn(),
  getTranscription: vi.fn(),
  getWordsInRange: vi.fn(),
  modelInvoke: vi.fn(),
  refreshCaptions: vi.fn(),
}));

vi.hoisted(() => {
  process.env.MONGODB_URI ??= 'mongodb://localhost:27017/editron-test';
  process.env.MONGODB_DB_NAME ??= 'editron-test';
});

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class ChatGoogleGenerativeAIFixture {
    invoke(...args: unknown[]) {
      return mocks.modelInvoke(...args);
    }
  },
}));

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: T[]) => structuredClone(overlays),
    resolveAssetUrl: vi.fn(async () => 'https://cdn.example.com/resolved.mp4'),
  },
}));

vi.mock('@/lib/editron/services/media', () => ({
  analyzeContent: mocks.analyzeContent,
  analysisToTimelineFrames: mocks.analysisToTimelineFrames,
  getTranscription: mocks.getTranscription,
  getWordsInRange: mocks.getWordsInRange,
  refreshCaptions: mocks.refreshCaptions,
}));

import { createTools } from '@/lib/editron/agent/tools';
import { projectService } from '@/lib/editron/services/project-service';

const BASE_PROJECT = {
  projectId: 'proj_speech_caption',
  userId: 'user_speech_caption',
  name: 'Speech and caption fixture',
  aspectRatio: '16:9',
  playerDimensions: { width: 1280, height: 720 },
  fps: 30,
  durationInFrames: 360,
  overlays: [] as Array<Record<string, any>>,
  createdAt: new Date('2026-07-18T00:00:00.000Z'),
  updatedAt: new Date('2026-07-18T00:00:00.000Z'),
  visibility: 'private',
};

function toolNamed(name: string) {
  const candidate = createTools('user_speech_caption', 'proj_speech_caption')
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

function loadWith(overlays: Array<Record<string, any>>) {
  return vi.spyOn(projectService, 'loadProject').mockResolvedValue({
    ...BASE_PROJECT,
    overlays: structuredClone(overlays),
  } as any);
}

describe('chat speech and caption tool contracts', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds timeline transcription in edited clip order using each source-time window', async () => {
    loadWith([
      { id: 1, type: 'video', assetId: 'asset-a', from: 60, durationInFrames: 60, videoStartTime: 30 },
      { id: 2, type: 'video', assetId: 'asset-b', from: 0, durationInFrames: 60, videoStartTime: 0 },
    ]);
    mocks.getTranscription.mockImplementation(async (assetId: string) => assetId === 'asset-a'
      ? {
          transcript: 'unused source words namaste dosto',
          words: [
            { word: 'unused', startMs: 200, endMs: 500 },
            { word: 'namaste', startMs: 1100, endMs: 1400 },
            { word: 'dosto', startMs: 1500, endMs: 1800 },
          ],
          language: 'hi-en',
          confidence: 0.97,
        }
      : {
          transcript: 'aaj shuru karte hain',
          words: [
            { word: 'aaj', startMs: 100, endMs: 350 },
            { word: 'shuru', startMs: 500, endMs: 850 },
            { word: 'karte', startMs: 1000, endMs: 1300 },
            { word: 'hain', startMs: 1400, endMs: 1700 },
          ],
          language: 'hi-en',
          confidence: 0.98,
        });

    const result = parseEnvelope(await toolNamed('get_video_transcription').invoke({ mode: 'timeline' }));

    expect(result, JSON.stringify(result)).toMatchObject({
      status: 'success',
      data: {
        mode: 'timeline',
        clipCount: 2,
        transcript: 'aaj shuru karte hain namaste dosto',
        segments: [
          { clipId: 2, from: 0, transcript: 'aaj shuru karte hain', wordCount: 4 },
          { clipId: 1, from: 60, transcript: 'namaste dosto', wordCount: 2 },
        ],
      },
    });
    expect(mocks.getTranscription).toHaveBeenCalledTimes(2);
  });

  it('returns evidence positions without turning detected speech problems into edit instructions', async () => {
    loadWith([{
      id: 3,
      type: 'video',
      assetId: 'asset-c',
      from: 90,
      durationInFrames: 180,
      videoStartTime: 30,
    }]);
    mocks.analyzeContent.mockResolvedValue({
      silences: [{ startMs: 0, endMs: 700 }],
      fillers: [{ word: 'um', startMs: 2000, endMs: 2200 }],
      summary: { totalSilenceMs: 700, totalFillerWords: 1, potentialSavingsMs: 900 },
    });
    mocks.analysisToTimelineFrames.mockReturnValue({
      problematicFrames: [
        { description: 'silence at opening', startFrame: 92, endFrame: 110 },
        { description: 'filler um', startFrame: 150, endFrame: 165 },
        { description: 'silence at ending', startFrame: 250, endFrame: 270 },
      ],
    });

    const result = parseEnvelope(await toolNamed('analyze_video_content').invoke({
      videoOverlayId: 3,
      silenceThresholdMs: 600,
    }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        silenceCount: 1,
        fillerCount: 1,
        potentialSavingsSeconds: 0.9,
        segments: [
          { type: 'silence', position: 'start', startFrame: 92, endFrame: 110 },
          { type: 'filler', position: 'middle', startFrame: 150, endFrame: 165 },
          { type: 'silence', position: 'end', startFrame: 250, endFrame: 270 },
        ],
      },
    });
    expect(mocks.analysisToTimelineFrames).toHaveBeenCalledWith(
      expect.any(Object),
      90,
      30,
      30,
    );
    expect(result.data).not.toHaveProperty('cuts');
    expect(result.data).not.toHaveProperty('instructions');
  });

  it('regenerates regular captions against the linked video timing and chosen style', async () => {
    const video = { id: 30, type: 'video', assetId: 'asset-caption', from: 90, durationInFrames: 180 };
    const caption = {
      id: 31,
      type: 'caption',
      sourceVideoId: 30,
      from: 0,
      durationInFrames: 180,
      captions: [{ text: 'old', startMs: 0, endMs: 500 }],
    };
    loadWith([video, caption]);
    const remove = vi.spyOn(projectService, 'deleteOverlay').mockResolvedValue();
    const add = vi.spyOn(projectService, 'addOverlay').mockResolvedValue();
    mocks.refreshCaptions.mockResolvedValue({
      ...caption,
      from: 90,
      captions: [
        { text: 'fresh line', startMs: 0, endMs: 800 },
        { text: 'second line', startMs: 800, endMs: 1600 },
      ],
      style: 'corporate',
    });

    const result = parseEnvelope(await toolNamed('refresh_captions').invoke({
      captionOverlayId: 31,
      newStyle: 'corporate',
    }));

    expect(result).toMatchObject({
      status: 'success',
      data: { captionId: 31, captionCount: 2, style: 'corporate' },
    });
    expect(mocks.refreshCaptions).toHaveBeenCalledWith(expect.objectContaining({
      captionOverlay: caption,
      videoOverlay: video,
      fps: 30,
      preserveStyle: false,
      newStyle: 'corporate',
    }));
    expect(remove).toHaveBeenCalledWith('user_speech_caption', 'proj_speech_caption', 31);
    expect(add).toHaveBeenCalledWith('user_speech_caption', 'proj_speech_caption', expect.objectContaining({
      id: 31,
      from: 90,
    }));
  });

  it('refreshes fancy captions in place using the moved clip and source transcript window', async () => {
    const video = {
      id: 40,
      type: 'video',
      assetId: 'asset-fancy',
      from: 90,
      durationInFrames: 180,
      videoStartTime: 30,
      left: 40,
      top: 20,
      width: 1200,
      height: 675,
    };
    const fancy = {
      id: 41,
      type: 'html-scene',
      metadata: { sourceType: 'fancy-caption' },
      sourceVideoId: 40,
      from: 0,
      durationInFrames: 90,
      fancyCaptionConfig: {
        style: 'minimal',
        intensity: 'low',
        segmentStartOffsetFrames: 30,
        segmentDurationFrames: 90,
        maxWords: 15,
        primaryColor: '#FFFFFF',
        accentColor: '#FFE66D',
      },
    };
    loadWith([video, fancy]);
    const update = vi.spyOn(projectService, 'updateOverlay').mockResolvedValue();
    mocks.getTranscription.mockResolvedValue({
      transcript: 'outside make this moment land outside',
      words: [
        { word: 'outside', startMs: 500, endMs: 900 },
        { word: 'make', startMs: 2100, endMs: 2400 },
        { word: 'this', startMs: 2500, endMs: 2750 },
        { word: 'moment', startMs: 2850, endMs: 3300 },
        { word: 'land', startMs: 3400, endMs: 3800 },
        { word: 'outside', startMs: 5200, endMs: 5500 },
      ],
      language: 'en',
      confidence: 0.99,
    });
    mocks.modelInvoke.mockResolvedValue({
      content: '<div><span data-start="100" data-end="400">make</span><span data-start="500" data-end="750">this</span><span data-start="850" data-end="1300">moment</span><span data-start="1400" data-end="1800">land</span></div>',
    });

    const result = parseEnvelope(await toolNamed('refresh_fancy_captions').invoke({
      fancyCaptionOverlayId: 41,
      newStyle: 'kinetic',
      newIntensity: 'high',
    }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        id: 41,
        sourceVideoId: 40,
        style: 'kinetic',
        intensity: 'high',
        wordCount: 4,
        startFrame: 120,
        endFrame: 210,
      },
    });
    expect(update).toHaveBeenCalledWith(
      'user_speech_caption',
      'proj_speech_caption',
      41,
      expect.objectContaining({
        from: 120,
        durationInFrames: 90,
        sourceVideoId: 40,
        left: 40,
        top: 20,
        width: 1200,
        height: 675,
        fancyCaptionConfig: expect.objectContaining({ style: 'kinetic', intensity: 'high' }),
      }),
    );
  });
});
