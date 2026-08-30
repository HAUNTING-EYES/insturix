import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
} from './canonical-json-v1';
import {
  verifyMediaSourcePtsCadenceEpochArtifactsV3,
  type MediaSourcePtsCadenceBoundarySemanticVerifierV3,
  type MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3,
  type MediaSourcePtsCadenceEpochArtifactUnverifiableReasonV3,
} from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import {
  readMediaSourcePtsCadenceMapAssetStateV3,
  type MediaSourcePtsCadenceMapAssetStateInputV3,
} from './media-source-pts-cadence-map-asset-owner-v3';
import {
  captureMediaSourceVersionEvidenceV1,
  type MediaSourceVersionEvidenceStorePortsV1,
} from './media-source-version-evidence-owner-v1';
import {
  retainMediaSourceVersionEvidenceV1,
  type MediaSourceVersionEvidenceRetentionResultV1,
} from './media-source-version-evidence-retention-v1';

export type MediaSourcePtsCadenceVersionEvidenceBackfillPortsV1 = Readonly<{
  storedObjectReader: MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3;
  boundarySemanticVerifier: MediaSourcePtsCadenceBoundarySemanticVerifierV3;
  evidenceStorePorts: MediaSourceVersionEvidenceStorePortsV1;
}>;

export type MediaSourcePtsCadenceVersionEvidenceBackfillResultV1 = Readonly<
  | {
      disposition: 'BACKFILLED';
      assetId: string;
      sourceVersionSha256: string;
      terminalReceiptSha256: string;
      verificationSha256: string;
      evidenceWriteDisposition: 'APPLIED' | 'UNCHANGED';
      evidenceSha256: string;
    }
  | {
      disposition: 'NOT_APPLICABLE';
      reason: 'V3_STATE_ABSENT' | 'V3_NOT_PUBLISHED';
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason:
        | 'SOURCE_STATE_INVALID'
        | 'ARTIFACT_SET_UNVERIFIABLE'
        | 'PERSISTED_VERIFICATION_MISMATCH'
        | 'EVIDENCE_CANDIDATE_INVALID'
        | 'EVIDENCE_CURRENT_STATE_INVALID'
        | 'EVIDENCE_CONFLICT'
        | 'EVIDENCE_RACE_EXHAUSTED'
        | 'EVIDENCE_STORE_LOAD_FAILED'
        | 'EVIDENCE_STORE_CAS_FAILED';
      retryable: boolean;
      artifactReason: MediaSourcePtsCadenceEpochArtifactUnverifiableReasonV3 | null;
  }
>;

const ARTIFACT_UNVERIFIABLE_REASONS_V1 = Object.freeze([
  'VERIFICATION_REQUEST_INVALID',
  'EPOCH_INDEX_READ_FAILED',
  'EPOCH_INDEX_STORED_OBJECT_INVALID',
  'EPOCH_INDEX_BYTE_LENGTH_MISMATCH',
  'EPOCH_INDEX_CONTENT_HASH_MISMATCH',
  'EPOCH_INDEX_PAYLOAD_INVALID',
  'EPOCH_INDEX_SIDECAR_MISMATCH',
  'SOURCE_SCOPE_MISMATCH',
  'RESOURCE_LIMIT_EXCEEDED',
  'BATCH_READ_FAILED',
  'BATCH_STORED_OBJECT_INVALID',
  'BATCH_BYTE_LENGTH_MISMATCH',
  'BATCH_CONTENT_HASH_MISMATCH',
  'BATCH_PAYLOAD_INVALID',
  'BATCH_INDEX_MISMATCH',
  'BOUNDARY_EVIDENCE_READ_FAILED',
  'BOUNDARY_EVIDENCE_STORED_OBJECT_INVALID',
  'BOUNDARY_EVIDENCE_BYTE_LENGTH_MISMATCH',
  'BOUNDARY_EVIDENCE_CONTENT_HASH_MISMATCH',
  'BOUNDARY_EVIDENCE_JSON_INVALID',
  'BOUNDARY_EVIDENCE_JSON_NON_CANONICAL',
  'BOUNDARY_EVIDENCE_SEMANTIC_UNVERIFIED',
  'BOUNDARY_EVIDENCE_SEMANTIC_RECEIPT_INVALID',
] satisfies readonly MediaSourcePtsCadenceEpochArtifactUnverifiableReasonV3[]);

