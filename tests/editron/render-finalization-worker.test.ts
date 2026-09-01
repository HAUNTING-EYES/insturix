import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  publishJSON: vi.fn(),
  getJob: vi.fn(),
  finalizeRenderArtifact: vi.fn(),
  completeJobFinalization: vi.fn(),
  completeProjectRenderJobFinalization: vi.fn(),
  failJobFinalization: vi.fn(),
  failProjectRenderJobFinalization: vi.fn(),
  getCurrentProjectRenderJob: vi.fn(),
  getProjectRevision: vi.fn(),
  claimProjectRenderJobFinalization: vi.fn(),
  releaseProjectRenderJobFinalizationClaim: vi.fn(),
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

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(),
  })),
}));

vi.mock('@/lib/editron/services/render-job-service', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/editron/services/render-job-service')>(),
  getJob: mocks.getJob,
  getCurrentProjectRenderJobV1: mocks.getCurrentProjectRenderJob,
  completeJobFinalization: mocks.completeJobFinalization,
  completeProjectRenderJobFinalizationV1:
    mocks.completeProjectRenderJobFinalization,
  failJobFinalization: mocks.failJobFinalization,
  failProjectRenderJobFinalizationV1:
    mocks.failProjectRenderJobFinalization,
  claimProjectRenderJobFinalizationV1:
    mocks.claimProjectRenderJobFinalization,
  releaseProjectRenderJobFinalizationClaimV1:
    mocks.releaseProjectRenderJobFinalizationClaim,
}));

vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: { getProjectRevision: mocks.getProjectRevision },
}));

import {
  beginProjectRenderFinalizationV1,
  enqueueRenderFinalization,
  parseRenderFinalizationFailureEnvelope,
  RenderFinalizationJobMessageSchema,
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

const projectRevision = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: '2026-09-01T00:00:00.000Z',
};

const projectRenderAuthorization = {
  schemaVersion: 1 as const,
  jobId: message.jobId,
  requestedByUserId: 'requester_1',
  ownerId: 'owner_1',
  projectId: 'project_1',
  projectRevision,
  bindingHash: 'a'.repeat(64),
};

