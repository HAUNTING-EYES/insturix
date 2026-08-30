import {
  parseCanonicalMediaTimeV1,
  parsePresentationEpochV1,
  type CanonicalMediaTimeV1,
  type ExactRationalRateV1,
  type PresentationEpochV1,
} from '../contracts/canonical-media-time-v1';

import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_KIND_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_V3' as const;
export const MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_SIDECAR_KIND_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_SIDECAR_V3' as const;
export const MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_ABSOLUTE_MAX_BYTES_V3 =
  8 * 1024 * 1024;

export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_BASES_V3 = [
  'FIRST_DECODED_PRESENTATION',
  'PTS_DELTA',
  'DEMUXER_DISCONTINUITY_MARKER',
  'COUNTER_WRAP_METADATA',
  'CONTAINER_EDIT_LIST',
] as const;

export type MediaSourcePtsCadenceEpochBoundaryBasisV3 =
  typeof MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_BASES_V3[number];

export type MediaSourcePtsCadenceBoundaryEvidenceSidecarV3 = Readonly<{
  schemaVersion: 3;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_SIDECAR_KIND_V3;
  evidenceContractVersion: string;
  storage: 'R2_PRIVATE' | 'GCS_PRIVATE';
  objectKey: string;
  byteLength: number;
  contentSha256: string;
  mapBindingSha256: string;
  epochId: string;
}>;

export type MediaSourcePtsCadenceEpochBoundaryV3 = Readonly<{
  schemaVersion: 3;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_KIND_V3;
  epochId: string;
  previousEpochId: string | null;
  boundaryKind: PresentationEpochV1['boundaryKind'];
  classificationBasis: MediaSourcePtsCadenceEpochBoundaryBasisV3;
  detectorVersion: string;
  previousEndPresentationTimestampTicks: string | null;
  nextStartPresentationTimestampTicks: string;
  previousBatchContentSha256: string | null;
  nextBatchContentSha256: string;
  externalEvidence: MediaSourcePtsCadenceBoundaryEvidenceSidecarV3 | null;
  boundaryEvidenceSha256: string;
}>;

export type CreateMediaSourcePtsCadenceEpochBoundaryInputV3 = Readonly<{
  epoch: PresentationEpochV1;
  previousEpoch: PresentationEpochV1 | null;
  classificationBasis: MediaSourcePtsCadenceEpochBoundaryBasisV3;
  detectorVersion: string;
  previousBatchContentSha256: string | null;
  nextBatchContentSha256: string;
  externalEvidence: MediaSourcePtsCadenceBoundaryEvidenceSidecarV3 | null;
}>;

export type MediaSourcePtsCadenceDirectEpochBoundaryKindV3 =
  | 'INITIAL'
  | 'GAP'
  | 'OVERLAP';

/**
 * Derives the exact reduced canonical start owned by the direct V3 mapper.
 * Only arithmetic-proven INITIAL/GAP/OVERLAP boundaries are admitted here;
 * reset, wrap and edit-list handoffs require their separate evidence owners.
 */
