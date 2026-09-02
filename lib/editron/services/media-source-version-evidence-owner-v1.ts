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
import {
  assertMediaSourcePtsCadenceMapAssetRecordV3,
  readMediaSourcePtsCadenceMapAssetStateV3,
  type MediaSourcePtsCadenceMapAssetRecordV3,
} from './media-source-pts-cadence-map-asset-owner-v3';
import type { MediaSourceQualificationRecordV1 } from './media-source-qualification-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceOwnerV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';

export const MEDIA_SOURCE_VERSION_EVIDENCE_RECORD_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_VERSION_EVIDENCE_RECORD_V1' as const;

export type MediaSourceVersionEvidenceRecordV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_VERSION_EVIDENCE_RECORD_KIND_V1;
  sourceVersionV1: Readonly<MediaSourceVersionV1>;
  sourceQualificationV1: Readonly<MediaSourceQualificationRecordV1>;
  sourcePtsCadenceMapV3: MediaSourcePtsCadenceMapAssetRecordV3 | null;
  sourcePtsCadenceMapStateSha256V3: string | null;
  sourceAudioArtifactsV1: MediaSourceAudioArtifactAssetSetV1 | null;
  sourceAudioArtifactsStateSha256V1: string | null;
  evidenceSha256: string;
}>;

export type MediaSourceVersionEvidenceScopeV1 = Readonly<{
  owner: MediaSourceOwnerV1;
  assetId: string;
  sourceVersionSha256: string;
}>;

export type MediaSourceVersionEvidenceStorePortsV1 = Readonly<{
  load(scope: MediaSourceVersionEvidenceScopeV1): Promise<unknown | null>;
  compareAndSet(input: Readonly<{
    scope: MediaSourceVersionEvidenceScopeV1;
    expectedEvidenceSha256: string | null;
    next: MediaSourceVersionEvidenceRecordV1;
  }>): Promise<boolean>;
}>;

export type MediaSourceVersionEvidenceStoreResultV1 = Readonly<
  | { disposition: 'APPLIED'; record: MediaSourceVersionEvidenceRecordV1 }
  | { disposition: 'UNCHANGED'; record: MediaSourceVersionEvidenceRecordV1 }
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

/**
 * Captures only evidence that the existing active-asset owners can fully
 * revalidate. Non-terminal V3 state is never silently converted into a
 * historical root.
 */
export function captureMediaSourceVersionEvidenceV1(
  asset: MediaSourceAudioArtifactAssetStateInputV1,
): MediaSourceVersionEvidenceRecordV1 {
  const sourceVersionV1 = assertMediaSourceVersionV1(asset.sourceVersionV1);
  if (asset.assetId !== sourceVersionV1.assetId
    || asset.type !== sourceVersionV1.mediaKind) {
    fail('MEDIA_SOURCE_VERSION_EVIDENCE_ASSET_SCOPE_MISMATCH');
  }

  const v3State = readMediaSourcePtsCadenceMapAssetStateV3(asset);
  if (v3State !== null && v3State.sourcePtsCadenceMapV3.status !== 'COMPLETE') {
    fail('MEDIA_SOURCE_VERSION_EVIDENCE_V3_NOT_TERMINAL');
  }
  const audioState = readMediaSourceAudioArtifactAssetStateV1(asset);

  return buildRecord({
    sourceVersionV1,
    sourceQualificationV1: qualification(asset.sourceQualificationV1),
    sourcePtsCadenceMapV3: v3State?.sourcePtsCadenceMapV3 ?? null,
    sourcePtsCadenceMapStateSha256V3:
      v3State?.sourcePtsCadenceMapStateSha256V3 ?? null,
    sourceAudioArtifactsV1: audioState?.sourceAudioArtifactsV1 ?? null,
    sourceAudioArtifactsStateSha256V1:
      audioState?.sourceAudioArtifactsStateSha256V1 ?? null,
  });
}

