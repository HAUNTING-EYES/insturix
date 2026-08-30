import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
} from './canonical-json-v1';
import {
  verifyMediaSourcePtsCadenceEpochArtifactsV3,
  type MediaSourcePtsCadenceBoundarySemanticVerifierV3,
  type MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3,
  type MediaSourcePtsCadenceEpochArtifactUnverifiableReasonV3,
  type MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3,
} from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import type { MediaSourcePtsCadenceEpochIndexResourcePolicyV3 }
  from './media-source-pts-cadence-epoch-index-v3';
import {
  claimMediaSourcePtsCadenceMapAssetRecordV3,
  completeMediaSourcePtsCadenceMapAssetRecordV3,
  createMediaSourcePtsCadenceMapAssetMongoPortsV3,
  createMediaSourcePtsCadenceMapAssetRecordV3,
  createMediaSourcePtsCadenceMapAssetStateV3,
  markMediaSourcePtsCadenceMapAssetRecordUnverifiableV3,
  persistMediaSourcePtsCadenceMapAssetStateV3,
  readMediaSourcePtsCadenceMapAssetStateV3,
  renewMediaSourcePtsCadenceMapAssetClaimV3,
  type MediaSourcePtsCadenceMapAssetRecordV3,
  type MediaSourcePtsCadenceMapAssetStateInputV3,
  type MediaSourcePtsCadenceMapAssetStateV3,
  type MediaSourcePtsCadenceMapAssetStoreResultV3,
} from './media-source-pts-cadence-map-asset-owner-v3';
import type { MediaSourcePtsCadencePrivateSidecarPortV1 }
  from './media-source-pts-cadence-map-lifecycle-v1';
import { createMediaSourcePtsCadenceR2RuntimePortsV1 }
  from './media-source-pts-cadence-r2-runtime-v1';
import type { MediaSourcePtsCadenceR2EpochIndexWriterV3 }
  from './media-source-pts-cadence-r2-epoch-index-writer-v3';
import type { MediaSourcePtsCadenceR2PrivateArtifactPortV2 }
  from './media-source-pts-cadence-r2-private-sidecar-v1';
import {
  prepareMediaSourcePtsCadenceScanFinalizationV3,
} from './media-source-pts-cadence-scan-finalizer-v3';
import type { MediaSourcePtsCadenceScanStagingReaderV1 }
  from './media-source-pts-cadence-scan-r2-reader-v1';
import type { MediaSourcePtsCadenceScanResultV1 }
  from './media-source-pts-cadence-scan-result-v1';
import type { MediaSourcePtsCadenceScanRequestV1 }
  from './media-source-pts-cadence-scan-transport-v1';
import type { MediaSourceQualificationRecordV1 } from './media-source-qualification-v1';
import type { MediaSourceVersionV1 } from './media-source-version-v1';

export type MediaSourcePtsCadenceScanPublisherStateOwnerV3 = Readonly<{
  load(assetId: string, userId: string): Promise<MediaSourcePtsCadenceMapAssetStateInputV3 | null>;
  persist(input: Readonly<{
    assetId: string;
    userId: string;
    expectedStateSha256: string | null;
    nextRecord: MediaSourcePtsCadenceMapAssetRecordV3;
  }>): Promise<MediaSourcePtsCadenceMapAssetStoreResultV3>;
}>;

export type MediaSourcePtsCadenceScanPublicationResultV3 =
  | Readonly<{
      disposition: 'COMPLETED' | 'ALREADY_COMPLETE';
      state: MediaSourcePtsCadenceMapAssetStateV3;
    }>
  | Readonly<{
      disposition: 'UNVERIFIABLE';
      diagnostic: string;
      state: MediaSourcePtsCadenceMapAssetStateV3 | null;
    }>
  | Readonly<{
      disposition: 'RETRYABLE';
      reason:
        | 'EPOCH_INDEX_WRITE_FAILED'
        | 'EPOCH_INDEX_READ_FAILED'
        | 'BATCH_READ_FAILED'
        | 'BOUNDARY_EVIDENCE_READ_FAILED'
        | 'LIFECYCLE_HEARTBEAT_FAILED';
      state: MediaSourcePtsCadenceMapAssetStateV3 | null;
    }>
  | Readonly<{ disposition: 'BUSY'; activeClaimId: string }>
  | Readonly<{ disposition: 'REJECTED'; reason: string }>;

