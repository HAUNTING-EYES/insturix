import { createHash } from 'node:crypto';

import {
  compareCanonicalMediaTimeV1,
  parseCanonicalMediaTimeV1,
  type CanonicalMediaTimeV1,
} from '../contracts/canonical-media-time-v1';

import {
  canonicalizeEditronJsonV1,
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import type { MediaProxyMasterTimeMapReferenceV1 } from './media-proxy-master-time-mapping-v1';

export const MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_V1' as const;
export const MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_V1' as const;
export const MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_ABSOLUTE_MAX_BYTES_V1 =
  8 * 1024 * 1024;
export const MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_ABSOLUTE_MAX_SPANS_V1 =
  100_000;

const PRIVATE_CORRESPONDENCE_PREFIX =
  'private/editron/media-proxy-master-correspondence/';

export type MediaProxyMasterCorrespondenceBasisV1 = Readonly<{
  relationSha256: string;
  proxyTimeMap: MediaProxyMasterTimeMapReferenceV1;
  masterTimeMap: MediaProxyMasterTimeMapReferenceV1;
}>;

export type MediaProxyMasterCorrespondenceBatchResourcePolicyV1 = Readonly<{
  policyVersion: string;
  maxCanonicalJsonBytes: number;
  maxSpanRecords: number;
}>;

/**
 * A span is one interval in the union of proxy and master frame boundaries.
 * A frame ordinal may repeat when only the other source advances. Consumers
 * may treat a boundary as edit-equivalent only when both ordinals advance at
 * that exact canonical time.
 */
export type MediaProxyMasterFrameCorrespondenceSpanV1 = Readonly<{
  spanOrdinal: string;
  canonicalStartTime: CanonicalMediaTimeV1;
  canonicalEndExclusiveTime: CanonicalMediaTimeV1;
  proxyFrameOrdinal: string;
  masterFrameOrdinal: string;
}>;

export type MediaProxyMasterCorrespondenceBatchV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_KIND_V1;
  basis: MediaProxyMasterCorrespondenceBasisV1;
  basisSha256: string;
  resourcePolicy: MediaProxyMasterCorrespondenceBatchResourcePolicyV1;
  batchSequence: number;
  firstSpanOrdinal: string;
  spans: readonly MediaProxyMasterFrameCorrespondenceSpanV1[];
}>;

export type MediaProxyMasterCorrespondenceBatchSerializationV1 = Readonly<{
  batch: MediaProxyMasterCorrespondenceBatchV1;
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>;

export type MediaProxyMasterCorrespondenceBatchSidecarV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_KIND_V1;
  storage: 'R2_PRIVATE';
  objectKey: string;
  byteLength: number;
  contentSha256: string;
  basisSha256: string;
  batchSequence: number;
  firstSpanOrdinal: string;
  spanCount: string;
  canonicalStartTime: CanonicalMediaTimeV1;
  canonicalEndExclusiveTime: CanonicalMediaTimeV1;
  firstProxyFrameOrdinal: string;
  lastProxyFrameOrdinal: string;
  firstMasterFrameOrdinal: string;
  lastMasterFrameOrdinal: string;
}>;

export function serializeMediaProxyMasterCorrespondenceBatchV1(input: Readonly<{
  basis: MediaProxyMasterCorrespondenceBasisV1;
  resourcePolicy: MediaProxyMasterCorrespondenceBatchResourcePolicyV1;
  batchSequence: number;
  firstSpanOrdinal: string;
  spans: readonly MediaProxyMasterFrameCorrespondenceSpanV1[];
}>): MediaProxyMasterCorrespondenceBatchSerializationV1 {
  const basis = assertMediaProxyMasterCorrespondenceBasisV1(input.basis);
  const batch = assertMediaProxyMasterCorrespondenceBatchV1({
    schemaVersion: 1,
    kind: MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_KIND_V1,
    basis,
    basisSha256: hashEditronCanonicalJsonV1(basis),
    resourcePolicy: input.resourcePolicy,
    batchSequence: input.batchSequence,
    firstSpanOrdinal: input.firstSpanOrdinal,
    spans: input.spans,
  });
  const canonicalJson = canonicalizeEditronJsonV1(batch);
  const byteLength = Buffer.byteLength(canonicalJson, 'utf8');
  if (byteLength > batch.resourcePolicy.maxCanonicalJsonBytes) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_BYTE_LIMIT_EXCEEDED');
  }
  return frozen({
    batch,
    canonicalJson,
    byteLength,
    contentSha256: digest(canonicalJson),
  });
}

