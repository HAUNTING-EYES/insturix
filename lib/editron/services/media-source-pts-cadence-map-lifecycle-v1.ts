import {
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import type { MediaRationalV1 } from './media-source-probe-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_SHARD_KIND_V1,
  type MediaSourcePtsCadenceMapperV1,
  type MediaSourcePtsCadenceShardV1,
} from './media-source-pts-cadence-shard-v1';

/**
 * Pure state contract for the future MEDIA_ASSETS-owned source PTS mapper.
 *
 * The record is designed to live on the existing media asset, while frame
 * payloads and manifests live in private immutable storage. This module is not
 * a worker, a database adapter, a source-wide CFR/VFR verdict, or a timeline
 * authority. In particular, its completion candidate still needs a full
 * presentation-coverage verifier and one owner-side compare-and-set write.
 */
export const MEDIA_SOURCE_PTS_CADENCE_MAP_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_MAP_V1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_PRIVATE_SIDECAR_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_PRIVATE_SIDECAR_V1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_RECEIPT_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_RECEIPT_V1' as const;

const ZERO_BIGINT = BigInt(0);
const ONE_BIGINT = BigInt(1);

export type MediaSourcePtsCadenceMapStatusV1 =
  | 'PENDING'
  | 'MAPPING'
  | 'COMPLETE'
  | 'UNVERIFIABLE';

export type MediaSourcePtsCadencePrivateSidecarV1 = {
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_PRIVATE_SIDECAR_KIND_V1;
  storage: 'R2_PRIVATE' | 'GCS_PRIVATE';
  objectKey: string;
  byteLength: number;
  contentSha256: string;
};

export type MediaSourcePtsCadenceMapCheckpointV1 = {
  nextShardSequence: number;
  nextFrameOrdinal: string;
  nextPresentationTimestampTicks: string | null;
  appendedShardCount: string;
  cumulativeShardBindingSha256: string;
};

export type MediaSourcePtsCadenceMapClaimV1 = {
  claimId: string;
  claimedAt: string;
  expiresAt: string;
};

export type MediaSourcePtsCadenceMapRecordV1 = {
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_MAP_KIND_V1;
  status: MediaSourcePtsCadenceMapStatusV1;
  mapBindingSha256: string;
  sourceVersionSha256: string;
  storageVersionSha256: string;
  sourceBindingSha256: string;
  technicalObservationSha256: string;
  videoStreamIndex: number;
  sourceTimebase: MediaRationalV1;
  mapper: MediaSourcePtsCadenceMapperV1;
  requestId: string;
  attemptCount: number;
  requestedAt: string;
  activeClaim: MediaSourcePtsCadenceMapClaimV1 | null;
  checkpoint: MediaSourcePtsCadenceMapCheckpointV1;
  completion: MediaSourcePtsCadenceMapCompletionV1 | null;
  completedAt: string | null;
  diagnostic: string | null;
};

export type MediaSourcePtsCadenceCompletionCandidateV1 = {
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_MAP_KIND_V1;
  mapBindingSha256: string;
  checkpointSha256: string;
  privateManifest: MediaSourcePtsCadencePrivateSidecarV1;
  requiredTerminalVerifier: 'COMPLETE_PRESENTATION_COVERAGE_AND_CONTIGUITY_V1';
  requiredTerminalWrite: 'MEDIA_ASSETS_COMPARE_AND_SET_V1';
};

/**
 * A full-coverage verifier issues this receipt only after it has independently
 * read the complete private manifest and every referenced presentation shard.
 * The lifecycle validates its binding and provenance; it does not substitute
 * for that verifier.
 */
export type MediaSourcePtsCadenceMapCompletionReceiptV1 = {
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_RECEIPT_KIND_V1;
  mapBindingSha256: string;
  checkpointSha256: string;
  privateManifest: MediaSourcePtsCadencePrivateSidecarV1;
  verifierVersion: string;
  coveragePolicyVersion: string;
  receiptSha256: string;
};

export type MediaSourcePtsCadenceMapCompletionV1 = {
  privateManifest: MediaSourcePtsCadencePrivateSidecarV1;
  receipt: MediaSourcePtsCadenceMapCompletionReceiptV1;
};

/**
 * The future storage owner must implement this port without exposing a public
 * URL. The pure lifecycle below validates references it receives but does not
 * perform storage I/O.
 */
export interface MediaSourcePtsCadencePrivateSidecarPortV1 {
  writeImmutableShard(input: {
    mapBindingSha256: string;
    shard: Readonly<MediaSourcePtsCadenceShardV1>;
    expected: Readonly<MediaSourcePtsCadencePrivateSidecarV1>;
  }): Promise<Readonly<MediaSourcePtsCadencePrivateSidecarV1>>;
  writeImmutableManifest(input: {
    mapBindingSha256: string;
    checkpoint: Readonly<MediaSourcePtsCadenceMapCheckpointV1>;
    expected: Readonly<MediaSourcePtsCadencePrivateSidecarV1>;
  }): Promise<Readonly<MediaSourcePtsCadencePrivateSidecarV1>>;
}

