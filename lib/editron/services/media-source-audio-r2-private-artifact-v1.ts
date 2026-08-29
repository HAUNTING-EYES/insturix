import { createHash } from 'node:crypto';

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

import {
  assertMediaSourceAudioPcmChunkReferenceV1,
  assertMediaSourceAudioPrivateArtifactPolicyV1,
  assertMediaSourceAudioPrivateObjectReferenceV1,
  createMediaSourceAudioEpochMapArtifactReferenceV1,
  createMediaSourceAudioPcmChunkPlanV1,
  createMediaSourceAudioPcmChunkReferenceV1,
  createMediaSourceAudioPrivateArtifactManifestV1,
  parseMediaSourceAudioPrivateArtifactManifestV1,
  serializeMediaSourceAudioPrivateArtifactManifestV1,
  verifyMediaSourceAudioPrivateArtifactSetV1,
  type MediaSourceAudioPcmChunkPlanEntryV1,
  type MediaSourceAudioPrivateArtifactManifestSerializationV1,
  type MediaSourceAudioPrivateArtifactManifestV1,
  type MediaSourceAudioPrivateArtifactPolicyV1,
  type MediaSourceAudioPrivateObjectReferenceV1,
} from './media-source-audio-private-artifact-v1';
import type {
  MediaSourceAudioPcmByteStreamV1,
  MediaSourceAudioPrivateArtifactStreamWriterV1,
} from './media-source-audio-private-artifact-port-v1';
import {
  serializeMediaSourceAudioSampleEpochMapV1,
  type MediaSourceAudioSampleEpochMapSerializationV1,
  type MediaSourceAudioSampleEpochMapV1,
} from './media-source-audio-sample-epoch-map-v1';
import type {
  MediaSourcePtsCadenceR2CommandClientV1,
  MediaSourcePtsCadenceR2PrivateStorageScopeV1,
} from './media-source-pts-cadence-r2-private-sidecar-v1';

export type MediaSourceAudioPcmChunkUploadV1 = Readonly<{
  planEntry: MediaSourceAudioPcmChunkPlanEntryV1;
  bytes: Uint8Array;
}>;

export type MediaSourceAudioPrivateArtifactSetReadV1 = Readonly<{
  manifest: MediaSourceAudioPrivateArtifactManifestV1;
  map: MediaSourceAudioSampleEpochMapV1;
  mapCanonicalJson: string;
}>;

export type MediaSourceAudioPrivatePcmRangeReadV1 = Readonly<{
  manifestSha256: string;
  audioSampleEpochMapSha256: string;
  decodedPcmSha256: string;
  streamId: string;
  sampleRate: string;
  channelCount: number;
  startSampleFrame: string;
  endExclusiveSampleFrame: string;
  pcmBytes: Uint8Array;
  rangeSha256: string;
}>;

export interface MediaSourceAudioPrivateArtifactStoreV1
  extends MediaSourceAudioPrivateArtifactStreamWriterV1 {
  writeArtifactSet(input: Readonly<{
    mapSerialization: MediaSourceAudioSampleEpochMapSerializationV1;
    chunks: Iterable<MediaSourceAudioPcmChunkUploadV1>
      | AsyncIterable<MediaSourceAudioPcmChunkUploadV1>;
  }>): Promise<MediaSourceAudioPrivateArtifactManifestSerializationV1>;
  readArtifactSet(
    reference: MediaSourceAudioPrivateObjectReferenceV1,
  ): Promise<MediaSourceAudioPrivateArtifactSetReadV1>;
  readPcmSampleRange(input: Readonly<{
    manifestReference: MediaSourceAudioPrivateObjectReferenceV1;
    startSampleFrame: string;
    endExclusiveSampleFrame: string;
  }>): Promise<MediaSourceAudioPrivatePcmRangeReadV1>;
}

