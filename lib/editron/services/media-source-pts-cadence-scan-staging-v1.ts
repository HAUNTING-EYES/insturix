import { createHash } from 'node:crypto';

import { canonicalizeEditronJsonV1, deepFreezeEditronJsonV1 } from './canonical-json-v1';
import type { MediaRationalV1 } from './media-source-probe-v1';

export const MEDIA_SOURCE_PTS_CADENCE_SCAN_STAGING_BATCH_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_SCAN_STAGING_BATCH_V1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_SIDECAR_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_SIDECAR_V1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_ABSOLUTE_MAX_BYTES_V1 = 8 * 1024 * 1024;
export const MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_ABSOLUTE_MAX_RECORDS_V1 = 100_000;

export type MediaSourcePtsCadenceScanResourcePolicyV1 = Readonly<{
  policyVersion: string;
  maxCanonicalJsonBytes: number;
  maxFrameRecords: number;
}>;
export type MediaSourcePtsCadenceScanFrameV1 = Readonly<{
  presentationTimestampTicks: string;
  durationTicks: string;
}>;
export type MediaSourcePtsCadenceScanStagingBatchV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_SCAN_STAGING_BATCH_KIND_V1;
  mapBindingSha256: string;
  resourcePolicy: MediaSourcePtsCadenceScanResourcePolicyV1;
  sourceTimebase: MediaRationalV1;
  timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP';
  shardSequence: number;
  firstFrameOrdinal: string;
  previousBatchContentSha256: string | null;
  frames: readonly MediaSourcePtsCadenceScanFrameV1[];
}>;
export type MediaSourcePtsCadenceScanStagingBatchSerializationV1 = Readonly<{
  batch: MediaSourcePtsCadenceScanStagingBatchV1;
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>;
export type MediaSourcePtsCadenceScanBatchSidecarV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_SIDECAR_KIND_V1;
  storage: 'R2_PRIVATE';
  objectKey: string;
  byteLength: number;
  contentSha256: string;
}>;

/** Compute-stage bytes only; the existing MEDIA_ASSETS owner remains canonical. */
export function serializeMediaSourcePtsCadenceScanStagingBatchV1(
  value: MediaSourcePtsCadenceScanStagingBatchV1,
): MediaSourcePtsCadenceScanStagingBatchSerializationV1 {
  const batch = assertMediaSourcePtsCadenceScanStagingBatchV1(value);
  const canonicalJson = canonicalizeEditronJsonV1(batch);
  const byteLength = Buffer.byteLength(canonicalJson, 'utf8');
  if (byteLength > batch.resourcePolicy.maxCanonicalJsonBytes) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_BYTE_LIMIT_EXCEEDED');
  }
  return freeze({ batch, canonicalJson, byteLength, contentSha256: hashUtf8(canonicalJson) });
}

export function parseMediaSourcePtsCadenceScanStagingBatchV1(
  canonicalJson: string,
): MediaSourcePtsCadenceScanStagingBatchV1 {
  if (typeof canonicalJson !== 'string'
    || Buffer.byteLength(canonicalJson, 'utf8') > MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_ABSOLUTE_MAX_BYTES_V1) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_INPUT_TOO_LARGE');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(canonicalJson); } catch {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_JSON_INVALID');
  }
  const batch = assertMediaSourcePtsCadenceScanStagingBatchV1(parsed);
  if (canonicalizeEditronJsonV1(batch) !== canonicalJson) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_JSON_NON_CANONICAL');
  }
  if (Buffer.byteLength(canonicalJson, 'utf8') > batch.resourcePolicy.maxCanonicalJsonBytes) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_BYTE_LIMIT_EXCEEDED');
  }
  return batch;
}