/**
 * Bootstrap is deliberately sourced from an already verified first shard. The
 * future MEDIA_ASSETS adapter must reserve this lifecycle before a real worker
 * writes it; this pure contract does not pretend to provide database CAS.
 */
export function createMediaSourcePtsCadenceMapRecordV1(input: {
  bootstrapShard: MediaSourcePtsCadenceShardV1;
  now: Date;
}): Readonly<MediaSourcePtsCadenceMapRecordV1> {
  const shard = assertShard(input.bootstrapShard);
  if (shard.shardSequence !== 0 || shard.firstFrameOrdinal !== '0') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_BOOTSTRAP_NOT_INITIAL');
  }
  const binding = bindingFromShard(shard);
  const mapBindingSha256 = hashEditronCanonicalJsonV1(binding);
  return frozen({
    ...binding,
    status: 'PENDING',
    mapBindingSha256,
    requestId: `media-source-pts-cadence:${mapBindingSha256}`,
    attemptCount: 0,
    requestedAt: validDate(input.now, 'MEDIA_SOURCE_PTS_CADENCE_MAP_NOW_INVALID').toISOString(),
    activeClaim: null,
    checkpoint: emptyCheckpoint(mapBindingSha256),
    completion: null,
    completedAt: null,
    diagnostic: null,
  });
}

/** Claims a pending or expired map lifecycle. Lease policy is supplied by the owner, never hidden here. */
export function claimMediaSourcePtsCadenceMapV1(input: {
  record: MediaSourcePtsCadenceMapRecordV1;
  claimId: string;
  now: Date;
  expiresAt: Date;
}): Readonly<MediaSourcePtsCadenceMapRecordV1> {
  const record = assertRecord(input.record);
  const now = validDate(input.now, 'MEDIA_SOURCE_PTS_CADENCE_MAP_NOW_INVALID');
  const expiresAt = validDate(input.expiresAt, 'MEDIA_SOURCE_PTS_CADENCE_MAP_CLAIM_EXPIRY_INVALID');
  if (expiresAt.getTime() <= now.getTime()) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_CLAIM_EXPIRY_INVALID');
  }
  if (record.status === 'COMPLETE' || record.status === 'UNVERIFIABLE') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL');
  }
  if (
    record.status === 'MAPPING'
    && record.activeClaim
    && new Date(record.activeClaim.expiresAt).getTime() > now.getTime()
  ) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_ACTIVE_CLAIM');
  }
  return frozen({
    ...record,
    status: 'MAPPING',
    attemptCount: incrementSafeInteger(
      record.attemptCount,
      'MEDIA_SOURCE_PTS_CADENCE_MAP_ATTEMPT_OVERFLOW',
    ),
    activeClaim: {
      claimId: claimIdentifier(input.claimId),
      claimedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
    completion: null,
    completedAt: null,
    diagnostic: null,
  });
}

/**
 * Accepts exactly the next contiguous, private immutable shard. It is a pure
 * checkpoint transition; the actual owner must atomically persist it on the
 * existing MEDIA_ASSETS record after the sidecar write succeeds.
 */
export function appendMediaSourcePtsCadenceMapShardV1(input: {
  record: MediaSourcePtsCadenceMapRecordV1;
  claimId: string;
  shard: MediaSourcePtsCadenceShardV1;
  privateSidecar: MediaSourcePtsCadencePrivateSidecarV1;
  now: Date;
}): Readonly<MediaSourcePtsCadenceMapRecordV1> {
  const record = assertActiveClaim(input.record, input.claimId, input.now);
  const shard = assertShard(input.shard);
  if (hashEditronCanonicalJsonV1(bindingFromShard(shard)) !== record.mapBindingSha256) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_BINDING_MISMATCH');
  }
  if (shard.shardSequence !== record.checkpoint.nextShardSequence) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_SEQUENCE_MISMATCH');
  }
  if (shard.firstFrameOrdinal !== record.checkpoint.nextFrameOrdinal) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_FRAME_ORDINAL_MISMATCH');
  }
  if (
    record.checkpoint.nextPresentationTimestampTicks !== null
    && shard.startPresentationTimestampTicks !== record.checkpoint.nextPresentationTimestampTicks
  ) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_PRESENTATION_CONTINUITY_MISMATCH');
  }
  const privateSidecar = assertPrivateSidecar(
    input.privateSidecar,
    expectedShardObjectKey(record.mapBindingSha256, shard),
  );
  const checkpoint = {
    nextShardSequence: incrementSafeInteger(shard.shardSequence, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_SEQUENCE_OVERFLOW'),
    nextFrameOrdinal: addNonNegativeIntegerText(
      shard.firstFrameOrdinal,
      shard.frameCount,
      'MEDIA_SOURCE_PTS_CADENCE_MAP_FRAME_ORDINAL_OVERFLOW',
    ),
    nextPresentationTimestampTicks: shard.endExclusivePresentationTimestampTicks,
    appendedShardCount: addNonNegativeIntegerText(
      record.checkpoint.appendedShardCount,
      '1',
      'MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_COUNT_OVERFLOW',
    ),
    cumulativeShardBindingSha256: hashEditronCanonicalJsonV1({
      previous: record.checkpoint.cumulativeShardBindingSha256,
      shardSha256: shard.shardSha256,
      privateSidecar,
    }),
  } satisfies MediaSourcePtsCadenceMapCheckpointV1;
  return frozen({ ...record, checkpoint });
}

