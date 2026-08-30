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
import {
  assertMediaProxyMasterCorrespondenceBasisV1,
  assertMediaProxyMasterCorrespondenceBatchSidecarV1,
  assertMediaProxyMasterCorrespondenceBatchV1,
  createMediaProxyMasterCorrespondenceBatchSidecarV1,
  type MediaProxyMasterCorrespondenceBasisV1,
  type MediaProxyMasterCorrespondenceBatchSerializationV1,
  type MediaProxyMasterCorrespondenceBatchSidecarV1,
  type MediaProxyMasterFrameCorrespondenceSpanV1,
} from './media-proxy-master-correspondence-batch-v1';
import {
  MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_KIND_V1,
  type MediaProxyMasterCorrespondenceIndexReferenceV1,
} from './media-proxy-master-time-mapping-v1';

export const MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_ABSOLUTE_MAX_BYTES_V1 =
  8 * 1024 * 1024;
export const MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_ABSOLUTE_MAX_BATCHES_V1 =
  100_000;

const PRIVATE_CORRESPONDENCE_PREFIX =
  'private/editron/media-proxy-master-correspondence/';

export type MediaProxyMasterCorrespondenceIndexResourcePolicyV1 = Readonly<{
  policyVersion: string;
  requiredBatchPolicyVersion: string;
  maxCanonicalJsonBytes: number;
  maxBatchEntries: number;
}>;

export type MediaProxyMasterCorrespondenceIndexV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_KIND_V1;
  basis: MediaProxyMasterCorrespondenceBasisV1;
  basisSha256: string;
  resourcePolicy: MediaProxyMasterCorrespondenceIndexResourcePolicyV1;
  batches: readonly MediaProxyMasterCorrespondenceBatchSidecarV1[];
  totalSpanCount: string;
  mappedProxyFrameCount: string;
  mappedMasterFrameCount: string;
  canonicalEndExclusiveTime: CanonicalMediaTimeV1;
}>;

export type MediaProxyMasterCorrespondenceIndexSerializationV1 = Readonly<{
  index: MediaProxyMasterCorrespondenceIndexV1;
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>;

export function createMediaProxyMasterCorrespondenceIndexV1(input: Readonly<{
  basis: MediaProxyMasterCorrespondenceBasisV1;
  resourcePolicy: MediaProxyMasterCorrespondenceIndexResourcePolicyV1;
  batches: readonly Readonly<{
    serialization: MediaProxyMasterCorrespondenceBatchSerializationV1;
    sidecar: MediaProxyMasterCorrespondenceBatchSidecarV1;
  }>[];
}>): MediaProxyMasterCorrespondenceIndexSerializationV1 {
  const basis = assertMediaProxyMasterCorrespondenceBasisV1(input.basis);
  const basisSha256 = hashEditronCanonicalJsonV1(basis);
  const resourcePolicy = assertMediaProxyMasterCorrespondenceIndexResourcePolicyV1(
    input.resourcePolicy,
  );
  if (!Array.isArray(input.batches) || input.batches.length === 0
    || input.batches.length > resourcePolicy.maxBatchEntries) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_BATCH_COUNT_INVALID');
  }

  const batches: MediaProxyMasterCorrespondenceBatchSidecarV1[] = [];
  const payloads: Readonly<{
    spans: readonly MediaProxyMasterFrameCorrespondenceSpanV1[];
    firstSpanOrdinal: string;
  }>[] = input.batches.map((entry, batchSequence) => {
    const batch = assertMediaProxyMasterCorrespondenceBatchV1(
      entry.serialization.batch,
    );
    if (batch.batchSequence !== batchSequence
      || batch.basisSha256 !== basisSha256
      || canonicalizeEditronJsonV1(batch.basis) !== canonicalizeEditronJsonV1(basis)) {
      fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_BATCH_SCOPE_MISMATCH');
    }
    if (batch.resourcePolicy.policyVersion
      !== resourcePolicy.requiredBatchPolicyVersion) {
      fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_BATCH_POLICY_MISMATCH');
    }
    const expectedSidecar = createMediaProxyMasterCorrespondenceBatchSidecarV1({
      serialization: entry.serialization,
    });
    const sidecar = assertMediaProxyMasterCorrespondenceBatchSidecarV1(entry.sidecar);
    if (canonicalizeEditronJsonV1(sidecar)
      !== canonicalizeEditronJsonV1(expectedSidecar)) {
      fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_BATCH_SIDECAR_MISMATCH');
    }
    batches.push(sidecar);
    return { spans: batch.spans, firstSpanOrdinal: batch.firstSpanOrdinal };
  });

  const coverage = validatePayloadCoverage(payloads, basis);
  const index = assertMediaProxyMasterCorrespondenceIndexV1({
    schemaVersion: 1,
    kind: MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_KIND_V1,
    basis,
    basisSha256,
    resourcePolicy,
    batches,
    totalSpanCount: coverage.totalSpanCount,
    mappedProxyFrameCount: coverage.mappedProxyFrameCount,
    mappedMasterFrameCount: coverage.mappedMasterFrameCount,
    canonicalEndExclusiveTime: coverage.canonicalEndExclusiveTime,
  });
  const canonicalJson = canonicalizeEditronJsonV1(index);
  const byteLength = Buffer.byteLength(canonicalJson, 'utf8');
  if (byteLength > resourcePolicy.maxCanonicalJsonBytes) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_BYTE_LIMIT_EXCEEDED');
  }
  return frozen({
    index,
    canonicalJson,
    byteLength,
    contentSha256: digest(canonicalJson),
  });
}

