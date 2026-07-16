import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChatTranscriptTools } from '@/lib/editron/agent/chat-transcript-tools';
import { getTranscription, hasUsableWordTimings } from '@/lib/editron/services/media/transcription-service';

const mocks = vi.hoisted(() => ({
  loadProject: vi.fn(),
  getTranscription: vi.fn(),
  getDatabase: vi.fn(),
}));

vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: { loadProject: mocks.loadProject },
}));

vi.mock('@/lib/editron/services/media', () => ({
  getTranscription: mocks.getTranscription,
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MEDIA_ASSETS: 'mediaAssets' },
  getDatabase: mocks.getDatabase,
}));

vi.mock('@/lib/financials/provider-cost-events', () => ({
  recordProviderCostEvent: vi.fn(),
}));

vi.mock('@/lib/editron/services/r2-service', () => ({
  isR2Available: () => false,
  getR2PresignedReadUrl: vi.fn(),
}));

const DEVANAGARI = {
  thisWord: '\u092f\u0939',
  story: '\u0915\u0939\u093e\u0928\u0940',
  important: '\u092e\u0939\u0924\u094d\u0935\u092a\u0942\u0930\u094d\u0923',
  isWord: '\u0939\u0948',
} as const;

function findTranscriptTool() {
  const tools = createChatTranscriptTools({ userId: 'user-1', projectId: 'project-1' });
  const tool = tools.find((candidate) => candidate.name === 'find_transcript_moment');
  if (!tool) throw new Error('find_transcript_moment tool missing');
  return tool;
}

describe('chat transcript grounding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadProject.mockResolvedValue({
      projectId: 'project-1',
      fps: 30,
      durationInFrames: 300,
      overlays: [{ id: 1, type: 'video', assetId: 'asset-1', from: 0, durationInFrames: 300 }],
    });
  });

  it('resolves a Devanagari transcript reference without a user timestamp', async () => {
    mocks.getTranscription.mockResolvedValue({
      transcript: Object.values(DEVANAGARI).join(' '),
      words: [
        { word: DEVANAGARI.thisWord, startMs: 500, endMs: 700, confidence: 0.98 },
        { word: DEVANAGARI.story, startMs: 700, endMs: 1100, confidence: 0.98 },
        { word: DEVANAGARI.important, startMs: 1100, endMs: 1600, confidence: 0.98 },
        { word: DEVANAGARI.isWord, startMs: 1600, endMs: 1800, confidence: 0.98 },
      ],
      language: 'hi',
      confidence: 0.98,
      generatedAt: new Date(),
    });

    const query = `${DEVANAGARI.story} ${DEVANAGARI.important}`;
    const output = JSON.parse(await findTranscriptTool().invoke({
      query,
      includeCaptions: false,
      forceRefresh: false,
      limit: 5,
      minConfidence: 0.42,
    }));

    expect(output.status).toBe('success');
    expect(output.data.candidates.length).toBeGreaterThan(0);
    expect(output.data.candidates[0]).toMatchObject({
      text: query,
      startFrame: 21,
      endFrame: 48,
      matchType: 'phrase',
    });
  });

  it('uses explicit caption startMs/endMs instead of collapsing a word to one frame', async () => {
    mocks.loadProject.mockResolvedValue({
      projectId: 'project-1',
      fps: 30,
      durationInFrames: 300,
      overlays: [{
        id: 2,
        type: 'caption',
        from: 0,
        durationInFrames: 300,
        words: [{ word: 'pricing', startMs: 1000, endMs: 1600, confidence: 0.95 }],
      }],
    });

    const output = JSON.parse(await findTranscriptTool().invoke({
      query: 'pricing',
      includeCaptions: true,
      forceRefresh: false,
      limit: 5,
      minConfidence: 0.42,
    }));

    expect(output.data.candidates[0]).toMatchObject({ startFrame: 30, endFrame: 48 });
  });

  it('rejects a cached transcript that has words but no usable timing', () => {
    expect(hasUsableWordTimings({
      transcript: 'pricing is simple',
      words: [{ word: 'pricing' }, { word: 'is' }, { word: 'simple' }],
    })).toBe(false);
  });

  it('accepts complete monotonic word timing for internal phrase grounding', () => {
    expect(hasUsableWordTimings({
      transcript: 'pricing is simple',
      words: [
        { word: 'pricing', startMs: 100, endMs: 500 },
        { word: 'is', startMs: 500, endMs: 620 },
        { word: 'simple', startMs: 620, endMs: 1000 },
      ],
    })).toBe(true);
  });

  it('regenerates an untimed cache before serving a word-level request', async () => {
    const updateOne = vi.fn().mockResolvedValue({ acknowledged: true });
    const asset = {
      assetId: 'voiceover-1',
      userId: 'user-1',
      type: 'audio',
      source: 'generated',
      durationMs: 2000,
      cachedUrl: 'https://cdn.example.com/voiceover-1.mp3',
      transcription: {
        transcript: 'pricing is simple',
        words: [{ word: 'pricing' }, { word: 'is' }, { word: 'simple' }],
      },
    };
    const collections = {
      mediaAssets: {
        findOne: vi.fn().mockResolvedValue(asset),
        updateOne,
      },
      storyboards: {
        findOne: vi.fn().mockResolvedValue({
          scenes: [{
            voiceover: { audioAssetId: 'voiceover-1' },
            descriptor: { narration: 'pricing is simple' },
          }],
        }),
      },
    };
    mocks.getDatabase.mockResolvedValue({
      collection: vi.fn((name: keyof typeof collections) => collections[name]),
    });
    const originalFetch = globalThis.fetch;
    const originalXaiKey = process.env.XAI_API_KEY;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://api.x.ai/v1/stt') {
        return new Response(JSON.stringify({
          text: 'pricing is simple',
          language: 'en',
          duration: 1,
          words: [
            { text: 'pricing', start: 0.1, end: 0.5 },
            { text: 'is', start: 0.5, end: 0.62 },
            { text: 'simple', start: 0.62, end: 1 },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;
    process.env.XAI_API_KEY = 'test-xai-key';

    try {
      const transcription = await getTranscription('voiceover-1', 'user-1', {
        preferWordLevel: true,
      });

      expect(hasUsableWordTimings(transcription)).toBe(true);
      expect(transcription.words.map((word) => [word.startMs, word.endMs])).toEqual([
        [100, 500],
        [500, 620],
        [620, 1000],
      ]);
      expect(fetchMock).toHaveBeenCalledWith('https://api.x.ai/v1/stt', expect.objectContaining({ method: 'POST' }));
      expect(updateOne).toHaveBeenCalledWith(
        { assetId: 'voiceover-1', userId: 'user-1' },
        { $set: { transcription } },
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (originalXaiKey == null) delete process.env.XAI_API_KEY;
      else process.env.XAI_API_KEY = originalXaiKey;
    }
  });
});
