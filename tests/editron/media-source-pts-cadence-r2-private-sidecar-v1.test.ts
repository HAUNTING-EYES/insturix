import { createHash } from 'node:crypto';

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  appendMediaSourcePtsCadenceMapShardV1,
  claimMediaSourcePtsCadenceMapV1,
  createMediaSourcePtsCadenceMapRecordV1,
} from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import {
  serializeMediaSourcePtsCadenceManifestSidecarV1,
  serializeMediaSourcePtsCadenceShardSidecarV1,
} from '@/lib/editron/services/media-source-pts-cadence-private-sidecar-codec-v1';
import { createMediaSourcePtsCadenceR2PrivateSidecarPortV1 } from '@/lib/editron/services/media-source-pts-cadence-r2-private-sidecar-v1';
import { createMediaSourcePtsCadenceShardV1 } from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

const NOW = new Date('2026-08-25T12:00:00.000Z');
const CLAIM_ID = 'cadence_claim_0001';

describe('MediaSourcePtsCadenceR2PrivateSidecarV1', () => {
  it('serializes deterministic, map-bound private shard and manifest payloads', () => {
    const first = shard();
    const pending = createMediaSourcePtsCadenceMapRecordV1({ bootstrapShard: first, now: NOW });
    const shardSerialization = serializeMediaSourcePtsCadenceShardSidecarV1({
      storage: 'R2_PRIVATE',
      mapBindingSha256: pending.mapBindingSha256,
      shard: first,
    });

    expect(shardSerialization).toMatchObject({
      sidecar: {
        storage: 'R2_PRIVATE',
        objectKey: `private/editron/media-source-pts-cadence/v1/${pending.mapBindingSha256}/shards/0-${first.shardSha256}.json`,
      },
    });
    expect(shardSerialization.sidecar.byteLength).toBe(Buffer.byteLength(shardSerialization.canonicalJson, 'utf8'));
    expect(shardSerialization.sidecar.contentSha256).toBe(hashUtf8(shardSerialization.canonicalJson));

    const claimed = claimMediaSourcePtsCadenceMapV1({
      record: pending,
      claimId: CLAIM_ID,
      now: NOW,
      expiresAt: new Date('2026-08-25T12:01:00.000Z'),
    });
    const checkpointed = appendMediaSourcePtsCadenceMapShardV1({
      record: claimed,
      claimId: CLAIM_ID,
      shard: first,
      privateSidecar: shardSerialization.sidecar,
      now: NOW,
    });
    const manifestSerialization = serializeMediaSourcePtsCadenceManifestSidecarV1({
      storage: 'R2_PRIVATE',
      mapBindingSha256: pending.mapBindingSha256,
      checkpoint: checkpointed.checkpoint,
    });
    expect(manifestSerialization.sidecar.objectKey).toContain('/manifests/');
    expect(manifestSerialization.canonicalJson).toContain('MANIFEST_SIDECAR_PAYLOAD_V1');

    expect(() => serializeMediaSourcePtsCadenceShardSidecarV1({
      storage: 'R2_PRIVATE',
      mapBindingSha256: '0'.repeat(64),
      shard: first,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_SIDECAR_SHARD_BINDING_MISMATCH');
  });

  it('conditionally writes, byte-verifies, and safely resumes the exact shard and manifest', async () => {
    const first = shard();
    const pending = createMediaSourcePtsCadenceMapRecordV1({ bootstrapShard: first, now: NOW });
    const shardSerialization = serializeMediaSourcePtsCadenceShardSidecarV1({
      storage: 'R2_PRIVATE',
      mapBindingSha256: pending.mapBindingSha256,
      shard: first,
    });
    const memory = memoryR2();
    const port = createMediaSourcePtsCadenceR2PrivateSidecarPortV1({
      privateStorage: privateStorage(),
      client: memory.client,
    });

    await expect(port.writeImmutableShard({
      mapBindingSha256: pending.mapBindingSha256,
      shard: first,
      expected: shardSerialization.sidecar,
    })).resolves.toEqual(shardSerialization.sidecar);
    await expect(port.writeImmutableShard({
      mapBindingSha256: pending.mapBindingSha256,
      shard: first,
      expected: shardSerialization.sidecar,
    })).resolves.toEqual(shardSerialization.sidecar);

    const puts = memory.commands.filter((command): command is PutObjectCommand => command instanceof PutObjectCommand);
    expect(puts).toHaveLength(2);
    expect(puts[0].input).toMatchObject({
      Bucket: 'editron-private-artifacts',
      Key: shardSerialization.sidecar.objectKey,
      IfNoneMatch: '*',
      ContentType: 'application/json; charset=utf-8',
      CacheControl: 'no-store',
    });
    expect(memory.commands.filter((command) => command instanceof GetObjectCommand)).toHaveLength(2);

    const claimed = claimMediaSourcePtsCadenceMapV1({
      record: pending,
      claimId: CLAIM_ID,
      now: NOW,
      expiresAt: new Date('2026-08-25T12:01:00.000Z'),
    });
    const checkpointed = appendMediaSourcePtsCadenceMapShardV1({
      record: claimed,
      claimId: CLAIM_ID,
      shard: first,
      privateSidecar: shardSerialization.sidecar,
      now: NOW,
    });
    const manifestSerialization = serializeMediaSourcePtsCadenceManifestSidecarV1({
      storage: 'R2_PRIVATE',
      mapBindingSha256: pending.mapBindingSha256,
      checkpoint: checkpointed.checkpoint,
    });
    await expect(port.writeImmutableManifest({
      mapBindingSha256: pending.mapBindingSha256,
      checkpoint: checkpointed.checkpoint,
      expected: manifestSerialization.sidecar,
    })).resolves.toEqual(manifestSerialization.sidecar);
  });

  it('fails closed for a mismatched expected sidecar or a tampered existing object', async () => {
    const first = shard();
    const pending = createMediaSourcePtsCadenceMapRecordV1({ bootstrapShard: first, now: NOW });
    const serialization = serializeMediaSourcePtsCadenceShardSidecarV1({
      storage: 'R2_PRIVATE',
      mapBindingSha256: pending.mapBindingSha256,
      shard: first,
    });
    const memory = memoryR2();
    const port = createMediaSourcePtsCadenceR2PrivateSidecarPortV1({
      privateStorage: privateStorage(),
      client: memory.client,
    });

    await expect(port.writeImmutableShard({
      mapBindingSha256: pending.mapBindingSha256,
      shard: first,
      expected: { ...serialization.sidecar, contentSha256: 'f'.repeat(64) },
    })).rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_SIDECAR_EXPECTED_MISMATCH');

    memory.objects.set(serialization.sidecar.objectKey, Buffer.from('{"tampered":true}', 'utf8'));
    await expect(port.writeImmutableShard({
      mapBindingSha256: pending.mapBindingSha256,
      shard: first,
      expected: serialization.sidecar,
    })).rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_SIDECAR_CONTENT_MISMATCH');
  });

  it('refuses the known browser-facing R2 bucket and a missing no-browser-route declaration', () => {
    const memory = memoryR2();
    expect(() => createMediaSourcePtsCadenceR2PrivateSidecarPortV1({
      privateStorage: {
        ...privateStorage(),
        bucketName: 'editron-cdn',
      },
      client: memory.client,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_PRIVATE_STORAGE_PUBLIC_BUCKET_FORBIDDEN');
    expect(() => createMediaSourcePtsCadenceR2PrivateSidecarPortV1({
      privateStorage: {
        ...privateStorage(),
        browserRouteExposure: 'PUBLIC' as never,
      },
      client: memory.client,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_PRIVATE_STORAGE_ROUTE_POLICY_INVALID');
  });
});

function privateStorage() {
  return {
    bucketName: 'editron-private-artifacts',
    browserRouteExposure: 'NO_BROWSER_ROUTE' as const,
    storagePolicyVersion: 'r2-private-media-evidence-v1',
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

function shard() {
  const technicalObservation = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-7.1',
    formatName: 'mov',
    durationMilliseconds: 12_345,
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0,
      codec: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
      pixelFormat: 'yuv420p',
      sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0',
      sourceDurationTicks: '1111050',
      averageFrameRate: { numerator: '30000', denominator: '1001' },
      realFrameRate: { numerator: '30000', denominator: '1001' },
      frameCount: '370',
      colorSpace: 'bt709',
      colorTransfer: 'bt709',
      colorPrimaries: 'bt709',
      colorRange: 'tv',
      timecode: null,
      reelId: null,
    }],
    audioStreams: [],
  };
  return createMediaSourcePtsCadenceShardV1({
    sourceVersion: createMediaSourceVersionV1({
      owner: { kind: 'USER', userId: 'user-1' },
      assetId: 'asset-1',
      mediaKind: 'video',
      byteLength: 12_345,
      contentSha256: 'b'.repeat(64),
      storageVersion: createMediaSourceStorageVersionV1({
        locator: { provider: 'R2', objectKey: 'media/source.mp4' },
        byteLength: 12_345,
        providerVersion: { kind: 'R2_ETAG', value: 'etag-1' },
      }),
    }),
    qualification: {
      schemaVersion: 1,
      kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
      status: 'MEASURED_TECHNICAL',
      assetId: 'asset-1',
      locator: { provider: 'R2', objectKey: 'media/source.mp4' },
      sourceBindingSha256: 'a'.repeat(64),
      requestId: 'media-source-probe:fixture',
      attemptCount: 1,
      requestedAt: '2026-08-25T00:00:00.000Z',
      startedAt: '2026-08-25T00:00:01.000Z',
      completedAt: '2026-08-25T00:00:02.000Z',
      storageVersion: createMediaSourceStorageVersionV1({
        locator: { provider: 'R2', objectKey: 'media/source.mp4' },
        byteLength: 12_345,
        providerVersion: { kind: 'R2_ETAG', value: 'etag-1' },
      }),
      observation: {
        ...technicalObservation,
        observationSha256: hashEditronCanonicalJsonV1(technicalObservation),
      },
      diagnostic: null,
    },
    videoStreamIndex: 0,
    mapper: {
      mapperVersion: 'media-pts-mapper-v1',
      ffprobeVersion: 'ffprobe-7.1',
      commandPolicyVersion: 'policy-v1',
      timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
    },
    shardSequence: 0,
    firstFrameOrdinal: '0',
    frames: [
      { presentationTimestampTicks: '0', durationTicks: '3003' },
      { presentationTimestampTicks: '3003', durationTicks: '3003' },
    ],
  });
}

function hashUtf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