export function createMediaSourcePtsCadenceScanBatchSidecarV1(input: {
  serialization: MediaSourcePtsCadenceScanStagingBatchSerializationV1;
}): MediaSourcePtsCadenceScanBatchSidecarV1 {
  const actual = serializeMediaSourcePtsCadenceScanStagingBatchV1(input.serialization.batch);
  if (actual.canonicalJson !== input.serialization.canonicalJson
    || actual.byteLength !== input.serialization.byteLength
    || actual.contentSha256 !== input.serialization.contentSha256) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_SERIALIZATION_INVALID');
  }
  return freeze({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_SIDECAR_KIND_V1,
    storage: 'R2_PRIVATE',
    objectKey: expectedMediaSourcePtsCadenceScanBatchObjectKeyV1(
      actual.batch.mapBindingSha256, actual.batch.shardSequence, actual.contentSha256,
    ),
    byteLength: actual.byteLength,
    contentSha256: actual.contentSha256,
  });
}

export function expectedMediaSourcePtsCadenceScanBatchObjectKeyV1(
  mapBindingSha256: string,
  shardSequence: number,
  contentSha256: string,
): string {
  return `private/editron/media-source-pts-scan/v1/${assertScanSha256V1(
    mapBindingSha256, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_BINDING_INVALID')}/batches/${assertScanSafeIntegerV1(
    shardSequence, false, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_SEQUENCE_INVALID')}/${assertScanSha256V1(
    contentSha256, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_CONTENT_HASH_INVALID')}.json`;
}

export function assertMediaSourcePtsCadenceScanStagingBatchV1(
  value: unknown,
): MediaSourcePtsCadenceScanStagingBatchV1 {
  const record = assertScanRecordV1(value, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_INVALID');
  assertScanExactKeysV1(record, [
    'firstFrameOrdinal', 'frames', 'kind', 'mapBindingSha256',
    'previousBatchContentSha256', 'resourcePolicy', 'schemaVersion',
    'shardSequence', 'sourceTimebase', 'timestampOrigin',
  ], 'MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_SOURCE_PTS_CADENCE_SCAN_STAGING_BATCH_KIND_V1
    || record.timestampOrigin !== 'FFPROBE_BEST_EFFORT_TIMESTAMP') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_INVALID');
  }
  const resourcePolicy = assertScanResourcePolicyV1(record.resourcePolicy);
  const frames = normalizeFrames(record.frames, resourcePolicy.maxFrameRecords);
  return freeze({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_SCAN_STAGING_BATCH_KIND_V1,
    mapBindingSha256: assertScanSha256V1(record.mapBindingSha256, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_BINDING_INVALID'),
    resourcePolicy,
    sourceTimebase: assertScanReducedRationalV1(record.sourceTimebase),
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
    shardSequence: assertScanSafeIntegerV1(record.shardSequence, false, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_SEQUENCE_INVALID'),
    firstFrameOrdinal: assertScanIntegerTextV1(record.firstFrameOrdinal, 'NON_NEGATIVE', 'MEDIA_SOURCE_PTS_CADENCE_SCAN_ORDINAL_INVALID'),
    previousBatchContentSha256: record.previousBatchContentSha256 === null ? null
      : assertScanSha256V1(record.previousBatchContentSha256, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_PREVIOUS_HASH_INVALID'),
    frames,
  });
}

function normalizeFrames(value: unknown, maximum: number): readonly MediaSourcePtsCadenceScanFrameV1[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_FRAMES_INVALID');
  }
  const frames = value.map((entry) => {
    const record = assertScanRecordV1(entry, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_FRAME_INVALID');
    assertScanExactKeysV1(record, ['durationTicks', 'presentationTimestampTicks'],
      'MEDIA_SOURCE_PTS_CADENCE_SCAN_FRAME_FIELDS_INVALID');
    return {
      presentationTimestampTicks: assertScanIntegerTextV1(
        record.presentationTimestampTicks, 'SIGNED', 'MEDIA_SOURCE_PTS_CADENCE_SCAN_FRAME_PTS_INVALID',
      ),
      durationTicks: assertScanIntegerTextV1(
        record.durationTicks, 'POSITIVE', 'MEDIA_SOURCE_PTS_CADENCE_SCAN_FRAME_DURATION_INVALID',
      ),
    };
  });
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1]!;
    if (BigInt(frames[index]!.presentationTimestampTicks)
      !== BigInt(previous.presentationTimestampTicks) + BigInt(previous.durationTicks)) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_FRAME_CONTINUITY_INVALID');
    }
  }
  return freeze(frames);
}

