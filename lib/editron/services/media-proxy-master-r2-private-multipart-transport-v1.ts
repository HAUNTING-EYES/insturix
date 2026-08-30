import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
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

import {
  assertMediaProxyMasterR2MultipartRecordV1,
  expectedMediaProxyMasterR2MultipartPartRangeV1,
  type MediaProxyMasterR2MultipartRecordV1,
  type MediaProxyMasterR2MultipartSessionV1,
} from './media-proxy-master-r2-multipart-record-v1';
import type {
  MediaSourcePtsCadenceR2CommandClientV1,
  MediaSourcePtsCadenceR2PrivateStorageScopeV1,
} from './media-source-pts-cadence-r2-private-sidecar-v1';
import { R2_MAX_PARTS } from './r2-upload-limits';

const PRIVATE_CACHE_CONTROL = 'private, no-store, max-age=0';
const CONTENT_DISPOSITION = 'inline';
const ARTIFACT_PROFILE = 'EDITRON_MEDIA_PROXY_MASTER_MP4_V1';
const DISCOVERY_PAGE_SIZE = 100;
const MAX_DISCOVERY_PAGES = 100;
const LIST_PARTS_PAGE_SIZE = 1_000;
const MAX_LIST_PARTS_PAGES = Math.ceil(R2_MAX_PARTS / LIST_PARTS_PAGE_SIZE) + 1;

export const MEDIA_PROXY_MASTER_R2_PRIVATE_MULTIPART_TRANSPORT_VERSION_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_R2_PRIVATE_MULTIPART_TRANSPORT_V1' as const;

export type MediaProxyMasterR2DiscoveredUploadV1 = Readonly<{
  uploadId: string;
  initiatedAt: string;
}>;

export type MediaProxyMasterR2ProviderPartV1 = Readonly<{
  partNumber: number;
  byteLength: number;
  eTag: string;
}>;

export type MediaProxyMasterR2LocalPartIdentityV1 = Readonly<{
  partNumber: number;
  startByte: number;
  endExclusiveByte: number;
  byteLength: number;
  contentSha256: string;
  contentMd5Hex: string;
  contentMd5Base64: string;
}>;

export interface MediaProxyMasterR2PrivateMultipartTransportV1 {
  inspectLocalArtifact(input: Readonly<{
    record: MediaProxyMasterR2MultipartRecordV1;
    localPath: string;
    abortSignal?: AbortSignal;
  }>): Promise<Readonly<{ byteLength: number; contentSha256: string }>>;
  discoverUploads(input: Readonly<{
    record: MediaProxyMasterR2MultipartRecordV1;
    abortSignal?: AbortSignal;
  }>): Promise<readonly MediaProxyMasterR2DiscoveredUploadV1[]>;
  createUpload(input: Readonly<{
    record: MediaProxyMasterR2MultipartRecordV1;
    abortSignal?: AbortSignal;
  }>): Promise<string>;
  listParts(input: Readonly<{
    record: MediaProxyMasterR2MultipartRecordV1;
    abortSignal?: AbortSignal;
  }>): Promise<readonly MediaProxyMasterR2ProviderPartV1[]>;
  inspectLocalPart(input: Readonly<{
    record: MediaProxyMasterR2MultipartRecordV1;
    localPath: string;
    partNumber: number;
    abortSignal?: AbortSignal;
  }>): Promise<MediaProxyMasterR2LocalPartIdentityV1>;
  uploadPart(input: Readonly<{
    record: MediaProxyMasterR2MultipartRecordV1;
    localPath: string;
    partNumber: number;
    abortSignal?: AbortSignal;
  }>): Promise<Readonly<MediaProxyMasterR2LocalPartIdentityV1 & { eTag: string }>>;
  complete(input: Readonly<{
    record: MediaProxyMasterR2MultipartRecordV1;
    abortSignal?: AbortSignal;
  }>): Promise<string>;
  verifyPublishedObject(input: Readonly<{
    record: MediaProxyMasterR2MultipartRecordV1;
    abortSignal?: AbortSignal;
  }>): Promise<Readonly<{
    eTag: string;
    byteLength: number;
    contentSha256: string;
  }> | null>;
  abort(input: Readonly<{
    record: MediaProxyMasterR2MultipartRecordV1;
    uploadId: string;
    abortSignal?: AbortSignal;
  }>): Promise<'ABORTED' | 'UPLOAD_NOT_FOUND'>;
}