type PublicationInputV3 = Readonly<{
  assetId: string;
  userId: string;
  claimId: string;
  now(): Date;
  request: MediaSourcePtsCadenceScanRequestV1;
  result: MediaSourcePtsCadenceScanResultV1;
  sourceVersion: MediaSourceVersionV1;
  qualification: MediaSourceQualificationRecordV1;
  epochIndexResourcePolicy: MediaSourcePtsCadenceEpochIndexResourcePolicyV3;
  verificationPolicy: MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3;
  stagingReader: MediaSourcePtsCadenceScanStagingReaderV1;
  descriptorPort: MediaSourcePtsCadencePrivateSidecarPortV1;
  artifactPort: MediaSourcePtsCadenceR2PrivateArtifactPortV2;
  epochIndexWriter: MediaSourcePtsCadenceR2EpochIndexWriterV3;
  epochArtifactReader: MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3;
  boundarySemanticVerifier: MediaSourcePtsCadenceBoundarySemanticVerifierV3;
  stateOwner: MediaSourcePtsCadenceScanPublisherStateOwnerV3;
  lifecycle: Readonly<{
    heartbeat(): Promise<void>;
    nextClaimExpiresAt(): Date;
  }>;
}>;

type PublicationControlFailureV3 = Extract<
  MediaSourcePtsCadenceScanPublicationResultV3,
  { disposition: 'BUSY' | 'REJECTED' | 'RETRYABLE' }
>;
type PublicationRetryableReasonV3 = Extract<
  MediaSourcePtsCadenceScanPublicationResultV3,
  { disposition: 'RETRYABLE' }
>['reason'];

type StateStepV3 =
  | Readonly<{ state: MediaSourcePtsCadenceMapAssetStateV3 }>
  | Readonly<{ failure: PublicationControlFailureV3 }>;

/**
 * Publishes a direct V3 scan through the existing immutable-artifact and
 * MEDIA_ASSETS owners. Content-addressed objects may be orphaned by a later
 * CAS race; a separately governed GC owner must reclaim only unreachable data.
 */