export function createMediaSourceAudioR2PrivateArtifactStoreV1(input: Readonly<{
  privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1;
  client: MediaSourcePtsCadenceR2CommandClientV1;
  policy: MediaSourceAudioPrivateArtifactPolicyV1;
}>): MediaSourceAudioPrivateArtifactStoreV1 {
  const storage = normalizeStorage(input.privateStorage, input.client);
  const policy = assertMediaSourceAudioPrivateArtifactPolicyV1(input.policy);

  const readArtifactSet = async (
    reference: MediaSourceAudioPrivateObjectReferenceV1,
  ): Promise<MediaSourceAudioPrivateArtifactSetReadV1> => {
    const manifestReference = assertMediaSourceAudioPrivateObjectReferenceV1(reference);
    if (manifestReference.artifactKind !== 'MANIFEST') {
      throw new Error('MEDIA_SOURCE_AUDIO_R2_MANIFEST_REFERENCE_REQUIRED');
    }
    const manifestBytes = await readExactObject({
      ...storage,
      reference: manifestReference,
      contentType: 'application/json; charset=utf-8',
    });
    const manifestJson = Buffer.from(manifestBytes).toString('utf8');
    const manifest = parseMediaSourceAudioPrivateArtifactManifestV1(manifestJson);
    const expectedManifest = serializeMediaSourceAudioPrivateArtifactManifestV1(manifest);
    if (!sameReference(expectedManifest.reference, manifestReference)) {
      throw new Error('MEDIA_SOURCE_AUDIO_R2_MANIFEST_REFERENCE_MISMATCH');
    }
    const mapBytes = await readExactObject({
      ...storage,
      reference: manifest.epochMapArtifact,
      contentType: 'application/json; charset=utf-8',
    });
    const mapCanonicalJson = Buffer.from(mapBytes).toString('utf8');
    const map = verifyMediaSourceAudioPrivateArtifactSetV1({
      manifest,
      mapCanonicalJson,
    });
    return Object.freeze({ manifest, map, mapCanonicalJson });
  };

  const store: MediaSourceAudioPrivateArtifactStoreV1 = {
    async writeArtifactSet({ mapSerialization, chunks }) {
      const canonicalMapSerialization = normalizeMapSerialization(mapSerialization);
      const map = canonicalMapSerialization.map;
      const mapReference = createMediaSourceAudioEpochMapArtifactReferenceV1({
        serialization: canonicalMapSerialization,
      });
      const plan = createMediaSourceAudioPcmChunkPlanV1({ map, policy });
      const chunkReferences = [];
      const decodedPcmDigest = createHash('sha256');
      let receivedChunkCount = 0;
      for await (const upload of chunks) {
        if (receivedChunkCount >= plan.length) {
          throw new Error('MEDIA_SOURCE_AUDIO_R2_EXTRA_PCM_CHUNK');
        }
        const expected = plan[receivedChunkCount]!;
        const actualEntry = normalizeUploadPlanEntry(upload.planEntry);
        if (!samePlanEntry(actualEntry, expected)) {
          throw new Error('MEDIA_SOURCE_AUDIO_R2_PCM_CHUNK_ORDER_MISMATCH');
        }
        const bytes = exactBytes(
          upload.bytes,
          expected.byteLength,
          'MEDIA_SOURCE_AUDIO_R2_PCM_CHUNK_BYTES_MISMATCH',
        );
        decodedPcmDigest.update(bytes);
        const chunkReference = createMediaSourceAudioPcmChunkReferenceV1({
          map,
          planEntry: expected,
          contentSha256: digest(bytes),
        });
        await writeAndVerifyExactObject({
          ...storage,
          reference: chunkReference,
          body: bytes,
          contentType: 'application/octet-stream',
        });
        chunkReferences.push(chunkReference);
        receivedChunkCount += 1;
      }
      if (receivedChunkCount !== plan.length) {
        throw new Error('MEDIA_SOURCE_AUDIO_R2_PCM_CHUNK_COVERAGE_INCOMPLETE');
      }
      if (decodedPcmDigest.digest('hex') !== map.pcm.decodedPcmSha256) {
        throw new Error('MEDIA_SOURCE_AUDIO_R2_PCM_AGGREGATE_HASH_MISMATCH');
      }
      await writeAndVerifyExactObject({
        ...storage,
        reference: mapReference,
        body: Buffer.from(canonicalMapSerialization.canonicalJson, 'utf8'),
        contentType: 'application/json; charset=utf-8',
      });
      const manifest = createMediaSourceAudioPrivateArtifactManifestV1({
        map,
        epochMapArtifact: mapReference,
        pcmChunks: chunkReferences,
        policy,
      });
      const manifestSerialization = serializeMediaSourceAudioPrivateArtifactManifestV1(
        manifest,
      );
      await writeAndVerifyExactObject({
        ...storage,
        reference: manifestSerialization.reference,
        body: Buffer.from(manifestSerialization.canonicalJson, 'utf8'),
        contentType: 'application/json; charset=utf-8',
      });
      return manifestSerialization;
    },
    async writeArtifactSetFromPcmStream({ mapSerialization, pcmBytes }) {
      const canonicalMapSerialization = normalizeMapSerialization(mapSerialization);
      const plan = createMediaSourceAudioPcmChunkPlanV1({
        map: canonicalMapSerialization.map,
        policy,
      });
      return store.writeArtifactSet({
        mapSerialization: canonicalMapSerialization,
        chunks: partitionPcmByteStream({
          pcmBytes,
          plan,
        }),
      });
    },
    readArtifactSet,
    async readPcmSampleRange(rangeInput) {
      const artifactSet = await readArtifactSet(rangeInput.manifestReference);
      const startSampleFrame = nonNegativeIntegerText(
        rangeInput.startSampleFrame,
        'MEDIA_SOURCE_AUDIO_R2_RANGE_START_INVALID',
      );
      const endExclusiveSampleFrame = positiveIntegerText(
        rangeInput.endExclusiveSampleFrame,
        'MEDIA_SOURCE_AUDIO_R2_RANGE_END_INVALID',
      );
      if (BigInt(startSampleFrame) >= BigInt(endExclusiveSampleFrame)
        || BigInt(endExclusiveSampleFrame)
          > BigInt(artifactSet.manifest.decodedSampleFrameCount)) {
        throw new Error('MEDIA_SOURCE_AUDIO_R2_RANGE_INVALID');
      }
      const bytesPerSampleFrame = artifactSet.manifest.channelCount * 4;
      const outputByteLength = Number(
        (BigInt(endExclusiveSampleFrame) - BigInt(startSampleFrame))
          * BigInt(bytesPerSampleFrame),
      );
      if (!Number.isSafeInteger(outputByteLength) || outputByteLength < 1
        || outputByteLength > policy.maxReadBytes) {
        throw new Error('MEDIA_SOURCE_AUDIO_R2_RANGE_BYTE_LIMIT_EXCEEDED');
      }
      const output = new Uint8Array(outputByteLength);
      let outputOffset = 0;
      for (const candidate of artifactSet.manifest.pcmChunks) {
        const chunk = assertMediaSourceAudioPcmChunkReferenceV1(candidate);
        const chunkStart = BigInt(chunk.startSampleFrame);
        const chunkEnd = BigInt(chunk.endExclusiveSampleFrame);
        const requestedStart = BigInt(startSampleFrame);
        const requestedEnd = BigInt(endExclusiveSampleFrame);
        const intersectionStart = requestedStart > chunkStart ? requestedStart : chunkStart;
        const intersectionEnd = requestedEnd < chunkEnd ? requestedEnd : chunkEnd;
        if (intersectionStart >= intersectionEnd) continue;
        const chunkBytes = await readExactObject({
          ...storage,
          reference: chunk,
          contentType: 'application/octet-stream',
        });
        const sourceStart = Number(
          (intersectionStart - chunkStart) * BigInt(bytesPerSampleFrame),
        );
        const sourceEnd = Number(
          (intersectionEnd - chunkStart) * BigInt(bytesPerSampleFrame),
        );
        const selected = chunkBytes.subarray(sourceStart, sourceEnd);
        output.set(selected, outputOffset);
        outputOffset += selected.byteLength;
      }
      if (outputOffset !== output.byteLength) {
        throw new Error('MEDIA_SOURCE_AUDIO_R2_RANGE_COVERAGE_INCOMPLETE');
      }
      return Object.freeze({
        manifestSha256: artifactSet.manifest.manifestSha256,
        audioSampleEpochMapSha256: artifactSet.map.audioSampleEpochMapSha256,
        decodedPcmSha256: artifactSet.map.pcm.decodedPcmSha256,
        streamId: artifactSet.map.binding.streamId,
        sampleRate: artifactSet.map.binding.sampleRate,
        channelCount: artifactSet.map.binding.channelCount,
        startSampleFrame,
        endExclusiveSampleFrame,
        pcmBytes: output,
        rangeSha256: digest(output),
      });
    },
  };
  return store;
}

