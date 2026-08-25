import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  analyzeMusicContent,
  EDITRON_MODAL_MUSIC_ANALYSIS_ENDPOINT_ENV_V1,
  isMusicAnalysisConfiguredV1,
  type MusicAnalysisFetchV1,
} from '@/lib/editron/services/music-analysis-service';
import {
  EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1,
  EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1,
} from '@/lib/editron/services/modal-proxy-auth-v1';

const okResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, statusText: 'OK', json: async () => body }) as unknown as Response;

const environmentNames = [
  EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1,
  EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1,
  EDITRON_MODAL_MUSIC_ANALYSIS_ENDPOINT_ENV_V1,
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

describe('analyzeMusicContent', () => {
  beforeEach(() => {
    process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1] = 'proxy-id';
    process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1] = 'proxy-secret';
    delete process.env[EDITRON_MODAL_MUSIC_ANALYSIS_ENDPOINT_ENV_V1];
    delete process.env.MODAL_TOKEN_ID;
    delete process.env.MODAL_TOKEN_SECRET;
  });

  afterEach(() => {
    restoreEnvironment();
  });

  it('maps the snake_case worker response and sends dedicated Modal proxy headers', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: MusicAnalysisFetchV1 = async (url, init) => {
      calls.push({ url: String(url), init: init as RequestInit });
      return okResponse({
        bpm: 128,
        beats: [{ timestamp_ms: 1000, strength: 0.8 }],
        sections: [{ start_ms: 0, end_ms: 9000, label: 'Chorus!' }],
        music_presence: 0.9,
        key: 'C major',
        energy_curve: [0.2, 0.8],
        duration_ms: 9000,
        processing_time_ms: 12,
      });
    };

    await expect(analyzeMusicContent('https://storage.example.test/audio.mp4', undefined, { fetchImpl }))
      .resolves.toMatchObject({
        bpm: 128,
        beats: [{ timestampMs: 1000, strength: 0.8 }],
        sections: [{ startMs: 0, endMs: 9000, label: 'chorus' }],
        musicPresence: 0.9,
        key: 'C major',
        energyCurve: [0.2, 0.8],
        durationMs: 9000,
      });

    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      audio_url: 'https://storage.example.test/audio.mp4',
    });
    expect(calls[0].init.headers).toMatchObject({
      'Modal-Key': 'proxy-id',
      'Modal-Secret': 'proxy-secret',
    });
    expect(calls[0].init.headers).not.toHaveProperty('Authorization');
  });

  it('returns null without a fetch when dedicated credentials are absent or endpoint trust fails', async () => {
    delete process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1];
    delete process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1];
    process.env.MODAL_TOKEN_ID = 'generic-token-must-not-authorize';
    process.env.MODAL_TOKEN_SECRET = 'generic-secret-must-not-authorize';
    let called = false;
    const fetchImpl: MusicAnalysisFetchV1 = async () => {
      called = true;
      return okResponse({});
    };

    await expect(analyzeMusicContent('https://storage.example.test/audio.mp4', undefined, { fetchImpl }))
      .resolves.toBeNull();
    expect(called).toBe(false);
    expect(isMusicAnalysisConfiguredV1()).toBe(false);

    process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1] = 'proxy-id';
    process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1] = 'proxy-secret';
    process.env[EDITRON_MODAL_MUSIC_ANALYSIS_ENDPOINT_ENV_V1] = 'https://attacker.example.test';
    await expect(analyzeMusicContent('https://storage.example.test/audio.mp4', undefined, { fetchImpl }))
      .resolves.toBeNull();
    expect(called).toBe(false);
    expect(isMusicAnalysisConfiguredV1()).toBe(false);
  });

  it('returns null for a non-OK response, a malformed response, or a failed request', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const nonOk: MusicAnalysisFetchV1 = async () =>
      ({ ok: false, status: 503, statusText: 'unavailable' }) as Response;
    await expect(analyzeMusicContent('https://storage.example.test/audio.mp4', undefined, { fetchImpl: nonOk }))
      .resolves.toBeNull();

    const malformed: MusicAnalysisFetchV1 = async () => okResponse({ bpm: 'not-a-number' });
    await expect(analyzeMusicContent('https://storage.example.test/audio.mp4', undefined, { fetchImpl: malformed }))
      .resolves.toBeNull();

    const failed: MusicAnalysisFetchV1 = async () => {
      throw new Error('network request includes a presigned URL');
    };
    await expect(analyzeMusicContent('https://storage.example.test/audio.mp4', undefined, { fetchImpl: failed }))
      .resolves.toBeNull();
    expect(warning.mock.calls.flat().join(' ')).not.toContain('presigned URL');
  });
});