const strictMessage = { ...message, projectRenderAuthorization };

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
    for (const [key, value] of Object.entries(env)) {
      vi.stubEnv(key, value);
    }
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
    mocks.completeProjectRenderJobFinalization.mockResolvedValue({
      ok: true,
      status: 'CURRENT',
    });
    mocks.failJobFinalization.mockResolvedValue(true);
    mocks.failProjectRenderJobFinalization.mockResolvedValue({
      ok: true,
      status: 'CURRENT',
    });
    mocks.getProjectRevision.mockResolvedValue(projectRevision);
    mocks.getCurrentProjectRenderJob.mockResolvedValue({
      ok: true,
      status: 'CURRENT',
      job: {
        _id: message.jobId,
        status: 'finalizing',
        expectedDurationMs: message.expectedDurationMs,
        finalization: {
          state: 'running',
          claimToken: message.claimToken,
          sourceOutputUrl: message.sourceOutputUrl,
          sourceOutputSize: message.sourceOutputSize,
        },
      },
    });
    mocks.claimProjectRenderJobFinalization.mockResolvedValue({
      ok: true,
      status: 'CURRENT',
      jobId: message.jobId,
      claimToken: message.claimToken,
      sourceOutputUrl: message.sourceOutputUrl,
      sourceOutputSize: message.sourceOutputSize,
      expectedDurationMs: message.expectedDurationMs,
      authorization: projectRenderAuthorization,
    });
    mocks.releaseProjectRenderJobFinalizationClaim.mockResolvedValue({
      ok: true,
      status: 'CURRENT',
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
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

  it('carries strict authorization only inside the signed finalizer work message', async () => {
    await expect(beginProjectRenderFinalizationV1({
      authorization: projectRenderAuthorization,
      currentProjectRevision: projectRevision,
      providerRenderId: 'provider_render_1',
      bucketName: 'bucket_1',
      sourceOutputUrl: message.sourceOutputUrl,
      sourceOutputSize: message.sourceOutputSize,
    })).resolves.toMatchObject({ state: 'enqueued' });

    expect(mocks.publishJSON).toHaveBeenCalledWith(expect.objectContaining({
      body: strictMessage,
      deduplicationId: message.claimToken,
    }));
  });

  it('rejects cross-job authorization and strict rows disguised as legacy before media work', async () => {
    expect(RenderFinalizationJobMessageSchema.safeParse({
      ...strictMessage,
      projectRenderAuthorization: {
        ...projectRenderAuthorization,
        jobId: 'rnd_different_job',
      },
    }).success).toBe(false);

    mocks.getJob.mockResolvedValueOnce({
      _id: message.jobId,
      status: 'finalizing',
      expectedDurationMs: message.expectedDurationMs,
      projectRenderSnapshotBinding: { scope: 'PROJECT_SNAPSHOT' },
      finalization: {
        state: 'running',
        claimToken: message.claimToken,
        sourceOutputUrl: message.sourceOutputUrl,
        sourceOutputSize: message.sourceOutputSize,
      },
    });
    const response = await FINALIZE(jsonRequest(
      'https://preview.example.test/api/internal/workers/render-finalizer',
      message,
    ));

    expect(response.status).toBe(400);
    expect(mocks.finalizeRenderArtifact).not.toHaveBeenCalled();
    expect(mocks.completeJobFinalization).not.toHaveBeenCalled();
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

  it('finalizes a strict project render only through fresh bound owners', async () => {
    const response = await FINALIZE(jsonRequest(
      'https://preview.example.test/api/internal/workers/render-finalizer',
      strictMessage,
    ));

    expect(response.status).toBe(200);
    expect(mocks.getProjectRevision).toHaveBeenCalledTimes(2);
    expect(mocks.getCurrentProjectRenderJob).toHaveBeenCalledWith({
      authorization: projectRenderAuthorization,
      currentProjectRevision: projectRevision,
    });
    expect(mocks.completeProjectRenderJobFinalization).toHaveBeenCalledWith({
      authorization: projectRenderAuthorization,
      currentProjectRevision: projectRevision,
      claimToken: message.claimToken,
      result: finalizerResult,
    });
    expect(mocks.completeJobFinalization).not.toHaveBeenCalled();
  });

  it('does no strict media work when the project render is not current', async () => {
    mocks.getCurrentProjectRenderJob.mockResolvedValueOnce({
      ok: false,
      status: 'NON_CURRENT',
      code: 'PROJECT_ARTIFACT_NOT_CURRENT',
      reason: 'PROJECT_REVISION_STALE',
    });

    const response = await FINALIZE(jsonRequest(
      'https://preview.example.test/api/internal/workers/render-finalizer',
      strictMessage,
    ));

    await expect(response.json()).resolves.toMatchObject({
      skipped: 'project_render_not_current',
    });
    expect(mocks.finalizeRenderArtifact).not.toHaveBeenCalled();
    expect(mocks.completeProjectRenderJobFinalization).not.toHaveBeenCalled();
  });

  it('never publishes strict success when the project changes during media work', async () => {
    mocks.completeProjectRenderJobFinalization.mockResolvedValueOnce({
      ok: false,
      status: 'NON_CURRENT',
      code: 'PROJECT_ARTIFACT_NOT_CURRENT',
      reason: 'PROJECT_REVISION_STALE',
    });

    const response = await FINALIZE(jsonRequest(
      'https://preview.example.test/api/internal/workers/render-finalizer',
      strictMessage,
    ));

    await expect(response.json()).resolves.toMatchObject({
      skipped: 'claim_changed_during_finalization',
    });
    expect(mocks.finalizeRenderArtifact).toHaveBeenCalledTimes(1);
    expect(mocks.completeJobFinalization).not.toHaveBeenCalled();
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

  it('fails a strict finalization only through its current bound claim', async () => {
    const envelope = {
      sourceBody: Buffer.from(JSON.stringify(strictMessage)).toString('base64'),
      status: 500,
      retried: 3,
      maxRetries: 3,
    };

    const response = await FAIL_FINALIZATION(jsonRequest(
      'https://preview.example.test/api/internal/workers/render-finalizer/failure',
      envelope,
    ));

    expect(response.status).toBe(200);
    expect(mocks.failProjectRenderJobFinalization).toHaveBeenCalledWith({
      authorization: projectRenderAuthorization,
      currentProjectRevision: projectRevision,
      claimToken: message.claimToken,
      error: expect.stringContaining('after 4 attempt(s)'),
    });
    expect(mocks.failJobFinalization).not.toHaveBeenCalled();
  });

  it('does not acknowledge transient strict revision-read failures', async () => {
    mocks.getProjectRevision.mockRejectedValueOnce(new Error('database unavailable'));
    const envelope = {
      sourceBody: Buffer.from(JSON.stringify(strictMessage)).toString('base64'),
      status: 500,
      retried: 1,
      maxRetries: 3,
    };

    const response = await FAIL_FINALIZATION(jsonRequest(
      'https://preview.example.test/api/internal/workers/render-finalizer/failure',
      envelope,
    ));

    expect(response.status).toBe(500);
    expect(mocks.failProjectRenderJobFinalization).not.toHaveBeenCalled();
    expect(mocks.failJobFinalization).not.toHaveBeenCalled();
  });
});

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
