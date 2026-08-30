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
  assertMediaProxyMasterActiveMappingV1,
  type MediaProxyMasterActiveMappingAssetStateV1,
} from './media-proxy-master-active-mapping-asset-owner-v1';
import type {
  MediaProxyMasterCorrespondenceArtifactReaderV1,
} from './media-proxy-master-correspondence-artifact-verifier-v1';
import {
  createMediaProxyMasterCorrespondenceBatchSidecarV1,
  expectedMediaProxyMasterCorrespondenceBatchObjectKeyV1,
  parseMediaProxyMasterCorrespondenceBatchV1,
  type MediaProxyMasterCorrespondenceBatchV1,
  type MediaProxyMasterCorrespondenceBatchSidecarV1,
  type MediaProxyMasterFrameCorrespondenceSpanV1,
} from './media-proxy-master-correspondence-batch-v1';
import {
  createMediaProxyMasterCorrespondenceIndexReferenceV1,
  parseMediaProxyMasterCorrespondenceIndexV1,
  type MediaProxyMasterCorrespondenceIndexV1,
} from './media-proxy-master-correspondence-index-v1';

export const MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RESOLUTION_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RESOLUTION_V1' as const;
export const MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RESOLVER_VERSION_V1 =
  'editron-media-proxy-master-exact-boundary-resolver-v1' as const;

const MAX_BOUNDARY_QUERIES = 100_000;
const MAX_BATCH_READS = 100_000;
const MAX_TOTAL_ARTIFACT_BYTES = 16 * 1024 * 1024 * 1024;

type StoredObjectReferenceV1 = Readonly<{
  objectKey: string;
  byteLength: number;
  contentSha256: string;
}>;

type StoredObjectV1 = Readonly<{
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>;

export type MediaProxyMasterExactBoundaryResolutionPolicyV1 = Readonly<{
  policyVersion: string;
  maxBoundaryQueries: number;
  maxBatchReads: number;
  maxTotalArtifactBytes: number;
}>;

export type MediaProxyMasterExactBoundaryResolutionV1 = Readonly<{
  proxyBoundaryOrdinal: string;
  masterBoundaryOrdinal: string;
  canonicalTime: CanonicalMediaTimeV1;
  evidenceBatchSequences: readonly number[];
}>;

export type MediaProxyMasterExactBoundaryResolutionReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RESOLUTION_KIND_V1;
  disposition: 'EXACT_PROXY_BOUNDARIES_RESOLVED';
  resolverVersion:
    typeof MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RESOLVER_VERSION_V1;
  relationSha256: string;
  activeMappingStateSha256: string;
  qualificationSha256: string;
  mappingSha256: string;
  indexReference: Readonly<{
    schemaVersion: 1;
    kind: 'EDITRON_MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_V1';
    storage: 'R2_PRIVATE';
    objectKey: string;
    byteLength: number;
    contentSha256: string;
    batchCount: number;
    mappedProxyFrameCount: string;
    mappedMasterFrameCount: string;
  }>;
  resolutionPolicy: MediaProxyMasterExactBoundaryResolutionPolicyV1;
  requestedProxyBoundaryOrdinals: readonly string[];
  resolvedBoundaries:
    readonly MediaProxyMasterExactBoundaryResolutionV1[];
  selectedBatches: readonly Readonly<{
    batchSequence: number;
    objectKey: string;
    byteLength: number;
    contentSha256: string;
  }>[];
  totalArtifactBytes: number;
  resolvedAt: string;
  resolutionSha256: string;
}>;

export type MediaProxyMasterExactBoundaryResolutionUnverifiableReasonV1 =
  | 'REQUEST_INVALID'
  | 'ACTIVE_MAPPING_INVALID'
  | 'RESOLUTION_TIME_INCONSISTENT'
  | 'RESOURCE_LIMIT_EXCEEDED'
  | 'INDEX_STORED_OBJECT_INVALID'
  | 'INDEX_BYTE_LENGTH_MISMATCH'
  | 'INDEX_CONTENT_HASH_MISMATCH'
  | 'INDEX_PAYLOAD_INVALID'
  | 'INDEX_REFERENCE_MISMATCH'
  | 'INDEX_MAPPING_SCOPE_MISMATCH'
  | 'BATCH_STORED_OBJECT_INVALID'
  | 'BATCH_BYTE_LENGTH_MISMATCH'
  | 'BATCH_CONTENT_HASH_MISMATCH'
  | 'BATCH_PAYLOAD_INVALID'
  | 'BATCH_SIDECAR_MISMATCH'
  | 'BATCH_MAPPING_SCOPE_MISMATCH'
  | 'PROXY_BOUNDARY_NOT_EXACT'
  | 'PROXY_BOUNDARY_RESOLUTION_MISMATCH';

