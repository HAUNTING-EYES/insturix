import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  analyzeContent: vi.fn(),
  analysisToTimelineFrames: vi.fn(),
  getTranscription: vi.fn(),
  getWordsInRange: vi.fn(),
  getAsset: vi.fn(),
  getUserAssets: vi.fn(),
  modelInvoke: vi.fn(),
  searchUserAssets: vi.fn(),
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
    getAsset: mocks.getAsset,
    getUserAssets: mocks.getUserAssets,
  },
}));

vi.mock('@/lib/editron/services/asset-search-service', () => ({
  searchUserAssets: mocks.searchUserAssets,
}));

vi.mock('@/lib/editron/services/media', () => ({
  analyzeContent: mocks.analyzeContent,
  analysisToTimelineFrames: mocks.analysisToTimelineFrames,
  getTranscription: mocks.getTranscription,
  getWordsInRange: mocks.getWordsInRange,
}));

import { createTools } from '@/lib/editron/agent/tools';
import { createChatAssetTools } from '@/lib/editron/agent/chat-asset-tools';
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

function loadWith(
  overlays: Array<Record<string, any>>,
  overrides: Record<string, unknown> = {},
) {
  return vi.spyOn(projectService, 'loadProject').mockResolvedValue({
    ...BASE_PROJECT,
    overlays: structuredClone(overlays),
    ...overrides,
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

  it('keeps resolver useWith authorization at the top level of the tool envelope data', async () => {
    loadWith([{
      id: 20,
      type: 'caption',
      from: 0,
      durationInFrames: 180,
      words: [
        { word: 'this', startFrame: 30, endFrame: 36 },
        { word: 'is', startFrame: 36, endFrame: 42 },
        { word: 'the', startFrame: 42, endFrame: 48 },
        { word: 'key', startFrame: 48, endFrame: 54 },
        { word: 'point', startFrame: 54, endFrame: 60 },
      ],
    }]);

    const result = parseEnvelope(await toolNamed('resolve_sticker_overlay').invoke({
      query: 'this is the key point',
      description: 'small animated lightbulb sticker',
      durationFrames: 30,
    }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        status: 'ready',
        useWith: {
          generate_html_sticker: {
            start: 30,
            duration: 30,
            description: 'small animated lightbulb sticker',
          },
        },
      },
      error: null,
    });
    expect(result.data).not.toHaveProperty('data');
  });

  it('resolves an exact uploaded asset id and preserves replacement targeting', async () => {
    loadWith([{
      id: 77,
      type: 'video',
      assetId: 'asset-current',
      from: 0,
      durationInFrames: 180,
    }]);
    mocks.getAsset.mockResolvedValue({
      assetId: 'asset-replacement',
      userId: 'user_speech_caption',
      type: 'video',
      filename: 'replacement.mp4',
      source: 'user-upload',
      gcsPath: null,
      cachedUrl: '',
      urlExpiresAt: new Date('2026-07-18T01:00:00.000Z'),
      size: 1024,
      duration: 6,
      uploadedAt: new Date('2026-07-18T00:00:00.000Z'),
    });
    const resolver = createChatAssetTools({
      userId: 'user_speech_caption',
      projectId: 'proj_speech_caption',
    }).find((tool) => tool.name === 'resolve_user_asset_overlay');
    expect(resolver).toBeDefined();

    const result = parseEnvelope(await (resolver as unknown as {
      invoke: (input: Record<string, unknown>) => Promise<string>;
    }).invoke({
      query: 'asset-replacement',
      operation: 'replace',
      targetOverlayId: 77,
      sourceStartFrame: 24,
    }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        operation: 'replace',
        candidate: {
          assetId: 'asset-replacement',
          matchReasons: ['direct-asset-id'],
        },
        useWith: {
          use_matching_footage: {
            overlayId: 77,
            assetId: 'asset-replacement',
            sourceStartFrame: 24,
          },
        },
      },
    });
    expect(mocks.getAsset).toHaveBeenCalledWith('asset-replacement', 'user_speech_caption');
    expect(mocks.searchUserAssets).not.toHaveBeenCalled();
    expect(mocks.getUserAssets).not.toHaveBeenCalled();
  });

  it('creates project captions without requiring one source-video id', async () => {
    loadWith([{
      id: 30,
      type: 'video',
      assetId: 'asset-caption',
      from: 0,
      durationInFrames: 180,
    }], {
      rawFootageAnalysis: {
        timelineCoordinateSpace: 'canonical-edited-v1',
        originalDurationMs: 6_000,
        transcription: {
          words: [
            { word: 'fresh', startMs: 100, endMs: 420 },
            { word: 'captions', startMs: 480, endMs: 900 },
            { word: 'follow', startMs: 980, endMs: 1_300 },
            { word: 'the', startMs: 1_360, endMs: 1_500 },
            { word: 'edit', startMs: 1_560, endMs: 1_900 },
          ],
        },
      },
    });
    const replace = vi.spyOn(projectService, 'replaceOverlayFamilyAtomic').mockResolvedValue(true);

    const result = parseEnvelope(await toolNamed('add_captions').invoke({
      style: 'minimal',
      overwrite: true,
    }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        producer: 'canonical-caption-track',
        style: 'minimal',
        captionCount: expect.any(Number),
      },
    });
    expect(replace).toHaveBeenCalledOnce();
    expect(vi.mocked(replace).mock.calls[0][2].overlays).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'caption',
          metadata: expect.objectContaining({ source: 'canonical-caption-track' }),
        }),
      ]),
    );
  });

  it('refreshes the project caption track through the canonical timeline owner and one atomic write', async () => {
    const video = { id: 30, type: 'video', assetId: 'asset-caption', from: 90, durationInFrames: 180 };
    const caption = {
      id: 31,
      type: 'caption',
      sourceVideoId: 30,
      from: 0,
      durationInFrames: 180,
      captions: [{ text: 'old', startMs: 0, endMs: 500 }],
    };
    loadWith([video, caption], {
      rawFootageAnalysis: {
        timelineCoordinateSpace: 'canonical-edited-v1',
        originalDurationMs: 12_000,
        transcription: {
          words: [
            { word: 'fresh', startMs: 3_000, endMs: 3_400 },
            { word: 'caption', startMs: 3_450, endMs: 3_900 },
            { word: 'timing', startMs: 4_000, endMs: 4_400 },
            { word: 'after', startMs: 4_500, endMs: 4_800 },
            { word: 'the', startMs: 4_850, endMs: 5_000 },
            { word: 'cut', startMs: 5_050, endMs: 5_350 },
          ],
        },
      },
    });
    const replace = vi.spyOn(projectService, 'replaceOverlayFamilyAtomic').mockResolvedValue(true);
    const remove = vi.spyOn(projectService, 'deleteOverlay').mockResolvedValue();
    const add = vi.spyOn(projectService, 'addOverlayAtRevisionV1').mockResolvedValue({
      mutationReceipt: {},
      timelineChangeReceipt: {},
    } as any);

    const result = parseEnvelope(await toolNamed('refresh_captions').invoke({
      captionOverlayId: 31,
      newStyle: 'corporate',
    }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        captionId: 31,
        style: 'corporate',
        producer: 'canonical-caption-track',
      },
    });
    expect(replace).toHaveBeenCalledWith(
      'user_speech_caption',
      'proj_speech_caption',
      expect.objectContaining({
        expectedUpdatedAt: BASE_PROJECT.updatedAt,
        overlays: expect.any(Array),
      }),
    );
    const persisted = vi.mocked(replace).mock.calls[0][2].overlays;
    expect(persisted.filter((overlay: any) => overlay.type === 'caption')).toHaveLength(1);
    expect(persisted.find((overlay: any) => overlay.type === 'caption')).toMatchObject({
      id: 31,
      from: 0,
      durationInFrames: 360,
      template: 'corporate',
      metadata: { source: 'canonical-caption-track' },
    });
    expect(remove).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('restyles manual caption content through canonical fit, contrast, and safe placement', async () => {
    const caption = {
      id: 32,
      type: 'caption',
      from: 0,
      durationInFrames: 360,
      captions: [{ text: 'Keep this exact sentence.', startMs: 0, endMs: 2_000 }],
      styles: {
        fontFamily: 'font-sans',
        fontSize: '32px',
        fontWeight: 400,
        color: '#ffffff',
        textAlign: 'center',
        lineHeight: 1.2,
        highlight: {
          color: '#ffffff',
          backgroundColor: 'transparent',
          scale: 1,
          effect: 'none',
          animation: 'none',
        },
      },
    };
    loadWith([caption], {
      genreParametersSignalComputed: {
        formality: 0.1,
        energy_baseline: 0.95,
        pacing_tolerance: 3,
      },
    });
    const replace = vi.spyOn(projectService, 'replaceOverlayFamilyAtomic').mockResolvedValue(true);
    const update = vi.spyOn(projectService, 'updateOverlay').mockResolvedValue();

    const result = parseEnvelope(await toolNamed('batch_edit_captions').invoke({
      style: 'minimal',
      fontSize: '200px',
      color: '#000000',
      backgroundColor: '#000000',
      position: 'top',
      fontFamily: 'cursive',
      fontWeight: 700,
      textCase: 'sentence',
    }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        modified: 1,
        total: 1,
        style: 'minimal',
        producer: 'canonical-caption-track',
        styleAudit: {
          adjustments: expect.arrayContaining([
            'font-size-clamped-to-readable-fit',
            'text-color-adjusted-for-wcag-aa',
            'font-family-rejected-for-readability',
          ]),
        },
      },
    });
    const persisted = vi.mocked(replace).mock.calls[0][2].overlays;
    const styled = persisted.find((overlay: any) => overlay.id === 32) as any;
    expect(styled).toBeDefined();
    expect(styled.captions).toEqual(caption.captions);
    expect(styled.template).toBe('minimal');
    expect(styled.styles).toMatchObject({
      color: '#ffffff',
      fontWeight: 700,
      textTransform: 'none',
    });
    expect(styled.styles.fontSize).not.toBe('200px');
    expect(styled.styles.fontFamily).not.toBe('cursive');
    expect(styled.metadata).toMatchObject({
      captionPresentationOwner: 'canonical-caption-track',
      evidence: { selectedRegion: 'top-center' },
    });
    const centerY = (styled.top + (styled.height / 2)) / BASE_PROJECT.playerDimensions.height;
    expect(centerY).toBeGreaterThanOrEqual(0.1);
    expect(centerY).toBeLessThanOrEqual(0.8);
    expect(update).not.toHaveBeenCalled();
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
