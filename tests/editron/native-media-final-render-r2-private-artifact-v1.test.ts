import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';

import { createMediaSourcePtsCadenceR2RuntimePortsV1 } from '@/lib/editron/services/media-source-pts-cadence-r2-runtime-v1';
import {
  createNativeMediaFinalRenderR2PrivateArtifactPortsV1,
  NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
  type NativeMediaFinalRenderR2PresignGetObjectV1,
} from '@/lib/editron/services/native-media-final-render-r2-private-artifact-v1';
import { createNativeMediaFinalRenderArtifactV1 } from '@/lib/editron/services/native-media-final-render-source-preparation-v1';

const ACCOUNT_ID = 'a'.repeat(32);
const ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
const BUCKET = 'editron-media-pts-private';
const NOW = 1_900_000_000_000;
const BYTES = Uint8Array.from({ length: 1_024 }, (_, index) => index % 251);
const CONTENT_SHA256 = digest(BYTES);
const TRANSFORM_SHA256 = 'b'.repeat(64);
const PROFILE_SHA256 = 'c'.repeat(64);

const privateStorage = Object.freeze({
  bucketName: BUCKET,
  browserRouteExposure: 'NO_BROWSER_ROUTE' as const,
  storagePolicyVersion: 'EDITRON_MEDIA_SOURCE_PTS_PRIVATE_R2_V1',
});

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

