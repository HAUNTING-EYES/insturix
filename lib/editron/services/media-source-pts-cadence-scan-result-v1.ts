import type { MediaRationalV1 } from './media-source-probe-v1';
import {
  assertScanExactKeysV1,
  assertScanIntegerTextV1,
  assertScanRecordV1,
  assertScanReducedRationalV1,
  assertScanResourcePolicyV1,
  assertScanSafeIntegerV1,
  assertScanSha256V1,
  assertScanTextV1,
  expectedMediaSourcePtsCadenceScanBatchObjectKeyV1,
  freezeMediaSourcePtsCadenceScanV1,
  MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_ABSOLUTE_MAX_BYTES_V1,
  MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_SIDECAR_KIND_V1,
  type MediaSourcePtsCadenceScanBatchSidecarV1,
  type MediaSourcePtsCadenceScanResourcePolicyV1,
} from './media-source-pts-cadence-scan-staging-v1';

export const MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_V1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_ABSOLUTE_MAX_BATCHES_V1 = 100_000;

export type MediaSourcePtsCadenceScanResultBatchV1 = Readonly<{
  shardSequence: number;
  firstFrameOrdinal: string;
  frameCount: string;
  startPresentationTimestampTicks: string;
  endExclusivePresentationTimestampTicks: string;
  previousBatchContentSha256: string | null;
  sidecar: MediaSourcePtsCadenceScanBatchSidecarV1;
}>;
export type MediaSourcePtsCadenceScanResultV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1;
  status: 'COMPLETE' | 'UNVERIFIABLE';
  diagnostic: string | null;
  mapBindingSha256: string;
  resourcePolicy: MediaSourcePtsCadenceScanResourcePolicyV1;
  ffprobeVersion: string;
  videoStreamIndex: number;
  sourceTimebase: MediaRationalV1;
  timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP';
  batches: readonly MediaSourcePtsCadenceScanResultBatchV1[];
  totalFrameCount: string;
  sourceStartPresentationTimestampTicks: string | null;
  sourceEndExclusivePresentationTimestampTicks: string | null;
}>;

/** Validates a Modal result summary; it does not trust or read the named bytes. */
export function assertMediaSourcePtsCadenceScanResultV1(value: unknown): MediaSourcePtsCadenceScanResultV1 {
  const record = assertScanRecordV1(value, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_INVALID');
  assertScanExactKeysV1(record, [
    'batches', 'diagnostic', 'ffprobeVersion', 'kind', 'mapBindingSha256',
    'resourcePolicy', 'schemaVersion', 'sourceEndExclusivePresentationTimestampTicks',
    'sourceStartPresentationTimestampTicks', 'sourceTimebase', 'status',
    'timestampOrigin', 'totalFrameCount', 'videoStreamIndex',
  ], 'MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1
    || (record.status !== 'COMPLETE' && record.status !== 'UNVERIFIABLE')
    || record.timestampOrigin !== 'FFPROBE_BEST_EFFORT_TIMESTAMP') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_INVALID');
  }
  const mapBindingSha256 = assertScanSha256V1(record.mapBindingSha256, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_BINDING_INVALID');
  const batches = normalizeBatches(record.batches, mapBindingSha256);
  const totalFrameCount = assertScanIntegerTextV1(record.totalFrameCount, 'NON_NEGATIVE',
    'MEDIA_SOURCE_PTS_CADENCE_SCAN_TOTAL_COUNT_INVALID');
  if (totalFrameCount !== batches.reduce(
    (sum, batch) => sum + BigInt(batch.frameCount), BigInt(0),
  ).toString()) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_TOTAL_COUNT_MISMATCH');
  }
  const diagnostic = record.diagnostic === null ? null
    : assertScanTextV1(record.diagnostic, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_DIAGNOSTIC_INVALID');
  const sourceStart = optionalSigned(record.sourceStartPresentationTimestampTicks,
    'MEDIA_SOURCE_PTS_CADENCE_SCAN_SOURCE_START_INVALID');
  const sourceEnd = optionalSigned(record.sourceEndExclusivePresentationTimestampTicks,
    'MEDIA_SOURCE_PTS_CADENCE_SCAN_SOURCE_END_INVALID');
  if (record.status === 'COMPLETE') {
    if (diagnostic !== null || !batches.length || sourceStart === null || sourceEnd === null
      || batches[0]!.firstFrameOrdinal !== '0'
      || batches[0]!.startPresentationTimestampTicks !== sourceStart
      || batches.at(-1)!.endExclusivePresentationTimestampTicks !== sourceEnd) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_COMPLETE_RESULT_INVALID');
    }
  } else if (!diagnostic) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_UNVERIFIABLE_DIAGNOSTIC_MISSING');
  }
  return freezeMediaSourcePtsCadenceScanV1({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1,
    status: record.status,
    diagnostic,
    mapBindingSha256,
    resourcePolicy: assertScanResourcePolicyV1(record.resourcePolicy),
    ffprobeVersion: assertScanTextV1(record.ffprobeVersion, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_FFPROBE_VERSION_INVALID'),
    videoStreamIndex: assertScanSafeIntegerV1(record.videoStreamIndex, false,
      'MEDIA_SOURCE_PTS_CADENCE_SCAN_STREAM_INDEX_INVALID'),
    sourceTimebase: assertScanReducedRationalV1(record.sourceTimebase),
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
    batches,
    totalFrameCount,
    sourceStartPresentationTimestampTicks: sourceStart,
    sourceEndExclusivePresentationTimestampTicks: sourceEnd,
  });
}