export async function publishMediaSourcePtsCadenceScanV3(
  input: PublicationInputV3,
): Promise<MediaSourcePtsCadenceScanPublicationResultV3> {
  const prepared = await prepareMediaSourcePtsCadenceScanFinalizationV3({
    request: input.request,
    result: input.result,
    sourceVersion: input.sourceVersion,
    qualification: input.qualification,
    epochIndexResourcePolicy: input.epochIndexResourcePolicy,
    stagingReader: input.stagingReader,
    descriptorPort: input.descriptorPort,
    artifactPort: input.artifactPort,
    lifecycle: { heartbeat: () => input.lifecycle.heartbeat() },
  });
  if (prepared.disposition === 'UNVERIFIABLE') {
    return frozen({
      disposition: 'UNVERIFIABLE',
      diagnostic: prepared.diagnostic,
      state: null,
    });
  }

  const pending = createMediaSourcePtsCadenceMapAssetRecordV3({
    source: prepared.expectedSource,
    epochIndexSidecar: prepared.epochIndexSidecar,
    verificationPolicy: input.verificationPolicy,
    now: input.now(),
  });
  await input.lifecycle.heartbeat();
  const asset = await input.stateOwner.load(input.assetId, input.userId);
  if (!asset) return { disposition: 'REJECTED', reason: 'ASSET_NOT_FOUND' };
  try {
    createMediaSourcePtsCadenceMapAssetStateV3({ asset, record: pending });
  } catch {
    return { disposition: 'REJECTED', reason: 'ASSET_SCOPE_INVALID' };
  }

  let state: MediaSourcePtsCadenceMapAssetStateV3 | null;
  try {
    state = readMediaSourcePtsCadenceMapAssetStateV3(asset);
  } catch {
    return { disposition: 'REJECTED', reason: 'CURRENT_STATE_INVALID' };
  }
  if (state && !samePublicationScope(state.sourcePtsCadenceMapV3, pending)) {
    return { disposition: 'REJECTED', reason: 'CURRENT_STATE_SCOPE_CONFLICT' };
  }
  if (state?.sourcePtsCadenceMapV3.status === 'COMPLETE') {
    return { disposition: 'ALREADY_COMPLETE', state };
  }
  if (state?.sourcePtsCadenceMapV3.status === 'UNVERIFIABLE') {
    return frozen({
      disposition: 'UNVERIFIABLE',
      diagnostic: state.sourcePtsCadenceMapV3.diagnostic!,
      state,
    });
  }

  await input.lifecycle.heartbeat();
  try {
    const written = await input.epochIndexWriter.writeImmutableEpochIndex({
      serialization: prepared.epochIndex,
      expected: prepared.epochIndexSidecar,
    });
    if (canonicalizeEditronJsonV1(written)
      !== canonicalizeEditronJsonV1(prepared.epochIndexSidecar)) {
      return frozen({
        disposition: 'UNVERIFIABLE',
        diagnostic: 'EPOCH_INDEX_WRITE_MISMATCH',
        state,
      });
    }
  } catch (error) {
    const code = errorCode(error);
    if (code === 'MEDIA_SOURCE_PTS_CADENCE_R2_V3_EPOCH_INDEX_EXPECTED_MISMATCH') {
      return { disposition: 'REJECTED', reason: 'EPOCH_INDEX_EXPECTED_MISMATCH' };
    }
    if (code === 'MEDIA_SOURCE_PTS_CADENCE_R2_V3_EPOCH_INDEX_CONTENT_MISMATCH') {
      return frozen({
        disposition: 'UNVERIFIABLE',
        diagnostic: 'EPOCH_INDEX_CONTENT_MISMATCH',
        state,
      });
    }
    return retryable('EPOCH_INDEX_WRITE_FAILED', state);
  }
  await input.lifecycle.heartbeat();

  if (state === null) {
    const persisted = await persist(input, null, pending);
    if ('failure' in persisted) return persisted.failure;
    state = persisted.state;
  }
  const claimed = await ensureClaim(input, state);
  if ('failure' in claimed) return claimed.failure;
  state = claimed.state;

  let lifecycleFailure: PublicationControlFailureV3 | null = null;
  const renewOrThrow = async (): Promise<void> => {
    const renewed = await renewClaim(input, state!);
    if ('failure' in renewed) {
      lifecycleFailure = renewed.failure;
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_V3_PUBLICATION_OWNERSHIP_LOST');
    }
    state = renewed.state;
  };
  const heartbeatOrThrow = async (): Promise<void> => {
    try {
      await input.lifecycle.heartbeat();
    } catch {
      lifecycleFailure = retryable('LIFECYCLE_HEARTBEAT_FAILED', state);
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_V3_PUBLICATION_HEARTBEAT_FAILED');
    }
  };
  const guardedReader: MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3 = {
    read: async (sidecar) => {
      await renewOrThrow();
      const object = await input.epochArtifactReader.read(sidecar);
      await heartbeatOrThrow();
      return object;
    },
  };
  const guardedSemanticVerifier: MediaSourcePtsCadenceBoundarySemanticVerifierV3 = {
    verify: async (verificationInput) => {
      await renewOrThrow();
      const result = await input.boundarySemanticVerifier.verify(verificationInput);
      await heartbeatOrThrow();
      return result;
    },
  };
  const verification = await verifyMediaSourcePtsCadenceEpochArtifactsV3({
    epochIndexSidecar: prepared.epochIndexSidecar,
    expectedSource: prepared.expectedSource,
    verificationPolicy: input.verificationPolicy,
    storedObjectReader: guardedReader,
    boundarySemanticVerifier: guardedSemanticVerifier,
  });
  if (lifecycleFailure) return lifecycleFailure;
  if (verification.disposition === 'UNVERIFIABLE') {
    if (isTransientVerificationReadReason(verification.reason)) {
      return retryable(verification.reason, state);
    }
    const terminal = await terminalizeUnverifiable(input, state, verification.reason);
    return 'failure' in terminal
      ? terminal.failure
      : frozen({ disposition: 'UNVERIFIABLE', diagnostic: verification.reason, state: terminal.state });
  }

  const renewed = await renewClaim(input, state);
  if ('failure' in renewed) return renewed.failure;
  state = renewed.state;
  let complete: MediaSourcePtsCadenceMapAssetRecordV3;
  try {
    complete = completeMediaSourcePtsCadenceMapAssetRecordV3({
      record: state.sourcePtsCadenceMapV3,
      claimId: input.claimId,
      verificationReceipt: verification,
      now: input.now(),
    });
  } catch {
    return { disposition: 'REJECTED', reason: 'COMPLETE_TRANSITION_INVALID' };
  }
  const completed = await persist(
    input,
    state.sourcePtsCadenceMapStateSha256V3,
    complete,
  );
  return 'failure' in completed
    ? completed.failure
    : { disposition: 'COMPLETED', state: completed.state };
}