export function deriveMediaSourcePtsCadenceEpochCanonicalStartTimeV3(
  input: Readonly<{
    previousEpoch: PresentationEpochV1 | null;
    boundaryKind: MediaSourcePtsCadenceDirectEpochBoundaryKindV3;
    nextStartPresentationTimestampTicks: string;
  }>,
): CanonicalMediaTimeV1 {
  const nextStart = BigInt(signedIntegerText(
    input.nextStartPresentationTimestampTicks,
    'MEDIA_SOURCE_PTS_CADENCE_EPOCH_CANONICAL_NEXT_PTS_INVALID',
  ));
  if (input.previousEpoch === null) {
    if (input.boundaryKind !== 'INITIAL') {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_CANONICAL_PREDECESSOR_REQUIRED');
    }
    return parseCanonicalMediaTimeV1({ ticks: '0', timescale: '1' });
  }
  if (input.boundaryKind === 'INITIAL') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_CANONICAL_INITIAL_PREDECESSOR_INVALID');
  }

  const previousEpoch = normalizedEpoch(input.previousEpoch);
  const previousCanonicalEnd = canonicalEnd(previousEpoch);
  const sourceDelta = nextStart
    - BigInt(previousEpoch.sourceEndExclusivePresentationTimestampTicks);
  if (input.boundaryKind === 'GAP') {
    if (sourceDelta <= BigInt(0)) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_GAP_SOURCE_DELTA_INVALID');
    }
    return canonicalTime(addFraction(
      previousCanonicalEnd,
      fraction(
        sourceDelta * BigInt(previousEpoch.secondsPerSourceTick.numerator),
        BigInt(previousEpoch.secondsPerSourceTick.denominator),
      ),
    ));
  }
  if (sourceDelta >= BigInt(0)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_BACKWARD_DELTA_REQUIRED');
  }
  return canonicalTime(previousCanonicalEnd);
}

/**
 * Creates a hash-bound discontinuity declaration from adjacent immutable
 * frame-batch identities. PTS arithmetic may prove a gap or overlap; reset,
 * wrap, and edit-list causes require an independently recoverable evidence
 * sidecar reference.
 */
export function createMediaSourcePtsCadenceEpochBoundaryV3(
  input: CreateMediaSourcePtsCadenceEpochBoundaryInputV3,
): MediaSourcePtsCadenceEpochBoundaryV3 {
  const epoch = normalizedEpoch(input.epoch);
  const previousEpoch = input.previousEpoch === null
    ? null
    : normalizedEpoch(input.previousEpoch);
  const material = {
    schemaVersion: 3 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_KIND_V3,
    epochId: epoch.epochId,
    previousEpochId: previousEpoch?.epochId ?? null,
    boundaryKind: epoch.boundaryKind,
    classificationBasis: boundaryBasis(input.classificationBasis),
    detectorVersion: boundedText(
      input.detectorVersion,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_DETECTOR_INVALID',
    ),
    previousEndPresentationTimestampTicks:
      previousEpoch?.sourceEndExclusivePresentationTimestampTicks ?? null,
    nextStartPresentationTimestampTicks: epoch.sourceStartPresentationTimestampTicks,
    previousBatchContentSha256: input.previousBatchContentSha256 === null
      ? null
      : sha256(
          input.previousBatchContentSha256,
          'MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_PREVIOUS_BATCH_HASH_INVALID',
        ),
    nextBatchContentSha256: sha256(
      input.nextBatchContentSha256,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_NEXT_BATCH_HASH_INVALID',
    ),
    externalEvidence: input.externalEvidence === null
      ? null
      : assertMediaSourcePtsCadenceBoundaryEvidenceSidecarV3(input.externalEvidence),
  };
  const boundary = assertMediaSourcePtsCadenceEpochBoundaryV3({
    ...material,
    boundaryEvidenceSha256: hashEditronCanonicalJsonV1(material),
  });
  assertMediaSourcePtsCadenceEpochHandoffV3({ previousEpoch, epoch, boundary });
  return boundary;
}

