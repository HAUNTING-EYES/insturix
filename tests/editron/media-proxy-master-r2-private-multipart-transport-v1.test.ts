import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListPartsCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createMediaProxyMasterR2PrivateMultipartTransportV1,
  MEDIA_PROXY_MASTER_R2_PRIVATE_MULTIPART_TRANSPORT_VERSION_V1,
} from '@/lib/editron/services/media-proxy-master-r2-private-multipart-transport-v1';
import {
  beginMediaProxyMasterR2MultipartCompletionV1,
  beginMediaProxyMasterR2MultipartSessionInitiationV1,
  bindMediaProxyMasterR2MultipartUploadIdV1,
  createMediaProxyMasterR2MultipartIntentRecordV1,
  recordMediaProxyMasterR2MultipartPartV1,
  requestMediaProxyMasterR2MultipartAbortV1,
} from '@/lib/editron/services/media-proxy-master-r2-multipart-record-v1';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const directory = path.resolve(temporaryDirectories.pop()!);
    if (!directory.startsWith(`${path.resolve(tmpdir())}${path.sep}`)
      || !path.basename(directory).startsWith('editron-r2-multipart-transport-test-')) {
      throw new Error('TEST_TEMP_DIRECTORY_INVALID');
    }
    await rm(directory, { recursive: true, force: true });
  }
});