export function parseMediaProxyMasterCorrespondenceIndexV1(
  canonicalJson: string,
): MediaProxyMasterCorrespondenceIndexV1 {
  if (typeof canonicalJson !== 'string'
    || Buffer.byteLength(canonicalJson, 'utf8')
      > MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_ABSOLUTE_MAX_BYTES_V1) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_INPUT_TOO_LARGE');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(canonicalJson);
  } catch {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_JSON_INVALID');
  }
  const index = assertMediaProxyMasterCorrespondenceIndexV1(parsed);
  if (canonicalizeEditronJsonV1(index) !== canonicalJson) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_JSON_NON_CANONICAL');
  }
  if (Buffer.byteLength(canonicalJson, 'utf8')
    > index.resourcePolicy.maxCanonicalJsonBytes) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_BYTE_LIMIT_EXCEEDED');
  }
  return index;
}

export function assertMediaProxyMasterCorrespondenceIndexV1(
  value: unknown,
): MediaProxyMasterCorrespondenceIndexV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_INVALID');
  exactKeys(record, [
    'schemaVersion', 'kind', 'basis', 'basisSha256', 'resourcePolicy',
    'batches', 'totalSpanCount', 'mappedProxyFrameCount',
    'mappedMasterFrameCount', 'canonicalEndExclusiveTime',
  ], 'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_KIND_V1) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_HEADER_INVALID');
  }
  const basis = assertMediaProxyMasterCorrespondenceBasisV1(record.basis);
  const basisSha256 = sha256(
    record.basisSha256,
    'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_BASIS_HASH_INVALID',
  );
  if (basisSha256 !== hashEditronCanonicalJsonV1(basis)) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_BASIS_HASH_MISMATCH');
  }
  const resourcePolicy = assertMediaProxyMasterCorrespondenceIndexResourcePolicyV1(
    record.resourcePolicy,
  );
  if (!Array.isArray(record.batches) || record.batches.length === 0
    || record.batches.length > resourcePolicy.maxBatchEntries) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_BATCH_COUNT_INVALID');
  }
  const batches = record.batches.map((entry, batchSequence) => {
    const sidecar = assertMediaProxyMasterCorrespondenceBatchSidecarV1(entry);
    if (sidecar.batchSequence !== batchSequence
      || sidecar.basisSha256 !== basisSha256) {
      fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_BATCH_SCOPE_MISMATCH');
    }
    return sidecar;
  });
  const coverage = validateSidecarCoverage(batches, basis);
  const totalSpanCount = positiveIntegerText(
    record.totalSpanCount,
    'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_SPAN_COUNT_INVALID',
  );
  const mappedProxyFrameCount = positiveIntegerText(
    record.mappedProxyFrameCount,
    'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_PROXY_COUNT_INVALID',
  );
  const mappedMasterFrameCount = positiveIntegerText(
    record.mappedMasterFrameCount,
    'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_MASTER_COUNT_INVALID',
  );
  const canonicalEndExclusiveTime = parseCanonicalMediaTimeV1(
    record.canonicalEndExclusiveTime,
  );
  if (totalSpanCount !== coverage.totalSpanCount
    || mappedProxyFrameCount !== coverage.mappedProxyFrameCount
    || mappedMasterFrameCount !== coverage.mappedMasterFrameCount
    || mappedProxyFrameCount !== basis.proxyTimeMap.totalFrameCount
    || mappedMasterFrameCount !== basis.masterTimeMap.totalFrameCount
    || compareCanonicalMediaTimeV1(
      canonicalEndExclusiveTime,
      coverage.canonicalEndExclusiveTime,
    ) !== 0) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_COVERAGE_MISMATCH');
  }
  return frozen({
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_KIND_V1,
    basis,
    basisSha256,
    resourcePolicy,
    batches,
    totalSpanCount,
    mappedProxyFrameCount,
    mappedMasterFrameCount,
    canonicalEndExclusiveTime,
  });
}