function normalizeBatches(value: unknown, binding: string): readonly MediaSourcePtsCadenceScanResultBatchV1[] {
  if (!Array.isArray(value) || value.length > MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_ABSOLUTE_MAX_BATCHES_V1) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_BATCHES_INVALID');
  }
  const batches = value.map((entry, index) => {
    const record = assertScanRecordV1(entry, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_BATCH_INVALID');
    assertScanExactKeysV1(record, [
      'endExclusivePresentationTimestampTicks', 'firstFrameOrdinal', 'frameCount',
      'previousBatchContentSha256', 'shardSequence', 'sidecar', 'startPresentationTimestampTicks',
    ], 'MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_BATCH_FIELDS_INVALID');
    const shardSequence = assertScanSafeIntegerV1(record.shardSequence, false,
      'MEDIA_SOURCE_PTS_CADENCE_SCAN_SEQUENCE_INVALID');
    if (shardSequence !== index) throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_SEQUENCE_GAP');
    return {
      shardSequence,
      firstFrameOrdinal: assertScanIntegerTextV1(record.firstFrameOrdinal, 'NON_NEGATIVE',
        'MEDIA_SOURCE_PTS_CADENCE_SCAN_ORDINAL_INVALID'),
      frameCount: assertScanIntegerTextV1(record.frameCount, 'POSITIVE',
        'MEDIA_SOURCE_PTS_CADENCE_SCAN_FRAME_COUNT_INVALID'),
      startPresentationTimestampTicks: assertScanIntegerTextV1(record.startPresentationTimestampTicks, 'SIGNED',
        'MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_START_INVALID'),
      endExclusivePresentationTimestampTicks: assertScanIntegerTextV1(record.endExclusivePresentationTimestampTicks,
        'SIGNED', 'MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_END_INVALID'),
      previousBatchContentSha256: record.previousBatchContentSha256 === null ? null
        : assertScanSha256V1(record.previousBatchContentSha256,
          'MEDIA_SOURCE_PTS_CADENCE_SCAN_PREVIOUS_HASH_INVALID'),
      sidecar: normalizeSidecar(record.sidecar, binding, shardSequence),
    };
  });
  batches.forEach((batch, index) => {
    const previous = batches[index - 1];
    if (batch.previousBatchContentSha256 !== (previous?.sidecar.contentSha256 ?? null)) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_HASH_CHAIN_INVALID');
    }
    if (previous && (BigInt(batch.firstFrameOrdinal) !== BigInt(previous.firstFrameOrdinal) + BigInt(previous.frameCount)
      || batch.startPresentationTimestampTicks !== previous.endExclusivePresentationTimestampTicks)) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_CONTINUITY_INVALID');
    }
  });
  return freezeMediaSourcePtsCadenceScanV1(batches);
}

function normalizeSidecar(value: unknown, binding: string, sequence: number): MediaSourcePtsCadenceScanBatchSidecarV1 {
  const record = assertScanRecordV1(value, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_SIDECAR_INVALID');
  assertScanExactKeysV1(record, ['byteLength', 'contentSha256', 'kind', 'objectKey', 'schemaVersion', 'storage'],
    'MEDIA_SOURCE_PTS_CADENCE_SCAN_SIDECAR_FIELDS_INVALID');
  const contentSha256 = assertScanSha256V1(record.contentSha256, 'MEDIA_SOURCE_PTS_CADENCE_SCAN_CONTENT_HASH_INVALID');
  const objectKey = expectedMediaSourcePtsCadenceScanBatchObjectKeyV1(binding, sequence, contentSha256);
  if (record.schemaVersion !== 1 || record.kind !== MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_SIDECAR_KIND_V1
    || record.storage !== 'R2_PRIVATE' || record.objectKey !== objectKey) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_SIDECAR_INVALID');
  }
  return freezeMediaSourcePtsCadenceScanV1({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_SIDECAR_KIND_V1,
    storage: 'R2_PRIVATE',
    objectKey,
    byteLength: assertScanSafeIntegerV1(record.byteLength, true,
      'MEDIA_SOURCE_PTS_CADENCE_SCAN_SIDECAR_BYTES_INVALID',
      MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_ABSOLUTE_MAX_BYTES_V1),
    contentSha256,
  });
}

function optionalSigned(value: unknown, code: string): string | null {
  return value === null ? null : assertScanIntegerTextV1(value, 'SIGNED', code);
}