/**
 * Builds an immutable handoff for a later full verifier. It intentionally does
 * not terminalize the map or issue a CFR/VFR disposition: only a verifier that
 * reads every private shard may do that through one MEDIA_ASSETS CAS.
 */
export function prepareMediaSourcePtsCadenceMapCompletionV1(input: {
  record: MediaSourcePtsCadenceMapRecordV1;
  claimId: string;
  privateManifest: MediaSourcePtsCadencePrivateSidecarV1;
  now: Date;
}): Readonly<MediaSourcePtsCadenceCompletionCandidateV1> {
  const record = assertActiveClaim(input.record, input.claimId, input.now);
  if (record.checkpoint.appendedShardCount === '0') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_EMPTY');
  }
  const checkpointSha256 = hashEditronCanonicalJsonV1(record.checkpoint);
  const privateManifest = assertPrivateSidecar(
    input.privateManifest,
    expectedManifestObjectKey(record.mapBindingSha256, checkpointSha256),
  );
  return frozen({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_MAP_KIND_V1,
    mapBindingSha256: record.mapBindingSha256,
    checkpointSha256,
    privateManifest,
    requiredTerminalVerifier: 'COMPLETE_PRESENTATION_COVERAGE_AND_CONTIGUITY_V1',
    requiredTerminalWrite: 'MEDIA_ASSETS_COMPARE_AND_SET_V1',
  });
}

/**
 * Creates the hash-bound envelope emitted by a full-coverage verifier. This
 * normalizes verifier provenance only; it never reads sidecars or proves that
 * their frame evidence covers a source by itself.
 */
export function createMediaSourcePtsCadenceMapCompletionReceiptV1(input: {
  candidate: MediaSourcePtsCadenceCompletionCandidateV1;
  verifierVersion: string;
  coveragePolicyVersion: string;
}): Readonly<MediaSourcePtsCadenceMapCompletionReceiptV1> {
  const candidate = assertCompletionCandidate(input.candidate);
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_RECEIPT_KIND_V1,
    mapBindingSha256: candidate.mapBindingSha256,
    checkpointSha256: candidate.checkpointSha256,
    privateManifest: candidate.privateManifest,
    verifierVersion: boundedText(
      input.verifierVersion,
      'MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_RECEIPT_INVALID',
    ),
    coveragePolicyVersion: boundedText(
      input.coveragePolicyVersion,
      'MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_RECEIPT_INVALID',
    ),
  };
  return frozen({
    ...material,
    receiptSha256: hashEditronCanonicalJsonV1(material),
  });
}

/**
 * Terminal success is available only to the existing MEDIA_ASSETS CAS owner
 * after its full-coverage verifier emits an exact candidate-bound receipt.
 * This transition still does not classify the source as CFR or VFR.
 */
export function completeMediaSourcePtsCadenceMapV1(input: {
  record: MediaSourcePtsCadenceMapRecordV1;
  claimId: string;
  candidate: MediaSourcePtsCadenceCompletionCandidateV1;
  completionReceipt: MediaSourcePtsCadenceMapCompletionReceiptV1;
  now: Date;
}): Readonly<MediaSourcePtsCadenceMapRecordV1> {
  const record = assertActiveClaim(input.record, input.claimId, input.now);
  const candidate = assertCompletionCandidate(input.candidate);
  const checkpointSha256 = hashEditronCanonicalJsonV1(record.checkpoint);
  if (
    candidate.mapBindingSha256 !== record.mapBindingSha256
    || candidate.checkpointSha256 !== checkpointSha256
  ) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_CANDIDATE_MISMATCH');
  }
  const receipt = assertCompletionReceipt(input.completionReceipt, candidate);
  return frozen({
    ...record,
    status: 'COMPLETE',
    activeClaim: null,
    completion: {
      privateManifest: candidate.privateManifest,
      receipt,
    },
    completedAt: validDate(input.now, 'MEDIA_SOURCE_PTS_CADENCE_MAP_NOW_INVALID').toISOString(),
    diagnostic: null,
  });
}

/** Terminal failure preserves the binding and refuses further claims or writes. */
export function markMediaSourcePtsCadenceMapUnverifiableV1(input: {
  record: MediaSourcePtsCadenceMapRecordV1;
  claimId: string;
  diagnostic: string;
  now: Date;
}): Readonly<MediaSourcePtsCadenceMapRecordV1> {
  const record = assertActiveClaim(input.record, input.claimId, input.now);
  return frozen({
    ...record,
    status: 'UNVERIFIABLE',
    activeClaim: null,
    completion: null,
    completedAt: validDate(input.now, 'MEDIA_SOURCE_PTS_CADENCE_MAP_NOW_INVALID').toISOString(),
    diagnostic: boundedText(input.diagnostic, 'MEDIA_SOURCE_PTS_CADENCE_MAP_DIAGNOSTIC_INVALID'),
  });
}