export function assertMediaSourceVersionEvidenceRecordV1(
  value: unknown,
): MediaSourceVersionEvidenceRecordV1 {
  const record = objectRecord(value, 'MEDIA_SOURCE_VERSION_EVIDENCE_RECORD_INVALID');
  exactKeys(record, [
    'evidenceSha256', 'kind', 'schemaVersion', 'sourceAudioArtifactsStateSha256V1',
    'sourceAudioArtifactsV1', 'sourcePtsCadenceMapStateSha256V3',
    'sourcePtsCadenceMapV3', 'sourceQualificationV1', 'sourceVersionV1',
  ], 'MEDIA_SOURCE_VERSION_EVIDENCE_RECORD_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_SOURCE_VERSION_EVIDENCE_RECORD_KIND_V1) {
    fail('MEDIA_SOURCE_VERSION_EVIDENCE_RECORD_IDENTITY_INVALID');
  }

  const sourcePtsCadenceMapV3 = record.sourcePtsCadenceMapV3 === null
    ? null
    : assertMediaSourcePtsCadenceMapAssetRecordV3(record.sourcePtsCadenceMapV3);
  const sourceAudioArtifactsV1 = record.sourceAudioArtifactsV1 === null
    ? null
    : assertMediaSourceAudioArtifactAssetSetV1(record.sourceAudioArtifactsV1);
  const rebuilt = buildRecord({
    sourceVersionV1: assertMediaSourceVersionV1(record.sourceVersionV1),
    sourceQualificationV1: qualification(record.sourceQualificationV1),
    sourcePtsCadenceMapV3,
    sourcePtsCadenceMapStateSha256V3: nullableSha256(
      record.sourcePtsCadenceMapStateSha256V3,
      'MEDIA_SOURCE_VERSION_EVIDENCE_V3_STATE_HASH_INVALID',
    ),
    sourceAudioArtifactsV1,
    sourceAudioArtifactsStateSha256V1: nullableSha256(
      record.sourceAudioArtifactsStateSha256V1,
      'MEDIA_SOURCE_VERSION_EVIDENCE_AUDIO_STATE_HASH_INVALID',
    ),
  });
  if (rebuilt.evidenceSha256 !== sha256(
    record.evidenceSha256,
    'MEDIA_SOURCE_VERSION_EVIDENCE_HASH_INVALID',
  )) {
    fail('MEDIA_SOURCE_VERSION_EVIDENCE_HASH_MISMATCH');
  }
  return rebuilt;
}

/** Returns the exact immutable source view expected by the existing V3/audio readers. */
export function mediaSourceVersionEvidenceAssetViewV1(
  value: unknown,
): MediaSourceAudioArtifactAssetStateInputV1 {
  return assetView(assertMediaSourceVersionEvidenceRecordV1(value));
}

/** Existing roots are immutable. A later capture may only add a missing root. */
export function mergeMediaSourceVersionEvidenceV1(
  currentValue: unknown,
  candidateValue: unknown,
): MediaSourceVersionEvidenceRecordV1 {
  const current = assertMediaSourceVersionEvidenceRecordV1(currentValue);
  const candidate = assertMediaSourceVersionEvidenceRecordV1(candidateValue);
  if (canonicalizeEditronJsonV1(current.sourceVersionV1)
      !== canonicalizeEditronJsonV1(candidate.sourceVersionV1)
    || canonicalizeEditronJsonV1(current.sourceQualificationV1)
      !== canonicalizeEditronJsonV1(candidate.sourceQualificationV1)) {
    fail('MEDIA_SOURCE_VERSION_EVIDENCE_SCOPE_MISMATCH');
  }

  const video = mergeRoot(
    current.sourcePtsCadenceMapV3,
    current.sourcePtsCadenceMapStateSha256V3,
    candidate.sourcePtsCadenceMapV3,
    candidate.sourcePtsCadenceMapStateSha256V3,
    'V3',
  );
  const audio = mergeRoot(
    current.sourceAudioArtifactsV1,
    current.sourceAudioArtifactsStateSha256V1,
    candidate.sourceAudioArtifactsV1,
    candidate.sourceAudioArtifactsStateSha256V1,
    'AUDIO',
  );
  return buildRecord({
    sourceVersionV1: current.sourceVersionV1,
    sourceQualificationV1: current.sourceQualificationV1,
    sourcePtsCadenceMapV3: video.value,
    sourcePtsCadenceMapStateSha256V3: video.hash,
    sourceAudioArtifactsV1: audio.value,
    sourceAudioArtifactsStateSha256V1: audio.hash,
  });
}

