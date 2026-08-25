import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  analyzeAudioWithWav2Vec,
  EDITRON_MODAL_WAV2VEC_ENDPOINT_ENV_V1,
  isWav2VecConfiguredV1,
  type Wav2VecFetchV1,
} from '@/lib/editron/services/wav2vec-service';
import {
  EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1,
  EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1,
} from '@/lib/editron/services/modal-proxy-auth-v1';

const environmentNames = [
  EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1,
  EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1,
  EDITRON_MODAL_WAV2VEC_ENDPOINT_ENV_V1,
  'MODAL_TOKEN_ID',
  'MODAL_TOKEN_SECRET',
] as const;
const originalEnvironment = Object.fromEntries(
  environmentNames.map((name) => [name, process.env[name]]),
);

function restoreEnvironment(): void {
  for (const name of environmentNames) {
    const value = originalEnvironment[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

describe('Wav2Vec service source-analysis boundary', () => {
  beforeEach(() => {
    process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1] = 'proxy-id';
    process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1] = 'proxy-secret';
    delete process.env[EDITRON_MODAL_WAV2VEC_ENDPOINT_ENV_V1];
    delete process.env.MODAL_TOKEN_ID;
    delete process.env.MODAL_TOKEN_SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnvironment();
  });

  it('sends every segment in one request so Modal downloads the source once', async () => {
    const segments = Array.from({ length: 45 }, (_, index) => ({
      startMs: index * 1_000,
      endMs: index * 1_000 + 800,
    }));
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock: Wav2VecFetchV1 = async (url, init) => {
      calls.push({ url: String(url), init: init as RequestInit });
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
    };
    const result = await analyzeAudioWithWav2Vec(
      'https://cdn.test/long-source.mp4',
      segments,
      { fetchImpl: fetchMock },
    );

    expect(calls).toHaveLength(1);
    const request = JSON.parse(String(calls[0].init.body));
    expect(request.audio_url).toBe('https://cdn.test/long-source.mp4');
    expect(request.segments).toHaveLength(45);
    expect(calls[0].init.headers).toMatchObject({
      'Modal-Key': 'proxy-id',
      'Modal-Secret': 'proxy-secret',
    });
    expect(calls[0].init.headers).not.toHaveProperty('Authorization');
    expect(isWav2VecConfiguredV1()).toBe(true);
    expect(result).toMatchObject({
      modelVersion: 'wav2vec-test',
      processingTimeMs: 42,
      segments: expect.arrayContaining([
        expect.objectContaining({ startMs: 0, endMs: 800, emotionalValence: 'positive' }),
      ]),
    });
  });

  it('does not fetch with generic credentials or a foreign endpoint', async () => {
    delete process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1];
    delete process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1];
    process.env.MODAL_TOKEN_ID = 'generic-token-must-not-authorize';
    process.env.MODAL_TOKEN_SECRET = 'generic-secret-must-not-authorize';
    let called = false;
    const fetchImpl: Wav2VecFetchV1 = async () => {
      called = true;
      return new Response('{}', { status: 200 });
    };
    await expect(analyzeAudioWithWav2Vec(
      'https://cdn.test/silent.mp4',
      [{ startMs: 0, endMs: 1_000 }],
      { fetchImpl },
    )).resolves.toBeNull();
    expect(called).toBe(false);
    expect(isWav2VecConfiguredV1()).toBe(false);

    process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1] = 'proxy-id';
    process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1] = 'proxy-secret';
    process.env[EDITRON_MODAL_WAV2VEC_ENDPOINT_ENV_V1] = 'https://attacker.example.test';
    await expect(analyzeAudioWithWav2Vec(
      'https://cdn.test/silent.mp4',
      [{ startMs: 0, endMs: 1_000 }],
      { fetchImpl },
    )).resolves.toBeNull();
    expect(called).toBe(false);
    expect(isWav2VecConfiguredV1()).toBe(false);
  });

  it('does not invent vocal evidence from empty, malformed, or failed responses', async () => {
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const empty: Wav2VecFetchV1 = async () =>
      new Response(JSON.stringify({ segments: [] }), { status: 200 });
    await expect(analyzeAudioWithWav2Vec(
      'https://cdn.test/silent.mp4',
      [{ startMs: 0, endMs: 1_000 }],
      { fetchImpl: empty },
    )).resolves.toBeNull();

    const malformed: Wav2VecFetchV1 = async () =>
      new Response(JSON.stringify({ segments: [{ start_ms: 'not-a-number' }] }), { status: 200 });
    await expect(analyzeAudioWithWav2Vec(
      'https://cdn.test/silent.mp4',
      [{ startMs: 0, endMs: 1_000 }],
      { fetchImpl: malformed },
    )).resolves.toBeNull();

    const failed: Wav2VecFetchV1 = async () => {
      throw new Error('request failed for presigned URL');
    };
    await expect(analyzeAudioWithWav2Vec(
      'https://cdn.test/silent.mp4',
      [{ startMs: 0, endMs: 1_000 }],
      { fetchImpl: failed },
    )).resolves.toBeNull();
    expect(warning.mock.calls.flat().join(' ')).not.toContain('presigned URL');
  });
});
