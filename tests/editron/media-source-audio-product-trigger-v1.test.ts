import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import { dispatchMediaSourceAudioDurableJobV1 }
  from '@/lib/editron/services/media-source-audio-durable-dispatch-v1';
import {
  triggerQualifiedMediaSourceAudioMaterializationV1,
  type MediaSourceAudioProductTriggerEnvironmentV1,
} from '@/lib/editron/services/media-source-audio-product-trigger-v1';
import {
  createMediaSourceQualificationV1,
  type MediaSourceQualificationRecordV1,
} from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const NOW = new Date('2026-08-30T18:00:00.000Z');
const ENVIRONMENT: MediaSourceAudioProductTriggerEnvironmentV1 = {
  QSTASH_TOKEN: 'test-qstash-token',
  QSTASH_CURRENT_SIGNING_KEY: 'test-current-signing-key',
  QSTASH_NEXT_SIGNING_KEY: 'test-next-signing-key',
  VERCEL_URL: 'editron-preview.example.test',
  EDITRON_MEDIA_AUDIO_POLICY_VERSION: 'audio-product-test-v1',
  EDITRON_MEDIA_AUDIO_MAX_SOURCE_BYTES: '1000',
  EDITRON_MEDIA_AUDIO_MAX_CANONICAL_JSON_BYTES: '100000',
  EDITRON_MEDIA_AUDIO_MAX_DECODED_FRAME_ENTRIES: '100',
  EDITRON_MEDIA_AUDIO_MAX_EPOCH_ENTRIES: '100',
  EDITRON_MEDIA_AUDIO_MAX_DECODED_SAMPLE_FRAMES: '1000000',
  EDITRON_MEDIA_AUDIO_MAX_DECODED_PCM_BYTES: '8000000',
  EDITRON_MEDIA_AUDIO_TIMEOUT_MS: '1000',
};

type DispatchInputV1 = Parameters<
  typeof dispatchMediaSourceAudioDurableJobV1
>[0];

