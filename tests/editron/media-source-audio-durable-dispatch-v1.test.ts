import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  verifySignatureAppRouter: vi.fn((handler: unknown) => handler),
}));
vi.mock('@upstash/qstash/nextjs', () => ({
  verifySignatureAppRouter: auth.verifySignatureAppRouter,
}));

import { NextRequest } from 'next/server';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import {
  dispatchMediaSourceAudioDurableJobV1,
  recoverMediaSourceAudioDurableJobsV1,
  resolveMediaSourceAudioDurableDispatchConfigurationV1,
  type MediaSourceAudioDurableDispatchEnvironmentV1,
  type MediaSourceAudioQStashPublisherV1,
} from '@/lib/editron/services/media-source-audio-durable-dispatch-v1';
import { createOrGetMediaSourceAudioDurableJobV1 }
  from '@/lib/editron/services/media-source-audio-durable-job-v1';
import { createAuthenticatedMediaSourceAudioDurableWorkerV1 }
  from '@/lib/editron/services/media-source-audio-durable-worker-route-v1';
import type { MediaSourceAudioSampleEpochResourcePolicyV1 }
  from '@/lib/editron/services/media-source-audio-sample-epoch-map-v1';
import {
  createMediaSourceQualificationV1,
  type MediaSourceQualificationRecordV1,
} from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const START = new Date('2026-08-30T17:00:00.000Z');
const ENV: MediaSourceAudioDurableDispatchEnvironmentV1 = {
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
type PublishInputV1 = Parameters<
  MediaSourceAudioQStashPublisherV1['publishJSON']
>[0];
type PublishResultV1 = ReturnType<
  MediaSourceAudioQStashPublisherV1['publishJSON']
>;

describe('MediaSourceAudioDurableDispatchV1', () => {
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
    await expect(dispatchMediaSourceAudioDurableJobV1({
      ...dispatchRequest(),
      jobStore: { createOrGet, recordDispatch: vi.fn() },
      env: { ...ENV, QSTASH_NEXT_SIGNING_KEY: undefined },
      publisher: publisher('unused-message'),
    })).rejects.toThrow(
      'MEDIA_SOURCE_AUDIO_DISPATCH_MISSING_QSTASH_SIGNING_KEYS',
    );
    expect(createOrGet).not.toHaveBeenCalled();
  });

  it('publishes jobId only, records delivery and does not republish replay', async () => {
    const setup = jobStore();
    const publishJSON = vi.fn<[PublishInputV1], PublishResultV1>(
      async () => ({ messageId: 'message-audio-1' }),
    );
    const first = await dispatchMediaSourceAudioDurableJobV1({
      ...dispatchRequest(),
      jobStore: setup.store,
      env: ENV,
      publisher: { publishJSON },
      now: START,
    });

    expect(first).toMatchObject({
      state: 'dispatched', created: true, messageId: 'message-audio-1',
    });
    expect(publishJSON).toHaveBeenCalledOnce();
    const published = publishJSON.mock.calls[0]![0];
    expect(published.url).toBe(
      'https://editron-preview.example.test/api/internal/workers/media-source-audio-materialization',
    );
    expect(published.body).toEqual({ jobId: first.jobId });
    expect(Object.keys(published.body as object)).toEqual(['jobId']);
    expect(published.deduplicationId).toBe(first.jobId);
    expect(published).toMatchObject({
      retries: 2, retryDelay: '30000', timeout: 300,
    });
    expect(published).not.toHaveProperty('headers');
    await expect(setup.store.getAuthorized({
      jobId: first.jobId,
      tenantId: 'tenant-audio-dispatch',
      userId: 'user-audio-dispatch',
    })).resolves.toMatchObject({
      operationOwner: 'MEDIA_ASSETS',
      operationKind: 'media_source_audio_materialization',
      input: { schemaId: 'EDITRON_MEDIA_SOURCE_AUDIO_DURABLE_JOB_INPUT_V1_1' },
      dispatchMessageId: 'message-audio-1',
      dispatchCount: 1,
    });

    await expect(dispatchMediaSourceAudioDurableJobV1({
      ...dispatchRequest(),
      jobStore: setup.store,
      env: ENV,
      publisher: { publishJSON },
      now: START,
    })).resolves.toMatchObject({
      state: 'already_dispatched',
      jobId: first.jobId,
      messageId: 'message-audio-1',
    });
    expect(publishJSON).toHaveBeenCalledOnce();
  });

  it('distinguishes an unconfirmed send from an unrecorded delivery', async () => {
    const unconfirmed = jobStore();
    await expect(dispatchMediaSourceAudioDurableJobV1({
      ...dispatchRequest(),
      jobStore: unconfirmed.store,
      env: ENV,
      publisher: { publishJSON: vi.fn(async () => ({})) },
      now: START,
    })).resolves.toMatchObject({
      state: 'dispatch_unconfirmed', reason: 'QSTASH_MESSAGE_ID_MISSING',
    });

    const unknown = jobStore();
    await expect(dispatchMediaSourceAudioDurableJobV1({
      ...dispatchRequest(),
      jobStore: {
        createOrGet: unknown.store.createOrGet.bind(unknown.store),
        recordDispatch: vi.fn(async () => {
          throw new Error('mongo unavailable');
        }),
      },
      env: ENV,
      publisher: publisher('message-audio-maybe-delivered'),
      now: START,
    })).resolves.toMatchObject({
      state: 'delivery_unknown',
      messageId: 'message-audio-maybe-delivered',
      reason: 'DISPATCH_RECEIPT_NOT_RECORDED',
    });
  });

  it('recovers only stale source-audio jobs with state-bound deduplication', async () => {
    const setup = jobStore();
    const source = sourceFixture();
    const created = await createOrGetMediaSourceAudioDurableJobV1({
      jobStore: setup.store,
      request: requestFor(source),
      now: START,
    });
    const wrongFamily = {
      ...created.job,
      jobId: 'dwj_pts_job',
      operationKind: 'media_source_pts_cadence_epoch_scan',
    };
    const fresh = {
      ...created.job,
      jobId: 'dwj_fresh_audio_job',
      updatedAt: new Date(START.getTime() + 120_000).toISOString(),
    };
    const listRecoverable = vi.fn(async () => [created.job, wrongFamily, fresh]);
    const publishJSON = vi.fn<[PublishInputV1], PublishResultV1>(
      async () => ({ messageId: 'message-audio-recovery' }),
    );

    const result = await recoverMediaSourceAudioDurableJobsV1({
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
      messageId: 'message-audio-recovery',
    }]);
    expect(publishJSON.mock.calls[0]![0].body)
      .toEqual({ jobId: created.job.jobId });
    expect(publishJSON.mock.calls[0]![0].deduplicationId)
      .toMatch(/^[a-f0-9]{64}$/);
  });

  it('authenticates at request time and rejects payload beyond jobId', async () => {
    const run = vi.fn(async () => ({
      kind: 'completed' as const,
      jobId: 'dwj_audio_job_1',
      disposition: 'PASS' as const,
      receiptSha256: 'd'.repeat(64),
    }));
    const handler = createAuthenticatedMediaSourceAudioDurableWorkerV1({
      run,
      workerId: 'worker-audio-1',
    });
    const invalid = await handler(request({
      jobId: 'dwj_audio_job_1',
      sourceUrl: 'https://must-not-enter.example/source.mov',
    }) as NextRequest);
    expect(invalid.status).toBe(400);
    expect(run).not.toHaveBeenCalled();

    const success = await handler(
      request({ jobId: 'dwj_audio_job_1' }) as NextRequest,
    );
    expect(success.status).toBe(200);
    await expect(success.json()).resolves.toMatchObject({
      success: true,
      jobId: 'dwj_audio_job_1',
      result: { kind: 'completed', disposition: 'PASS' },
    });
    expect(run).toHaveBeenCalledWith({
      jobId: 'dwj_audio_job_1', workerId: 'worker-audio-1',
    });

    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', '');
    const rejected = await handler(
      request({ jobId: 'dwj_audio_job_1' }) as NextRequest,
    );
    expect(rejected.status).toBe(503);
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: 'INTERNAL_WORKER_AUTH_NOT_CONFIGURED' },
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('returns retryable HTTP evidence for runtime and lease deferral', async () => {
    const runtimeUnavailable = createAuthenticatedMediaSourceAudioDurableWorkerV1({
      run: async () => ({
        kind: 'runtime_unavailable',
        reason: 'PRIVATE_STORAGE_NOT_CONFIGURED',
      }),
      workerId: 'worker-audio-1',
    });
    const unavailable = await runtimeUnavailable(
      request({ jobId: 'dwj_audio_job_1' }) as NextRequest,
    );
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('retry-after')).toBe('30');
    await expect(unavailable.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: 'MEDIA_SOURCE_AUDIO_WORKER_PRIVATE_STORAGE_NOT_CONFIGURED',
      },
    });

    const retryWait = createAuthenticatedMediaSourceAudioDurableWorkerV1({
      run: async () => ({
        kind: 'retry_wait',
        jobId: 'dwj_audio_job_1',
        errorCode: 'TEMPORARY_FAILURE',
      }),
      workerId: 'worker-audio-1',
    });
    const retry = await retryWait(
      request({ jobId: 'dwj_audio_job_1' }) as NextRequest,
    );
    expect(retry.status).toBe(503);
    expect(retry.headers.get('retry-after')).toBe('30');
    await expect(retry.json()).resolves.toMatchObject({
      success: true, result: { kind: 'retry_wait' },
    });
  });

  it('resolves only secure origin configuration and exports a lazy route', async () => {
    expect(resolveMediaSourceAudioDurableDispatchConfigurationV1({
      ...ENV,
      VERCEL_URL: undefined,
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    })).toMatchObject({ configured: false, reason: 'INVALID_PUBLIC_ORIGIN' });
    expect(resolveMediaSourceAudioDurableDispatchConfigurationV1(ENV))
      .toMatchObject({
        configured: true,
        workerUrl:
          'https://editron-preview.example.test/api/internal/workers/media-source-audio-materialization',
      });

    vi.resetModules();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const route = await import(
      '@/app/api/internal/workers/media-source-audio-materialization/route'
    );
    expect(Object.keys(route).sort()).toEqual(['POST', 'maxDuration', 'runtime']);
    expect(route.runtime).toBe('nodejs');
    expect(route.maxDuration).toBe(300);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

function publisher(messageId: string): MediaSourceAudioQStashPublisherV1 {
  return { publishJSON: vi.fn(async () => ({ messageId })) };
}

function dispatchRequest() {
  const source = sourceFixture();
  return {
    deliveryPolicy: DELIVERY_POLICY,
    actor: {
      tenantId: 'tenant-audio-dispatch',
      userId: 'user-audio-dispatch',
      orgId: null,
    },
    request: {
      assetId: 'asset-audio-dispatch',
      sourceVersion: source.sourceVersion,
      qualification: source.qualification,
      resourcePolicy: resourcePolicy(),
    },
  };
}

function requestFor(source: ReturnType<typeof sourceFixture>) {
  return {
    tenantId: 'tenant-audio-dispatch',
    userId: 'user-audio-dispatch',
    orgId: null,
    assetId: 'asset-audio-dispatch',
    sourceVersion: source.sourceVersion,
    qualification: source.qualification,
    resourcePolicy: resourcePolicy(),
  };
}

function jobStore() {
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  return {
    store: new DurableWorkflowJobStoreV1(
      async () => collection.asCollection(),
    ),
  };
}

function request(body: unknown): NextRequest {
  return new NextRequest(
    'https://editron.example/api/internal/workers/media-source-audio-materialization',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

function sourceFixture() {
  const locator = {
    provider: 'R2' as const,
    objectKey: 'uploads/source-audio.mov',
  };
  const storageVersion = createMediaSourceStorageVersionV1({
    locator,
    byteLength: 1_000,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-audio' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-audio-dispatch' },
    assetId: 'asset-audio-dispatch',
    mediaKind: 'video',
    byteLength: 1_000,
    contentSha256: 'a'.repeat(64),
    storageVersion,
  });
  const created = createMediaSourceQualificationV1({
    asset: {
      assetId: sourceVersion.assetId,
      source: 'user-upload',
      r2Key: locator.objectKey,
    },
    now: START,
  });
  if (created.disposition !== 'CREATED') throw new Error('TEST_FIXTURE_INVALID');
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: 'mov',
    durationMilliseconds: 10_000,
    startTimeMilliseconds: 0,
    videoStreams: [],
    audioStreams: [{
      streamIndex: 3,
      codec: 'pcm_s24le',
      sampleRate: '48000',
      channelCount: 2,
      channelLayout: 'stereo',
      sourceTimebase: { numerator: '1', denominator: '48000' },
      sourceStartPts: '0',
      sourceDurationTicks: '480000',
    }],
  };
  const qualification: MediaSourceQualificationRecordV1 = {
    ...created.record,
    status: 'MEASURED_TECHNICAL',
    attemptCount: 1,
    startedAt: START.toISOString(),
    completedAt: START.toISOString(),
    storageVersion,
    observation: {
      ...observationMaterial,
      observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
    },
  };
  return { qualification, sourceVersion };
}

function resourcePolicy(): MediaSourceAudioSampleEpochResourcePolicyV1 {
  return {
    policyVersion: 'audio-durable-dispatch-test-v1',
    maxSourceBytes: 1_000,
    maxCanonicalJsonBytes: 100_000,
    maxDecodedFrameEntries: 10,
    maxEpochEntries: 10,
    maxDecodedSampleFrames: 1_000_000,
    maxDecodedPcmBytes: 8_000_000,
    timeoutMs: 1_000,
  };
}
