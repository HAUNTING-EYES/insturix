import {
  canonicalizeEditronJsonV1,
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaSourceAudioArtifactAssetSetV1,
  readMediaSourceAudioArtifactAssetStateV1,
  type MediaSourceAudioArtifactAssetSetV1,
  type MediaSourceAudioArtifactAssetStateInputV1,
} from './media-source-audio-artifact-asset-owner-v1';
import { createMediaSourceAudioStreamBindingV1 }
  from './media-source-audio-sample-epoch-map-v1';
import {
  createMediaSourceQualificationV1,
  MEDIA_SOURCE_QUALIFICATION_VERSION_V1,
  type MediaSourceQualificationRecordV1,
} from './media-source-qualification-v1';
import { MEDIA_SOURCE_PROBE_VERSION_V1 }
  from './media-source-probe-v1';
import { sameMediaSourceStorageVersionV1 }
  from './media-source-storage-version-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceOwnerV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';
import { readNativeMediaExactAudioStreamIndexesV1 }
  from './native-media-exact-audio-evidence-v1';

export const MEDIA_SOURCE_AUDIO_AVAILABILITY_EVIDENCE_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_AVAILABILITY_EVIDENCE_V1' as const;

export type MediaSourceAudioAvailabilityV1 = Readonly<
  | {
      disposition: 'NO_AUDIO_STREAMS_OBSERVED';
      technicalObservationSha256: string;
    }
  | {
      disposition: 'DECODED_ARTIFACT_SET';
      sourceAudioArtifactsV1: MediaSourceAudioArtifactAssetSetV1;
      sourceAudioArtifactsStateSha256V1: string;
    }
>;

export type MediaSourceAudioAvailabilityEvidenceV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_AUDIO_AVAILABILITY_EVIDENCE_KIND_V1;
  sourceVersionV1: Readonly<MediaSourceVersionV1>;
  sourceQualificationV1: Readonly<MediaSourceQualificationRecordV1>;
  availability: MediaSourceAudioAvailabilityV1;
  evidenceSha256: string;
}>;

export type MediaSourceAudioAvailabilityEvidenceScopeV1 = Readonly<{
  owner: MediaSourceOwnerV1;
  assetId: string;
  sourceVersionSha256: string;
}>;

export type MediaSourceAudioAvailabilityEvidenceStorePortsV1 = Readonly<{
  load(scope: MediaSourceAudioAvailabilityEvidenceScopeV1): Promise<unknown | null>;
  compareAndSet(input: Readonly<{
    scope: MediaSourceAudioAvailabilityEvidenceScopeV1;
    expectedEvidenceSha256: string | null;
    next: MediaSourceAudioAvailabilityEvidenceV1;
  }>): Promise<boolean>;
}>;

export type MediaSourceAudioAvailabilityEvidenceStoreResultV1 = Readonly<
  | {
      disposition: 'APPLIED' | 'UNCHANGED';
      record: MediaSourceAudioAvailabilityEvidenceV1;
    }
  | { disposition: 'RACE_LOST' }
  | {
      disposition: 'REJECTED';
      reason:
        | 'CANDIDATE_INVALID'
        | 'CURRENT_STATE_INVALID'
        | 'EXPECTED_STATE_MISMATCH'
        | 'CONFLICTING_EVIDENCE';
    }
>;

