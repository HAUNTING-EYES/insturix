import {
  createMediaSourcePtsCadenceMapAssetStateV3,
  type MediaSourcePtsCadenceMapAssetRecordV3,
} from './media-source-pts-cadence-map-asset-owner-v3';
import type { MediaSourcePtsCadenceScanPublisherStateOwnerV3 }
  from './media-source-pts-cadence-scan-publisher-v3';
import type { MediaSourceQualificationRecordV1 }
  from './media-source-qualification-v1';
import {
  assertMediaSourceVersionEvidenceRecordV1,
  captureMediaSourceVersionEvidenceV1,
  mediaSourceVersionEvidenceScopeV1,
  persistMediaSourceVersionEvidenceV1,
  type MediaSourceVersionEvidenceRecordV1,
  type MediaSourceVersionEvidenceStorePortsV1,
} from './media-source-version-evidence-owner-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';

const MAX_EVIDENCE_CAS_ATTEMPTS_V3 = 2;

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
        await retainTerminalEvidence(candidate, input.evidenceStorePorts);
      }
      return input.stateOwner.persist(persistInput);
    },
  });
}

async function retainTerminalEvidence(
  candidate: MediaSourceVersionEvidenceRecordV1,
  ports: MediaSourceVersionEvidenceStorePortsV1,
): Promise<void> {
  const guardedPorts = guardedEvidencePorts(ports);
  const scope = mediaSourceVersionEvidenceScopeV1(candidate);
  for (let attempt = 1; attempt <= MAX_EVIDENCE_CAS_ATTEMPTS_V3; attempt += 1) {
    let current: MediaSourceVersionEvidenceRecordV1 | null;
    try {
      const loaded = await guardedPorts.load(scope);
      current = loaded === null
        ? null
        : assertMediaSourceVersionEvidenceRecordV1(loaded);
    } catch (error) {
      if (error instanceof EvidenceStorePortFailureV3) {
        throw failure(
          error.stage === 'LOAD'
            ? 'SOURCE_VERSION_EVIDENCE_STORE_LOAD_FAILED'
            : 'SOURCE_VERSION_EVIDENCE_STORE_CAS_FAILED',
          true,
        );
      }
      throw failure('SOURCE_VERSION_EVIDENCE_CURRENT_STATE_INVALID', false);
    }

    let result: Awaited<ReturnType<typeof persistMediaSourceVersionEvidenceV1>>;
    try {
      result = await persistMediaSourceVersionEvidenceV1({
        expectedEvidenceSha256: current?.evidenceSha256 ?? null,
        candidate,
      }, guardedPorts);
    } catch (error) {
      if (error instanceof EvidenceStorePortFailureV3) {
        throw failure(
          error.stage === 'LOAD'
            ? 'SOURCE_VERSION_EVIDENCE_STORE_LOAD_FAILED'
            : 'SOURCE_VERSION_EVIDENCE_STORE_CAS_FAILED',
          true,
        );
      }
      throw error;
    }
    if (result.disposition === 'APPLIED' || result.disposition === 'UNCHANGED') {
      return;
    }
    if (result.disposition === 'RACE_LOST'
      || (result.disposition === 'REJECTED'
        && result.reason === 'EXPECTED_STATE_MISMATCH')) {
      if (attempt < MAX_EVIDENCE_CAS_ATTEMPTS_V3) continue;
      throw failure('SOURCE_VERSION_EVIDENCE_RACE_EXHAUSTED', true);
    }
    if (result.reason === 'CURRENT_STATE_INVALID') {
      throw failure('SOURCE_VERSION_EVIDENCE_CURRENT_STATE_INVALID', false);
    }
    if (result.reason === 'CONFLICTING_EVIDENCE') {
      throw failure('SOURCE_VERSION_EVIDENCE_CONFLICT', false);
    }
    throw failure('SOURCE_VERSION_EVIDENCE_CANDIDATE_INVALID', false);
  }
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

function guardedEvidencePorts(
  ports: MediaSourceVersionEvidenceStorePortsV1,
): MediaSourceVersionEvidenceStorePortsV1 {
  return Object.freeze({
    load: async (scope) => {
      try {
        return await ports.load(scope);
      } catch {
        throw new EvidenceStorePortFailureV3('LOAD');
      }
    },
    compareAndSet: async (value) => {
      try {
        return await ports.compareAndSet(value);
      } catch {
        throw new EvidenceStorePortFailureV3('CAS');
      }
    },
  });
}

class EvidenceStorePortFailureV3 extends Error {
  constructor(public readonly stage: 'LOAD' | 'CAS') {
    super(`SOURCE_VERSION_EVIDENCE_STORE_${stage}_FAILED`);
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
