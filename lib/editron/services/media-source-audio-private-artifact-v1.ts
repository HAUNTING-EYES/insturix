import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaSourceAudioSampleEpochMapV1,
  parseMediaSourceAudioSampleEpochMapV1,
  type MediaSourceAudioSampleEpochMapSerializationV1,
  type MediaSourceAudioSampleEpochMapV1,
} from './media-source-audio-sample-epoch-map-v1';

export const MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_MANIFEST_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_MANIFEST_V1' as const;
export const MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_V1' as const;

export const MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_ABSOLUTE_MAX_CHUNK_BYTES_V1 =
  64 * 1024 * 1024;
export const MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_ABSOLUTE_MAX_CHUNKS_V1 = 100_000;
export const MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_ABSOLUTE_MAX_MANIFEST_BYTES_V1 =
  16 * 1024 * 1024;
export const MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_ABSOLUTE_MAX_READ_BYTES_V1 =
  64 * 1024 * 1024;

export type MediaSourceAudioPrivateArtifactPolicyV1 = Readonly<{
  policyVersion: typeof MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1;
  maxChunkBytes: number;
  maxChunkCount: number;
  maxManifestBytes: number;
  maxReadBytes: number;
}>;

export const MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_DEFAULT_POLICY_V1:
MediaSourceAudioPrivateArtifactPolicyV1 = deepFreezeEditronJsonV1({
  policyVersion: MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
  maxChunkBytes: 8 * 1024 * 1024,
  maxChunkCount: 10_000,
  maxManifestBytes: 4 * 1024 * 1024,
  maxReadBytes: 16 * 1024 * 1024,
});

export type MediaSourceAudioPrivateObjectReferenceV1 = Readonly<{
  schemaVersion: 1;
  storage: 'R2_PRIVATE';
  artifactKind: 'EPOCH_MAP' | 'PCM_CHUNK' | 'MANIFEST';
  objectKey: string;
  byteLength: number;
  contentSha256: string;
}>;

export type MediaSourceAudioPcmChunkPlanEntryV1 = Readonly<{
  chunkIndex: number;
  startSampleFrame: string;
  endExclusiveSampleFrame: string;
  byteLength: number;
}>;

export type MediaSourceAudioPcmChunkReferenceV1 = Readonly<
  MediaSourceAudioPrivateObjectReferenceV1
  & MediaSourceAudioPcmChunkPlanEntryV1
  & { artifactKind: 'PCM_CHUNK' }
>;

export type MediaSourceAudioPrivateArtifactManifestV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_MANIFEST_KIND_V1;
  assetId: string;
  sourceVersionSha256: string;
  storageVersionSha256: string;
  sourceBindingSha256: string;
  technicalObservationSha256: string;
  streamId: string;
  audioStreamIndex: number;
  sampleRate: string;
  channelCount: number;
  decodedSampleFrameCount: string;
  decodedByteLength: number;
  decodedPcmSha256: string;
  audioSampleEpochMapSha256: string;
  policy: MediaSourceAudioPrivateArtifactPolicyV1;
  epochMapArtifact: MediaSourceAudioPrivateObjectReferenceV1;
  pcmChunks: readonly MediaSourceAudioPcmChunkReferenceV1[];
  manifestSha256: string;
}>;

export type MediaSourceAudioPrivateArtifactManifestSerializationV1 = Readonly<{
  manifest: MediaSourceAudioPrivateArtifactManifestV1;
  canonicalJson: string;
  reference: MediaSourceAudioPrivateObjectReferenceV1;
}>;

export function assertMediaSourceAudioPrivateArtifactPolicyV1(
  value: unknown,
): MediaSourceAudioPrivateArtifactPolicyV1 {
  const record = objectRecord(value, 'MEDIA_SOURCE_AUDIO_PRIVATE_POLICY_INVALID');
  exactKeys(record, [
    'maxChunkBytes', 'maxChunkCount', 'maxManifestBytes', 'maxReadBytes',
    'policyVersion',
  ], 'MEDIA_SOURCE_AUDIO_PRIVATE_POLICY_FIELDS_INVALID');
  if (record.policyVersion !== MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1) {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_POLICY_VERSION_INVALID');
  }
  return frozen({
    policyVersion: MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
    maxChunkBytes: positiveSafeIntegerInRange(
      record.maxChunkBytes,
      MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_ABSOLUTE_MAX_CHUNK_BYTES_V1,
      'MEDIA_SOURCE_AUDIO_PRIVATE_POLICY_CHUNK_BYTES_INVALID',
    ),
    maxChunkCount: positiveSafeIntegerInRange(
      record.maxChunkCount,
      MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_ABSOLUTE_MAX_CHUNKS_V1,
      'MEDIA_SOURCE_AUDIO_PRIVATE_POLICY_CHUNK_COUNT_INVALID',
    ),
    maxManifestBytes: positiveSafeIntegerInRange(
      record.maxManifestBytes,
      MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_ABSOLUTE_MAX_MANIFEST_BYTES_V1,
      'MEDIA_SOURCE_AUDIO_PRIVATE_POLICY_MANIFEST_BYTES_INVALID',
    ),
    maxReadBytes: positiveSafeIntegerInRange(
      record.maxReadBytes,
      MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_ABSOLUTE_MAX_READ_BYTES_V1,
      'MEDIA_SOURCE_AUDIO_PRIVATE_POLICY_READ_BYTES_INVALID',
    ),
  });
}

