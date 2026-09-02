import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createMediaProxyMasterR2PrivateSinglePutPublisherV1,
  MEDIA_PROXY_MASTER_R2_MAX_SINGLE_PUT_BYTES_V1,
  MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLISHER_VERSION_V1,
} from '@/lib/editron/services/media-proxy-master-r2-private-publisher-v1';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()!;
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(`${path.resolve(tmpdir())}${path.sep}`)
      || !path.basename(resolved).startsWith('editron-proxy-r2-publisher-test-')) {
      throw new Error('TEST_TEMP_DIRECTORY_INVALID');
    }
    await rm(resolved, { force: true, recursive: true });
  }
});

describe('MediaProxyMasterR2PrivateSinglePutPublisherV1', () => {
  it('creates once, fully rereads, HEAD-fences, and accepts only identical replay', async () => {
    const fixture = await publisherFixture();

    const first = await fixture.publisher.publish(fixture.publishInput);
    const replay = await fixture.publisher.publish(fixture.publishInput);

    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      owner: { kind: 'USER', userId: 'user-a' },
      assetId: 'asset-a',
      mediaKind: 'video',
      byteLength: fixture.bytes.byteLength,
      contentSha256: fixture.contentSha256,
      storageVersion: {
        locator: { provider: 'R2', objectKey: fixture.objectKey },
        providerVersion: { kind: 'R2_ETAG', value: fixture.memory.eTag },
      },
    });
    expect(fixture.memory.commands.filter((value) => value instanceof PutObjectCommand))
      .toHaveLength(2);
    expect(fixture.memory.commands.filter((value) => value instanceof GetObjectCommand))
      .toHaveLength(2);
    expect(fixture.memory.commands.filter((value) => value instanceof HeadObjectCommand))
      .toHaveLength(2);

    const put = fixture.memory.commands.find(
      (value): value is PutObjectCommand => value instanceof PutObjectCommand,
    )!;
    expect(put.input).toMatchObject({
      Bucket: 'editron-media-proxy-private',
      Key: fixture.objectKey,
      ContentLength: fixture.bytes.byteLength,
      ContentType: 'video/mp4',
      CacheControl: 'private, no-store, max-age=0',
      ContentDisposition: 'inline',
      IfNoneMatch: '*',
      Metadata: {
        artifactprofile: 'EDITRON_MEDIA_PROXY_MASTER_MP4_V1',
        publisherversion: MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLISHER_VERSION_V1,
        storagepolicyversion: 'private-proxy-media-v1',
        contentsha256: fixture.contentSha256,
        bytelength: String(fixture.bytes.byteLength),
        commandsha256: fixture.publishInput.commandSha256,
        outputprobesha256: fixture.publishInput.outputProbeSha256,
        ownerkind: 'USER',
        ownerid: 'user-a',
        assetid: 'asset-a',
      },
    });
    expect(fixture.memory.objects.get(fixture.objectKey)?.bytes).toEqual(fixture.bytes);
  });

  it('rejects corrupt collision bytes and substituted metadata', async () => {
    const corrupt = await publisherFixture();
    await corrupt.publisher.publish(corrupt.publishInput);
    const corruptStored = corrupt.memory.objects.get(corrupt.objectKey)!;
    corruptStored.bytes = Uint8Array.from(corruptStored.bytes, (byte, index) => (
      index === 0 ? byte ^ 0xff : byte
    ));
    await expect(corrupt.publisher.publish(corrupt.publishInput))
      .rejects.toThrow('MEDIA_PROXY_MASTER_R2_STORED_CONTENT_MISMATCH');

    const metadata = await publisherFixture();
    await metadata.publisher.publish(metadata.publishInput);
    metadata.memory.objects.get(metadata.objectKey)!.metadata.contentsha256 = 'f'.repeat(64);
    await expect(metadata.publisher.publish(metadata.publishInput))
      .rejects.toThrow('MEDIA_PROXY_MASTER_R2_HEADERS_OR_METADATA_INVALID');
  });

  it('rejects short rereads and provider-version changes between GET and HEAD', async () => {
    const short = await publisherFixture();
    short.memory.truncateReads = true;
    await expect(short.publisher.publish(short.publishInput))
      .rejects.toThrow('MEDIA_PROXY_MASTER_R2_STORED_BODY_INVALID');

    const changed = await publisherFixture();
    changed.memory.headETagOverride = 'provider-version-changed';
    await expect(changed.publisher.publish(changed.publishInput))
      .rejects.toThrow('MEDIA_PROXY_MASTER_R2_PROVIDER_VERSION_CHANGED');
  });

  it('rejects non-precondition writes and never treats them as replay', async () => {
    const fixture = await publisherFixture();
    fixture.memory.failPut = true;

    await expect(fixture.publisher.publish(fixture.publishInput))
      .rejects.toThrow('MEDIA_PROXY_MASTER_R2_WRITE_FAILED');
    expect(fixture.memory.commands.filter((value) => value instanceof GetObjectCommand))
      .toHaveLength(0);
    expect(fixture.memory.commands.filter((value) => value instanceof HeadObjectCommand))
      .toHaveLength(0);
  });

  it('rejects local, key, size, abort, and private-storage violations before publication', async () => {
    const fixture = await publisherFixture();
    await expect(fixture.publisher.publish({
      ...fixture.publishInput,
      contentSha256: sha256('wrong-local-hash'),
      objectKey: proxyObjectKey(sha256('wrong-local-hash')),
    })).rejects.toThrow('MEDIA_PROXY_MASTER_R2_LOCAL_FILE_HASH_MISMATCH');
    expect(fixture.memory.commands).toHaveLength(0);

    await expect(fixture.publisher.publish({
      ...fixture.publishInput,
      objectKey: proxyObjectKey(sha256('wrong-key-content')),
    })).rejects.toThrow('MEDIA_PROXY_MASTER_R2_OBJECT_KEY_INVALID');
    await expect(fixture.publisher.publish({
      ...fixture.publishInput,
      byteLength: MEDIA_PROXY_MASTER_R2_MAX_SINGLE_PUT_BYTES_V1 + 1,
    })).rejects.toThrow('MEDIA_PROXY_MASTER_R2_SINGLE_PUT_LIMIT_EXCEEDED');

    const controller = new AbortController();
    controller.abort();
    await expect(fixture.publisher.publish({
      ...fixture.publishInput,
      abortSignal: controller.signal,
    })).rejects.toThrow('MEDIA_PROXY_MASTER_R2_PUBLISH_ABORTED');
    expect(fixture.memory.commands).toHaveLength(0);

    expect(() => createMediaProxyMasterR2PrivateSinglePutPublisherV1({
      privateStorage: {
        ...privateStorage(),
        bucketName: 'editron-cdn',
      },
      client: fixture.memory.client,
    })).toThrow('MEDIA_PROXY_MASTER_R2_PRIVATE_STORAGE_INVALID');
  });
});