export function createMediaProxyMasterCorrespondenceIndexReferenceV1(input: Readonly<{
  serialization: MediaProxyMasterCorrespondenceIndexSerializationV1;
}>): MediaProxyMasterCorrespondenceIndexReferenceV1 {
  const index = assertMediaProxyMasterCorrespondenceIndexV1(input.serialization.index);
  const canonicalJson = canonicalizeEditronJsonV1(index);
  const byteLength = Buffer.byteLength(canonicalJson, 'utf8');
  const contentSha256 = digest(canonicalJson);
  if (input.serialization.canonicalJson !== canonicalJson
    || input.serialization.byteLength !== byteLength
    || input.serialization.contentSha256 !== contentSha256) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_SERIALIZATION_MISMATCH');
  }
  return assertMediaProxyMasterCorrespondenceIndexReferenceV1({
    schemaVersion: 1,
    kind: MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_KIND_V1,
    storage: 'R2_PRIVATE',
    objectKey: expectedMediaProxyMasterCorrespondenceIndexObjectKeyV1(
      index.basisSha256,
      contentSha256,
    ),
    byteLength,
    contentSha256,
    batchCount: index.batches.length,
    mappedProxyFrameCount: index.mappedProxyFrameCount,
    mappedMasterFrameCount: index.mappedMasterFrameCount,
  });
}

export function assertMediaProxyMasterCorrespondenceIndexReferenceV1(
  value: unknown,
): MediaProxyMasterCorrespondenceIndexReferenceV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_REFERENCE_INVALID');
  exactKeys(record, [
    'schemaVersion', 'kind', 'storage', 'objectKey', 'byteLength',
    'contentSha256', 'batchCount', 'mappedProxyFrameCount',
    'mappedMasterFrameCount',
  ], 'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_REFERENCE_FIELDS_INVALID');
  const contentSha256 = sha256(
    record.contentSha256,
    'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_REFERENCE_HASH_INVALID',
  );
  const objectKey = text(
    record.objectKey,
    'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_REFERENCE_KEY_INVALID',
    1024,
  );
  const match = /^private\/editron\/media-proxy-master-correspondence\/([a-f0-9]{64})\/indexes\/([a-f0-9]{64})\.json$/.exec(objectKey);
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_KIND_V1
    || record.storage !== 'R2_PRIVATE'
    || !match || match[2] !== contentSha256) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_REFERENCE_SCOPE_INVALID');
  }
  return frozen({
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_KIND_V1,
    storage: 'R2_PRIVATE' as const,
    objectKey,
    byteLength: positiveSafeInteger(
      record.byteLength,
      MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_ABSOLUTE_MAX_BYTES_V1,
      'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_REFERENCE_SIZE_INVALID',
    ),
    contentSha256,
    batchCount: positiveSafeInteger(
      record.batchCount,
      MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_ABSOLUTE_MAX_BATCHES_V1,
      'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_REFERENCE_BATCH_COUNT_INVALID',
    ),
    mappedProxyFrameCount: positiveIntegerText(
      record.mappedProxyFrameCount,
      'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_REFERENCE_PROXY_COUNT_INVALID',
    ),
    mappedMasterFrameCount: positiveIntegerText(
      record.mappedMasterFrameCount,
      'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_REFERENCE_MASTER_COUNT_INVALID',
    ),
  });
}