export function createMediaSourceAudioPcmChunkPlanV1(input: Readonly<{
  map: MediaSourceAudioSampleEpochMapV1;
  policy: MediaSourceAudioPrivateArtifactPolicyV1;
}>): readonly MediaSourceAudioPcmChunkPlanEntryV1[] {
  const map = assertMediaSourceAudioSampleEpochMapV1(input.map);
  const policy = assertMediaSourceAudioPrivateArtifactPolicyV1(input.policy);
  const bytesPerSampleFrame = map.binding.channelCount * 4;
  const sampleFramesPerChunk = Math.floor(policy.maxChunkBytes / bytesPerSampleFrame);
  if (sampleFramesPerChunk < 1) {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_POLICY_CHUNK_ALIGNMENT_INVALID');
  }
  const totalSampleFrames = BigInt(map.pcm.decodedSampleFrameCount);
  const framesPerChunk = BigInt(sampleFramesPerChunk);
  const chunkCount = Number(
    (totalSampleFrames + framesPerChunk - BigInt(1)) / framesPerChunk,
  );
  if (!Number.isSafeInteger(chunkCount) || chunkCount < 1
    || chunkCount > policy.maxChunkCount) {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_CHUNK_COUNT_EXCEEDED');
  }
  const plan = Array.from({ length: chunkCount }, (_, chunkIndex) => {
    const start = BigInt(chunkIndex) * framesPerChunk;
    const end = start + framesPerChunk > totalSampleFrames
      ? totalSampleFrames
      : start + framesPerChunk;
    return {
      chunkIndex,
      startSampleFrame: start.toString(),
      endExclusiveSampleFrame: end.toString(),
      byteLength: Number((end - start) * BigInt(bytesPerSampleFrame)),
    };
  });
  return frozen(plan);
}

export function createMediaSourceAudioEpochMapArtifactReferenceV1(input: Readonly<{
  serialization: MediaSourceAudioSampleEpochMapSerializationV1;
}>): MediaSourceAudioPrivateObjectReferenceV1 {
  const map = assertMediaSourceAudioSampleEpochMapV1(input.serialization.map);
  const canonicalJson = input.serialization.canonicalJson;
  const byteLength = Buffer.byteLength(canonicalJson, 'utf8');
  const contentSha256 = hashEditronCanonicalJsonV1(map);
  if (canonicalizeEditronJsonV1(map) !== canonicalJson
    || input.serialization.byteLength !== byteLength
    || input.serialization.contentSha256 !== contentSha256) {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_MAP_SERIALIZATION_MISMATCH');
  }
  return frozen({
    schemaVersion: 1 as const,
    storage: 'R2_PRIVATE' as const,
    artifactKind: 'EPOCH_MAP' as const,
    objectKey: epochMapObjectKey(map, contentSha256),
    byteLength,
    contentSha256,
  });
}

export function createMediaSourceAudioPcmChunkReferenceV1(input: Readonly<{
  map: MediaSourceAudioSampleEpochMapV1;
  planEntry: MediaSourceAudioPcmChunkPlanEntryV1;
  contentSha256: string;
}>): MediaSourceAudioPcmChunkReferenceV1 {
  const map = assertMediaSourceAudioSampleEpochMapV1(input.map);
  const entry = normalizeChunkPlanEntry(input.planEntry);
  const contentSha256 = sha256(
    input.contentSha256,
    'MEDIA_SOURCE_AUDIO_PRIVATE_CHUNK_HASH_INVALID',
  );
  return frozen({
    schemaVersion: 1 as const,
    storage: 'R2_PRIVATE' as const,
    artifactKind: 'PCM_CHUNK' as const,
    objectKey: pcmChunkObjectKey(map, entry.chunkIndex, contentSha256),
    contentSha256,
    ...entry,
  });
}

