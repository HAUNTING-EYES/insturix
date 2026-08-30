import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import { MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_MAX_STREAMS_V1 }
  from './media-source-audio-artifact-asset-owner-v1';

export const MEDIA_SOURCE_AUDIO_PRODUCT_MATERIALIZATION_RECEIPT_KIND_V2 =
  'EDITRON_MEDIA_SOURCE_AUDIO_PRODUCT_MATERIALIZATION_RECEIPT_V2' as const;

export type MediaSourceAudioProductMaterializationReceiptV2 = Readonly<{
  schemaVersion: 2;
  kind: typeof MEDIA_SOURCE_AUDIO_PRODUCT_MATERIALIZATION_RECEIPT_KIND_V2;
  disposition: 'COMPLETED' | 'ALREADY_COMPLETE';
  assetId: string;
  userId: string;
  sourceVersionSha256: string;
  audioStreamBindingsSha256: string;
  observedAudioStreamIndexes: readonly number[];
  materializedAudioStreamIndexes: readonly number[];
  audioArtifactStateSha256: string;
  sourceAudioAvailabilityEvidenceSha256: string;
  sourceVersionEvidenceSha256: string;
  completedAt: string;
  receiptSha256: string;
}>;

export type MediaSourceAudioProductMaterializationReceiptInputV2 = Omit<
  MediaSourceAudioProductMaterializationReceiptV2,
  'schemaVersion' | 'kind' | 'receiptSha256'
>;

type ReceiptMaterialV2 = Omit<
  MediaSourceAudioProductMaterializationReceiptV2,
  'receiptSha256'
>;

export class MediaSourceAudioProductReceiptErrorV2 extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'MediaSourceAudioProductReceiptErrorV2';
  }
}

export function createMediaSourceAudioProductMaterializationReceiptV2(
  input: MediaSourceAudioProductMaterializationReceiptInputV2,
): MediaSourceAudioProductMaterializationReceiptV2 {
  const material = normalizeMaterial({
    ...input,
    schemaVersion: 2,
    kind: MEDIA_SOURCE_AUDIO_PRODUCT_MATERIALIZATION_RECEIPT_KIND_V2,
  });
  return deepFreezeEditronJsonV1({
    ...material,
    receiptSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertMediaSourceAudioProductMaterializationReceiptV2(
  value: unknown,
): MediaSourceAudioProductMaterializationReceiptV2 {
  const record = objectRecord(value);
  exactKeys(record, [...MATERIAL_KEYS, 'receiptSha256']);
  const {
    receiptSha256: receiptSha256Value,
    ...materialRecord
  } = record;
  const material = normalizeMaterial(materialRecord);
  const receiptSha256 = sha256(receiptSha256Value);
  if (hashEditronCanonicalJsonV1(material) !== receiptSha256) {
    fail('MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_HASH_MISMATCH');
  }
  return deepFreezeEditronJsonV1({ ...material, receiptSha256 });
}

const MATERIAL_KEYS = Object.freeze([
  'assetId',
  'audioArtifactStateSha256',
  'audioStreamBindingsSha256',
  'completedAt',
  'disposition',
  'kind',
  'materializedAudioStreamIndexes',
  'observedAudioStreamIndexes',
  'schemaVersion',
  'sourceAudioAvailabilityEvidenceSha256',
  'sourceVersionEvidenceSha256',
  'sourceVersionSha256',
  'userId',
] as const);

function normalizeMaterial(value: unknown): ReceiptMaterialV2 {
  const record = objectRecord(value);
  exactKeys(record, MATERIAL_KEYS);
  if (record.schemaVersion !== 2
    || record.kind
      !== MEDIA_SOURCE_AUDIO_PRODUCT_MATERIALIZATION_RECEIPT_KIND_V2
    || (record.disposition !== 'COMPLETED'
      && record.disposition !== 'ALREADY_COMPLETE')) {
    fail('MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_IDENTITY_INVALID');
  }
  const disposition = record.disposition as
    MediaSourceAudioProductMaterializationReceiptV2['disposition'];
  const observedAudioStreamIndexes = indexes(
    record.observedAudioStreamIndexes,
    false,
  );
  const materializedAudioStreamIndexes = indexes(
    record.materializedAudioStreamIndexes,
    true,
  );
  if (materializedAudioStreamIndexes.some((index) => (
    !observedAudioStreamIndexes.includes(index)
  ))
    || (disposition === 'COMPLETED'
      && materializedAudioStreamIndexes.length === 0)
    || (disposition === 'ALREADY_COMPLETE'
      && materializedAudioStreamIndexes.length !== 0)) {
    fail('MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_STREAM_SET_INVALID');
  }
  return deepFreezeEditronJsonV1({
    schemaVersion: 2 as const,
    kind: MEDIA_SOURCE_AUDIO_PRODUCT_MATERIALIZATION_RECEIPT_KIND_V2,
    disposition,
    assetId: identifier(record.assetId),
    userId: identifier(record.userId),
    sourceVersionSha256: sha256(record.sourceVersionSha256),
    audioStreamBindingsSha256: sha256(record.audioStreamBindingsSha256),
    observedAudioStreamIndexes,
    materializedAudioStreamIndexes,
    audioArtifactStateSha256: sha256(record.audioArtifactStateSha256),
    sourceAudioAvailabilityEvidenceSha256: sha256(
      record.sourceAudioAvailabilityEvidenceSha256,
    ),
    sourceVersionEvidenceSha256: sha256(
      record.sourceVersionEvidenceSha256,
    ),
    completedAt: timestamp(record.completedAt),
  });
}

function indexes(value: unknown, allowEmpty: boolean): readonly number[] {
  if (!Array.isArray(value)
    || (!allowEmpty && value.length === 0)
    || value.length > MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_MAX_STREAMS_V1) {
    fail('MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_STREAM_SET_INVALID');
  }
  const normalized = value.map((index) => {
    if (!Number.isSafeInteger(index) || Number(index) < 0) {
      fail('MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_STREAM_SET_INVALID');
    }
    return Number(index);
  });
  if (normalized.some((index, position) => (
    position > 0 && normalized[position - 1]! >= index
  ))) {
    fail('MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_STREAM_SET_INVALID');
  }
  return Object.freeze(normalized);
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_INVALID');
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
): void {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])) {
    fail('MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_FIELDS_INVALID');
  }
}

function identifier(value: unknown): string {
  if (typeof value !== 'string') {
    fail('MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_SCOPE_INVALID');
  }
  const normalized = value.trim();
  if (!normalized || normalized !== value || normalized.length > 256
    || /[\u0000-\u001F\u007F]/.test(normalized)) {
    fail('MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_SCOPE_INVALID');
  }
  return normalized;
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_SHA256_INVALID');
  }
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string') {
    fail('MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_TIMESTAMP_INVALID');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    fail('MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_TIMESTAMP_INVALID');
  }
  return value;
}

function fail(code: string): never {
  throw new MediaSourceAudioProductReceiptErrorV2(code);
}
