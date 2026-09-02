import { createHash } from 'node:crypto';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';

import {
  createMediaSourcePtsCadenceR2PrivateEpochArtifactReaderV3,
  type MediaSourcePtsCadenceR2CommandClientV1,
} from '@/lib/editron/services/media-source-pts-cadence-r2-private-sidecar-v1';
import { createMediaSourcePtsCadenceR2RuntimePortsV1 } from '@/lib/editron/services/media-source-pts-cadence-r2-runtime-v1';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

describe('MediaSourcePtsCadenceR2PrivateEpochArtifactReaderV3', () => {
  it.each([
    `private/editron/media-source-pts-cadence/v2/${HASH_A}/frame-batches/0/${HASH_B}.json`,
    `private/editron/media-source-pts-cadence/v3/${HASH_A}/${HASH_B}/epoch-indexes/${HASH_C}.json`,
    `private/editron/media-source-pts-cadence/v3/${HASH_A}/boundary-evidence/${HASH_B}/${HASH_C}.json`,
  ])('exactly reads the permitted private artifact family %s', async (objectKey) => {
    const canonicalJson = JSON.stringify({ objectKey });
    const memory = memoryR2(new Map([[objectKey, Buffer.from(canonicalJson, 'utf8')]]));
    const reader = createMediaSourcePtsCadenceR2PrivateEpochArtifactReaderV3({
      privateStorage: privateStorage(),
      client: memory.client,
    });

    await expect(reader.read(reference(objectKey, canonicalJson))).resolves.toEqual({
      canonicalJson,
      byteLength: Buffer.byteLength(canonicalJson, 'utf8'),
      contentSha256: sha256(canonicalJson),
    });
    expect(memory.commands).toHaveLength(1);
    expect(memory.commands[0]).toBeInstanceOf(GetObjectCommand);
    expect((memory.commands[0] as GetObjectCommand).input).toEqual({
      Bucket: 'editron-private-artifacts',
      Key: objectKey,
    });
  });

  it('rejects non-epoch artifact families and forged references before storage access', async () => {
    const memory = memoryR2();
    const reader = createMediaSourcePtsCadenceR2PrivateEpochArtifactReaderV3({
      privateStorage: privateStorage(),
      client: memory.client,
    });
    const manifestKey =
      `private/editron/media-source-pts-cadence/v2/${HASH_A}/manifest-indexes/${HASH_B}.json`;

    await expect(reader.read(reference(manifestKey, '{}')))
      .rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_V3_OBJECT_KEY_INVALID');
    await expect(reader.read({ ...reference(validEpochKey(), '{}'), storage: 'GCS_PRIVATE' }))
      .rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_V3_STORAGE_MISMATCH');
    await expect(reader.read(reference(
      'private/editron/media-source-pts-cadence/v3/../../escaped.json',
      '{}',
    ))).rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_V3_OBJECT_KEY_INVALID');
    await expect(reader.read({
      ...reference(validEpochKey(), '{}'),
      byteLength: 8 * 1024 * 1024 + 1,
    })).rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_V3_BYTE_LENGTH_INVALID');
    await expect(reader.read({
      ...reference(validEpochKey(), '{}'),
      contentSha256: 'not-a-hash',
    })).rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_V3_CONTENT_HASH_INVALID');
    expect(memory.commands).toHaveLength(0);
  });

  it('rejects altered, truncated, and unavailable immutable objects with stable errors', async () => {
    const objectKey = validEpochKey();
    const canonicalJson = '{"epoch":1}';
    const expected = reference(objectKey, canonicalJson);
    const altered = memoryR2(new Map([[objectKey, Buffer.from('{"epoch":2}', 'utf8')]]));
    const truncated = memoryR2(new Map([[objectKey, Buffer.from('{}', 'utf8')]]));
    const unavailable = memoryR2();

    await expect(createReader(altered.client).read(expected))
      .rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_V3_CONTENT_MISMATCH');
    await expect(createReader(truncated.client).read(expected))
      .rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_V3_CONTENT_MISMATCH');
    await expect(createReader(unavailable.client).read(expected))
      .rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_R2_V3_READ_FAILED');
  });

  it('exposes the same V3 reader through the configured server runtime', () => {
    const clientFactory = vi.fn(() => memoryR2().client);
    const runtime = createMediaSourcePtsCadenceR2RuntimePortsV1({
      EDITRON_MEDIA_PTS_R2_ACCOUNT_ID: 'a'.repeat(32),
      EDITRON_MEDIA_PTS_R2_ACCESS_KEY_ID: 'access-key',
      EDITRON_MEDIA_PTS_R2_SECRET_ACCESS_KEY: 'secret-key',
      EDITRON_MEDIA_PTS_R2_BUCKET_NAME: 'editron-private-artifacts',
    }, { clientFactory });

    expect(runtime.epochArtifactReader.read).toBeTypeOf('function');
    expect(clientFactory).toHaveBeenCalledTimes(1);
  });
});

function createReader(client: MediaSourcePtsCadenceR2CommandClientV1) {
  return createMediaSourcePtsCadenceR2PrivateEpochArtifactReaderV3({
    privateStorage: privateStorage(),
    client,
  });
}

function validEpochKey(): string {
  return `private/editron/media-source-pts-cadence/v3/${HASH_A}/${HASH_B}/epoch-indexes/${HASH_C}.json`;
}

function reference(objectKey: string, canonicalJson: string) {
  return {
    storage: 'R2_PRIVATE' as const,
    objectKey,
    byteLength: Buffer.byteLength(canonicalJson, 'utf8'),
    contentSha256: sha256(canonicalJson),
  };
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function privateStorage() {
  return {
    bucketName: 'editron-private-artifacts',
    browserRouteExposure: 'NO_BROWSER_ROUTE' as const,
    storagePolicyVersion: 'r2-private-media-evidence-v3',
  };
}

function memoryR2(objects = new Map<string, Uint8Array>()) {
  const commands: unknown[] = [];
  return {
    commands,
    client: {
      send: async (command: unknown): Promise<unknown> => {
        commands.push(command);
        if (!(command instanceof GetObjectCommand)) throw new Error('TEST_COMMAND_UNEXPECTED');
        const { Key } = command.input;
        if (typeof Key !== 'string' || !objects.has(Key)) throw new Error('TEST_GET_MISSING');
        return { Body: chunks(objects.get(Key)!) };
      },
    } satisfies MediaSourcePtsCadenceR2CommandClientV1,
  };
}

async function* chunks(value: Uint8Array): AsyncIterable<Uint8Array> {
  const midpoint = Math.max(1, Math.floor(value.byteLength / 2));
  yield value.slice(0, midpoint);
  if (midpoint < value.byteLength) yield value.slice(midpoint);
}