export function createMediaSourceAudioPrivateArtifactManifestV1(input: Readonly<{
  map: MediaSourceAudioSampleEpochMapV1;
  epochMapArtifact: MediaSourceAudioPrivateObjectReferenceV1;
  pcmChunks: readonly MediaSourceAudioPcmChunkReferenceV1[];
  policy: MediaSourceAudioPrivateArtifactPolicyV1;
}>): MediaSourceAudioPrivateArtifactManifestV1 {
  const map = assertMediaSourceAudioSampleEpochMapV1(input.map);
  const policy = assertMediaSourceAudioPrivateArtifactPolicyV1(input.policy);
  const epochMapArtifact = assertMediaSourceAudioPrivateObjectReferenceV1(
    input.epochMapArtifact,
  );
  if (epochMapArtifact.artifactKind !== 'EPOCH_MAP'
    || epochMapArtifact.objectKey !== epochMapObjectKey(map, epochMapArtifact.contentSha256)) {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_MAP_REFERENCE_MISMATCH');
  }
  const expectedPlan = createMediaSourceAudioPcmChunkPlanV1({ map, policy });
  if (!Array.isArray(input.pcmChunks) || input.pcmChunks.length !== expectedPlan.length) {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_CHUNK_COVERAGE_INVALID');
  }
  const pcmChunks = input.pcmChunks.map((value, index) => {
    const chunk = assertMediaSourceAudioPcmChunkReferenceV1(value);
    const expected = expectedPlan[index]!;
    if (!sameChunkPlanEntry(chunk, expected)
      || chunk.objectKey !== pcmChunkObjectKey(map, chunk.chunkIndex, chunk.contentSha256)) {
      throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_CHUNK_COVERAGE_INVALID');
    }
    return chunk;
  });
  const binding = map.binding;
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_MANIFEST_KIND_V1,
    assetId: binding.assetId,
    sourceVersionSha256: binding.sourceVersionSha256,
    storageVersionSha256: binding.storageVersionSha256,
    sourceBindingSha256: binding.sourceBindingSha256,
    technicalObservationSha256: binding.technicalObservationSha256,
    streamId: binding.streamId,
    audioStreamIndex: binding.audioStreamIndex,
    sampleRate: binding.sampleRate,
    channelCount: binding.channelCount,
    decodedSampleFrameCount: map.pcm.decodedSampleFrameCount,
    decodedByteLength: map.pcm.decodedByteLength,
    decodedPcmSha256: map.pcm.decodedPcmSha256,
    audioSampleEpochMapSha256: map.audioSampleEpochMapSha256,
    policy,
    epochMapArtifact,
    pcmChunks,
  };
  return frozen({
    ...material,
    manifestSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function serializeMediaSourceAudioPrivateArtifactManifestV1(
  value: MediaSourceAudioPrivateArtifactManifestV1,
): MediaSourceAudioPrivateArtifactManifestSerializationV1 {
  const manifest = assertMediaSourceAudioPrivateArtifactManifestV1(value);
  const canonicalJson = canonicalizeEditronJsonV1(manifest);
  const byteLength = Buffer.byteLength(canonicalJson, 'utf8');
  if (byteLength > manifest.policy.maxManifestBytes) {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_MANIFEST_BYTE_LIMIT_EXCEEDED');
  }
  return frozen({
    manifest,
    canonicalJson,
    reference: {
      schemaVersion: 1 as const,
      storage: 'R2_PRIVATE' as const,
      artifactKind: 'MANIFEST' as const,
      objectKey: manifestObjectKey(manifest, manifest.manifestSha256),
      byteLength,
      contentSha256: hashEditronCanonicalJsonV1(manifest),
    },
  });
}

export function parseMediaSourceAudioPrivateArtifactManifestV1(
  canonicalJson: string,
): MediaSourceAudioPrivateArtifactManifestV1 {
  if (typeof canonicalJson !== 'string'
    || Buffer.byteLength(canonicalJson, 'utf8')
      > MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_ABSOLUTE_MAX_MANIFEST_BYTES_V1) {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_MANIFEST_INPUT_TOO_LARGE');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(canonicalJson);
  } catch {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_MANIFEST_JSON_INVALID');
  }
  const manifest = assertMediaSourceAudioPrivateArtifactManifestV1(parsed);
  if (canonicalizeEditronJsonV1(manifest) !== canonicalJson) {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_MANIFEST_JSON_NON_CANONICAL');
  }
  return manifest;
}

export function assertMediaSourceAudioPrivateArtifactManifestV1(
  value: unknown,
): MediaSourceAudioPrivateArtifactManifestV1 {
  const record = objectRecord(value, 'MEDIA_SOURCE_AUDIO_PRIVATE_MANIFEST_INVALID');
  exactKeys(record, [
    'assetId', 'audioSampleEpochMapSha256', 'audioStreamIndex', 'channelCount',
    'decodedByteLength', 'decodedPcmSha256', 'decodedSampleFrameCount',
    'epochMapArtifact', 'kind', 'manifestSha256', 'pcmChunks', 'policy',
    'sampleRate', 'schemaVersion', 'sourceBindingSha256', 'sourceVersionSha256',
    'storageVersionSha256', 'streamId', 'technicalObservationSha256',
  ], 'MEDIA_SOURCE_AUDIO_PRIVATE_MANIFEST_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_MANIFEST_KIND_V1) {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_MANIFEST_INVALID');
  }
  const policy = assertMediaSourceAudioPrivateArtifactPolicyV1(record.policy);
  const epochMapArtifact = assertMediaSourceAudioPrivateObjectReferenceV1(
    record.epochMapArtifact,
  );
  if (epochMapArtifact.artifactKind !== 'EPOCH_MAP') {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_MAP_REFERENCE_MISMATCH');
  }
  if (!Array.isArray(record.pcmChunks) || record.pcmChunks.length < 1
    || record.pcmChunks.length > policy.maxChunkCount) {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_CHUNK_COVERAGE_INVALID');
  }
  const pcmChunks = record.pcmChunks.map(assertMediaSourceAudioPcmChunkReferenceV1);
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_MANIFEST_KIND_V1,
    assetId: identifier(record.assetId, 'MEDIA_SOURCE_AUDIO_PRIVATE_ASSET_INVALID'),
    sourceVersionSha256: sha256(record.sourceVersionSha256, 'MEDIA_SOURCE_AUDIO_PRIVATE_SOURCE_INVALID'),
    storageVersionSha256: sha256(record.storageVersionSha256, 'MEDIA_SOURCE_AUDIO_PRIVATE_STORAGE_VERSION_INVALID'),
    sourceBindingSha256: sha256(record.sourceBindingSha256, 'MEDIA_SOURCE_AUDIO_PRIVATE_SOURCE_BINDING_INVALID'),
    technicalObservationSha256: sha256(record.technicalObservationSha256, 'MEDIA_SOURCE_AUDIO_PRIVATE_OBSERVATION_INVALID'),
    streamId: identifier(record.streamId, 'MEDIA_SOURCE_AUDIO_PRIVATE_STREAM_INVALID'),
    audioStreamIndex: nonNegativeSafeInteger(record.audioStreamIndex, 'MEDIA_SOURCE_AUDIO_PRIVATE_STREAM_INDEX_INVALID'),
    sampleRate: positiveIntegerText(record.sampleRate, 'MEDIA_SOURCE_AUDIO_PRIVATE_SAMPLE_RATE_INVALID'),
    channelCount: positiveSafeInteger(record.channelCount, 'MEDIA_SOURCE_AUDIO_PRIVATE_CHANNEL_COUNT_INVALID'),
    decodedSampleFrameCount: positiveIntegerText(record.decodedSampleFrameCount, 'MEDIA_SOURCE_AUDIO_PRIVATE_SAMPLE_COUNT_INVALID'),
    decodedByteLength: positiveSafeInteger(record.decodedByteLength, 'MEDIA_SOURCE_AUDIO_PRIVATE_PCM_BYTES_INVALID'),
    decodedPcmSha256: sha256(record.decodedPcmSha256, 'MEDIA_SOURCE_AUDIO_PRIVATE_PCM_HASH_INVALID'),
    audioSampleEpochMapSha256: sha256(record.audioSampleEpochMapSha256, 'MEDIA_SOURCE_AUDIO_PRIVATE_MAP_HASH_INVALID'),
    policy,
    epochMapArtifact,
    pcmChunks,
  };
  if (material.streamId !== `audio-${String(material.audioStreamIndex)}`
    || BigInt(material.decodedByteLength)
      !== BigInt(material.decodedSampleFrameCount) * BigInt(material.channelCount) * BigInt(4)
    || record.manifestSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_MANIFEST_HASH_OR_FORMAT_MISMATCH');
  }
  return frozen({ ...material, manifestSha256: record.manifestSha256 as string });
}