/** Product composition over the dedicated private PTS runtime and MEDIA_ASSETS. */
export async function runMediaSourcePtsCadenceScanPublicationV3(
  input: Omit<PublicationInputV3,
    | 'stagingReader'
    | 'descriptorPort'
    | 'artifactPort'
    | 'epochIndexWriter'
    | 'epochArtifactReader'
    | 'stateOwner'>,
): Promise<MediaSourcePtsCadenceScanPublicationResultV3> {
  const storage = createMediaSourcePtsCadenceR2RuntimePortsV1();
  const statePorts = await createMediaSourcePtsCadenceMapAssetMongoPortsV3();
  return publishMediaSourcePtsCadenceScanV3({
    ...input,
    stagingReader: storage.stagingReader,
    descriptorPort: storage.descriptorPort,
    artifactPort: storage.artifactPort,
    epochIndexWriter: storage.epochIndexWriter,
    epochArtifactReader: storage.epochArtifactReader,
    stateOwner: {
      load: statePorts.load,
      persist: (stateInput) => persistMediaSourcePtsCadenceMapAssetStateV3(
        stateInput,
        statePorts,
      ),
    },
  });
}

async function ensureClaim(
  input: PublicationInputV3,
  state: MediaSourcePtsCadenceMapAssetStateV3,
): Promise<StateStepV3> {
  const record = state.sourcePtsCadenceMapV3;
  const now = input.now();
  if (record.status === 'VERIFYING' && record.activeClaim
    && Date.parse(record.activeClaim.expiresAt) > now.getTime()) {
    return record.activeClaim.claimId === input.claimId
      ? { state }
      : { failure: { disposition: 'BUSY', activeClaimId: record.activeClaim.claimId } };
  }
  let nextRecord: MediaSourcePtsCadenceMapAssetRecordV3;
  try {
    nextRecord = claimMediaSourcePtsCadenceMapAssetRecordV3({
      record,
      claimId: input.claimId,
      now,
      expiresAt: input.lifecycle.nextClaimExpiresAt(),
    });
  } catch {
    return { failure: { disposition: 'REJECTED', reason: 'CLAIM_TRANSITION_INVALID' } };
  }
  return persist(input, state.sourcePtsCadenceMapStateSha256V3, nextRecord);
}

