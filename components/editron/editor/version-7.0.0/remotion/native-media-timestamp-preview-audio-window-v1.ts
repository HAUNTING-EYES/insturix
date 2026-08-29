import type { NativeMediaTimestampPreviewWindowLeaseV2 } from './native-media-timestamp-preview-window-v2';

export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_WINDOW_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_WINDOW_V1' as const;

const AUDIO_HANDLE_PATTERN = /^nmpa1_[a-f0-9]{64}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_AUDIO_SEGMENTS = 256;
const MAX_WINDOW_FRAMES = 1_024;
const MAX_LEASE_TTL_MS = 24 * 60 * 60 * 1_000;

export type NativeMediaTimestampPreviewAudioSamplePositionV1 = Readonly<{
  numerator: string;
  denominator: string;
  disposition: 'INTEGER_SAMPLE_FRAME' | 'BETWEEN_SAMPLE_FRAMES';
}>;

export type NativeMediaTimestampPreviewAudioWindowSegmentV1 = Readonly<
  | {
      kind: 'PCM';
      audioEpochId: string;
      audioHandle: string;
      segmentIdentitySha256: string;
      sourceStartSampleFrame: string;
      sourceEndExclusiveSampleFrame: string;
      decodedStartSamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
      decodedEndExclusiveSamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
      timelineStartSamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
      timelineEndExclusiveSamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
    }
  | {
      kind: 'SILENCE';
      reason: 'LEADING_STREAM_OFFSET' | 'DECLARED_SOURCE_GAP';
      precedingAudioEpochId: string | null;
      nextAudioEpochId: string;
      timelineStartSamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
      timelineEndExclusiveSamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
    }
>;

export type NativeMediaTimestampPreviewAudioWindowV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_WINDOW_KIND_V1;
  windowSha256: string;
  projectId: string;
  sequenceId: string;
  overlayId: string;
  projectRevision: Readonly<{
    schemaVersion: 1;
    value: number;
    compatibilityUpdatedAt: string;
  }>;
  audioMappingSha256: string;
  audioSampleEpochMapSha256: string;
  decodedPcmSha256: string;
  sampleRate: number;
  channelCount: number;
  windowLocalStartFrame: number;
  windowDurationInFrames: number;
  windowProjectStartFrame: number;
  windowProjectEndExclusiveFrame: number;
  canonicalWindowStartSamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
  canonicalWindowEndExclusiveSamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
  lease: NativeMediaTimestampPreviewWindowLeaseV2;
  segments: readonly NativeMediaTimestampPreviewAudioWindowSegmentV1[];
}>;