export function parseMediaProxyMasterCorrespondenceBatchV1(
  canonicalJson: string,
): MediaProxyMasterCorrespondenceBatchV1 {
  if (typeof canonicalJson !== 'string'
    || Buffer.byteLength(canonicalJson, 'utf8')
      > MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_ABSOLUTE_MAX_BYTES_V1) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_INPUT_TOO_LARGE');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(canonicalJson);
  } catch {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_JSON_INVALID');
  }
  const batch = assertMediaProxyMasterCorrespondenceBatchV1(parsed);
  if (canonicalizeEditronJsonV1(batch) !== canonicalJson) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_JSON_NON_CANONICAL');
  }
  if (Buffer.byteLength(canonicalJson, 'utf8')
    > batch.resourcePolicy.maxCanonicalJsonBytes) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_BYTE_LIMIT_EXCEEDED');
  }
  return batch;
}

export function assertMediaProxyMasterCorrespondenceBatchV1(
  value: unknown,
): MediaProxyMasterCorrespondenceBatchV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_INVALID');
  exactKeys(record, [
    'schemaVersion', 'kind', 'basis', 'basisSha256', 'resourcePolicy',
    'batchSequence', 'firstSpanOrdinal', 'spans',
  ], 'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_KIND_V1) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_HEADER_INVALID');
  }
  const basis = assertMediaProxyMasterCorrespondenceBasisV1(record.basis);
  const basisSha256 = sha256(
    record.basisSha256,
    'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_BASIS_HASH_INVALID',
  );
  if (basisSha256 !== hashEditronCanonicalJsonV1(basis)) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_BASIS_HASH_MISMATCH');
  }
  const resourcePolicy = assertMediaProxyMasterCorrespondenceBatchResourcePolicyV1(
    record.resourcePolicy,
  );
  const batchSequence = safeInteger(
    record.batchSequence,
    'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SEQUENCE_INVALID',
  );
  const firstSpanOrdinal = nonNegativeIntegerText(
    record.firstSpanOrdinal,
    'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_FIRST_SPAN_INVALID',
  );
  const spans = normalizeSpans(
    record.spans,
    firstSpanOrdinal,
    resourcePolicy.maxSpanRecords,
    basis.proxyTimeMap.totalFrameCount,
    basis.masterTimeMap.totalFrameCount,
  );
  if (batchSequence === 0
    && (firstSpanOrdinal !== '0'
      || compareCanonicalMediaTimeV1(
        spans[0]!.canonicalStartTime,
        parseCanonicalMediaTimeV1({ ticks: '0', timescale: '1' }),
      ) !== 0
      || spans[0]!.proxyFrameOrdinal !== '0'
      || spans[0]!.masterFrameOrdinal !== '0')) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_INITIAL_SCOPE_INVALID');
  }
  return frozen({
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_KIND_V1,
    basis,
    basisSha256,
    resourcePolicy,
    batchSequence,
    firstSpanOrdinal,
    spans,
  });
}