function normalizeMapSerialization(
  mapSerialization: MediaSourceAudioSampleEpochMapSerializationV1,
): MediaSourceAudioSampleEpochMapSerializationV1 {
  const canonical = serializeMediaSourceAudioSampleEpochMapV1(mapSerialization.map);
  if (canonical.canonicalJson !== mapSerialization.canonicalJson
    || canonical.byteLength !== mapSerialization.byteLength
    || canonical.contentSha256 !== mapSerialization.contentSha256) {
    throw new Error('MEDIA_SOURCE_AUDIO_R2_MAP_SERIALIZATION_MISMATCH');
  }
  return canonical;
}

async function* partitionPcmByteStream(input: Readonly<{
  pcmBytes: MediaSourceAudioPcmByteStreamV1;
  plan: readonly MediaSourceAudioPcmChunkPlanEntryV1[];
}>): AsyncIterable<MediaSourceAudioPcmChunkUploadV1> {
  if (!isPcmByteStream(input.pcmBytes)) {
    throw new Error('MEDIA_SOURCE_AUDIO_R2_PCM_STREAM_INVALID');
  }
  let planIndex = 0;
  let outputOffset = 0;
  let output = new Uint8Array(input.plan[0]!.byteLength);
  for await (const sourceChunk of input.pcmBytes) {
    if (!(sourceChunk instanceof Uint8Array) || sourceChunk.byteLength < 1) {
      throw new Error('MEDIA_SOURCE_AUDIO_R2_PCM_STREAM_CHUNK_INVALID');
    }
    let sourceOffset = 0;
    while (sourceOffset < sourceChunk.byteLength) {
      const planEntry = input.plan[planIndex];
      if (!planEntry) {
        throw new Error('MEDIA_SOURCE_AUDIO_R2_PCM_STREAM_EXTRA_BYTES');
      }
      const copyLength = Math.min(
        sourceChunk.byteLength - sourceOffset,
        output.byteLength - outputOffset,
      );
      output.set(sourceChunk.subarray(sourceOffset, sourceOffset + copyLength), outputOffset);
      sourceOffset += copyLength;
      outputOffset += copyLength;
      if (outputOffset !== output.byteLength) continue;
      yield Object.freeze({ planEntry, bytes: output });
      planIndex += 1;
      outputOffset = 0;
      if (planIndex < input.plan.length) {
        output = new Uint8Array(input.plan[planIndex]!.byteLength);
      }
    }
  }
  if (planIndex !== input.plan.length || outputOffset !== 0) {
    throw new Error('MEDIA_SOURCE_AUDIO_R2_PCM_STREAM_COVERAGE_INCOMPLETE');
  }
}

