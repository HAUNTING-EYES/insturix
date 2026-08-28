import { createHash } from 'node:crypto';

import {
  parseExactRationalRateV1,
  type ExactRationalRateV1,
  type PresentationEpochV1,
} from '../contracts/canonical-media-time-v1';

import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaSourcePtsCadenceBoundaryEvidenceSidecarV3,
  assertMediaSourcePtsCadenceEpochBoundaryV3,
  type MediaSourcePtsCadenceBoundaryEvidenceSidecarV3,
  type MediaSourcePtsCadenceEpochBoundaryBasisV3,
  type MediaSourcePtsCadenceEpochBoundaryV3,
} from './media-source-pts-cadence-epoch-boundary-v3';
import {
  parseMediaSourcePtsCadenceFrameBatchV2,
  type MediaSourcePtsCadenceFrameBatchPayloadV2,
} from './media-source-pts-cadence-frame-batch-v2';
import {
  createMediaSourcePtsCadenceFrameBatchSidecarV2,
  type MediaSourcePtsCadenceFrameBatchSidecarV2,
} from './media-source-pts-cadence-manifest-index-v2';
import {
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BATCHES_V3,
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_SIDECAR_KIND_V3,
  createMediaSourcePtsCadenceEpochIndexSidecarV3,
  expectedMediaSourcePtsCadenceEpochIndexObjectKeyV3,
  parseMediaSourcePtsCadenceEpochIndexV3,
  type MediaSourcePtsCadenceEpochIndexBatchEntryV3,
  type MediaSourcePtsCadenceEpochIndexSidecarV3,
  type MediaSourcePtsCadenceEpochIndexV3,
} from './media-source-pts-cadence-epoch-index-v3';

export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_ARTIFACT_VERIFIER_VERSION_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_EPOCH_ARTIFACT_VERIFIER_V3' as const;
export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_ARTIFACT_VERIFICATION_KIND_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_EPOCH_ARTIFACT_VERIFICATION_V3' as const;
export const MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_SEMANTIC_VERIFICATION_KIND_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_SEMANTIC_VERIFICATION_V3' as const;

const MAX_BOUNDARY_EVIDENCE_READS_V3 = 10_000;
const MAX_TOTAL_ARTIFACT_BYTES_V3 = 16 * 1024 * 1024 * 1024;

export type MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3 = Readonly<{
  policyVersion: string;
  maxBatchReads: number;
  maxBoundaryEvidenceReads: number;
  maxTotalArtifactBytes: number;
  boundaryEvidenceRegistryVersion: string;
}>;

export type MediaSourcePtsCadenceEpochArtifactExpectedSourceV3 = Readonly<{
  sourceVersionSha256: string;
  storageVersionSha256: string;
  sourceBindingSha256: string;
  technicalObservationSha256: string;
  mapBindingSha256: string;
  videoStreamIndex: number;
  sourceTimebase: ExactRationalRateV1;
}>;

type StoredObjectSidecarV3 = Readonly<{
  storage: 'R2_PRIVATE' | 'GCS_PRIVATE';
  objectKey: string;
  byteLength: number;
  contentSha256: string;
}>;

export type MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3 = Readonly<{
  read(sidecar: StoredObjectSidecarV3): Promise<Readonly<{
    canonicalJson: string;
    byteLength: number;
    contentSha256: string;
  }>>;
}>;

export type MediaSourcePtsCadenceBoundarySemanticVerificationReceiptV3 = Readonly<{
  schemaVersion: 3;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_SEMANTIC_VERIFICATION_KIND_V3;
  disposition: 'BOUNDARY_EVIDENCE_SEMANTICALLY_VERIFIED';
  registryVersion: string;
  verifierId: string;
  verifierVersion: string;
  evidenceContractVersion: string;
  mapBindingSha256: string;
  epochId: string;
  boundaryKind: PresentationEpochV1['boundaryKind'];
  classificationBasis: MediaSourcePtsCadenceEpochBoundaryBasisV3;
  detectorVersion: string;
  contentSha256: string;
  semanticVerificationSha256: string;
}>;

export type MediaSourcePtsCadenceBoundarySemanticVerifierV3 = Readonly<{
  verify(input: Readonly<{
    registryVersion: string;
    boundary: MediaSourcePtsCadenceEpochBoundaryV3;
    sidecar: MediaSourcePtsCadenceBoundaryEvidenceSidecarV3;
    canonicalJson: string;
    evidence: unknown;
  }>): Promise<
    | MediaSourcePtsCadenceBoundarySemanticVerificationReceiptV3
    | Readonly<{ disposition: 'UNVERIFIABLE'; reason: string }>
  >;
}>;

export type MediaSourcePtsCadenceEpochArtifactVerificationReceiptV3 = Readonly<{
  schemaVersion: 3;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_EPOCH_ARTIFACT_VERIFICATION_KIND_V3;
  disposition: 'EPOCH_ARTIFACT_SET_VERIFIED';
  verifierVersion: typeof MEDIA_SOURCE_PTS_CADENCE_EPOCH_ARTIFACT_VERIFIER_VERSION_V3;
  source: MediaSourcePtsCadenceEpochArtifactExpectedSourceV3;
  verificationPolicy: MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3;
  epochIndexSidecar: MediaSourcePtsCadenceEpochIndexSidecarV3;
  verifiedEpochCount: number;
  verifiedBatchCount: number;
  verifiedFrameCount: string;
  verifiedBoundaryEvidenceCount: number;
  totalArtifactBytes: number;
  observedCadence: Readonly<
    | { kind: 'UNIFORM_FRAME_DURATIONS'; durationTicks: string }
    | { kind: 'VARIABLE_FRAME_DURATIONS' }
  >;
  verifiedBatches: readonly Readonly<{
    batchSequence: number;
    epochId: string;
    byteLength: number;
    contentSha256: string;
    shardDescriptorSha256: string;
    frameCount: string;
  }>[];
  verifiedBoundaryEvidence: readonly Readonly<{
    epochId: string;
    boundaryKind: PresentationEpochV1['boundaryKind'];
    byteLength: number;
    contentSha256: string;
    semanticVerificationSha256: string;
  }>[];
  verificationSha256: string;
}>;