export function assertMediaSourceAudioPrivateObjectReferenceV1(
  value: unknown,
): MediaSourceAudioPrivateObjectReferenceV1 {
  const record = objectRecord(value, 'MEDIA_SOURCE_AUDIO_PRIVATE_REFERENCE_INVALID');
  exactKeys(record, [
    'artifactKind', 'byteLength', 'contentSha256', 'objectKey', 'schemaVersion', 'storage',
  ], 'MEDIA_SOURCE_AUDIO_PRIVATE_REFERENCE_FIELDS_INVALID');
  if (record.schemaVersion !== 1 || record.storage !== 'R2_PRIVATE'
    || (record.artifactKind !== 'EPOCH_MAP'
      && record.artifactKind !== 'PCM_CHUNK'
      && record.artifactKind !== 'MANIFEST')) {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_REFERENCE_INVALID');
  }
  return frozen({
    schemaVersion: 1 as const,
    storage: 'R2_PRIVATE' as const,
    artifactKind: record.artifactKind,
    objectKey: privateObjectKey(record.objectKey),
    byteLength: positiveSafeInteger(record.byteLength, 'MEDIA_SOURCE_AUDIO_PRIVATE_REFERENCE_BYTES_INVALID'),
    contentSha256: sha256(record.contentSha256, 'MEDIA_SOURCE_AUDIO_PRIVATE_REFERENCE_HASH_INVALID'),
  });
}