export function assertMediaSourcePtsCadenceEpochBoundaryV3(
  value: unknown,
): MediaSourcePtsCadenceEpochBoundaryV3 {
  const record = objectRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_INVALID');
  exactKeys(record, [
    'boundaryEvidenceSha256', 'boundaryKind', 'classificationBasis',
    'detectorVersion', 'epochId', 'externalEvidence', 'kind',
    'nextBatchContentSha256', 'nextStartPresentationTimestampTicks',
    'previousBatchContentSha256', 'previousEndPresentationTimestampTicks',
    'previousEpochId', 'schemaVersion',
  ], 'MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_FIELDS_INVALID');
  if (record.schemaVersion !== 3
    || record.kind !== MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_KIND_V3) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_INVALID');
  }
  const boundaryKind = presentationBoundaryKind(record.boundaryKind);
  const material = {
    schemaVersion: 3 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_KIND_V3,
    epochId: identifier(record.epochId, 'MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_EPOCH_INVALID'),
    previousEpochId: nullableIdentifier(
      record.previousEpochId,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_PREVIOUS_EPOCH_INVALID',
    ),
    boundaryKind,
    classificationBasis: boundaryBasis(record.classificationBasis),
    detectorVersion: boundedText(
      record.detectorVersion,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_DETECTOR_INVALID',
    ),
    previousEndPresentationTimestampTicks: nullableSignedIntegerText(
      record.previousEndPresentationTimestampTicks,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_PREVIOUS_PTS_INVALID',
    ),
    nextStartPresentationTimestampTicks: signedIntegerText(
      record.nextStartPresentationTimestampTicks,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_NEXT_PTS_INVALID',
    ),
    previousBatchContentSha256: nullableSha256(
      record.previousBatchContentSha256,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_PREVIOUS_BATCH_HASH_INVALID',
    ),
    nextBatchContentSha256: sha256(
      record.nextBatchContentSha256,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_NEXT_BATCH_HASH_INVALID',
    ),
    externalEvidence: record.externalEvidence === null
      ? null
      : assertMediaSourcePtsCadenceBoundaryEvidenceSidecarV3(record.externalEvidence),
  };
  assertBasisAndEvidence(material);
  if (record.boundaryEvidenceSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_HASH_MISMATCH');
  }
  return frozen({
    ...material,
    boundaryEvidenceSha256: record.boundaryEvidenceSha256 as string,
  });
}

export function createMediaSourcePtsCadenceBoundaryEvidenceSidecarV3(input: Readonly<{
  evidenceContractVersion: string;
  storage: MediaSourcePtsCadenceBoundaryEvidenceSidecarV3['storage'];
  byteLength: number;
  contentSha256: string;
  mapBindingSha256: string;
  epochId: string;
}>): MediaSourcePtsCadenceBoundaryEvidenceSidecarV3 {
  const material = {
    schemaVersion: 3 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_SIDECAR_KIND_V3,
    evidenceContractVersion: boundedText(
      input.evidenceContractVersion,
      'MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_CONTRACT_INVALID',
    ),
    storage: privateStorage(input.storage),
    byteLength: positiveSafeIntegerInRange(
      input.byteLength,
      MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_ABSOLUTE_MAX_BYTES_V3,
      'MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_BYTES_INVALID',
    ),
    contentSha256: sha256(
      input.contentSha256,
      'MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_CONTENT_HASH_INVALID',
    ),
    mapBindingSha256: sha256(
      input.mapBindingSha256,
      'MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_MAP_BINDING_INVALID',
    ),
    epochId: identifier(
      input.epochId,
      'MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_EPOCH_INVALID',
    ),
  };
  return frozen({
    ...material,
    objectKey: expectedMediaSourcePtsCadenceBoundaryEvidenceObjectKeyV3(
      material.mapBindingSha256,
      material.epochId,
      material.contentSha256,
    ),
  });
}

