import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  checkpointMediaSourcePtsCadenceMapAssetRecordV2,
  claimMediaSourcePtsCadenceMapAssetRecordV2,
  completeMediaSourcePtsCadenceMapAssetRecordV2,
  createMediaSourcePtsCadenceManifestIndexSidecarV2,
  createMediaSourcePtsCadenceMapAssetRecordV2,
  markMediaSourcePtsCadenceMapAssetRecordUnverifiableV2,
  readMediaSourcePtsCadenceMapAssetStateV2,
  type MediaSourcePtsCadenceMapAssetRecordV2,
  type MediaSourcePtsCadenceMapAssetStateInputV2,
  type MediaSourcePtsCadenceMapAssetStateV2,
  type MediaSourcePtsCadenceStoredObjectReaderV2,
} from './media-source-pts-cadence-map-asset-state-v2';
import type { MediaSourcePtsCadenceMapAssetStoreResultV2 } from './media-source-pts-cadence-map-asset-store-v2';
import { renewMediaSourcePtsCadenceMapAssetClaimV2 }
  from './media-source-pts-cadence-map-claim-renewal-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_KIND_V2,
  serializeMediaSourcePtsCadenceManifestIndexV2,
  type MediaSourcePtsCadenceManifestIndexEntryV2,
  type MediaSourcePtsCadenceManifestIndexResourcePolicyV2,
  type MediaSourcePtsCadenceManifestIndexSerializationV2,
} from './media-source-pts-cadence-manifest-index-v2';
import { serializeMediaSourcePtsCadenceManifestSidecarV1 } from './media-source-pts-cadence-private-sidecar-codec-v1';
import type { MediaSourcePtsCadencePrivateSidecarPortV1 } from './media-source-pts-cadence-map-lifecycle-v1';
import type { MediaSourcePtsCadenceR2PrivateArtifactPortV2 } from './media-source-pts-cadence-r2-private-sidecar-v1';
import { promoteMediaSourcePtsCadenceScanBatchV1 } from './media-source-pts-cadence-scan-promoter-v1';
import type { MediaSourcePtsCadenceScanStagingReaderV1 } from './media-source-pts-cadence-scan-r2-reader-v1';
import { assertMediaSourcePtsCadenceScanResultV1, type MediaSourcePtsCadenceScanResultV1 } from './media-source-pts-cadence-scan-result-v1';
import { assertMediaSourcePtsCadenceScanRequestV1, type MediaSourcePtsCadenceScanRequestV1 } from './media-source-pts-cadence-scan-transport-v1';
import { createMediaSourcePtsCadenceSourceCoverageV2 } from './media-source-pts-cadence-source-coverage-v2';
import type { MediaSourceQualificationRecordV1 } from './media-source-qualification-v1';
import type { MediaSourceVersionV1 } from './media-source-version-v1';

export type MediaSourcePtsCadenceFinalizerStateOwnerV1 = Readonly<{
  load(assetId: string, userId: string): Promise<MediaSourcePtsCadenceMapAssetStateInputV2 | null>;
  persist(input: Readonly<{
    assetId: string;
    userId: string;
    expectedStateSha256: string | null;
    nextRecord: MediaSourcePtsCadenceMapAssetRecordV2;
  }>): Promise<MediaSourcePtsCadenceMapAssetStoreResultV2>;
}>;

export type MediaSourcePtsCadenceScanFinalizerResultV1 =
  | Readonly<{ disposition: 'COMPLETED' | 'ALREADY_COMPLETE'; state: MediaSourcePtsCadenceMapAssetStateV2 }>
  | Readonly<{ disposition: 'UNVERIFIABLE'; diagnostic: string }>
  | Readonly<{ disposition: 'BUSY'; activeClaimId: string }>
  | Readonly<{ disposition: 'REJECTED'; reason: string }>;

type FinalizerFailureV1 = Extract<MediaSourcePtsCadenceScanFinalizerResultV1,
  { disposition: 'BUSY' | 'REJECTED' }>;

type PersistResultV1 =
  | Readonly<{ state: MediaSourcePtsCadenceMapAssetStateV2 }>
  | Readonly<{ failure: Extract<FinalizerFailureV1, { disposition: 'REJECTED' }> }>;

type ClaimResultV1 =
  | Readonly<{ state: MediaSourcePtsCadenceMapAssetStateV2 }>
  | Readonly<{ failure: FinalizerFailureV1 }>;