export type MediaProxyMasterExactBoundaryResolutionUnavailableV1 = Readonly<{
  disposition: 'UNAVAILABLE';
  reason: 'INDEX_READ_FAILED' | 'BATCH_READ_FAILED';
  retryable: true;
  failedObjectKey: string;
  failedBatchSequence: number | null;
  diagnostic: string | null;
}>;

export type MediaProxyMasterExactBoundaryResolutionUnverifiableV1 = Readonly<{
  disposition: 'UNVERIFIABLE';
  reason: MediaProxyMasterExactBoundaryResolutionUnverifiableReasonV1;
  failedObjectKey: string | null;
  failedBatchSequence: number | null;
  failedProxyBoundaryOrdinal: string | null;
  diagnostic: string | null;
}>;

export type MediaProxyMasterExactBoundaryResolutionResultV1 = Readonly<
  | MediaProxyMasterExactBoundaryResolutionReceiptV1
  | MediaProxyMasterExactBoundaryResolutionUnavailableV1
  | MediaProxyMasterExactBoundaryResolutionUnverifiableV1
>;

/**
 * Resolves proxy frame boundaries only when the authenticated correspondence
 * proves that the same canonical instant is also a master frame boundary.
 * It never derives an answer from nominal FPS or rounds into a master frame.
 */