export function assertMediaSourcePtsCadenceBoundaryEvidenceSidecarV3(
  value: unknown,
): MediaSourcePtsCadenceBoundaryEvidenceSidecarV3 {
  const record = objectRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_INVALID');
  exactKeys(record, [
    'byteLength', 'contentSha256', 'epochId', 'evidenceContractVersion',
    'kind', 'mapBindingSha256', 'objectKey', 'schemaVersion', 'storage',
  ], 'MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_FIELDS_INVALID');
  const material = {
    schemaVersion: 3 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_SIDECAR_KIND_V3,
    evidenceContractVersion: boundedText(
      record.evidenceContractVersion,
      'MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_CONTRACT_INVALID',
    ),
    storage: privateStorage(record.storage),
    byteLength: positiveSafeIntegerInRange(
      record.byteLength,
      MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_ABSOLUTE_MAX_BYTES_V3,
      'MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_BYTES_INVALID',
    ),
    contentSha256: sha256(
      record.contentSha256,
      'MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_CONTENT_HASH_INVALID',
    ),
    mapBindingSha256: sha256(
      record.mapBindingSha256,
      'MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_MAP_BINDING_INVALID',
    ),
    epochId: identifier(
      record.epochId,
      'MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_EPOCH_INVALID',
    ),
  };
  if (record.schemaVersion !== 3
    || record.kind !== material.kind
    || record.objectKey !== expectedMediaSourcePtsCadenceBoundaryEvidenceObjectKeyV3(
      material.mapBindingSha256,
      material.epochId,
      material.contentSha256,
    )) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_BINDING_INVALID');
  }
  return frozen({ ...material, objectKey: record.objectKey as string });
}

export function expectedMediaSourcePtsCadenceBoundaryEvidenceObjectKeyV3(
  mapBindingSha256: string,
  epochId: string,
  contentSha256: string,
): string {
  const normalizedEpochId = identifier(
    epochId,
    'MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_EPOCH_INVALID',
  );
  return `private/editron/media-source-pts-cadence/v3/${sha256(
    mapBindingSha256,
    'MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_MAP_BINDING_INVALID',
  )}/boundary-evidence/${hashEditronCanonicalJsonV1({ epochId: normalizedEpochId })}/${sha256(
    contentSha256,
    'MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_CONTENT_HASH_INVALID',
  )}.json`;
}

/**
 * Validates the exact source-PTS and canonical-time handoff between epochs.
 * Canonical ranges may never overlap. Gaps preserve their source-time length;
 * backward discontinuities resume at the preceding canonical end.
 */
export function assertMediaSourcePtsCadenceEpochHandoffV3(input: Readonly<{
  previousEpoch: PresentationEpochV1 | null;
  epoch: PresentationEpochV1;
  boundary: MediaSourcePtsCadenceEpochBoundaryV3;
}>): void {
  const epoch = normalizedEpoch(input.epoch);
  const previousEpoch = input.previousEpoch === null
    ? null
    : normalizedEpoch(input.previousEpoch);
  const boundary = assertMediaSourcePtsCadenceEpochBoundaryV3(input.boundary);
  if (boundary.epochId !== epoch.epochId
    || boundary.boundaryKind !== epoch.boundaryKind
    || boundary.nextStartPresentationTimestampTicks
      !== epoch.sourceStartPresentationTimestampTicks) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_EPOCH_MISMATCH');
  }
  if (previousEpoch === null) {
    if (epoch.boundaryKind !== 'INITIAL'
      || boundary.previousEpochId !== null
      || boundary.previousEndPresentationTimestampTicks !== null
      || boundary.previousBatchContentSha256 !== null
      || compareFraction(canonicalFraction(epoch.canonicalStartTime), fraction(BigInt(0), BigInt(1))) !== 0) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_INITIAL_INVALID');
    }
    return;
  }
  if (epoch.boundaryKind === 'INITIAL'
    || previousEpoch.streamId !== epoch.streamId
    || !sameRate(previousEpoch.secondsPerSourceTick, epoch.secondsPerSourceTick)
    || boundary.previousEpochId !== previousEpoch.epochId
    || boundary.previousEndPresentationTimestampTicks
      !== previousEpoch.sourceEndExclusivePresentationTimestampTicks
    || boundary.previousBatchContentSha256 === null) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_PREDECESSOR_MISMATCH');
  }

  const previousCanonicalEnd = canonicalEnd(previousEpoch);
  const nextCanonicalStart = canonicalFraction(epoch.canonicalStartTime);
  if (compareFraction(nextCanonicalStart, previousCanonicalEnd) < 0) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_CANONICAL_OVERLAP');
  }
  const sourceDelta = BigInt(epoch.sourceStartPresentationTimestampTicks)
    - BigInt(previousEpoch.sourceEndExclusivePresentationTimestampTicks);
  if (epoch.boundaryKind === 'GAP') {
    if (sourceDelta <= BigInt(0)) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_GAP_SOURCE_DELTA_INVALID');
    }
    const expectedStart = canonicalFraction(
      deriveMediaSourcePtsCadenceEpochCanonicalStartTimeV3({
        previousEpoch,
        boundaryKind: 'GAP',
        nextStartPresentationTimestampTicks:
          epoch.sourceStartPresentationTimestampTicks,
      }),
    );
    if (compareFraction(nextCanonicalStart, expectedStart) !== 0) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_GAP_CANONICAL_DURATION_MISMATCH');
    }
    return;
  }
  if (epoch.boundaryKind === 'OVERLAP'
    || epoch.boundaryKind === 'TIMESTAMP_RESET'
    || epoch.boundaryKind === 'WRAP') {
    if (sourceDelta >= BigInt(0)) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_BACKWARD_DELTA_REQUIRED');
    }
    const expectedStart = epoch.boundaryKind === 'OVERLAP'
      ? canonicalFraction(deriveMediaSourcePtsCadenceEpochCanonicalStartTimeV3({
          previousEpoch,
          boundaryKind: 'OVERLAP',
          nextStartPresentationTimestampTicks:
            epoch.sourceStartPresentationTimestampTicks,
        }))
      : previousCanonicalEnd;
    if (compareFraction(nextCanonicalStart, expectedStart) !== 0) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_BACKWARD_CANONICAL_HANDOFF_INVALID');
    }
  }
}