export function assertNativeMediaTimestampPreviewAudioWindowV1(
  value: unknown,
): NativeMediaTimestampPreviewAudioWindowV1 {
  const record = exactRecord(value, [
    'audioMappingSha256', 'audioSampleEpochMapSha256', 'canonicalWindowEndExclusiveSamplePosition',
    'canonicalWindowStartSamplePosition', 'channelCount', 'decodedPcmSha256', 'kind',
    'lease', 'overlayId', 'projectId', 'projectRevision', 'sampleRate',
    'schemaVersion', 'segments', 'sequenceId', 'windowDurationInFrames',
    'windowLocalStartFrame', 'windowProjectEndExclusiveFrame',
    'windowProjectStartFrame', 'windowSha256',
  ], 'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_WINDOW_KIND_V1
    || !Array.isArray(record.segments)
    || record.segments.length < 1
    || record.segments.length > MAX_AUDIO_SEGMENTS) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_INVALID');
  }
  const windowLocalStartFrame = nonNegativeSafeInteger(
    record.windowLocalStartFrame,
    'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_FRAME_RANGE_INVALID',
  );
  const windowDurationInFrames = positiveSafeIntegerInRange(
    record.windowDurationInFrames,
    MAX_WINDOW_FRAMES,
    'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_FRAME_RANGE_INVALID',
  );
  const windowProjectStartFrame = nonNegativeSafeInteger(
    record.windowProjectStartFrame,
    'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_FRAME_RANGE_INVALID',
  );
  const windowProjectEndExclusiveFrame = nonNegativeSafeInteger(
    record.windowProjectEndExclusiveFrame,
    'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_FRAME_RANGE_INVALID',
  );
  if (windowProjectStartFrame + windowDurationInFrames
      !== windowProjectEndExclusiveFrame) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_FRAME_RANGE_INVALID');
  }
  const canonicalWindowStartSamplePosition = normalizePosition(
    record.canonicalWindowStartSamplePosition,
    'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SAMPLE_RANGE_INVALID',
  );
  const canonicalWindowEndExclusiveSamplePosition = normalizePosition(
    record.canonicalWindowEndExclusiveSamplePosition,
    'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SAMPLE_RANGE_INVALID',
  );
  const windowStart = fraction(canonicalWindowStartSamplePosition);
  const windowEnd = fraction(canonicalWindowEndExclusiveSamplePosition);
  if (compare(windowStart, windowEnd) >= 0) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SAMPLE_RANGE_INVALID');
  }
  const handles = new Set<string>();
  let cursor = windowStart;
  const segments = record.segments.map((candidate) => {
    const segment = normalizeSegment(candidate);
    const start = fraction(segment.timelineStartSamplePosition);
    const end = fraction(segment.timelineEndExclusiveSamplePosition);
    if (compare(start, cursor) !== 0 || compare(start, end) >= 0
      || compare(end, windowEnd) > 0) {
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SEGMENT_COVERAGE_INVALID');
    }
    cursor = end;
    if (segment.kind === 'PCM') {
      if (handles.has(segment.audioHandle)) {
        throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_HANDLE_DUPLICATE');
      }
      handles.add(segment.audioHandle);
    }
    return segment;
  });
  if (compare(cursor, windowEnd) !== 0) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SEGMENT_COVERAGE_INVALID');
  }
  return deepFreeze({
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_WINDOW_KIND_V1,
    windowSha256: sha256(
      record.windowSha256,
      'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_HASH_INVALID',
    ),
    projectId: identifier(record.projectId, 'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SCOPE_INVALID'),
    sequenceId: identifier(
      record.sequenceId,
      'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SCOPE_INVALID',
    ),
    overlayId: identifier(record.overlayId, 'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SCOPE_INVALID'),
    projectRevision: normalizeRevision(record.projectRevision),
    audioMappingSha256: sha256(
      record.audioMappingSha256,
      'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_MAPPING_INVALID',
    ),
    audioSampleEpochMapSha256: sha256(
      record.audioSampleEpochMapSha256,
      'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_MAP_INVALID',
    ),
    decodedPcmSha256: sha256(
      record.decodedPcmSha256,
      'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_PCM_INVALID',
    ),
    sampleRate: positiveSafeIntegerInRange(
      record.sampleRate,
      768_000,
      'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SAMPLE_RATE_INVALID',
    ),
    channelCount: positiveSafeIntegerInRange(
      record.channelCount,
      32,
      'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_CHANNEL_COUNT_INVALID',
    ),
    windowLocalStartFrame,
    windowDurationInFrames,
    windowProjectStartFrame,
    windowProjectEndExclusiveFrame,
    canonicalWindowStartSamplePosition,
    canonicalWindowEndExclusiveSamplePosition,
    lease: normalizeLease(record.lease),
    segments,
  });
}

export function nativeMediaTimestampPreviewAudioRoutePathV1(
  projectId: string,
  audioHandle: string,
): string {
  const normalizedProjectId = identifier(
    projectId,
    'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SCOPE_INVALID',
  );
  if (!AUDIO_HANDLE_PATTERN.test(audioHandle)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_HANDLE_INVALID');
  }
  return '/api/services/editron/media/timestamp-preview/audio/'
    + encodeURIComponent(normalizedProjectId)
    + '/'
    + audioHandle;
}