export type MediaSourcePtsCadenceEpochArtifactUnverifiableReasonV3 =
  | 'VERIFICATION_REQUEST_INVALID'
  | 'EPOCH_INDEX_READ_FAILED'
  | 'EPOCH_INDEX_STORED_OBJECT_INVALID'
  | 'EPOCH_INDEX_BYTE_LENGTH_MISMATCH'
  | 'EPOCH_INDEX_CONTENT_HASH_MISMATCH'
  | 'EPOCH_INDEX_PAYLOAD_INVALID'
  | 'EPOCH_INDEX_SIDECAR_MISMATCH'
  | 'SOURCE_SCOPE_MISMATCH'
  | 'RESOURCE_LIMIT_EXCEEDED'
  | 'BATCH_READ_FAILED'
  | 'BATCH_STORED_OBJECT_INVALID'
  | 'BATCH_BYTE_LENGTH_MISMATCH'
  | 'BATCH_CONTENT_HASH_MISMATCH'
  | 'BATCH_PAYLOAD_INVALID'
  | 'BATCH_INDEX_MISMATCH'
  | 'BOUNDARY_EVIDENCE_READ_FAILED'
  | 'BOUNDARY_EVIDENCE_STORED_OBJECT_INVALID'
  | 'BOUNDARY_EVIDENCE_BYTE_LENGTH_MISMATCH'
  | 'BOUNDARY_EVIDENCE_CONTENT_HASH_MISMATCH'
  | 'BOUNDARY_EVIDENCE_JSON_INVALID'
  | 'BOUNDARY_EVIDENCE_JSON_NON_CANONICAL'
  | 'BOUNDARY_EVIDENCE_SEMANTIC_UNVERIFIED'
  | 'BOUNDARY_EVIDENCE_SEMANTIC_RECEIPT_INVALID';

export type MediaSourcePtsCadenceEpochArtifactVerificationResultV3 =
  | MediaSourcePtsCadenceEpochArtifactVerificationReceiptV3
  | Readonly<{
      disposition: 'UNVERIFIABLE';
      reason: MediaSourcePtsCadenceEpochArtifactUnverifiableReasonV3;
      failedObjectKey: string | null;
      failedBatchSequence: number | null;
      failedEpochId: string | null;
      diagnostic: string | null;
    }>;

export function createMediaSourcePtsCadenceBoundarySemanticVerificationReceiptV3(input: {
  registryVersion: string;
  verifierId: string;
  verifierVersion: string;
  boundary: MediaSourcePtsCadenceEpochBoundaryV3;
  sidecar: MediaSourcePtsCadenceBoundaryEvidenceSidecarV3;
}): MediaSourcePtsCadenceBoundarySemanticVerificationReceiptV3 {
  const boundary = assertMediaSourcePtsCadenceEpochBoundaryV3(input.boundary);
  const sidecar = assertMediaSourcePtsCadenceBoundaryEvidenceSidecarV3(input.sidecar);
  if (boundary.externalEvidence === null
    || canonicalizeEditronJsonV1(boundary.externalEvidence) !== canonicalizeEditronJsonV1(sidecar)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_SEMANTIC_SIDECAR_MISMATCH');
  }
  const material = {
    schemaVersion: 3 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_SEMANTIC_VERIFICATION_KIND_V3,
    disposition: 'BOUNDARY_EVIDENCE_SEMANTICALLY_VERIFIED' as const,
    registryVersion: boundedText(input.registryVersion, 'BOUNDARY_SEMANTIC_REGISTRY_INVALID'),
    verifierId: identifier(input.verifierId, 'BOUNDARY_SEMANTIC_VERIFIER_ID_INVALID'),
    verifierVersion: boundedText(input.verifierVersion, 'BOUNDARY_SEMANTIC_VERIFIER_INVALID'),
    evidenceContractVersion: sidecar.evidenceContractVersion,
    mapBindingSha256: sidecar.mapBindingSha256,
    epochId: sidecar.epochId,
    boundaryKind: boundary.boundaryKind,
    classificationBasis: boundary.classificationBasis,
    detectorVersion: boundary.detectorVersion,
    contentSha256: sidecar.contentSha256,
  };
  return frozen({
    ...material,
    semanticVerificationSha256: hashEditronCanonicalJsonV1(material),
  });
}