export function expectedMediaSourcePtsCadenceShardObjectKeyV1(
  mapBindingSha256: string,
  shard: MediaSourcePtsCadenceShardV1,
): string {
  return expectedShardObjectKey(assertSha256(mapBindingSha256, 'MEDIA_SOURCE_PTS_CADENCE_MAP_BINDING_INVALID'), assertShard(shard));
}

export function expectedMediaSourcePtsCadenceManifestObjectKeyV1(
  mapBindingSha256: string,
  checkpoint: MediaSourcePtsCadenceMapCheckpointV1,
): string {
  const binding = assertSha256(mapBindingSha256, 'MEDIA_SOURCE_PTS_CADENCE_MAP_BINDING_INVALID');
  const checkpointSha256 = hashEditronCanonicalJsonV1(assertCheckpoint(checkpoint));
  return expectedManifestObjectKey(binding, checkpointSha256);
}

type MapBindingV1 = Pick<
  MediaSourcePtsCadenceMapRecordV1,
  | 'sourceVersionSha256'
  | 'storageVersionSha256'
  | 'sourceBindingSha256'
  | 'technicalObservationSha256'
  | 'videoStreamIndex'
  | 'sourceTimebase'
  | 'mapper'
> & {
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_MAP_KIND_V1;
};

function bindingFromShard(shard: Readonly<MediaSourcePtsCadenceShardV1>): MapBindingV1 {
  return {
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_MAP_KIND_V1,
    sourceVersionSha256: shard.sourceVersionSha256,
    storageVersionSha256: shard.storageVersionSha256,
    sourceBindingSha256: shard.sourceBindingSha256,
    technicalObservationSha256: shard.technicalObservationSha256,
    videoStreamIndex: shard.videoStreamIndex,
    sourceTimebase: shard.sourceTimebase,
    mapper: shard.mapper,
  };
}

function assertActiveClaim(
  value: MediaSourcePtsCadenceMapRecordV1,
  claimId: string,
  now: Date,
): Readonly<MediaSourcePtsCadenceMapRecordV1> {
  const record = assertRecord(value);
  const at = validDate(now, 'MEDIA_SOURCE_PTS_CADENCE_MAP_NOW_INVALID');
  if (
    record.status !== 'MAPPING'
    || !record.activeClaim
    || record.activeClaim.claimId !== claimIdentifier(claimId)
    || new Date(record.activeClaim.expiresAt).getTime() <= at.getTime()
  ) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_CLAIM_NOT_ACTIVE');
  }
  return record;
}

function assertCompletionCandidate(
  value: unknown,
): Readonly<MediaSourcePtsCadenceCompletionCandidateV1> {
  const candidate = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_CANDIDATE_INVALID');
  exactKeys(candidate, [
    'checkpointSha256', 'kind', 'mapBindingSha256', 'privateManifest',
    'requiredTerminalVerifier', 'requiredTerminalWrite', 'schemaVersion',
  ], 'MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_CANDIDATE_INVALID');
  const mapBindingSha256 = assertSha256(
    candidate.mapBindingSha256,
    'MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_CANDIDATE_INVALID',
  );
  const checkpointSha256 = assertSha256(
    candidate.checkpointSha256,
    'MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_CANDIDATE_INVALID',
  );
  if (
    candidate.schemaVersion !== 1
    || candidate.kind !== MEDIA_SOURCE_PTS_CADENCE_MAP_KIND_V1
    || candidate.requiredTerminalVerifier !== 'COMPLETE_PRESENTATION_COVERAGE_AND_CONTIGUITY_V1'
    || candidate.requiredTerminalWrite !== 'MEDIA_ASSETS_COMPARE_AND_SET_V1'
  ) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_CANDIDATE_INVALID');
  }
  return frozen({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_MAP_KIND_V1,
    mapBindingSha256,
    checkpointSha256,
    privateManifest: assertPrivateSidecar(
      candidate.privateManifest,
      expectedManifestObjectKey(mapBindingSha256, checkpointSha256),
    ),
    requiredTerminalVerifier: 'COMPLETE_PRESENTATION_COVERAGE_AND_CONTIGUITY_V1',
    requiredTerminalWrite: 'MEDIA_ASSETS_COMPARE_AND_SET_V1',
  });
}

