import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import type { MediaSourcePtsCadenceMapAssetStateInputV3 } from './media-source-pts-cadence-map-asset-owner-v3';
import {
  assertMediaSourceAudioPrivateObjectReferenceV1,
  serializeMediaSourceAudioPrivateArtifactManifestV1,
  verifyMediaSourceAudioPrivateArtifactSetV1,
  type MediaSourceAudioPrivateArtifactManifestSerializationV1,
  type MediaSourceAudioPrivateObjectReferenceV1,
} from './media-source-audio-private-artifact-v1';
import {
  createMediaSourceAudioStreamBindingV1,
  serializeMediaSourceAudioSampleEpochMapV1,
  type MediaSourceAudioSampleEpochMapSerializationV1,
} from './media-source-audio-sample-epoch-map-v1';
import type { MediaSourceQualificationRecordV1 } from './media-source-qualification-v1';
import { assertMediaSourceVersionV1 } from './media-source-version-v1';

export const MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_RECORD_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_RECORD_V1' as const;
export const MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_SET_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_SET_V1' as const;
export const MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_MAX_STREAMS_V1 = 256;

export type MediaSourceAudioArtifactAssetSourceV1 = Readonly<{
  assetId: string;
  mediaKind: 'audio' | 'video';
  sourceVersionSha256: string;
  storageVersionSha256: string;
  sourceBindingSha256: string;
  technicalObservationSha256: string;
}>;

export type MediaSourceAudioArtifactAssetRecordV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_RECORD_KIND_V1;
  source: MediaSourceAudioArtifactAssetSourceV1;
  audioStreamIndex: number;
  streamId: string;
  sampleRate: string;
  channelCount: number;
  audioSampleEpochMapSha256: string;
  decodedPcmSha256: string;
  decodedSampleFrameCount: string;
  manifestSha256: string;
  manifestReference: MediaSourceAudioPrivateObjectReferenceV1;
  publishedAt: string;
  recordSha256: string;
}>;

export type MediaSourceAudioArtifactAssetSetV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_SET_KIND_V1;
  source: MediaSourceAudioArtifactAssetSourceV1;
  records: readonly MediaSourceAudioArtifactAssetRecordV1[];
}>;

export type MediaSourceAudioArtifactAssetStateV1 = Readonly<{
  sourceAudioArtifactsV1: MediaSourceAudioArtifactAssetSetV1;
  sourceAudioArtifactsStateSha256V1: string;
}>;

export type MediaSourceAudioArtifactAssetStateInputV1 =
  MediaSourcePtsCadenceMapAssetStateInputV3 & Readonly<{
    sourceAudioArtifactsV1?: unknown;
    sourceAudioArtifactsStateSha256V1?: unknown;
  }>;

export type MediaSourceAudioArtifactAssetStoreResultV1 = Readonly<
  | { disposition: 'APPLIED'; state: MediaSourceAudioArtifactAssetStateV1 }
  | { disposition: 'UNCHANGED'; state: MediaSourceAudioArtifactAssetStateV1 }
  | { disposition: 'RACE_LOST' }
  | { disposition: 'SKIPPED'; reason: 'ASSET_NOT_FOUND' }
  | {
      disposition: 'REJECTED';
      reason:
        | 'CURRENT_STATE_INVALID'
        | 'EXPECTED_STATE_MISMATCH'
        | 'ARTIFACT_INVALID'
        | 'CONFLICTING_STREAM_ARTIFACT';
    }
>;

export type MediaSourceAudioArtifactAssetStorePortsV1 = Readonly<{
  load(
    assetId: string,
    userId: string,
  ): Promise<MediaSourceAudioArtifactAssetStateInputV1 | null>;
  replace(input: Readonly<{
    assetId: string;
    userId: string;
    expectedState: MediaSourceAudioArtifactAssetStateV1 | null;
    nextState: MediaSourceAudioArtifactAssetStateV1;
  }>): Promise<boolean>;
}>;

