import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';

import { CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1 }
  from '@/lib/editron/contracts/canonical-media-time-v1';
import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  createMediaSourcePtsCadenceEpochIndexSidecarV3,
  createMediaSourcePtsCadenceEpochIndexV3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-index-v3';
import { serializeMediaSourcePtsCadenceFrameBatchV2 }
  from '@/lib/editron/services/media-source-pts-cadence-frame-batch-v2';
import { createMediaSourcePtsCadenceFrameBatchSidecarV2 }
  from '@/lib/editron/services/media-source-pts-cadence-manifest-index-v2';
import { mediaSourcePtsCadenceMapBindingSha256V1 }
  from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import { createMediaSourcePtsCadenceR2EpochIndexWriterV3 }
  from '@/lib/editron/services/media-source-pts-cadence-r2-epoch-index-writer-v3';
import { createMediaSourcePtsCadenceShardV1 }
  from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';

describe('media source PTS cadence R2 epoch-index writer V3', () => {
  it('immutably writes, exactly rereads, and safely replays one V3 index', async () => {
    const fixture = epochIndexFixture();
    const memory = memoryClient();
    const writer = createMediaSourcePtsCadenceR2EpochIndexWriterV3({
      privateStorage: privateStorage(),
      client: memory.client,
    });

    await expect(writer.writeImmutableEpochIndex(fixture)).resolves.toEqual(fixture.expected);
    await expect(writer.writeImmutableEpochIndex(fixture)).resolves.toEqual(fixture.expected);

    const puts = memory.commands.filter(
      (command): command is PutObjectCommand => command instanceof PutObjectCommand,
    );
    expect(puts).toHaveLength(2);
    expect(puts[0]!.input).toMatchObject({
      Bucket: 'editron-media-pts-private',
      Key: fixture.expected.objectKey,
      ContentLength: fixture.serialization.byteLength,
      ContentType: 'application/json; charset=utf-8',
      CacheControl: 'no-store',
      IfNoneMatch: '*',
      Metadata: {
        'content-sha256': fixture.expected.contentSha256,
        'source-version-sha256': fixture.expected.sourceVersionSha256,
        'map-binding-sha256': fixture.expected.mapBindingSha256,
      },
    });
    expect(Buffer.from(puts[0]!.input.Body as Uint8Array).toString('utf8'))
      .toBe(fixture.serialization.canonicalJson);
    expect(memory.commands.filter((command) => command instanceof GetObjectCommand))
      .toHaveLength(2);
  });

  it('rejects a forged expected sidecar before object access', async () => {
    const fixture = epochIndexFixture();
    const memory = memoryClient();
    const writer = createMediaSourcePtsCadenceR2EpochIndexWriterV3({
      privateStorage: privateStorage(), client: memory.client,
    });

    await expect(writer.writeImmutableEpochIndex({
      ...fixture,
      expected: { ...fixture.expected, contentSha256: 'f'.repeat(64) },
    })).rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_V3_EPOCH_INDEX_EXPECTED_MISMATCH');
    expect(memory.commands).toHaveLength(0);
  });

  it('fails closed when a colliding object is not the expected content', async () => {
    const fixture = epochIndexFixture();
    const memory = memoryClient();
    memory.objects.set(fixture.expected.objectKey, Buffer.from('corrupt', 'utf8'));
    const writer = createMediaSourcePtsCadenceR2EpochIndexWriterV3({
      privateStorage: privateStorage(), client: memory.client,
    });

    await expect(writer.writeImmutableEpochIndex(fixture))
      .rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_V3_CONTENT_MISMATCH');
  });

  it('rejects unsafe storage and non-precondition write failures', async () => {
    const fixture = epochIndexFixture();
    expect(() => createMediaSourcePtsCadenceR2EpochIndexWriterV3({
      privateStorage: { ...privateStorage(), bucketName: 'editron-cdn' },
      client: memoryClient().client,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_PRIVATE_STORAGE_PUBLIC_BUCKET_FORBIDDEN');

    const writer = createMediaSourcePtsCadenceR2EpochIndexWriterV3({
      privateStorage: privateStorage(),
      client: { send: async () => { throw new Error('offline'); } },
    });
    await expect(writer.writeImmutableEpochIndex(fixture))
      .rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_V3_EPOCH_INDEX_WRITE_FAILED');
  });
});

function epochIndexFixture() {
  const sourceTimebase = { numerator: '1', denominator: '1000' } as const;
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/epoch-writer.mov' },
    byteLength: 10_000,
    providerVersion: { kind: 'R2_ETAG', value: 'epoch-writer-etag' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-epoch-writer',
    mediaKind: 'video',
    byteLength: 10_000,
    contentSha256: '1'.repeat(64),
    storageVersion,
  });
  const observation = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: 'mov', durationMilliseconds: 2_000, startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0, codec: 'h264', codedWidth: 1920, codedHeight: 1080,
      pixelFormat: 'yuv420p', sourceTimebase, sourceStartPts: '0',
      sourceDurationTicks: '2000', averageFrameRate: { numerator: '1', denominator: '1' },
      realFrameRate: { numerator: '1', denominator: '1' }, frameCount: '2',
      colorSpace: 'bt709', colorTransfer: 'bt709', colorPrimaries: 'bt709',
      colorRange: 'tv', timecode: null, reelId: null,
    }],
    audioStreams: [],
  };
  const qualification = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1' as const,
    status: 'MEASURED_TECHNICAL' as const,
    assetId: sourceVersion.assetId,
    locator: storageVersion.locator,
    sourceBindingSha256: '2'.repeat(64),
    requestId: 'epoch-index-writer-fixture', attemptCount: 1,
    requestedAt: '2026-08-30T00:00:00.000Z',
    startedAt: '2026-08-30T00:00:01.000Z',
    completedAt: '2026-08-30T00:00:02.000Z',
    storageVersion,
    observation: { ...observation, observationSha256: hashEditronCanonicalJsonV1(observation) },
    diagnostic: null,
  };
  const frames = [
    { presentationTimestampTicks: '0', durationTicks: '1000' },
    { presentationTimestampTicks: '1000', durationTicks: '1000' },
  ];
  const shard = createMediaSourcePtsCadenceShardV1({
    sourceVersion, qualification, videoStreamIndex: 0,
    mapper: {
      mapperVersion: 'epoch-writer-v3', ffprobeVersion: 'ffprobe-8.1',
      commandPolicyVersion: 'epoch-writer-policy-v3',
      timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
    },
    shardSequence: 0, firstFrameOrdinal: '0', frames,
  });
  const mapBindingSha256 = mediaSourcePtsCadenceMapBindingSha256V1(shard);
  const batch = serializeMediaSourcePtsCadenceFrameBatchV2({
    mapBindingSha256,
    resourcePolicy: {
      policyVersion: 'epoch-writer-policy-v3',
      maxCanonicalJsonBytes: 16_384, maxFrameRecords: 10,
    },
    shard, frames,
  });
  const batchSidecar = createMediaSourcePtsCadenceFrameBatchSidecarV2({
    storage: 'R2_PRIVATE', serialization: batch,
  });
  const serialization = createMediaSourcePtsCadenceEpochIndexV3({
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    mapBindingSha256, videoStreamIndex: 0, sourceTimebase,
    resourcePolicy: {
      policyVersion: 'epoch-index-writer-policy-v3',
      maxCanonicalJsonBytes: 100_000, maxEpochEntries: 10, maxBatchEntries: 10,
    },
    epochs: [{
      epoch: {
        schemaVersion: 1,
        contractVersion: CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
        kind: 'presentation-epoch', epochId: 'epoch-0', streamId: 'video-0',
        secondsPerSourceTick: sourceTimebase,
        sourceStartPresentationTimestampTicks: '0',
        sourceEndExclusivePresentationTimestampTicks: '2000',
        canonicalStartTime: { ticks: '0', timescale: '1' },
        boundaryKind: 'INITIAL',
      },
      boundary: {
        classificationBasis: 'FIRST_DECODED_PRESENTATION',
        detectorVersion: 'epoch-writer-detector-v3', externalEvidence: null,
      },
      batches: [{ serialization: batch, sidecar: batchSidecar }],
    }],
  });
  return {
    serialization,
    expected: createMediaSourcePtsCadenceEpochIndexSidecarV3({
      storage: 'R2_PRIVATE', serialization,
    }),
  };
}

function privateStorage() {
  return {
    bucketName: 'editron-media-pts-private',
    browserRouteExposure: 'NO_BROWSER_ROUTE' as const,
    storagePolicyVersion: 'private-pts-r2-v1',
  };
}

function memoryClient() {
  const objects = new Map<string, Uint8Array>();
  const commands: unknown[] = [];
  return {
    objects,
    commands,
    client: {
      async send(command: unknown): Promise<unknown> {
        commands.push(command);
        if (command instanceof PutObjectCommand) {
          const key = String(command.input.Key);
          if (objects.has(key)) {
            throw Object.assign(new Error('collision'), {
              name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 },
            });
          }
          const body = command.input.Body;
          if (!(body instanceof Uint8Array)) throw new Error('TEST_BODY_INVALID');
          objects.set(key, Uint8Array.from(body));
          return {};
        }
        if (command instanceof GetObjectCommand) {
          const value = objects.get(String(command.input.Key));
          if (!value) throw new Error('TEST_OBJECT_MISSING');
          return { Body: Uint8Array.from(value) };
        }
        throw new Error('TEST_COMMAND_UNEXPECTED');
      },
    },
  };
}