export type MediaSourceAudioAvailabilityRetentionResultV1 = Readonly<
  | {
      disposition: 'RETAINED';
      writeDisposition: 'APPLIED' | 'UNCHANGED';
      record: MediaSourceAudioAvailabilityEvidenceV1;
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

const MAX_CAS_ATTEMPTS_V1 = 2;

/**
 * Captures exactly one terminal audio state for one immutable source version.
 * Missing/unmaterialized audio is never converted into a no-audio statement.
 */
export function captureMediaSourceAudioAvailabilityEvidenceV1(
  asset: MediaSourceAudioArtifactAssetStateInputV1,
): MediaSourceAudioAvailabilityEvidenceV1 {
  const sourceVersionV1 = assertMediaSourceVersionV1(asset.sourceVersionV1);
  if ((sourceVersionV1.mediaKind !== 'video'
      && sourceVersionV1.mediaKind !== 'audio')
    || asset.assetId !== sourceVersionV1.assetId
    || asset.type !== sourceVersionV1.mediaKind) {
    fail('MEDIA_SOURCE_AUDIO_AVAILABILITY_ASSET_SCOPE_INVALID');
  }
  const sourceQualificationV1 = qualification(
    asset.sourceQualificationV1,
    sourceVersionV1,
  );
  const observedIndexes = readNativeMediaExactAudioStreamIndexesV1({
    ...asset,
    sourceVersionV1,
    sourceQualificationV1,
  });
  if (observedIndexes === null) {
    fail('MEDIA_SOURCE_AUDIO_AVAILABILITY_STREAM_OBSERVATION_INVALID');
  }
  for (const audioStreamIndex of observedIndexes) {
    createMediaSourceAudioStreamBindingV1({
      sourceVersion: sourceVersionV1,
      qualification: sourceQualificationV1,
      audioStreamIndex,
    });
  }

  const audioState = readMediaSourceAudioArtifactAssetStateV1({
    ...asset,
    sourceVersionV1,
    sourceQualificationV1,
  });
  let availability: MediaSourceAudioAvailabilityV1;
  if (observedIndexes.length === 0) {
    const observation = sourceQualificationV1.observation!;
    if (sourceVersionV1.mediaKind !== 'video'
      || observation.videoStreams.length === 0
      || !hasUniqueNonNegativeStreamIndexes(observation.videoStreams)
      || audioState !== null) {
      fail('MEDIA_SOURCE_AUDIO_AVAILABILITY_NO_AUDIO_PROOF_INVALID');
    }
    availability = frozen({
      disposition: 'NO_AUDIO_STREAMS_OBSERVED' as const,
      technicalObservationSha256: observation.observationSha256,
    });
  } else {
    if (audioState === null) {
      fail('MEDIA_SOURCE_AUDIO_AVAILABILITY_ARTIFACT_SET_MISSING');
    }
    const recordedIndexes = audioState.sourceAudioArtifactsV1.records.map(
      ({ audioStreamIndex }) => audioStreamIndex,
    );
    if (recordedIndexes.length !== observedIndexes.length
      || recordedIndexes.some((value, index) => value !== observedIndexes[index])) {
      fail('MEDIA_SOURCE_AUDIO_AVAILABILITY_ARTIFACT_SET_INCOMPLETE');
    }
    availability = frozen({
      disposition: 'DECODED_ARTIFACT_SET' as const,
      sourceAudioArtifactsV1: audioState.sourceAudioArtifactsV1,
      sourceAudioArtifactsStateSha256V1:
        audioState.sourceAudioArtifactsStateSha256V1,
    });
  }

  return buildRecord({
    sourceVersionV1,
    sourceQualificationV1,
    availability,
  });
}

export function assertMediaSourceAudioAvailabilityEvidenceV1(
  value: unknown,
): MediaSourceAudioAvailabilityEvidenceV1 {
  const record = objectRecord(
    value,
    'MEDIA_SOURCE_AUDIO_AVAILABILITY_RECORD_INVALID',
  );
  exactKeys(record, [
    'availability', 'evidenceSha256', 'kind', 'schemaVersion',
    'sourceQualificationV1', 'sourceVersionV1',
  ], 'MEDIA_SOURCE_AUDIO_AVAILABILITY_RECORD_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_SOURCE_AUDIO_AVAILABILITY_EVIDENCE_KIND_V1) {
    fail('MEDIA_SOURCE_AUDIO_AVAILABILITY_RECORD_IDENTITY_INVALID');
  }
  const sourceVersionV1 = assertMediaSourceVersionV1(record.sourceVersionV1);
  const sourceQualificationV1 = qualification(
    record.sourceQualificationV1,
    sourceVersionV1,
  );
  const availability = normalizeAvailability(record.availability);
  const rebuilt = captureMediaSourceAudioAvailabilityEvidenceV1({
    assetId: sourceVersionV1.assetId,
    type: sourceVersionV1.mediaKind,
    sourceVersionV1,
    sourceQualificationV1,
    ...(availability.disposition === 'DECODED_ARTIFACT_SET'
      ? {
          sourceAudioArtifactsV1: availability.sourceAudioArtifactsV1,
          sourceAudioArtifactsStateSha256V1:
            availability.sourceAudioArtifactsStateSha256V1,
        }
      : {}),
  });
  if (canonicalizeEditronJsonV1(rebuilt.availability)
      !== canonicalizeEditronJsonV1(availability)
    || rebuilt.evidenceSha256 !== sha256(
      record.evidenceSha256,
      'MEDIA_SOURCE_AUDIO_AVAILABILITY_HASH_INVALID',
    )) {
    fail('MEDIA_SOURCE_AUDIO_AVAILABILITY_HASH_OR_STATE_MISMATCH');
  }
  return rebuilt;
}

export function mediaSourceAudioAvailabilityEvidenceScopeV1(
  value: unknown,
): MediaSourceAudioAvailabilityEvidenceScopeV1 {
  const record = assertMediaSourceAudioAvailabilityEvidenceV1(value);
  return frozen({
    owner: record.sourceVersionV1.owner,
    assetId: record.sourceVersionV1.assetId,
    sourceVersionSha256: record.sourceVersionV1.sourceVersionSha256,
  });
}

export function mediaSourceAudioAvailabilityAssetViewV1(
  value: unknown,
): MediaSourceAudioArtifactAssetStateInputV1 {
  const record = assertMediaSourceAudioAvailabilityEvidenceV1(value);
  return frozen({
    assetId: record.sourceVersionV1.assetId,
    type: record.sourceVersionV1.mediaKind,
    sourceVersionV1: record.sourceVersionV1,
    sourceQualificationV1: record.sourceQualificationV1,
    ...(record.availability.disposition === 'DECODED_ARTIFACT_SET'
      ? {
          sourceAudioArtifactsV1:
            record.availability.sourceAudioArtifactsV1,
          sourceAudioArtifactsStateSha256V1:
            record.availability.sourceAudioArtifactsStateSha256V1,
        }
      : {}),
  });
}

export async function persistMediaSourceAudioAvailabilityEvidenceV1(
  input: Readonly<{
    expectedEvidenceSha256: string | null;
    candidate: unknown;
  }>,
  ports: MediaSourceAudioAvailabilityEvidenceStorePortsV1,
): Promise<MediaSourceAudioAvailabilityEvidenceStoreResultV1> {
  let candidate: MediaSourceAudioAvailabilityEvidenceV1;
  let expectedEvidenceSha256: string | null;
  try {
    candidate = assertMediaSourceAudioAvailabilityEvidenceV1(input.candidate);
    expectedEvidenceSha256 = nullableSha256(
      input.expectedEvidenceSha256,
      'MEDIA_SOURCE_AUDIO_AVAILABILITY_EXPECTED_HASH_INVALID',
    );
    assertPorts(ports);
  } catch {
    return frozen({
      disposition: 'REJECTED' as const,
      reason: 'CANDIDATE_INVALID' as const,
    });
  }
  const scope = mediaSourceAudioAvailabilityEvidenceScopeV1(candidate);
  const loaded = await ports.load(scope);
  let current: MediaSourceAudioAvailabilityEvidenceV1 | null;
  try {
    current = loaded === null
      ? null
      : assertMediaSourceAudioAvailabilityEvidenceV1(loaded);
  } catch {
    return frozen({
      disposition: 'REJECTED' as const,
      reason: 'CURRENT_STATE_INVALID' as const,
    });
  }
  if ((current?.evidenceSha256 ?? null) !== expectedEvidenceSha256) {
    return frozen({
      disposition: 'REJECTED' as const,
      reason: 'EXPECTED_STATE_MISMATCH' as const,
    });
  }
  if (current !== null) {
    if (current.evidenceSha256 === candidate.evidenceSha256) {
      return frozen({ disposition: 'UNCHANGED', record: current });
    }
    return frozen({
      disposition: 'REJECTED' as const,
      reason: 'CONFLICTING_EVIDENCE' as const,
    });
  }
  if (!await ports.compareAndSet({
    scope,
    expectedEvidenceSha256,
    next: candidate,
  })) {
    return frozen({ disposition: 'RACE_LOST' });
  }
  return frozen({ disposition: 'APPLIED', record: candidate });
}

export async function retainMediaSourceAudioAvailabilityEvidenceV1(
  candidateValue: unknown,
  ports: MediaSourceAudioAvailabilityEvidenceStorePortsV1,
): Promise<MediaSourceAudioAvailabilityRetentionResultV1> {
  let candidate: MediaSourceAudioAvailabilityEvidenceV1;
  try {
    candidate = assertMediaSourceAudioAvailabilityEvidenceV1(candidateValue);
    assertPorts(ports);
  } catch {
    return rejected('CANDIDATE_INVALID', false);
  }
  const guarded = guardedPorts(ports);
  const scope = mediaSourceAudioAvailabilityEvidenceScopeV1(candidate);
  for (let attempt = 1; attempt <= MAX_CAS_ATTEMPTS_V1; attempt += 1) {
    let loaded: unknown | null;
    try {
      loaded = await guarded.load(scope);
    } catch (error) {
      if (error instanceof StoreFailureV1) {
        return rejected('STORE_LOAD_FAILED', true);
      }
      throw error;
    }
    let current: MediaSourceAudioAvailabilityEvidenceV1 | null;
    try {
      current = loaded === null
        ? null
        : assertMediaSourceAudioAvailabilityEvidenceV1(loaded);
    } catch {
      return rejected('CURRENT_STATE_INVALID', false);
    }
    let result: MediaSourceAudioAvailabilityEvidenceStoreResultV1;
    try {
      result = await persistMediaSourceAudioAvailabilityEvidenceV1({
        expectedEvidenceSha256: current?.evidenceSha256 ?? null,
        candidate,
      }, guarded);
    } catch (error) {
      if (error instanceof StoreFailureV1) {
        return rejected(
          error.stage === 'LOAD' ? 'STORE_LOAD_FAILED' : 'STORE_CAS_FAILED',
          true,
        );
      }
      throw error;
    }
    if (result.disposition === 'APPLIED' || result.disposition === 'UNCHANGED') {
      return frozen({
        disposition: 'RETAINED',
        writeDisposition: result.disposition,
        record: result.record,
      });
    }
    if (result.disposition === 'RACE_LOST'
      || (result.disposition === 'REJECTED'
        && result.reason === 'EXPECTED_STATE_MISMATCH')) {
      if (attempt < MAX_CAS_ATTEMPTS_V1) continue;
      return rejected('RACE_EXHAUSTED', true);
    }
    if (result.disposition !== 'REJECTED') {
      fail('MEDIA_SOURCE_AUDIO_AVAILABILITY_STORE_RESULT_INVALID');
    }
    return rejected(
      result.reason === 'CURRENT_STATE_INVALID'
        ? 'CURRENT_STATE_INVALID'
        : result.reason === 'CONFLICTING_EVIDENCE'
          ? 'CONFLICTING_EVIDENCE'
          : 'CANDIDATE_INVALID',
      false,
    );
  }
  return rejected('RACE_EXHAUSTED', true);
}

type RecordMaterialV1 = Omit<
  MediaSourceAudioAvailabilityEvidenceV1,
  'schemaVersion' | 'kind' | 'evidenceSha256'
>;

function buildRecord(input: RecordMaterialV1): MediaSourceAudioAvailabilityEvidenceV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_AUDIO_AVAILABILITY_EVIDENCE_KIND_V1,
    sourceVersionV1: input.sourceVersionV1,
    sourceQualificationV1: input.sourceQualificationV1,
    availability: input.availability,
  };
  return frozen({
    ...material,
    evidenceSha256: hashEditronCanonicalJsonV1(material),
  });
}