export function createMediaSourceAudioArtifactAssetRecordV1(input: Readonly<{
  asset: MediaSourceAudioArtifactAssetStateInputV1;
  mapSerialization: MediaSourceAudioSampleEpochMapSerializationV1;
  manifestSerialization: MediaSourceAudioPrivateArtifactManifestSerializationV1;
  publishedAt: Date;
}>): MediaSourceAudioArtifactAssetRecordV1 {
  const mapSerialization = normalizeMapSerialization(input.mapSerialization);
  const manifestSerialization = normalizeManifestSerialization(
    input.manifestSerialization,
  );
  const map = verifyMediaSourceAudioPrivateArtifactSetV1({
    manifest: manifestSerialization.manifest,
    mapCanonicalJson: mapSerialization.canonicalJson,
  });
  const sourceVersion = assertMediaSourceVersionV1(input.asset.sourceVersionV1);
  const binding = createMediaSourceAudioStreamBindingV1({
    sourceVersion,
    qualification: input.asset.sourceQualificationV1 as MediaSourceQualificationRecordV1,
    audioStreamIndex: map.binding.audioStreamIndex,
  });
  if (input.asset.assetId !== sourceVersion.assetId
    || input.asset.type !== sourceVersion.mediaKind
    || binding.audioStreamBindingSha256
      !== map.binding.audioStreamBindingSha256) {
    throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_SOURCE_MISMATCH');
  }
  const source = sourceFromBinding(binding);
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_RECORD_KIND_V1,
    source,
    audioStreamIndex: binding.audioStreamIndex,
    streamId: binding.streamId,
    sampleRate: binding.sampleRate,
    channelCount: binding.channelCount,
    audioSampleEpochMapSha256: map.audioSampleEpochMapSha256,
    decodedPcmSha256: map.pcm.decodedPcmSha256,
    decodedSampleFrameCount: map.pcm.decodedSampleFrameCount,
    manifestSha256: manifestSerialization.manifest.manifestSha256,
    manifestReference: manifestSerialization.reference,
    publishedAt: isoDate(input.publishedAt),
  };
  return assertMediaSourceAudioArtifactAssetRecordV1({
    ...material,
    recordSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function createMediaSourceAudioArtifactAssetStateV1(input: Readonly<{
  asset: MediaSourceAudioArtifactAssetStateInputV1;
  records: readonly MediaSourceAudioArtifactAssetRecordV1[];
}>): MediaSourceAudioArtifactAssetStateV1 {
  if (!Array.isArray(input.records) || input.records.length < 1
    || input.records.length > MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_MAX_STREAMS_V1) {
    throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_RECORD_COUNT_INVALID');
  }
  const records = input.records
    .map(assertMediaSourceAudioArtifactAssetRecordV1)
    .sort((left, right) => left.audioStreamIndex - right.audioStreamIndex);
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (index > 0 && records[index - 1]!.audioStreamIndex === record.audioStreamIndex) {
      throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_STREAM_DUPLICATE');
    }
    assertRecordMatchesAsset(record, input.asset);
  }
  const set = assertMediaSourceAudioArtifactAssetSetV1({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_SET_KIND_V1,
    source: records[0]!.source,
    records,
  });
  return frozen({
    sourceAudioArtifactsV1: set,
    sourceAudioArtifactsStateSha256V1: hashEditronCanonicalJsonV1(set),
  });
}

export function readMediaSourceAudioArtifactAssetStateV1(
  asset: MediaSourceAudioArtifactAssetStateInputV1,
): MediaSourceAudioArtifactAssetStateV1 | null {
  const hasSet = present(asset.sourceAudioArtifactsV1);
  const hasHash = present(asset.sourceAudioArtifactsStateSha256V1);
  if (!hasSet && !hasHash) return null;
  if (!hasSet || !hasHash) {
    throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_STATE_INCOMPLETE');
  }
  const set = assertMediaSourceAudioArtifactAssetSetV1(asset.sourceAudioArtifactsV1);
  const state = createMediaSourceAudioArtifactAssetStateV1({
    asset,
    records: set.records,
  });
  if (asset.sourceAudioArtifactsStateSha256V1
    !== state.sourceAudioArtifactsStateSha256V1) {
    throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_STATE_HASH_MISMATCH');
  }
  return state;
}

export async function persistMediaSourceAudioArtifactAssetStateV1(input: Readonly<{
  assetId: string;
  userId: string;
  expectedStateSha256: string | null;
  mapSerialization: MediaSourceAudioSampleEpochMapSerializationV1;
  manifestSerialization: MediaSourceAudioPrivateArtifactManifestSerializationV1;
  publishedAt: Date;
}>, ports: MediaSourceAudioArtifactAssetStorePortsV1): Promise<
  MediaSourceAudioArtifactAssetStoreResultV1
> {
  const assetId = identifier(input.assetId, 'MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_ID_INVALID');
  const userId = identifier(input.userId, 'MEDIA_SOURCE_AUDIO_ARTIFACT_USER_ID_INVALID');
  const expectedStateSha256 = nullableSha256(input.expectedStateSha256);
  const asset = await ports.load(assetId, userId);
  if (!asset) return { disposition: 'SKIPPED', reason: 'ASSET_NOT_FOUND' };
  let currentState: MediaSourceAudioArtifactAssetStateV1 | null;
  try {
    currentState = readMediaSourceAudioArtifactAssetStateV1(asset);
  } catch {
    return { disposition: 'REJECTED', reason: 'CURRENT_STATE_INVALID' };
  }
  if ((currentState?.sourceAudioArtifactsStateSha256V1 ?? null)
    !== expectedStateSha256) {
    return { disposition: 'REJECTED', reason: 'EXPECTED_STATE_MISMATCH' };
  }
  let nextRecord: MediaSourceAudioArtifactAssetRecordV1;
  try {
    nextRecord = createMediaSourceAudioArtifactAssetRecordV1({
      asset,
      mapSerialization: input.mapSerialization,
      manifestSerialization: input.manifestSerialization,
      publishedAt: input.publishedAt,
    });
  } catch {
    return { disposition: 'REJECTED', reason: 'ARTIFACT_INVALID' };
  }
  const currentRecords = currentState?.sourceAudioArtifactsV1.records ?? [];
  const existing = currentRecords.find(
    ({ audioStreamIndex }) => audioStreamIndex === nextRecord.audioStreamIndex,
  );
  if (existing) {
    if (!samePublishedArtifact(existing, nextRecord)) {
      return { disposition: 'REJECTED', reason: 'CONFLICTING_STREAM_ARTIFACT' };
    }
    return { disposition: 'UNCHANGED', state: currentState! };
  }
  let nextState: MediaSourceAudioArtifactAssetStateV1;
  try {
    nextState = createMediaSourceAudioArtifactAssetStateV1({
      asset,
      records: [...currentRecords, nextRecord],
    });
  } catch {
    return { disposition: 'REJECTED', reason: 'ARTIFACT_INVALID' };
  }
  if (!await ports.replace({
    assetId,
    userId,
    expectedState: currentState,
    nextState,
  })) {
    return { disposition: 'RACE_LOST' };
  }
  return { disposition: 'APPLIED', state: nextState };
}

export async function runMediaSourceAudioArtifactAssetStoreV1(input: Readonly<{
  assetId: string;
  userId: string;
  expectedStateSha256: string | null;
  mapSerialization: MediaSourceAudioSampleEpochMapSerializationV1;
  manifestSerialization: MediaSourceAudioPrivateArtifactManifestSerializationV1;
  publishedAt: Date;
}>): Promise<MediaSourceAudioArtifactAssetStoreResultV1> {
  return persistMediaSourceAudioArtifactAssetStateV1(
    input,
    await createMediaSourceAudioArtifactAssetMongoPortsV1(),
  );
}

export async function createMediaSourceAudioArtifactAssetMongoPortsV1(
): Promise<MediaSourceAudioArtifactAssetStorePortsV1> {
  const { getDatabase, COLLECTIONS } = await import('../db/mongodb');
  const db = await getDatabase();
  return {
    load: async (assetId, userId) => {
      const asset = await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne(
        { assetId, userId },
        {
          projection: {
            assetId: 1,
            type: 1,
            sourceVersionV1: 1,
            sourceQualificationV1: 1,
            sourcePtsCadenceMapV1: 1,
            sourcePtsCadenceMapStateSha256V1: 1,
            sourcePtsCadenceMapV2: 1,
            sourcePtsCadenceMapStateSha256V2: 1,
            sourcePtsCadenceMapV3: 1,
            sourcePtsCadenceMapStateSha256V3: 1,
            sourceAudioArtifactsV1: 1,
            sourceAudioArtifactsStateSha256V1: 1,
          },
        },
      );
      return asset as MediaSourceAudioArtifactAssetStateInputV1 | null;
    },
    replace: async ({ assetId, userId, expectedState, nextState }) => {
      const result = await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
        mediaSourceAudioArtifactAssetCompareAndSetFilterV1({
          assetId,
          userId,
          expectedState,
          nextState,
        }),
        {
          $set: {
            sourceAudioArtifactsV1: nextState.sourceAudioArtifactsV1,
            sourceAudioArtifactsStateSha256V1:
              nextState.sourceAudioArtifactsStateSha256V1,
          },
        },
      );
      return result.matchedCount === 1;
    },
  };
}