export function createMediaProxyMasterCorrespondenceBatchSidecarV1(input: Readonly<{
  serialization: MediaProxyMasterCorrespondenceBatchSerializationV1;
}>): MediaProxyMasterCorrespondenceBatchSidecarV1 {
  const batch = assertMediaProxyMasterCorrespondenceBatchV1(input.serialization.batch);
  const canonicalJson = canonicalizeEditronJsonV1(batch);
  const byteLength = Buffer.byteLength(canonicalJson, 'utf8');
  const contentSha256 = digest(canonicalJson);
  if (input.serialization.canonicalJson !== canonicalJson
    || input.serialization.byteLength !== byteLength
    || input.serialization.contentSha256 !== contentSha256) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SERIALIZATION_MISMATCH');
  }
  const first = batch.spans[0]!;
  const last = batch.spans[batch.spans.length - 1]!;
  return assertMediaProxyMasterCorrespondenceBatchSidecarV1({
    schemaVersion: 1,
    kind: MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_KIND_V1,
    storage: 'R2_PRIVATE',
    objectKey: expectedMediaProxyMasterCorrespondenceBatchObjectKeyV1(
      batch.basisSha256,
      batch.batchSequence,
      contentSha256,
    ),
    byteLength,
    contentSha256,
    basisSha256: batch.basisSha256,
    batchSequence: batch.batchSequence,
    firstSpanOrdinal: batch.firstSpanOrdinal,
    spanCount: String(batch.spans.length),
    canonicalStartTime: first.canonicalStartTime,
    canonicalEndExclusiveTime: last.canonicalEndExclusiveTime,
    firstProxyFrameOrdinal: first.proxyFrameOrdinal,
    lastProxyFrameOrdinal: last.proxyFrameOrdinal,
    firstMasterFrameOrdinal: first.masterFrameOrdinal,
    lastMasterFrameOrdinal: last.masterFrameOrdinal,
  });
}

export function assertMediaProxyMasterCorrespondenceBatchSidecarV1(
  value: unknown,
): MediaProxyMasterCorrespondenceBatchSidecarV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_INVALID');
  exactKeys(record, [
    'schemaVersion', 'kind', 'storage', 'objectKey', 'byteLength',
    'contentSha256', 'basisSha256', 'batchSequence', 'firstSpanOrdinal',
    'spanCount', 'canonicalStartTime', 'canonicalEndExclusiveTime',
    'firstProxyFrameOrdinal', 'lastProxyFrameOrdinal',
    'firstMasterFrameOrdinal', 'lastMasterFrameOrdinal',
  ], 'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_FIELDS_INVALID');
  const basisSha256 = sha256(
    record.basisSha256,
    'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_BASIS_INVALID',
  );
  const contentSha256 = sha256(
    record.contentSha256,
    'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_HASH_INVALID',
  );
  const batchSequence = safeInteger(
    record.batchSequence,
    'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_SEQUENCE_INVALID',
  );
  const objectKey = text(record.objectKey, 'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_KEY_INVALID', 1024);
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_KIND_V1
    || record.storage !== 'R2_PRIVATE'
    || objectKey !== expectedMediaProxyMasterCorrespondenceBatchObjectKeyV1(
      basisSha256,
      batchSequence,
      contentSha256,
    )) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_SCOPE_INVALID');
  }
  const canonicalStartTime = parseCanonicalMediaTimeV1(record.canonicalStartTime);
  const canonicalEndExclusiveTime = parseCanonicalMediaTimeV1(
    record.canonicalEndExclusiveTime,
  );
  if (compareCanonicalMediaTimeV1(canonicalStartTime, canonicalEndExclusiveTime) >= 0) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_RANGE_INVALID');
  }
  const spanCount = positiveIntegerText(
    record.spanCount,
    'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_SPAN_COUNT_INVALID',
  );
  const firstProxyFrameOrdinal = nonNegativeIntegerText(
    record.firstProxyFrameOrdinal,
    'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_PROXY_ORDINAL_INVALID',
  );
  const lastProxyFrameOrdinal = nonNegativeIntegerText(
    record.lastProxyFrameOrdinal,
    'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_PROXY_ORDINAL_INVALID',
  );
  const firstMasterFrameOrdinal = nonNegativeIntegerText(
    record.firstMasterFrameOrdinal,
    'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_MASTER_ORDINAL_INVALID',
  );
  const lastMasterFrameOrdinal = nonNegativeIntegerText(
    record.lastMasterFrameOrdinal,
    'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_MASTER_ORDINAL_INVALID',
  );
  const maximumAdvances = BigInt(spanCount) - BigInt(1);
  const proxyAdvances = BigInt(lastProxyFrameOrdinal) - BigInt(firstProxyFrameOrdinal);
  const masterAdvances = BigInt(lastMasterFrameOrdinal) - BigInt(firstMasterFrameOrdinal);
  if (BigInt(spanCount) > BigInt(MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_ABSOLUTE_MAX_SPANS_V1)
    || proxyAdvances < BigInt(0) || proxyAdvances > maximumAdvances
    || masterAdvances < BigInt(0) || masterAdvances > maximumAdvances) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_SUMMARY_INVALID');
  }
  return frozen({
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_KIND_V1,
    storage: 'R2_PRIVATE' as const,
    objectKey,
    byteLength: positiveSafeInteger(
      record.byteLength,
      MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_ABSOLUTE_MAX_BYTES_V1,
      'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_SIZE_INVALID',
    ),
    contentSha256,
    basisSha256,
    batchSequence,
    firstSpanOrdinal: nonNegativeIntegerText(
      record.firstSpanOrdinal,
      'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_FIRST_SPAN_INVALID',
    ),
    spanCount,
    canonicalStartTime,
    canonicalEndExclusiveTime,
    firstProxyFrameOrdinal,
    lastProxyFrameOrdinal,
    firstMasterFrameOrdinal,
    lastMasterFrameOrdinal,
  });
}

