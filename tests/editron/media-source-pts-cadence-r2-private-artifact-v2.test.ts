import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import { serializeMediaSourcePtsCadenceFrameBatchV2 } from '@/lib/editron/services/media-source-pts-cadence-frame-batch-v2';
import { createMediaSourcePtsCadenceManifestIndexSidecarV2 } from '@/lib/editron/services/media-source-pts-cadence-map-asset-state-v2';
import { mediaSourcePtsCadenceMapBindingSha256V1 } from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import {
  createMediaSourcePtsCadenceFrameBatchSidecarV2,
  createMediaSourcePtsCadenceManifestIndexV2,
} from '@/lib/editron/services/media-source-pts-cadence-manifest-index-v2';
import { createMediaSourcePtsCadenceR2PrivateArtifactPortV2 } from '@/lib/editron/services/media-source-pts-cadence-r2-private-sidecar-v1';
import { createMediaSourcePtsCadenceShardV1 } from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

describe('MediaSourcePtsCadenceR2PrivateArtifactV2', () => {
  it('immutably writes, exactly rereads, and safely resumes V2 frame and index artifacts', async () => {
    const fixture = v2Fixture();
    const memory = memoryR2();
    const port = createMediaSourcePtsCadenceR2PrivateArtifactPortV2({
      privateStorage: privateStorage(),
      client: memory.client,
    });

    await expect(port.writeImmutableFrameBatch({
      serialization: fixture.batch,
      expected: fixture.batchSidecar,
    })).resolves.toEqual(fixture.batchSidecar);
    await expect(port.writeImmutableFrameBatch({
      serialization: fixture.batch,
      expected: fixture.batchSidecar,
    })).resolves.toEqual(fixture.batchSidecar);
    await expect(port.writeImmutableManifestIndex({
      serialization: fixture.index,
      expected: fixture.indexSidecar,
    })).resolves.toEqual(fixture.indexSidecar);

    await expect(port.read(fixture.batchSidecar)).resolves.toEqual({
      canonicalJson: fixture.batch.canonicalJson,
      byteLength: fixture.batch.byteLength,
      contentSha256: fixture.batch.contentSha256,
    });
    expect(memory.commands.filter((command) => command instanceof PutObjectCommand)).toHaveLength(3);
    expect(memory.commands.filter((command) => command instanceof GetObjectCommand)).toHaveLength(4);
    expect((memory.commands[0] as PutObjectCommand).input).toMatchObject({
      Bucket: 'editron-private-artifacts',
      Key: fixture.batchSidecar.objectKey,
      IfNoneMatch: '*',
      CacheControl: 'no-store',
    });
  });

  it('fails closed for forged references, altered immutable bytes, and missing objects', async () => {
    const fixture = v2Fixture();
    const memory = memoryR2();
    const port = createMediaSourcePtsCadenceR2PrivateArtifactPortV2({
      privateStorage: privateStorage(),
      client: memory.client,
    });

    await expect(port.writeImmutableFrameBatch({
      serialization: fixture.batch,
      expected: { ...fixture.batchSidecar, contentSha256: 'f'.repeat(64) },
    })).rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_V2_FRAME_BATCH_EXPECTED_MISMATCH');
    await expect(port.writeImmutableManifestIndex({
      serialization: fixture.index,
      expected: { ...fixture.indexSidecar, batchCount: 2 },
    })).rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_V2_MANIFEST_INDEX_EXPECTED_MISMATCH');

    const altered = Buffer.from(fixture.batch.canonicalJson, 'utf8');
    altered[0] = altered[0] === 0x7b ? 0x5b : 0x7b;
    memory.objects.set(fixture.batchSidecar.objectKey, altered);
    await expect(port.writeImmutableFrameBatch({
      serialization: fixture.batch,
      expected: fixture.batchSidecar,
    })).rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_V2_CONTENT_MISMATCH');
    await expect(port.read({
      ...fixture.indexSidecar,
      objectKey: fixture.indexSidecar.objectKey.replace(
        /[a-f0-9]{64}\.json$/,
        `${'0'.repeat(64)}.json`,
      ),
    })).rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_V2_READ_FAILED');
    await expect(port.read({
      ...fixture.indexSidecar,
      objectKey: 'private/editron/media-source-pts-cadence/v2/../../escaped.json',
    })).rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_V2_OBJECT_KEY_INVALID');
    await expect(port.read({
      ...fixture.indexSidecar,
      storage: 'GCS_PRIVATE',
    })).rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_V2_STORAGE_MISMATCH');
  });

  it('rejects a browser-facing bucket before any storage command', () => {
    const memory = memoryR2();
    expect(() => createMediaSourcePtsCadenceR2PrivateArtifactPortV2({
      privateStorage: { ...privateStorage(), bucketName: 'editron-cdn' },
      client: memory.client,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_PRIVATE_STORAGE_PUBLIC_BUCKET_FORBIDDEN');
    expect(memory.commands).toHaveLength(0);
  });
});

function v2Fixture() {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/source.mov' },
    byteLength: 12_345,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-1' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1',
    mediaKind: 'video',
    byteLength: 12_345,
    contentSha256: 'b'.repeat(64),
    storageVersion,
  });
  const observation = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: 'mov',
    durationMilliseconds: 67,
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0,
      codec: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
      pixelFormat: 'yuv420p',
      sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0',
      sourceDurationTicks: '6006',
      averageFrameRate: { numerator: '30000', denominator: '1001' },
      realFrameRate: { numerator: '30000', denominator: '1001' },
      frameCount: '2',
      colorSpace: 'bt709',
      colorTransfer: 'bt709',
      colorPrimaries: 'bt709',
      colorRange: 'tv',
      timecode: null,
      reelId: null,
    }],
    audioStreams: [],
  };
  const qualification = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1' as const,
    status: 'MEASURED_TECHNICAL' as const,
    assetId: 'asset-1',
    locator: { provider: 'R2' as const, objectKey: 'media/source.mov' },
    sourceBindingSha256: 'c'.repeat(64),
    requestId: 'media-source-probe:test',
    attemptCount: 1,
    requestedAt: '2026-08-25T00:00:00.000Z',
    startedAt: '2026-08-25T00:00:01.000Z',
    completedAt: '2026-08-25T00:00:02.000Z',
    storageVersion,
    observation: { ...observation, observationSha256: hashEditronCanonicalJsonV1(observation) },
    diagnostic: null,
  };
  const mapper = {
    mapperVersion: 'media-pts-mapper-v2',
    ffprobeVersion: 'ffprobe-8.1',
    commandPolicyVersion: 'policy-v2',
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
  };
  const frames = [
    { presentationTimestampTicks: '0', durationTicks: '3003' },
    { presentationTimestampTicks: '3003', durationTicks: '3003' },
  ] as const;
  const shard = createMediaSourcePtsCadenceShardV1({
    sourceVersion,
    qualification,
    videoStreamIndex: 0,
    mapper,
    shardSequence: 0,
    firstFrameOrdinal: '0',
    frames,
  });
  const batch = serializeMediaSourcePtsCadenceFrameBatchV2({
    mapBindingSha256: mediaSourcePtsCadenceMapBindingSha256V1(shard),
    resourcePolicy: { policyVersion: 'policy-v2', maxCanonicalJsonBytes: 16_384, maxFrameRecords: 100 },
    shard,
    frames,
  });
  const batchSidecar = createMediaSourcePtsCadenceFrameBatchSidecarV2({
    storage: 'R2_PRIVATE',
    serialization: batch,
  });
  const index = createMediaSourcePtsCadenceManifestIndexV2({
    mapBindingSha256: batch.payload.mapBindingSha256,
    resourcePolicy: { policyVersion: 'policy-v2', maxCanonicalJsonBytes: 16_384, maxBatchEntries: 100 },
    batches: [{ serialization: batch, sidecar: batchSidecar }],
  });
  return {
    batch,
    batchSidecar,
    index,
    indexSidecar: createMediaSourcePtsCadenceManifestIndexSidecarV2({
      storage: 'R2_PRIVATE',
      manifestIndex: index,
    }),
  };
}