describe('media proxy/master private R2 multipart transport v1', () => {
  it('discovers or creates only the exact durable session key with private metadata', async () => {
    const fixture = await build();
    const uploadId = await fixture.transport.createUpload({
      record: fixture.initiating,
    });
    const discovered = await fixture.transport.discoverUploads({
      record: fixture.initiating,
    });

    expect(discovered).toEqual([{
      uploadId,
      initiatedAt: '2026-08-30T00:00:02.000Z',
    }]);
    const created = fixture.memory.commands.find(
      (command): command is CreateMultipartUploadCommand => (
        command instanceof CreateMultipartUploadCommand
      ),
    )!;
    expect(created.input).toMatchObject({
      Bucket: 'editron-media-proxy-private',
      Key: fixture.initiating.sessions[0]!.objectKey,
      ContentType: 'video/mp4',
      CacheControl: 'private, no-store, max-age=0',
      ContentDisposition: 'inline',
      Metadata: {
        transportversion: MEDIA_PROXY_MASTER_R2_PRIVATE_MULTIPART_TRANSPORT_VERSION_V1,
        artifactbindingsha256: fixture.initiating.artifactBindingSha256,
        recordid: fixture.initiating.recordId,
        sessiongeneration: '1',
        contentsha256: fixture.contentSha256,
      },
    });
  });

  it('hashes exact local ranges, enforces Content-MD5, and reconciles provider parts', async () => {
    const fixture = await build();
    const uploadId = await fixture.transport.createUpload({ record: fixture.initiating });
    let record = bindMediaProxyMasterR2MultipartUploadIdV1(fixture.initiating, {
      expectedSequence: fixture.initiating.sequence,
      leaseTokenSha256: fixture.leaseTokenSha256,
      uploadId,
      now: '2026-08-30T00:00:03.000Z',
    });
    const uploaded = await fixture.transport.uploadPart({
      record,
      localPath: fixture.localPath,
      partNumber: 1,
    });
    expect(uploaded.contentSha256).toBe(fixture.contentSha256);
    expect(uploaded.eTag).toBe(md5Hex(fixture.bytes));

    record = recordMediaProxyMasterR2MultipartPartV1(record, {
      expectedSequence: record.sequence,
      leaseTokenSha256: fixture.leaseTokenSha256,
      partNumber: uploaded.partNumber,
      startByte: uploaded.startByte,
      endExclusiveByte: uploaded.endExclusiveByte,
      byteLength: uploaded.byteLength,
      contentSha256: uploaded.contentSha256,
      eTag: uploaded.eTag,
      now: '2026-08-30T00:00:04.000Z',
    });
    await expect(fixture.transport.listParts({ record })).resolves.toEqual([{
      partNumber: 1,
      byteLength: fixture.bytes.byteLength,
      eTag: md5Hex(fixture.bytes),
    }]);
    const command = fixture.memory.commands.find(
      (candidate): candidate is UploadPartCommand => candidate instanceof UploadPartCommand,
    )!;
    expect(command.input.ContentMD5).toBe(md5Base64(fixture.bytes));
  });

  it('completes the unique object and proves full GET bytes plus HEAD version', async () => {
    const fixture = await build();
    const { completing } = await fixture.uploadedRecord();
    await expect(fixture.transport.verifyPublishedObject({ record: completing }))
      .resolves.toBeNull();
    const completeETag = await fixture.transport.complete({ record: completing });
    const verified = await fixture.transport.verifyPublishedObject({
      record: completing,
    });

    expect(completeETag).toBe(fixture.memory.completedETag);
    expect(verified).toEqual({
      eTag: fixture.memory.completedETag,
      byteLength: fixture.bytes.byteLength,
      contentSha256: fixture.contentSha256,
    });
    expect(fixture.memory.commands.some(
      (command) => command instanceof CompleteMultipartUploadCommand,
    )).toBe(true);
    expect(fixture.memory.commands.some((command) => command instanceof GetObjectCommand))
      .toBe(true);
    expect(fixture.memory.commands.some((command) => command instanceof HeadObjectCommand))
      .toBe(true);
  });

  it('rejects substituted stored bytes and GET-to-HEAD provider changes', async () => {
    const corrupt = await build();
    const { completing } = await corrupt.uploadedRecord();
    await corrupt.transport.complete({ record: completing });
    corrupt.memory.corruptGet = true;
    await expect(corrupt.transport.verifyPublishedObject({ record: completing }))
      .rejects.toThrow('STORED_CONTENT_MISMATCH');

    const changed = await build();
    const ready = await changed.uploadedRecord();
    await changed.transport.complete({ record: ready.completing });
    changed.memory.headETagOverride = 'changed-provider-version';
    await expect(changed.transport.verifyPublishedObject({ record: ready.completing }))
      .rejects.toThrow('PROVIDER_VERSION_CHANGED');
  });

  it('aborts idempotently and rejects public storage binding', async () => {
    const fixture = await build();
    const uploadId = await fixture.transport.createUpload({ record: fixture.initiating });
    let record = bindMediaProxyMasterR2MultipartUploadIdV1(fixture.initiating, {
      expectedSequence: fixture.initiating.sequence,
      leaseTokenSha256: fixture.leaseTokenSha256,
      uploadId,
      now: '2026-08-30T00:00:03.000Z',
    });
    record = requestMediaProxyMasterR2MultipartAbortV1(record, {
      expectedSequence: record.sequence,
      leaseTokenSha256: fixture.leaseTokenSha256,
      reason: 'WORKER_CANCELLED',
      now: '2026-08-30T00:00:04.000Z',
    });
    await expect(fixture.transport.abort({ record, uploadId }))
      .resolves.toBe('ABORTED');
    await expect(fixture.transport.abort({ record, uploadId }))
      .resolves.toBe('UPLOAD_NOT_FOUND');

    expect(() => createMediaProxyMasterR2PrivateMultipartTransportV1({
      privateStorage: { ...privateStorage(), bucketName: 'editron-cdn' },
      client: fixture.memory.client,
    })).toThrow('PRIVATE_STORAGE_INVALID');
  });
});

