import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  analyzeVideoWithVjepa,
  buildVjepaCoverageSegments,
  chooseVjepaFrameSampleCount,
  EDITRON_MODAL_VJEPA_ENDPOINT_ENV_V1,
  isVjepaConfiguredV1,
  type VjepaFetchV1,
} from '../../lib/editron/services/vjepa-service';
import {
  EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1,
  EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1,
} from '../../lib/editron/services/modal-proxy-auth-v1';

const originalFetch = globalThis.fetch;
const environmentNames = [
  EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1,
  EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1,
  EDITRON_MODAL_VJEPA_ENDPOINT_ENV_V1,
  'MODAL_TOKEN_ID',
  'MODAL_TOKEN_SECRET',
] as const;
const originalEnvironment = Object.fromEntries(
  environmentNames.map((name) => [name, process.env[name]]),
);

beforeEach(() => {
  process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1] = 'proxy-id';
  process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1] = 'proxy-secret';
  delete process.env[EDITRON_MODAL_VJEPA_ENDPOINT_ENV_V1];
  delete process.env.MODAL_TOKEN_ID;
  delete process.env.MODAL_TOKEN_SECRET;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnvironment();
  vi.restoreAllMocks();
});

function restoreEnvironment(): void {
  for (const name of environmentNames) {
    restoreEnv(name, originalEnvironment[name]);
  }
}