function isPcmByteStream(value: unknown): value is MediaSourceAudioPcmByteStreamV1 {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return false;
  const candidate = value as Record<PropertyKey, unknown>;
  return typeof candidate[Symbol.iterator] === 'function'
    || typeof candidate[Symbol.asyncIterator] === 'function';
}

async function writeAndVerifyExactObject(input: Readonly<{
  client: MediaSourcePtsCadenceR2CommandClientV1;
  bucketName: string;
  reference: MediaSourceAudioPrivateObjectReferenceV1;
  body: Uint8Array;
  contentType: 'application/json; charset=utf-8' | 'application/octet-stream';
}>): Promise<void> {
  const reference = normalizeStoredReference(input.reference);
  const body = exactBytes(
    input.body,
    reference.byteLength,
    'MEDIA_SOURCE_AUDIO_R2_WRITE_BYTES_MISMATCH',
  );
  if (digest(body) !== reference.contentSha256) {
    throw new Error('MEDIA_SOURCE_AUDIO_R2_WRITE_HASH_MISMATCH');
  }
  try {
    await input.client.send(new PutObjectCommand({
      Bucket: input.bucketName,
      Key: reference.objectKey,
      Body: body,
      ContentLength: body.byteLength,
      ContentType: input.contentType,
      CacheControl: 'private, no-store, max-age=0',
      IfNoneMatch: '*',
      Metadata: {
        artifactkind: reference.artifactKind,
        contentsha256: reference.contentSha256,
      },
    }));
  } catch (error) {
    if (!isPreconditionFailed(error)) {
      throw new Error('MEDIA_SOURCE_AUDIO_R2_WRITE_FAILED');
    }
  }
  await readExactObject({
    client: input.client,
    bucketName: input.bucketName,
    reference: input.reference,
    contentType: input.contentType,
  });
}