export function assertMediaProxyMasterCorrespondenceBasisV1(
  value: unknown,
): MediaProxyMasterCorrespondenceBasisV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_CORRESPONDENCE_BASIS_INVALID');
  exactKeys(record, ['relationSha256', 'proxyTimeMap', 'masterTimeMap'], 'MEDIA_PROXY_MASTER_CORRESPONDENCE_BASIS_FIELDS_INVALID');
  const proxyTimeMap = timeMapReference(record.proxyTimeMap, 'PROXY');
  const masterTimeMap = timeMapReference(record.masterTimeMap, 'MASTER');
  if (proxyTimeMap.sourceVersionSha256 === masterTimeMap.sourceVersionSha256) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BASIS_SOURCE_IDENTITY_INVALID');
  }
  return frozen({
    relationSha256: sha256(
      record.relationSha256,
      'MEDIA_PROXY_MASTER_CORRESPONDENCE_BASIS_RELATION_INVALID',
    ),
    proxyTimeMap,
    masterTimeMap,
  });
}

export function assertMediaProxyMasterCorrespondenceBatchResourcePolicyV1(
  value: unknown,
): MediaProxyMasterCorrespondenceBatchResourcePolicyV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_POLICY_INVALID');
  exactKeys(record, ['policyVersion', 'maxCanonicalJsonBytes', 'maxSpanRecords'], 'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_POLICY_FIELDS_INVALID');
  return frozen({
    policyVersion: text(
      record.policyVersion,
      'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_POLICY_VERSION_INVALID',
    ),
    maxCanonicalJsonBytes: positiveSafeInteger(
      record.maxCanonicalJsonBytes,
      MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_ABSOLUTE_MAX_BYTES_V1,
      'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_POLICY_BYTES_INVALID',
    ),
    maxSpanRecords: positiveSafeInteger(
      record.maxSpanRecords,
      MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_ABSOLUTE_MAX_SPANS_V1,
      'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_POLICY_SPANS_INVALID',
    ),
  });
}