export function mediaSourceAudioArtifactAssetCompareAndSetFilterV1(input: Readonly<{
  assetId: string;
  userId: string;
  expectedState: MediaSourceAudioArtifactAssetStateV1 | null;
  nextState: MediaSourceAudioArtifactAssetStateV1;
}>): Record<string, unknown> {
  const source = input.nextState.sourceAudioArtifactsV1.source;
  const assetId = identifier(input.assetId, 'MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_ID_INVALID');
  const filter: Record<string, unknown> = {
    assetId,
    userId: identifier(input.userId, 'MEDIA_SOURCE_AUDIO_ARTIFACT_USER_ID_INVALID'),
    type: source.mediaKind,
    'sourceVersionV1.assetId': assetId,
    'sourceVersionV1.sourceVersionSha256': source.sourceVersionSha256,
    'sourceVersionV1.storageVersion.storageVersionSha256': source.storageVersionSha256,
    'sourceQualificationV1.status': 'MEASURED_TECHNICAL',
    'sourceQualificationV1.assetId': assetId,
    'sourceQualificationV1.sourceBindingSha256': source.sourceBindingSha256,
    'sourceQualificationV1.storageVersion.storageVersionSha256':
      source.storageVersionSha256,
    'sourceQualificationV1.observation.observationSha256':
      source.technicalObservationSha256,
  };
  if (!input.expectedState) {
    filter.$and = [
      absentOrNull('sourceAudioArtifactsV1'),
      absentOrNull('sourceAudioArtifactsStateSha256V1'),
    ];
    return filter;
  }
  filter.sourceAudioArtifactsStateSha256V1 =
    input.expectedState.sourceAudioArtifactsStateSha256V1;
  filter['sourceAudioArtifactsV1.source.sourceVersionSha256'] =
    input.expectedState.sourceAudioArtifactsV1.source.sourceVersionSha256;
  filter['sourceAudioArtifactsV1.source.storageVersionSha256'] =
    input.expectedState.sourceAudioArtifactsV1.source.storageVersionSha256;
  return filter;
}

