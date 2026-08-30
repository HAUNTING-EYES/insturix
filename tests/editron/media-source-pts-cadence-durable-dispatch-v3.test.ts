import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  verifySignatureAppRouter: vi.fn((handler: unknown) => handler),
}));
vi.mock('@upstash/qstash/nextjs', () => ({
  verifySignatureAppRouter: auth.verifySignatureAppRouter,
}));

import { NextRequest } from 'next/server';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import type { DurableWorkflowJobRecordV1 } from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 } from '@/lib/editron/services/durable-workflow-job-store-v1';
import {
  dispatchMediaSourcePtsCadenceDurableEpochJobV3,
  recoverMediaSourcePtsCadenceDurableEpochJobsV3,
  resolveMediaSourcePtsCadenceDurableEpochDispatchConfigurationV3,
  type MediaSourcePtsCadenceDurableEpochDispatchEnvironmentV3,
  type MediaSourcePtsCadenceEpochQStashPublisherV3,
} from '@/lib/editron/services/media-source-pts-cadence-durable-dispatch-v3';
import {
  createOrGetMediaSourcePtsCadenceDurableEpochJobV3,
} from '@/lib/editron/services/media-source-pts-cadence-durable-job-binding-v3';
import {
  createAuthenticatedMediaSourcePtsCadenceDurableEpochWorkerV3,
} from '@/lib/editron/services/media-source-pts-cadence-durable-worker-route-v3';
import { MEDIA_SOURCE_PROBE_VERSION_V1 }
  from '@/lib/editron/services/media-source-probe-v1';
import type { MediaSourceQualificationRecordV1 }
  from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const START = new Date('2026-08-30T11:00:00.000Z');
const ENV: MediaSourcePtsCadenceDurableEpochDispatchEnvironmentV3 = {
  QSTASH_TOKEN: 'test-qstash-token',
  QSTASH_CURRENT_SIGNING_KEY: 'test-current-signing-key',
  QSTASH_NEXT_SIGNING_KEY: 'test-next-signing-key',
  VERCEL_URL: 'editron-preview.example.test',
};
const DELIVERY_POLICY = Object.freeze({
  retries: 2,
  retryDelayMs: 30_000,
  timeoutSeconds: 300,
});
type PublishInputV3 = Parameters<
  MediaSourcePtsCadenceEpochQStashPublisherV3['publishJSON']
>[0];
type PublishResultV3 = ReturnType<
  MediaSourcePtsCadenceEpochQStashPublisherV3['publishJSON']
>;