export async function finalizeMediaSourcePtsCadenceScanV1(input: {
  assetId: string;
  userId: string;
  claimId: string;
  claimExpiresAt: Date;
  now(): Date;
  request: MediaSourcePtsCadenceScanRequestV1;
  result: MediaSourcePtsCadenceScanResultV1;
  sourceVersion: MediaSourceVersionV1;
  qualification: MediaSourceQualificationRecordV1;
  coveragePolicyVersion: string;
  manifestPolicy: MediaSourcePtsCadenceManifestIndexResourcePolicyV2;
  stagingReader: MediaSourcePtsCadenceScanStagingReaderV1;
  descriptorPort: MediaSourcePtsCadencePrivateSidecarPortV1;
  artifactPort: MediaSourcePtsCadenceR2PrivateArtifactPortV2;
  lifecycleManifestReader: MediaSourcePtsCadenceStoredObjectReaderV2;
  stateOwner: MediaSourcePtsCadenceFinalizerStateOwnerV1;
  lifecycle?: Readonly<{
    heartbeat(): Promise<void>;
    nextClaimExpiresAt(): Date;
  }>;
}): Promise<MediaSourcePtsCadenceScanFinalizerResultV1> {
  const request = assertMediaSourcePtsCadenceScanRequestV1(input.request);
  const scanResult = assertMediaSourcePtsCadenceScanResultV1(input.result);
  if (scanResult.status !== 'COMPLETE') {
    return { disposition: 'UNVERIFIABLE', diagnostic: scanResult.diagnostic! };
  }
  if (input.manifestPolicy.policyVersion !== request.resourcePolicy.policyVersion) {
    return { disposition: 'REJECTED', reason: 'MANIFEST_POLICY_BINDING_MISMATCH' };
  }
  await heartbeat(input);
  const asset = await input.stateOwner.load(input.assetId, input.userId);
  if (!asset) return { disposition: 'REJECTED', reason: 'ASSET_NOT_FOUND' };
  let state: MediaSourcePtsCadenceMapAssetStateV2 | null;
  try { state = readMediaSourcePtsCadenceMapAssetStateV2(asset); }
  catch { return { disposition: 'REJECTED', reason: 'CURRENT_STATE_INVALID' }; }
  if (state && state.sourcePtsCadenceMapV2.lifecycleV1.mapBindingSha256 !== request.mapBindingSha256) {
    return { disposition: 'REJECTED', reason: 'MAP_BINDING_CONFLICT' };
  }
  if (state?.sourcePtsCadenceMapV2.lifecycleV1.status === 'COMPLETE') {
    return { disposition: 'ALREADY_COMPLETE', state };
  }
  if (state?.sourcePtsCadenceMapV2.lifecycleV1.status === 'UNVERIFIABLE') {
    return { disposition: 'UNVERIFIABLE', diagnostic: state.sourcePtsCadenceMapV2.lifecycleV1.diagnostic! };
  }

  const entries: MediaSourcePtsCadenceManifestIndexEntryV2[] = [];
  let previousManifest: MediaSourcePtsCadenceManifestIndexSerializationV2 | null = null;
  let sequence = 0;
  let ordinal = '0';
  let claimReady = false;
  if (state) {
    const claimed = await ensureClaim(input, state);
    if ('failure' in claimed) return claimed.failure;
    state = claimed.state;
    claimReady = true;
  }
  for (let scanBatchIndex = 0; scanBatchIndex < scanResult.batches.length; scanBatchIndex += 1) {
    await heartbeat(input);
    if (state && claimReady) {
      const renewed = await renewClaim(input, state);
      if ('failure' in renewed) return renewed.failure;
      state = renewed.state;
    }
    const promoted = await promoteMediaSourcePtsCadenceScanBatchV1({
      request,
      result: scanResult,
      scanBatchIndex,
      nextShardSequence: sequence,
      nextFrameOrdinal: ordinal,
      sourceVersion: input.sourceVersion,
      qualification: input.qualification,
      stagingReader: input.stagingReader,
      descriptorPort: input.descriptorPort,
      artifactPort: input.artifactPort,
    });
    await heartbeat(input);
    sequence = promoted.nextShardSequence;
    ordinal = promoted.nextFrameOrdinal;
    if (!state) {
      const initial = createMediaSourcePtsCadenceMapAssetRecordV2({
        bootstrapShard: promoted.batches[0]!.serialization.payload.shard,
        now: input.now(),
      });
      const applied = await persist(input, null, initial);
      if ('failure' in applied) return applied.failure;
      state = applied.state;
    }
    if (!claimReady) {
      const claimed = await ensureClaim(input, state);
      if ('failure' in claimed) return claimed.failure;
      state = claimed.state;
      claimReady = true;
    }
    for (const batch of promoted.batches) {
      await heartbeat(input);
      const shard = batch.serialization.payload.shard;
      entries.push({
        shardSequence: shard.shardSequence,
        firstFrameOrdinal: shard.firstFrameOrdinal,
        frameCount: shard.frameCount,
        startPresentationTimestampTicks: shard.startPresentationTimestampTicks,
        endExclusivePresentationTimestampTicks: shard.endExclusivePresentationTimestampTicks,
        shardDescriptorSha256: hashEditronCanonicalJsonV1(shard),
        sidecar: batch.frameSidecar,
      });
      const manifest = serializeMediaSourcePtsCadenceManifestIndexV2({
        schemaVersion: 2,
        kind: MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_KIND_V2,
        mapBindingSha256: request.mapBindingSha256,
        resourcePolicy: input.manifestPolicy,
        batches: entries,
      });
      const manifestSidecar = createMediaSourcePtsCadenceManifestIndexSidecarV2({
        storage: 'R2_PRIVATE', manifestIndex: manifest,
      });
      await input.artifactPort.writeImmutableManifestIndex({
        serialization: manifest, expected: manifestSidecar,
      });
      const checkpoint = state.sourcePtsCadenceMapV2.lifecycleV1.checkpoint;
      if (shard.shardSequence < checkpoint.nextShardSequence) {
        if (shard.shardSequence === checkpoint.nextShardSequence - 1
          && !sameManifestSidecar(state.sourcePtsCadenceMapV2.manifestIndex, manifestSidecar)) {
          return { disposition: 'REJECTED', reason: 'RESUME_MANIFEST_MISMATCH' };
        }
        previousManifest = manifest;
        continue;
      }
      if (shard.shardSequence !== checkpoint.nextShardSequence) {
        return { disposition: 'REJECTED', reason: 'CHECKPOINT_SEQUENCE_MISMATCH' };
      }
      const checkpointed = await checkpointMediaSourcePtsCadenceMapAssetRecordV2({
        record: state.sourcePtsCadenceMapV2,
        claimId: input.claimId,
        frameBatch: batch.serialization,
        descriptorSidecar: batch.descriptorSidecar,
        manifestIndex: manifest,
        manifestIndexSidecar: manifestSidecar,
        previousManifestIndex: previousManifest,
        storedObjectReader: input.artifactPort,
        frameBatchReader: input.artifactPort,
        now: input.now,
      });
      if (checkpointed.disposition !== 'CHECKPOINTED') {
        return terminalizeUnverifiable(input, state, `${checkpointed.reason}:${checkpointed.indexReason ?? ''}`);
      }
      const applied = await persist(input, state.sourcePtsCadenceMapStateSha256V2, checkpointed.record);
      if ('failure' in applied) return applied.failure;
      state = applied.state;
      previousManifest = manifest;
    }
  }
  if (!state || !previousManifest || ordinal !== scanResult.totalFrameCount) {
    return { disposition: 'REJECTED', reason: 'FINALIZER_PROGRESS_INCOMPLETE' };
  }
  const renewed = await renewClaim(input, state);
  if ('failure' in renewed) return renewed.failure;
  state = renewed.state;
  const lifecycleManifest = serializeMediaSourcePtsCadenceManifestSidecarV1({
    storage: 'R2_PRIVATE',
    mapBindingSha256: request.mapBindingSha256,
    checkpoint: state.sourcePtsCadenceMapV2.lifecycleV1.checkpoint,
  });
  const storedLifecycleManifest = await input.descriptorPort.writeImmutableManifest({
    mapBindingSha256: request.mapBindingSha256,
    checkpoint: state.sourcePtsCadenceMapV2.lifecycleV1.checkpoint,
    expected: lifecycleManifest.sidecar,
  });
  const storedObjectReader: MediaSourcePtsCadenceStoredObjectReaderV2 = {
    read: (sidecar) => sidecar.objectKey.startsWith('private/editron/media-source-pts-cadence/v1/')
      ? input.lifecycleManifestReader.read(sidecar)
      : input.artifactPort.read(sidecar),
  };
  const terminal = await completeMediaSourcePtsCadenceMapAssetRecordV2({
    record: state.sourcePtsCadenceMapV2,
    claimId: input.claimId,
    coverage: createMediaSourcePtsCadenceSourceCoverageV2({
      sourceVersion: input.sourceVersion,
      qualification: input.qualification,
      videoStreamIndex: request.mapBinding.videoStreamIndex,
      mapper: request.mapBinding.mapper,
      coveragePolicyVersion: input.coveragePolicyVersion,
    }),
    manifestIndex: previousManifest,
    lifecycleManifest: storedLifecycleManifest,
    storedObjectReader,
    frameBatchReader: input.artifactPort,
    now: input.now,
  });
  if (terminal.disposition !== 'COMPLETED') {
    return terminalizeUnverifiable(input, state, `${terminal.reason}:${terminal.coverageReason ?? ''}`);
  }
  const applied = await persist(input, state.sourcePtsCadenceMapStateSha256V2, terminal.record);
  return 'failure' in applied ? applied.failure : { disposition: 'COMPLETED', state: applied.state };
}