export function expectedMediaProxyMasterCorrespondenceBatchObjectKeyV1(
  basisSha256: string,
  batchSequence: number,
  contentSha256: string,
): string {
  return `${PRIVATE_CORRESPONDENCE_PREFIX}${sha256(basisSha256, 'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_KEY_BASIS_INVALID')}/batches/${String(safeInteger(batchSequence, 'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_KEY_SEQUENCE_INVALID')).padStart(8, '0')}-${sha256(contentSha256, 'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_KEY_HASH_INVALID')}.json`;
}

function normalizeSpans(
  value: unknown,
  firstSpanOrdinal: string,
  maxSpanRecords: number,
  proxyFrameCount: string,
  masterFrameCount: string,
): readonly MediaProxyMasterFrameCorrespondenceSpanV1[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxSpanRecords) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SPAN_COUNT_INVALID');
  }
  let expectedOrdinal = BigInt(firstSpanOrdinal);
  let previous: MediaProxyMasterFrameCorrespondenceSpanV1 | null = null;
  const spans = value.map((entry) => {
    const record = object(entry, 'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SPAN_INVALID');
    exactKeys(record, [
      'spanOrdinal', 'canonicalStartTime', 'canonicalEndExclusiveTime',
      'proxyFrameOrdinal', 'masterFrameOrdinal',
    ], 'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SPAN_FIELDS_INVALID');
    const spanOrdinal = nonNegativeIntegerText(
      record.spanOrdinal,
      'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SPAN_ORDINAL_INVALID',
    );
    if (BigInt(spanOrdinal) !== expectedOrdinal) {
      fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SPAN_SEQUENCE_INVALID');
    }
    const span = frozen({
      spanOrdinal,
      canonicalStartTime: parseCanonicalMediaTimeV1(record.canonicalStartTime),
      canonicalEndExclusiveTime: parseCanonicalMediaTimeV1(
        record.canonicalEndExclusiveTime,
      ),
      proxyFrameOrdinal: nonNegativeIntegerText(
        record.proxyFrameOrdinal,
        'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_PROXY_ORDINAL_INVALID',
      ),
      masterFrameOrdinal: nonNegativeIntegerText(
        record.masterFrameOrdinal,
        'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_MASTER_ORDINAL_INVALID',
      ),
    });
    if (compareCanonicalMediaTimeV1(
      span.canonicalStartTime,
      span.canonicalEndExclusiveTime,
    ) >= 0) {
      fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SPAN_RANGE_INVALID');
    }
    if (BigInt(span.proxyFrameOrdinal) >= BigInt(proxyFrameCount)
      || BigInt(span.masterFrameOrdinal) >= BigInt(masterFrameCount)) {
      fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_FRAME_OUT_OF_RANGE');
    }
    if (previous) {
      if (compareCanonicalMediaTimeV1(
        previous.canonicalEndExclusiveTime,
        span.canonicalStartTime,
      ) !== 0) {
        fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_CANONICAL_GAP');
      }
      const proxyStep = BigInt(span.proxyFrameOrdinal) - BigInt(previous.proxyFrameOrdinal);
      const masterStep = BigInt(span.masterFrameOrdinal) - BigInt(previous.masterFrameOrdinal);
      if ((proxyStep !== BigInt(0) && proxyStep !== BigInt(1))
        || (masterStep !== BigInt(0) && masterStep !== BigInt(1))) {
        fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_FRAME_STEP_INVALID');
      }
      if (proxyStep === BigInt(0) && masterStep === BigInt(0)) {
        fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_REDUNDANT_SPAN');
      }
    }
    expectedOrdinal += BigInt(1);
    previous = span;
    return span;
  });
  return frozen(spans);
}