const BACKFILL_UNVERIFIABLE_REASONS_V1 = Object.freeze([
  'SOURCE_STATE_INVALID',
  'ARTIFACT_SET_UNVERIFIABLE',
  'PERSISTED_VERIFICATION_MISMATCH',
  'EVIDENCE_CANDIDATE_INVALID',
  'EVIDENCE_CURRENT_STATE_INVALID',
  'EVIDENCE_CONFLICT',
  'EVIDENCE_RACE_EXHAUSTED',
  'EVIDENCE_STORE_LOAD_FAILED',
  'EVIDENCE_STORE_CAS_FAILED',
] satisfies readonly Extract<
  MediaSourcePtsCadenceVersionEvidenceBackfillResultV1,
  { disposition: 'UNVERIFIABLE' }
>['reason'][]);

export function assertMediaSourcePtsCadenceVersionEvidenceBackfillResultV1(
  value: unknown,
): MediaSourcePtsCadenceVersionEvidenceBackfillResultV1 {
  const record = objectRecord(value, 'BACKFILL_RESULT_INVALID');
  if (record.disposition === 'BACKFILLED') {
    exactKeys(record, [
      'assetId', 'disposition', 'evidenceSha256',
      'evidenceWriteDisposition', 'sourceVersionSha256',
      'terminalReceiptSha256', 'verificationSha256',
    ], 'BACKFILL_RESULT_FIELDS_INVALID');
    if (record.evidenceWriteDisposition !== 'APPLIED'
      && record.evidenceWriteDisposition !== 'UNCHANGED') {
      fail('BACKFILL_RESULT_WRITE_DISPOSITION_INVALID');
    }
    return frozen({
      disposition: 'BACKFILLED',
      assetId: identifier(record.assetId, 'BACKFILL_RESULT_ASSET_ID_INVALID'),
      sourceVersionSha256: sha256(
        record.sourceVersionSha256,
        'BACKFILL_RESULT_SOURCE_VERSION_INVALID',
      ),
      terminalReceiptSha256: sha256(
        record.terminalReceiptSha256,
        'BACKFILL_RESULT_TERMINAL_RECEIPT_INVALID',
      ),
      verificationSha256: sha256(
        record.verificationSha256,
        'BACKFILL_RESULT_VERIFICATION_INVALID',
      ),
      evidenceWriteDisposition: record.evidenceWriteDisposition,
      evidenceSha256: sha256(
        record.evidenceSha256,
        'BACKFILL_RESULT_EVIDENCE_INVALID',
      ),
    });
  }
  if (record.disposition === 'NOT_APPLICABLE') {
    exactKeys(record, ['disposition', 'reason'], 'BACKFILL_RESULT_FIELDS_INVALID');
    if (record.reason !== 'V3_STATE_ABSENT'
      && record.reason !== 'V3_NOT_PUBLISHED') {
      fail('BACKFILL_RESULT_REASON_INVALID');
    }
    const reason = record.reason as Extract<
      MediaSourcePtsCadenceVersionEvidenceBackfillResultV1,
      { disposition: 'NOT_APPLICABLE' }
    >['reason'];
    return frozen({
      disposition: 'NOT_APPLICABLE',
      reason,
    });
  }
  if (record.disposition !== 'UNVERIFIABLE') {
    fail('BACKFILL_RESULT_DISPOSITION_INVALID');
  }
  exactKeys(record, [
    'artifactReason', 'disposition', 'reason', 'retryable',
  ], 'BACKFILL_RESULT_FIELDS_INVALID');
  if (typeof record.reason !== 'string'
    || !BACKFILL_UNVERIFIABLE_REASONS_V1.includes(
      record.reason as typeof BACKFILL_UNVERIFIABLE_REASONS_V1[number],
    )
    || typeof record.retryable !== 'boolean') {
    fail('BACKFILL_RESULT_REASON_INVALID');
  }
  const reason = record.reason as Extract<
    MediaSourcePtsCadenceVersionEvidenceBackfillResultV1,
    { disposition: 'UNVERIFIABLE' }
  >['reason'];
  const artifactReason = artifactReasonValue(record.artifactReason, reason);
  if (record.retryable !== expectedRetryable(reason, artifactReason)) {
    fail('BACKFILL_RESULT_RETRYABLE_INVALID');
  }
  return frozen({
    disposition: 'UNVERIFIABLE',
    reason,
    retryable: record.retryable,
    artifactReason,
  });
}