export function assertScanResourcePolicyV1(value: unknown): MediaSourcePtsCadenceScanResourcePolicyV1 {
  const record = assertScanRecordV1(value, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_POLICY_INVALID');
  assertScanExactKeysV1(record, ['maxCanonicalJsonBytes', 'maxFrameRecords', 'policyVersion'],
    'MEDIA_SOURCE_PTS_CADENCE_SCAN_POLICY_FIELDS_INVALID');
  return freeze({
    policyVersion: assertScanTextV1(record.policyVersion, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_POLICY_VERSION_INVALID'),
    maxCanonicalJsonBytes: assertScanSafeIntegerV1(
      record.maxCanonicalJsonBytes, true, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_POLICY_BYTES_INVALID',
      MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_ABSOLUTE_MAX_BYTES_V1,
    ),
    maxFrameRecords: assertScanSafeIntegerV1(
      record.maxFrameRecords, true, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_POLICY_RECORDS_INVALID',
      MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_ABSOLUTE_MAX_RECORDS_V1,
    ),
  });
}

export function assertScanReducedRationalV1(value: unknown): MediaRationalV1 {
  const record = assertScanRecordV1(value, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_TIMEBASE_INVALID');
  assertScanExactKeysV1(record, ['denominator', 'numerator'], 'MEDIA_SOURCE_PTS_CADENCE_SCAN_TIMEBASE_FIELDS_INVALID');
  const numerator = assertScanIntegerTextV1(record.numerator, 'POSITIVE', 'MEDIA_SOURCE_PTS_CADENCE_SCAN_TIMEBASE_INVALID');
  const denominator = assertScanIntegerTextV1(record.denominator, 'POSITIVE', 'MEDIA_SOURCE_PTS_CADENCE_SCAN_TIMEBASE_INVALID');
  if (gcd(BigInt(numerator), BigInt(denominator)) !== BigInt(1)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_TIMEBASE_NOT_REDUCED');
  }
  return freeze({ numerator, denominator });
}

export function assertScanIntegerTextV1(
  value: unknown,
  kind: 'SIGNED' | 'NON_NEGATIVE' | 'POSITIVE',
  code: string,
): string {
  const patterns = { SIGNED: /^-?(0|[1-9]\d{0,127})$/, NON_NEGATIVE: /^(0|[1-9]\d{0,127})$/, POSITIVE: /^[1-9]\d{0,127}$/ };
  if (typeof value !== 'string' || !patterns[kind].test(value.trim())) throw new Error(code);
  return BigInt(value.trim()).toString();
}

export function assertScanRecordV1(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}
export function assertScanExactKeysV1(record: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(record).sort(); const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) throw new Error(code);
}
export function assertScanSha256V1(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}
export function assertScanTextV1(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/.test(normalized)) throw new Error(code);
  return normalized;
}
export function assertScanSafeIntegerV1(value: unknown, positive: boolean, code: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || Number(value) < (positive ? 1 : 0) || Number(value) > maximum) throw new Error(code);
  return Number(value);
}
export function freezeMediaSourcePtsCadenceScanV1<T>(value: T): T { return freeze(value); }

function gcd(left: bigint, right: bigint): bigint {
  let a = left; let b = right;
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  return a;
}
function hashUtf8(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function freeze<T>(value: T): T { return deepFreezeEditronJsonV1(value) as T; }