async function renewClaim(
  input: PublicationInputV3,
  state: MediaSourcePtsCadenceMapAssetStateV3,
): Promise<StateStepV3> {
  try {
    await input.lifecycle.heartbeat();
  } catch {
    return {
      failure: {
        disposition: 'RETRYABLE',
        reason: 'LIFECYCLE_HEARTBEAT_FAILED',
        state,
      },
    };
  }
  let renewed: MediaSourcePtsCadenceMapAssetRecordV3;
  try {
    renewed = renewMediaSourcePtsCadenceMapAssetClaimV3({
      record: state.sourcePtsCadenceMapV3,
      claimId: input.claimId,
      now: input.now(),
      expiresAt: input.lifecycle.nextClaimExpiresAt(),
    });
  } catch {
    return { failure: { disposition: 'REJECTED', reason: 'CLAIM_RENEWAL_INVALID' } };
  }
  if (renewed.activeClaim?.expiresAt
    === state.sourcePtsCadenceMapV3.activeClaim?.expiresAt) {
    return { state };
  }
  return persist(input, state.sourcePtsCadenceMapStateSha256V3, renewed);
}

async function terminalizeUnverifiable(
  input: PublicationInputV3,
  state: MediaSourcePtsCadenceMapAssetStateV3,
  diagnostic: string,
): Promise<StateStepV3> {
  const renewed = await renewClaim(input, state);
  if ('failure' in renewed) return renewed;
  let terminal: MediaSourcePtsCadenceMapAssetRecordV3;
  try {
    terminal = markMediaSourcePtsCadenceMapAssetRecordUnverifiableV3({
      record: renewed.state.sourcePtsCadenceMapV3,
      claimId: input.claimId,
      diagnostic,
      now: input.now(),
    });
  } catch {
    return { failure: { disposition: 'REJECTED', reason: 'UNVERIFIABLE_TRANSITION_INVALID' } };
  }
  return persist(
    input,
    renewed.state.sourcePtsCadenceMapStateSha256V3,
    terminal,
  );
}

async function persist(
  input: PublicationInputV3,
  expectedStateSha256: string | null,
  nextRecord: MediaSourcePtsCadenceMapAssetRecordV3,
): Promise<StateStepV3> {
  const result = await input.stateOwner.persist({
    assetId: input.assetId,
    userId: input.userId,
    expectedStateSha256,
    nextRecord,
  });
  if (result.disposition === 'APPLIED' || result.disposition === 'UNCHANGED') {
    return { state: result.state };
  }
  return { failure: { disposition: 'REJECTED', reason: storeFailure(result) } };
}

function samePublicationScope(
  current: MediaSourcePtsCadenceMapAssetRecordV3,
  pending: MediaSourcePtsCadenceMapAssetRecordV3,
): boolean {
  return canonicalizeEditronJsonV1(current.source)
      === canonicalizeEditronJsonV1(pending.source)
    && canonicalizeEditronJsonV1(current.epochIndexSidecar)
      === canonicalizeEditronJsonV1(pending.epochIndexSidecar)
    && canonicalizeEditronJsonV1(current.verificationPolicy)
      === canonicalizeEditronJsonV1(pending.verificationPolicy);
}

function storeFailure(
  result: Exclude<MediaSourcePtsCadenceMapAssetStoreResultV3,
    { disposition: 'APPLIED' | 'UNCHANGED' }>,
): string {
  if (result.disposition === 'RACE_LOST') return 'STORE_RACE_LOST';
  return `${result.disposition}_${result.reason}`;
}

function errorCode(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

function isTransientVerificationReadReason(
  reason: MediaSourcePtsCadenceEpochArtifactUnverifiableReasonV3,
): reason is Extract<PublicationRetryableReasonV3,
  'EPOCH_INDEX_READ_FAILED' | 'BATCH_READ_FAILED' | 'BOUNDARY_EVIDENCE_READ_FAILED'> {
  return reason === 'EPOCH_INDEX_READ_FAILED'
    || reason === 'BATCH_READ_FAILED'
    || reason === 'BOUNDARY_EVIDENCE_READ_FAILED';
}

function retryable(
  reason: PublicationRetryableReasonV3,
  state: MediaSourcePtsCadenceMapAssetStateV3 | null,
): Extract<MediaSourcePtsCadenceScanPublicationResultV3,
  { disposition: 'RETRYABLE' }> {
  return frozen({ disposition: 'RETRYABLE', reason, state });
}

function frozen<T extends object>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value);
}