export async function verifyMediaSourcePtsCadenceEpochArtifactsV3(input: {
  epochIndexSidecar: MediaSourcePtsCadenceEpochIndexSidecarV3;
  expectedSource: MediaSourcePtsCadenceEpochArtifactExpectedSourceV3;
  verificationPolicy: MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3;
  storedObjectReader: MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3;
  boundarySemanticVerifier: MediaSourcePtsCadenceBoundarySemanticVerifierV3;
}): Promise<MediaSourcePtsCadenceEpochArtifactVerificationResultV3> {
  let sidecar: MediaSourcePtsCadenceEpochIndexSidecarV3;
  let source: MediaSourcePtsCadenceEpochArtifactExpectedSourceV3;
  let policy: MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3;
  try {
    sidecar = assertMediaSourcePtsCadenceEpochIndexSidecarForVerificationV3(
      input.epochIndexSidecar,
    );
    source = normalizeMediaSourcePtsCadenceEpochArtifactExpectedSourceV3(input.expectedSource);
    policy = normalizeMediaSourcePtsCadenceEpochArtifactVerificationPolicyV3(
      input.verificationPolicy,
    );
    if (!input.storedObjectReader || typeof input.storedObjectReader.read !== 'function'
      || !input.boundarySemanticVerifier
      || typeof input.boundarySemanticVerifier.verify !== 'function') {
      throw new Error('VERIFIER_PORT_INVALID');
    }
  } catch (error) {
    return unverifiable('VERIFICATION_REQUEST_INVALID', null, null, null, error);
  }

  if (sidecar.sourceVersionSha256 !== source.sourceVersionSha256
    || sidecar.mapBindingSha256 !== source.mapBindingSha256) {
    return unverifiable('SOURCE_SCOPE_MISMATCH', sidecar.objectKey, null, null, null);
  }
  if (sidecar.batchCount > policy.maxBatchReads
    || sidecar.byteLength > policy.maxTotalArtifactBytes) {
    return unverifiable('RESOURCE_LIMIT_EXCEEDED', sidecar.objectKey, null, null, null);
  }

  const storedIndex = await readStoredObject(
    input.storedObjectReader,
    sidecar,
    'EPOCH_INDEX',
  );
  if (storedIndex.disposition === 'UNVERIFIABLE') return storedIndex.result;

  let index: MediaSourcePtsCadenceEpochIndexV3;
  try {
    index = parseMediaSourcePtsCadenceEpochIndexV3(storedIndex.object.canonicalJson);
  } catch (error) {
    return unverifiable('EPOCH_INDEX_PAYLOAD_INVALID', sidecar.objectKey, null, null, error);
  }
  const expectedIndexSidecar = createMediaSourcePtsCadenceEpochIndexSidecarV3({
    storage: sidecar.storage,
    serialization: {
      index,
      canonicalJson: storedIndex.object.canonicalJson,
      byteLength: storedIndex.object.byteLength,
      contentSha256: storedIndex.object.contentSha256,
    },
  });
  if (canonicalizeEditronJsonV1(expectedIndexSidecar) !== canonicalizeEditronJsonV1(sidecar)) {
    return unverifiable('EPOCH_INDEX_SIDECAR_MISMATCH', sidecar.objectKey, null, null, null);
  }
  if (!indexMatchesSource(index, source)) {
    return unverifiable('SOURCE_SCOPE_MISMATCH', sidecar.objectKey, null, null, null);
  }

  const evidenceEntries = index.epochs.filter(({ boundary }) => boundary.externalEvidence !== null);
  if (index.batches.length > policy.maxBatchReads
    || evidenceEntries.length > policy.maxBoundaryEvidenceReads) {
    return unverifiable('RESOURCE_LIMIT_EXCEEDED', sidecar.objectKey, null, null, null);
  }

  let totalArtifactBytes = sidecar.byteLength;
  let verifiedFrameCount = BigInt(0);
  let uniformDurationTicks: string | null = null;
  let variableDuration = false;
  const verifiedBatches: MediaSourcePtsCadenceEpochArtifactVerificationReceiptV3['verifiedBatches'][number][] = [];
  for (const entry of index.batches) {
    if (totalArtifactBytes + entry.sidecar.byteLength > policy.maxTotalArtifactBytes) {
      return unverifiable(
        'RESOURCE_LIMIT_EXCEEDED', entry.sidecar.objectKey, entry.batchSequence, entry.epochId, null,
      );
    }
    const storedBatch = await readStoredObject(
      input.storedObjectReader,
      entry.sidecar,
      'BATCH',
      entry.batchSequence,
      entry.epochId,
    );
    if (storedBatch.disposition === 'UNVERIFIABLE') return storedBatch.result;
    let payload: Readonly<MediaSourcePtsCadenceFrameBatchPayloadV2>;
    try {
      payload = parseMediaSourcePtsCadenceFrameBatchV2(storedBatch.object.canonicalJson);
    } catch (error) {
      return unverifiable(
        'BATCH_PAYLOAD_INVALID', entry.sidecar.objectKey, entry.batchSequence, entry.epochId, error,
      );
    }
    if (!batchMatchesIndexAndSource(payload, entry, source)
      || canonicalizeEditronJsonV1(createMediaSourcePtsCadenceFrameBatchSidecarV2({
        storage: entry.sidecar.storage,
        serialization: {
          payload,
          canonicalJson: storedBatch.object.canonicalJson,
          byteLength: storedBatch.object.byteLength,
          contentSha256: storedBatch.object.contentSha256,
        },
      })) !== canonicalizeEditronJsonV1(entry.sidecar)) {
      return unverifiable(
        'BATCH_INDEX_MISMATCH', entry.sidecar.objectKey, entry.batchSequence, entry.epochId, null,
      );
    }
    for (const frame of payload.frames) {
      if (uniformDurationTicks === null) uniformDurationTicks = frame.durationTicks;
      else if (frame.durationTicks !== uniformDurationTicks) variableDuration = true;
    }
    verifiedFrameCount += BigInt(payload.frames.length);
    totalArtifactBytes += storedBatch.object.byteLength;
    verifiedBatches.push({
      batchSequence: entry.batchSequence,
      epochId: entry.epochId,
      byteLength: storedBatch.object.byteLength,
      contentSha256: storedBatch.object.contentSha256,
      shardDescriptorSha256: entry.shardDescriptorSha256,
      frameCount: entry.frameCount,
    });
  }

  const verifiedBoundaryEvidence: MediaSourcePtsCadenceEpochArtifactVerificationReceiptV3['verifiedBoundaryEvidence'][number][] = [];
  for (const { epoch, boundary } of evidenceEntries) {
    const evidenceSidecar = boundary.externalEvidence!;
    if (totalArtifactBytes + evidenceSidecar.byteLength > policy.maxTotalArtifactBytes) {
      return unverifiable(
        'RESOURCE_LIMIT_EXCEEDED', evidenceSidecar.objectKey, null, epoch.epochId, null,
      );
    }
    const storedEvidence = await readStoredObject(
      input.storedObjectReader,
      evidenceSidecar,
      'BOUNDARY_EVIDENCE',
      null,
      epoch.epochId,
    );
    if (storedEvidence.disposition === 'UNVERIFIABLE') return storedEvidence.result;
    let evidence: unknown;
    try {
      evidence = JSON.parse(storedEvidence.object.canonicalJson);
    } catch (error) {
      return unverifiable(
        'BOUNDARY_EVIDENCE_JSON_INVALID', evidenceSidecar.objectKey, null, epoch.epochId, error,
      );
    }
    if (canonicalizeEditronJsonV1(evidence) !== storedEvidence.object.canonicalJson) {
      return unverifiable(
        'BOUNDARY_EVIDENCE_JSON_NON_CANONICAL', evidenceSidecar.objectKey, null, epoch.epochId, null,
      );
    }
    let semanticResult: Awaited<ReturnType<MediaSourcePtsCadenceBoundarySemanticVerifierV3['verify']>>;
    try {
      semanticResult = await input.boundarySemanticVerifier.verify({
        registryVersion: policy.boundaryEvidenceRegistryVersion,
        boundary,
        sidecar: evidenceSidecar,
        canonicalJson: storedEvidence.object.canonicalJson,
        evidence,
      });
    } catch (error) {
      return unverifiable(
        'BOUNDARY_EVIDENCE_SEMANTIC_UNVERIFIED',
        evidenceSidecar.objectKey,
        null,
        epoch.epochId,
        error,
      );
    }
    if (semanticResult.disposition === 'UNVERIFIABLE') {
      return unverifiable(
        'BOUNDARY_EVIDENCE_SEMANTIC_UNVERIFIED',
        evidenceSidecar.objectKey,
        null,
        epoch.epochId,
        semanticResult.reason,
      );
    }
    let semanticReceipt: MediaSourcePtsCadenceBoundarySemanticVerificationReceiptV3;
    try {
      semanticReceipt = assertMediaSourcePtsCadenceBoundarySemanticVerificationReceiptV3(
        semanticResult,
      );
      assertSemanticReceiptScope(
        semanticReceipt,
        policy.boundaryEvidenceRegistryVersion,
        boundary,
        evidenceSidecar,
      );
    } catch (error) {
      return unverifiable(
        'BOUNDARY_EVIDENCE_SEMANTIC_RECEIPT_INVALID',
        evidenceSidecar.objectKey,
        null,
        epoch.epochId,
        error,
      );
    }
    totalArtifactBytes += storedEvidence.object.byteLength;
    verifiedBoundaryEvidence.push({
      epochId: epoch.epochId,
      boundaryKind: boundary.boundaryKind,
      byteLength: storedEvidence.object.byteLength,
      contentSha256: storedEvidence.object.contentSha256,
      semanticVerificationSha256: semanticReceipt.semanticVerificationSha256,
    });
  }

  const material = {
    schemaVersion: 3 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_EPOCH_ARTIFACT_VERIFICATION_KIND_V3,
    disposition: 'EPOCH_ARTIFACT_SET_VERIFIED' as const,
    verifierVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_ARTIFACT_VERIFIER_VERSION_V3,
    source,
    verificationPolicy: policy,
    epochIndexSidecar: sidecar,
    verifiedEpochCount: index.epochs.length,
    verifiedBatchCount: verifiedBatches.length,
    verifiedFrameCount: verifiedFrameCount.toString(),
    verifiedBoundaryEvidenceCount: verifiedBoundaryEvidence.length,
    totalArtifactBytes,
    observedCadence: variableDuration
      ? { kind: 'VARIABLE_FRAME_DURATIONS' as const }
      : { kind: 'UNIFORM_FRAME_DURATIONS' as const, durationTicks: uniformDurationTicks! },
    verifiedBatches,
    verifiedBoundaryEvidence,
  };
  return assertMediaSourcePtsCadenceEpochArtifactVerificationReceiptV3({
    ...material,
    verificationSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function normalizeMediaSourcePtsCadenceEpochArtifactVerificationPolicyV3(
  value: unknown,
): MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3 {
  const record = objectRecord(value, 'EPOCH_ARTIFACT_POLICY_INVALID');
  exactKeys(record, [
    'boundaryEvidenceRegistryVersion', 'maxBatchReads', 'maxBoundaryEvidenceReads',
    'maxTotalArtifactBytes', 'policyVersion',
  ], 'EPOCH_ARTIFACT_POLICY_FIELDS_INVALID');
  return frozen({
    policyVersion: boundedText(record.policyVersion, 'EPOCH_ARTIFACT_POLICY_VERSION_INVALID'),
    maxBatchReads: positiveSafeIntegerInRange(
      record.maxBatchReads,
      MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BATCHES_V3,
      'EPOCH_ARTIFACT_POLICY_BATCH_READS_INVALID',
    ),
    maxBoundaryEvidenceReads: nonNegativeSafeIntegerInRange(
      record.maxBoundaryEvidenceReads,
      MAX_BOUNDARY_EVIDENCE_READS_V3,
      'EPOCH_ARTIFACT_POLICY_EVIDENCE_READS_INVALID',
    ),
    maxTotalArtifactBytes: positiveSafeIntegerInRange(
      record.maxTotalArtifactBytes,
      MAX_TOTAL_ARTIFACT_BYTES_V3,
      'EPOCH_ARTIFACT_POLICY_TOTAL_BYTES_INVALID',
    ),
    boundaryEvidenceRegistryVersion: boundedText(
      record.boundaryEvidenceRegistryVersion,
      'EPOCH_ARTIFACT_POLICY_REGISTRY_INVALID',
    ),
  });
}

export function normalizeMediaSourcePtsCadenceEpochArtifactExpectedSourceV3(
  value: unknown,
): MediaSourcePtsCadenceEpochArtifactExpectedSourceV3 {
  const record = objectRecord(value, 'EPOCH_ARTIFACT_EXPECTED_SOURCE_INVALID');
  exactKeys(record, [
    'mapBindingSha256', 'sourceBindingSha256', 'sourceTimebase',
    'sourceVersionSha256', 'storageVersionSha256', 'technicalObservationSha256',
    'videoStreamIndex',
  ], 'EPOCH_ARTIFACT_EXPECTED_SOURCE_FIELDS_INVALID');
  return frozen({
    sourceVersionSha256: sha256(record.sourceVersionSha256, 'EXPECTED_SOURCE_VERSION_INVALID'),
    storageVersionSha256: sha256(record.storageVersionSha256, 'EXPECTED_STORAGE_VERSION_INVALID'),
    sourceBindingSha256: sha256(record.sourceBindingSha256, 'EXPECTED_SOURCE_BINDING_INVALID'),
    technicalObservationSha256: sha256(
      record.technicalObservationSha256,
      'EXPECTED_OBSERVATION_INVALID',
    ),
    mapBindingSha256: sha256(record.mapBindingSha256, 'EXPECTED_MAP_BINDING_INVALID'),
    videoStreamIndex: nonNegativeSafeIntegerInRange(
      record.videoStreamIndex,
      Number.MAX_SAFE_INTEGER,
      'EXPECTED_STREAM_INDEX_INVALID',
    ),
    sourceTimebase: parseExactRationalRateV1(record.sourceTimebase),
  });
}

export function assertMediaSourcePtsCadenceEpochIndexSidecarForVerificationV3(
  value: unknown,
): MediaSourcePtsCadenceEpochIndexSidecarV3 {
  const record = objectRecord(value, 'EPOCH_INDEX_SIDECAR_INVALID');
  exactKeys(record, [
    'batchCount', 'byteLength', 'contentSha256', 'endExclusiveFrameOrdinal',
    'epochCount', 'kind', 'mapBindingSha256', 'objectKey', 'schemaVersion',
    'sourceVersionSha256', 'storage',
  ], 'EPOCH_INDEX_SIDECAR_FIELDS_INVALID');
  const sourceVersionSha256 = sha256(record.sourceVersionSha256, 'EPOCH_INDEX_SOURCE_INVALID');
  const mapBindingSha256 = sha256(record.mapBindingSha256, 'EPOCH_INDEX_BINDING_INVALID');
  const contentSha256 = sha256(record.contentSha256, 'EPOCH_INDEX_CONTENT_INVALID');
  if (record.schemaVersion !== 3
    || record.kind !== MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_SIDECAR_KIND_V3
    || record.objectKey !== expectedMediaSourcePtsCadenceEpochIndexObjectKeyV3(
      sourceVersionSha256,
      mapBindingSha256,
      contentSha256,
    )) {
    throw new Error('EPOCH_INDEX_SIDECAR_BINDING_INVALID');
  }
  return frozen({
    schemaVersion: 3,
    kind: MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_SIDECAR_KIND_V3,
    storage: privateStorage(record.storage),
    objectKey: record.objectKey,
    byteLength: positiveSafeIntegerInRange(
      record.byteLength,
      MAX_TOTAL_ARTIFACT_BYTES_V3,
      'EPOCH_INDEX_BYTES_INVALID',
    ),
    contentSha256,
    sourceVersionSha256,
    mapBindingSha256,
    epochCount: positiveSafeIntegerInRange(
      record.epochCount,
      MAX_BOUNDARY_EVIDENCE_READS_V3,
      'EPOCH_INDEX_EPOCH_COUNT_INVALID',
    ),
    batchCount: positiveSafeIntegerInRange(
      record.batchCount,
      MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BATCHES_V3,
      'EPOCH_INDEX_BATCH_COUNT_INVALID',
    ),
    endExclusiveFrameOrdinal: positiveIntegerText(
      record.endExclusiveFrameOrdinal,
      'EPOCH_INDEX_END_FRAME_INVALID',
    ),
  });
}

export function assertMediaSourcePtsCadenceBoundarySemanticVerificationReceiptV3(
  value: unknown,
): MediaSourcePtsCadenceBoundarySemanticVerificationReceiptV3 {
  const record = objectRecord(value, 'BOUNDARY_SEMANTIC_RECEIPT_INVALID');
  exactKeys(record, [
    'boundaryKind', 'classificationBasis', 'contentSha256', 'detectorVersion',
    'disposition', 'epochId', 'evidenceContractVersion', 'kind', 'mapBindingSha256',
    'registryVersion', 'schemaVersion', 'semanticVerificationSha256', 'verifierId',
    'verifierVersion',
  ], 'BOUNDARY_SEMANTIC_RECEIPT_FIELDS_INVALID');
  if (record.schemaVersion !== 3
    || record.kind !== MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_SEMANTIC_VERIFICATION_KIND_V3
    || record.disposition !== 'BOUNDARY_EVIDENCE_SEMANTICALLY_VERIFIED') {
    throw new Error('BOUNDARY_SEMANTIC_RECEIPT_INVALID');
  }
  const material = {
    schemaVersion: 3 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_SEMANTIC_VERIFICATION_KIND_V3,
    disposition: 'BOUNDARY_EVIDENCE_SEMANTICALLY_VERIFIED' as const,
    registryVersion: boundedText(record.registryVersion, 'BOUNDARY_SEMANTIC_REGISTRY_INVALID'),
    verifierId: identifier(record.verifierId, 'BOUNDARY_SEMANTIC_VERIFIER_ID_INVALID'),
    verifierVersion: boundedText(record.verifierVersion, 'BOUNDARY_SEMANTIC_VERIFIER_INVALID'),
    evidenceContractVersion: boundedText(
      record.evidenceContractVersion,
      'BOUNDARY_SEMANTIC_CONTRACT_INVALID',
    ),
    mapBindingSha256: sha256(record.mapBindingSha256, 'BOUNDARY_SEMANTIC_MAP_INVALID'),
    epochId: identifier(record.epochId, 'BOUNDARY_SEMANTIC_EPOCH_INVALID'),
    boundaryKind: boundaryKind(record.boundaryKind),
    classificationBasis: boundaryBasis(record.classificationBasis),
    detectorVersion: boundedText(record.detectorVersion, 'BOUNDARY_SEMANTIC_DETECTOR_INVALID'),
    contentSha256: sha256(record.contentSha256, 'BOUNDARY_SEMANTIC_CONTENT_INVALID'),
  };
  if (record.semanticVerificationSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('BOUNDARY_SEMANTIC_RECEIPT_HASH_MISMATCH');
  }
  return frozen({
    ...material,
    semanticVerificationSha256: record.semanticVerificationSha256 as string,
  });
}

export function assertMediaSourcePtsCadenceEpochArtifactVerificationReceiptV3(
  value: unknown,
): MediaSourcePtsCadenceEpochArtifactVerificationReceiptV3 {
  const record = objectRecord(value, 'EPOCH_ARTIFACT_RECEIPT_INVALID');
  exactKeys(record, [
    'disposition', 'epochIndexSidecar', 'kind', 'observedCadence', 'schemaVersion',
    'source', 'totalArtifactBytes', 'verificationPolicy', 'verificationSha256',
    'verifiedBatchCount', 'verifiedBatches', 'verifiedBoundaryEvidence',
    'verifiedBoundaryEvidenceCount', 'verifiedEpochCount', 'verifiedFrameCount',
    'verifierVersion',
  ], 'EPOCH_ARTIFACT_RECEIPT_FIELDS_INVALID');
  if (record.schemaVersion !== 3
    || record.kind !== MEDIA_SOURCE_PTS_CADENCE_EPOCH_ARTIFACT_VERIFICATION_KIND_V3
    || record.disposition !== 'EPOCH_ARTIFACT_SET_VERIFIED'
    || record.verifierVersion !== MEDIA_SOURCE_PTS_CADENCE_EPOCH_ARTIFACT_VERIFIER_VERSION_V3) {
    throw new Error('EPOCH_ARTIFACT_RECEIPT_INVALID');
  }
  const source = normalizeMediaSourcePtsCadenceEpochArtifactExpectedSourceV3(record.source);
  const verificationPolicy = normalizeMediaSourcePtsCadenceEpochArtifactVerificationPolicyV3(
    record.verificationPolicy,
  );
  const epochIndexSidecar = assertMediaSourcePtsCadenceEpochIndexSidecarForVerificationV3(
    record.epochIndexSidecar,
  );
  const verifiedBatches = assertVerifiedBatches(record.verifiedBatches);
  const verifiedBoundaryEvidence = assertVerifiedBoundaryEvidence(
    record.verifiedBoundaryEvidence,
  );
  const verifiedEpochCount = positiveSafeIntegerInRange(
    record.verifiedEpochCount,
    MAX_BOUNDARY_EVIDENCE_READS_V3,
    'EPOCH_ARTIFACT_RECEIPT_EPOCH_COUNT_INVALID',
  );
  const verifiedBatchCount = positiveSafeIntegerInRange(
    record.verifiedBatchCount,
    MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BATCHES_V3,
    'EPOCH_ARTIFACT_RECEIPT_BATCH_COUNT_INVALID',
  );
  const verifiedBoundaryEvidenceCount = nonNegativeSafeIntegerInRange(
    record.verifiedBoundaryEvidenceCount,
    MAX_BOUNDARY_EVIDENCE_READS_V3,
    'EPOCH_ARTIFACT_RECEIPT_EVIDENCE_COUNT_INVALID',
  );
  const totalArtifactBytes = positiveSafeIntegerInRange(
    record.totalArtifactBytes,
    verificationPolicy.maxTotalArtifactBytes,
    'EPOCH_ARTIFACT_RECEIPT_TOTAL_BYTES_INVALID',
  );
  const observedCadence = assertObservedCadence(record.observedCadence);
  const expectedBytes = epochIndexSidecar.byteLength
    + verifiedBatches.reduce((sum, batch) => sum + batch.byteLength, 0)
    + verifiedBoundaryEvidence.reduce((sum, evidence) => sum + evidence.byteLength, 0);
  if (verifiedEpochCount !== epochIndexSidecar.epochCount
    || verifiedBatchCount !== epochIndexSidecar.batchCount
    || verifiedBatchCount !== verifiedBatches.length
    || verifiedBoundaryEvidenceCount !== verifiedBoundaryEvidence.length
    || totalArtifactBytes !== expectedBytes
    || epochIndexSidecar.sourceVersionSha256 !== source.sourceVersionSha256
    || epochIndexSidecar.mapBindingSha256 !== source.mapBindingSha256) {
    throw new Error('EPOCH_ARTIFACT_RECEIPT_COVERAGE_INVALID');
  }
  const verifiedFrameCount = positiveIntegerText(
    record.verifiedFrameCount,
    'EPOCH_ARTIFACT_RECEIPT_FRAME_COUNT_INVALID',
  );
  if (verifiedBatches.reduce((sum, batch) => sum + BigInt(batch.frameCount), BigInt(0))
    !== BigInt(verifiedFrameCount)) {
    throw new Error('EPOCH_ARTIFACT_RECEIPT_FRAME_COUNT_MISMATCH');
  }
  const material = {
    schemaVersion: 3 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_EPOCH_ARTIFACT_VERIFICATION_KIND_V3,
    disposition: 'EPOCH_ARTIFACT_SET_VERIFIED' as const,
    verifierVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_ARTIFACT_VERIFIER_VERSION_V3,
    source,
    verificationPolicy,
    epochIndexSidecar,
    verifiedEpochCount,
    verifiedBatchCount,
    verifiedFrameCount,
    verifiedBoundaryEvidenceCount,
    totalArtifactBytes,
    observedCadence,
    verifiedBatches,
    verifiedBoundaryEvidence,
  };
  if (record.verificationSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('EPOCH_ARTIFACT_RECEIPT_HASH_MISMATCH');
  }
  return frozen({ ...material, verificationSha256: record.verificationSha256 as string });
}

function assertVerifiedBatches(
  value: unknown,
): MediaSourcePtsCadenceEpochArtifactVerificationReceiptV3['verifiedBatches'] {
  if (!Array.isArray(value) || value.length === 0
    || value.length > MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BATCHES_V3) {
    throw new Error('EPOCH_ARTIFACT_RECEIPT_BATCHES_INVALID');
  }
  return value.map((candidate, index) => {
    const record = objectRecord(candidate, 'EPOCH_ARTIFACT_RECEIPT_BATCH_INVALID');
    exactKeys(record, [
      'batchSequence', 'byteLength', 'contentSha256', 'epochId', 'frameCount',
      'shardDescriptorSha256',
    ], 'EPOCH_ARTIFACT_RECEIPT_BATCH_FIELDS_INVALID');
    const batchSequence = nonNegativeSafeIntegerInRange(
      record.batchSequence,
      MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BATCHES_V3,
      'EPOCH_ARTIFACT_RECEIPT_BATCH_SEQUENCE_INVALID',
    );
    if (batchSequence !== index) throw new Error('EPOCH_ARTIFACT_RECEIPT_BATCH_ORDER_INVALID');
    return {
      batchSequence,
      epochId: identifier(record.epochId, 'EPOCH_ARTIFACT_RECEIPT_BATCH_EPOCH_INVALID'),
      byteLength: positiveSafeIntegerInRange(
        record.byteLength,
        MAX_TOTAL_ARTIFACT_BYTES_V3,
        'EPOCH_ARTIFACT_RECEIPT_BATCH_BYTES_INVALID',
      ),
      contentSha256: sha256(record.contentSha256, 'EPOCH_ARTIFACT_RECEIPT_BATCH_HASH_INVALID'),
      shardDescriptorSha256: sha256(
        record.shardDescriptorSha256,
        'EPOCH_ARTIFACT_RECEIPT_BATCH_DESCRIPTOR_INVALID',
      ),
      frameCount: positiveIntegerText(
        record.frameCount,
        'EPOCH_ARTIFACT_RECEIPT_BATCH_FRAME_COUNT_INVALID',
      ),
    };
  });
}

function assertVerifiedBoundaryEvidence(
  value: unknown,
): MediaSourcePtsCadenceEpochArtifactVerificationReceiptV3['verifiedBoundaryEvidence'] {
  if (!Array.isArray(value) || value.length > MAX_BOUNDARY_EVIDENCE_READS_V3) {
    throw new Error('EPOCH_ARTIFACT_RECEIPT_EVIDENCE_INVALID');
  }
  const seen = new Set<string>();
  return value.map((candidate) => {
    const record = objectRecord(candidate, 'EPOCH_ARTIFACT_RECEIPT_EVIDENCE_INVALID');
    exactKeys(record, [
      'boundaryKind', 'byteLength', 'contentSha256', 'epochId',
      'semanticVerificationSha256',
    ], 'EPOCH_ARTIFACT_RECEIPT_EVIDENCE_FIELDS_INVALID');
    const epochId = identifier(record.epochId, 'EPOCH_ARTIFACT_RECEIPT_EVIDENCE_EPOCH_INVALID');
    if (seen.has(epochId)) throw new Error('EPOCH_ARTIFACT_RECEIPT_EVIDENCE_DUPLICATE');
    seen.add(epochId);
    return {
      epochId,
      boundaryKind: boundaryKind(record.boundaryKind),
      byteLength: positiveSafeIntegerInRange(
        record.byteLength,
        MAX_TOTAL_ARTIFACT_BYTES_V3,
        'EPOCH_ARTIFACT_RECEIPT_EVIDENCE_BYTES_INVALID',
      ),
      contentSha256: sha256(record.contentSha256, 'EPOCH_ARTIFACT_RECEIPT_EVIDENCE_HASH_INVALID'),
      semanticVerificationSha256: sha256(
        record.semanticVerificationSha256,
        'EPOCH_ARTIFACT_RECEIPT_EVIDENCE_SEMANTIC_HASH_INVALID',
      ),
    };
  });
}

function assertObservedCadence(
  value: unknown,
): MediaSourcePtsCadenceEpochArtifactVerificationReceiptV3['observedCadence'] {
  const record = objectRecord(value, 'EPOCH_ARTIFACT_RECEIPT_CADENCE_INVALID');
  if (record.kind === 'VARIABLE_FRAME_DURATIONS') {
    exactKeys(record, ['kind'], 'EPOCH_ARTIFACT_RECEIPT_CADENCE_FIELDS_INVALID');
    return { kind: 'VARIABLE_FRAME_DURATIONS' };
  }
  exactKeys(record, ['durationTicks', 'kind'], 'EPOCH_ARTIFACT_RECEIPT_CADENCE_FIELDS_INVALID');
  if (record.kind !== 'UNIFORM_FRAME_DURATIONS') {
    throw new Error('EPOCH_ARTIFACT_RECEIPT_CADENCE_INVALID');
  }
  return {
    kind: 'UNIFORM_FRAME_DURATIONS',
    durationTicks: positiveIntegerText(
      record.durationTicks,
      'EPOCH_ARTIFACT_RECEIPT_DURATION_INVALID',
    ),
  };
}

function assertSemanticReceiptScope(
  receipt: MediaSourcePtsCadenceBoundarySemanticVerificationReceiptV3,
  registryVersion: string,
  boundary: MediaSourcePtsCadenceEpochBoundaryV3,
  sidecar: MediaSourcePtsCadenceBoundaryEvidenceSidecarV3,
): void {
  if (receipt.registryVersion !== registryVersion
    || receipt.evidenceContractVersion !== sidecar.evidenceContractVersion
    || receipt.mapBindingSha256 !== sidecar.mapBindingSha256
    || receipt.epochId !== sidecar.epochId
    || receipt.boundaryKind !== boundary.boundaryKind
    || receipt.classificationBasis !== boundary.classificationBasis
    || receipt.detectorVersion !== boundary.detectorVersion
    || receipt.contentSha256 !== sidecar.contentSha256) {
    throw new Error('BOUNDARY_SEMANTIC_RECEIPT_SCOPE_MISMATCH');
  }
}

function batchMatchesIndexAndSource(
  payload: Readonly<MediaSourcePtsCadenceFrameBatchPayloadV2>,
  entry: MediaSourcePtsCadenceEpochIndexBatchEntryV3,
  source: MediaSourcePtsCadenceEpochArtifactExpectedSourceV3,
): boolean {
  const shard = payload.shard;
  return payload.mapBindingSha256 === source.mapBindingSha256
    && shard.sourceVersionSha256 === source.sourceVersionSha256
    && shard.videoStreamIndex === source.videoStreamIndex
    && sameRate(shard.sourceTimebase, source.sourceTimebase)
    && shard.shardSequence === entry.batchSequence
    && shard.firstFrameOrdinal === entry.firstFrameOrdinal
    && shard.frameCount === entry.frameCount
    && shard.startPresentationTimestampTicks === entry.startPresentationTimestampTicks
    && shard.endExclusivePresentationTimestampTicks === entry.endExclusivePresentationTimestampTicks
    && hashEditronCanonicalJsonV1(shard) === entry.shardDescriptorSha256;
}

function indexMatchesSource(
  index: MediaSourcePtsCadenceEpochIndexV3,
  source: MediaSourcePtsCadenceEpochArtifactExpectedSourceV3,
): boolean {
  return index.sourceVersionSha256 === source.sourceVersionSha256
    && index.mapBindingSha256 === source.mapBindingSha256
    && index.videoStreamIndex === source.videoStreamIndex
    && sameRate(index.sourceTimebase, source.sourceTimebase);
}

type StoredReadResultV3 = Readonly<
  | {
      disposition: 'VERIFIED';
      object: Readonly<{ canonicalJson: string; byteLength: number; contentSha256: string }>;
    }
  | { disposition: 'UNVERIFIABLE'; result: MediaSourcePtsCadenceEpochArtifactVerificationResultV3 }
>;

async function readStoredObject(
  reader: MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3,
  sidecar: StoredObjectSidecarV3,
  family: 'EPOCH_INDEX' | 'BATCH' | 'BOUNDARY_EVIDENCE',
  failedBatchSequence: number | null = null,
  failedEpochId: string | null = null,
): Promise<StoredReadResultV3> {
  let stored: Readonly<{ canonicalJson: string; byteLength: number; contentSha256: string }>;
  try {
    stored = await reader.read(sidecar);
  } catch (error) {
    return {
      disposition: 'UNVERIFIABLE',
      result: unverifiable(
        `${family}_READ_FAILED`, sidecar.objectKey, failedBatchSequence, failedEpochId, error,
      ),
    };
  }
  if (!stored || typeof stored !== 'object'
    || typeof stored.canonicalJson !== 'string'
    || !Number.isSafeInteger(stored.byteLength)
    || Number(stored.byteLength) <= 0
    || typeof stored.contentSha256 !== 'string') {
    return {
      disposition: 'UNVERIFIABLE',
      result: unverifiable(
        `${family}_STORED_OBJECT_INVALID`,
        sidecar.objectKey,
        failedBatchSequence,
        failedEpochId,
        null,
      ),
    };
  }
  if (stored.byteLength !== Buffer.byteLength(stored.canonicalJson, 'utf8')
    || stored.byteLength !== sidecar.byteLength) {
    return {
      disposition: 'UNVERIFIABLE',
      result: unverifiable(
        `${family}_BYTE_LENGTH_MISMATCH`,
        sidecar.objectKey,
        failedBatchSequence,
        failedEpochId,
        null,
      ),
    };
  }
  if (stored.contentSha256 !== hashUtf8(stored.canonicalJson)
    || stored.contentSha256 !== sidecar.contentSha256) {
    return {
      disposition: 'UNVERIFIABLE',
      result: unverifiable(
        `${family}_CONTENT_HASH_MISMATCH`,
        sidecar.objectKey,
        failedBatchSequence,
        failedEpochId,
        null,
      ),
    };
  }
  return { disposition: 'VERIFIED', object: stored };
}

function unverifiable(
  reason: MediaSourcePtsCadenceEpochArtifactUnverifiableReasonV3,
  failedObjectKey: string | null,
  failedBatchSequence: number | null,
  failedEpochId: string | null,
  error: unknown,
): MediaSourcePtsCadenceEpochArtifactVerificationResultV3 {
  const diagnostic = error === null
    ? null
    : boundedDiagnostic(error instanceof Error ? error.message : String(error));
  return frozen({
    disposition: 'UNVERIFIABLE' as const,
    reason,
    failedObjectKey,
    failedBatchSequence,
    failedEpochId,
    diagnostic,
  });
}

function sameRate(left: ExactRationalRateV1, right: ExactRationalRateV1): boolean {
  const normalizedLeft = parseExactRationalRateV1(left);
  const normalizedRight = parseExactRationalRateV1(right);
  return normalizedLeft.numerator === normalizedRight.numerator
    && normalizedLeft.denominator === normalizedRight.denominator;
}

function boundaryKind(value: unknown): PresentationEpochV1['boundaryKind'] {
  if (value === 'INITIAL' || value === 'GAP' || value === 'OVERLAP'
    || value === 'TIMESTAMP_RESET' || value === 'WRAP' || value === 'EDIT_LIST') {
    return value;
  }
  throw new Error('BOUNDARY_KIND_INVALID');
}

function boundaryBasis(value: unknown): MediaSourcePtsCadenceEpochBoundaryBasisV3 {
  if (value === 'FIRST_DECODED_PRESENTATION' || value === 'PTS_DELTA'
    || value === 'DEMUXER_DISCONTINUITY_MARKER' || value === 'COUNTER_WRAP_METADATA'
    || value === 'CONTAINER_EDIT_LIST') {
    return value;
  }
  throw new Error('BOUNDARY_BASIS_INVALID');
}

function objectRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) {
    throw new Error(code);
  }
}

function privateStorage(value: unknown): 'R2_PRIVATE' | 'GCS_PRIVATE' {
  if (value !== 'R2_PRIVATE' && value !== 'GCS_PRIVATE') throw new Error('STORAGE_INVALID');
  return value;
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}

function boundedText(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(normalized)) throw new Error(code);
  return normalized;
}

function positiveIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,127}$/.test(value.trim())) throw new Error(code);
  return BigInt(value.trim()).toString();
}

function positiveSafeIntegerInRange(value: unknown, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > maximum) {
    throw new Error(code);
  }
  return Number(value);
}

function nonNegativeSafeIntegerInRange(value: unknown, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    throw new Error(code);
  }
  return Number(value);
}

function boundedDiagnostic(value: string): string {
  const normalized = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return (normalized || 'UNSPECIFIED').slice(0, 512);
}

function hashUtf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value) as Readonly<T>;
}
