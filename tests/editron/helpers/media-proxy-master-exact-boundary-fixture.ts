import { createHash } from 'node:crypto';

import {
  CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
  parseCanonicalMediaTimeV1,
  type CanonicalMediaTimeV1,
  type PresentationEpochV1,
} from '@/lib/editron/contracts/canonical-media-time-v1';
import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  createMediaProxyMasterActiveMappingAssetStateV1,
  type MediaProxyMasterActiveMappingAssetInputV1,
  type MediaProxyMasterActiveMappingAssetStateV1,
} from '@/lib/editron/services/media-proxy-master-active-mapping-asset-owner-v1';
import {
  createMediaProxyMasterCorrespondenceBatchSidecarV1,
  serializeMediaProxyMasterCorrespondenceBatchV1,
  type MediaProxyMasterCorrespondenceBatchSerializationV1,
  type MediaProxyMasterCorrespondenceBatchSidecarV1,
  type MediaProxyMasterFrameCorrespondenceSpanV1,
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
import {
  qualifyMediaProxyMasterTimeMappingV1,
  type MediaProxyMasterMappingQualificationReceiptV1,
} from '@/lib/editron/services/media-proxy-master-mapping-qualification-v1';
import type { MediaProxyMasterTimeMapReferenceV1 }
  from '@/lib/editron/services/media-proxy-master-time-mapping-v1';
import type { MediaSourcePtsCadenceEpochPresentationFrameV3 }
  from '@/lib/editron/services/media-source-pts-cadence-epoch-window-reader-v3';
import { createMediaSourceInvalidationPlanV1 }
  from '@/lib/editron/services/media-source-version-v1';
import { buildMediaProxyMasterMappingQualificationFixtureV1 }
  from './media-proxy-master-mapping-qualification-fixture';

const FRAME_COUNT = 300;
const SOURCE_TIMESCALE = '90000';
const BATCH_SPAN_COUNT = 3;

type SourceRoleV1 = 'proxy' | 'master';

type StoredObjectV1 = Readonly<{
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>;

type TimelineFrameV1 = MediaSourcePtsCadenceEpochPresentationFrameV3;

type TimelineV1 = Readonly<{
  epoch: PresentationEpochV1;
  frames: readonly TimelineFrameV1[];
}>;

type IntervalV1 = Readonly<{
  frameOrdinal: string;
  startTicks: bigint;
  endTicks: bigint;
}>;

export type MediaProxyMasterExactBoundaryFixtureV1 = Readonly<{
  activeMappingState: MediaProxyMasterActiveMappingAssetStateV1;
  asset: MediaProxyMasterActiveMappingAssetInputV1;
  qualification: MediaProxyMasterMappingQualificationReceiptV1;
  objects: ReadonlyMap<string, StoredObjectV1>;
  indexObjectKey: string;
  batchObjectKeys: readonly string[];
  proxyFrameCount: string;
  masterFrameCount: string;
}>;

export async function buildMediaProxyMasterExactBoundaryFixtureV1(input: Readonly<{
  tag: string;
  cadence: 'EQUAL' | 'VARIABLE' | 'OFFSET';
}>): Promise<MediaProxyMasterExactBoundaryFixtureV1> {
  const base = await buildMediaProxyMasterMappingQualificationFixtureV1({
    tag: input.tag,
  });
  const basis = base.derivationReceipt.basis;
  if (basis.proxyTimeMap.totalFrameCount !== String(FRAME_COUNT)
    || basis.masterTimeMap.totalFrameCount !== String(FRAME_COUNT)) {
    throw new Error('EXACT_BOUNDARY_FIXTURE_FRAME_COUNT_MISMATCH');
  }

  const masterDurations = Array.from(
    { length: FRAME_COUNT },
    () => 3_000,
  );
  const proxyDurations = input.cadence === 'EQUAL'
    ? [...masterDurations]
    : input.cadence === 'VARIABLE'
      ? [2_000, 4_000, 2_000, 4_000, ...masterDurations.slice(4)]
      : [1_500, 1_500, 4_500, 4_500, ...masterDurations.slice(4)];
  const proxyTimeline = timeline('proxy', proxyDurations);
  const masterTimeline = timeline('master', masterDurations);
  assertEqualTerminalDuration(proxyTimeline, masterTimeline);

  const spans = correspondenceSpans(proxyTimeline, masterTimeline);
  const batches = serializeBatches(input.tag, basis, spans);
  const indexSerialization = createMediaProxyMasterCorrespondenceIndexV1({
    basis,
    resourcePolicy: {
      policyVersion: `${input.tag}-exact-boundary-index-v1`,
      requiredBatchPolicyVersion:
        `${input.tag}-exact-boundary-batch-v1`,
      maxCanonicalJsonBytes: 1024 * 1024,
      maxBatchEntries: 1_000,
    },
    batches,
  });
  const indexReference = createMediaProxyMasterCorrespondenceIndexReferenceV1({
    serialization: indexSerialization,
  });
  const derivationReceipt = derivation(
    input.tag,
    basis,
    indexReference,
    batches,
  );
  const timelines = { proxy: proxyTimeline, master: masterTimeline };
  const windowResourcePolicy = {
    policyVersion: `${input.tag}-exact-boundary-window-v1`,
    maxFrameRecords: FRAME_COUNT,
    maxBatchReads: 10,
    maxTotalReadBytes: 1024 * 1024,
  };
  const readWindow = async (windowInput: Parameters<
  NonNullable<Parameters<
  typeof materializeMediaProxyMasterMappingSegmentsV1
  >[0]['readWindow']>
  >[0]) => {
    const role = (windowInput.asset as { fixtureRole?: unknown }).fixtureRole;
    if (role !== 'proxy' && role !== 'master') {
      throw new Error('EXACT_BOUNDARY_FIXTURE_ROLE_INVALID');
    }
    return presentationWindow({
      tag: input.tag,
      role,
      timeline: timelines[role],
      map: role === 'proxy' ? basis.proxyTimeMap : basis.masterTimeMap,
      firstFrameOrdinal: windowInput.firstFrameOrdinal,
      endExclusiveFrameOrdinal: windowInput.endExclusiveFrameOrdinal,
      resourcePolicy: windowInput.resourcePolicy,
    });
  };
  const segmentMaterializationReceipt =
    await materializeMediaProxyMasterMappingSegmentsV1({
      derivationReceipt,
      proxy: source('proxy', windowResourcePolicy),
      master: source('master', windowResourcePolicy),
      materializationPolicy:
        createMediaProxyMasterMappingSegmentMaterializationPolicyV1({
          policyVersion: `${input.tag}-exact-boundary-segments-v1`,
          pageFrameRecords: 37,
          maxPageReads: 100,
          maxSegments: 100,
          maxTotalFrameRecords: 10_000,
          maxTotalSelectedBatchBytes: 16 * 1024 * 1024,
        }),
      readWindow,
    });
  if (segmentMaterializationReceipt.disposition
    !== 'MAPPING_SEGMENTS_MATERIALIZED') {
    throw new Error(
      `EXACT_BOUNDARY_FIXTURE_SEGMENTS_UNVERIFIABLE:${segmentMaterializationReceipt.reason}`,
    );
  }

  const qualification = qualifyMediaProxyMasterTimeMappingV1({
    relation: base.relation,
    trustedTranscodeReceipt: base.trustedTranscodeReceipt,
    correspondenceDerivationReceipt: derivationReceipt,
    segmentMaterializationReceipt,
    audioLineageReceipt: base.audioLineageReceipt,
    workerImageDigest: sha256(`${input.tag}-worker-image`),
    qualifiedAt: new Date('2026-08-31T10:04:00.000Z'),
  });
  if (qualification.disposition !== 'MAPPING_QUALIFIED') {
    throw new Error(
      `EXACT_BOUNDARY_FIXTURE_QUALIFICATION_FAILED:${qualification.reason}`,
    );
  }
  const proxySource = base.trustedTranscodeReceipt.proxyEncode.sourceVersion;
  const masterSource =
    base.trustedTranscodeReceipt.command.masterSourceVersion;
  const userId = relationUserId(base.relation.owner);
  const asset = {
    assetId: base.relation.assetId,
    userId,
    type: 'video' as const,
    isProxy: false as const,
    sourceVersionV1: masterSource,
    proxySourceVersionV1: proxySource,
    proxyMasterRelationV1: base.relation,
    sourceInvalidationPlanV1: createMediaSourceInvalidationPlanV1({
      previous: proxySource,
      next: masterSource,
      proxyMasterRelation: base.relation,
    }),
  };
  const activeMappingState = createMediaProxyMasterActiveMappingAssetStateV1({
    assetId: base.relation.assetId,
    userId,
    asset,
    qualification,
    predecessorStateSha256: null,
    activatedAt: new Date('2026-08-31T10:05:00.000Z'),
  });

  const objects = new Map<string, StoredObjectV1>();
  for (const batch of batches) {
    objects.set(batch.sidecar.objectKey, {
      canonicalJson: batch.serialization.canonicalJson,
      byteLength: batch.serialization.byteLength,
      contentSha256: batch.serialization.contentSha256,
    });
  }
  objects.set(indexReference.objectKey, {
    canonicalJson: indexSerialization.canonicalJson,
    byteLength: indexSerialization.byteLength,
    contentSha256: indexSerialization.contentSha256,
  });
  return {
    activeMappingState,
    asset: {
      ...asset,
      proxyMasterActiveMappingV1:
        activeMappingState.proxyMasterActiveMappingV1,
      proxyMasterActiveMappingStateSha256V1:
        activeMappingState.proxyMasterActiveMappingStateSha256V1,
    },
    qualification,
    objects,
    indexObjectKey: indexReference.objectKey,
    batchObjectKeys: batches.map((batch) => batch.sidecar.objectKey),
    proxyFrameCount: basis.proxyTimeMap.totalFrameCount,
    masterFrameCount: basis.masterTimeMap.totalFrameCount,
  };
}

function serializeBatches(
  tag: string,
  basis: Parameters<typeof serializeMediaProxyMasterCorrespondenceBatchV1>[0]['basis'],
  spans: readonly MediaProxyMasterFrameCorrespondenceSpanV1[],
): readonly Readonly<{
  serialization: MediaProxyMasterCorrespondenceBatchSerializationV1;
  sidecar: MediaProxyMasterCorrespondenceBatchSidecarV1;
}>[] {
  const batches = [];
  for (let offset = 0; offset < spans.length; offset += BATCH_SPAN_COUNT) {
    const selected = spans.slice(offset, offset + BATCH_SPAN_COUNT);
    const serialization = serializeMediaProxyMasterCorrespondenceBatchV1({
      basis,
      resourcePolicy: {
        policyVersion: `${tag}-exact-boundary-batch-v1`,
        maxCanonicalJsonBytes: 256 * 1024,
        maxSpanRecords: BATCH_SPAN_COUNT,
      },
      batchSequence: batches.length,
      firstSpanOrdinal: selected[0]!.spanOrdinal,
      spans: selected,
    });
    batches.push({
      serialization,
      sidecar: createMediaProxyMasterCorrespondenceBatchSidecarV1({
        serialization,
      }),
    });
  }
  return batches;
}

function derivation(
  tag: string,
  basis: Parameters<typeof serializeMediaProxyMasterCorrespondenceBatchV1>[0]['basis'],
  indexReference: ReturnType<
  typeof createMediaProxyMasterCorrespondenceIndexReferenceV1
  >,
  batches: readonly Readonly<{
    serialization: MediaProxyMasterCorrespondenceBatchSerializationV1;
    sidecar: MediaProxyMasterCorrespondenceBatchSidecarV1;
  }>[],
) {
  const verifiedBatches = batches.map(({ serialization, sidecar }) => {
    const first = serialization.batch.spans[0]!;
    const last = serialization.batch.spans.at(-1)!;
    const proxyFrameRecords = Number(
      BigInt(last.proxyFrameOrdinal) - BigInt(first.proxyFrameOrdinal)
        + BigInt(1),
    );
    const masterFrameRecords = Number(
      BigInt(last.masterFrameOrdinal) - BigInt(first.masterFrameOrdinal)
        + BigInt(1),
    );
    return {
      batchSequence: serialization.batch.batchSequence,
      contentSha256: sidecar.contentSha256,
      spanCount: String(serialization.batch.spans.length),
      proxyFirstFrameOrdinal: first.proxyFrameOrdinal,
      proxyEndExclusiveFrameOrdinal:
        (BigInt(last.proxyFrameOrdinal) + BigInt(1)).toString(),
      masterFirstFrameOrdinal: first.masterFrameOrdinal,
      masterEndExclusiveFrameOrdinal:
        (BigInt(last.masterFrameOrdinal) + BigInt(1)).toString(),
      proxySelectedBatchBytes: proxyFrameRecords * 64,
      masterSelectedBatchBytes: masterFrameRecords * 64,
      proxyWindowEvidenceSha256: sha256(
        `${tag}-proxy-window-${serialization.batch.batchSequence}`,
      ),
      masterWindowEvidenceSha256: sha256(
        `${tag}-master-window-${serialization.batch.batchSequence}`,
      ),
    };
  });
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_KIND_V1,
    disposition: 'CORRESPONDENCE_V3_DERIVATION_VERIFIED' as const,
    verifierVersion:
      MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_VERIFIER_VERSION_V1,
    basis,
    indexReference,
    artifactVerificationSha256: sha256(`${tag}-artifact-verification`),
    derivationPolicy: {
      policyVersion: `${tag}-exact-boundary-derivation-v1`,
      maxSpanChecks: 10_000,
      maxTotalWindowFrameRecords: 100_000,
      maxTotalSelectedBatchBytes: 64 * 1024 * 1024,
    },
    verifiedBatchCount: verifiedBatches.length,
    verifiedSpanCount: verifiedBatches.reduce(
      (total, batch) => total + BigInt(batch.spanCount),
      BigInt(0),
    ).toString(),
    totalWindowFrameRecords: verifiedBatches.reduce(
      (total, batch) => total
        + Number(BigInt(batch.proxyEndExclusiveFrameOrdinal)
          - BigInt(batch.proxyFirstFrameOrdinal))
        + Number(BigInt(batch.masterEndExclusiveFrameOrdinal)
          - BigInt(batch.masterFirstFrameOrdinal)),
      0,
    ),
    totalSelectedBatchBytes: verifiedBatches.reduce(
      (total, batch) => total + batch.proxySelectedBatchBytes
        + batch.masterSelectedBatchBytes,
      0,
    ),
    canonicalEndExclusiveTime:
      batches.at(-1)!.serialization.batch.spans.at(-1)!
        .canonicalEndExclusiveTime,
    verifiedBatches,
  };
  return assertMediaProxyMasterCorrespondenceV3DerivationReceiptV1({
    ...material,
    derivationSha256: hashEditronCanonicalJsonV1(material),
  });
}

function timeline(role: SourceRoleV1, durations: readonly number[]): TimelineV1 {
  let timestamp = BigInt(0);
  const frames = durations.map((duration, ordinal) => {
    if (!Number.isSafeInteger(duration) || duration <= 0) {
      throw new Error('EXACT_BOUNDARY_FIXTURE_DURATION_INVALID');
    }
    const frame = {
      sourceFrameOrdinal: String(ordinal),
      epochId: `${role}-exact-boundary-epoch-0`,
      presentationTimestampTicks: timestamp.toString(),
      durationTicks: String(duration),
    };
    timestamp += BigInt(duration);
    return frame;
  });
  const epoch: PresentationEpochV1 = {
    schemaVersion: 1,
    contractVersion: CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
    kind: 'presentation-epoch',
    epochId: `${role}-exact-boundary-epoch-0`,
    streamId: 'video-0',
    secondsPerSourceTick: { numerator: '1', denominator: SOURCE_TIMESCALE },
    sourceStartPresentationTimestampTicks: '0',
    sourceEndExclusivePresentationTimestampTicks: timestamp.toString(),
    canonicalStartTime: parseCanonicalMediaTimeV1({
      ticks: '0',
      timescale: '1',
    }),
    boundaryKind: 'INITIAL',
  };
  return { epoch, frames };
}

function correspondenceSpans(
  proxy: TimelineV1,
  master: TimelineV1,
): readonly MediaProxyMasterFrameCorrespondenceSpanV1[] {
  const proxyIntervals = intervals(proxy);
  const masterIntervals = intervals(master);
  const spans: MediaProxyMasterFrameCorrespondenceSpanV1[] = [];
  let proxyIndex = 0;
  let masterIndex = 0;
  while (proxyIndex < proxyIntervals.length
    && masterIndex < masterIntervals.length) {
    const proxyFrame = proxyIntervals[proxyIndex]!;
    const masterFrame = masterIntervals[masterIndex]!;
    const startTicks = proxyFrame.startTicks > masterFrame.startTicks
      ? proxyFrame.startTicks : masterFrame.startTicks;
    const endTicks = proxyFrame.endTicks < masterFrame.endTicks
      ? proxyFrame.endTicks : masterFrame.endTicks;
    if (startTicks >= endTicks) {
      throw new Error('EXACT_BOUNDARY_FIXTURE_EMPTY_INTERSECTION');
    }
    spans.push({
      spanOrdinal: String(spans.length),
      canonicalStartTime: canonicalTime(startTicks),
      canonicalEndExclusiveTime: canonicalTime(endTicks),
      proxyFrameOrdinal: proxyFrame.frameOrdinal,
      masterFrameOrdinal: masterFrame.frameOrdinal,
    });
    if (proxyFrame.endTicks === endTicks) proxyIndex += 1;
    if (masterFrame.endTicks === endTicks) masterIndex += 1;
  }
  if (proxyIndex !== proxyIntervals.length
    || masterIndex !== masterIntervals.length) {
    throw new Error('EXACT_BOUNDARY_FIXTURE_TERMINAL_COVERAGE_MISMATCH');
  }
  return spans;
}

function intervals(timelineValue: TimelineV1): readonly IntervalV1[] {
  return timelineValue.frames.map((frame) => {
    const startTicks = BigInt(frame.presentationTimestampTicks);
    return {
      frameOrdinal: frame.sourceFrameOrdinal,
      startTicks,
      endTicks: startTicks + BigInt(frame.durationTicks),
    };
  });
}

function assertEqualTerminalDuration(
  proxy: TimelineV1,
  master: TimelineV1,
): void {
  if (proxy.epoch.sourceEndExclusivePresentationTimestampTicks
    !== master.epoch.sourceEndExclusivePresentationTimestampTicks) {
    throw new Error('EXACT_BOUNDARY_FIXTURE_TERMINAL_DURATION_MISMATCH');
  }
}

function canonicalTime(ticks: bigint): CanonicalMediaTimeV1 {
  return parseCanonicalMediaTimeV1({
    ticks: ticks.toString(),
    timescale: SOURCE_TIMESCALE,
  });
}

function source(
  role: SourceRoleV1,
  windowResourcePolicy:
    MediaProxyMasterCorrespondenceProducerSourceV1['windowResourcePolicy'],
): MediaProxyMasterCorrespondenceProducerSourceV1 {
  return {
    asset: { fixtureRole: role } as never,
    storedObjectReader: {
      async read() {
        throw new Error('EXACT_BOUNDARY_FIXTURE_UNEXPECTED_STORED_READ');
      },
    },
    windowResourcePolicy,
  };
}

function presentationWindow(input: Readonly<{
  tag: string;
  role: SourceRoleV1;
  timeline: TimelineV1;
  map: MediaProxyMasterTimeMapReferenceV1;
  firstFrameOrdinal: string;
  endExclusiveFrameOrdinal: string;
  resourcePolicy: Parameters<
  NonNullable<Parameters<
  typeof materializeMediaProxyMasterMappingSegmentsV1
  >[0]['readWindow']>
  >[0]['resourcePolicy'];
}>) {
  const first = Number(BigInt(input.firstFrameOrdinal));
  const end = Number(BigInt(input.endExclusiveFrameOrdinal));
  const frames = input.timeline.frames.slice(first, end);
  if (frames.length === 0 || frames.length !== end - first) {
    throw new Error('EXACT_BOUNDARY_FIXTURE_WINDOW_RANGE_INVALID');
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
    sourceTimebase: { numerator: '1', denominator: SOURCE_TIMESCALE },
    firstFrameOrdinal: input.firstFrameOrdinal,
    endExclusiveFrameOrdinal: input.endExclusiveFrameOrdinal,
    selectedBatchCount: 1,
    selectedBatchBytes: frames.length * 64,
    epochs: [input.timeline.epoch],
    frames,
    selectedBatches: [{
      batchSequence: 0,
      epochId: input.timeline.epoch.epochId,
      contentSha256: sha256(
        `${input.tag}-${input.role}-${input.firstFrameOrdinal}-${input.endExclusiveFrameOrdinal}`,
      ),
      shardDescriptorSha256: sha256(
        `${input.tag}-${input.role}-window-shard`,
      ),
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

function relationUserId(
  owner: Readonly<{ kind: string; userId?: string }>,
): string {
  if (owner.kind !== 'USER' || typeof owner.userId !== 'string') {
    throw new Error('EXACT_BOUNDARY_FIXTURE_USER_OWNER_REQUIRED');
  }
  return owner.userId;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
