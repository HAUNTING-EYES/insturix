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