export function assertMediaProxyMasterCorrespondenceIndexResourcePolicyV1(
  value: unknown,
): MediaProxyMasterCorrespondenceIndexResourcePolicyV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_POLICY_INVALID');
  exactKeys(record, [
    'policyVersion', 'requiredBatchPolicyVersion', 'maxCanonicalJsonBytes',
    'maxBatchEntries',
  ], 'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_POLICY_FIELDS_INVALID');
  return frozen({
    policyVersion: text(
      record.policyVersion,
      'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_POLICY_VERSION_INVALID',
    ),
    requiredBatchPolicyVersion: text(
      record.requiredBatchPolicyVersion,
      'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_BATCH_POLICY_VERSION_INVALID',
    ),
    maxCanonicalJsonBytes: positiveSafeInteger(
      record.maxCanonicalJsonBytes,
      MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_ABSOLUTE_MAX_BYTES_V1,
      'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_POLICY_BYTES_INVALID',
    ),
    maxBatchEntries: positiveSafeInteger(
      record.maxBatchEntries,
      MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_ABSOLUTE_MAX_BATCHES_V1,
      'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_POLICY_BATCHES_INVALID',
    ),
  });
}

export function expectedMediaProxyMasterCorrespondenceIndexObjectKeyV1(
  basisSha256: string,
  contentSha256: string,
): string {
  return `${PRIVATE_CORRESPONDENCE_PREFIX}${sha256(basisSha256, 'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_KEY_BASIS_INVALID')}/indexes/${sha256(contentSha256, 'MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_KEY_HASH_INVALID')}.json`;
}

type CoverageV1 = Readonly<{
  totalSpanCount: string;
  mappedProxyFrameCount: string;
  mappedMasterFrameCount: string;
  canonicalEndExclusiveTime: CanonicalMediaTimeV1;
}>;

function validatePayloadCoverage(
  payloads: readonly Readonly<{
    spans: readonly MediaProxyMasterFrameCorrespondenceSpanV1[];
    firstSpanOrdinal: string;
  }>[],
  basis: MediaProxyMasterCorrespondenceBasisV1,
): CoverageV1 {
  let spanCursor = BigInt(0);
  let canonicalCursor = parseCanonicalMediaTimeV1({ ticks: '0', timescale: '1' });
  let previous: MediaProxyMasterFrameCorrespondenceSpanV1 | null = null;
  for (const payload of payloads) {
    if (BigInt(payload.firstSpanOrdinal) !== spanCursor) {
      fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_SPAN_SEQUENCE_INVALID');
    }
    for (const span of payload.spans) {
      if (BigInt(span.spanOrdinal) !== spanCursor
        || compareCanonicalMediaTimeV1(span.canonicalStartTime, canonicalCursor) !== 0) {
        fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_CANONICAL_OR_SPAN_GAP');
      }
      if (previous) assertCrossBatchStep(previous, span);
      spanCursor += BigInt(1);
      canonicalCursor = span.canonicalEndExclusiveTime;
      previous = span;
    }
  }
  if (!previous) fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_BATCH_COUNT_INVALID');
  return coverageFromTerminal(
    spanCursor,
    previous.proxyFrameOrdinal,
    previous.masterFrameOrdinal,
    canonicalCursor,
    basis,
  );
}