export function mediaSourceVersionEvidenceScopeV1(
  value: unknown,
): MediaSourceVersionEvidenceScopeV1 {
  const record = assertMediaSourceVersionEvidenceRecordV1(value);
  return frozen({
    owner: record.sourceVersionV1.owner,
    assetId: record.sourceVersionV1.assetId,
    sourceVersionSha256: record.sourceVersionV1.sourceVersionSha256,
  });
}

export async function persistMediaSourceVersionEvidenceV1(
  input: Readonly<{
    expectedEvidenceSha256: string | null;
    candidate: unknown;
  }>,
  ports: MediaSourceVersionEvidenceStorePortsV1,
): Promise<MediaSourceVersionEvidenceStoreResultV1> {
  let candidate: MediaSourceVersionEvidenceRecordV1;
  let expectedEvidenceSha256: string | null;
  try {
    candidate = assertMediaSourceVersionEvidenceRecordV1(input.candidate);
    expectedEvidenceSha256 = nullableSha256(
      input.expectedEvidenceSha256,
      'MEDIA_SOURCE_VERSION_EVIDENCE_EXPECTED_HASH_INVALID',
    );
    if (!ports || typeof ports.load !== 'function'
      || typeof ports.compareAndSet !== 'function') {
      throw new Error('MEDIA_SOURCE_VERSION_EVIDENCE_PORTS_INVALID');
    }
  } catch {
    return { disposition: 'REJECTED', reason: 'CANDIDATE_INVALID' };
  }

  const scope = mediaSourceVersionEvidenceScopeV1(candidate);
  const loaded = await ports.load(scope);
  let current: MediaSourceVersionEvidenceRecordV1 | null;
  try {
    current = loaded === null
      ? null
      : assertMediaSourceVersionEvidenceRecordV1(loaded);
  } catch {
    return { disposition: 'REJECTED', reason: 'CURRENT_STATE_INVALID' };
  }
  if ((current?.evidenceSha256 ?? null) !== expectedEvidenceSha256) {
    return { disposition: 'REJECTED', reason: 'EXPECTED_STATE_MISMATCH' };
  }

  let next: MediaSourceVersionEvidenceRecordV1;
  try {
    next = current === null
      ? candidate
      : mergeMediaSourceVersionEvidenceV1(current, candidate);
  } catch (error) {
    if (!isEvidenceConflict(error)) throw error;
    return { disposition: 'REJECTED', reason: 'CONFLICTING_EVIDENCE' };
  }
  if (current?.evidenceSha256 === next.evidenceSha256) {
    return { disposition: 'UNCHANGED', record: current };
  }
  if (!await ports.compareAndSet({
    scope,
    expectedEvidenceSha256,
    next,
  })) {
    return { disposition: 'RACE_LOST' };
  }
  return { disposition: 'APPLIED', record: next };
}

type RecordMaterialV1 = Omit<
  MediaSourceVersionEvidenceRecordV1,
  'schemaVersion' | 'kind' | 'evidenceSha256'
>;

function buildRecord(input: RecordMaterialV1): MediaSourceVersionEvidenceRecordV1 {
  const sourceVersionV1 = assertMediaSourceVersionV1(input.sourceVersionV1);
  const sourceQualificationV1 = qualification(input.sourceQualificationV1);
  const sourcePtsCadenceMapV3 = input.sourcePtsCadenceMapV3 === null
    ? null
    : assertMediaSourcePtsCadenceMapAssetRecordV3(input.sourcePtsCadenceMapV3);
  const sourcePtsCadenceMapStateSha256V3 = nullableSha256(
    input.sourcePtsCadenceMapStateSha256V3,
    'MEDIA_SOURCE_VERSION_EVIDENCE_V3_STATE_HASH_INVALID',
  );
  const sourceAudioArtifactsV1 = input.sourceAudioArtifactsV1 === null
    ? null
    : assertMediaSourceAudioArtifactAssetSetV1(input.sourceAudioArtifactsV1);
  const sourceAudioArtifactsStateSha256V1 = nullableSha256(
    input.sourceAudioArtifactsStateSha256V1,
    'MEDIA_SOURCE_VERSION_EVIDENCE_AUDIO_STATE_HASH_INVALID',
  );
  if ((sourcePtsCadenceMapV3 === null)
      !== (sourcePtsCadenceMapStateSha256V3 === null)
    || (sourceAudioArtifactsV1 === null)
      !== (sourceAudioArtifactsStateSha256V1 === null)
    || (sourcePtsCadenceMapV3 === null && sourceAudioArtifactsV1 === null)) {
    fail('MEDIA_SOURCE_VERSION_EVIDENCE_ROOTS_INCOMPLETE');
  }

  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_VERSION_EVIDENCE_RECORD_KIND_V1,
    sourceVersionV1,
    sourceQualificationV1,
    sourcePtsCadenceMapV3,
    sourcePtsCadenceMapStateSha256V3,
    sourceAudioArtifactsV1,
    sourceAudioArtifactsStateSha256V1,
  };
  validateAssetView(material);
  return frozen({
    ...material,
    evidenceSha256: hashEditronCanonicalJsonV1(material),
  });
}

