import { createHash } from 'node:crypto';

import {
  CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
  mediaTimeFromPresentationEpochTicksV1,
  parseCanonicalMediaTimeV1,
  type PresentationEpochV1,
} from '@/lib/editron/contracts/canonical-media-time-v1';
import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import { verifyMediaProxyMasterAudioLineageV1 }
  from '@/lib/editron/services/media-proxy-master-audio-lineage-verifier-v1';
import {
  createMediaProxyMasterCorrespondenceBatchSidecarV1,
  serializeMediaProxyMasterCorrespondenceBatchV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-batch-v1';
import {
  createMediaProxyMasterCorrespondenceIndexReferenceV1,
  createMediaProxyMasterCorrespondenceIndexV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-index-v1';
import type { MediaProxyMasterCorrespondenceProducerSourceV1 }
  from '@/lib/editron/services/media-proxy-master-correspondence-producer-v1';
import {
  assertMediaProxyMasterCorrespondenceV3DerivationReceiptV1,
  MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_KIND_V1,
  MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_VERIFIER_VERSION_V1,
} from '@/lib/editron/services/media-proxy-master-correspondence-v3-derivation-verifier-v1';
import {
  createMediaProxyMasterMappingSegmentMaterializationPolicyV1,
  materializeMediaProxyMasterMappingSegmentsV1,
} from '@/lib/editron/services/media-proxy-master-mapping-segment-materializer-v1';
import type { MediaProxyMasterTimeMapReferenceV1 }
  from '@/lib/editron/services/media-proxy-master-time-mapping-v1';
import type { MediaSourcePtsCadenceEpochPresentationFrameV3 }
  from '@/lib/editron/services/media-source-pts-cadence-epoch-window-reader-v3';
import { buildMediaProxyMasterAudioLineageFixtureV1 }
  from './media-proxy-master-audio-lineage-fixture';

const FRAME_COUNT = 300;
const VIDEO_TIMEBASE = { numerator: '1', denominator: '90000' } as const;
const DEFAULT_FRAME_DURATION_TICKS = 3_000;

type RoleV1 = 'proxy' | 'master';

export type MediaProxyMasterMappingQualificationFixtureOptionsV1 = Readonly<{
  tag?: string;
  noAudio?: boolean;
  frameDurationTicks?: number;
}>;

export async function buildMediaProxyMasterMappingQualificationFixtureV1(
  options: MediaProxyMasterMappingQualificationFixtureOptionsV1 = {},
) {
  const tag = options.tag ?? 'mapping-qualification';
  const noAudio = options.noAudio ?? false;
  const frameDurationTicks = options.frameDurationTicks
    ?? DEFAULT_FRAME_DURATION_TICKS;
  if (!Number.isSafeInteger(frameDurationTicks) || frameDurationTicks <= 0) {
    throw new Error('MAPPING_QUALIFICATION_FIXTURE_FRAME_DURATION_INVALID');
  }
  const audioFixture = buildMediaProxyMasterAudioLineageFixtureV1({
    tag,
    observedMasterAudioStreamIndexes: noAudio ? [] : [1],
    selectedMasterAudioStreamIndexes: noAudio ? [] : [1],
  });
  const audioLineageReceipt = await verifyMediaProxyMasterAudioLineageV1({
    relation: audioFixture.relation,
    trustedTranscodeReceipt: audioFixture.trustedTranscodeReceipt,
    masterAudioAvailabilityEvidence:
      audioFixture.masterAudioAvailabilityEvidence,
    proxyAudioAvailabilityEvidence:
      audioFixture.proxyAudioAvailabilityEvidence,
    verificationPolicy: audioFixture.verificationPolicy,
    reader: audioFixture.reader,
    verifiedAt: audioFixture.verifiedAt,
  });
  if (audioLineageReceipt.disposition !== 'AUDIO_LINEAGE_VERIFIED') {
    throw new Error('MAPPING_QUALIFICATION_FIXTURE_AUDIO_UNVERIFIABLE');
  }

  const basis = {
    relationSha256: audioFixture.relation.relationSha256,
    proxyTimeMap: proxyTimeMap(tag, audioFixture),
    masterTimeMap: audioFixture.trustedTranscodeReceipt.command.masterTimeMap,
  };
  const epochEndTicks = String(FRAME_COUNT * frameDurationTicks);
  const timelines = {
    proxy: timeline('proxy', epochEndTicks, frameDurationTicks),
    master: timeline('master', epochEndTicks, frameDurationTicks),
  };
  const spans = timelines.proxy.frames.map((frame, index) => ({
    spanOrdinal: String(index),
    canonicalStartTime: mediaTimeFromPresentationEpochTicksV1(
      timelines.proxy.epoch,
      frame.presentationTimestampTicks,
    ),
    canonicalEndExclusiveTime: mediaTimeFromPresentationEpochTicksV1(
      timelines.proxy.epoch,
      String(
        BigInt(frame.presentationTimestampTicks) + BigInt(frame.durationTicks),
      ),
    ),
    proxyFrameOrdinal: frame.sourceFrameOrdinal,
    masterFrameOrdinal: frame.sourceFrameOrdinal,
  }));
  const batchSerialization = serializeMediaProxyMasterCorrespondenceBatchV1({
    basis,
    resourcePolicy: {
      policyVersion: `${tag}-correspondence-batch-v1`,
      maxCanonicalJsonBytes: 512 * 1024,
      maxSpanRecords: 1_000,
    },
    batchSequence: 0,
    firstSpanOrdinal: '0',
    spans,
  });
  const batchSidecar = createMediaProxyMasterCorrespondenceBatchSidecarV1({
    serialization: batchSerialization,
  });
  const indexSerialization = createMediaProxyMasterCorrespondenceIndexV1({
    basis,
    resourcePolicy: {
      policyVersion: `${tag}-correspondence-index-v1`,
      requiredBatchPolicyVersion: `${tag}-correspondence-batch-v1`,
      maxCanonicalJsonBytes: 512 * 1024,
      maxBatchEntries: 10,
    },
    batches: [{ serialization: batchSerialization, sidecar: batchSidecar }],
  });
  const indexReference = createMediaProxyMasterCorrespondenceIndexReferenceV1({
    serialization: indexSerialization,
  });
  const canonicalEndExclusiveTime = parseCanonicalMediaTimeV1({
    ticks: epochEndTicks,
    timescale: VIDEO_TIMEBASE.denominator,
  });
  const selectedBatchBytes = FRAME_COUNT * 64;
  const derivationMaterial = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_KIND_V1,
    disposition: 'CORRESPONDENCE_V3_DERIVATION_VERIFIED' as const,
    verifierVersion:
      MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_VERIFIER_VERSION_V1,
    basis,
    indexReference,
    artifactVerificationSha256: hash(`${tag}-artifact-verification`),
    derivationPolicy: {
      policyVersion: `${tag}-derivation-v1`,
      maxSpanChecks: 1_000,
      maxTotalWindowFrameRecords: 1_000,
      maxTotalSelectedBatchBytes: 1024 * 1024,
    },
    verifiedBatchCount: 1,
    verifiedSpanCount: String(FRAME_COUNT),
    totalWindowFrameRecords: FRAME_COUNT * 2,
    totalSelectedBatchBytes: selectedBatchBytes * 2,
    canonicalEndExclusiveTime,
    verifiedBatches: [{
      batchSequence: 0,
      contentSha256: batchSidecar.contentSha256,
      spanCount: String(FRAME_COUNT),
      proxyFirstFrameOrdinal: '0',
      proxyEndExclusiveFrameOrdinal: String(FRAME_COUNT),
      masterFirstFrameOrdinal: '0',
      masterEndExclusiveFrameOrdinal: String(FRAME_COUNT),
      proxySelectedBatchBytes: selectedBatchBytes,
      masterSelectedBatchBytes: selectedBatchBytes,
      proxyWindowEvidenceSha256: hash(`${tag}-proxy-derivation-window`),
      masterWindowEvidenceSha256: hash(`${tag}-master-derivation-window`),
    }],
  };
  const derivationReceipt =
    assertMediaProxyMasterCorrespondenceV3DerivationReceiptV1({
      ...derivationMaterial,
      derivationSha256: hashEditronCanonicalJsonV1(derivationMaterial),
    });

  const windowResourcePolicy = {
    policyVersion: `${tag}-window-v1`,
    maxFrameRecords: 300,
    maxBatchReads: 10,
    maxTotalReadBytes: 1024 * 1024,
  };
  const readWindow = async (input: Parameters<
  NonNullable<Parameters<typeof materializeMediaProxyMasterMappingSegmentsV1>[0]['readWindow']>
  >[0]) => {
    const role = (input.asset as { fixtureRole?: unknown }).fixtureRole;
    if (role !== 'proxy' && role !== 'master') {
      throw new Error('MAPPING_QUALIFICATION_FIXTURE_ROLE_INVALID');
    }
    return presentationWindow({
      tag,
      role,
      timeline: timelines[role],
      map: role === 'proxy' ? basis.proxyTimeMap : basis.masterTimeMap,
      firstFrameOrdinal: input.firstFrameOrdinal,
      endExclusiveFrameOrdinal: input.endExclusiveFrameOrdinal,
      resourcePolicy: input.resourcePolicy,
    });
  };
  const segmentMaterializationReceipt =
    await materializeMediaProxyMasterMappingSegmentsV1({
      derivationReceipt,
      proxy: source('proxy', windowResourcePolicy),
      master: source('master', windowResourcePolicy),
      materializationPolicy:
        createMediaProxyMasterMappingSegmentMaterializationPolicyV1({
          policyVersion: `${tag}-segment-materialization-v1`,
          pageFrameRecords: 113,
          maxPageReads: 10,
          maxSegments: 10,
          maxTotalFrameRecords: 1_000,
          maxTotalSelectedBatchBytes: 1024 * 1024,
        }),
      readWindow,
    });
  if (segmentMaterializationReceipt.disposition
    !== 'MAPPING_SEGMENTS_MATERIALIZED') {
    throw new Error('MAPPING_QUALIFICATION_FIXTURE_SEGMENTS_UNVERIFIABLE');
  }

  return {
    relation: audioFixture.relation,
    trustedTranscodeReceipt: audioFixture.trustedTranscodeReceipt,
    derivationReceipt,
    segmentMaterializationReceipt,
    audioLineageReceipt,
  };
}

function proxyTimeMap(
  tag: string,
  fixture: ReturnType<typeof buildMediaProxyMasterAudioLineageFixtureV1>,
): MediaProxyMasterTimeMapReferenceV1 {
  const proxy = fixture.relation.proxy;
  return {
    sourceVersionSha256: proxy.sourceVersionSha256,
    storageVersionSha256: proxy.storageVersionSha256,
    sourceBindingSha256: hash(`${tag}-proxy-video-binding`),
    technicalObservationSha256: hash(`${tag}-proxy-video-observation`),
    sourcePtsCadenceMapStateSha256V3: hash(`${tag}-proxy-video-state-v3`),
    mapBindingSha256: hash(`${tag}-proxy-video-map-binding`),
    terminalReceiptSha256: hash(`${tag}-proxy-video-terminal`),
    verificationSha256: hash(`${tag}-proxy-video-verification`),
    epochIndexContentSha256: hash(`${tag}-proxy-video-epoch-index`),
    streamId: 'video-0',
    videoStreamIndex: 0,
    totalFrameCount: String(FRAME_COUNT),
  };
}

function timeline(
  role: RoleV1,
  epochEndTicks: string,
  frameDurationTicks: number,
) {
  const epoch: PresentationEpochV1 = {
    schemaVersion: 1,
    contractVersion: CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
    kind: 'presentation-epoch',
    epochId: `${role}-qualification-epoch-0`,
    streamId: 'video-0',
    secondsPerSourceTick: VIDEO_TIMEBASE,
    sourceStartPresentationTimestampTicks: '0',
    sourceEndExclusivePresentationTimestampTicks: epochEndTicks,
    canonicalStartTime: parseCanonicalMediaTimeV1({ ticks: '0', timescale: '1' }),
    boundaryKind: 'INITIAL',
  };
  const frames: readonly MediaSourcePtsCadenceEpochPresentationFrameV3[] =
    Array.from({ length: FRAME_COUNT }, (_, ordinal) => ({
      sourceFrameOrdinal: String(ordinal),
      epochId: epoch.epochId,
      presentationTimestampTicks: String(ordinal * frameDurationTicks),
      durationTicks: String(frameDurationTicks),
    }));
  return { epoch, frames, sourceTimebase: VIDEO_TIMEBASE };
}

function source(
  role: RoleV1,
  windowResourcePolicy:
    MediaProxyMasterCorrespondenceProducerSourceV1['windowResourcePolicy'],
): MediaProxyMasterCorrespondenceProducerSourceV1 {
  return {
    asset: { fixtureRole: role } as never,
    storedObjectReader: {
      async read() {
        throw new Error('MAPPING_QUALIFICATION_FIXTURE_UNEXPECTED_STORED_READ');
      },
    },
    windowResourcePolicy,
  };
}

function presentationWindow(input: Readonly<{
  tag: string;
  role: RoleV1;
  timeline: ReturnType<typeof timeline>;
  map: MediaProxyMasterTimeMapReferenceV1;
  firstFrameOrdinal: string;
  endExclusiveFrameOrdinal: string;
  resourcePolicy: Parameters<
  NonNullable<Parameters<typeof materializeMediaProxyMasterMappingSegmentsV1>[0]['readWindow']>
  >[0]['resourcePolicy'];
}>) {
  const first = Number(BigInt(input.firstFrameOrdinal));
  const end = Number(BigInt(input.endExclusiveFrameOrdinal));
  const frames = input.timeline.frames.slice(first, end);
  if (frames.length === 0 || frames.length !== end - first) {
    throw new Error('MAPPING_QUALIFICATION_FIXTURE_WINDOW_RANGE_INVALID');
  }
  const material = {
    schemaVersion: 3 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_EPOCH_PRESENTATION_WINDOW_V3' as const,
    disposition: 'EPOCH_PRESENTATION_WINDOW_VERIFIED' as const,
    evidenceStatus: 'HASH_VERIFIED_SOURCE_BOUND_EPOCH_V3_WINDOW' as const,
    assetId: `${input.tag}-${input.role}-asset`,
    sourceVersionSha256: input.map.sourceVersionSha256,
    storageVersionSha256: input.map.storageVersionSha256,
    sourceBindingSha256: input.map.sourceBindingSha256,
    technicalObservationSha256: input.map.technicalObservationSha256,
    sourcePtsCadenceMapStateSha256V3:
      input.map.sourcePtsCadenceMapStateSha256V3,
    mapBindingSha256: input.map.mapBindingSha256,
    terminalReceiptSha256: input.map.terminalReceiptSha256,
    verificationSha256: input.map.verificationSha256,
    epochIndexContentSha256: input.map.epochIndexContentSha256,
    streamId: input.map.streamId,
    videoStreamIndex: input.map.videoStreamIndex,
    sourceTimebase: input.timeline.sourceTimebase,
    firstFrameOrdinal: input.firstFrameOrdinal,
    endExclusiveFrameOrdinal: input.endExclusiveFrameOrdinal,
    selectedBatchCount: 1,
    selectedBatchBytes: frames.length * 64,
    epochs: [input.timeline.epoch],
    frames,
    selectedBatches: [{
      batchSequence: 0,
      epochId: input.timeline.epoch.epochId,
      contentSha256: hash(
        `${input.tag}-${input.role}-${input.firstFrameOrdinal}-${input.endExclusiveFrameOrdinal}`,
      ),
      shardDescriptorSha256: hash(`${input.tag}-${input.role}-window-shard`),
      firstFrameOrdinal: input.firstFrameOrdinal,
      frameCount: String(frames.length),
    }],
    resourcePolicy: input.resourcePolicy,
  };
  return {
    ...material,
    presentationWindowEvidenceSha256: hashEditronCanonicalJsonV1(material),
  };
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
