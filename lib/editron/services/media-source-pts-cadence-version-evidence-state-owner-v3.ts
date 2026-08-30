import {
  createMediaSourcePtsCadenceMapAssetStateV3,
  type MediaSourcePtsCadenceMapAssetRecordV3,
} from './media-source-pts-cadence-map-asset-owner-v3';
import type { MediaSourcePtsCadenceScanPublisherStateOwnerV3 }
  from './media-source-pts-cadence-scan-publisher-v3';
import type { MediaSourceQualificationRecordV1 }
  from './media-source-qualification-v1';
import {
  captureMediaSourceVersionEvidenceV1,
  type MediaSourceVersionEvidenceRecordV1,
  type MediaSourceVersionEvidenceStorePortsV1,
} from './media-source-version-evidence-owner-v1';
import {
  retainMediaSourceVersionEvidenceV1,
  type MediaSourceVersionEvidenceRetentionResultV1,
} from './media-source-version-evidence-retention-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';

export type MediaSourcePtsCadenceVersionEvidenceFailureReasonV3 =
  | 'SOURCE_VERSION_EVIDENCE_TERMINAL_STATE_INVALID'
  | 'SOURCE_VERSION_EVIDENCE_CANDIDATE_INVALID'
  | 'SOURCE_VERSION_EVIDENCE_CURRENT_STATE_INVALID'
  | 'SOURCE_VERSION_EVIDENCE_CONFLICT'
  | 'SOURCE_VERSION_EVIDENCE_RACE_EXHAUSTED'
  | 'SOURCE_VERSION_EVIDENCE_STORE_LOAD_FAILED'
  | 'SOURCE_VERSION_EVIDENCE_STORE_CAS_FAILED';

/**
 * Decorates the existing sole V3 state writer. A COMPLETE root is retained by
 * immutable source version before the active MediaAsset slot can be changed.
 */
export function createMediaSourcePtsCadenceVersionEvidenceStateOwnerV3(
  input: Readonly<{
    sourceVersion: MediaSourceVersionV1;
    qualification: MediaSourceQualificationRecordV1;
    stateOwner: MediaSourcePtsCadenceScanPublisherStateOwnerV3;
    evidenceStorePorts: MediaSourceVersionEvidenceStorePortsV1;
  }>,
): MediaSourcePtsCadenceScanPublisherStateOwnerV3 {
  const sourceVersion = assertMediaSourceVersionV1(input.sourceVersion);
  if (!input.stateOwner || typeof input.stateOwner.load !== 'function'
    || typeof input.stateOwner.persist !== 'function'
    || !input.evidenceStorePorts
    || typeof input.evidenceStorePorts.load !== 'function'
    || typeof input.evidenceStorePorts.compareAndSet !== 'function') {
    throw failure('SOURCE_VERSION_EVIDENCE_TERMINAL_STATE_INVALID', false);
  }
  return Object.freeze({
    load: input.stateOwner.load,
    persist: async (persistInput) => {
      if (persistInput.nextRecord.status === 'COMPLETE') {
        const candidate = terminalEvidenceCandidate({
          assetId: persistInput.assetId,
          sourceVersion,
          qualification: input.qualification,
          nextRecord: persistInput.nextRecord,
        });
        const retained = await retainMediaSourceVersionEvidenceV1(
          candidate,
          input.evidenceStorePorts,
        );
        if (retained.disposition === 'REJECTED') {
          throw failure(retentionFailureReason(retained.reason), retained.retryable);
        }
      }
      return input.stateOwner.persist(persistInput);
    },
  });
}

function terminalEvidenceCandidate(input: Readonly<{
  assetId: string;
  sourceVersion: MediaSourceVersionV1;
  qualification: MediaSourceQualificationRecordV1;
  nextRecord: MediaSourcePtsCadenceMapAssetRecordV3;
}>): MediaSourceVersionEvidenceRecordV1 {
  try {
    const asset = {
      assetId: input.assetId,
      type: input.sourceVersion.mediaKind,
      sourceVersionV1: input.sourceVersion,
      sourceQualificationV1: input.qualification,
    };
    const state = createMediaSourcePtsCadenceMapAssetStateV3({
      asset,
      record: input.nextRecord,
    });
    return captureMediaSourceVersionEvidenceV1({ ...asset, ...state });
  } catch {
    throw failure('SOURCE_VERSION_EVIDENCE_TERMINAL_STATE_INVALID', false);
  }
}

function retentionFailureReason(
  reason: Extract<
    MediaSourceVersionEvidenceRetentionResultV1,
    { disposition: 'REJECTED' }
  >['reason'],
): MediaSourcePtsCadenceVersionEvidenceFailureReasonV3 {
  switch (reason) {
    case 'CANDIDATE_INVALID':
      return 'SOURCE_VERSION_EVIDENCE_CANDIDATE_INVALID';
    case 'CURRENT_STATE_INVALID':
      return 'SOURCE_VERSION_EVIDENCE_CURRENT_STATE_INVALID';
    case 'CONFLICTING_EVIDENCE':
      return 'SOURCE_VERSION_EVIDENCE_CONFLICT';
    case 'RACE_EXHAUSTED':
      return 'SOURCE_VERSION_EVIDENCE_RACE_EXHAUSTED';
    case 'STORE_LOAD_FAILED':
      return 'SOURCE_VERSION_EVIDENCE_STORE_LOAD_FAILED';
    case 'STORE_CAS_FAILED':
      return 'SOURCE_VERSION_EVIDENCE_STORE_CAS_FAILED';
  }
}

function failure(
  reason: MediaSourcePtsCadenceVersionEvidenceFailureReasonV3,
  retryable: boolean,
): MediaSourcePtsCadenceVersionEvidenceErrorV3 {
  return new MediaSourcePtsCadenceVersionEvidenceErrorV3(reason, retryable);
}

export class MediaSourcePtsCadenceVersionEvidenceErrorV3 extends Error {
  constructor(
    public readonly reason: MediaSourcePtsCadenceVersionEvidenceFailureReasonV3,
    public readonly retryable: boolean,
  ) {
    super(reason);
    this.name = 'MediaSourcePtsCadenceVersionEvidenceErrorV3';
  }
}