async function readExactObject(input: Readonly<{
  client: MediaSourcePtsCadenceR2CommandClientV1;
  bucketName: string;
  reference: MediaSourceAudioPrivateObjectReferenceV1;
  contentType: 'application/json; charset=utf-8' | 'application/octet-stream';
}>): Promise<Uint8Array> {
  const reference = normalizeStoredReference(input.reference);
  let response: unknown;
  try {
    response = await input.client.send(new GetObjectCommand({
      Bucket: input.bucketName,
      Key: reference.objectKey,
    }));
  } catch {
    throw new Error('MEDIA_SOURCE_AUDIO_R2_READ_FAILED');
  }
  if (!response || typeof response !== 'object') {
    throw new Error('MEDIA_SOURCE_AUDIO_R2_RESPONSE_INVALID');
  }
  const candidate = response as {
    Body?: unknown;
    CacheControl?: unknown;
    ContentLength?: unknown;
    ContentType?: unknown;
    Metadata?: unknown;
  };
  const metadata = candidate.Metadata && typeof candidate.Metadata === 'object'
    ? candidate.Metadata as Record<string, unknown>
    : null;
  if (candidate.ContentLength !== reference.byteLength
    || candidate.ContentType !== input.contentType
    || candidate.CacheControl !== 'private, no-store, max-age=0'
    || metadata?.artifactkind !== reference.artifactKind
    || metadata?.contentsha256 !== reference.contentSha256) {
    throw new Error('MEDIA_SOURCE_AUDIO_R2_HEADERS_OR_METADATA_INVALID');
  }
  const bytes = await readExactlyBoundedBytes(candidate.Body, reference.byteLength);
  if (digest(bytes) !== reference.contentSha256) {
    throw new Error('MEDIA_SOURCE_AUDIO_R2_CONTENT_MISMATCH');
  }
  return bytes;
}

function normalizeStorage(
  privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1,
  client: MediaSourcePtsCadenceR2CommandClientV1,
): Readonly<{
  bucketName: string;
  client: MediaSourcePtsCadenceR2CommandClientV1;
}> {
  if (!privateStorage || privateStorage.browserRouteExposure !== 'NO_BROWSER_ROUTE'
    || privateStorage.bucketName === 'editron-cdn'
    || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(privateStorage.bucketName)
    || typeof privateStorage.storagePolicyVersion !== 'string'
    || !privateStorage.storagePolicyVersion.trim()) {
    throw new Error('MEDIA_SOURCE_AUDIO_R2_PRIVATE_STORAGE_INVALID');
  }
  if (!client || typeof client.send !== 'function') {
    throw new Error('MEDIA_SOURCE_AUDIO_R2_CLIENT_INVALID');
  }
  return Object.freeze({ bucketName: privateStorage.bucketName, client });
}

function normalizeStoredReference(
  value: MediaSourceAudioPrivateObjectReferenceV1,
): MediaSourceAudioPrivateObjectReferenceV1 {
  if (value?.artifactKind === 'PCM_CHUNK') {
    const chunk = assertMediaSourceAudioPcmChunkReferenceV1(value);
    return Object.freeze({
      schemaVersion: chunk.schemaVersion,
      storage: chunk.storage,
      artifactKind: chunk.artifactKind,
      objectKey: chunk.objectKey,
      byteLength: chunk.byteLength,
      contentSha256: chunk.contentSha256,
    });
  }
  return assertMediaSourceAudioPrivateObjectReferenceV1(value);
}