function validateSidecarCoverage(
  batches: readonly MediaProxyMasterCorrespondenceBatchSidecarV1[],
  basis: MediaProxyMasterCorrespondenceBasisV1,
): CoverageV1 {
  let spanCursor = BigInt(0);
  let canonicalCursor = parseCanonicalMediaTimeV1({ ticks: '0', timescale: '1' });
  let previous: MediaProxyMasterCorrespondenceBatchSidecarV1 | null = null;
  for (const batch of batches) {
    if (BigInt(batch.firstSpanOrdinal) !== spanCursor
      || compareCanonicalMediaTimeV1(batch.canonicalStartTime, canonicalCursor) !== 0
      || (previous === null
        && (batch.firstProxyFrameOrdinal !== '0'
          || batch.firstMasterFrameOrdinal !== '0'))) {
      fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_CANONICAL_OR_SPAN_GAP');
    }
    if (previous) {
      const proxyStep = BigInt(batch.firstProxyFrameOrdinal)
        - BigInt(previous.lastProxyFrameOrdinal);
      const masterStep = BigInt(batch.firstMasterFrameOrdinal)
        - BigInt(previous.lastMasterFrameOrdinal);
      assertStep(proxyStep, masterStep);
    }
    spanCursor += BigInt(batch.spanCount);
    canonicalCursor = batch.canonicalEndExclusiveTime;
    previous = batch;
  }
  if (!previous) fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_BATCH_COUNT_INVALID');
  return coverageFromTerminal(
    spanCursor,
    previous.lastProxyFrameOrdinal,
    previous.lastMasterFrameOrdinal,
    canonicalCursor,
    basis,
  );
}

function coverageFromTerminal(
  totalSpanCount: bigint,
  lastProxyFrameOrdinal: string,
  lastMasterFrameOrdinal: string,
  canonicalEndExclusiveTime: CanonicalMediaTimeV1,
  basis: MediaProxyMasterCorrespondenceBasisV1,
): CoverageV1 {
  const mappedProxyFrameCount = (BigInt(lastProxyFrameOrdinal) + BigInt(1)).toString();
  const mappedMasterFrameCount = (BigInt(lastMasterFrameOrdinal) + BigInt(1)).toString();
  if (mappedProxyFrameCount !== basis.proxyTimeMap.totalFrameCount
    || mappedMasterFrameCount !== basis.masterTimeMap.totalFrameCount) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_FULL_FRAME_COVERAGE_MISMATCH');
  }
  return frozen({
    totalSpanCount: totalSpanCount.toString(),
    mappedProxyFrameCount,
    mappedMasterFrameCount,
    canonicalEndExclusiveTime,
  });
}

function assertCrossBatchStep(
  previous: MediaProxyMasterFrameCorrespondenceSpanV1,
  current: MediaProxyMasterFrameCorrespondenceSpanV1,
): void {
  const proxyStep = BigInt(current.proxyFrameOrdinal) - BigInt(previous.proxyFrameOrdinal);
  const masterStep = BigInt(current.masterFrameOrdinal) - BigInt(previous.masterFrameOrdinal);
  assertStep(proxyStep, masterStep);
}

function assertStep(proxyStep: bigint, masterStep: bigint): void {
  if ((proxyStep !== BigInt(0) && proxyStep !== BigInt(1))
    || (masterStep !== BigInt(0) && masterStep !== BigInt(1))) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_FRAME_STEP_INVALID');
  }
  if (proxyStep === BigInt(0) && masterStep === BigInt(0)) {
    fail('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_REDUNDANT_SPAN');
  }
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

function positiveIntegerText(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,127}$/.test(value)) fail(error);
  return value;
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