/**
 * Reproves and retains one exact terminal V3 root by immutable source version.
 * It never mutates the active MEDIA_ASSETS slot and never promotes an old
 * verification receipt without rereading every referenced private artifact.
 */
export async function backfillMediaSourcePtsCadenceVersionEvidenceV1(
  asset: MediaSourcePtsCadenceMapAssetStateInputV3,
  ports: MediaSourcePtsCadenceVersionEvidenceBackfillPortsV1,
): Promise<MediaSourcePtsCadenceVersionEvidenceBackfillResultV1> {
  assertPorts(ports);
  let state: ReturnType<typeof readMediaSourcePtsCadenceMapAssetStateV3>;
  try {
    state = readMediaSourcePtsCadenceMapAssetStateV3(asset);
  } catch {
    return unverifiable('SOURCE_STATE_INVALID', false);
  }
  if (state === null) {
    return frozen({
      disposition: 'NOT_APPLICABLE' as const,
      reason: 'V3_STATE_ABSENT' as const,
    });
  }

  const record = state.sourcePtsCadenceMapV3;
  if (record.status !== 'COMPLETE') {
    return frozen({
      disposition: 'NOT_APPLICABLE' as const,
      reason: 'V3_NOT_PUBLISHED' as const,
    });
  }
  if (record.verificationReceipt === null || record.terminalReceipt === null) {
    return unverifiable('SOURCE_STATE_INVALID', false);
  }

  const freshVerification = await verifyMediaSourcePtsCadenceEpochArtifactsV3({
    epochIndexSidecar: record.epochIndexSidecar,
    expectedSource: record.source,
    verificationPolicy: record.verificationPolicy,
    storedObjectReader: ports.storedObjectReader,
    boundarySemanticVerifier: ports.boundarySemanticVerifier,
  });
  if (freshVerification.disposition === 'UNVERIFIABLE') {
    return unverifiable(
      'ARTIFACT_SET_UNVERIFIABLE',
      artifactFailureIsRetryable(freshVerification.reason),
      freshVerification.reason,
    );
  }
  if (canonicalizeEditronJsonV1(freshVerification)
      !== canonicalizeEditronJsonV1(record.verificationReceipt)
    || freshVerification.verificationSha256
      !== record.terminalReceipt.verificationSha256) {
    return unverifiable('PERSISTED_VERIFICATION_MISMATCH', false);
  }

  let candidate;
  try {
    candidate = captureMediaSourceVersionEvidenceV1({
      assetId: asset.assetId,
      type: asset.type,
      sourceVersionV1: asset.sourceVersionV1,
      sourceQualificationV1: asset.sourceQualificationV1,
      sourcePtsCadenceMapV3: record,
      sourcePtsCadenceMapStateSha256V3:
        state.sourcePtsCadenceMapStateSha256V3,
    });
  } catch {
    return unverifiable('EVIDENCE_CANDIDATE_INVALID', false);
  }
  const retained = await retainMediaSourceVersionEvidenceV1(
    candidate,
    ports.evidenceStorePorts,
  );
  if (retained.disposition === 'REJECTED') {
    return unverifiable(
      retentionFailureReason(retained.reason),
      retained.retryable,
    );
  }
  return frozen({
    disposition: 'BACKFILLED',
    assetId: candidate.sourceVersionV1.assetId,
    sourceVersionSha256: candidate.sourceVersionV1.sourceVersionSha256,
    terminalReceiptSha256: record.terminalReceipt.terminalReceiptSha256,
    verificationSha256: freshVerification.verificationSha256,
    evidenceWriteDisposition: retained.writeDisposition,
    evidenceSha256: retained.record.evidenceSha256,
  });
}