export function assertMediaSourceAudioArtifactAssetRecordV1(
  value: unknown,
): MediaSourceAudioArtifactAssetRecordV1 {
  const record = objectRecord(value, 'MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_RECORD_INVALID');
  exactKeys(record, [
    'audioSampleEpochMapSha256', 'audioStreamIndex', 'channelCount',
    'decodedPcmSha256', 'decodedSampleFrameCount', 'kind', 'manifestReference',
    'manifestSha256', 'publishedAt', 'recordSha256', 'sampleRate', 'schemaVersion',
    'source', 'streamId',
  ], 'MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_RECORD_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_RECORD_KIND_V1) {
    throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_RECORD_INVALID');
  }
  const source = normalizeSource(record.source);
  const manifestReference = assertMediaSourceAudioPrivateObjectReferenceV1(
    record.manifestReference,
  );
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_RECORD_KIND_V1,
    source,
    audioStreamIndex: nonNegativeSafeInteger(record.audioStreamIndex),
    streamId: identifier(record.streamId, 'MEDIA_SOURCE_AUDIO_ARTIFACT_STREAM_INVALID'),
    sampleRate: positiveIntegerText(record.sampleRate),
    channelCount: positiveSafeInteger(record.channelCount),
    audioSampleEpochMapSha256: sha256(record.audioSampleEpochMapSha256),
    decodedPcmSha256: sha256(record.decodedPcmSha256),
    decodedSampleFrameCount: positiveIntegerText(record.decodedSampleFrameCount),
    manifestSha256: sha256(record.manifestSha256),
    manifestReference,
    publishedAt: isoText(record.publishedAt),
  };
  if (manifestReference.artifactKind !== 'MANIFEST'
    || material.streamId !== `audio-${String(material.audioStreamIndex)}`
    || manifestReference.objectKey !== manifestObjectKey(material)
    || record.recordSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_RECORD_BINDING_INVALID');
  }
  return frozen({ ...material, recordSha256: record.recordSha256 as string });
}

