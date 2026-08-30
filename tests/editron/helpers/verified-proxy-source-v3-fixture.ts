import { createHash } from 'node:crypto';

import {
  CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
  parseCanonicalMediaTimeV1,
  type PresentationEpochV1,
} from '@/lib/editron/contracts/canonical-media-time-v1';
import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  verifyMediaSourcePtsCadenceEpochArtifactsV3,
  type MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-artifact-verifier-v3';
import {
  createMediaSourcePtsCadenceEpochIndexSidecarV3,
  createMediaSourcePtsCadenceEpochIndexV3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-index-v3';
import { serializeMediaSourcePtsCadenceFrameBatchV2 }
  from '@/lib/editron/services/media-source-pts-cadence-frame-batch-v2';
import {
  claimMediaSourcePtsCadenceMapAssetRecordV3,
  completeMediaSourcePtsCadenceMapAssetRecordV3,
  createMediaSourcePtsCadenceMapAssetRecordV3,
  createMediaSourcePtsCadenceMapAssetStateV3,
  type MediaSourcePtsCadenceMapAssetStateInputV3,
} from '@/lib/editron/services/media-source-pts-cadence-map-asset-owner-v3';
import { mediaSourcePtsCadenceMapBindingSha256V1 }
  from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import { createMediaSourcePtsCadenceFrameBatchSidecarV2 }
  from '@/lib/editron/services/media-source-pts-cadence-manifest-index-v2';
import { createMediaSourcePtsCadenceShardV1 }
  from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import type { MediaProxyMasterTimeMapReferenceV1 }
  from '@/lib/editron/services/media-proxy-master-time-mapping-v1';
import { resolveVerifiedVideoSourceEpochTimeBindingV3 }
  from '@/lib/editron/services/video-source-time-transform-v1';

const SOURCE_TIMEBASE = { numerator: '1', denominator: '90000' } as const;
const DEFAULT_FRAME_DURATIONS = [
  '3000', '1500', '4500', '3000', '3000', '3000',
] as const;

type StoredObjectV1 = Readonly<{
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>;

export async function buildVerifiedProxySourceV3FixtureV1(input: Readonly<{
  tag: string;
  userId?: string;
  frameDurations?: readonly string[];
}>) {
  const userId = input.userId ?? 'verified-proxy-user';
  const assetId = `verified-proxy-${input.tag}`;
  const frameDurations = input.frameDurations ?? DEFAULT_FRAME_DURATIONS;
  if (frameDurations.length === 0) {
    throw new Error('VERIFIED_PROXY_FIXTURE_FRAME_DURATIONS_EMPTY');
  }
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: {
      provider: 'R2',
      objectKey: `private/editron/test/${input.tag}/proxy-source.mkv`,
    },
    byteLength: 1_048_576,
    providerVersion: {
      kind: 'R2_ETAG',
      value: `verified-proxy-etag-${input.tag}`,
    },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId },
    assetId,
    mediaKind: 'video',
    byteLength: 1_048_576,
    contentSha256: sha256(`verified-proxy-content-${input.tag}`),
    storageVersion,
  });
  const totalDurationTicks = frameDurations.reduce(
    (total, duration) => total + positiveTicks(duration),
    BigInt(0),
  );
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: 'matroska',
    durationMilliseconds: Number(
      totalDurationTicks * BigInt(1000) / BigInt(SOURCE_TIMEBASE.denominator),
    ),
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0,
      codec: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
      pixelFormat: 'yuv420p',
      sourceTimebase: SOURCE_TIMEBASE,
      sourceStartPts: '0',
      sourceDurationTicks: totalDurationTicks.toString(),
      averageFrameRate: { numerator: '30', denominator: '1' },
      realFrameRate: { numerator: '30', denominator: '1' },
      frameCount: String(frameDurations.length),
      colorSpace: 'bt709',
      colorTransfer: 'bt709',
      colorPrimaries: 'bt709',
      colorRange: 'tv',
      timecode: null,
      reelId: null,
    }],
    audioStreams: [],
  };
  const qualification = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1' as const,
    status: 'MEASURED_TECHNICAL' as const,
    assetId,
    locator: storageVersion.locator,
    sourceBindingSha256: sha256(`verified-proxy-source-binding-${input.tag}`),
    requestId: `verified-proxy-request-${input.tag}`,
    attemptCount: 1,
    requestedAt: '2026-08-31T09:00:00.000Z',
    startedAt: '2026-08-31T09:00:01.000Z',
    completedAt: '2026-08-31T09:00:02.000Z',
    storageVersion,
    observation: {
      ...observationMaterial,
      observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
    },
    diagnostic: null,
  };
  const frames = sourceFrames(frameDurations);
  const mapper = {
    mapperVersion: 'verified-proxy-mapper-v3',
    ffprobeVersion: 'ffprobe-8.1',
    commandPolicyVersion: 'verified-proxy-mapper-policy-v3',
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
  };
  const shard = createMediaSourcePtsCadenceShardV1({
    sourceVersion,
    qualification,
    videoStreamIndex: 0,
    mapper,
    shardSequence: 0,
    firstFrameOrdinal: '0',
    frames,
  });
  const mapBindingSha256 = mediaSourcePtsCadenceMapBindingSha256V1(shard);
  const batchSerialization = serializeMediaSourcePtsCadenceFrameBatchV2({
    mapBindingSha256,
    resourcePolicy: {
      policyVersion: mapper.commandPolicyVersion,
      maxCanonicalJsonBytes: 1024 * 1024,
      maxFrameRecords: 1_000,
    },
    shard,
    frames,
  });
  const batchSidecar = createMediaSourcePtsCadenceFrameBatchSidecarV2({
    storage: 'R2_PRIVATE',
    serialization: batchSerialization,
  });
  const epoch: PresentationEpochV1 = {
    schemaVersion: 1,
    contractVersion: CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
    kind: 'presentation-epoch',
    epochId: `${input.tag}-proxy-epoch-0`,
    streamId: 'video-0',
    secondsPerSourceTick: SOURCE_TIMEBASE,
    sourceStartPresentationTimestampTicks: '0',
    sourceEndExclusivePresentationTimestampTicks:
      totalDurationTicks.toString(),
    canonicalStartTime: parseCanonicalMediaTimeV1({
      ticks: '0',
      timescale: '1',
    }),
    boundaryKind: 'INITIAL',
  };
  const indexSerialization = createMediaSourcePtsCadenceEpochIndexV3({
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    mapBindingSha256,
    videoStreamIndex: 0,
    sourceTimebase: SOURCE_TIMEBASE,
    resourcePolicy: {
      policyVersion: 'verified-proxy-epoch-index-policy-v3',
      maxCanonicalJsonBytes: 1024 * 1024,
      maxEpochEntries: 10,
      maxBatchEntries: 10,
    },
    epochs: [{
      epoch,
      boundary: {
        classificationBasis: 'FIRST_DECODED_PRESENTATION',
        detectorVersion: 'verified-proxy-epoch-detector-v3',
        externalEvidence: null,
      },
      batches: [{ serialization: batchSerialization, sidecar: batchSidecar }],
    }],
  });
  const indexSidecar = createMediaSourcePtsCadenceEpochIndexSidecarV3({
    storage: 'R2_PRIVATE',
    serialization: indexSerialization,
  });
  const objects = new Map<string, StoredObjectV1>([
    [indexSidecar.objectKey, stored(indexSerialization)],
    [batchSidecar.objectKey, stored(batchSerialization)],
  ]);
  const storedObjectReader = {
    async read(reference) {
      const object = objects.get(reference.objectKey);
      if (!object) throw new Error('VERIFIED_PROXY_FIXTURE_OBJECT_MISSING');
      return structuredClone(object);
    },
  } satisfies MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3;
  const verificationPolicy = {
    policyVersion: 'verified-proxy-artifact-verification-policy-v3',
    maxBatchReads: 10,
    maxBoundaryEvidenceReads: 10,
    maxTotalArtifactBytes: 8 * 1024 * 1024,
    boundaryEvidenceRegistryVersion: 'verified-proxy-boundary-registry-v3',
  } as const;
  const expectedSource = {
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
    sourceBindingSha256: qualification.sourceBindingSha256,
    technicalObservationSha256: qualification.observation.observationSha256,
    mapBindingSha256,
    videoStreamIndex: 0,
    sourceTimebase: SOURCE_TIMEBASE,
  };
  const verification = await verifyMediaSourcePtsCadenceEpochArtifactsV3({
    epochIndexSidecar: indexSidecar,
    expectedSource,
    verificationPolicy,
    storedObjectReader,
    boundarySemanticVerifier: {
      async verify() {
        throw new Error('VERIFIED_PROXY_FIXTURE_UNEXPECTED_BOUNDARY_VERIFY');
      },
    },
  });
  if (verification.disposition !== 'EPOCH_ARTIFACT_SET_VERIFIED') {
    throw new Error(`VERIFIED_PROXY_FIXTURE_UNVERIFIABLE:${verification.reason}`);
  }
  const baseAsset: MediaSourcePtsCadenceMapAssetStateInputV3 & Readonly<{
    userId: string;
    isProxy: true;
  }> = {
    assetId,
    userId,
    type: 'video',
    isProxy: true,
    sourceVersionV1: sourceVersion,
    sourceQualificationV1: qualification,
  };
  const pending = createMediaSourcePtsCadenceMapAssetRecordV3({
    source: expectedSource,
    epochIndexSidecar: indexSidecar,
    verificationPolicy,
    now: new Date('2026-08-31T09:01:00.000Z'),
  });
  const claimed = claimMediaSourcePtsCadenceMapAssetRecordV3({
    record: pending,
    claimId: `verified-proxy-claim-${input.tag}`,
    now: new Date('2026-08-31T09:02:00.000Z'),
    expiresAt: new Date('2026-08-31T09:12:00.000Z'),
  });
  const completed = completeMediaSourcePtsCadenceMapAssetRecordV3({
    record: claimed,
    claimId: `verified-proxy-claim-${input.tag}`,
    verificationReceipt: verification,
    now: new Date('2026-08-31T09:03:00.000Z'),
  });
  const state = createMediaSourcePtsCadenceMapAssetStateV3({
    asset: baseAsset,
    record: completed,
  });
  const asset = { ...baseAsset, ...state };
  const verifiedBinding = resolveVerifiedVideoSourceEpochTimeBindingV3(asset);
  if (!verifiedBinding) {
    throw new Error('VERIFIED_PROXY_FIXTURE_BINDING_MISSING');
  }
  const proxyTimeMapReference = {
    sourceVersionSha256: verifiedBinding.sourceVersionSha256,
    storageVersionSha256: verifiedBinding.storageVersionSha256,
    sourceBindingSha256: verifiedBinding.sourceBindingSha256,
    technicalObservationSha256: verifiedBinding.technicalObservationSha256,
    sourcePtsCadenceMapStateSha256V3:
      verifiedBinding.sourcePtsCadenceMapStateSha256V3,
    mapBindingSha256: verifiedBinding.mapBindingSha256,
    terminalReceiptSha256: verifiedBinding.terminalReceiptSha256,
    verificationSha256: verifiedBinding.verificationSha256,
    epochIndexContentSha256: verifiedBinding.epochIndexContentSha256,
    streamId: verifiedBinding.streamId,
    videoStreamIndex: verifiedBinding.videoStreamIndex,
    totalFrameCount: verifiedBinding.totalSourceFrameCount,
  } satisfies MediaProxyMasterTimeMapReferenceV1;
  return {
    asset,
    assetId,
    userId,
    verifiedBinding,
    proxyTimeMapReference,
    proxyTimeMapReferenceSha256:
      hashEditronCanonicalJsonV1(proxyTimeMapReference),
    objects,
  };
}

function sourceFrames(
  durations: readonly string[],
): readonly Readonly<{
  presentationTimestampTicks: string;
  durationTicks: string;
}>[] {
  let timestamp = BigInt(0);
  return durations.map((duration) => {
    const durationTicks = positiveTicks(duration);
    const frame = {
      presentationTimestampTicks: timestamp.toString(),
      durationTicks: durationTicks.toString(),
    };
    timestamp += durationTicks;
    return frame;
  });
}

function positiveTicks(value: string): bigint {
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error('VERIFIED_PROXY_FIXTURE_DURATION_INVALID');
  }
  if (parsed <= BigInt(0)) {
    throw new Error('VERIFIED_PROXY_FIXTURE_DURATION_INVALID');
  }
  return parsed;
}

function stored(value: Readonly<{
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>): StoredObjectV1 {
  return {
    canonicalJson: value.canonicalJson,
    byteLength: value.byteLength,
    contentSha256: value.contentSha256,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