function normalizedEpoch(value: PresentationEpochV1): PresentationEpochV1 {
  const epoch = parsePresentationEpochV1(value);
  assertReducedCanonicalTime(epoch.canonicalStartTime);
  return epoch;
}

function assertBasisAndEvidence(
  boundary: Omit<MediaSourcePtsCadenceEpochBoundaryV3, 'boundaryEvidenceSha256'>,
): void {
  const expectedBasis: Record<PresentationEpochV1['boundaryKind'], MediaSourcePtsCadenceEpochBoundaryBasisV3> = {
    INITIAL: 'FIRST_DECODED_PRESENTATION',
    GAP: 'PTS_DELTA',
    OVERLAP: 'PTS_DELTA',
    TIMESTAMP_RESET: 'DEMUXER_DISCONTINUITY_MARKER',
    WRAP: 'COUNTER_WRAP_METADATA',
    EDIT_LIST: 'CONTAINER_EDIT_LIST',
  };
  const needsExternalEvidence = boundary.boundaryKind === 'TIMESTAMP_RESET'
    || boundary.boundaryKind === 'WRAP'
    || boundary.boundaryKind === 'EDIT_LIST';
  if (boundary.classificationBasis !== expectedBasis[boundary.boundaryKind]
    || needsExternalEvidence !== (boundary.externalEvidence !== null)
    || (boundary.externalEvidence !== null
      && boundary.externalEvidence.epochId !== boundary.epochId)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_BASIS_OR_EVIDENCE_INVALID');
  }
  if (boundary.boundaryKind === 'INITIAL') {
    if (boundary.previousEpochId !== null
      || boundary.previousEndPresentationTimestampTicks !== null
      || boundary.previousBatchContentSha256 !== null) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_INITIAL_INVALID');
    }
  } else if (boundary.previousEpochId === null
    || boundary.previousEndPresentationTimestampTicks === null
    || boundary.previousBatchContentSha256 === null) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_PREDECESSOR_MISSING');
  }
}

type ExactFraction = Readonly<{ numerator: bigint; denominator: bigint }>;