export function assertMediaSourceAudioPcmChunkReferenceV1(
  value: unknown,
): MediaSourceAudioPcmChunkReferenceV1 {
  const record = objectRecord(value, 'MEDIA_SOURCE_AUDIO_PRIVATE_CHUNK_REFERENCE_INVALID');
  exactKeys(record, [
    'artifactKind', 'byteLength', 'chunkIndex', 'contentSha256',
    'endExclusiveSampleFrame', 'objectKey', 'schemaVersion', 'startSampleFrame',
    'storage',
  ], 'MEDIA_SOURCE_AUDIO_PRIVATE_CHUNK_REFERENCE_FIELDS_INVALID');
  const base = assertMediaSourceAudioPrivateObjectReferenceV1({
    schemaVersion: record.schemaVersion,
    storage: record.storage,
    artifactKind: record.artifactKind,
    objectKey: record.objectKey,
    byteLength: record.byteLength,
    contentSha256: record.contentSha256,
  });
  if (base.artifactKind !== 'PCM_CHUNK') {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_CHUNK_REFERENCE_INVALID');
  }
  return frozen({ ...base, artifactKind: 'PCM_CHUNK' as const, ...normalizeChunkPlanEntry(record) });
}

export function verifyMediaSourceAudioPrivateArtifactSetV1(input: Readonly<{
  manifest: MediaSourceAudioPrivateArtifactManifestV1;
  mapCanonicalJson: string;
}>): MediaSourceAudioSampleEpochMapV1 {
  const manifest = assertMediaSourceAudioPrivateArtifactManifestV1(input.manifest);
  const map = parseMediaSourceAudioSampleEpochMapV1(input.mapCanonicalJson);
  const binding = map.binding;
  if (hashEditronCanonicalJsonV1(map) !== manifest.epochMapArtifact.contentSha256
    || Buffer.byteLength(input.mapCanonicalJson, 'utf8') !== manifest.epochMapArtifact.byteLength
    || manifest.epochMapArtifact.objectKey
      !== epochMapObjectKey(map, manifest.epochMapArtifact.contentSha256)
    || binding.assetId !== manifest.assetId
    || binding.sourceVersionSha256 !== manifest.sourceVersionSha256
    || binding.storageVersionSha256 !== manifest.storageVersionSha256
    || binding.sourceBindingSha256 !== manifest.sourceBindingSha256
    || binding.technicalObservationSha256 !== manifest.technicalObservationSha256
    || binding.streamId !== manifest.streamId
    || binding.audioStreamIndex !== manifest.audioStreamIndex
    || binding.sampleRate !== manifest.sampleRate
    || binding.channelCount !== manifest.channelCount
    || map.pcm.decodedSampleFrameCount !== manifest.decodedSampleFrameCount
    || map.pcm.decodedByteLength !== manifest.decodedByteLength
    || map.pcm.decodedPcmSha256 !== manifest.decodedPcmSha256
    || map.audioSampleEpochMapSha256 !== manifest.audioSampleEpochMapSha256) {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_SET_SCOPE_MISMATCH');
  }
  const expected = createMediaSourceAudioPrivateArtifactManifestV1({
    map,
    epochMapArtifact: manifest.epochMapArtifact,
    pcmChunks: manifest.pcmChunks,
    policy: manifest.policy,
  });
  if (expected.manifestSha256 !== manifest.manifestSha256) {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_SET_SCOPE_MISMATCH');
  }
  return map;
}