async function build() {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'editron-r2-multipart-transport-test-'),
  );
  temporaryDirectories.push(directory);
  const localPath = path.join(directory, 'proxy.mp4');
  const bytes = Buffer.from('complete-private-multipart-proxy-bytes');
  await writeFile(localPath, bytes);
  const contentSha256 = sha256Bytes(bytes);
  const commandSha256 = sha256('command');
  const leaseTokenSha256 = sha256('lease');
  const intent = createMediaProxyMasterR2MultipartIntentRecordV1({
    jobId: 'job-proxy-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    orgId: null,
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1',
    bucketName: 'editron-media-proxy-private',
    storagePolicyVersion: 'private-proxy-media-v1',
    publicationPolicySha256: sha256('publication-policy'),
    objectKey: `editron_proxy_v1_${commandSha256}_${contentSha256}.mp4`,
    contentSha256,
    byteLength: bytes.byteLength,
    commandSha256,
    outputProbeSha256: sha256('output-probe'),
    leaseOwnerId: 'worker-1',
    leaseTokenSha256,
    leaseExpiresAt: '2026-08-30T00:10:00.000Z',
    now: '2026-08-30T00:00:00.000Z',
  });
  const initiating = beginMediaProxyMasterR2MultipartSessionInitiationV1(intent, {
    expectedSequence: intent.sequence,
    leaseTokenSha256,
    now: '2026-08-30T00:00:01.000Z',
  });
  const memory = memoryR2();
  const transport = createMediaProxyMasterR2PrivateMultipartTransportV1({
    privateStorage: privateStorage(),
    client: memory.client,
  });
  const uploadedRecord = async () => {
    const uploadId = await transport.createUpload({ record: initiating });
    let record = bindMediaProxyMasterR2MultipartUploadIdV1(initiating, {
      expectedSequence: initiating.sequence,
      leaseTokenSha256,
      uploadId,
      now: '2026-08-30T00:00:03.000Z',
    });
    const uploaded = await transport.uploadPart({
      record,
      localPath,
      partNumber: 1,
    });
    record = recordMediaProxyMasterR2MultipartPartV1(record, {
      expectedSequence: record.sequence,
      leaseTokenSha256,
      partNumber: uploaded.partNumber,
      startByte: uploaded.startByte,
      endExclusiveByte: uploaded.endExclusiveByte,
      byteLength: uploaded.byteLength,
      contentSha256: uploaded.contentSha256,
      eTag: uploaded.eTag,
      now: '2026-08-30T00:00:04.000Z',
    });
    const completing = beginMediaProxyMasterR2MultipartCompletionV1(record, {
      expectedSequence: record.sequence,
      leaseTokenSha256,
      attemptId: 'complete-1',
      now: '2026-08-30T00:00:05.000Z',
    });
    return { completing };
  };
  return {
    localPath,
    bytes,
    contentSha256,
    leaseTokenSha256,
    initiating,
    memory,
    transport,
    uploadedRecord,
  };
}

type UploadState = {
  key: string;
  initiatedAt: Date;
  metadata: Record<string, string>;
  contentType: string;
  cacheControl: string;
  contentDisposition: string;
  parts: Map<number, Uint8Array>;
};