type StoredObject = {
  bytes: Uint8Array;
  cacheControl: string;
  contentDisposition: string;
  contentType: string;
  metadata: Record<string, string>;
  eTag: string;
};

async function publisherFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'editron-proxy-r2-publisher-test-'));
  temporaryDirectories.push(directory);
  const localPath = path.join(directory, 'proxy-output.mp4');
  const bytes = Buffer.from('complete-private-proxy-output-bytes');
  await writeFile(localPath, bytes);
  const contentSha256 = sha256Bytes(bytes);
  const objectKey = proxyObjectKey(contentSha256);
  const memory = memoryR2();
  const publisher = createMediaProxyMasterR2PrivateSinglePutPublisherV1({
    privateStorage: privateStorage(),
    client: memory.client,
  });
  const publishInput = {
    localPath,
    objectKey,
    contentType: 'video/mp4' as const,
    contentSha256,
    byteLength: bytes.byteLength,
    owner: { kind: 'USER' as const, userId: 'user-a' },
    assetId: 'asset-a',
    commandSha256: sha256('command'),
    outputProbeSha256: sha256('output-probe'),
  };
  return { publisher, memory, bytes, contentSha256, objectKey, publishInput };
}

function memoryR2() {
  const objects = new Map<string, StoredObject>();
  const commands: unknown[] = [];
  const state = {
    objects,
    commands,
    eTag: sha256('r2-etag-v1'),
    failPut: false,
    truncateReads: false,
    headETagOverride: null as string | null,
    client: {
      async send(command: unknown): Promise<unknown> {
        commands.push(command);
        if (command instanceof PutObjectCommand) {
          if (state.failPut) throw new Error('R2_OFFLINE');
          const key = String(command.input.Key);
          if (objects.has(key)) {
            throw Object.assign(new Error('collision'), {
              name: 'PreconditionFailed',
              $metadata: { httpStatusCode: 412 },
            });
          }
          const bytes = await collectBytes(command.input.Body);
          objects.set(key, {
            bytes,
            cacheControl: String(command.input.CacheControl),
            contentDisposition: String(command.input.ContentDisposition),
            contentType: String(command.input.ContentType),
            metadata: { ...(command.input.Metadata ?? {}) },
            eTag: state.eTag,
          });
          return { ETag: `"${state.eTag}"` };
        }
        if (command instanceof GetObjectCommand) {
          const stored = objects.get(String(command.input.Key));
          if (!stored) throw new Error('OBJECT_MISSING');
          const bytes = state.truncateReads
            ? stored.bytes.subarray(0, stored.bytes.byteLength - 1)
            : stored.bytes;
          return response(stored, chunked(bytes));
        }
        if (command instanceof HeadObjectCommand) {
          const stored = objects.get(String(command.input.Key));
          if (!stored) throw new Error('OBJECT_MISSING');
          return response(stored, undefined, state.headETagOverride ?? stored.eTag);
        }
        throw new Error('TEST_COMMAND_UNEXPECTED');
      },
    },
  };
  return state;
}

function response(
  stored: StoredObject,
  body?: AsyncIterable<Uint8Array>,
  eTag = stored.eTag,
) {
  return {
    ...(body === undefined ? {} : { Body: body }),
    CacheControl: stored.cacheControl,
    ContentDisposition: stored.contentDisposition,
    ContentLength: stored.bytes.byteLength,
    ContentType: stored.contentType,
    ETag: `"${eTag}"`,
    Metadata: { ...stored.metadata },
  };
}

async function collectBytes(body: unknown): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return Uint8Array.from(body);
  if (!body || (typeof body !== 'object' && typeof body !== 'function')
    || !(Symbol.asyncIterator in body)) throw new Error('TEST_BODY_INVALID');
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for await (const chunk of body as AsyncIterable<unknown>) {
    if (!(chunk instanceof Uint8Array)) throw new Error('TEST_CHUNK_INVALID');
    chunks.push(chunk);
    byteLength += chunk.byteLength;
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), byteLength);
}

async function* chunked(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  const split = Math.max(1, Math.floor(bytes.byteLength / 2));
  yield bytes.subarray(0, split);
  yield bytes.subarray(split);
}

function privateStorage() {
  return {
    bucketName: 'editron-media-proxy-private',
    browserRouteExposure: 'NO_BROWSER_ROUTE' as const,
    storagePolicyVersion: 'private-proxy-media-v1',
  };
}

function proxyObjectKey(contentSha256: string): string {
  return `editron_proxy_v1_${sha256('proxy-scope')}_${contentSha256}.mp4`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