export function assertMediaSourceAudioArtifactAssetSetV1(
  value: unknown,
): MediaSourceAudioArtifactAssetSetV1 {
  const record = objectRecord(value, 'MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_SET_INVALID');
  exactKeys(record, ['kind', 'records', 'schemaVersion', 'source'],
    'MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_SET_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_SET_KIND_V1
    || !Array.isArray(record.records)
    || record.records.length < 1
    || record.records.length > MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_MAX_STREAMS_V1) {
    throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_SET_INVALID');
  }
  const source = normalizeSource(record.source);
  const records = record.records.map(assertMediaSourceAudioArtifactAssetRecordV1);
  for (let index = 0; index < records.length; index += 1) {
    const current = records[index]!;
    if (!sameSource(current.source, source)
      || (index > 0 && records[index - 1]!.audioStreamIndex >= current.audioStreamIndex)) {
      throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_SET_ORDER_OR_SCOPE_INVALID');
    }
  }
  return frozen({
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_SET_KIND_V1,
    source,
    records,
  });
}

function assertRecordMatchesAsset(
  record: MediaSourceAudioArtifactAssetRecordV1,
  asset: MediaSourceAudioArtifactAssetStateInputV1,
): void {
  const sourceVersion = assertMediaSourceVersionV1(asset.sourceVersionV1);
  const binding = createMediaSourceAudioStreamBindingV1({
    sourceVersion,
    qualification: asset.sourceQualificationV1 as MediaSourceQualificationRecordV1,
    audioStreamIndex: record.audioStreamIndex,
  });
  if (asset.assetId !== sourceVersion.assetId
    || asset.type !== sourceVersion.mediaKind
    || !sameSource(record.source, sourceFromBinding(binding))
    || record.streamId !== binding.streamId
    || record.sampleRate !== binding.sampleRate
    || record.channelCount !== binding.channelCount) {
    throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_SOURCE_MISMATCH');
  }
}

function normalizeMapSerialization(
  value: MediaSourceAudioSampleEpochMapSerializationV1,
): MediaSourceAudioSampleEpochMapSerializationV1 {
  const canonical = serializeMediaSourceAudioSampleEpochMapV1(value.map);
  if (canonical.canonicalJson !== value.canonicalJson
    || canonical.byteLength !== value.byteLength
    || canonical.contentSha256 !== value.contentSha256) {
    throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_MAP_SERIALIZATION_INVALID');
  }
  return canonical;
}

function normalizeManifestSerialization(
  value: MediaSourceAudioPrivateArtifactManifestSerializationV1,
): MediaSourceAudioPrivateArtifactManifestSerializationV1 {
  const canonical = serializeMediaSourceAudioPrivateArtifactManifestV1(value.manifest);
  const reference = assertMediaSourceAudioPrivateObjectReferenceV1(value.reference);
  if (canonical.canonicalJson !== value.canonicalJson
    || !sameReference(canonical.reference, reference)) {
    throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_MANIFEST_SERIALIZATION_INVALID');
  }
  return canonical;
}

function sourceFromBinding(binding: ReturnType<typeof createMediaSourceAudioStreamBindingV1>) {
  return frozen({
    assetId: binding.assetId,
    mediaKind: binding.mediaKind,
    sourceVersionSha256: binding.sourceVersionSha256,
    storageVersionSha256: binding.storageVersionSha256,
    sourceBindingSha256: binding.sourceBindingSha256,
    technicalObservationSha256: binding.technicalObservationSha256,
  });
}