describe('V-JEPA service segment coverage', () => {
  it('builds continuous visual coverage segments from duration instead of speech gaps', () => {
    const segments = buildVjepaCoverageSegments(12_000, [
      { startMs: 0, endMs: 2_000 },
      { startMs: 10_000, endMs: 12_000 },
    ], { segmentDurationMs: 5_000 });

    expect(segments).toEqual([
      { startMs: 0, endMs: 5_000 },
      { startMs: 5_000, endMs: 10_000 },
      { startMs: 10_000, endMs: 12_000 },
    ]);
  });

  it('bounds segment count for long videos while preserving full coverage', () => {
    const segments = buildVjepaCoverageSegments(20_000, [], {
      segmentDurationMs: 3_000,
      maxSegments: 4,
    });

    expect(segments).toEqual([
      { startMs: 0, endMs: 5_000 },
      { startMs: 5_000, endMs: 10_000 },
      { startMs: 10_000, endMs: 15_000 },
      { startMs: 15_000, endMs: 20_000 },
    ]);
  });

  it('uses fallback segment end time to recover visual coverage when explicit duration is missing', () => {
    const fallback = [{ startMs: 1_000, endMs: 2_000 }];

    expect(buildVjepaCoverageSegments(undefined, fallback)).toEqual([
      { startMs: 0, endMs: 2_000 },
    ]);
  });

  it('returns the original empty fallback when no duration evidence exists', () => {
    expect(buildVjepaCoverageSegments(undefined, [])).toEqual([]);
  });

  it('chooses adaptive frame samples for long V-JEPA segment sets', () => {
    expect(chooseVjepaFrameSampleCount(20)).toBe(64);
    expect(chooseVjepaFrameSampleCount(80)).toBe(48);
    expect(chooseVjepaFrameSampleCount(160)).toBe(32);
    expect(chooseVjepaFrameSampleCount(220)).toBe(24);
  });

  it('sends the adaptive frame sample cap to Modal requests', async () => {
    process.env.MODAL_TOKEN_ID = 'test-token-id';
    process.env.MODAL_TOKEN_SECRET = 'test-token-secret';
    const requestSegments = Array.from({ length: 220 }, (_, index) => ({
      startMs: index * 1_000,
      endMs: (index + 1) * 1_000,
    }));

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        segments?: Array<{ start_ms: number; end_ms: number }>;
        max_frames_per_segment?: number;
      };
      return successfulVjepaResponse(body.segments ?? []);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await analyzeVideoWithVjepa('https://example.com/video.mp4', requestSegments);

    expect(result?.frameSampleCount).toBe(24);
    expect(result?.segments).toHaveLength(220);
    for (const [, init] of fetchMock.mock.calls) {
      const body = JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')) as {
        max_frames_per_segment?: number;
      };
      expect(body.max_frames_per_segment).toBe(24);
      expect((init as RequestInit).headers).toMatchObject({
        'Modal-Key': 'proxy-id',
        'Modal-Secret': 'proxy-secret',
      });
      expect((init as RequestInit).headers).not.toHaveProperty('Authorization');
    }
    expect(isVjepaConfiguredV1()).toBe(true);
  });
  it('does not dispatch with generic credentials or a foreign endpoint', async () => {
    delete process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1];
    delete process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1];
    process.env.MODAL_TOKEN_ID = 'generic-token-must-not-authorize';
    process.env.MODAL_TOKEN_SECRET = 'generic-secret-must-not-authorize';
    let called = false;
    const fetchImpl: VjepaFetchV1 = async () => {
      called = true;
      return new Response('{}', { status: 200 });
    };

    await expect(analyzeVideoWithVjepa(
      'https://cdn.test/source.mp4',
      [{ startMs: 0, endMs: 1_000 }],
      { fetchImpl },
    )).resolves.toBeNull();
    expect(called).toBe(false);
    expect(isVjepaConfiguredV1()).toBe(false);

    process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1] = 'proxy-id';
    process.env[EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1] = 'proxy-secret';
    process.env[EDITRON_MODAL_VJEPA_ENDPOINT_ENV_V1] = 'https://attacker.example.test';
    await expect(analyzeVideoWithVjepa(
      'https://cdn.test/source.mp4',
      [{ startMs: 0, endMs: 1_000 }],
      { fetchImpl },
    )).resolves.toBeNull();
    expect(called).toBe(false);
    expect(isVjepaConfiguredV1()).toBe(false);
  });

  it('does not create visual evidence from malformed responses or leak request errors', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const malformed: VjepaFetchV1 = async () => new Response(JSON.stringify({
      segments: [{ start_ms: 0, end_ms: 1_000, visual_significance: 'bad', motion_intensity: 0.4 }],
    }), { status: 200 });
    await expect(analyzeVideoWithVjepa(
      'https://cdn.test/source.mp4',
      [{ startMs: 0, endMs: 1_000 }],
      { fetchImpl: malformed },
    )).resolves.toBeNull();

    const failed: VjepaFetchV1 = async () => {
      throw new Error('request included https://private.example.test/presigned-url');
    };
    await expect(analyzeVideoWithVjepa(
      'https://cdn.test/source.mp4',
      [{ startMs: 0, endMs: 1_000 }],
      { fetchImpl: failed },
    )).resolves.toBeNull();
    expect(error.mock.calls.flat().join(' ')).not.toContain('presigned-url');
  });
  it('retries a failed large Modal request as smaller batches before dropping V-JEPA', async () => {
    process.env.MODAL_TOKEN_ID = 'test-token-id';
    process.env.MODAL_TOKEN_SECRET = 'test-token-secret';
    const requestSegments = Array.from({ length: 21 }, (_, index) => ({
      startMs: index * 1_000,
      endMs: (index + 1) * 1_000,
    }));

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        segments?: Array<{ start_ms: number; end_ms: number }>;
      };
      const segments = body.segments ?? [];
      if (fetchMock.mock.calls.length === 1 && segments.length > 5) {
        return {
          ok: false,
          status: 504,
          statusText: 'Gateway Timeout',
          json: async () => ({}),
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          segments: segments.map(segment => ({
            start_ms: segment.start_ms,
            end_ms: segment.end_ms,
            visual_significance: 0.7,
            motion_intensity: 0.4,
          })),
        }),
      } as Response;
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await analyzeVideoWithVjepa('https://example.com/video.mp4', requestSegments);

    expect(result?.segments).toHaveLength(21);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
    const requestSizes = fetchMock.mock.calls.map(([, init]) => {
      const body = JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')) as {
        segments?: unknown[];
      };
      return body.segments?.length ?? 0;
    });
    expect(Math.max(...requestSizes)).toBeGreaterThan(5);
    expect(requestSizes.some(size => size <= 5)).toBe(true);
  });
  it('preserves successful V-JEPA batches when a later batch fails', async () => {
    process.env.MODAL_TOKEN_ID = 'test-token-id';
    process.env.MODAL_TOKEN_SECRET = 'test-token-secret';
    const requestSegments = Array.from({ length: 21 }, (_, index) => ({
      startMs: index * 1_000,
      endMs: (index + 1) * 1_000,
    }));

    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        segments?: Array<{ start_ms: number; end_ms: number }>;
      };
      const segments = body.segments ?? [];
      if (segments.length === 1) {
        return {
          ok: false,
          status: 504,
          statusText: 'Gateway Timeout',
          json: async () => ({}),
        } as Response;
      }

      return successfulVjepaResponse(segments);
    }) as unknown as typeof fetch;

    const result = await analyzeVideoWithVjepa('https://example.com/video.mp4', requestSegments);

    expect(result).not.toBeNull();
    expect(result?.segments).toHaveLength(20);
    expect(result?.partial).toBe(true);
    expect(result?.requestedSegmentCount).toBe(21);
    expect(result?.analyzedSegmentCount).toBe(20);
    expect(result?.droppedSegmentCount).toBe(1);
    expect(result?.coverageRatio).toBeCloseTo(20 / 21);
    expect(result?.failedBatchCount).toBe(1);
    expect(result?.failedBatchIndices).toEqual([1]);
  });

  it('preserves successful retry chunks when one retry chunk fails', async () => {
    process.env.MODAL_TOKEN_ID = 'test-token-id';
    process.env.MODAL_TOKEN_SECRET = 'test-token-secret';
    const requestSegments = Array.from({ length: 20 }, (_, index) => ({
      startMs: index * 1_000,
      endMs: (index + 1) * 1_000,
    }));

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        segments?: Array<{ start_ms: number; end_ms: number }>;
      };
      const segments = body.segments ?? [];
      if (fetchMock.mock.calls.length === 1) {
        return {
          ok: false,
          status: 504,
          statusText: 'Gateway Timeout',
          json: async () => ({}),
        } as Response;
      }
      if (segments[0]?.start_ms === 10_000) {
        return {
          ok: false,
          status: 504,
          statusText: 'Gateway Timeout',
          json: async () => ({}),
        } as Response;
      }

      return successfulVjepaResponse(segments);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await analyzeVideoWithVjepa('https://example.com/video.mp4', requestSegments);

    expect(result).not.toBeNull();
    expect(result?.segments).toHaveLength(15);
    expect(result?.partial).toBe(true);
    expect(result?.requestedSegmentCount).toBe(20);
    expect(result?.analyzedSegmentCount).toBe(15);
    expect(result?.droppedSegmentCount).toBe(5);
    expect(result?.coverageRatio).toBe(0.75);
    expect(result?.failedBatchCount).toBe(0);
    expect(result?.failedBatchIndices).toEqual([]);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('still returns null when every V-JEPA batch fails', async () => {
    process.env.MODAL_TOKEN_ID = 'test-token-id';
    process.env.MODAL_TOKEN_SECRET = 'test-token-secret';
    const requestSegments = Array.from({ length: 2 }, (_, index) => ({
      startMs: index * 1_000,
      endMs: (index + 1) * 1_000,
    }));

    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 504,
      statusText: 'Gateway Timeout',
      json: async () => ({}),
    } as Response)) as unknown as typeof fetch;

    await expect(analyzeVideoWithVjepa('https://example.com/video.mp4', requestSegments)).resolves.toBeNull();
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
function successfulVjepaResponse(segments: Array<{ start_ms: number; end_ms: number }>): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({
      segments: segments.map(segment => ({
        start_ms: segment.start_ms,
        end_ms: segment.end_ms,
        visual_significance: 0.7,
        motion_intensity: 0.4,
      })),
    }),
  } as Response;
}