async function readExactlyBoundedBytes(
  body: unknown,
  expectedByteLength: number,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(expectedByteLength) || expectedByteLength < 1) {
    throw new Error('MEDIA_SOURCE_AUDIO_R2_EXPECTED_BYTES_INVALID');
  }
  if (body instanceof Uint8Array) {
    if (body.byteLength !== expectedByteLength) {
      throw new Error('MEDIA_SOURCE_AUDIO_R2_BYTE_LENGTH_MISMATCH');
    }
    return body;
  }
  if (body && typeof body === 'object' && 'transformToByteArray' in body) {
    const transform = (body as { transformToByteArray?: unknown }).transformToByteArray;
    if (typeof transform === 'function') {
      return readExactlyBoundedBytes(await transform.call(body), expectedByteLength);
    }
  }
  if (!body || typeof body !== 'object' || !(Symbol.asyncIterator in body)) {
    throw new Error('MEDIA_SOURCE_AUDIO_R2_BODY_INVALID');
  }
  const output = new Uint8Array(expectedByteLength);
  let offset = 0;
  for await (const chunk of body as AsyncIterable<unknown>) {
    if (!(chunk instanceof Uint8Array) || offset + chunk.byteLength > output.byteLength) {
      throw new Error('MEDIA_SOURCE_AUDIO_R2_BYTE_LENGTH_MISMATCH');
    }
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (offset !== output.byteLength) {
    throw new Error('MEDIA_SOURCE_AUDIO_R2_BYTE_LENGTH_MISMATCH');
  }
  return output;
}

function normalizeUploadPlanEntry(value: unknown): MediaSourceAudioPcmChunkPlanEntryV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MEDIA_SOURCE_AUDIO_R2_PCM_CHUNK_PLAN_INVALID');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [
    'byteLength', 'chunkIndex', 'endExclusiveSampleFrame', 'startSampleFrame',
  ];
  if (keys.length !== expected.length
    || keys.some((key, index) => key !== expected[index])) {
    throw new Error('MEDIA_SOURCE_AUDIO_R2_PCM_CHUNK_PLAN_FIELDS_INVALID');
  }
  const chunkIndex = nonNegativeSafeInteger(
    record.chunkIndex,
    'MEDIA_SOURCE_AUDIO_R2_PCM_CHUNK_INDEX_INVALID',
  );
  const startSampleFrame = nonNegativeIntegerText(
    record.startSampleFrame,
    'MEDIA_SOURCE_AUDIO_R2_PCM_CHUNK_START_INVALID',
  );
  const endExclusiveSampleFrame = positiveIntegerText(
    record.endExclusiveSampleFrame,
    'MEDIA_SOURCE_AUDIO_R2_PCM_CHUNK_END_INVALID',
  );
  const byteLength = positiveSafeInteger(
    record.byteLength,
    'MEDIA_SOURCE_AUDIO_R2_PCM_CHUNK_LENGTH_INVALID',
  );
  return { chunkIndex, startSampleFrame, endExclusiveSampleFrame, byteLength };
}

function samePlanEntry(
  left: MediaSourceAudioPcmChunkPlanEntryV1,
  right: MediaSourceAudioPcmChunkPlanEntryV1,
): boolean {
  return left.chunkIndex === right.chunkIndex
    && left.startSampleFrame === right.startSampleFrame
    && left.endExclusiveSampleFrame === right.endExclusiveSampleFrame
    && left.byteLength === right.byteLength;
}

function sameReference(
  left: MediaSourceAudioPrivateObjectReferenceV1,
  right: MediaSourceAudioPrivateObjectReferenceV1,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.storage === right.storage
    && left.artifactKind === right.artifactKind
    && left.objectKey === right.objectKey
    && left.byteLength === right.byteLength
    && left.contentSha256 === right.contentSha256;
}

function exactBytes(value: unknown, expected: number, code: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength !== expected) throw new Error(code);
  return value;
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function nonNegativeIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,127})$/.test(value)) throw new Error(code);
  return BigInt(value).toString();
}

function positiveIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,127}$/.test(value)) throw new Error(code);
  return BigInt(value).toString();
}

function nonNegativeSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}

function positiveSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(code);
  return Number(value);
}

function isPreconditionFailed(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return candidate.name === 'PreconditionFailed'
    || candidate.$metadata?.httpStatusCode === 412;
}