function assertCompletionReceipt(
  value: unknown,
  candidate: Readonly<MediaSourcePtsCadenceCompletionCandidateV1>,
): Readonly<MediaSourcePtsCadenceMapCompletionReceiptV1> {
  const receipt = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_RECEIPT_INVALID');
  exactKeys(receipt, [
    'checkpointSha256', 'coveragePolicyVersion', 'kind', 'mapBindingSha256',
    'privateManifest', 'receiptSha256', 'schemaVersion', 'verifierVersion',
  ], 'MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_RECEIPT_INVALID');
  if (
    receipt.schemaVersion !== 1
    || receipt.kind !== MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_RECEIPT_KIND_V1
    || receipt.mapBindingSha256 !== candidate.mapBindingSha256
    || receipt.checkpointSha256 !== candidate.checkpointSha256
  ) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_RECEIPT_INVALID');
  }
  const privateManifest = assertPrivateSidecar(
    receipt.privateManifest,
    candidate.privateManifest.objectKey,
  );
  if (!samePrivateSidecar(privateManifest, candidate.privateManifest)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_RECEIPT_INVALID');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_RECEIPT_KIND_V1,
    mapBindingSha256: candidate.mapBindingSha256,
    checkpointSha256: candidate.checkpointSha256,
    privateManifest,
    verifierVersion: boundedText(
      receipt.verifierVersion,
      'MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_RECEIPT_INVALID',
    ),
    coveragePolicyVersion: boundedText(
      receipt.coveragePolicyVersion,
      'MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_RECEIPT_INVALID',
    ),
  };
  if (
    hashEditronCanonicalJsonV1(material) !== assertSha256(
      receipt.receiptSha256,
      'MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_RECEIPT_INVALID',
    )
  ) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_RECEIPT_INVALID');
  }
  return frozen({ ...material, receiptSha256: receipt.receiptSha256 as string });
}

function assertCompletion(
  value: unknown,
  mapBindingSha256: string,
  checkpoint: Readonly<MediaSourcePtsCadenceMapCheckpointV1>,
): Readonly<MediaSourcePtsCadenceMapCompletionV1> {
  const completion = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_INVALID');
  exactKeys(completion, ['privateManifest', 'receipt'], 'MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_INVALID');
  const checkpointSha256 = hashEditronCanonicalJsonV1(checkpoint);
  const candidate = assertCompletionCandidate({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_MAP_KIND_V1,
    mapBindingSha256,
    checkpointSha256,
    privateManifest: completion.privateManifest,
    requiredTerminalVerifier: 'COMPLETE_PRESENTATION_COVERAGE_AND_CONTIGUITY_V1',
    requiredTerminalWrite: 'MEDIA_ASSETS_COMPARE_AND_SET_V1',
  });
  return frozen({
    privateManifest: candidate.privateManifest,
    receipt: assertCompletionReceipt(completion.receipt, candidate),
  });
}

function assertRecord(value: unknown): Readonly<MediaSourcePtsCadenceMapRecordV1> {
  const record = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MAP_RECORD_INVALID');
  exactKeys(record, [
    'activeClaim', 'attemptCount', 'checkpoint', 'completedAt', 'completion',
    'diagnostic', 'kind', 'mapBindingSha256', 'mapper', 'requestId', 'requestedAt',
    'schemaVersion', 'sourceBindingSha256', 'sourceTimebase', 'sourceVersionSha256',
    'status', 'storageVersionSha256', 'technicalObservationSha256', 'videoStreamIndex',
  ], 'MEDIA_SOURCE_PTS_CADENCE_MAP_RECORD_FIELDS_INVALID');
  if (record.schemaVersion !== 1 || record.kind !== MEDIA_SOURCE_PTS_CADENCE_MAP_KIND_V1) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_RECORD_INVALID');
  }
  const binding: MapBindingV1 = {
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_MAP_KIND_V1,
    sourceVersionSha256: assertSha256(record.sourceVersionSha256, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SOURCE_INVALID'),
    storageVersionSha256: assertSha256(record.storageVersionSha256, 'MEDIA_SOURCE_PTS_CADENCE_MAP_STORAGE_INVALID'),
    sourceBindingSha256: assertSha256(record.sourceBindingSha256, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SOURCE_BINDING_INVALID'),
    technicalObservationSha256: assertSha256(record.technicalObservationSha256, 'MEDIA_SOURCE_PTS_CADENCE_MAP_OBSERVATION_INVALID'),
    videoStreamIndex: nonNegativeSafeInteger(record.videoStreamIndex, 'MEDIA_SOURCE_PTS_CADENCE_MAP_STREAM_INVALID'),
    sourceTimebase: assertReducedTimebase(record.sourceTimebase),
    mapper: assertMapper(record.mapper),
  };
  const mapBindingSha256 = assertSha256(record.mapBindingSha256, 'MEDIA_SOURCE_PTS_CADENCE_MAP_BINDING_INVALID');
  if (hashEditronCanonicalJsonV1(binding) !== mapBindingSha256) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_BINDING_MISMATCH');
  }
  if (
    record.status !== 'PENDING'
    && record.status !== 'MAPPING'
    && record.status !== 'COMPLETE'
    && record.status !== 'UNVERIFIABLE'
  ) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_STATUS_INVALID');
  }
  const checkpoint = assertCheckpoint(record.checkpoint);
  const completion = record.completion === null
    ? null
    : assertCompletion(record.completion, mapBindingSha256, checkpoint);
  const activeClaim = record.activeClaim === null ? null : assertClaim(record.activeClaim);
  if (
    (record.status === 'PENDING' || record.status === 'COMPLETE' || record.status === 'UNVERIFIABLE')
    && activeClaim !== null
  ) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_CLAIM_STATE_INVALID');
  }
  if (record.status === 'MAPPING' && activeClaim === null) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_CLAIM_STATE_INVALID');
  }
  const completedAt = record.completedAt === null
    ? null
    : validDateText(record.completedAt, 'MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETED_AT_INVALID');
  if ((record.status === 'PENDING' || record.status === 'MAPPING') && completedAt !== null) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_STATE_INVALID');
  }
  const diagnostic = record.diagnostic === null
    ? null
    : boundedText(record.diagnostic, 'MEDIA_SOURCE_PTS_CADENCE_MAP_DIAGNOSTIC_INVALID');
  if (record.status !== 'UNVERIFIABLE' && diagnostic !== null) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_DIAGNOSTIC_STATE_INVALID');
  }
  if (
    (record.status === 'PENDING' || record.status === 'MAPPING' || record.status === 'UNVERIFIABLE')
    && completion !== null
  ) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_STATE_INVALID');
  }
  if (
    record.status === 'COMPLETE'
    && (!completedAt || !completion || checkpoint.appendedShardCount === '0')
  ) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL_STATE_INVALID');
  }
  if (record.status === 'UNVERIFIABLE' && (!completedAt || !diagnostic)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL_STATE_INVALID');
  }
  return frozen({
    ...binding,
    status: record.status,
    mapBindingSha256,
    requestId: requestIdentifier(record.requestId, mapBindingSha256),
    attemptCount: nonNegativeSafeInteger(record.attemptCount, 'MEDIA_SOURCE_PTS_CADENCE_MAP_ATTEMPT_INVALID'),
    requestedAt: validDateText(record.requestedAt, 'MEDIA_SOURCE_PTS_CADENCE_MAP_REQUESTED_AT_INVALID'),
    activeClaim,
    checkpoint,
    completion,
    completedAt,
    diagnostic,
  });
}

