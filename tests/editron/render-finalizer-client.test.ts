import { describe, expect, it, vi } from 'vitest';

import {
  finalizeRenderArtifact,
  isRenderFinalizerConfigured,
  RenderFinalizerClientError,
  type RenderFinalizerEnvironment,
} from '@/lib/editron/services/render-finalizer-client';

const env: RenderFinalizerEnvironment = {
  EDITRON_RENDER_FINALIZER_ENDPOINT: 'https://example--editron-render-finalizer-finalize.modal.run',
  EDITRON_RENDER_FINALIZER_TOKEN: 'shared-secret',
};

const input = {
  inputUrl: 'https://render-bucket.s3.us-east-1.amazonaws.com/renders/job/out.mp4',
  jobId: 'rnd_test_123',
  expectedDurationMs: 38_000,
};

function successPayload(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    url: 'https://render-bucket.s3.us-east-1.amazonaws.com/editron-finalized/rnd_test_123.mp4',
    sizeBytes: 42_000_000,
    expectedDurationMs: 38_000,
    receipt: {
      expectedDurationMs: 38_000,
      formatDurationMs: 38_000,
      videoDurationMs: 38_000,
      audioDurationMs: 38_000,
      videoCodec: 'h264',
      audioCodec: 'aac',
      width: 1920,
      height: 1080,
      fps: 30,
      sampleRate: 48_000,
      channels: 2,
      verificationToleranceMs: 1,
    },
    ...overrides,
  };
}

describe('render finalizer client', () => {
  it('requires both endpoint and token', () => {
    expect(isRenderFinalizerConfigured(env)).toBe(true);
    expect(isRenderFinalizerConfigured({ ...env, EDITRON_RENDER_FINALIZER_TOKEN: '' })).toBe(false);
    expect(isRenderFinalizerConfigured({ ...env, EDITRON_RENDER_FINALIZER_ENDPOINT: '' })).toBe(false);
  });

  it('sends the exact duration contract with bearer auth', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      Response.json(successPayload())
    ));

    const result = await finalizeRenderArtifact(input, { env, fetchImpl });

    expect(result).toMatchObject({
      expectedDurationMs: 38_000,
      receipt: {
        formatDurationMs: 38_000,
        videoDurationMs: 38_000,
        audioDurationMs: 38_000,
        videoCodec: 'h264',
        audioCodec: 'aac',
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(env.EDITRON_RENDER_FINALIZER_ENDPOINT);
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer shared-secret',
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual(input);
  });

  it('rejects a success payload whose probe receipt still has an AAC tail', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(successPayload({
      receipt: {
        ...successPayload().receipt,
        audioDurationMs: 38_080,
      },
    })));

    await expect(finalizeRenderArtifact(input, { env, fetchImpl })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });

    const inflatedTolerance = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(successPayload({
      receipt: {
        ...successPayload().receipt,
        audioDurationMs: 38_080,
        verificationToleranceMs: 100,
      },
    })));
    await expect(finalizeRenderArtifact(input, {
      env,
      fetchImpl: inflatedTolerance,
    })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('preserves a fail-loud worker rejection', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({
      ok: false,
      error: {
        code: 'finalization_verification_failed',
        message: 'audioDurationMs=38080 does not match expectedDurationMs=38000.',
      },
    }, { status: 422 }));

    await expect(finalizeRenderArtifact(input, { env, fetchImpl })).rejects.toEqual(
      expect.objectContaining<Partial<RenderFinalizerClientError>>({
        code: 'WORKER_REJECTED',
        httpStatus: 422,
        message: 'audioDurationMs=38080 does not match expectedDurationMs=38000.',
      }),
    );
  });

  it('fails before network I/O for invalid requests or missing configuration', async () => {
    const fetchImpl = vi.fn();
    await expect(finalizeRenderArtifact(
      { ...input, inputUrl: 'http://render.example/out.mp4' },
      { env, fetchImpl },
    )).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(finalizeRenderArtifact(
      { ...input, jobId: '../unsafe' },
      { env, fetchImpl },
    )).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(finalizeRenderArtifact(input, {
      env: { EDITRON_RENDER_FINALIZER_ENDPOINT: env.EDITRON_RENDER_FINALIZER_ENDPOINT },
      fetchImpl,
    })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('names network failures without leaking an untyped exception', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      throw new Error('connection reset');
    });
    await expect(finalizeRenderArtifact(input, { env, fetchImpl })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Render finalizer request failed: connection reset',
    });
  });
});