function qualification(
  value: unknown,
  sourceVersion: Readonly<MediaSourceVersionV1>,
): Readonly<MediaSourceQualificationRecordV1> {
  const record = objectRecord(
    value,
    'MEDIA_SOURCE_AUDIO_AVAILABILITY_QUALIFICATION_INVALID',
  );
  exactKeys(record, [
    'assetId', 'attemptCount', 'completedAt', 'diagnostic', 'kind', 'locator',
    'observation', 'requestId', 'requestedAt', 'schemaVersion',
    'sourceBindingSha256', 'startedAt', 'status', 'storageVersion',
  ], 'MEDIA_SOURCE_AUDIO_AVAILABILITY_QUALIFICATION_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_SOURCE_QUALIFICATION_VERSION_V1
    || record.status !== 'MEASURED_TECHNICAL'
    || record.assetId !== sourceVersion.assetId
    || record.diagnostic !== null
    || !Number.isSafeInteger(record.attemptCount)
    || Number(record.attemptCount) < 1
    || !iso(record.requestedAt)
    || !iso(record.startedAt)
    || !iso(record.completedAt)) {
    fail('MEDIA_SOURCE_AUDIO_AVAILABILITY_QUALIFICATION_INVALID');
  }
  const qualification = record as unknown as MediaSourceQualificationRecordV1;
  if (qualification.storageVersion === null
    || !sameMediaSourceStorageVersionV1(
      qualification.storageVersion,
      sourceVersion.storageVersion,
    )
    || canonicalizeEditronJsonV1(qualification.storageVersion)
      !== canonicalizeEditronJsonV1(sourceVersion.storageVersion)) {
    fail('MEDIA_SOURCE_AUDIO_AVAILABILITY_STORAGE_VERSION_MISMATCH');
  }
  const rebuilt = createMediaSourceQualificationV1({
    asset: {
      assetId: sourceVersion.assetId,
      source: 'user-upload',
      ...(sourceVersion.storageVersion.locator.provider === 'R2'
        ? { r2Key: sourceVersion.storageVersion.locator.objectKey }
        : { gcsPath: sourceVersion.storageVersion.locator.objectKey }),
    },
    now: new Date(0),
  });
  if (rebuilt.disposition !== 'CREATED'
    || qualification.sourceBindingSha256 !== rebuilt.record.sourceBindingSha256
    || qualification.requestId !== rebuilt.record.requestId
    || canonicalizeEditronJsonV1(qualification.locator)
      !== canonicalizeEditronJsonV1(sourceVersion.storageVersion.locator)) {
    fail('MEDIA_SOURCE_AUDIO_AVAILABILITY_SOURCE_BINDING_MISMATCH');
  }
  const observation = objectRecord(
    qualification.observation,
    'MEDIA_SOURCE_AUDIO_AVAILABILITY_OBSERVATION_INVALID',
  );
  exactKeys(observation, [
    'audioStreams', 'durationMilliseconds', 'formatName', 'kind',
    'observationSha256', 'probeVersion', 'schemaVersion',
    'startTimeMilliseconds', 'videoStreams',
  ], 'MEDIA_SOURCE_AUDIO_AVAILABILITY_OBSERVATION_FIELDS_INVALID');
  const { observationSha256, ...observationMaterial } = observation;
  if (observation.schemaVersion !== 1
    || observation.kind !== MEDIA_SOURCE_PROBE_VERSION_V1
    || typeof observationSha256 !== 'string'
    || !Array.isArray(observation.audioStreams)
    || !Array.isArray(observation.videoStreams)
    || observationSha256 !== hashEditronCanonicalJsonV1(observationMaterial)) {
    fail('MEDIA_SOURCE_AUDIO_AVAILABILITY_OBSERVATION_INVALID');
  }
  if (Date.parse(qualification.requestedAt)
      > Date.parse(qualification.startedAt!)
    || Date.parse(qualification.startedAt!)
      > Date.parse(qualification.completedAt!)) {
    fail('MEDIA_SOURCE_AUDIO_AVAILABILITY_QUALIFICATION_TIME_INVALID');
  }
  return frozen(qualification);
}