function validateAssetView(record: Omit<MediaSourceVersionEvidenceRecordV1, 'evidenceSha256'>): void {
  const view = assetView(record);
  if (record.sourcePtsCadenceMapV3 !== null) {
    const state = readMediaSourcePtsCadenceMapAssetStateV3(view);
    if (state === null || state.sourcePtsCadenceMapV3.status !== 'COMPLETE'
      || state.sourcePtsCadenceMapStateSha256V3
        !== record.sourcePtsCadenceMapStateSha256V3) {
      fail('MEDIA_SOURCE_VERSION_EVIDENCE_V3_ROOT_INVALID');
    }
  }
  if (record.sourceAudioArtifactsV1 !== null) {
    const state = readMediaSourceAudioArtifactAssetStateV1(view);
    if (state === null || state.sourceAudioArtifactsStateSha256V1
      !== record.sourceAudioArtifactsStateSha256V1) {
      fail('MEDIA_SOURCE_VERSION_EVIDENCE_AUDIO_ROOT_INVALID');
    }
  }
}

function assetView(
  record: Omit<MediaSourceVersionEvidenceRecordV1, 'evidenceSha256'>
    | MediaSourceVersionEvidenceRecordV1,
): MediaSourceAudioArtifactAssetStateInputV1 {
  return frozen({
    assetId: record.sourceVersionV1.assetId,
    type: record.sourceVersionV1.mediaKind,
    sourceVersionV1: record.sourceVersionV1,
    sourceQualificationV1: record.sourceQualificationV1,
    sourcePtsCadenceMapV3: record.sourcePtsCadenceMapV3,
    sourcePtsCadenceMapStateSha256V3: record.sourcePtsCadenceMapStateSha256V3,
    sourceAudioArtifactsV1: record.sourceAudioArtifactsV1,
    sourceAudioArtifactsStateSha256V1:
      record.sourceAudioArtifactsStateSha256V1,
  });
}

function mergeRoot<T>(
  currentValue: T | null,
  currentHash: string | null,
  candidateValue: T | null,
  candidateHash: string | null,
  family: 'V3' | 'AUDIO',
): Readonly<{ value: T | null; hash: string | null }> {
  if (currentValue === null) return { value: candidateValue, hash: candidateHash };
  if (candidateValue === null) return { value: currentValue, hash: currentHash };
  if (currentHash !== candidateHash
    || canonicalizeEditronJsonV1(currentValue)
      !== canonicalizeEditronJsonV1(candidateValue)) {
    fail(`MEDIA_SOURCE_VERSION_EVIDENCE_${family}_ROOT_CONFLICT`);
  }
  return { value: currentValue, hash: currentHash };
}

function qualification(value: unknown): Readonly<MediaSourceQualificationRecordV1> {
  objectRecord(value, 'MEDIA_SOURCE_VERSION_EVIDENCE_QUALIFICATION_INVALID');
  return frozen(value as MediaSourceQualificationRecordV1);
}

function isEvidenceConflict(error: unknown): boolean {
  return error instanceof Error && (
    error.message === 'MEDIA_SOURCE_VERSION_EVIDENCE_SCOPE_MISMATCH'
    || error.message === 'MEDIA_SOURCE_VERSION_EVIDENCE_V3_ROOT_CONFLICT'
    || error.message === 'MEDIA_SOURCE_VERSION_EVIDENCE_AUDIO_ROOT_CONFLICT'
  );
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

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value));
}

function fail(code: string): never {
  throw new Error(code);
}