export async function resolveMediaProxyMasterExactBoundariesV1(input: Readonly<{
  activeMappingState: MediaProxyMasterActiveMappingAssetStateV1;
  proxyBoundaryOrdinals: readonly string[];
  resolutionPolicy: MediaProxyMasterExactBoundaryResolutionPolicyV1;
  reader: MediaProxyMasterCorrespondenceArtifactReaderV1;
  resolvedAt: Date;
}>): Promise<MediaProxyMasterExactBoundaryResolutionResultV1> {
  let activeState: MediaProxyMasterActiveMappingAssetStateV1;
  try {
    activeState = assertActiveMappingState(input.activeMappingState);
  } catch (error) {
    return unverifiable(
      'ACTIVE_MAPPING_INVALID', null, null, null, error,
    );
  }

  const active = activeState.proxyMasterActiveMappingV1;
  const mapping = active.qualification.mapping;
  let policy: MediaProxyMasterExactBoundaryResolutionPolicyV1;
  let boundaries: readonly string[];
  let resolvedAt: string;
  try {
    policy = assertMediaProxyMasterExactBoundaryResolutionPolicyV1(
      input.resolutionPolicy,
    );
    boundaries = normalizeBoundaryOrdinals(
      input.proxyBoundaryOrdinals,
      policy.maxBoundaryQueries,
      mapping.proxyTimeMap.totalFrameCount,
    );
    resolvedAt = isoDate(
      input.resolvedAt,
      'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RESOLUTION_TIME_INVALID',
    );
    if (!input.reader || typeof input.reader.read !== 'function') {
      fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_READER_INVALID');
    }
  } catch (error) {
    return unverifiable('REQUEST_INVALID', null, null, null, error);
  }
  if (Date.parse(resolvedAt) < Date.parse(active.activatedAt)) {
    return unverifiable(
      'RESOLUTION_TIME_INCONSISTENT', null, null, null, null,
    );
  }

  const indexReference = mapping.frameCorrespondenceIndex;
  if (indexReference.byteLength > policy.maxTotalArtifactBytes) {
    return unverifiable(
      'RESOURCE_LIMIT_EXCEEDED', indexReference.objectKey, null, null, null,
    );
  }
  const storedIndex = await readExactStoredObject({
    reader: input.reader,
    reference: indexReference,
    family: 'INDEX',
    batchSequence: null,
  });
  if (storedIndex.disposition !== 'VERIFIED') return storedIndex;

  let index: MediaProxyMasterCorrespondenceIndexV1;
  try {
    index = parseMediaProxyMasterCorrespondenceIndexV1(
      storedIndex.object.canonicalJson,
    );
  } catch (error) {
    return unverifiable(
      'INDEX_PAYLOAD_INVALID', indexReference.objectKey, null, null, error,
    );
  }
  try {
    const rebuiltReference =
      createMediaProxyMasterCorrespondenceIndexReferenceV1({
        serialization: {
          index,
          canonicalJson: storedIndex.object.canonicalJson,
          byteLength: storedIndex.object.byteLength,
          contentSha256: storedIndex.object.contentSha256,
        },
      });
    if (canonicalizeEditronJsonV1(rebuiltReference)
      !== canonicalizeEditronJsonV1(indexReference)) {
      fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_INDEX_REFERENCE_MISMATCH');
    }
  } catch (error) {
    return unverifiable(
      'INDEX_REFERENCE_MISMATCH', indexReference.objectKey, null, null, error,
    );
  }

  const expectedBasis = {
    relationSha256: active.relationSha256,
    proxyTimeMap: mapping.proxyTimeMap,
    masterTimeMap: mapping.masterTimeMap,
  };
  if (canonicalizeEditronJsonV1(index.basis)
    !== canonicalizeEditronJsonV1(expectedBasis)) {
    return unverifiable(
      'INDEX_MAPPING_SCOPE_MISMATCH', indexReference.objectKey, null, null, null,
    );
  }

  let selectedBatchSequences: readonly number[];
  try {
    selectedBatchSequences = selectBatchSequences(index, boundaries);
  } catch (error) {
    return unverifiable(
      'PROXY_BOUNDARY_RESOLUTION_MISMATCH',
      indexReference.objectKey,
      null,
      null,
      error,
    );
  }
  const selectedBatchBytes = selectedBatchSequences.reduce(
    (total, sequence) => total + index.batches[sequence]!.byteLength,
    indexReference.byteLength,
  );
  if (selectedBatchSequences.length > policy.maxBatchReads
    || selectedBatchBytes > policy.maxTotalArtifactBytes) {
    return unverifiable(
      'RESOURCE_LIMIT_EXCEEDED', indexReference.objectKey, null, null, null,
    );
  }

  const batches = new Map<number, MediaProxyMasterCorrespondenceBatchV1>();
  for (const sequence of selectedBatchSequences) {
    const sidecar = index.batches[sequence]!;
    const storedBatch = await readExactStoredObject({
      reader: input.reader,
      reference: sidecar,
      family: 'BATCH',
      batchSequence: sequence,
    });
    if (storedBatch.disposition !== 'VERIFIED') return storedBatch;

    let batch: MediaProxyMasterCorrespondenceBatchV1;
    try {
      batch = parseMediaProxyMasterCorrespondenceBatchV1(
        storedBatch.object.canonicalJson,
      );
    } catch (error) {
      return unverifiable(
        'BATCH_PAYLOAD_INVALID', sidecar.objectKey, sequence, null, error,
      );
    }
    let rebuiltSidecar: MediaProxyMasterCorrespondenceBatchSidecarV1;
    try {
      rebuiltSidecar = createMediaProxyMasterCorrespondenceBatchSidecarV1({
        serialization: {
          batch,
          canonicalJson: storedBatch.object.canonicalJson,
          byteLength: storedBatch.object.byteLength,
          contentSha256: storedBatch.object.contentSha256,
        },
      });
    } catch (error) {
      return unverifiable(
        'BATCH_SIDECAR_MISMATCH', sidecar.objectKey, sequence, null, error,
      );
    }
    if (canonicalizeEditronJsonV1(rebuiltSidecar)
      !== canonicalizeEditronJsonV1(sidecar)) {
      return unverifiable(
        'BATCH_SIDECAR_MISMATCH', sidecar.objectKey, sequence, null, null,
      );
    }
    if (canonicalizeEditronJsonV1(batch.basis)
        !== canonicalizeEditronJsonV1(index.basis)
      || batch.batchSequence !== sequence) {
      return unverifiable(
        'BATCH_MAPPING_SCOPE_MISMATCH', sidecar.objectKey, sequence, null, null,
      );
    }
    batches.set(sequence, batch);
  }

  const resolvedBoundaries: MediaProxyMasterExactBoundaryResolutionV1[] = [];
  for (const boundary of boundaries) {
    const resolution = resolveBoundary({ index, batches, boundary });
    if (resolution.disposition === 'NOT_EXACT') {
      return unverifiable(
        'PROXY_BOUNDARY_NOT_EXACT',
        index.batches[resolution.failedBatchSequence]?.objectKey ?? null,
        resolution.failedBatchSequence,
        boundary,
        null,
      );
    }
    if (resolution.disposition === 'INVALID') {
      return unverifiable(
        'PROXY_BOUNDARY_RESOLUTION_MISMATCH',
        index.batches[resolution.failedBatchSequence]?.objectKey ?? null,
        resolution.failedBatchSequence,
        boundary,
        resolution.error,
      );
    }
    resolvedBoundaries.push(resolution.value);
  }

  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RESOLUTION_KIND_V1,
    disposition: 'EXACT_PROXY_BOUNDARIES_RESOLVED' as const,
    resolverVersion:
      MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RESOLVER_VERSION_V1,
    relationSha256: active.relationSha256,
    activeMappingStateSha256:
      activeState.proxyMasterActiveMappingStateSha256V1,
    qualificationSha256: active.qualification.qualificationSha256,
    mappingSha256: mapping.mappingSha256,
    indexReference,
    resolutionPolicy: policy,
    requestedProxyBoundaryOrdinals: boundaries,
    resolvedBoundaries,
    selectedBatches: selectedBatchSequences.map((sequence) => {
      const sidecar = index.batches[sequence]!;
      return {
        batchSequence: sequence,
        objectKey: sidecar.objectKey,
        byteLength: sidecar.byteLength,
        contentSha256: sidecar.contentSha256,
      };
    }),
    totalArtifactBytes: selectedBatchBytes,
    resolvedAt,
  };
  try {
    return assertMediaProxyMasterExactBoundaryResolutionReceiptV1(
      {
        ...material,
        resolutionSha256: hashEditronCanonicalJsonV1(material),
      },
      activeState,
    );
  } catch (error) {
    return unverifiable(
      'PROXY_BOUNDARY_RESOLUTION_MISMATCH', null, null, null, error,
    );
  }
}

