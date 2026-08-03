import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Wav2Vec service source-analysis boundary', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      MODAL_TOKEN_ID: 'test-token',
      MODAL_TOKEN_SECRET: 'test-secret',
      MODAL_WAV2VEC_ENDPOINT: 'https://modal.test/analyze',
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it('sends every segment in one request so Modal downloads the source once', async () => {
    const segments = Array.from({ length: 45 }, (_, index) => ({
      startMs: index * 1_000,
      endMs: index * 1_000 + 800,
    }));
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        segments: body.segments.map((segment: { start_ms: number; end_ms: number }) => ({
          ...segment,
          emotion_intensity: 0.7,
          emotional_valence: 'positive',
          energy: 0.6,
          pitch_variability: 0.5,
          stress_detected: false,
          filler_confidence: 0.1,
        })),
        model_version: 'wav2vec-test',
        processing_time_ms: 42,
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { analyzeAudioWithWav2Vec } = await import('@/lib/editron/services/wav2vec-service');
    const result = await analyzeAudioWithWav2Vec('https://cdn.test/long-source.mp4', segments);

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.audio_url).toBe('https://cdn.test/long-source.mp4');
    expect(request.segments).toHaveLength(45);
    expect(result).toMatchObject({
      modelVersion: 'wav2vec-test',
      processingTimeMs: 42,
      segments: expect.arrayContaining([
        expect.objectContaining({ startMs: 0, endMs: 800, emotionalValence: 'positive' }),
      ]),
    });
  });

  it('does not invent vocal evidence when the worker returns no segments', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ segments: [] }), { status: 200 })));
    const { analyzeAudioWithWav2Vec } = await import('@/lib/editron/services/wav2vec-service');

    await expect(analyzeAudioWithWav2Vec(
      'https://cdn.test/silent.mp4',
      [{ startMs: 0, endMs: 1_000 }],
    )).resolves.toBeNull();
  });
});
