import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  verifySignatureAppRouter: vi.fn((handler: unknown) => handler),
}));
vi.mock('@upstash/qstash/nextjs', () => ({
  verifySignatureAppRouter: auth.verifySignatureAppRouter,
}));

import { NextRequest } from 'next/server';

import {
  assertMediaSourceAudioEvidenceBackfillWorkerMessageV1,
  dispatchMediaSourceAudioEvidenceBackfillMessageV1,
  resolveMediaSourceAudioEvidenceBackfillDispatchConfigurationV1,
  type MediaSourceAudioEvidenceBackfillDispatchEnvironmentV1,
  type MediaSourceAudioEvidenceBackfillQStashPublisherV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-dispatch-v1';
import { createAuthenticatedMediaSourceAudioEvidenceBackfillWorkerV1 }
  from '@/lib/editron/services/media-source-audio-evidence-backfill-worker-route-v1';
import type { MediaSourceAudioEvidenceBackfillRuntimeV1 }
  from '@/lib/editron/services/media-source-audio-evidence-backfill-runtime-v1';
import {
  createMediaSourceAudioEvidenceBackfillRunRecordV1,
  failMediaSourceAudioEvidenceBackfillRunRecordV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-run-record-v1';

const ENV: MediaSourceAudioEvidenceBackfillDispatchEnvironmentV1 = {
  QSTASH_TOKEN: 'test-qstash-token',
  QSTASH_CURRENT_SIGNING_KEY: 'test-current-signing-key',
  QSTASH_NEXT_SIGNING_KEY: 'test-next-signing-key',
  VERCEL_URL: 'editron-preview.example.test',
};
const RUNNING = createMediaSourceAudioEvidenceBackfillRunRecordV1({
  migrationRunId: 'audio-backfill-run-a',
  policyVersion: 'audio-backfill-policy-v1',
  upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
  createdAt: '2026-08-30T00:00:00.000Z',
});

describe('MediaSourceAudioEvidenceBackfillDispatchV1', () => {
  beforeEach(() => {
    auth.verifySignatureAppRouter.mockReset();
    auth.verifySignatureAppRouter.mockImplementation(
      (handler: unknown) => handler,
    );
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'test-current-signing-key');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'test-next-signing-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed when publisher or worker-signing configuration is incomplete', async () => {
    const publisherPort = publisher({ messageId: 'message-unused' });
    await expect(dispatchMediaSourceAudioEvidenceBackfillMessageV1({
      message: initializeMessage(),
      environment: { ...ENV, QSTASH_NEXT_SIGNING_KEY: undefined },
      publisher: publisherPort,
    })).rejects.toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_DISPATCH_MISSING_QSTASH_SIGNING_KEYS',
    );
    expect(publisherPort.publishJSON).not.toHaveBeenCalled();
  });

  it('accepts only strict, versioned, bounded worker messages', () => {
    expect(assertMediaSourceAudioEvidenceBackfillWorkerMessageV1(
      initializeMessage(),
    )).toEqual(initializeMessage());
    expect(() => assertMediaSourceAudioEvidenceBackfillWorkerMessageV1({
      ...initializeMessage(),
      sourceUrl: 'https://must-not-enter.example/source.mov',
    })).toThrow('MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_DISPATCH_MESSAGE_INVALID');
    expect(() => assertMediaSourceAudioEvidenceBackfillWorkerMessageV1({
      schemaVersion: 1,
      kind: 'RUN_NEXT_BATCH',
      migrationRunId: RUNNING.migrationRunId,
      expectedRecordSha256: 'not-a-hash',
      batchLimit: 101,
    })).toThrow('MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_DISPATCH_MESSAGE_INVALID');
  });

  it('publishes one HTTPS message with a deterministic deduplication identity', async () => {
    const first = publisher({ messageId: 'message-a' });
    const result = await dispatchMediaSourceAudioEvidenceBackfillMessageV1({
      message: nextMessage(RUNNING.recordSha256),
      environment: ENV,
      publisher: first,
    });
    expect(result).toMatchObject({
      disposition: 'DISPATCHED',
      messageId: 'message-a',
      deduplicationId: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(first.publishJSON).toHaveBeenCalledWith({
      url: 'https://editron-preview.example.test/api/internal/workers/media-source-audio-evidence-backfill',
      body: nextMessage(RUNNING.recordSha256),
      retries: 3,
      retryDelay: '30000ms',
      timeout: 300,
      deduplicationId: result.deduplicationId,
    });
    const second = publisher({ messageId: 'message-a', deduplicated: true });
    await expect(dispatchMediaSourceAudioEvidenceBackfillMessageV1({
      message: nextMessage(RUNNING.recordSha256),
      environment: ENV,
      publisher: second,
    })).resolves.toMatchObject({
      disposition: 'DEDUPLICATED',
      deduplicationId: result.deduplicationId,
    });
  });

  it('returns unconfirmed evidence when publication throws or lacks an id', async () => {
    const rejected = publisher(undefined, new Error('QSTASH_UNAVAILABLE'));
    await expect(dispatchMediaSourceAudioEvidenceBackfillMessageV1({
      message: initializeMessage(),
      environment: ENV,
      publisher: rejected,
    })).resolves.toMatchObject({
      disposition: 'UNCONFIRMED',
      reason: 'QSTASH_PUBLISH_REJECTED',
      messageId: null,
    });
    const missing = publisher({});
    await expect(dispatchMediaSourceAudioEvidenceBackfillMessageV1({
      message: initializeMessage(),
      environment: ENV,
      publisher: missing,
    })).resolves.toMatchObject({
      disposition: 'UNCONFIRMED',
      reason: 'QSTASH_MESSAGE_ID_INVALID',
    });
  });

  it('resolves only complete signed HTTPS dispatch configuration', () => {
    expect(resolveMediaSourceAudioEvidenceBackfillDispatchConfigurationV1({
      ...ENV,
      VERCEL_URL: undefined,
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    })).toMatchObject({ configured: false, reason: 'INVALID_PUBLIC_ORIGIN' });
    expect(resolveMediaSourceAudioEvidenceBackfillDispatchConfigurationV1(ENV))
      .toMatchObject({
        configured: true,
        workerUrl:
          'https://editron-preview.example.test/api/internal/workers/media-source-audio-evidence-backfill',
      });
  });
});

describe('MediaSourceAudioEvidenceBackfillWorkerV1', () => {
  beforeEach(() => {
    auth.verifySignatureAppRouter.mockReset();
    auth.verifySignatureAppRouter.mockImplementation(
      (handler: unknown) => handler,
    );
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'test-current-signing-key');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'test-next-signing-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('authenticates at request time and rejects payload expansion', async () => {
    const runtime = runtimePort();
    const handler = createAuthenticatedMediaSourceAudioEvidenceBackfillWorkerV1({
      runtime,
      dispatch: confirmedDispatch(),
    });
    const invalid = await handler(request({
      ...initializeMessage(),
      sourceUrl: 'https://must-not-enter.example/source.mov',
    }) as NextRequest);
    expect(invalid.status).toBe(400);
    expect(runtime.initialize).not.toHaveBeenCalled();

    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', '');
    const rejected = await handler(request(initializeMessage()) as NextRequest);
    expect(rejected.status).toBe(503);
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: 'INTERNAL_WORKER_AUTH_NOT_CONFIGURED' },
    });
    expect(runtime.initialize).not.toHaveBeenCalled();
  });

  it('initializes once and publishes the exact current-record continuation', async () => {
    const runtime = runtimePort();
    const dispatch = confirmedDispatch();
    const handler = createAuthenticatedMediaSourceAudioEvidenceBackfillWorkerV1({
      runtime,
      dispatch,
    });
    const response = await handler(request(initializeMessage()) as NextRequest);
    expect(response.status).toBe(200);
    expect(runtime.initialize).toHaveBeenCalledWith({
      migrationRunId: RUNNING.migrationRunId,
      policyVersion: RUNNING.policyVersion,
    });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      message: nextMessage(RUNNING.recordSha256),
    }));
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      result: { disposition: 'CREATED' },
      continuation: { disposition: 'DISPATCHED' },
    });
  });

  it('asks QStash to retry the same message without dispatching a new one', async () => {
    const runtime = runtimePort({
      runNextBatch: vi.fn(async () => ({
        disposition: 'RETRY_REQUIRED' as const,
        reason: 'CANDIDATE_LOAD_FAILED' as const,
        record: RUNNING,
        receipt: null,
      })),
    });
    const dispatch = confirmedDispatch();
    const handler = createAuthenticatedMediaSourceAudioEvidenceBackfillWorkerV1({
      runtime,
      dispatch,
    });
    const response = await handler(
      request(nextMessage(RUNNING.recordSha256)) as NextRequest,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('recovers a stale delivery by dispatching the latest running record', async () => {
    const runtime = runtimePort({
      runNextBatch: vi.fn(async () => ({
        disposition: 'SUPERSEDED' as const,
        record: RUNNING,
      })),
    });
    const dispatch = confirmedDispatch();
    const handler = createAuthenticatedMediaSourceAudioEvidenceBackfillWorkerV1({
      runtime,
      dispatch,
    });
    const response = await handler(
      request(nextMessage('b'.repeat(64))) as NextRequest,
    );
    expect(response.status).toBe(200);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      message: nextMessage(RUNNING.recordSha256),
    }));
  });

  it('returns retryable evidence when continuation publication is unconfirmed', async () => {
    const dispatch = vi.fn(async () => ({
      disposition: 'UNCONFIRMED' as const,
      reason: 'QSTASH_PUBLISH_REJECTED' as const,
      messageId: null,
      deduplicationId: 'd'.repeat(64),
    }));
    const handler = createAuthenticatedMediaSourceAudioEvidenceBackfillWorkerV1({
      runtime: runtimePort(),
      dispatch,
    });
    const response = await handler(request(initializeMessage()) as NextRequest);
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('30');
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      continuation: { disposition: 'UNCONFIRMED' },
    });
  });

  it('does not continue a terminal run and exports a lazy app route', async () => {
    const failed = failMediaSourceAudioEvidenceBackfillRunRecordV1(RUNNING, {
      failureCode: 'CANDIDATE_PAGE_INVALID',
      failedAt: '2026-08-30T00:01:00.000Z',
    });
    const runtime = runtimePort({
      runNextBatch: vi.fn(async () => ({
        disposition: 'ALREADY_TERMINAL' as const,
        record: failed,
      })),
    });
    const dispatch = confirmedDispatch();
    const handler = createAuthenticatedMediaSourceAudioEvidenceBackfillWorkerV1({
      runtime,
      dispatch,
    });
    const response = await handler(
      request(nextMessage(failed.recordSha256)) as NextRequest,
    );
    expect(response.status).toBe(200);
    expect(dispatch).not.toHaveBeenCalled();

    vi.resetModules();
    const route = await import(
      '@/app/api/internal/workers/media-source-audio-evidence-backfill/route'
    );
    expect(route.runtime).toBe('nodejs');
    expect(route.maxDuration).toBe(300);
    expect(typeof route.POST).toBe('function');
  });
});