export function createMediaProxyMasterR2PrivateMultipartTransportV1(input: Readonly<{
  privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1;
  client: MediaSourcePtsCadenceR2CommandClientV1;
}>): Readonly<MediaProxyMasterR2PrivateMultipartTransportV1> {
  const storage = normalizeStorage(input.privateStorage, input.client);
  const transport: MediaProxyMasterR2PrivateMultipartTransportV1 = {
    inspectLocalArtifact: async (request) => {
      const { record } = context(storage, request.record);
      return inspectLocalRange({
        localPath: request.localPath,
        expectedFileBytes: record.artifact.byteLength,
        startByte: 0,
        endExclusiveByte: record.artifact.byteLength,
        abortSignal: request.abortSignal,
      }).then((identity) => {
        if (identity.contentSha256 !== record.artifact.contentSha256) {
          fail('LOCAL_ARTIFACT_CONTENT_MISMATCH');
        }
        return Object.freeze({
          byteLength: identity.byteLength,
          contentSha256: identity.contentSha256,
        });
      });
    },

    discoverUploads: async (request) => {
      const { record, session } = context(storage, request.record);
      if (!['INITIATING', 'ABORT_PENDING'].includes(record.status)) {
        fail('DISCOVERY_STATE_INVALID');
      }
      const discovered: MediaProxyMasterR2DiscoveredUploadV1[] = [];
      let keyMarker: string | undefined;
      let uploadIdMarker: string | undefined;
      for (let page = 0; page < MAX_DISCOVERY_PAGES; page += 1) {
        let response: Record<string, unknown>;
        try {
          response = object(await send(storage.client, new ListMultipartUploadsCommand({
            Bucket: storage.bucketName,
            Prefix: session.objectKey,
            MaxUploads: DISCOVERY_PAGE_SIZE,
            ...(keyMarker ? { KeyMarker: keyMarker } : {}),
            ...(uploadIdMarker ? { UploadIdMarker: uploadIdMarker } : {}),
          }), request.abortSignal), 'DISCOVERY_RESPONSE');
        } catch {
          throwIfAborted(request.abortSignal);
          fail('DISCOVERY_FAILED');
        }
        const uploads = response.Uploads === undefined ? [] : array(response.Uploads, 'DISCOVERY_UPLOADS');
        for (const candidate of uploads) {
          const upload = object(candidate, 'DISCOVERY_UPLOAD');
          if (upload.Key !== session.objectKey) continue;
          discovered.push(Object.freeze({
            uploadId: boundedText(upload.UploadId, 1_024, 'UPLOAD_ID'),
            initiatedAt: dateIso(upload.Initiated, 'UPLOAD_INITIATED_AT'),
          }));
          if (discovered.length > R2_MAX_PARTS) fail('DISCOVERY_RESULT_LIMIT');
        }
        if (response.IsTruncated !== true) {
          if (response.IsTruncated !== undefined && response.IsTruncated !== false) {
            fail('DISCOVERY_RESPONSE_INVALID');
          }
          return Object.freeze(discovered.sort((left, right) => (
            left.initiatedAt === right.initiatedAt
              ? left.uploadId.localeCompare(right.uploadId)
              : left.initiatedAt.localeCompare(right.initiatedAt)
          )));
        }
        const nextKey = boundedText(response.NextKeyMarker, 1_024, 'NEXT_KEY_MARKER');
        const nextUpload = boundedText(
          response.NextUploadIdMarker,
          1_024,
          'NEXT_UPLOAD_ID_MARKER',
        );
        if (nextKey === keyMarker && nextUpload === uploadIdMarker) {
          fail('DISCOVERY_PAGINATION_LOOP');
        }
        keyMarker = nextKey;
        uploadIdMarker = nextUpload;
      }
      fail('DISCOVERY_PAGE_LIMIT');
    },

    createUpload: async (request) => {
      const { record, session } = context(storage, request.record);
      if (record.status !== 'INITIATING' || session.uploadId !== null) {
        fail('CREATE_STATE_INVALID');
      }
      let response: Record<string, unknown>;
      try {
        response = object(await send(storage.client, new CreateMultipartUploadCommand({
          Bucket: storage.bucketName,
          Key: session.objectKey,
          ContentType: record.artifact.contentType,
          CacheControl: record.artifact.cacheControl,
          ContentDisposition: record.artifact.contentDisposition,
          Metadata: metadata(record, session),
        }), request.abortSignal), 'CREATE_RESPONSE');
      } catch {
        throwIfAborted(request.abortSignal);
        fail('CREATE_FAILED');
      }
      return boundedText(response.UploadId, 1_024, 'UPLOAD_ID');
    },

    listParts: async (request) => {
      const { record, session } = context(storage, request.record);
      const uploadId = requireUploadId(session);
      const parts: MediaProxyMasterR2ProviderPartV1[] = [];
      let partNumberMarker: string | undefined;
      for (let page = 0; page < MAX_LIST_PARTS_PAGES; page += 1) {
        let response: Record<string, unknown>;
        try {
          response = object(await send(storage.client, new ListPartsCommand({
            Bucket: storage.bucketName,
            Key: session.objectKey,
            UploadId: uploadId,
            MaxParts: LIST_PARTS_PAGE_SIZE,
            ...(partNumberMarker ? { PartNumberMarker: partNumberMarker } : {}),
          }), request.abortSignal), 'LIST_PARTS_RESPONSE');
        } catch {
          throwIfAborted(request.abortSignal);
          fail('LIST_PARTS_FAILED');
        }
        const candidates = response.Parts === undefined ? [] : array(response.Parts, 'LIST_PARTS');
        for (const candidate of candidates) {
          const part = object(candidate, 'PROVIDER_PART');
          const partNumber = positiveInteger(part.PartNumber, R2_MAX_PARTS, 'PROVIDER_PART_NUMBER');
          const expected = expectedMediaProxyMasterR2MultipartPartRangeV1(record, partNumber);
          if (part.Size !== expected.byteLength) fail('PROVIDER_PART_SIZE_MISMATCH');
          parts.push(Object.freeze({
            partNumber,
            byteLength: expected.byteLength,
            eTag: eTag(part.ETag, 'PROVIDER_PART_ETAG'),
          }));
          if (parts.length > record.artifact.multipartPlan.totalParts) {
            fail('PROVIDER_PART_LIMIT');
          }
        }
        if (response.IsTruncated !== true) {
          if (response.IsTruncated !== undefined && response.IsTruncated !== false) {
            fail('LIST_PARTS_RESPONSE_INVALID');
          }
          parts.sort((left, right) => left.partNumber - right.partNumber);
          if (parts.some((part, index) => index > 0
            && part.partNumber === parts[index - 1]?.partNumber)) {
            fail('PROVIDER_PART_DUPLICATE');
          }
          return Object.freeze(parts);
        }
        const next = boundedText(
          response.NextPartNumberMarker,
          32,
          'NEXT_PART_NUMBER_MARKER',
        );
        if (next === partNumberMarker) fail('LIST_PARTS_PAGINATION_LOOP');
        partNumberMarker = next;
      }
      fail('LIST_PARTS_PAGE_LIMIT');
    },

    inspectLocalPart: async (request) => {
      const { record } = context(storage, request.record);
      const range = expectedMediaProxyMasterR2MultipartPartRangeV1(
        record,
        request.partNumber,
      );
      const identity = await inspectLocalRange({
        localPath: request.localPath,
        expectedFileBytes: record.artifact.byteLength,
        startByte: range.startByte,
        endExclusiveByte: range.endExclusiveByte,
        abortSignal: request.abortSignal,
      });
      return Object.freeze({ ...range, ...identity });
    },

    uploadPart: async (request) => {
      const { record, session } = context(storage, request.record);
      if (record.status !== 'UPLOADING') fail('UPLOAD_PART_STATE_INVALID');
      const uploadId = requireUploadId(session);
      const range = expectedMediaProxyMasterR2MultipartPartRangeV1(
        record,
        request.partNumber,
      );
      const localPath = absolutePath(request.localPath);
      const before = await pathFileIdentity(localPath, record.artifact.byteLength);
      const identity = await inspectLocalRange({
        localPath,
        expectedFileBytes: record.artifact.byteLength,
        startByte: range.startByte,
        endExclusiveByte: range.endExclusiveByte,
        abortSignal: request.abortSignal,
      });
      const body = createReadStream(localPath, {
        start: range.startByte,
        end: range.endExclusiveByte - 1,
      });
      const stopBody = () => body.destroy();
      request.abortSignal?.addEventListener('abort', stopBody, { once: true });
      let response: Record<string, unknown>;
      try {
        response = object(await send(storage.client, new UploadPartCommand({
          Bucket: storage.bucketName,
          Key: session.objectKey,
          UploadId: uploadId,
          PartNumber: range.partNumber,
          Body: body,
          ContentLength: range.byteLength,
          ContentMD5: identity.contentMd5Base64,
        }), request.abortSignal), 'UPLOAD_PART_RESPONSE');
      } catch {
        throwIfAborted(request.abortSignal);
        fail('UPLOAD_PART_FAILED');
      } finally {
        request.abortSignal?.removeEventListener('abort', stopBody);
        body.destroy();
      }
      const after = await pathFileIdentity(localPath, record.artifact.byteLength);
      if (!sameFileIdentity(before, after)) fail('LOCAL_FILE_CHANGED');
      const observedETag = eTag(response.ETag, 'UPLOAD_PART_ETAG');
      if (observedETag !== identity.contentMd5Hex) fail('UPLOAD_PART_ETAG_MISMATCH');
      return Object.freeze({ ...range, ...identity, eTag: observedETag });
    },

    complete: async (request) => {
      const { record, session } = context(storage, request.record);
      if (record.status !== 'COMPLETING'
        || session.parts.length !== record.artifact.multipartPlan.totalParts) {
        fail('COMPLETE_STATE_INVALID');
      }
      const uploadId = requireUploadId(session);
      let response: Record<string, unknown>;
      try {
        response = object(await send(storage.client, new CompleteMultipartUploadCommand({
          Bucket: storage.bucketName,
          Key: session.objectKey,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: session.parts.map((part) => ({
              PartNumber: part.partNumber,
              ETag: part.eTag,
            })),
          },
        }), request.abortSignal), 'COMPLETE_RESPONSE');
      } catch {
        throwIfAborted(request.abortSignal);
        fail('COMPLETE_FAILED');
      }
      return eTag(response.ETag, 'COMPLETE_ETAG');
    },

    verifyPublishedObject: async (request) => {
      const { record, session } = context(storage, request.record);
      if (!['COMPLETING', 'PUBLISHED'].includes(record.status)) {
        fail('VERIFY_STATE_INVALID');
      }
      let getResponse: Record<string, unknown>;
      try {
        getResponse = object(await send(storage.client, new GetObjectCommand({
          Bucket: storage.bucketName,
          Key: session.objectKey,
        }), request.abortSignal), 'GET_RESPONSE');
      } catch (error) {
        throwIfAborted(request.abortSignal);
        if (isMissingObject(error)) return null;
        fail('GET_FAILED');
      }
      assertStoredHeaders(getResponse, record, session);
      const getETag = eTag(getResponse.ETag, 'GET_ETAG');
      const observed = await digestBody(
        getResponse.Body,
        record.artifact.byteLength,
        request.abortSignal,
      );
      if (observed.contentSha256 !== record.artifact.contentSha256) {
        fail('STORED_CONTENT_MISMATCH');
      }
      let headResponse: Record<string, unknown>;
      try {
        headResponse = object(await send(storage.client, new HeadObjectCommand({
          Bucket: storage.bucketName,
          Key: session.objectKey,
        }), request.abortSignal), 'HEAD_RESPONSE');
      } catch {
        throwIfAborted(request.abortSignal);
        fail('HEAD_FAILED');
      }
      assertStoredHeaders(headResponse, record, session);
      const headETag = eTag(headResponse.ETag, 'HEAD_ETAG');
      if (headETag !== getETag) fail('PROVIDER_VERSION_CHANGED');
      return Object.freeze({
        eTag: getETag,
        byteLength: observed.byteLength,
        contentSha256: observed.contentSha256,
      });
    },

    abort: async (request) => {
      const { record, session } = context(storage, request.record);
      if (record.status !== 'ABORT_PENDING') fail('ABORT_STATE_INVALID');
      const uploadId = boundedText(request.uploadId, 1_024, 'UPLOAD_ID');
      try {
        await send(storage.client, new AbortMultipartUploadCommand({
          Bucket: storage.bucketName,
          Key: session.objectKey,
          UploadId: uploadId,
        }), request.abortSignal);
        return 'ABORTED';
      } catch (error) {
        throwIfAborted(request.abortSignal);
        if (isNoSuchUpload(error)) return 'UPLOAD_NOT_FOUND';
        fail('ABORT_FAILED');
      }
    },
  };
  return Object.freeze(transport);
}