function timeMapReference(
  value: unknown,
  side: 'PROXY' | 'MASTER',
): MediaProxyMasterTimeMapReferenceV1 {
  const record = object(value, `MEDIA_PROXY_MASTER_CORRESPONDENCE_${side}_TIME_MAP_INVALID`);
  exactKeys(record, [
    'sourceVersionSha256', 'storageVersionSha256', 'sourceBindingSha256',
    'technicalObservationSha256', 'sourcePtsCadenceMapStateSha256V3',
    'mapBindingSha256', 'terminalReceiptSha256', 'verificationSha256',
    'epochIndexContentSha256', 'streamId', 'videoStreamIndex', 'totalFrameCount',
  ], `MEDIA_PROXY_MASTER_CORRESPONDENCE_${side}_TIME_MAP_FIELDS_INVALID`);
  const videoStreamIndex = safeInteger(
    record.videoStreamIndex,
    `MEDIA_PROXY_MASTER_CORRESPONDENCE_${side}_STREAM_INDEX_INVALID`,
  );
  const streamId = text(
    record.streamId,
    `MEDIA_PROXY_MASTER_CORRESPONDENCE_${side}_STREAM_INVALID`,
  );
  if (streamId !== `video-${String(videoStreamIndex)}`) {
    fail(`MEDIA_PROXY_MASTER_CORRESPONDENCE_${side}_STREAM_MISMATCH`);
  }
  return frozen({
    sourceVersionSha256: sha256(record.sourceVersionSha256, `MEDIA_PROXY_MASTER_CORRESPONDENCE_${side}_SOURCE_INVALID`),
    storageVersionSha256: sha256(record.storageVersionSha256, `MEDIA_PROXY_MASTER_CORRESPONDENCE_${side}_STORAGE_INVALID`),
    sourceBindingSha256: sha256(record.sourceBindingSha256, `MEDIA_PROXY_MASTER_CORRESPONDENCE_${side}_SOURCE_BINDING_INVALID`),
    technicalObservationSha256: sha256(record.technicalObservationSha256, `MEDIA_PROXY_MASTER_CORRESPONDENCE_${side}_OBSERVATION_INVALID`),
    sourcePtsCadenceMapStateSha256V3: sha256(record.sourcePtsCadenceMapStateSha256V3, `MEDIA_PROXY_MASTER_CORRESPONDENCE_${side}_STATE_INVALID`),
    mapBindingSha256: sha256(record.mapBindingSha256, `MEDIA_PROXY_MASTER_CORRESPONDENCE_${side}_MAP_BINDING_INVALID`),
    terminalReceiptSha256: sha256(record.terminalReceiptSha256, `MEDIA_PROXY_MASTER_CORRESPONDENCE_${side}_TERMINAL_INVALID`),
    verificationSha256: sha256(record.verificationSha256, `MEDIA_PROXY_MASTER_CORRESPONDENCE_${side}_VERIFICATION_INVALID`),
    epochIndexContentSha256: sha256(record.epochIndexContentSha256, `MEDIA_PROXY_MASTER_CORRESPONDENCE_${side}_INDEX_INVALID`),
    streamId,
    videoStreamIndex,
    totalFrameCount: positiveIntegerText(record.totalFrameCount, `MEDIA_PROXY_MASTER_CORRESPONDENCE_${side}_FRAME_COUNT_INVALID`),
  });
}

function object(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail(error);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], error: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) fail(error);
}

function text(value: unknown, error: string, max = 256): string {
  if (typeof value !== 'string' || value.trim() !== value
    || value.length === 0 || value.length > max) fail(error);
  return value;
}

function sha256(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(error);
  return value;
}

function safeInteger(value: unknown, error: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(error);
  return value as number;
}

function positiveSafeInteger(value: unknown, max: number, error: string): number {
  const parsed = safeInteger(value, error);
  if (parsed === 0 || parsed > max) fail(error);
  return parsed;
}

function nonNegativeIntegerText(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,127})$/.test(value)) fail(error);
  return value;
}

function positiveIntegerText(value: unknown, error: string): string {
  const parsed = nonNegativeIntegerText(value, error);
  if (parsed === '0') fail(error);
  return parsed;
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value));
}

function fail(message: string): never {
  throw new Error(message);
}