async function ensureClaim(
  input: Parameters<typeof finalizeMediaSourcePtsCadenceScanV1>[0],
  state: MediaSourcePtsCadenceMapAssetStateV2,
): Promise<ClaimResultV1> {
  const record = state.sourcePtsCadenceMapV2;
  const now = input.now();
  if (record.lifecycleV1.status === 'MAPPING' && record.lifecycleV1.activeClaim
    && new Date(record.lifecycleV1.activeClaim.expiresAt).getTime() > now.getTime()) {
    return record.lifecycleV1.activeClaim.claimId === input.claimId
      ? { state }
      : { failure: { disposition: 'BUSY' as const, activeClaimId: record.lifecycleV1.activeClaim.claimId } };
  }
  const claimed = claimMediaSourcePtsCadenceMapAssetRecordV2({
    record, claimId: input.claimId, now, expiresAt: claimExpiresAt(input),
  });
  return persist(input, state.sourcePtsCadenceMapStateSha256V2, claimed);
}

async function renewClaim(
  input: Parameters<typeof finalizeMediaSourcePtsCadenceScanV1>[0],
  state: MediaSourcePtsCadenceMapAssetStateV2,
): Promise<ClaimResultV1> {
  await heartbeat(input);
  const currentExpiry = state.sourcePtsCadenceMapV2.lifecycleV1.activeClaim?.expiresAt;
  let renewed: Readonly<MediaSourcePtsCadenceMapAssetRecordV2>;
  try {
    renewed = renewMediaSourcePtsCadenceMapAssetClaimV2({
      record: state.sourcePtsCadenceMapV2,
      claimId: input.claimId,
      now: input.now(),
      expiresAt: claimExpiresAt(input),
    });
  } catch {
    return { failure: { disposition: 'REJECTED', reason: 'CLAIM_RENEWAL_FAILED' } };
  }
  if (renewed.lifecycleV1.activeClaim?.expiresAt === currentExpiry) return { state };
  return persist(input, state.sourcePtsCadenceMapStateSha256V2, renewed);
}

