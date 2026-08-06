import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  publishJSON: vi.fn(),
  getJob: vi.fn(),
  finalizeRenderArtifact: vi.fn(),
  completeJobFinalization: vi.fn(),
  failJobFinalization: vi.fn(),
}));

vi.mock('@upstash/qstash', () => ({
  Client: vi.fn(() => ({ publishJSON: mocks.publishJSON })),
}));

vi.mock('@upstash/qstash/nextjs', () => ({
  verifySignatureAppRouter: (handler: unknown) => handler,
}));

vi.mock('@/lib/editron/services/render-finalizer-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/editron/services/render-finalizer-client')>();
  return { ...actual, finalizeRenderArtifact: mocks.finalizeRenderArtifact };
});

vi.mock('@/lib/editron/services/render-job-service', () => ({
  getJob: mocks.getJob,
  completeJobFinalization: mocks.completeJobFinalization,
  failJobFinalization: mocks.failJobFinalization,
}));

import {
  enqueueRenderFinalization,
  parseRenderFinalizationFailureEnvelope,
  resolveRenderFinalizationPipelineConfig,
} from '@/lib/editron/services/render-finalization-dispatch';
import { POST as FINALIZE } from '@/app/api/internal/workers/render-finalizer/route';
import { POST as FAIL_FINALIZATION } from '@/app/api/internal/workers/render-finalizer/failure/route';

const env = {
  EDITRON_RENDER_FINALIZER_ENDPOINT: 'https://finalizer.example.test/finalize',
  EDITRON_RENDER_FINALIZER_TOKEN: 'finalizer-secret',
  QSTASH_TOKEN: 'qstash-secret',
  QSTASH_CURRENT_SIGNING_KEY: 'current-signing-key',
  QSTASH_NEXT_SIGNING_KEY: 'next-signing-key',
  NEXT_PUBLIC_APP_URL: 'https://preview.example.test/',
};

const message = {
  version: 'editron-render-finalization-job-v1' as const,
  jobId: 'rnd_test_123',
  claimToken: 'rfl_claim_123',
  sourceOutputUrl: 'https://render.example.test/raw.mp4',
  sourceOutputSize: 40_000_000,
  expectedDurationMs: 38_000,
};

const finalizerResult = {
  url: 'https://render.example.test/editron-finalized/rnd_test_123.mp4',
  sizeBytes: 39_000_000,
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
};

describe('render finalization orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publishJSON.mockResolvedValue({ messageId: 'msg_finalizer_1' });
    mocks.getJob.mockResolvedValue({
      _id: message.jobId,
      status: 'finalizing',
      expectedDurationMs: message.expectedDurationMs,
      finalization: {
        state: 'running',
        claimToken: message.claimToken,
        sourceOutputUrl: message.sourceOutputUrl,
        sourceOutputSize: message.sourceOutputSize,
      },
    });
    mocks.finalizeRenderArtifact.mockResolvedValue(finalizerResult);
    mocks.completeJobFinalization.mockResolvedValue(true);
    mocks.failJobFinalization.mockResolvedValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('requires the complete signed pipeline and publishes a deduplicated retryable job', async () => {
    expect(resolveRenderFinalizationPipelineConfig(env)).toMatchObject({
      configured: true,
      workerUrl: 'https://preview.example.test/api/internal/workers/render-finalizer',
      failureCallbackUrl: 'https://preview.example.test/api/internal/workers/render-finalizer/failure',
    });
    expect(resolveRenderFinalizationPipelineConfig({
      ...env,
      QSTASH_NEXT_SIGNING_KEY: '',
    })).toMatchObject({ configured: false, reason: 'missing_qstash_signing_keys' });

    await expect(enqueueRenderFinalization(message, { env })).resolves.toEqual({
      messageId: 'msg_finalizer_1',
    });
    expect(mocks.publishJSON).toHaveBeenCalledWith({
      url: 'https://preview.example.test/api/internal/workers/render-finalizer',
      failureCallback: 'https://preview.example.test/api/internal/workers/render-finalizer/failure',
      body: message,
      retries: 3,
      deduplicationId: message.claimToken,
      headers: { 'Upstash-Timeout': '300s' },
    });
  });

  it('finalizes and publishes only through the active database claim', async () => {
    const response = await FINALIZE(jsonRequest(
      'https://preview.example.test/api/internal/workers/render-finalizer',
      message,
    ));

    expect(response.status).toBe(200);
    expect(mocks.finalizeRenderArtifact).toHaveBeenCalledWith({
      inputUrl: message.sourceOutputUrl,
      jobId: message.jobId,
      expectedDurationMs: message.expectedDurationMs,
    });
    expect(mocks.completeJobFinalization).toHaveBeenCalledWith({
      jobId: message.jobId,
      claimToken: message.claimToken,
      result: finalizerResult,
    });
  });

  it('does no media work for a stale or terminal delivery', async () => {
    mocks.getJob.mockResolvedValueOnce({
      _id: message.jobId,
      status: 'finalizing',
      expectedDurationMs: message.expectedDurationMs,
      finalization: {
        state: 'running',
        claimToken: 'rfl_newer_claim',
        sourceOutputUrl: message.sourceOutputUrl,
        sourceOutputSize: message.sourceOutputSize,
      },
    });
    const stale = await FINALIZE(jsonRequest('https://preview.example.test/worker', message));
    await expect(stale.json()).resolves.toMatchObject({ skipped: 'stale_finalization_claim' });
    expect(mocks.finalizeRenderArtifact).not.toHaveBeenCalled();

    mocks.getJob.mockResolvedValueOnce({ _id: message.jobId, status: 'done' });
    const terminal = await FINALIZE(jsonRequest('https://preview.example.test/worker', message));
    await expect(terminal.json()).resolves.toMatchObject({ skipped: 'job_already_terminal' });
    expect(mocks.finalizeRenderArtifact).not.toHaveBeenCalled();
  });

  it('returns a retryable failure without prematurely terminalizing the job', async () => {
    mocks.finalizeRenderArtifact.mockRejectedValueOnce(new Error('Modal timed out'));
    const response = await FINALIZE(jsonRequest('https://preview.example.test/worker', message));

    expect(response.status).toBe(500);
    expect(mocks.completeJobFinalization).not.toHaveBeenCalled();
    expect(mocks.failJobFinalization).not.toHaveBeenCalled();
  });

  it('decodes the QStash failure envelope and fails only its matching claim', async () => {
    const envelope = {
      sourceBody: Buffer.from(JSON.stringify(message)).toString('base64'),
      sourceMessageId: 'msg_finalizer_1',
      status: 500,
      retried: 3,
      maxRetries: 3,
      body: Buffer.from('{"error":"Modal timed out"}').toString('base64'),
    };
    expect(parseRenderFinalizationFailureEnvelope(envelope)).toMatchObject({
      message,
      error: expect.stringContaining('after 4 attempt(s); last HTTP status 500'),
    });

    const response = await FAIL_FINALIZATION(jsonRequest(
      'https://preview.example.test/api/internal/workers/render-finalizer/failure',
      envelope,
    ));
    expect(response.status).toBe(200);
    expect(mocks.failJobFinalization).toHaveBeenCalledWith({
      jobId: message.jobId,
      claimToken: message.claimToken,
      error: expect.stringContaining('after 4 attempt(s)'),
    });

    mocks.failJobFinalization.mockResolvedValueOnce(false);
    const stale = await FAIL_FINALIZATION(jsonRequest('https://preview.example.test/failure', envelope));
    await expect(stale.json()).resolves.toMatchObject({ skipped: 'stale_finalization_claim' });
  });
});

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