export function assertMediaProxyMasterExactBoundaryResolutionReceiptV1(
  value: unknown,
  expectedActiveMappingState: MediaProxyMasterActiveMappingAssetStateV1,
): MediaProxyMasterExactBoundaryResolutionReceiptV1 {
  const activeState = assertActiveMappingState(expectedActiveMappingState);
  const active = activeState.proxyMasterActiveMappingV1;
  const mapping = active.qualification.mapping;
  const record = object(
    value,
    'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_INVALID',
  );
  exactKeys(record, [
    'schemaVersion', 'kind', 'disposition', 'resolverVersion',
    'relationSha256', 'activeMappingStateSha256', 'qualificationSha256',
    'mappingSha256', 'indexReference', 'resolutionPolicy',
    'requestedProxyBoundaryOrdinals', 'resolvedBoundaries',
    'selectedBatches', 'totalArtifactBytes', 'resolvedAt',
    'resolutionSha256',
  ], 'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RESOLUTION_KIND_V1
    || record.disposition !== 'EXACT_PROXY_BOUNDARIES_RESOLVED'
    || record.resolverVersion
      !== MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RESOLVER_VERSION_V1) {
    fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_IDENTITY_INVALID');
  }
  const policy = assertMediaProxyMasterExactBoundaryResolutionPolicyV1(
    record.resolutionPolicy,
  );
  const indexReference = mapping.frameCorrespondenceIndex;
  if (canonicalizeEditronJsonV1(record.indexReference)
    !== canonicalizeEditronJsonV1(indexReference)) {
    fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_INDEX_MISMATCH');
  }
  const requested = normalizeBoundaryOrdinals(
    record.requestedProxyBoundaryOrdinals,
    policy.maxBoundaryQueries,
    mapping.proxyTimeMap.totalFrameCount,
  );
  const selectedBatches = assertSelectedBatches(
    record.selectedBatches,
    policy,
    indexReference.batchCount,
    hashEditronCanonicalJsonV1({
      relationSha256: active.relationSha256,
      proxyTimeMap: mapping.proxyTimeMap,
      masterTimeMap: mapping.masterTimeMap,
    }),
  );
  const selectedSequences = new Set(
    selectedBatches.map((batch) => batch.batchSequence),
  );
  const resolvedBoundaries = assertResolvedBoundaries(
    record.resolvedBoundaries,
    requested,
    mapping.proxyTimeMap.totalFrameCount,
    mapping.masterTimeMap.totalFrameCount,
    mapping.canonicalEndExclusiveTime,
    selectedSequences,
  );
  const totalArtifactBytes = positiveSafeInteger(
    record.totalArtifactBytes,
    MAX_TOTAL_ARTIFACT_BYTES,
    'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_BYTES_INVALID',
  );
  const expectedArtifactBytes = selectedBatches.reduce(
    (total, batch) => total + batch.byteLength,
    indexReference.byteLength,
  );
  const resolvedAt = isoInstant(
    record.resolvedAt,
    'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_TIME_INVALID',
  );
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RESOLUTION_KIND_V1,
    disposition: 'EXACT_PROXY_BOUNDARIES_RESOLVED' as const,
    resolverVersion:
      MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RESOLVER_VERSION_V1,
    relationSha256: sha256(
      record.relationSha256,
      'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_RELATION_INVALID',
    ),
    activeMappingStateSha256: sha256(
      record.activeMappingStateSha256,
      'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_ACTIVE_STATE_INVALID',
    ),
    qualificationSha256: sha256(
      record.qualificationSha256,
      'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_QUALIFICATION_INVALID',
    ),
    mappingSha256: sha256(
      record.mappingSha256,
      'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_MAPPING_INVALID',
    ),
    indexReference,
    resolutionPolicy: policy,
    requestedProxyBoundaryOrdinals: requested,
    resolvedBoundaries,
    selectedBatches,
    totalArtifactBytes,
    resolvedAt,
  };
  if (material.relationSha256 !== active.relationSha256
    || material.activeMappingStateSha256
      !== activeState.proxyMasterActiveMappingStateSha256V1
    || material.qualificationSha256
      !== active.qualification.qualificationSha256
    || material.mappingSha256 !== mapping.mappingSha256
    || selectedBatches.length > policy.maxBatchReads
    || totalArtifactBytes !== expectedArtifactBytes
    || totalArtifactBytes > policy.maxTotalArtifactBytes
    || Date.parse(resolvedAt) < Date.parse(active.activatedAt)) {
    fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_SCOPE_MISMATCH');
  }
  const resolutionSha256 = sha256(
    record.resolutionSha256,
    'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_HASH_INVALID',
  );
  if (resolutionSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_HASH_MISMATCH');
  }
  return frozen({ ...material, resolutionSha256 });
}