function heartbeat(
  input: Parameters<typeof finalizeMediaSourcePtsCadenceScanV1>[0],
): Promise<void> {
  return input.lifecycle?.heartbeat() ?? Promise.resolve();
}

function claimExpiresAt(
  input: Parameters<typeof finalizeMediaSourcePtsCadenceScanV1>[0],
): Date {
  return input.lifecycle?.nextClaimExpiresAt() ?? input.claimExpiresAt;
}

async function terminalizeUnverifiable(
  input: Parameters<typeof finalizeMediaSourcePtsCadenceScanV1>[0],
  state: MediaSourcePtsCadenceMapAssetStateV2,
  diagnostic: string,
): Promise<MediaSourcePtsCadenceScanFinalizerResultV1> {
  const failed = markMediaSourcePtsCadenceMapAssetRecordUnverifiableV2({
    record: state.sourcePtsCadenceMapV2,
    claimId: input.claimId,
    diagnostic: diagnostic.slice(0, 256),
    now: input.now(),
  });
  const applied = await persist(input, state.sourcePtsCadenceMapStateSha256V2, failed);
  return 'failure' in applied ? applied.failure : { disposition: 'UNVERIFIABLE', diagnostic };
}

async function persist(
  input: Parameters<typeof finalizeMediaSourcePtsCadenceScanV1>[0],
  expectedStateSha256: string | null,
  nextRecord: MediaSourcePtsCadenceMapAssetRecordV2,
): Promise<PersistResultV1> {
  const result = await input.stateOwner.persist({
    assetId: input.assetId, userId: input.userId, expectedStateSha256, nextRecord,
  });
  return result.disposition === 'APPLIED'
    ? { state: result.state }
    : { failure: { disposition: 'REJECTED' as const, reason: storeFailure(result) } };
}

function storeFailure(result: Exclude<MediaSourcePtsCadenceMapAssetStoreResultV2, { disposition: 'APPLIED' }>) {
  return result.disposition === 'RACE_LOST'
    ? 'STORE_RACE_LOST'
    : `${result.disposition}_${result.reason}`;
}

function sameManifestSidecar(
  left: MediaSourcePtsCadenceMapAssetRecordV2['manifestIndex'],
  right: NonNullable<MediaSourcePtsCadenceMapAssetRecordV2['manifestIndex']>,
) {
  return Boolean(left && left.objectKey === right.objectKey
    && left.contentSha256 === right.contentSha256 && left.byteLength === right.byteLength
    && left.mapBindingSha256 === right.mapBindingSha256 && left.batchCount === right.batchCount
    && left.nextFrameOrdinal === right.nextFrameOrdinal
    && left.nextPresentationTimestampTicks === right.nextPresentationTimestampTicks);
}