async function readBody(value: unknown): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (!value || (typeof value !== 'object' && typeof value !== 'function')
    || !(Symbol.asyncIterator in value)) throw new Error('invalid body');
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for await (const chunk of value as AsyncIterable<unknown>) {
    if (!(chunk instanceof Uint8Array)) throw new Error('invalid chunk');
    chunks.push(chunk);
    byteLength += chunk.byteLength;
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function createMemoryClient() {
  type Stored = {
    body: Uint8Array;
    cacheControl: string;
    contentLength: number;
    contentType: string;
    metadata: Record<string, string>;
  };
  const objects = new Map<string, Stored>();
  const commands: unknown[] = [];
  const client = {
    async send(command: unknown): Promise<unknown> {
      commands.push(command);
      if (command instanceof PutObjectCommand) {
        const key = String(command.input.Key);
        if (command.input.IfNoneMatch === '*' && objects.has(key)) {
          throw Object.assign(new Error('exists'), {
            name: 'PreconditionFailed',
            $metadata: { httpStatusCode: 412 },
          });
        }
        const body = await readBody(command.input.Body);
        if (typeof command.input.CacheControl !== 'string'
          || typeof command.input.ContentLength !== 'number'
          || typeof command.input.ContentType !== 'string'
          || !command.input.Metadata) throw new Error('invalid put');
        objects.set(key, {
          body,
          cacheControl: command.input.CacheControl,
          contentLength: command.input.ContentLength,
          contentType: command.input.ContentType,
          metadata: { ...command.input.Metadata },
        });
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const stored = objects.get(String(command.input.Key));
        if (!stored) throw new Error('missing');
        return {
          Body: Uint8Array.from(stored.body),
          CacheControl: stored.cacheControl,
          ContentLength: stored.contentLength,
          ContentType: stored.contentType,
          Metadata: { ...stored.metadata },
        };
      }
      throw new Error('unexpected command');
    },
  };
  return { client, commands, objects };
}

function policy(maxArtifactBytes = 2 * 1024) {
  return Object.freeze({
    policyVersion: NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
    maxArtifactBytes,
    defaultLeaseTtlMs: 60_000,
    maximumLeaseTtlMs: 120_000,
  });
}

function signedUrl(input: Readonly<{
  bucketName: string;
  objectKey: string;
  expiresInSeconds: number;
}>): string {
  const url = new URL(`${ENDPOINT}/${input.bucketName}/${input.objectKey}`);
  url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  url.searchParams.set('X-Amz-Credential', 'test-access/20260829/auto/s3/aws4_request');
  url.searchParams.set('X-Amz-Date', '20260829T000000Z');
  url.searchParams.set('X-Amz-Expires', String(input.expiresInSeconds));
  url.searchParams.set('X-Amz-Signature', 'f'.repeat(64));
  return url.toString();
}

function createPorts(input: Readonly<{
  memory?: ReturnType<typeof createMemoryClient>;
  presignGetObject?: NativeMediaFinalRenderR2PresignGetObjectV1;
  maximumLeaseTtlMs?: number;
}> = {}) {
  const memory = input.memory ?? createMemoryClient();
  const presignGetObject = input.presignGetObject ?? vi.fn(async (request) => signedUrl(request));
  const ports = createNativeMediaFinalRenderR2PrivateArtifactPortsV1({
    privateStorage,
    endpoint: ENDPOINT,
    client: memory.client,
    presignGetObject,
    policy: Object.freeze({
      ...policy(),
      maximumLeaseTtlMs: input.maximumLeaseTtlMs ?? 120_000,
    }),
    now: () => NOW,
    randomIdentifier: () => '1'.repeat(32),
  });
  return { memory, ports, presignGetObject };
}

async function withArtifactFile<T>(
  run: (localPath: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(path.join(tmpdir(), 'editron-final-r2-test-'));
  try {
    const localPath = path.join(directory, 'artifact.mkv');
    await writeFile(localPath, BYTES, { flag: 'wx' });
    return await run(localPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function stageInput(localPath: string, overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    localPath,
    contentType: 'video/x-matroska' as const,
    artifactContentSha256: CONTENT_SHA256,
    artifactByteLength: String(BYTES.byteLength),
    transformSha256: TRANSFORM_SHA256,
    profileReceiptSha256: PROFILE_SHA256,
    ...overrides,
  };
}

function artifact(artifactHandle: string) {
  return createNativeMediaFinalRenderArtifactV1({
    schemaVersion: 1,
    kind: 'EDITRON_NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_V1',
    artifactHandle,
    projectId: 'project-final-render-1',
    sequenceId: 'main',
    projectRevision: {
      schemaVersion: 1,
      value: 7,
      compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
    },
    overlayId: 'overlay-1',
    assetId: 'asset-1',
    overlayTimingSha256: '2'.repeat(64),
    assetTimingStateSha256: '3'.repeat(64),
    sourceVersionSha256: '4'.repeat(64),
    storageVersionSha256: '5'.repeat(64),
    sourceBindingSha256: '6'.repeat(64),
    sourcePtsCadenceMapStateSha256V3: '7'.repeat(64),
    transformSha256: TRANSFORM_SHA256,
    projectRate: { numerator: '30', denominator: '1' },
    timelineStartFrame: '120',
    timelineFrameCount: '4',
    artifactProfile: 'EDITRON_EXACT_TIMESTAMP_AV_MEZZANINE_V1',
    container: 'matroska',
    videoCodec: 'h264',
    pixelFormat: 'gbrp',
    videoFrameCount: '4',
    decodedFrameSequenceSha256: '8'.repeat(64),
    remotionCompatibilityReceiptSha256: PROFILE_SHA256,
    audio: {
      disposition: 'NO_AUDIO_MAPPING_REQUESTED',
      audioCodec: null,
      audioMappingSha256: null,
      sourceDecodedPcmSha256: null,
      artifactDecodedPcmSha256: null,
      decodedPcmEquivalenceReceiptSha256: null,
      sampleRate: null,
      channelCount: null,
      decodedSampleFrameCount: null,
    },
    contentType: 'video/x-matroska',
    artifactContentSha256: CONTENT_SHA256,
    artifactByteLength: String(BYTES.byteLength),
  });
}

describe('native final-render private R2 artifact V1', () => {
  it('conditionally stores, rereads, and idempotently reuses exact bytes', async () => {
    await withArtifactFile(async (localPath) => {
      const { memory, ports } = createPorts();
      const first = await ports.stager.stage(stageInput(localPath));
      const second = await ports.stager.stage(stageInput(localPath));

      expect(first).toEqual(second);
      expect(first).toEqual({
        publishHandle: `nmfrpubv1_${CONTENT_SHA256}`,
        artifactHandle: `nmfrv1_${CONTENT_SHA256}`,
        artifactContentSha256: CONTENT_SHA256,
        artifactByteLength: String(BYTES.byteLength),
      });
      const puts = memory.commands.filter(
        (command): command is PutObjectCommand => command instanceof PutObjectCommand,
      );
      expect(puts).toHaveLength(2);
      expect(puts[0]!.input).toMatchObject({
        Bucket: BUCKET,
        Key: `private/editron/native-media-final-render/v1/${CONTENT_SHA256.slice(0, 2)}/${CONTENT_SHA256}.mkv`,
        ContentLength: BYTES.byteLength,
        ContentType: 'video/x-matroska',
        CacheControl: 'private, no-store, max-age=0',
        IfNoneMatch: '*',
        Metadata: {
          artifactprofile: 'EDITRON_EXACT_TIMESTAMP_AV_MEZZANINE_V1',
          contentsha256: CONTENT_SHA256,
          bytelength: String(BYTES.byteLength),
          transformsha256: TRANSFORM_SHA256,
          profilereceiptsha256: PROFILE_SHA256,
        },
      });
      expect(memory.objects).toHaveLength(1);
    });
  });

  it('publishes only a verified object through an exact bounded signed GET lease', async () => {
    await withArtifactFile(async (localPath) => {
      const { ports, presignGetObject } = createPorts();
      const staged = await ports.stager.stage(stageInput(localPath));
      const result = await ports.publisher.publish({
        artifact: artifact(staged.artifactHandle),
        publishHandle: staged.publishHandle,
        minimumExpiresAtEpochMs: NOW + 90_000,
      });

      expect(result).toMatchObject({
        disposition: 'SOURCE_PUBLISHED',
        lease: {
          leaseId: `nmfrleasev1_${'1'.repeat(32)}`,
          issuedAtEpochMs: NOW,
          expiresAtEpochMs: NOW + 90_000,
          artifact: { artifactHandle: staged.artifactHandle },
        },
      });
      expect(presignGetObject).toHaveBeenCalledWith({
        bucketName: BUCKET,
        objectKey: `private/editron/native-media-final-render/v1/${CONTENT_SHA256.slice(0, 2)}/${CONTENT_SHA256}.mkv`,
        expiresInSeconds: 90,
      });
      expect(result.disposition === 'SOURCE_PUBLISHED'
        ? result.lease.sourceUrlSha256
        : null).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  it('rejects wrong local identity and a corrupted existing content-addressed object', async () => {
    await withArtifactFile(async (localPath) => {
      const { memory, ports } = createPorts();
      await expect(ports.stager.stage(stageInput(localPath, {
        artifactContentSha256: '0'.repeat(64),
      }))).rejects.toThrow('NATIVE_MEDIA_FINAL_RENDER_R2_LOCAL_ARTIFACT_HASH_MISMATCH');
      expect(memory.commands).toHaveLength(0);

      await ports.stager.stage(stageInput(localPath));
      const [key, stored] = [...memory.objects.entries()][0]!;
      stored.body[0] ^= 0xff;
      memory.objects.set(key, stored);
      await expect(ports.stager.stage(stageInput(localPath)))
        .rejects.toThrow('NATIVE_MEDIA_FINAL_RENDER_R2_CONTENT_HASH_MISMATCH');
    });
  });

  it('rejects altered metadata, unsafe signing and excessive lease requests', async () => {
    await withArtifactFile(async (localPath) => {
      const memory = createMemoryClient();
      const valid = createPorts({ memory });
      const staged = await valid.ports.stager.stage(stageInput(localPath));
      const [key, stored] = [...memory.objects.entries()][0]!;
      memory.objects.set(key, {
        ...stored,
        metadata: { ...stored.metadata, transformsha256: '9'.repeat(64) },
      });
      await expect(valid.ports.stager.stage(stageInput(localPath)))
        .rejects.toThrow('NATIVE_MEDIA_FINAL_RENDER_R2_HEADERS_OR_METADATA_INVALID');

      memory.objects.set(key, stored);
      const unsafe = createPorts({
        memory,
        presignGetObject: vi.fn(async () => (
          `https://evil.example.test/${BUCKET}/${key}`
        )),
      });
      await expect(unsafe.ports.publisher.publish({
        artifact: artifact(staged.artifactHandle),
        publishHandle: staged.publishHandle,
        minimumExpiresAtEpochMs: NOW + 60_000,
      })).resolves.toMatchObject({
        disposition: 'UNVERIFIABLE',
        diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_R2_SIGNED_URL_INVALID',
      });

      await expect(valid.ports.publisher.publish({
        artifact: artifact(staged.artifactHandle),
        publishHandle: staged.publishHandle,
        minimumExpiresAtEpochMs: NOW + 121_000,
      })).resolves.toMatchObject({
        disposition: 'UNVERIFIABLE',
        diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_R2_LEASE_LIMIT_EXCEEDED',
      });
    });
  });

  it('exposes the adapter from the sole private-media R2 runtime without public fallback', () => {
    const client = { send: vi.fn(async () => ({})) };
    const runtime = createMediaSourcePtsCadenceR2RuntimePortsV1({
      EDITRON_MEDIA_PTS_R2_ACCOUNT_ID: ACCOUNT_ID,
      EDITRON_MEDIA_PTS_R2_ACCESS_KEY_ID: 'fake-private-access',
      EDITRON_MEDIA_PTS_R2_SECRET_ACCESS_KEY: 'fake-private-secret',
      EDITRON_MEDIA_PTS_R2_BUCKET_NAME: BUCKET,
      R2_BUCKET_NAME: 'editron-cdn',
    }, {
      clientFactory: () => client,
      finalRenderPresignGetObject: vi.fn(async (request) => signedUrl(request)),
    });

    expect(runtime.finalRenderArtifact.stager.stage).toBeTypeOf('function');
    expect(runtime.finalRenderArtifact.publisher.publish).toBeTypeOf('function');
    expect(runtime.configuration.privateStorage.bucketName).toBe(BUCKET);
  });
});
