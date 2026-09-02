import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  verifySignatureAppRouter: vi.fn((handler: unknown) => handler),
}));
vi.mock('@upstash/qstash/nextjs', () => ({
  verifySignatureAppRouter: auth.verifySignatureAppRouter,
}));

import { NextRequest } from 'next/server';

import {
  assertMediaSourcePtsCadenceVersionEvidenceBackfillWorkerMessageV1,
  dispatchMediaSourcePtsCadenceVersionEvidenceBackfillMessageV1,
  resolveMediaSourcePtsCadenceVersionEvidenceBackfillDispatchConfigurationV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillDispatchEnvironmentV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillQStashPublisherV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-dispatch-v1';
import {
  createAuthenticatedMediaSourcePtsCadenceVersionEvidenceBackfillWorkerV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-worker-route-v1';
import {
  createMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  failMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-run-record-v1';
import type { MediaSourcePtsCadenceVersionEvidenceBackfillRuntimeV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-runtime-v1';

const ENV:
  MediaSourcePtsCadenceVersionEvidenceBackfillDispatchEnvironmentV1 = {
    QSTASH_TOKEN: 'test-qstash-token',
    QSTASH_CURRENT_SIGNING_KEY: 'test-current-signing-key',
    QSTASH_NEXT_SIGNING_KEY: 'test-next-signing-key',
    VERCEL_URL: 'editron-preview.example.test',
  };
const RUNNING = createMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1({
  migrationRunId: 'pts-backfill-run-a',
  policyVersion: 'pts-backfill-policy-v1',
  upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
  createdAt: '2026-08-30T00:00:00.000Z',
});

describe('MediaSourcePtsCadenceVersionEvidenceBackfillDispatchV1', () => {
  beforeEach(prepareAuth);
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed when signing configuration is incomplete', async () => {
    const publisherPort = publisher({ messageId: 'message-unused' });
    await expect(
      dispatchMediaSourcePtsCadenceVersionEvidenceBackfillMessageV1({
        message: initializeMessage(),
        environment: { ...ENV, QSTASH_NEXT_SIGNING_KEY: undefined },
        publisher: publisherPort,
      }),
    ).rejects.toThrow(
      'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_DISPATCH_MISSING_QSTASH_SIGNING_KEYS',
    );
    expect(publisherPort.publishJSON).not.toHaveBeenCalled();
  });

  it('accepts only strict, versioned, bounded messages', () => {
    expect(
      assertMediaSourcePtsCadenceVersionEvidenceBackfillWorkerMessageV1(
        initializeMessage(),
      ),
    ).toEqual(initializeMessage());
    expect(() =>
      assertMediaSourcePtsCadenceVersionEvidenceBackfillWorkerMessageV1({
        ...initializeMessage(),
        sourceUrl: 'https://must-not-enter.example/source.mov',
      })).toThrow(
      'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_DISPATCH_MESSAGE_INVALID',
    );
    expect(() =>
      assertMediaSourcePtsCadenceVersionEvidenceBackfillWorkerMessageV1({
        schemaVersion: 1,
        kind: 'RUN_NEXT_BATCH',
        migrationRunId: RUNNING.migrationRunId,
        expectedRecordSha256: 'not-a-hash',
        batchLimit: 101,
      })).toThrow(
      'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_DISPATCH_MESSAGE_INVALID',
    );
  });

  it('publishes HTTPS work with deterministic deduplication', async () => {
    const first = publisher({ messageId: 'message-a' });
    const result =
      await dispatchMediaSourcePtsCadenceVersionEvidenceBackfillMessageV1({
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
      url:
        'https://editron-preview.example.test/api/internal/workers/media-source-pts-cadence-version-evidence-backfill',
      body: nextMessage(RUNNING.recordSha256),
      retries: 3,
      retryDelay: '30000ms',
      timeout: 300,
      deduplicationId: result.deduplicationId,
    });
    const second = publisher({ messageId: 'message-a', deduplicated: true });
    await expect(
      dispatchMediaSourcePtsCadenceVersionEvidenceBackfillMessageV1({
        message: nextMessage(RUNNING.recordSha256),
        environment: ENV,
        publisher: second,
      }),
    ).resolves.toMatchObject({
      disposition: 'DEDUPLICATED',
      deduplicationId: result.deduplicationId,
    });
  });

  it('returns unconfirmed evidence for rejection or missing message id', async () => {
    await expect(
      dispatchMediaSourcePtsCadenceVersionEvidenceBackfillMessageV1({
        message: initializeMessage(),
        environment: ENV,
        publisher: publisher(undefined, new Error('QSTASH_UNAVAILABLE')),
      }),
    ).resolves.toMatchObject({
      disposition: 'UNCONFIRMED',
      reason: 'QSTASH_PUBLISH_REJECTED',
      messageId: null,
    });
    await expect(
      dispatchMediaSourcePtsCadenceVersionEvidenceBackfillMessageV1({
        message: initializeMessage(),
        environment: ENV,
        publisher: publisher({}),
      }),
    ).resolves.toMatchObject({
      disposition: 'UNCONFIRMED',
      reason: 'QSTASH_MESSAGE_ID_INVALID',
    });
  });

  it('resolves only complete signed HTTPS configuration', () => {
    expect(
      resolveMediaSourcePtsCadenceVersionEvidenceBackfillDispatchConfigurationV1({
        ...ENV,
        VERCEL_URL: undefined,
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      }),
    ).toMatchObject({ configured: false, reason: 'INVALID_PUBLIC_ORIGIN' });
    expect(
      resolveMediaSourcePtsCadenceVersionEvidenceBackfillDispatchConfigurationV1(
        ENV,
      ),
    ).toMatchObject({
      configured: true,
      workerUrl:
        'https://editron-preview.example.test/api/internal/workers/media-source-pts-cadence-version-evidence-backfill',
    });
  });
});

describe('MediaSourcePtsCadenceVersionEvidenceBackfillWorkerV1', () => {
  beforeEach(prepareAuth);
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('authenticates at request time and rejects payload expansion', async () => {
    const runtime = runtimePort();
    const handler =
      createAuthenticatedMediaSourcePtsCadenceVersionEvidenceBackfillWorkerV1({
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
    const rejected = await handler(
      request(initializeMessage()) as NextRequest,
    );
    expect(rejected.status).toBe(503);
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: 'INTERNAL_WORKER_AUTH_NOT_CONFIGURED' },
    });
    expect(runtime.initialize).not.toHaveBeenCalled();
  });

  it('initializes and publishes the exact current revision', async () => {
    const runtime = runtimePort();
    const dispatch = confirmedDispatch();
    const handler =
      createAuthenticatedMediaSourcePtsCadenceVersionEvidenceBackfillWorkerV1({
        runtime,
        dispatch,
      });
    const response = await handler(
      request(initializeMessage()) as NextRequest,
    );
    expect(response.status).toBe(200);
    expect(runtime.initialize).toHaveBeenCalledWith({
      migrationRunId: RUNNING.migrationRunId,
      policyVersion: RUNNING.policyVersion,
    });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      message: nextMessage(RUNNING.recordSha256),
    }));
  });

  it('asks QStash to retry unavailable work without a new dispatch', async () => {
    const runtime = runtimePort({
      runNextBatch: vi.fn(async () => ({
        disposition: 'RUNTIME_UNAVAILABLE' as const,
        reason: 'PRIVATE_STORAGE_NOT_CONFIGURED' as const,
        record: RUNNING,
      })),
    });
    const dispatch = confirmedDispatch();
    const handler =
      createAuthenticatedMediaSourcePtsCadenceVersionEvidenceBackfillWorkerV1({
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

  it('dispatches the latest running revision for a stale delivery', async () => {
    const runtime = runtimePort({
      runNextBatch: vi.fn(async () => ({
        disposition: 'SUPERSEDED' as const,
        record: RUNNING,
      })),
    });
    const dispatch = confirmedDispatch();
    const handler =
      createAuthenticatedMediaSourcePtsCadenceVersionEvidenceBackfillWorkerV1({
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

  it('returns retryable evidence when continuation is unconfirmed', async () => {
    const dispatch = vi.fn(async () => ({
      disposition: 'UNCONFIRMED' as const,
      reason: 'QSTASH_PUBLISH_REJECTED' as const,
      messageId: null,
      deduplicationId: 'd'.repeat(64),
    }));
    const handler =
      createAuthenticatedMediaSourcePtsCadenceVersionEvidenceBackfillWorkerV1({
        runtime: runtimePort(),
        dispatch,
      });
    const response = await handler(
      request(initializeMessage()) as NextRequest,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('30');
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      continuation: { disposition: 'UNCONFIRMED' },
    });
  });

  it('stops terminal runs and exports a lazy app route', async () => {
    const failed =
      failMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(RUNNING, {
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
    const handler =
      createAuthenticatedMediaSourcePtsCadenceVersionEvidenceBackfillWorkerV1({
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
      '@/app/api/internal/workers/media-source-pts-cadence-version-evidence-backfill/route'
    );
    expect(route.runtime).toBe('nodejs');
    expect(route.maxDuration).toBe(300);
    expect(typeof route.POST).toBe('function');
  });
});

function prepareAuth() {
  auth.verifySignatureAppRouter.mockReset();
  auth.verifySignatureAppRouter.mockImplementation(
    (handler: unknown) => handler,
  );
  vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'test-current-signing-key');
  vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'test-next-signing-key');
}

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
  return { publishJSON } as Readonly<
    MediaSourcePtsCadenceVersionEvidenceBackfillQStashPublisherV1
  > & { publishJSON: typeof publishJSON };
}

function confirmedDispatch() {
  return vi.fn(async () => ({
    disposition: 'DISPATCHED' as const,
    messageId: 'message-next',
    deduplicationId: 'c'.repeat(64),
  }));
}

function runtimePort(input: Readonly<{
  runNextBatch?:
    MediaSourcePtsCadenceVersionEvidenceBackfillRuntimeV1['runNextBatch'];
}> = {}) {
  const initialize = vi.fn(async (
    _input: Parameters<
      MediaSourcePtsCadenceVersionEvidenceBackfillRuntimeV1['initialize']
    >[0],
  ) => ({
      disposition: 'CREATED' as const,
      record: RUNNING,
    }));
  const runNextBatch = vi.fn(async (
    value: Parameters<
      MediaSourcePtsCadenceVersionEvidenceBackfillRuntimeV1['runNextBatch']
    >[0],
  ) => input.runNextBatch ? input.runNextBatch(value) : ({
      disposition: 'SUPERSEDED' as const,
      record: RUNNING,
    }));
  return { initialize, runNextBatch } satisfies
    MediaSourcePtsCadenceVersionEvidenceBackfillRuntimeV1;
}

function request(body: unknown): NextRequest {
  return new NextRequest(
    'https://editron.example/api/internal/workers/media-source-pts-cadence-version-evidence-backfill',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}