function initializeMessage() {
  return {
    schemaVersion: 1 as const,
    kind: 'INITIALIZE' as const,
    migrationRunId: RUNNING.migrationRunId,
    policyVersion: RUNNING.policyVersion,
    batchLimit: 10,
  };
}

function nextMessage(expectedRecordSha256: string) {
  return {
    schemaVersion: 1 as const,
    kind: 'RUN_NEXT_BATCH' as const,
    migrationRunId: RUNNING.migrationRunId,
    expectedRecordSha256,
    batchLimit: 10,
  };
}

function publisher(
  result?: Readonly<{ messageId?: string; deduplicated?: boolean }>,
  error?: Error,
) {
  const publishJSON = vi.fn(async () => {
    if (error) throw error;
    return result ?? {};
  });
  return { publishJSON } as Readonly<MediaSourceAudioEvidenceBackfillQStashPublisherV1>
    & { publishJSON: typeof publishJSON };
}

function confirmedDispatch() {
  return vi.fn(async () => ({
    disposition: 'DISPATCHED' as const,
    messageId: 'message-next',
    deduplicationId: 'c'.repeat(64),
  }));
}

function runtimePort(input: Readonly<{
  runNextBatch?: MediaSourceAudioEvidenceBackfillRuntimeV1['runNextBatch'];
}> = {}) {
  const initialize = vi.fn(async (
    _input: Parameters<MediaSourceAudioEvidenceBackfillRuntimeV1['initialize']>[0],
  ) => ({
      disposition: 'CREATED' as const,
      record: RUNNING,
    }));
  const runNextBatch = vi.fn(async (
    value: Parameters<MediaSourceAudioEvidenceBackfillRuntimeV1['runNextBatch']>[0],
  ) => input.runNextBatch ? input.runNextBatch(value) : ({
      disposition: 'SUPERSEDED' as const,
      record: RUNNING,
    }));
  return { initialize, runNextBatch } satisfies
    MediaSourceAudioEvidenceBackfillRuntimeV1;
}

function request(body: unknown): NextRequest {
  return new NextRequest(
    'https://editron.example/api/internal/workers/media-source-audio-evidence-backfill',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}