describe('media source PTS cadence durable epoch dispatch V3', () => {
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

  it('fails closed before job creation when signed dispatch is incomplete', async () => {
    const createOrGet = vi.fn();
    await expect(dispatchMediaSourcePtsCadenceDurableEpochJobV3({
      ...dispatchRequest(),
      jobStore: { createOrGet, recordDispatch: vi.fn() },
      env: { ...ENV, QSTASH_NEXT_SIGNING_KEY: undefined },
      publisher: publisher('unused-message'),
    })).rejects.toThrow(
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_DISPATCH_MISSING_QSTASH_SIGNING_KEYS',
    );
    expect(createOrGet).not.toHaveBeenCalled();
  });

  it('publishes jobId only, records V3 delivery and does not republish replay', async () => {
    const setup = jobStore();
    const publishJSON = vi.fn<[PublishInputV3], PublishResultV3>(
      async () => ({ messageId: 'message-v3-1' }),
    );
    const first = await dispatchMediaSourcePtsCadenceDurableEpochJobV3({
      ...dispatchRequest(),
      jobStore: setup.store,
      env: ENV,
      publisher: { publishJSON },
      now: START,
    });
    expect(first).toMatchObject({
      state: 'dispatched',
      created: true,
      messageId: 'message-v3-1',
    });
    expect(publishJSON).toHaveBeenCalledOnce();
    const published = publishJSON.mock.calls[0]![0];
    expect(published.url).toBe(
      'https://editron-preview.example.test/api/internal/workers/media-source-pts-cadence-v3',
    );
    expect(published.body).toEqual({ jobId: first.jobId });
    expect(Object.keys(published.body as object)).toEqual(['jobId']);
    expect(published.deduplicationId).toBe(first.jobId);
    expect(published).toMatchObject({
      retries: 2,
      retryDelay: '30000',
      timeout: 300,
    });
    expect(published).not.toHaveProperty('headers');
    await expect(setup.store.getAuthorized({
      jobId: first.jobId,
      tenantId: 'tenant-1',
      userId: 'user-1',
    })).resolves.toMatchObject({
      operationOwner: 'MEDIA_ASSETS',
      operationKind: 'media_source_pts_cadence_epoch_scan',
      input: {
        schemaId:
          'EDITRON_MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_JOB_INPUT_V3_1',
      },
      dispatchMessageId: 'message-v3-1',
      dispatchCount: 1,
    });

    await expect(dispatchMediaSourcePtsCadenceDurableEpochJobV3({
      ...dispatchRequest(),
      jobStore: setup.store,
      env: ENV,
      publisher: { publishJSON },
      now: START,
    })).resolves.toMatchObject({
      state: 'already_dispatched',
      jobId: first.jobId,
      messageId: 'message-v3-1',
    });
    expect(publishJSON).toHaveBeenCalledOnce();
  });

  it('distinguishes unconfirmed send from delivered-but-unrecorded receipt', async () => {
    const unconfirmed = jobStore();
    await expect(dispatchMediaSourcePtsCadenceDurableEpochJobV3({
      ...dispatchRequest(),
      jobStore: unconfirmed.store,
      env: ENV,
      publisher: { publishJSON: vi.fn(async () => ({})) },
      now: START,
    })).resolves.toMatchObject({
      state: 'dispatch_unconfirmed',
      reason: 'QSTASH_MESSAGE_ID_MISSING',
    });

    const unknown = jobStore();
    await expect(dispatchMediaSourcePtsCadenceDurableEpochJobV3({
      ...dispatchRequest(),
      jobStore: {
        createOrGet: unknown.store.createOrGet.bind(unknown.store),
        recordDispatch: vi.fn(async () => {
          throw new Error('mongo unavailable');
        }),
      },
      env: ENV,
      publisher: publisher('message-v3-maybe-delivered'),
      now: START,
    })).resolves.toMatchObject({
      state: 'delivery_unknown',
      messageId: 'message-v3-maybe-delivered',
      reason: 'DISPATCH_RECEIPT_NOT_RECORDED',
    });
  });

  it('recovers only stale V3 epoch jobs with state-bound deduplication', async () => {
    const setup = jobStore();
    const source = sourceFixture();
    const created = await createOrGetMediaSourcePtsCadenceDurableEpochJobV3({
      jobStore: setup.store,
      request: {
        tenantId: 'tenant-1',
        userId: 'user-1',
        orgId: null,
        assetId: 'asset-1',
        sourceVersion: source.sourceVersion,
        qualification: source.qualification,
        videoStreamIndex: 0,
      },
      now: START,
    });
    const v1Kind = {
      ...created.job,
      jobId: 'dwj_v1_pts_job',
      operationKind: 'media_source_pts_cadence_scan',
    };
    const fresh = {
      ...created.job,
      jobId: 'dwj_fresh_v3_pts_job',
      updatedAt: new Date(START.getTime() + 120_000).toISOString(),
    };
    const listRecoverable = vi.fn(async () => [created.job, v1Kind, fresh]);
    const publishJSON = vi.fn<[PublishInputV3], PublishResultV3>(
      async () => ({ messageId: 'message-v3-recovery' }),
    );
    const result = await recoverMediaSourcePtsCadenceDurableEpochJobsV3({
      jobStore: {
        listRecoverable,
        recordDispatch: setup.store.recordDispatch.bind(setup.store),
      },
      staleBefore: new Date(START.getTime() + 60_000),
      deliveryPolicy: DELIVERY_POLICY,
      now: new Date(START.getTime() + 180_000),
      env: ENV,
      publisher: { publishJSON },
    });
    expect(result).toMatchObject({ scanned: 3, eligible: 1, skipped: 2 });
    expect(result.results).toEqual([{
      jobId: created.job.jobId,
      state: 'dispatched',
      messageId: 'message-v3-recovery',
    }]);
    const recoveryPublish = publishJSON.mock.calls[0]![0];
    expect(recoveryPublish.body).toEqual({ jobId: created.job.jobId });
    expect(recoveryPublish.deduplicationId).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects insecure or path-bearing origins', () => {
    expect(resolveMediaSourcePtsCadenceDurableEpochDispatchConfigurationV3({
      ...ENV,
      VERCEL_URL: undefined,
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    })).toMatchObject({
      configured: false,
      reason: 'INVALID_PUBLIC_ORIGIN',
    });
    expect(resolveMediaSourcePtsCadenceDurableEpochDispatchConfigurationV3({
      ...ENV,
      VERCEL_URL: undefined,
      NEXT_PUBLIC_APP_URL: 'https://app.insturix.example/path',
    })).toMatchObject({
      configured: false,
      reason: 'INVALID_PUBLIC_ORIGIN',
    });
  });

  it('authenticates at request time and rejects payload beyond jobId', async () => {
    const run = vi.fn(async () => ({
      kind: 'completed' as const,
      jobId: 'dwj_v3_job_1',
      disposition: 'PASS' as const,
      receiptSha256: 'd'.repeat(64),
    }));
    const handler = createAuthenticatedMediaSourcePtsCadenceDurableEpochWorkerV3({
      run,
      workerId: 'worker-v3-1',
    });
    const invalid = await handler(request({
      jobId: 'dwj_v3_job_1',
      sourceUrl: 'https://must-not-enter.example/source.mov',
    }) as NextRequest);
    expect(invalid.status).toBe(400);
    expect(run).not.toHaveBeenCalled();

    const success = await handler(
      request({ jobId: 'dwj_v3_job_1' }) as NextRequest,
    );
    expect(success.status).toBe(200);
    await expect(success.json()).resolves.toMatchObject({
      success: true,
      jobId: 'dwj_v3_job_1',
      result: { kind: 'completed', disposition: 'PASS' },
    });
    expect(run).toHaveBeenCalledWith({
      jobId: 'dwj_v3_job_1',
      workerId: 'worker-v3-1',
    });

    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', '');
    const rejected = await handler(
      request({ jobId: 'dwj_v3_job_1' }) as NextRequest,
    );
    expect(rejected.status).toBe(503);
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: 'INTERNAL_WORKER_AUTH_NOT_CONFIGURED' },
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('returns retryable HTTP evidence for deferred V3 work', async () => {
    const handler = createAuthenticatedMediaSourcePtsCadenceDurableEpochWorkerV3({
      run: async () => ({
        kind: 'deferred',
        jobId: 'dwj_v3_job_1',
        submissionId: 'mptsv3_submission_1',
      }),
      workerId: 'worker-v3-1',
    });
    const response = await handler(
      request({ jobId: 'dwj_v3_job_1' }) as NextRequest,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('30');
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      result: { kind: 'deferred' },
    });
  });

  it('exports a lazy V3 route without store or network I/O', async () => {
    vi.resetModules();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const route = await import(
      '@/app/api/internal/workers/media-source-pts-cadence-v3/route'
    );
    expect(Object.keys(route).sort()).toEqual(['POST', 'maxDuration', 'runtime']);
    expect(route.runtime).toBe('nodejs');
    expect(route.maxDuration).toBe(300);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

function publisher(messageId: string): MediaSourcePtsCadenceEpochQStashPublisherV3 {
  return { publishJSON: vi.fn(async () => ({ messageId })) };
}

function dispatchRequest() {
  const source = sourceFixture();
  return {
    deliveryPolicy: DELIVERY_POLICY,
    actor: { tenantId: 'tenant-1', userId: 'user-1', orgId: null },
    request: {
      assetId: 'asset-1',
      sourceVersion: source.sourceVersion,
      qualification: source.qualification,
      videoStreamIndex: 0,
    },
  };
}

function jobStore() {
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  return {
    collection,
    store: new DurableWorkflowJobStoreV1(
      async () => collection.asCollection(),
    ),
  };
}

function request(body: unknown): NextRequest {
  return new NextRequest(
    'https://editron.example/api/internal/workers/media-source-pts-cadence-v3',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

function sourceFixture() {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'uploads/source.mov' },
    byteLength: 1_000,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-1' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1',
    mediaKind: 'video',
    byteLength: 1_000,
    contentSha256: 'a'.repeat(64),
    storageVersion,
  });
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PROBE_VERSION_V1,
    probeVersion: `${MEDIA_SOURCE_PROBE_VERSION_V1}; ffprobe version 8.1`,
    formatName: 'mov',
    durationMilliseconds: 10_000,
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0,
      codec: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
      pixelFormat: 'yuv420p',
      sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0',
      sourceDurationTicks: '900000',
      averageFrameRate: { numerator: '30000', denominator: '1001' },
      realFrameRate: { numerator: '30000', denominator: '1001' },
      frameCount: '300',
      colorSpace: 'bt709',
      colorTransfer: 'bt709',
      colorPrimaries: 'bt709',
      colorRange: 'tv',
      timecode: null,
      reelId: null,
    }],
    audioStreams: [],
  };
  const qualification: MediaSourceQualificationRecordV1 = {
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
    status: 'MEASURED_TECHNICAL',
    assetId: 'asset-1',
    locator: storageVersion.locator,
    sourceBindingSha256: hashEditronCanonicalJsonV1({
      schemaVersion: 1,
      kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
      assetId: 'asset-1',
      locator: storageVersion.locator,
    }),
    requestId: 'media-source-probe:test-v3-dispatch',
    attemptCount: 1,
    requestedAt: START.toISOString(),
    startedAt: START.toISOString(),
    completedAt: START.toISOString(),
    storageVersion,
    observation: {
      ...observationMaterial,
      observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
    },
    diagnostic: null,
  };
  return { sourceVersion, qualification };
}