function assertShard(value: unknown): Readonly<MediaSourcePtsCadenceShardV1> {
  const shard = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_INVALID');
  exactKeys(shard, [
    'endExclusivePresentationTimestampTicks', 'firstFrameOrdinal', 'frameCount',
    'frameEvidenceSha256', 'kind', 'localCadence', 'mapper', 'schemaVersion',
    'shardSequence', 'shardSha256', 'sourceBindingSha256', 'sourceTimebase',
    'sourceVersionSha256', 'startPresentationTimestampTicks', 'storageVersionSha256',
    'technicalObservationSha256', 'videoStreamIndex',
  ], 'MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_FIELDS_INVALID');
  if (shard.schemaVersion !== 1 || shard.kind !== MEDIA_SOURCE_PTS_CADENCE_SHARD_KIND_V1) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_INVALID');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_SHARD_KIND_V1,
    sourceVersionSha256: assertSha256(shard.sourceVersionSha256, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_SOURCE_INVALID'),
    storageVersionSha256: assertSha256(shard.storageVersionSha256, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_STORAGE_INVALID'),
    sourceBindingSha256: assertSha256(shard.sourceBindingSha256, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_SOURCE_BINDING_INVALID'),
    technicalObservationSha256: assertSha256(shard.technicalObservationSha256, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_OBSERVATION_INVALID'),
    videoStreamIndex: nonNegativeSafeInteger(shard.videoStreamIndex, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_STREAM_INVALID'),
    sourceTimebase: assertReducedTimebase(shard.sourceTimebase),
    mapper: assertMapper(shard.mapper),
    shardSequence: nonNegativeSafeInteger(shard.shardSequence, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_SEQUENCE_INVALID'),
    firstFrameOrdinal: nonNegativeIntegerText(shard.firstFrameOrdinal, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_ORDINAL_INVALID'),
    frameCount: positiveIntegerText(shard.frameCount, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_COUNT_INVALID'),
    startPresentationTimestampTicks: signedIntegerText(shard.startPresentationTimestampTicks, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_START_INVALID'),
    endExclusivePresentationTimestampTicks: signedIntegerText(shard.endExclusivePresentationTimestampTicks, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_END_INVALID'),
    localCadence: assertLocalCadence(shard.localCadence),
    frameEvidenceSha256: assertSha256(shard.frameEvidenceSha256, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_EVIDENCE_INVALID'),
  };
  if (parseSignedInteger(material.endExclusivePresentationTimestampTicks) <= parseSignedInteger(material.startPresentationTimestampTicks)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_RANGE_INVALID');
  }
  if (hashEditronCanonicalJsonV1(material) !== assertSha256(shard.shardSha256, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_HASH_INVALID')) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_HASH_MISMATCH');
  }
  return frozen({ ...material, shardSha256: shard.shardSha256 as string });
}

function assertCheckpoint(value: unknown): MediaSourcePtsCadenceMapCheckpointV1 {
  const checkpoint = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MAP_CHECKPOINT_INVALID');
  exactKeys(checkpoint, [
    'appendedShardCount', 'cumulativeShardBindingSha256', 'nextFrameOrdinal',
    'nextPresentationTimestampTicks', 'nextShardSequence',
  ], 'MEDIA_SOURCE_PTS_CADENCE_MAP_CHECKPOINT_FIELDS_INVALID');
  const nextPresentationTimestampTicks = checkpoint.nextPresentationTimestampTicks === null
    ? null
    : signedIntegerText(checkpoint.nextPresentationTimestampTicks, 'MEDIA_SOURCE_PTS_CADENCE_MAP_CHECKPOINT_PTS_INVALID');
  const appendedShardCount = nonNegativeIntegerText(
    checkpoint.appendedShardCount,
    'MEDIA_SOURCE_PTS_CADENCE_MAP_CHECKPOINT_COUNT_INVALID',
  );
  const nextShardSequence = nonNegativeSafeInteger(
    checkpoint.nextShardSequence,
    'MEDIA_SOURCE_PTS_CADENCE_MAP_CHECKPOINT_SEQUENCE_INVALID',
  );
  if ((appendedShardCount === '0') !== (nextPresentationTimestampTicks === null)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_CHECKPOINT_STATE_INVALID');
  }
  if (appendedShardCount === '0' && (nextShardSequence !== 0 || checkpoint.nextFrameOrdinal !== '0')) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_CHECKPOINT_STATE_INVALID');
  }
  return {
    nextShardSequence,
    nextFrameOrdinal: nonNegativeIntegerText(
      checkpoint.nextFrameOrdinal,
      'MEDIA_SOURCE_PTS_CADENCE_MAP_CHECKPOINT_ORDINAL_INVALID',
    ),
    nextPresentationTimestampTicks,
    appendedShardCount,
    cumulativeShardBindingSha256: assertSha256(
      checkpoint.cumulativeShardBindingSha256,
      'MEDIA_SOURCE_PTS_CADENCE_MAP_CHECKPOINT_HASH_INVALID',
    ),
  };
}

function emptyCheckpoint(mapBindingSha256: string): MediaSourcePtsCadenceMapCheckpointV1 {
  return {
    nextShardSequence: 0,
    nextFrameOrdinal: '0',
    nextPresentationTimestampTicks: null,
    appendedShardCount: '0',
    cumulativeShardBindingSha256: hashEditronCanonicalJsonV1({
      schemaVersion: 1,
      kind: MEDIA_SOURCE_PTS_CADENCE_MAP_KIND_V1,
      mapBindingSha256,
      checkpoint: 'EMPTY',
    }),
  };
}

function assertClaim(value: unknown): MediaSourcePtsCadenceMapClaimV1 {
  const claim = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MAP_CLAIM_INVALID');
  exactKeys(claim, ['claimId', 'claimedAt', 'expiresAt'], 'MEDIA_SOURCE_PTS_CADENCE_MAP_CLAIM_FIELDS_INVALID');
  const claimedAt = validDateText(claim.claimedAt, 'MEDIA_SOURCE_PTS_CADENCE_MAP_CLAIM_INVALID');
  const expiresAt = validDateText(claim.expiresAt, 'MEDIA_SOURCE_PTS_CADENCE_MAP_CLAIM_INVALID');
  if (new Date(expiresAt).getTime() <= new Date(claimedAt).getTime()) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_CLAIM_INVALID');
  }
  return { claimId: claimIdentifier(claim.claimId), claimedAt, expiresAt };
}

function assertPrivateSidecar(
  value: unknown,
  expectedObjectKey: string,
): Readonly<MediaSourcePtsCadencePrivateSidecarV1> {
  const sidecar = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SIDECAR_INVALID');
  exactKeys(sidecar, ['byteLength', 'contentSha256', 'kind', 'objectKey', 'schemaVersion', 'storage'], 'MEDIA_SOURCE_PTS_CADENCE_MAP_SIDECAR_FIELDS_INVALID');
  if (
    sidecar.schemaVersion !== 1
    || sidecar.kind !== MEDIA_SOURCE_PTS_CADENCE_PRIVATE_SIDECAR_KIND_V1
    || (sidecar.storage !== 'R2_PRIVATE' && sidecar.storage !== 'GCS_PRIVATE')
    || sidecar.objectKey !== expectedObjectKey
  ) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_SIDECAR_INVALID');
  }
  return frozen({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_PRIVATE_SIDECAR_KIND_V1,
    storage: sidecar.storage,
    objectKey: expectedObjectKey,
    byteLength: positiveSafeInteger(sidecar.byteLength, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SIDECAR_SIZE_INVALID'),
    contentSha256: assertSha256(sidecar.contentSha256, 'MEDIA_SOURCE_PTS_CADENCE_MAP_SIDECAR_HASH_INVALID'),
  });
}

function samePrivateSidecar(
  left: Readonly<MediaSourcePtsCadencePrivateSidecarV1>,
  right: Readonly<MediaSourcePtsCadencePrivateSidecarV1>,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.kind === right.kind
    && left.storage === right.storage
    && left.objectKey === right.objectKey
    && left.byteLength === right.byteLength
    && left.contentSha256 === right.contentSha256;
}

function expectedShardObjectKey(
  mapBindingSha256: string,
  shard: Readonly<MediaSourcePtsCadenceShardV1>,
): string {
  return `private/editron/media-source-pts-cadence/v1/${mapBindingSha256}/shards/${shard.shardSequence}-${shard.shardSha256}.json`;
}

function expectedManifestObjectKey(mapBindingSha256: string, checkpointSha256: string): string {
  return `private/editron/media-source-pts-cadence/v1/${mapBindingSha256}/manifests/${checkpointSha256}.json`;
}

function assertMapper(value: unknown): MediaSourcePtsCadenceMapperV1 {
  const mapper = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MAP_MAPPER_INVALID');
  exactKeys(mapper, ['commandPolicyVersion', 'ffprobeVersion', 'mapperVersion', 'timestampOrigin'], 'MEDIA_SOURCE_PTS_CADENCE_MAP_MAPPER_FIELDS_INVALID');
  if (mapper.timestampOrigin !== 'FFPROBE_BEST_EFFORT_TIMESTAMP') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_TIMESTAMP_ORIGIN_INVALID');
  }
  return {
    mapperVersion: boundedText(mapper.mapperVersion, 'MEDIA_SOURCE_PTS_CADENCE_MAP_MAPPER_INVALID'),
    ffprobeVersion: boundedText(mapper.ffprobeVersion, 'MEDIA_SOURCE_PTS_CADENCE_MAP_MAPPER_INVALID'),
    commandPolicyVersion: boundedText(mapper.commandPolicyVersion, 'MEDIA_SOURCE_PTS_CADENCE_MAP_MAPPER_INVALID'),
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
  };
}

function assertReducedTimebase(value: unknown): MediaRationalV1 {
  const timebase = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MAP_TIMEBASE_INVALID');
  exactKeys(timebase, ['denominator', 'numerator'], 'MEDIA_SOURCE_PTS_CADENCE_MAP_TIMEBASE_FIELDS_INVALID');
  const numerator = positiveIntegerText(timebase.numerator, 'MEDIA_SOURCE_PTS_CADENCE_MAP_TIMEBASE_INVALID');
  const denominator = positiveIntegerText(timebase.denominator, 'MEDIA_SOURCE_PTS_CADENCE_MAP_TIMEBASE_INVALID');
  if (greatestCommonDivisor(BigInt(numerator), BigInt(denominator)) !== ONE_BIGINT) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_TIMEBASE_NOT_REDUCED');
  }
  return { numerator, denominator };
}

function assertLocalCadence(
  value: unknown,
): MediaSourcePtsCadenceShardV1['localCadence'] {
  const cadence = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MAP_LOCAL_CADENCE_INVALID');
  if (cadence.kind === 'VARIABLE_LOCAL') {
    exactKeys(cadence, ['kind'], 'MEDIA_SOURCE_PTS_CADENCE_MAP_LOCAL_CADENCE_INVALID');
    return { kind: 'VARIABLE_LOCAL' };
  }
  if (cadence.kind === 'UNIFORM_LOCAL') {
    exactKeys(cadence, ['durationTicks', 'kind'], 'MEDIA_SOURCE_PTS_CADENCE_MAP_LOCAL_CADENCE_INVALID');
    return {
      kind: 'UNIFORM_LOCAL',
      durationTicks: positiveIntegerText(cadence.durationTicks, 'MEDIA_SOURCE_PTS_CADENCE_MAP_LOCAL_CADENCE_INVALID'),
    };
  }
  throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_LOCAL_CADENCE_INVALID');
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new Error(code);
  }
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function assertSha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}

function requestIdentifier(value: unknown, bindingSha256: string): string {
  const expected = `media-source-pts-cadence:${bindingSha256}`;
  if (value !== expected) throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_REQUEST_INVALID');
  return expected;
}

function claimIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{11,127}$/.test(value)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_CLAIM_ID_INVALID');
  }
  return value;
}

function validDate(value: unknown, code: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(code);
  return value;
}

function validDateText(value: unknown, code: string): string {
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) throw new Error(code);
  return new Date(value).toISOString();
}

function boundedText(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function positiveSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(code);
  return Number(value);
}

function nonNegativeSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}

function incrementSafeInteger(value: number, code: string): number {
  if (value >= Number.MAX_SAFE_INTEGER) throw new Error(code);
  return value + 1;
}

function positiveIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,127}$/.test(value.trim())) throw new Error(code);
  return BigInt(value.trim()).toString();
}

function nonNegativeIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,127})$/.test(value.trim())) throw new Error(code);
  return BigInt(value.trim()).toString();
}

function signedIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d{0,127})$/.test(value.trim())) throw new Error(code);
  return BigInt(value.trim()).toString();
}

function addNonNegativeIntegerText(left: string, right: string, code: string): string {
  const sum = BigInt(left) + BigInt(right);
  if (sum < ZERO_BIGINT || sum.toString().length > 128) throw new Error(code);
  return sum.toString();
}

function parseSignedInteger(value: string): bigint {
  return BigInt(value);
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== ZERO_BIGINT) {
    [a, b] = [b, a % b];
  }
  return a;
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value)) as Readonly<T>;
}