function hasUniqueNonNegativeStreamIndexes(value: readonly unknown[]): boolean {
  const seen = new Set<number>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return false;
    }
    const streamIndex = (candidate as { streamIndex?: unknown }).streamIndex;
    if (!Number.isSafeInteger(streamIndex) || Number(streamIndex) < 0
      || seen.has(Number(streamIndex))) {
      return false;
    }
    seen.add(Number(streamIndex));
  }
  return true;
}

function normalizeAvailability(value: unknown): MediaSourceAudioAvailabilityV1 {
  const record = objectRecord(
    value,
    'MEDIA_SOURCE_AUDIO_AVAILABILITY_STATE_INVALID',
  );
  if (record.disposition === 'NO_AUDIO_STREAMS_OBSERVED') {
    exactKeys(record, [
      'disposition', 'technicalObservationSha256',
    ], 'MEDIA_SOURCE_AUDIO_AVAILABILITY_STATE_FIELDS_INVALID');
    return frozen({
      disposition: 'NO_AUDIO_STREAMS_OBSERVED' as const,
      technicalObservationSha256: sha256(
        record.technicalObservationSha256,
        'MEDIA_SOURCE_AUDIO_AVAILABILITY_OBSERVATION_HASH_INVALID',
      ),
    });
  }
  if (record.disposition === 'DECODED_ARTIFACT_SET') {
    exactKeys(record, [
      'disposition', 'sourceAudioArtifactsStateSha256V1',
      'sourceAudioArtifactsV1',
    ], 'MEDIA_SOURCE_AUDIO_AVAILABILITY_STATE_FIELDS_INVALID');
    return frozen({
      disposition: 'DECODED_ARTIFACT_SET' as const,
      sourceAudioArtifactsV1: assertMediaSourceAudioArtifactAssetSetV1(
        record.sourceAudioArtifactsV1,
      ),
      sourceAudioArtifactsStateSha256V1: sha256(
        record.sourceAudioArtifactsStateSha256V1,
        'MEDIA_SOURCE_AUDIO_AVAILABILITY_ARTIFACT_HASH_INVALID',
      ),
    });
  }
  fail('MEDIA_SOURCE_AUDIO_AVAILABILITY_DISPOSITION_INVALID');
}

