import {
  assertMediaSourceVersionEvidenceRecordV1,
  mediaSourceVersionEvidenceScopeV1,
  persistMediaSourceVersionEvidenceV1,
  type MediaSourceVersionEvidenceRecordV1,
  type MediaSourceVersionEvidenceStorePortsV1,
} from './media-source-version-evidence-owner-v1';

const MAX_EVIDENCE_CAS_ATTEMPTS_V1 = 2;

export type MediaSourceVersionEvidenceRetentionResultV1 = Readonly<
  | {
      disposition: 'RETAINED';
      writeDisposition: 'APPLIED' | 'UNCHANGED';
      record: MediaSourceVersionEvidenceRecordV1;
    }
  | {
      disposition: 'REJECTED';
      reason:
        | 'CANDIDATE_INVALID'
        | 'CURRENT_STATE_INVALID'
        | 'CONFLICTING_EVIDENCE'
        | 'RACE_EXHAUSTED'
        | 'STORE_LOAD_FAILED'
        | 'STORE_CAS_FAILED';
      retryable: boolean;
    }
>;

/** Shared bounded retention owner for terminal source-version evidence roots. */
export async function retainMediaSourceVersionEvidenceV1(
  candidateValue: unknown,
  ports: MediaSourceVersionEvidenceStorePortsV1,
): Promise<MediaSourceVersionEvidenceRetentionResultV1> {
  let candidate: MediaSourceVersionEvidenceRecordV1;
  try {
    candidate = assertMediaSourceVersionEvidenceRecordV1(candidateValue);
  } catch {
    return rejected('CANDIDATE_INVALID', false);
  }
  if (!ports || typeof ports.load !== 'function'
    || typeof ports.compareAndSet !== 'function') {
    throw new Error('MEDIA_SOURCE_VERSION_EVIDENCE_RETENTION_PORTS_INVALID');
  }
  const guardedPorts = guardedEvidencePorts(ports);
  const scope = mediaSourceVersionEvidenceScopeV1(candidate);
  for (let attempt = 1; attempt <= MAX_EVIDENCE_CAS_ATTEMPTS_V1; attempt += 1) {
    let loaded: unknown | null;
    try {
      loaded = await guardedPorts.load(scope);
    } catch (error) {
      if (error instanceof EvidenceStorePortFailureV1) {
        return rejected(
          error.stage === 'LOAD' ? 'STORE_LOAD_FAILED' : 'STORE_CAS_FAILED',
          true,
        );
      }
      throw error;
    }
    let current: MediaSourceVersionEvidenceRecordV1 | null;
    try {
      current = loaded === null
        ? null
        : assertMediaSourceVersionEvidenceRecordV1(loaded);
    } catch {
      return rejected('CURRENT_STATE_INVALID', false);
    }

    let result: Awaited<ReturnType<typeof persistMediaSourceVersionEvidenceV1>>;
    try {
      result = await persistMediaSourceVersionEvidenceV1({
        expectedEvidenceSha256: current?.evidenceSha256 ?? null,
        candidate,
      }, guardedPorts);
    } catch (error) {
      if (error instanceof EvidenceStorePortFailureV1) {
        return rejected(
          error.stage === 'LOAD' ? 'STORE_LOAD_FAILED' : 'STORE_CAS_FAILED',
          true,
        );
      }
      throw error;
    }
    if (result.disposition === 'APPLIED' || result.disposition === 'UNCHANGED') {
      return Object.freeze({
        disposition: 'RETAINED' as const,
        writeDisposition: result.disposition,
        record: result.record,
      });
    }
    if (result.disposition === 'RACE_LOST'
      || (result.disposition === 'REJECTED'
        && result.reason === 'EXPECTED_STATE_MISMATCH')) {
      if (attempt < MAX_EVIDENCE_CAS_ATTEMPTS_V1) continue;
      return rejected('RACE_EXHAUSTED', true);
    }
    if (result.reason === 'CURRENT_STATE_INVALID') {
      return rejected('CURRENT_STATE_INVALID', false);
    }
    if (result.reason === 'CONFLICTING_EVIDENCE') {
      return rejected('CONFLICTING_EVIDENCE', false);
    }
    return rejected('CANDIDATE_INVALID', false);
  }
  return rejected('RACE_EXHAUSTED', true);
}

function guardedEvidencePorts(
  ports: MediaSourceVersionEvidenceStorePortsV1,
): MediaSourceVersionEvidenceStorePortsV1 {
  return Object.freeze({
    load: async (scope) => {
      try {
        return await ports.load(scope);
      } catch {
        throw new EvidenceStorePortFailureV1('LOAD');
      }
    },
    compareAndSet: async (value) => {
      try {
        return await ports.compareAndSet(value);
      } catch {
        throw new EvidenceStorePortFailureV1('CAS');
      }
    },
  });
}

class EvidenceStorePortFailureV1 extends Error {
  constructor(public readonly stage: 'LOAD' | 'CAS') {
    super(`MEDIA_SOURCE_VERSION_EVIDENCE_STORE_${stage}_FAILED`);
  }
}

function rejected(
  reason: Extract<
    MediaSourceVersionEvidenceRetentionResultV1,
    { disposition: 'REJECTED' }
  >['reason'],
  retryable: boolean,
): MediaSourceVersionEvidenceRetentionResultV1 {
  return Object.freeze({ disposition: 'REJECTED' as const, reason, retryable });
}