function context(
  storage: Readonly<{
    bucketName: string;
    storagePolicyVersion: string;
    client: MediaSourcePtsCadenceR2CommandClientV1;
  }>,
  value: MediaProxyMasterR2MultipartRecordV1,
): Readonly<{
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>;
  session: MediaProxyMasterR2MultipartSessionV1;
}> {
  const record = assertMediaProxyMasterR2MultipartRecordV1(value);
  if (record.artifact.bucketName !== storage.bucketName
    || record.artifact.storagePolicyVersion !== storage.storagePolicyVersion) {
    fail('STORAGE_BINDING_MISMATCH');
  }
  const session = record.sessions.at(-1);
  if (!session) fail('SESSION_MISSING');
  return Object.freeze({ record, session });
}

function metadata(
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  session: MediaProxyMasterR2MultipartSessionV1,
): Record<string, string> {
  const ownerId = record.artifact.owner.kind === 'USER'
    ? record.artifact.owner.userId : record.artifact.owner.orgId;
  return {
    artifactprofile: ARTIFACT_PROFILE,
    transportversion: MEDIA_PROXY_MASTER_R2_PRIVATE_MULTIPART_TRANSPORT_VERSION_V1,
    storagepolicyversion: record.artifact.storagePolicyVersion,
    artifactbindingsha256: record.artifactBindingSha256,
    recordid: record.recordId,
    jobid: record.artifact.jobId,
    sessiongeneration: String(session.generation),
    logicalobjectkey: record.artifact.objectKey,
    contentsha256: record.artifact.contentSha256,
    bytelength: String(record.artifact.byteLength),
    commandsha256: record.artifact.commandSha256,
    outputprobesha256: record.artifact.outputProbeSha256,
    ownerkind: record.artifact.owner.kind,
    ownerid: ownerId,
    assetid: record.artifact.assetId,
  };
}