export function assertMediaProxyMasterExactBoundaryResolutionPolicyV1(
  value: unknown,
): MediaProxyMasterExactBoundaryResolutionPolicyV1 {
  const record = object(
    value,
    'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_POLICY_INVALID',
  );
  exactKeys(record, [
    'policyVersion', 'maxBoundaryQueries', 'maxBatchReads',
    'maxTotalArtifactBytes',
  ], 'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_POLICY_FIELDS_INVALID');
  return frozen({
    policyVersion: text(
      record.policyVersion,
      'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_POLICY_VERSION_INVALID',
    ),
    maxBoundaryQueries: positiveSafeInteger(
      record.maxBoundaryQueries,
      MAX_BOUNDARY_QUERIES,
      'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_POLICY_QUERY_LIMIT_INVALID',
    ),
    maxBatchReads: positiveSafeInteger(
      record.maxBatchReads,
      MAX_BATCH_READS,
      'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_POLICY_BATCH_LIMIT_INVALID',
    ),
    maxTotalArtifactBytes: positiveSafeInteger(
      record.maxTotalArtifactBytes,
      MAX_TOTAL_ARTIFACT_BYTES,
      'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_POLICY_BYTE_LIMIT_INVALID',
    ),
  });
}

function assertActiveMappingState(
  value: unknown,
): MediaProxyMasterActiveMappingAssetStateV1 {
  const record = object(
    value,
    'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_ACTIVE_STATE_INVALID',
  );
  exactKeys(record, [
    'proxyMasterActiveMappingV1',
    'proxyMasterActiveMappingStateSha256V1',
  ], 'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_ACTIVE_STATE_FIELDS_INVALID');
  const active = assertMediaProxyMasterActiveMappingV1(
    record.proxyMasterActiveMappingV1,
  );
  const stateSha256 = sha256(
    record.proxyMasterActiveMappingStateSha256V1,
    'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_ACTIVE_STATE_HASH_INVALID',
  );
  if (stateSha256 !== active.activationSha256) {
    fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_ACTIVE_STATE_HASH_MISMATCH');
  }
  return frozen({
    proxyMasterActiveMappingV1: active,
    proxyMasterActiveMappingStateSha256V1: stateSha256,
  });
}

function normalizeBoundaryOrdinals(
  value: unknown,
  maxQueries: number,
  proxyFrameCount: string,
): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxQueries) {
    fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_QUERY_COUNT_INVALID');
  }
  let previous: bigint | null = null;
  const frameCount = BigInt(proxyFrameCount);
  return frozen(value.map((entry) => {
    const boundary = nonNegativeIntegerText(
      entry,
      'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_QUERY_ORDINAL_INVALID',
    );
    const ordinal = BigInt(boundary);
    if (ordinal > frameCount || (previous !== null && ordinal <= previous)) {
      fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_QUERY_ORDER_OR_RANGE_INVALID');
    }
    previous = ordinal;
    return boundary;
  }));
}

function selectBatchSequences(
  index: MediaProxyMasterCorrespondenceIndexV1,
  boundaries: readonly string[],
): readonly number[] {
  const selected = new Set<number>();
  const proxyFrameCount = BigInt(index.mappedProxyFrameCount);
  for (const boundaryText of boundaries) {
    const boundary = BigInt(boundaryText);
    if (boundary === BigInt(0)) {
      selected.add(0);
      continue;
    }
    if (boundary === proxyFrameCount) {
      selected.add(index.batches.length - 1);
      continue;
    }
    const sequence = firstBatchEndingAtOrAfterProxyBoundary(index, boundary);
    const sidecar = index.batches[sequence]!;
    if (BigInt(sidecar.firstProxyFrameOrdinal) > boundary) {
      fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_BATCH_SELECTION_GAP');
    }
    selected.add(sequence);
    if (BigInt(sidecar.firstProxyFrameOrdinal) === boundary && sequence > 0) {
      selected.add(sequence - 1);
    }
  }
  return frozen([...selected].sort((left, right) => left - right));
}