function normalizeSource(value: unknown): MediaSourceAudioArtifactAssetSourceV1 {
  const record = objectRecord(value, 'MEDIA_SOURCE_AUDIO_ARTIFACT_SOURCE_INVALID');
  exactKeys(record, [
    'assetId', 'mediaKind', 'sourceBindingSha256', 'sourceVersionSha256',
    'storageVersionSha256', 'technicalObservationSha256',
  ], 'MEDIA_SOURCE_AUDIO_ARTIFACT_SOURCE_FIELDS_INVALID');
  if (record.mediaKind !== 'audio' && record.mediaKind !== 'video') {
    throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_SOURCE_INVALID');
  }
  return frozen({
    assetId: identifier(record.assetId, 'MEDIA_SOURCE_AUDIO_ARTIFACT_SOURCE_INVALID'),
    mediaKind: record.mediaKind,
    sourceVersionSha256: sha256(record.sourceVersionSha256),
    storageVersionSha256: sha256(record.storageVersionSha256),
    sourceBindingSha256: sha256(record.sourceBindingSha256),
    technicalObservationSha256: sha256(record.technicalObservationSha256),
  });
}

function manifestObjectKey(material: Readonly<{
  source: MediaSourceAudioArtifactAssetSourceV1;
  audioSampleEpochMapSha256: string;
  manifestSha256: string;
}>): string {
  return `private/editron/media-source-audio/v1/${material.source.sourceVersionSha256}/${material.audioSampleEpochMapSha256}/manifests/${material.manifestSha256}.json`;
}

function sameSource(
  left: MediaSourceAudioArtifactAssetSourceV1,
  right: MediaSourceAudioArtifactAssetSourceV1,
): boolean {
  return left.assetId === right.assetId
    && left.mediaKind === right.mediaKind
    && left.sourceVersionSha256 === right.sourceVersionSha256
    && left.storageVersionSha256 === right.storageVersionSha256
    && left.sourceBindingSha256 === right.sourceBindingSha256
    && left.technicalObservationSha256 === right.technicalObservationSha256;
}

function samePublishedArtifact(
  left: MediaSourceAudioArtifactAssetRecordV1,
  right: MediaSourceAudioArtifactAssetRecordV1,
): boolean {
  return sameSource(left.source, right.source)
    && left.audioStreamIndex === right.audioStreamIndex
    && left.streamId === right.streamId
    && left.sampleRate === right.sampleRate
    && left.channelCount === right.channelCount
    && left.audioSampleEpochMapSha256 === right.audioSampleEpochMapSha256
    && left.decodedPcmSha256 === right.decodedPcmSha256
    && left.decodedSampleFrameCount === right.decodedSampleFrameCount
    && left.manifestSha256 === right.manifestSha256
    && sameReference(left.manifestReference, right.manifestReference);
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

function absentOrNull(path: string): Record<string, unknown> {
  return { $or: [{ [path]: { $exists: false } }, { [path]: null }] };
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function nullableSha256(value: unknown): string | null {
  return value === null ? null : sha256(value);
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_SHA256_INVALID');
  }
  return value;
}

function positiveIntegerText(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,127}$/.test(value)) {
    throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_INTEGER_TEXT_INVALID');
  }
  return BigInt(value).toString();
}

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function nonNegativeSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_INTEGER_INVALID');
  }
  return Number(value);
}

function positiveSafeInteger(value: unknown): number {
  const normalized = nonNegativeSafeInteger(value);
  if (normalized < 1) throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_INTEGER_INVALID');
  return normalized;
}

function isoDate(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_DATE_INVALID');
  }
  return value.toISOString();
}

function isoText(value: unknown): string {
  if (typeof value !== 'string' || value.length > 128 || Number.isNaN(Date.parse(value))) {
    throw new Error('MEDIA_SOURCE_AUDIO_ARTIFACT_DATE_INVALID');
  }
  return new Date(value).toISOString();
}

function objectRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) throw new Error(code);
}

function frozen<T>(value: T): T {
  return deepFreezeEditronJsonV1(value);
}