function assertStoredHeaders(
  response: Readonly<Record<string, unknown>>,
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  session: MediaProxyMasterR2MultipartSessionV1,
): void {
  if (response.CacheControl !== PRIVATE_CACHE_CONTROL
    || response.ContentDisposition !== CONTENT_DISPOSITION
    || response.ContentLength !== record.artifact.byteLength
    || response.ContentType !== 'video/mp4'
    || !sameMetadata(response.Metadata, metadata(record, session))) {
    fail('STORED_HEADERS_OR_METADATA_INVALID');
  }
}

async function inspectLocalRange(input: Readonly<{
  localPath: string;
  expectedFileBytes: number;
  startByte: number;
  endExclusiveByte: number;
  abortSignal?: AbortSignal;
}>): Promise<Readonly<{
  byteLength: number;
  contentSha256: string;
  contentMd5Hex: string;
  contentMd5Base64: string;
}>> {
  if (!Number.isSafeInteger(input.startByte) || input.startByte < 0
    || !Number.isSafeInteger(input.endExclusiveByte)
    || input.endExclusiveByte <= input.startByte
    || input.endExclusiveByte > input.expectedFileBytes) {
    fail('LOCAL_RANGE_INVALID');
  }
  const localPath = absolutePath(input.localPath);
  const before = await pathFileIdentity(localPath, input.expectedFileBytes);
  const stream = createReadStream(localPath, {
    start: input.startByte,
    end: input.endExclusiveByte - 1,
  });
  let identity;
  try {
    identity = await digestBody(
      stream,
      input.endExclusiveByte - input.startByte,
      input.abortSignal,
      true,
    );
  } finally {
    stream.destroy();
  }
  const after = await pathFileIdentity(localPath, input.expectedFileBytes);
  if (!sameFileIdentity(before, after)) fail('LOCAL_FILE_CHANGED');
  return identity;
}