function canonicalEnd(epoch: PresentationEpochV1): ExactFraction {
  const start = canonicalFraction(epoch.canonicalStartTime);
  const durationTicks = BigInt(epoch.sourceEndExclusivePresentationTimestampTicks)
    - BigInt(epoch.sourceStartPresentationTimestampTicks);
  return addFraction(start, fraction(
    durationTicks * BigInt(epoch.secondsPerSourceTick.numerator),
    BigInt(epoch.secondsPerSourceTick.denominator),
  ));
}

function canonicalFraction(value: CanonicalMediaTimeV1): ExactFraction {
  const parsed = parseCanonicalMediaTimeV1(value);
  return fraction(BigInt(parsed.ticks), BigInt(parsed.timescale));
}

function canonicalTime(value: ExactFraction): CanonicalMediaTimeV1 {
  return parseCanonicalMediaTimeV1({
    ticks: value.numerator.toString(),
    timescale: value.denominator.toString(),
  });
}

function assertReducedCanonicalTime(value: CanonicalMediaTimeV1): void {
  const parsed = parseCanonicalMediaTimeV1(value);
  const divisor = greatestCommonDivisor(BigInt(parsed.ticks), BigInt(parsed.timescale));
  if (divisor !== BigInt(1)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_CANONICAL_TIME_NOT_REDUCED');
  }
}

function sameRate(left: ExactRationalRateV1, right: ExactRationalRateV1): boolean {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}

function fraction(numerator: bigint, denominator: bigint): ExactFraction {
  if (denominator <= BigInt(0)) throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_FRACTION_INVALID');
  const divisor = greatestCommonDivisor(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function addFraction(left: ExactFraction, right: ExactFraction): ExactFraction {
  return fraction(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function compareFraction(left: ExactFraction, right: ExactFraction): -1 | 0 | 1 {
  const leftCross = left.numerator * right.denominator;
  const rightCross = right.numerator * left.denominator;
  return leftCross < rightCross ? -1 : leftCross > rightCross ? 1 : 0;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < BigInt(0) ? -left : left;
  let b = right;
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  return a === BigInt(0) ? BigInt(1) : a;
}

function presentationBoundaryKind(value: unknown): PresentationEpochV1['boundaryKind'] {
  const allowed = new Set<PresentationEpochV1['boundaryKind']>([
    'INITIAL', 'TIMESTAMP_RESET', 'GAP', 'OVERLAP', 'WRAP', 'EDIT_LIST',
  ]);
  if (!allowed.has(value as PresentationEpochV1['boundaryKind'])) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_KIND_INVALID');
  }
  return value as PresentationEpochV1['boundaryKind'];
}

function boundaryBasis(value: unknown): MediaSourcePtsCadenceEpochBoundaryBasisV3 {
  if (!MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_BASES_V3.includes(
    value as MediaSourcePtsCadenceEpochBoundaryBasisV3,
  )) throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_BOUNDARY_BASIS_INVALID');
  return value as MediaSourcePtsCadenceEpochBoundaryBasisV3;
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

function identifier(value: unknown, code: string): string {
  return boundedText(value, code);
}

function nullableIdentifier(value: unknown, code: string): string | null {
  return value === null ? null : identifier(value, code);
}

function boundedText(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function signedIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d{0,127})$/.test(value.trim())) {
    throw new Error(code);
  }
  return BigInt(value.trim()).toString();
}

function nullableSignedIntegerText(value: unknown, code: string): string | null {
  return value === null ? null : signedIntegerText(value, code);
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}

function nullableSha256(value: unknown, code: string): string | null {
  return value === null ? null : sha256(value, code);
}

function privateStorage(value: unknown): 'R2_PRIVATE' | 'GCS_PRIVATE' {
  if (value !== 'R2_PRIVATE' && value !== 'GCS_PRIVATE') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_BOUNDARY_EVIDENCE_STORAGE_INVALID');
  }
  return value;
}

function positiveSafeIntegerInRange(value: unknown, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > maximum) {
    throw new Error(code);
  }
  return Number(value);
}

function frozen<T extends object>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value);
}
