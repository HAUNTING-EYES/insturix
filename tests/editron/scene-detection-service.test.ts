import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  detectScenesRemote,
  cutDetectionToCutRhythm,
  isSceneDetectionConfiguredV1,
  type FetchImpl,
  type SceneDetectionResult,
} from '@/lib/editron/services/scene-detection-service';
import {
  EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1,
  EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1,
} from '@/lib/editron/services/modal-proxy-auth-v1';

/** Guards the Modal scene-detection client + the cut→rhythm mapping. fetch is injected (no network). */

const okResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, statusText: 'OK', json: async () => body }) as unknown as Response;

const environmentNames = [
  EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1,
  EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1,
  'MODAL_SCENE_DETECTION_ENDPOINT',
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

describe('detectScenesRemote', () => {
  beforeEach(() => {
    process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1] = 'proxy-id';
    process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1] = 'proxy-secret';
    delete process.env.MODAL_SCENE_DETECTION_ENDPOINT;
    delete process.env.MODAL_TOKEN_ID;
    delete process.env.MODAL_TOKEN_SECRET;
  });
  afterEach(() => {
    restoreEnvironment();
  });

  it('maps the snake_case worker response to camelCase', async () => {
    const fetchImpl: FetchImpl = async () =>
      okResponse({ cuts: [{ t_ms: 1833, scene_score: 0.72 }, { t_ms: 3000 }], duration_ms: 22570, scene_threshold: 0.3, processing_time_ms: 900 });
    const res = await detectScenesRemote('https://cdn/x.mp4', { fetchImpl });
    expect(res).toEqual({
      cuts: [{ tMs: 1833, sceneScore: 0.72 }, { tMs: 3000 }],
      durationMs: 22570,
      sceneThreshold: 0.3,
      processingTimeMs: 900,
    });
  });

  it('sends the video_url + threshold and dedicated Modal proxy headers', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: FetchImpl = async (url, init) => {
      calls.push({ url: String(url), init: init as RequestInit });
      return okResponse({ cuts: [], duration_ms: 1000 });
    };
    await detectScenesRemote('https://cdn/x.mp4', { fetchImpl, sceneThreshold: 0.45 });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ video_url: 'https://cdn/x.mp4', scene_threshold: 0.45 });
    expect(calls[0].init.headers).toMatchObject({
      'Modal-Key': 'proxy-id',
      'Modal-Secret': 'proxy-secret',
    });
    expect(calls[0].init.headers).not.toHaveProperty('Authorization');
  });

  it('returns null (degrade) on a non-OK response, a worker error field, or a thrown fetch', async () => {
    expect(await detectScenesRemote('https://cdn/x.mp4', { fetchImpl: async () => ({ ok: false, status: 500, statusText: 'err' }) as Response })).toBeNull();
    expect(await detectScenesRemote('https://cdn/x.mp4', { fetchImpl: async () => okResponse({ error: 'download failed' }) })).toBeNull();
    expect(await detectScenesRemote('https://cdn/x.mp4', { fetchImpl: async () => { throw new Error('network'); } })).toBeNull();
  });

  it('returns null when dedicated proxy credentials are absent or endpoint trust fails', async () => {
    delete process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1];
    delete process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1];
    process.env.MODAL_TOKEN_ID = 'generic-token-must-not-authorize';
    process.env.MODAL_TOKEN_SECRET = 'generic-secret-must-not-authorize';
    let called = false;
    await detectScenesRemote('https://cdn/x.mp4', { fetchImpl: async () => { called = true; return okResponse({}); } });
    expect(called).toBe(false);
    expect(isSceneDetectionConfiguredV1()).toBe(false);

    process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1] = 'proxy-id';
    process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1] = 'proxy-secret';
    process.env.MODAL_SCENE_DETECTION_ENDPOINT = 'https://attacker.example.test';
    await detectScenesRemote('https://cdn/x.mp4', { fetchImpl: async () => { called = true; return okResponse({}); } });
    expect(called).toBe(false);
    expect(isSceneDetectionConfiguredV1()).toBe(false);
  });
});

describe('cutDetectionToCutRhythm (pure)', () => {
  const mk = (cutCount: number, durationMs: number): SceneDetectionResult => ({
    cuts: Array.from({ length: cutCount }, (_, i) => ({ tMs: i * 1000 })),
    durationMs,
    sceneThreshold: 0.3,
    processingTimeMs: 0,
  });

  it('derives cuts/minute, avg clip duration (N+1 clips), and pacing buckets', () => {
    // 16 cuts over 22.57s → ~42.5 cuts/min → fast; 17 clips → ~1.33s each
    const fast = cutDetectionToCutRhythm(mk(16, 22570))!;
    expect(fast.pacingOverall).toBe('fast');
    expect(fast.avgCutsPerMinute).toBeCloseTo(42.53, 1);
    expect(fast.avgClipDuration).toBeCloseTo(1.328, 2);

    // 2 cuts over 60s → 2 cuts/min → slow
    expect(cutDetectionToCutRhythm(mk(2, 60000))!.pacingOverall).toBe('slow');
    // 12 cuts over 60s → 12 cuts/min → medium
    expect(cutDetectionToCutRhythm(mk(12, 60000))!.pacingOverall).toBe('medium');
  });

  it('single-take (0 cuts) → 0 cuts/min, one clip spanning the whole video, slow', () => {
    const r = cutDetectionToCutRhythm(mk(0, 15000))!;
    expect(r.avgCutsPerMinute).toBe(0);
    expect(r.avgClipDuration).toBe(15);
    expect(r.pacingOverall).toBe('slow');
  });

  it('returns null when duration is unusable (keep the LLM estimate)', () => {
    expect(cutDetectionToCutRhythm(mk(5, 0))).toBeNull();
  });
});