function firstBatchEndingAtOrAfterProxyBoundary(
  index: MediaProxyMasterCorrespondenceIndexV1,
  boundary: bigint,
): number {
  let low = 0;
  let high = index.batches.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    if (BigInt(index.batches[middle]!.lastProxyFrameOrdinal) >= boundary) {
      found = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  if (found < 0) {
    fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_BATCH_NOT_FOUND');
  }
  return found;
}

type BoundaryResolutionAttemptV1 = Readonly<
  | {
      disposition: 'RESOLVED';
      value: MediaProxyMasterExactBoundaryResolutionV1;
    }
  | { disposition: 'NOT_EXACT'; failedBatchSequence: number }
  | {
      disposition: 'INVALID';
      failedBatchSequence: number;
      error: Error;
    }
>;

function resolveBoundary(input: Readonly<{
  index: MediaProxyMasterCorrespondenceIndexV1;
  batches: ReadonlyMap<number, MediaProxyMasterCorrespondenceBatchV1>;
  boundary: string;
}>): BoundaryResolutionAttemptV1 {
  const proxyBoundary = BigInt(input.boundary);
  const proxyFrameCount = BigInt(input.index.mappedProxyFrameCount);
  try {
    if (proxyBoundary === BigInt(0)) {
      const first = requiredBatch(input.batches, 0).spans[0]!;
      if (first.proxyFrameOrdinal !== '0'
        || first.masterFrameOrdinal !== '0'
        || compareCanonicalMediaTimeV1(
          first.canonicalStartTime,
          parseCanonicalMediaTimeV1({ ticks: '0', timescale: '1' }),
        ) !== 0) {
        fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_INITIAL_MISMATCH');
      }
      return resolved(input.boundary, '0', first.canonicalStartTime, [0]);
    }
    if (proxyBoundary === proxyFrameCount) {
      const sequence = input.index.batches.length - 1;
      const last = requiredBatch(input.batches, sequence).spans.at(-1)!;
      if (BigInt(last.proxyFrameOrdinal) + BigInt(1) !== proxyFrameCount
        || BigInt(last.masterFrameOrdinal) + BigInt(1)
          !== BigInt(input.index.mappedMasterFrameCount)
        || compareCanonicalMediaTimeV1(
          last.canonicalEndExclusiveTime,
          input.index.canonicalEndExclusiveTime,
        ) !== 0) {
        fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_TERMINAL_MISMATCH');
      }
      return resolved(
        input.boundary,
        input.index.mappedMasterFrameCount,
        last.canonicalEndExclusiveTime,
        [sequence],
      );
    }

    const sequence = firstBatchEndingAtOrAfterProxyBoundary(
      input.index,
      proxyBoundary,
    );
    const batch = requiredBatch(input.batches, sequence);
    const currentIndex = batch.spans.findIndex(
      (span) => BigInt(span.proxyFrameOrdinal) === proxyBoundary,
    );
    if (currentIndex < 0) {
      fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_SPAN_NOT_FOUND');
    }
    const current = batch.spans[currentIndex]!;
    let previous: MediaProxyMasterFrameCorrespondenceSpanV1;
    let evidenceBatchSequences: readonly number[];
    if (currentIndex > 0) {
      previous = batch.spans[currentIndex - 1]!;
      evidenceBatchSequences = [sequence];
    } else {
      if (sequence === 0) {
        fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_PREDECESSOR_MISSING');
      }
      previous = requiredBatch(input.batches, sequence - 1).spans.at(-1)!;
      evidenceBatchSequences = [sequence - 1, sequence];
    }
    if (BigInt(previous.proxyFrameOrdinal) + BigInt(1) !== proxyBoundary
      || current.proxyFrameOrdinal !== input.boundary
      || compareCanonicalMediaTimeV1(
        previous.canonicalEndExclusiveTime,
        current.canonicalStartTime,
      ) !== 0) {
      fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_TRANSITION_MISMATCH');
    }
    const masterStep = BigInt(current.masterFrameOrdinal)
      - BigInt(previous.masterFrameOrdinal);
    if (masterStep === BigInt(0)) {
      return { disposition: 'NOT_EXACT', failedBatchSequence: sequence };
    }
    if (masterStep !== BigInt(1)) {
      fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_MASTER_STEP_INVALID');
    }
    return resolved(
      input.boundary,
      current.masterFrameOrdinal,
      current.canonicalStartTime,
      evidenceBatchSequences,
    );
  } catch (error) {
    return {
      disposition: 'INVALID',
      failedBatchSequence: boundaryBatchSequence(input.index, proxyBoundary),
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

function resolved(
  proxyBoundaryOrdinal: string,
  masterBoundaryOrdinal: string,
  canonicalTime: CanonicalMediaTimeV1,
  evidenceBatchSequences: readonly number[],
): BoundaryResolutionAttemptV1 {
  return {
    disposition: 'RESOLVED',
    value: frozen({
      proxyBoundaryOrdinal,
      masterBoundaryOrdinal,
      canonicalTime,
      evidenceBatchSequences,
    }),
  };
}

function boundaryBatchSequence(
  index: MediaProxyMasterCorrespondenceIndexV1,
  boundary: bigint,
): number {
  if (boundary === BigInt(0)) return 0;
  if (boundary === BigInt(index.mappedProxyFrameCount)) {
    return index.batches.length - 1;
  }
  try {
    return firstBatchEndingAtOrAfterProxyBoundary(index, boundary);
  } catch {
    return 0;
  }
}

function requiredBatch(
  batches: ReadonlyMap<number, MediaProxyMasterCorrespondenceBatchV1>,
  sequence: number,
): MediaProxyMasterCorrespondenceBatchV1 {
  const batch = batches.get(sequence);
  if (!batch) fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_BATCH_NOT_READ');
  return batch;
}

function assertSelectedBatches(
  value: unknown,
  policy: MediaProxyMasterExactBoundaryResolutionPolicyV1,
  indexBatchCount: number,
  basisSha256: string,
): MediaProxyMasterExactBoundaryResolutionReceiptV1['selectedBatches'] {
  if (!Array.isArray(value) || value.length === 0
    || value.length > policy.maxBatchReads) {
    fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_BATCHES_INVALID');
  }
  let previous = -1;
  return frozen(value.map((entry) => {
    const record = object(
      entry,
      'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_BATCH_INVALID',
    );
    exactKeys(record, [
      'batchSequence', 'objectKey', 'byteLength', 'contentSha256',
    ], 'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_BATCH_FIELDS_INVALID');
    const batchSequence = nonNegativeSafeInteger(
      record.batchSequence,
      MAX_BATCH_READS,
      'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_BATCH_SEQUENCE_INVALID',
    );
    const contentSha256 = sha256(
      record.contentSha256,
      'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_BATCH_HASH_INVALID',
    );
    const objectKey = text(
      record.objectKey,
      'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_BATCH_KEY_INVALID',
      1024,
    );
    if (batchSequence <= previous || batchSequence >= indexBatchCount
      || objectKey !== expectedMediaProxyMasterCorrespondenceBatchObjectKeyV1(
        basisSha256,
        batchSequence,
        contentSha256,
      )) {
      fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_BATCH_SCOPE_INVALID');
    }
    previous = batchSequence;
    return {
      batchSequence,
      objectKey,
      byteLength: positiveSafeInteger(
        record.byteLength,
        MAX_TOTAL_ARTIFACT_BYTES,
        'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_BATCH_BYTES_INVALID',
      ),
      contentSha256,
    };
  }));
}

function assertResolvedBoundaries(
  value: unknown,
  requested: readonly string[],
  proxyFrameCountText: string,
  masterFrameCountText: string,
  canonicalEndExclusiveTime: CanonicalMediaTimeV1,
  selectedBatchSequences: ReadonlySet<number>,
): MediaProxyMasterExactBoundaryResolutionReceiptV1['resolvedBoundaries'] {
  if (!Array.isArray(value) || value.length !== requested.length) {
    fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_RESULTS_INVALID');
  }
  const proxyFrameCount = BigInt(proxyFrameCountText);
  const masterFrameCount = BigInt(masterFrameCountText);
  return frozen(value.map((entry, index) => {
    const record = object(
      entry,
      'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_RESULT_INVALID',
    );
    exactKeys(record, [
      'proxyBoundaryOrdinal', 'masterBoundaryOrdinal', 'canonicalTime',
      'evidenceBatchSequences',
    ], 'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_RESULT_FIELDS_INVALID');
    const proxyBoundaryOrdinal = nonNegativeIntegerText(
      record.proxyBoundaryOrdinal,
      'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_PROXY_INVALID',
    );
    const masterBoundaryOrdinal = nonNegativeIntegerText(
      record.masterBoundaryOrdinal,
      'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_MASTER_INVALID',
    );
    const canonicalTime = parseCanonicalMediaTimeV1(record.canonicalTime);
    const evidenceBatchSequences = assertEvidenceBatchSequences(
      record.evidenceBatchSequences,
      selectedBatchSequences,
    );
    if (proxyBoundaryOrdinal !== requested[index]
      || BigInt(proxyBoundaryOrdinal) > proxyFrameCount
      || BigInt(masterBoundaryOrdinal) > masterFrameCount
      || (proxyBoundaryOrdinal === '0'
        && (masterBoundaryOrdinal !== '0'
          || compareCanonicalMediaTimeV1(
            canonicalTime,
            parseCanonicalMediaTimeV1({ ticks: '0', timescale: '1' }),
          ) !== 0))
      || (BigInt(proxyBoundaryOrdinal) === proxyFrameCount
        && (BigInt(masterBoundaryOrdinal) !== masterFrameCount
          || compareCanonicalMediaTimeV1(
            canonicalTime,
            canonicalEndExclusiveTime,
          ) !== 0))) {
      fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_RESULT_SCOPE_INVALID');
    }
    return {
      proxyBoundaryOrdinal,
      masterBoundaryOrdinal,
      canonicalTime,
      evidenceBatchSequences,
    };
  }));
}

function assertEvidenceBatchSequences(
  value: unknown,
  selected: ReadonlySet<number>,
): readonly number[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 2) {
    fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_EVIDENCE_INVALID');
  }
  let previous = -1;
  return frozen(value.map((entry) => {
    const sequence = nonNegativeSafeInteger(
      entry,
      MAX_BATCH_READS,
      'MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_EVIDENCE_SEQUENCE_INVALID',
    );
    if (sequence <= previous || !selected.has(sequence)) {
      fail('MEDIA_PROXY_MASTER_EXACT_BOUNDARY_RECEIPT_EVIDENCE_SCOPE_INVALID');
    }
    previous = sequence;
    return sequence;
  }));
}

type ExactStoredObjectReadV1 = Readonly<
  | { disposition: 'VERIFIED'; object: StoredObjectV1 }
  | MediaProxyMasterExactBoundaryResolutionUnavailableV1
  | MediaProxyMasterExactBoundaryResolutionUnverifiableV1
>;

async function readExactStoredObject(input: Readonly<{
  reader: MediaProxyMasterCorrespondenceArtifactReaderV1;
  reference: StoredObjectReferenceV1;
  family: 'INDEX' | 'BATCH';
  batchSequence: number | null;
}>): Promise<ExactStoredObjectReadV1> {
  let raw: unknown;
  try {
    raw = await input.reader.read(input.reference);
  } catch (error) {
    return unavailable(
      input.family === 'INDEX' ? 'INDEX_READ_FAILED' : 'BATCH_READ_FAILED',
      input.reference.objectKey,
      input.batchSequence,
      error,
    );
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return unverifiable(
      input.family === 'INDEX'
        ? 'INDEX_STORED_OBJECT_INVALID' : 'BATCH_STORED_OBJECT_INVALID',
      input.reference.objectKey,
      input.batchSequence,
      null,
      null,
    );
  }
  const stored = raw as Partial<StoredObjectV1>;
  if (typeof stored.canonicalJson !== 'string'
    || !Number.isSafeInteger(stored.byteLength)
    || (stored.byteLength ?? 0) <= 0
    || typeof stored.contentSha256 !== 'string') {
    return unverifiable(
      input.family === 'INDEX'
        ? 'INDEX_STORED_OBJECT_INVALID' : 'BATCH_STORED_OBJECT_INVALID',
      input.reference.objectKey,
      input.batchSequence,
      null,
      null,
    );
  }
  if (stored.byteLength !== Buffer.byteLength(stored.canonicalJson, 'utf8')
    || stored.byteLength !== input.reference.byteLength) {
    return unverifiable(
      input.family === 'INDEX'
        ? 'INDEX_BYTE_LENGTH_MISMATCH' : 'BATCH_BYTE_LENGTH_MISMATCH',
      input.reference.objectKey,
      input.batchSequence,
      null,
      null,
    );
  }
  if (stored.contentSha256 !== digest(stored.canonicalJson)
    || stored.contentSha256 !== input.reference.contentSha256) {
    return unverifiable(
      input.family === 'INDEX'
        ? 'INDEX_CONTENT_HASH_MISMATCH' : 'BATCH_CONTENT_HASH_MISMATCH',
      input.reference.objectKey,
      input.batchSequence,
      null,
      null,
    );
  }
  return {
    disposition: 'VERIFIED',
    object: {
      canonicalJson: stored.canonicalJson,
      byteLength: stored.byteLength,
      contentSha256: stored.contentSha256,
    },
  };
}

function unavailable(
  reason: 'INDEX_READ_FAILED' | 'BATCH_READ_FAILED',
  failedObjectKey: string,
  failedBatchSequence: number | null,
  error: unknown,
): MediaProxyMasterExactBoundaryResolutionUnavailableV1 {
  return frozen({
    disposition: 'UNAVAILABLE' as const,
    reason,
    retryable: true as const,
    failedObjectKey,
    failedBatchSequence,
    diagnostic: diagnostic(error),
  });
}

function unverifiable(
  reason: MediaProxyMasterExactBoundaryResolutionUnverifiableReasonV1,
  failedObjectKey: string | null,
  failedBatchSequence: number | null,
  failedProxyBoundaryOrdinal: string | null,
  error: unknown,
): MediaProxyMasterExactBoundaryResolutionUnverifiableV1 {
  return frozen({
    disposition: 'UNVERIFIABLE' as const,
    reason,
    failedObjectKey,
    failedBatchSequence,
    failedProxyBoundaryOrdinal,
    diagnostic: diagnostic(error),
  });
}

function object(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail(error);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  error: string,
): void {
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

function nonNegativeSafeInteger(
  value: unknown,
  max: number,
  error: string,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0
    || (value as number) > max) fail(error);
  return value as number;
}

function positiveSafeInteger(
  value: unknown,
  max: number,
  error: string,
): number {
  const parsed = nonNegativeSafeInteger(value, max, error);
  if (parsed === 0) fail(error);
  return parsed;
}

function nonNegativeIntegerText(value: unknown, error: string): string {
  if (typeof value !== 'string'
    || !/^(0|[1-9][0-9]{0,127})$/.test(value)) fail(error);
  return value;
}

function isoDate(value: unknown, error: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) fail(error);
  return value.toISOString();
}

function isoInstant(value: unknown, error: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value) fail(error);
  return value;
}

function diagnostic(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  const raw = error instanceof Error ? error.message : String(error);
  const normalized = raw.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return (normalized || 'UNSPECIFIED').slice(0, 512);
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