function normalizeSegment(value: unknown): NativeMediaTimestampPreviewAudioWindowSegmentV1 {
  const record = objectRecord(value, 'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SEGMENT_INVALID');
  const timelineStartSamplePosition = normalizePosition(
    record.timelineStartSamplePosition,
    'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SEGMENT_RANGE_INVALID',
  );
  const timelineEndExclusiveSamplePosition = normalizePosition(
    record.timelineEndExclusiveSamplePosition,
    'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SEGMENT_RANGE_INVALID',
  );
  const timelineStart = fraction(timelineStartSamplePosition);
  const timelineEnd = fraction(timelineEndExclusiveSamplePosition);
  if (compare(timelineStart, timelineEnd) >= 0) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SEGMENT_RANGE_INVALID');
  }
  if (record.kind === 'PCM') {
    exactKeys(record, [
      'audioEpochId', 'audioHandle', 'decodedEndExclusiveSamplePosition',
      'decodedStartSamplePosition', 'kind', 'segmentIdentitySha256',
      'sourceEndExclusiveSampleFrame', 'sourceStartSampleFrame',
      'timelineEndExclusiveSamplePosition', 'timelineStartSamplePosition',
    ], 'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_PCM_SEGMENT_FIELDS_INVALID');
    const sourceStartSampleFrame = nonNegativeIntegerText(
      record.sourceStartSampleFrame,
      'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_PCM_SOURCE_RANGE_INVALID',
    );
    const sourceEndExclusiveSampleFrame = positiveIntegerText(
      record.sourceEndExclusiveSampleFrame,
      'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_PCM_SOURCE_RANGE_INVALID',
    );
    const decodedStartSamplePosition = normalizePosition(
      record.decodedStartSamplePosition,
      'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_PCM_DECODED_RANGE_INVALID',
    );
    const decodedEndExclusiveSamplePosition = normalizePosition(
      record.decodedEndExclusiveSamplePosition,
      'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_PCM_DECODED_RANGE_INVALID',
    );
    const decodedStart = fraction(decodedStartSamplePosition);
    const decodedEnd = fraction(decodedEndExclusiveSamplePosition);
    if (compare(decodedStart, decodedEnd) >= 0
      || floorFraction(decodedStart) !== BigInt(sourceStartSampleFrame)
      || ceilFraction(decodedEnd) !== BigInt(sourceEndExclusiveSampleFrame)
      || compare(subtract(decodedEnd, decodedStart), subtract(timelineEnd, timelineStart)) !== 0) {
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_PCM_DURATION_INVALID');
    }
    if (typeof record.audioHandle !== 'string'
      || !AUDIO_HANDLE_PATTERN.test(record.audioHandle)) {
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_HANDLE_INVALID');
    }
    return deepFreeze({
      kind: 'PCM' as const,
      audioEpochId: identifier(
        record.audioEpochId,
        'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_EPOCH_INVALID',
      ),
      audioHandle: record.audioHandle,
      segmentIdentitySha256: sha256(
        record.segmentIdentitySha256,
        'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SEGMENT_HASH_INVALID',
      ),
      sourceStartSampleFrame,
      sourceEndExclusiveSampleFrame,
      decodedStartSamplePosition,
      decodedEndExclusiveSamplePosition,
      timelineStartSamplePosition,
      timelineEndExclusiveSamplePosition,
    });
  }
  exactKeys(record, [
    'kind', 'nextAudioEpochId', 'precedingAudioEpochId', 'reason',
    'timelineEndExclusiveSamplePosition', 'timelineStartSamplePosition',
  ], 'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SILENCE_SEGMENT_FIELDS_INVALID');
  if (record.kind !== 'SILENCE') {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SILENCE_SEGMENT_INVALID');
  }
  const reason = record.reason === 'LEADING_STREAM_OFFSET'
    ? 'LEADING_STREAM_OFFSET' as const
    : record.reason === 'DECLARED_SOURCE_GAP'
      ? 'DECLARED_SOURCE_GAP' as const
      : null;
  if (reason === null) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SILENCE_SEGMENT_INVALID');
  }
  return deepFreeze({
    kind: 'SILENCE' as const,
    reason,
    precedingAudioEpochId: record.precedingAudioEpochId === null
      ? null
      : identifier(
          record.precedingAudioEpochId,
          'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_EPOCH_INVALID',
        ),
    nextAudioEpochId: identifier(
      record.nextAudioEpochId,
      'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_EPOCH_INVALID',
    ),
    timelineStartSamplePosition,
    timelineEndExclusiveSamplePosition,
  });
}