function privateStorage() {
  return {
    bucketName: 'editron-private-artifacts',
    browserRouteExposure: 'NO_BROWSER_ROUTE' as const,
    storagePolicyVersion: 'r2-private-media-evidence-v2',
  };
}

function memoryR2() {
  const objects = new Map<string, Uint8Array>();
  const commands: unknown[] = [];
  return {
    objects,
    commands,
    client: {
      send: async (command: unknown): Promise<unknown> => {
        commands.push(command);
        if (command instanceof PutObjectCommand) {
          const { Key, Body, IfNoneMatch } = command.input;
          if (typeof Key !== 'string' || typeof Body !== 'string') throw new Error('TEST_PUT_INVALID');
          if (IfNoneMatch === '*' && objects.has(Key)) {
            throw Object.assign(new Error('exists'), {
              name: 'PreconditionFailed',
              $metadata: { httpStatusCode: 412 },
            });
          }
          objects.set(Key, Buffer.from(Body, 'utf8'));
          return {};
        }
        if (command instanceof GetObjectCommand) {
          const { Key } = command.input;
          if (typeof Key !== 'string' || !objects.has(Key)) throw new Error('TEST_GET_MISSING');
          return { Body: chunks(objects.get(Key)!) };
        }
        throw new Error('TEST_COMMAND_UNEXPECTED');
      },
    },
  };
}

async function* chunks(value: Uint8Array): AsyncIterable<Uint8Array> {
  const midpoint = Math.max(1, Math.floor(value.byteLength / 2));
  yield value.slice(0, midpoint);
  if (midpoint < value.byteLength) yield value.slice(midpoint);
}