async function pathFileIdentity(localPath: string, expectedBytes: number) {
  let stat;
  try {
    stat = await lstat(localPath);
  } catch {
    fail('LOCAL_FILE_INVALID');
  }
  if (!stat!.isFile() || stat!.isSymbolicLink() || stat!.size !== expectedBytes) {
    fail('LOCAL_FILE_INVALID');
  }
  return Object.freeze({
    size: stat!.size,
    mtimeMs: stat!.mtimeMs,
    ctimeMs: stat!.ctimeMs,
  });
}

function sameFileIdentity(
  left: Readonly<{ size: number; mtimeMs: number; ctimeMs: number }>,
  right: Readonly<{ size: number; mtimeMs: number; ctimeMs: number }>,
): boolean {
  return left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

async function digestBody(
  body: unknown,
  expectedByteLength: number,
  abortSignal?: AbortSignal,
  includeMd5 = false,
): Promise<Readonly<{
  byteLength: number;
  contentSha256: string;
  contentMd5Hex: string;
  contentMd5Base64: string;
}>> {
  throwIfAborted(abortSignal);
  if (!body || (typeof body !== 'object' && typeof body !== 'function')
    || !(Symbol.asyncIterator in body)) fail('BODY_INVALID');
  const sha256Digest = createHash('sha256');
  const md5Digest = includeMd5 ? createHash('md5') : null;
  let byteLength = 0;
  for await (const chunk of body as AsyncIterable<unknown>) {
    throwIfAborted(abortSignal);
    if (!(chunk instanceof Uint8Array)
      || byteLength + chunk.byteLength > expectedByteLength) fail('BODY_LENGTH_MISMATCH');
    byteLength += chunk.byteLength;
    sha256Digest.update(chunk);
    md5Digest?.update(chunk);
  }
  if (byteLength !== expectedByteLength) fail('BODY_LENGTH_MISMATCH');
  const md5 = md5Digest?.digest() ?? Buffer.alloc(0);
  return Object.freeze({
    byteLength,
    contentSha256: sha256Digest.digest('hex'),
    contentMd5Hex: md5.toString('hex'),
    contentMd5Base64: md5.toString('base64'),
  });
}

function normalizeStorage(
  value: MediaSourcePtsCadenceR2PrivateStorageScopeV1,
  client: MediaSourcePtsCadenceR2CommandClientV1,
) {
  if (!value || value.browserRouteExposure !== 'NO_BROWSER_ROUTE'
    || value.bucketName === 'editron-cdn'
    || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value.bucketName)
    || typeof value.storagePolicyVersion !== 'string'
    || value.storagePolicyVersion.trim() !== value.storagePolicyVersion
    || value.storagePolicyVersion.length < 1 || value.storagePolicyVersion.length > 256
    || /[\u0000-\u001F\u007F]/.test(value.storagePolicyVersion)) {
    fail('PRIVATE_STORAGE_INVALID');
  }
  if (!client || typeof client.send !== 'function') fail('CLIENT_INVALID');
  return Object.freeze({
    bucketName: value.bucketName,
    storagePolicyVersion: value.storagePolicyVersion,
    client,
  });
}