function normalizePosition(
  value: unknown,
  code: string,
): NativeMediaTimestampPreviewAudioSamplePositionV1 {
  const record = exactRecord(
    value,
    ['denominator', 'disposition', 'numerator'],
    code,
  );
  const numerator = nonNegativeIntegerText(record.numerator, code);
  const denominator = positiveIntegerText(record.denominator, code);
  if (gcd(BigInt(numerator), BigInt(denominator)) !== BigInt(1)) throw new Error(code);
  const disposition = denominator === '1'
    ? 'INTEGER_SAMPLE_FRAME' as const
    : 'BETWEEN_SAMPLE_FRAMES' as const;
  if (record.disposition !== disposition) throw new Error(code);
  return Object.freeze({ numerator, denominator, disposition });
}

function normalizeRevision(
  value: unknown,
): NativeMediaTimestampPreviewAudioWindowV1['projectRevision'] {
  const record = exactRecord(
    value,
    ['compatibilityUpdatedAt', 'schemaVersion', 'value'],
    'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_REVISION_INVALID',
  );
  if (record.schemaVersion !== 1) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_REVISION_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    value: nonNegativeSafeInteger(
      record.value,
      'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_REVISION_INVALID',
    ),
    compatibilityUpdatedAt: boundedText(
      record.compatibilityUpdatedAt,
      240,
      'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_REVISION_INVALID',
    ),
  });
}

function normalizeLease(value: unknown): NativeMediaTimestampPreviewWindowLeaseV2 {
  const record = exactRecord(value, [
    'expiresAtEpochMs', 'issuedAtEpochMs', 'leaseId', 'renewAfterEpochMs',
  ], 'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_LEASE_INVALID');
  const issuedAtEpochMs = nonNegativeSafeInteger(
    record.issuedAtEpochMs,
    'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_LEASE_INVALID',
  );
  const renewAfterEpochMs = nonNegativeSafeInteger(
    record.renewAfterEpochMs,
    'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_LEASE_INVALID',
  );
  const expiresAtEpochMs = nonNegativeSafeInteger(
    record.expiresAtEpochMs,
    'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_LEASE_INVALID',
  );
  if (typeof record.leaseId !== 'string'
    || !/^nmpwl2_[a-f0-9]{64}$/.test(record.leaseId)
    || renewAfterEpochMs <= issuedAtEpochMs
    || expiresAtEpochMs <= renewAfterEpochMs
    || expiresAtEpochMs - issuedAtEpochMs > MAX_LEASE_TTL_MS) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_LEASE_INVALID');
  }
  return Object.freeze({
    leaseId: record.leaseId,
    issuedAtEpochMs,
    renewAfterEpochMs,
    expiresAtEpochMs,
  });
}

type FractionV1 = Readonly<{ numerator: bigint; denominator: bigint }>;

function fraction(value: NativeMediaTimestampPreviewAudioSamplePositionV1): FractionV1 {
  return { numerator: BigInt(value.numerator), denominator: BigInt(value.denominator) };
}

function subtract(left: FractionV1, right: FractionV1): FractionV1 {
  const numerator = left.numerator * right.denominator
    - right.numerator * left.denominator;
  const denominator = left.denominator * right.denominator;
  const divisor = gcd(abs(numerator), denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function compare(left: FractionV1, right: FractionV1): number {
  const delta = left.numerator * right.denominator
    - right.numerator * left.denominator;
  return delta < BigInt(0) ? -1 : delta > BigInt(0) ? 1 : 0;
}

function floorFraction(value: FractionV1): bigint {
  return value.numerator / value.denominator;
}

function ceilFraction(value: FractionV1): bigint {
  return (value.numerator + value.denominator - BigInt(1)) / value.denominator;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = abs(left);
  let b = abs(right);
  while (b !== BigInt(0)) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a === BigInt(0) ? BigInt(1) : a;
}

function abs(value: bigint): bigint {
  return value < BigInt(0) ? -value : value;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  code: string,
): Record<string, unknown> {
  const record = objectRecord(value, code);
  exactKeys(record, keys, code);
  return record;
}

function objectRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    throw new Error(code);
  }
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

function positiveSafeIntegerInRange(value: unknown, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    throw new Error(code);
  }
  return Number(value);
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) throw new Error(code);
  return value;
}

function identifier(value: unknown, code: string): string {
  return boundedText(value, 256, code);
}

function boundedText(value: unknown, maximum: number, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum
    || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}