function normalizeChunkPlanEntry(value: unknown): MediaSourceAudioPcmChunkPlanEntryV1 {
  const record = objectRecord(value, 'MEDIA_SOURCE_AUDIO_PRIVATE_CHUNK_PLAN_INVALID');
  const chunkIndex = nonNegativeSafeInteger(
    record.chunkIndex,
    'MEDIA_SOURCE_AUDIO_PRIVATE_CHUNK_INDEX_INVALID',
  );
  const startSampleFrame = nonNegativeIntegerText(
    record.startSampleFrame,
    'MEDIA_SOURCE_AUDIO_PRIVATE_CHUNK_START_INVALID',
  );
  const endExclusiveSampleFrame = positiveIntegerText(
    record.endExclusiveSampleFrame,
    'MEDIA_SOURCE_AUDIO_PRIVATE_CHUNK_END_INVALID',
  );
  const byteLength = positiveSafeInteger(
    record.byteLength,
    'MEDIA_SOURCE_AUDIO_PRIVATE_CHUNK_BYTES_INVALID',
  );
  if (BigInt(startSampleFrame) >= BigInt(endExclusiveSampleFrame)) {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_CHUNK_RANGE_INVALID');
  }
  return { chunkIndex, startSampleFrame, endExclusiveSampleFrame, byteLength };
}

function sameChunkPlanEntry(
  left: MediaSourceAudioPcmChunkPlanEntryV1,
  right: MediaSourceAudioPcmChunkPlanEntryV1,
): boolean {
  return left.chunkIndex === right.chunkIndex
    && left.startSampleFrame === right.startSampleFrame
    && left.endExclusiveSampleFrame === right.endExclusiveSampleFrame
    && left.byteLength === right.byteLength;
}

function epochMapObjectKey(map: MediaSourceAudioSampleEpochMapV1, hash: string): string {
  return `${artifactPrefix(map)}/epoch-map/${sha256(hash, 'MEDIA_SOURCE_AUDIO_PRIVATE_MAP_HASH_INVALID')}.json`;
}

function pcmChunkObjectKey(
  map: MediaSourceAudioSampleEpochMapV1,
  chunkIndex: number,
  hash: string,
): string {
  return `${artifactPrefix(map)}/pcm-s32le/${String(chunkIndex).padStart(8, '0')}/${sha256(hash, 'MEDIA_SOURCE_AUDIO_PRIVATE_CHUNK_HASH_INVALID')}.pcm`;
}

function manifestObjectKey(
  manifest: MediaSourceAudioPrivateArtifactManifestV1,
  hash: string,
): string {
  return `private/editron/media-source-audio/v1/${manifest.sourceVersionSha256}/${manifest.audioSampleEpochMapSha256}/manifests/${sha256(hash, 'MEDIA_SOURCE_AUDIO_PRIVATE_MANIFEST_HASH_INVALID')}.json`;
}

function artifactPrefix(map: MediaSourceAudioSampleEpochMapV1): string {
  return `private/editron/media-source-audio/v1/${map.binding.sourceVersionSha256}/${map.audioSampleEpochMapSha256}`;
}

function privateObjectKey(value: unknown): string {
  if (typeof value !== 'string'
    || !/^private\/editron\/media-source-audio\/v1\/[a-f0-9]{64}\/[a-f0-9]{64}\/(?:epoch-map\/[a-f0-9]{64}\.json|pcm-s32le\/[0-9]{8}\/[a-f0-9]{64}\.pcm|manifests\/[a-f0-9]{64}\.json)$/.test(value)) {
    throw new Error('MEDIA_SOURCE_AUDIO_PRIVATE_REFERENCE_KEY_INVALID');
  }
  return value;
}

function objectRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) throw new Error(code);
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) throw new Error(code);
  return value;
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

function positiveSafeIntegerInRange(value: unknown, maximum: number, code: string): number {
  const normalized = positiveSafeInteger(value, code);
  if (normalized > maximum) throw new Error(code);
  return normalized;
}

function frozen<T extends object>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value);
}