describe('MediaSourceAudioProductTriggerV1', () => {
  it.each(['video', 'audio'] as const)(
    'persists an exact %s source job before signed dispatch',
    async (mediaKind) => {
      const fixture = sourceFixture({ mediaKind });
      const setup = jobStore();
      const dispatch = vi.fn(async (input: DispatchInputV1) => ({
        state: 'dispatched' as const,
        jobId: 'dispatcher-reloads-the-same-job',
        created: false,
        messageId: 'qstash-audio-message-1',
        observedInput: input,
      }));

      const result = await triggerQualifiedMediaSourceAudioMaterializationV1(
        fixture.message,
        {
          assetStore: assetStore(fixture.asset),
          jobStore: setup.store,
          dispatch,
          environment: ENVIRONMENT,
          now: NOW,
        },
      );

      expect(result).toMatchObject({
        disposition: 'SCHEDULED',
        created: true,
        delivery: 'CONFIRMED',
        messageId: 'qstash-audio-message-1',
      });
      expect(dispatch).toHaveBeenCalledOnce();
      const dispatched = dispatch.mock.calls[0]![0];
      expect(dispatched.actor).toEqual({
        tenantId: 'user-audio-trigger',
        userId: 'user-audio-trigger',
        orgId: null,
      });
      expect(dispatched.request).toMatchObject({
        assetId: 'asset-audio-trigger',
        sourceVersion: {
          mediaKind,
          byteLength: 1_000,
        },
        resourcePolicy: {
          policyVersion: 'audio-product-test-v1',
          maxSourceBytes: 1_000,
          maxDecodedSampleFrames: 1_000_000,
          maxDecodedPcmBytes: 8_000_000,
        },
      });
      expect(setup.collection.snapshot()).toHaveLength(1);
      expect(setup.collection.snapshot()[0]).toMatchObject({
        status: 'queued',
        operationOwner: 'MEDIA_ASSETS',
        operationKind: 'media_source_audio_materialization',
        input: {
          payload: {
            assetId: 'asset-audio-trigger',
            resourcePolicy: { maxSourceBytes: 1_000 },
          },
        },
      });
    },
  );

  it('defers missing or malformed deployment policy before job creation', async () => {
    const fixture = sourceFixture({});
    const createOrGet = vi.fn();
    const dispatch = vi.fn();
    const jobStore = { createOrGet, recordDispatch: vi.fn() };

    await expect(triggerQualifiedMediaSourceAudioMaterializationV1(
      fixture.message,
      {
        assetStore: assetStore(fixture.asset),
        jobStore,
        dispatch,
        environment: {
          QSTASH_TOKEN: 'configured-but-policy-absent',
        },
      },
    )).resolves.toEqual({
      disposition: 'DELIVERY_DEFERRED',
      jobId: null,
      created: false,
      reason: 'RESOURCE_POLICY_NOT_CONFIGURED',
    });

    await expect(triggerQualifiedMediaSourceAudioMaterializationV1(
      fixture.message,
      {
        assetStore: assetStore(fixture.asset),
        jobStore,
        dispatch,
        environment: {
          ...ENVIRONMENT,
          EDITRON_MEDIA_AUDIO_MAX_DECODED_PCM_BYTES: '7999999',
        },
      },
    )).resolves.toEqual({
      disposition: 'DELIVERY_DEFERRED',
      jobId: null,
      created: false,
      reason: 'RESOURCE_POLICY_INVALID',
    });
    expect(createOrGet).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not invent audio work for a measured source with no audio streams', async () => {
    const fixture = sourceFixture({ audioStreams: [] });
    const createOrGet = vi.fn();
    const dispatch = vi.fn();

    await expect(triggerQualifiedMediaSourceAudioMaterializationV1(
      fixture.message,
      {
        assetStore: assetStore(fixture.asset),
        jobStore: { createOrGet, recordDispatch: vi.fn() },
        dispatch,
        environment: {},
      },
    )).resolves.toEqual({
      disposition: 'NOT_ELIGIBLE',
      reason: 'NO_AUDIO_PROOF_REQUIRED',
    });
    expect(createOrGet).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('classifies stale, pending, unverifiable and tampered evidence without mutation', async () => {
    const measured = sourceFixture({});
    const createOrGet = vi.fn();
    const dispatch = vi.fn();
    const dependencies = {
      jobStore: { createOrGet, recordDispatch: vi.fn() },
      dispatch,
      environment: ENVIRONMENT,
    };

    await expect(triggerQualifiedMediaSourceAudioMaterializationV1(
      { ...measured.message, sourceBindingSha256: 'f'.repeat(64) },
      { ...dependencies, assetStore: assetStore(measured.asset) },
    )).resolves.toEqual({
      disposition: 'NOT_ELIGIBLE',
      reason: 'SOURCE_BINDING_SUPERSEDED',
    });

    for (const [status, expected] of [
      ['PENDING', {
        disposition: 'NOT_READY', reason: 'QUALIFICATION_NOT_TERMINAL',
      }],
      ['UNVERIFIABLE', {
        disposition: 'NOT_ELIGIBLE', reason: 'QUALIFICATION_UNVERIFIABLE',
      }],
    ] as const) {
      const asset = structuredClone(measured.asset);
      asset.sourceQualificationV1.status = status;
      await expect(triggerQualifiedMediaSourceAudioMaterializationV1(
        measured.message,
        { ...dependencies, assetStore: assetStore(asset) },
      )).resolves.toEqual(expected);
    }

    const tampered = structuredClone(measured.asset);
    tampered.sourceQualificationV1.observation!.audioStreams[0]!.channelCount = 6;
    await expect(triggerQualifiedMediaSourceAudioMaterializationV1(
      measured.message,
      { ...dependencies, assetStore: assetStore(tampered) },
    )).resolves.toEqual({
      disposition: 'NOT_ELIGIBLE',
      reason: 'AUDIO_STREAM_EVIDENCE_INVALID',
    });
    expect(createOrGet).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects a source above the configured admission ceiling', async () => {
    const fixture = sourceFixture({});
    const createOrGet = vi.fn();
    const dispatch = vi.fn();

    await expect(triggerQualifiedMediaSourceAudioMaterializationV1(
      fixture.message,
      {
        assetStore: assetStore(fixture.asset),
        jobStore: { createOrGet, recordDispatch: vi.fn() },
        dispatch,
        environment: {
          ...ENVIRONMENT,
          EDITRON_MEDIA_AUDIO_MAX_SOURCE_BYTES: '999',
        },
      },
    )).resolves.toEqual({
      disposition: 'NOT_ELIGIBLE',
      reason: 'SOURCE_EXCEEDS_RESOURCE_POLICY',
    });
    expect(createOrGet).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('retains the queued intent when signed delivery is unavailable', async () => {
    const fixture = sourceFixture({});
    const setup = jobStore();

    const result = await triggerQualifiedMediaSourceAudioMaterializationV1(
      fixture.message,
      {
        assetStore: assetStore(fixture.asset),
        jobStore: setup.store,
        dispatch: vi.fn(async () => {
          throw new Error('TRANSPORT_UNAVAILABLE');
        }),
        environment: ENVIRONMENT,
        now: NOW,
      },
    );

    expect(result).toMatchObject({
      disposition: 'DELIVERY_DEFERRED',
      created: true,
      reason: 'DISPATCH_RUNTIME_UNAVAILABLE',
    });
    if (result.disposition !== 'DELIVERY_DEFERRED') {
      throw new Error('EXPECTED_DELIVERY_DEFERRED');
    }
    expect(result.jobId).toMatch(/^dwj_/);
    expect(setup.collection.snapshot()).toHaveLength(1);
    expect(setup.collection.snapshot()[0]).toMatchObject({
      _id: result.jobId,
      status: 'queued',
      dispatchCount: 0,
      dispatchMessageId: null,
    });
  });
});

function jobStore() {
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  return {
    collection,
    store: new DurableWorkflowJobStoreV1(
      async () => collection.asCollection(),
    ),
  };
}

function assetStore(asset: ReturnType<typeof sourceFixture>['asset']) {
  return { load: vi.fn(async () => asset) };
}

function sourceFixture(input: Readonly<{
  mediaKind?: 'audio' | 'video';
  audioStreams?: readonly Readonly<{
    streamIndex: number;
    channelCount: number;
  }>[];
}>) {
  const mediaKind = input.mediaKind ?? 'video';
  const locator = {
    provider: 'R2' as const,
    objectKey: `uploads/audio-product.${mediaKind === 'audio' ? 'wav' : 'mov'}`,
  };
  const storageVersion = createMediaSourceStorageVersionV1({
    locator,
    byteLength: 1_000,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-audio-product' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-audio-trigger' },
    assetId: 'asset-audio-trigger',
    mediaKind,
    byteLength: storageVersion.byteLength,
    contentSha256: 'a'.repeat(64),
    storageVersion,
  });
  const created = createMediaSourceQualificationV1({
    asset: {
      assetId: sourceVersion.assetId,
      source: 'user-upload',
      r2Key: locator.objectKey,
    },
    now: NOW,
  });
  if (created.disposition !== 'CREATED') throw new Error('TEST_FIXTURE_INVALID');
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: mediaKind === 'audio' ? 'wav' : 'mov',
    durationMilliseconds: 10_000,
    startTimeMilliseconds: 0,
    videoStreams: [],
    audioStreams: (input.audioStreams ?? [{
      streamIndex: 3,
      channelCount: 2,
    }]).map(({ streamIndex, channelCount }) => ({
      streamIndex,
      codec: 'pcm_s24le',
      sampleRate: '48000',
      channelCount,
      channelLayout: channelCount === 2 ? 'stereo' : `${channelCount} channels`,
      sourceTimebase: { numerator: '1', denominator: '48000' },
      sourceStartPts: '0',
      sourceDurationTicks: '480000',
    })),
  };
  const qualification: MediaSourceQualificationRecordV1 = {
    ...created.record,
    status: 'MEASURED_TECHNICAL',
    attemptCount: 1,
    startedAt: NOW.toISOString(),
    completedAt: NOW.toISOString(),
    storageVersion,
    observation: {
      ...observationMaterial,
      observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
    },
  };
  const asset = {
    assetId: sourceVersion.assetId,
    type: mediaKind,
    sourceVersionV1: sourceVersion,
    sourceQualificationV1: qualification,
  };
  return {
    asset,
    message: {
      assetId: sourceVersion.assetId,
      userId: 'user-audio-trigger',
      sourceBindingSha256: qualification.sourceBindingSha256,
    },
  };
}