async function send(
  client: MediaSourcePtsCadenceR2CommandClientV1,
  command: unknown,
  abortSignal?: AbortSignal,
): Promise<unknown> {
  throwIfAborted(abortSignal);
  const abortable = client as unknown as Readonly<{
    send(commandInput: unknown, options?: Readonly<{ abortSignal?: AbortSignal }>): Promise<unknown>;
  }>;
  return abortable.send(command, abortSignal ? { abortSignal } : undefined);
}

function requireUploadId(session: MediaProxyMasterR2MultipartSessionV1): string {
  if (session.uploadId === null) fail('UPLOAD_ID_MISSING');
  return boundedText(session.uploadId, 1_024, 'UPLOAD_ID');
}

function absolutePath(value: unknown): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.length > 4_096
    || /[\u0000-\u001F\u007F]/.test(value)) fail('LOCAL_PATH_INVALID');
  return value;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_INVALID`);
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label}_INVALID`);
  return value;
}

function boundedText(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1
    || value.length > maximum || /[\u0000-\u001F\u007F]/.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function positiveInteger(value: unknown, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    fail(`${label}_INVALID`);
  }
  return Number(value);
}

function eTag(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label}_INVALID`);
  const normalized = value.trim().replace(/^"|"$/g, '');
  if (normalized.length < 1 || normalized.length > 512
    || /[\u0000-\u001F\u007F]/.test(normalized)) fail(`${label}_INVALID`);
  return normalized;
}

function dateIso(value: unknown, label: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail(`${label}_INVALID`);
  return value.toISOString();
}

function sameMetadata(value: unknown, expected: Record<string, string>): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index]
      && actual[key] === expected[key]);
}

function isNoSuchUpload(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; Code?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return candidate.name === 'NoSuchUpload' || candidate.Code === 'NoSuchUpload'
    || candidate.$metadata?.httpStatusCode === 404;
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    name?: unknown;
    Code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return candidate.name === 'NoSuchKey' || candidate.name === 'NotFound'
    || candidate.Code === 'NoSuchKey' || candidate.Code === 'NotFound'
    || candidate.$metadata?.httpStatusCode === 404;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) fail('ABORTED');
}

function fail(code: string): never {
  throw new MediaProxyMasterR2PrivateMultipartTransportErrorV1(code);
}

export class MediaProxyMasterR2PrivateMultipartTransportErrorV1 extends Error {
  constructor(code: string) {
    super(`MEDIA_PROXY_MASTER_R2_PRIVATE_MULTIPART_TRANSPORT_${code}`);
    this.name = 'MediaProxyMasterR2PrivateMultipartTransportErrorV1';
  }
}