function retentionFailureReason(
  reason: Extract<
    MediaSourceVersionEvidenceRetentionResultV1,
    { disposition: 'REJECTED' }
  >['reason'],
): Extract<
  MediaSourcePtsCadenceVersionEvidenceBackfillResultV1,
  { disposition: 'UNVERIFIABLE' }
>['reason'] {
  switch (reason) {
    case 'CANDIDATE_INVALID': return 'EVIDENCE_CANDIDATE_INVALID';
    case 'CURRENT_STATE_INVALID': return 'EVIDENCE_CURRENT_STATE_INVALID';
    case 'CONFLICTING_EVIDENCE': return 'EVIDENCE_CONFLICT';
    case 'RACE_EXHAUSTED': return 'EVIDENCE_RACE_EXHAUSTED';
    case 'STORE_LOAD_FAILED': return 'EVIDENCE_STORE_LOAD_FAILED';
    case 'STORE_CAS_FAILED': return 'EVIDENCE_STORE_CAS_FAILED';
  }
}

function artifactFailureIsRetryable(
  reason: MediaSourcePtsCadenceEpochArtifactUnverifiableReasonV3,
): boolean {
  return reason === 'EPOCH_INDEX_READ_FAILED'
    || reason === 'BATCH_READ_FAILED'
    || reason === 'BOUNDARY_EVIDENCE_READ_FAILED';
}

function artifactReasonValue(
  value: unknown,
  reason: Extract<
    MediaSourcePtsCadenceVersionEvidenceBackfillResultV1,
    { disposition: 'UNVERIFIABLE' }
  >['reason'],
): MediaSourcePtsCadenceEpochArtifactUnverifiableReasonV3 | null {
  if (reason !== 'ARTIFACT_SET_UNVERIFIABLE') {
    if (value !== null) fail('BACKFILL_RESULT_ARTIFACT_REASON_INVALID');
    return null;
  }
  if (typeof value !== 'string'
    || !ARTIFACT_UNVERIFIABLE_REASONS_V1.includes(
      value as typeof ARTIFACT_UNVERIFIABLE_REASONS_V1[number],
    )) {
    fail('BACKFILL_RESULT_ARTIFACT_REASON_INVALID');
  }
  return value as MediaSourcePtsCadenceEpochArtifactUnverifiableReasonV3;
}

function expectedRetryable(
  reason: Extract<
    MediaSourcePtsCadenceVersionEvidenceBackfillResultV1,
    { disposition: 'UNVERIFIABLE' }
  >['reason'],
  artifactReason: MediaSourcePtsCadenceEpochArtifactUnverifiableReasonV3 | null,
): boolean {
  if (reason === 'ARTIFACT_SET_UNVERIFIABLE') {
    return artifactFailureIsRetryable(artifactReason!);
  }
  return reason === 'EVIDENCE_RACE_EXHAUSTED'
    || reason === 'EVIDENCE_STORE_LOAD_FAILED'
    || reason === 'EVIDENCE_STORE_CAS_FAILED';
}

function assertPorts(
  ports: MediaSourcePtsCadenceVersionEvidenceBackfillPortsV1,
): void {
  if (!ports?.storedObjectReader
    || typeof ports.storedObjectReader.read !== 'function'
    || !ports.boundarySemanticVerifier
    || typeof ports.boundarySemanticVerifier.verify !== 'function'
    || !ports.evidenceStorePorts
    || typeof ports.evidenceStorePorts.load !== 'function'
    || typeof ports.evidenceStorePorts.compareAndSet !== 'function') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_PORTS_INVALID');
  }
}

function unverifiable(
  reason: Extract<
    MediaSourcePtsCadenceVersionEvidenceBackfillResultV1,
    { disposition: 'UNVERIFIABLE' }
  >['reason'],
  retryable: boolean,
  artifactReason: MediaSourcePtsCadenceEpochArtifactUnverifiableReasonV3 | null = null,
): MediaSourcePtsCadenceVersionEvidenceBackfillResultV1 {
  return frozen({
    disposition: 'UNVERIFIABLE',
    reason,
    retryable,
    artifactReason,
  });
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value) as Readonly<T>;
}

function objectRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) fail(code);
}

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) fail(code);
  return value;
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(code);
  return value;
}

function fail(code: string): never {
  throw new Error('MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_' + code);
}