function guardedPorts(
  ports: MediaSourceAudioAvailabilityEvidenceStorePortsV1,
): MediaSourceAudioAvailabilityEvidenceStorePortsV1 {
  return Object.freeze({
    load: async (scope) => {
      try {
        return await ports.load(scope);
      } catch {
        throw new StoreFailureV1('LOAD');
      }
    },
    compareAndSet: async (input) => {
      try {
        return await ports.compareAndSet(input);
      } catch {
        throw new StoreFailureV1('CAS');
      }
    },
  });
}

class StoreFailureV1 extends Error {
  constructor(public readonly stage: 'LOAD' | 'CAS') {
    super(`MEDIA_SOURCE_AUDIO_AVAILABILITY_STORE_${stage}_FAILED`);
  }
}

function assertPorts(ports: MediaSourceAudioAvailabilityEvidenceStorePortsV1): void {
  if (!ports || typeof ports.load !== 'function'
    || typeof ports.compareAndSet !== 'function') {
    fail('MEDIA_SOURCE_AUDIO_AVAILABILITY_PORTS_INVALID');
  }
}

function rejected(
  reason: Extract<
    MediaSourceAudioAvailabilityRetentionResultV1,
    { disposition: 'REJECTED' }
  >['reason'],
  retryable: boolean,
): MediaSourceAudioAvailabilityRetentionResultV1 {
  return frozen({ disposition: 'REJECTED' as const, reason, retryable });
}

function objectRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail(code);
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

function nullableSha256(value: unknown, code: string): string | null {
  return value === null ? null : sha256(value, code);
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(code);
  return value;
}

function iso(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value));
}

function fail(code: string): never {
  throw new Error(code);
}