function memoryR2() {
  const uploads = new Map<string, UploadState>();
  const objects = new Map<string, UploadState & { bytes: Uint8Array; eTag: string }>();
  const commands: unknown[] = [];
  let nextUpload = 1;
  const state = {
    uploads,
    objects,
    commands,
    completedETag: 'multipart-complete-etag',
    corruptGet: false,
    headETagOverride: null as string | null,
    client: {
      async send(command: unknown): Promise<unknown> {
        commands.push(command);
        if (command instanceof CreateMultipartUploadCommand) {
          const uploadId = `upload-${nextUpload++}`;
          uploads.set(uploadId, {
            key: String(command.input.Key),
            initiatedAt: new Date('2026-08-30T00:00:02.000Z'),
            metadata: { ...(command.input.Metadata ?? {}) },
            contentType: String(command.input.ContentType),
            cacheControl: String(command.input.CacheControl),
            contentDisposition: String(command.input.ContentDisposition),
            parts: new Map(),
          });
          return { UploadId: uploadId };
        }
        if (command instanceof ListMultipartUploadsCommand) {
          return {
            IsTruncated: false,
            Uploads: [...uploads.entries()].map(([UploadId, upload]) => ({
              UploadId,
              Key: upload.key,
              Initiated: upload.initiatedAt,
            })),
          };
        }
        if (command instanceof UploadPartCommand) {
          const upload = uploads.get(String(command.input.UploadId));
          if (!upload) throw noSuchUpload();
          const bytes = await collectBytes(command.input.Body);
          if (command.input.ContentMD5 !== md5Base64(bytes)) {
            throw new Error('TEST_CONTENT_MD5_MISMATCH');
          }
          upload.parts.set(Number(command.input.PartNumber), bytes);
          return { ETag: `"${md5Hex(bytes)}"` };
        }
        if (command instanceof ListPartsCommand) {
          const upload = uploads.get(String(command.input.UploadId));
          if (!upload) throw noSuchUpload();
          return {
            IsTruncated: false,
            Parts: [...upload.parts.entries()].map(([PartNumber, bytes]) => ({
              PartNumber,
              Size: bytes.byteLength,
              ETag: `"${md5Hex(bytes)}"`,
            })),
          };
        }
        if (command instanceof CompleteMultipartUploadCommand) {
          const uploadId = String(command.input.UploadId);
          const upload = uploads.get(uploadId);
          if (!upload) throw noSuchUpload();
          const bytes = Buffer.concat(
            [...upload.parts.entries()]
              .sort(([left], [right]) => left - right)
              .map(([, part]) => Buffer.from(part)),
          );
          objects.set(upload.key, { ...upload, bytes, eTag: state.completedETag });
          uploads.delete(uploadId);
          return { ETag: `"${state.completedETag}"` };
        }
        if (command instanceof GetObjectCommand) {
          const object = objects.get(String(command.input.Key));
          if (!object) throw noSuchKey();
          const bytes = state.corruptGet
            ? Buffer.from(object.bytes).map((value, index) => index === 0 ? value ^ 0xff : value)
            : object.bytes;
          return storedResponse(object, chunked(bytes), object.eTag);
        }
        if (command instanceof HeadObjectCommand) {
          const object = objects.get(String(command.input.Key));
          if (!object) throw noSuchKey();
          return storedResponse(
            object,
            undefined,
            state.headETagOverride ?? object.eTag,
          );
        }
        if (command instanceof AbortMultipartUploadCommand) {
          const uploadId = String(command.input.UploadId);
          if (!uploads.delete(uploadId)) throw noSuchUpload();
          return {};
        }
        throw new Error('TEST_COMMAND_UNEXPECTED');
      },
    },
  };
  return state;
}

function storedResponse(
  object: UploadState & { bytes: Uint8Array; eTag: string },
  body: AsyncIterable<Uint8Array> | undefined,
  eTag: string,
) {
  return {
    ...(body ? { Body: body } : {}),
    CacheControl: object.cacheControl,
    ContentDisposition: object.contentDisposition,
    ContentLength: object.bytes.byteLength,
    ContentType: object.contentType,
    ETag: `"${eTag}"`,
    Metadata: { ...object.metadata },
  };
}

async function collectBytes(body: unknown): Promise<Uint8Array> {
  if (!body || (typeof body !== 'object' && typeof body !== 'function')
    || !(Symbol.asyncIterator in body)) throw new Error('TEST_BODY_INVALID');
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<unknown>) {
    if (!(chunk instanceof Uint8Array)) throw new Error('TEST_CHUNK_INVALID');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

async function* chunked(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  const split = Math.max(1, Math.floor(bytes.byteLength / 2));
  yield bytes.subarray(0, split);
  yield bytes.subarray(split);
}

function noSuchUpload() {
  return Object.assign(new Error('missing'), {
    name: 'NoSuchUpload',
    $metadata: { httpStatusCode: 404 },
  });
}

function noSuchKey() {
  return Object.assign(new Error('missing'), {
    name: 'NoSuchKey',
    $metadata: { httpStatusCode: 404 },
  });
}

function privateStorage() {
  return {
    bucketName: 'editron-media-proxy-private',
    browserRouteExposure: 'NO_BROWSER_ROUTE' as const,
    storagePolicyVersion: 'private-proxy-media-v1',
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function md5Hex(value: Uint8Array): string {
  return createHash('md5').update(value).digest('hex');
}

function md5Base64(value: Uint8Array): string {
  return createHash('md5').update(value).digest('base64');
}
