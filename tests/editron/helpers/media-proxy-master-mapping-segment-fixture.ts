import {
  CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
  compareCanonicalMediaTimeV1,
  mediaTimeFromPresentationEpochTicksV1,
  parseCanonicalMediaTimeV1,
  type CanonicalMediaTimeV1,
  type ExactRationalRateV1,
  type PresentationEpochV1,
} from '@/lib/editron/contracts/canonical-media-time-v1';
import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  createMediaProxyMasterCorrespondenceBatchSidecarV1,
  serializeMediaProxyMasterCorrespondenceBatchV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-batch-v1';
import {
  createMediaProxyMasterCorrespondenceIndexReferenceV1,
  createMediaProxyMasterCorrespondenceIndexV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-index-v1';
import type {
  MediaProxyMasterCorrespondenceProducerSourceV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-producer-v1';
import {
  assertMediaProxyMasterCorrespondenceV3DerivationReceiptV1,
  MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_KIND_V1,
  MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_VERIFIER_VERSION_V1,
  type MediaProxyMasterCorrespondenceV3DerivationReceiptV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-v3-derivation-verifier-v1';
import {
  readMediaSourcePtsCadenceEpochPresentationWindowV3,
  type MediaSourcePtsCadenceEpochPresentationFrameV3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-window-reader-v3';
import type {
  MediaProxyMasterTimeMapReferenceV1,
} from '@/lib/editron/services/media-proxy-master-time-mapping-v1';

type SourceRoleV1 = 'proxy' | 'master';
type ReadWindowV3 = typeof readMediaSourcePtsCadenceEpochPresentationWindowV3;

type TimelineV1 = Readonly<{
  role: SourceRoleV1;
  sourceTimebase: ExactRationalRateV1;
  epochs: readonly PresentationEpochV1[];
  frames: readonly MediaSourcePtsCadenceEpochPresentationFrameV3[];
}>;

type FrameIntervalV1 = Readonly<{
  frameOrdinal: string;
  start: CanonicalMediaTimeV1;
  end: CanonicalMediaTimeV1;
}>;

export type MediaProxyMasterMappingSegmentFixtureV1 = Readonly<{
  derivationReceipt: MediaProxyMasterCorrespondenceV3DerivationReceiptV1;
  proxy: MediaProxyMasterCorrespondenceProducerSourceV1;
  master: MediaProxyMasterCorrespondenceProducerSourceV1;
  readWindow: ReadWindowV3;
}>;

export function createUnequalRateMappingSegmentFixtureV1():
MediaProxyMasterMappingSegmentFixtureV1 {
  const timebase = rate(1, 6);
  return createFixture(
    timeline('proxy', timebase, [
      epoch('proxy-epoch-0', timebase, '0', '6', '0', 'INITIAL'),
    ], [
      frame(0, 'proxy-epoch-0', 0, 2),
      frame(1, 'proxy-epoch-0', 2, 2),
      frame(2, 'proxy-epoch-0', 4, 2),
    ]),
    timeline('master', timebase, [
      epoch('master-epoch-0', timebase, '0', '6', '0', 'INITIAL'),
    ], [
      frame(0, 'master-epoch-0', 0, 3),
      frame(1, 'master-epoch-0', 3, 3),
    ]),
  );
}

export function createSharedResetMappingSegmentFixtureV1():
MediaProxyMasterMappingSegmentFixtureV1 {
  const timebase = rate(1, 2);
  return createFixture(
    resetTimeline('proxy', timebase),
    resetTimeline('master', timebase),
  );
}

export function createUnrepresentableEpochMappingSegmentFixtureV1():
MediaProxyMasterMappingSegmentFixtureV1 {
  const timebase = rate(1, 6);
  return createFixture(
    timeline('proxy', timebase, [
      epoch('proxy-epoch-0', timebase, '0', '2', '0', 'INITIAL'),
      epoch(
        'proxy-epoch-1',
        timebase,
        '10',
        '14',
        '1/3',
        'TIMESTAMP_RESET',
      ),
    ], [
      frame(0, 'proxy-epoch-0', 0, 2),
      frame(1, 'proxy-epoch-1', 10, 2),
      frame(2, 'proxy-epoch-1', 12, 2),
    ]),
    timeline('master', timebase, [
      epoch('master-epoch-0', timebase, '0', '6', '0', 'INITIAL'),
    ], [
      frame(0, 'master-epoch-0', 0, 3),
      frame(1, 'master-epoch-0', 3, 3),
    ]),
  );
}

export function fixtureSha256V1(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}

function createFixture(
  proxyTimeline: TimelineV1,
  masterTimeline: TimelineV1,
): MediaProxyMasterMappingSegmentFixtureV1 {
  const basis = {
    relationSha256: fixtureSha256V1('mapping-segment-relation'),
    proxyTimeMap: timeMap('proxy', proxyTimeline.frames.length),
    masterTimeMap: timeMap('master', masterTimeline.frames.length),
  };
  const proxyIntervals = intervals(proxyTimeline);
  const masterIntervals = intervals(masterTimeline);
  const spans = correspondenceSpans(proxyIntervals, masterIntervals);
  const batchSerialization = serializeMediaProxyMasterCorrespondenceBatchV1({
    basis,
    resourcePolicy: {
      policyVersion: 'mapping-segment-fixture-batch-policy-v1',
      maxCanonicalJsonBytes: 256 * 1024,
      maxSpanRecords: 1_000,
    },
    batchSequence: 0,
    firstSpanOrdinal: '0',
    spans,
  });
  const batchSidecar = createMediaProxyMasterCorrespondenceBatchSidecarV1({
    serialization: batchSerialization,
  });
  const batch = { serialization: batchSerialization, sidecar: batchSidecar };
  const indexSerialization = createMediaProxyMasterCorrespondenceIndexV1({
    basis,
    resourcePolicy: {
      policyVersion: 'mapping-segment-fixture-index-policy-v1',
      requiredBatchPolicyVersion: 'mapping-segment-fixture-batch-policy-v1',
      maxCanonicalJsonBytes: 256 * 1024,
      maxBatchEntries: 10,
    },
    batches: [batch],
  });
  const indexReference = createMediaProxyMasterCorrespondenceIndexReferenceV1({
    serialization: indexSerialization,
  });
  const canonicalEndExclusiveTime = proxyIntervals.at(-1)?.end;
  if (!canonicalEndExclusiveTime
    || compareCanonicalMediaTimeV1(
      canonicalEndExclusiveTime,
      masterIntervals.at(-1)?.end ?? zeroTime(),
    ) !== 0) {
    throw new Error('MAPPING_SEGMENT_FIXTURE_TERMINAL_MISMATCH');
  }
  const derivationMaterial = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_KIND_V1,
    disposition: 'CORRESPONDENCE_V3_DERIVATION_VERIFIED' as const,
    verifierVersion:
      MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_VERIFIER_VERSION_V1,
    basis,
    indexReference,
    artifactVerificationSha256: fixtureSha256V1('artifact-verification'),
    derivationPolicy: {
      policyVersion: 'mapping-segment-fixture-derivation-policy-v1',
      maxSpanChecks: 1_000,
      maxTotalWindowFrameRecords: 10_000,
      maxTotalSelectedBatchBytes: 1024 * 1024,
    },
    verifiedBatchCount: 1,
    verifiedSpanCount: String(spans.length),
    totalWindowFrameRecords:
      proxyTimeline.frames.length + masterTimeline.frames.length,
    totalSelectedBatchBytes: 128,
    canonicalEndExclusiveTime,
    verifiedBatches: [{
      batchSequence: 0,
      contentSha256: batch.sidecar.contentSha256,
      spanCount: String(spans.length),
      proxyFirstFrameOrdinal: '0',
      proxyEndExclusiveFrameOrdinal: String(proxyTimeline.frames.length),
      masterFirstFrameOrdinal: '0',
      masterEndExclusiveFrameOrdinal: String(masterTimeline.frames.length),
      proxySelectedBatchBytes: 64,
      masterSelectedBatchBytes: 64,
      proxyWindowEvidenceSha256: fixtureSha256V1('proxy-derivation-window'),
      masterWindowEvidenceSha256: fixtureSha256V1('master-derivation-window'),
    }],
  };
  const derivationReceipt =
    assertMediaProxyMasterCorrespondenceV3DerivationReceiptV1({
      ...derivationMaterial,
      derivationSha256: hashEditronCanonicalJsonV1(derivationMaterial),
    });
  const windowResourcePolicy = {
    policyVersion: 'mapping-segment-fixture-window-policy-v1',
    maxFrameRecords: 100,
    maxBatchReads: 10,
    maxTotalReadBytes: 1024 * 1024,
  };
  const timelines = { proxy: proxyTimeline, master: masterTimeline };
  const readWindow: ReadWindowV3 = async (input) => {
    const role = (input.asset as { fixtureRole?: unknown }).fixtureRole;
    if (role !== 'proxy' && role !== 'master') {
      throw new Error('MAPPING_SEGMENT_FIXTURE_ROLE_INVALID');
    }
    return presentationWindow(
      role,
      timelines[role],
      role === 'proxy' ? basis.proxyTimeMap : basis.masterTimeMap,
      input.firstFrameOrdinal,
      input.endExclusiveFrameOrdinal,
      input.resourcePolicy,
    );
  };
  return {
    derivationReceipt,
    proxy: source('proxy', windowResourcePolicy),
    master: source('master', windowResourcePolicy),
    readWindow,
  };
}

function source(
  role: SourceRoleV1,
  windowResourcePolicy: MediaProxyMasterCorrespondenceProducerSourceV1['windowResourcePolicy'],
): MediaProxyMasterCorrespondenceProducerSourceV1 {
  return {
    asset: { fixtureRole: role } as never,
    storedObjectReader: {
      async read() {
        throw new Error('MAPPING_SEGMENT_FIXTURE_UNEXPECTED_STORED_READ');
      },
    },
    windowResourcePolicy,
  };
}

function presentationWindow(
  role: SourceRoleV1,
  sourceTimeline: TimelineV1,
  map: MediaProxyMasterTimeMapReferenceV1,
  firstFrameOrdinal: string,
  endExclusiveFrameOrdinal: string,
  resourcePolicy: Parameters<ReadWindowV3>[0]['resourcePolicy'],
) {
  const first = Number(BigInt(firstFrameOrdinal));
  const end = Number(BigInt(endExclusiveFrameOrdinal));
  const frames = sourceTimeline.frames.slice(first, end);
  if (frames.length !== end - first || frames.length === 0) {
    throw new Error('MAPPING_SEGMENT_FIXTURE_WINDOW_RANGE_INVALID');
  }
  const epochIds = new Set(frames.map((entry) => entry.epochId));
  const epochs = sourceTimeline.epochs.filter((entry) => epochIds.has(entry.epochId));
  const material = {
    schemaVersion: 3 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_EPOCH_PRESENTATION_WINDOW_V3' as const,
    disposition: 'EPOCH_PRESENTATION_WINDOW_VERIFIED' as const,
    evidenceStatus: 'HASH_VERIFIED_SOURCE_BOUND_EPOCH_V3_WINDOW' as const,
    assetId: `${role}-asset`,
    sourceVersionSha256: map.sourceVersionSha256,
    storageVersionSha256: map.storageVersionSha256,
    sourceBindingSha256: map.sourceBindingSha256,
    technicalObservationSha256: map.technicalObservationSha256,
    sourcePtsCadenceMapStateSha256V3: map.sourcePtsCadenceMapStateSha256V3,
    mapBindingSha256: map.mapBindingSha256,
    terminalReceiptSha256: map.terminalReceiptSha256,
    verificationSha256: map.verificationSha256,
    epochIndexContentSha256: map.epochIndexContentSha256,
    streamId: map.streamId,
    videoStreamIndex: map.videoStreamIndex,
    sourceTimebase: sourceTimeline.sourceTimebase,
    firstFrameOrdinal,
    endExclusiveFrameOrdinal,
    selectedBatchCount: 1,
    selectedBatchBytes: frames.length * 64,
    epochs,
    frames,
    selectedBatches: [{
      batchSequence: 0,
      epochId: frames[0]!.epochId,
      contentSha256: fixtureSha256V1(
        `${role}-window-${firstFrameOrdinal}-${endExclusiveFrameOrdinal}`,
      ),
      shardDescriptorSha256: fixtureSha256V1(`${role}-window-shard`),
      firstFrameOrdinal,
      frameCount: String(frames.length),
    }],
    resourcePolicy,
  };
  return {
    ...material,
    presentationWindowEvidenceSha256: hashEditronCanonicalJsonV1(material),
  };
}

function resetTimeline(
  role: SourceRoleV1,
  timebase: ExactRationalRateV1,
): TimelineV1 {
  return timeline(role, timebase, [
    epoch(`${role}-epoch-0`, timebase, '10', '12', '0', 'INITIAL'),
    epoch(
      `${role}-epoch-1`,
      timebase,
      '-2',
      '0',
      '1',
      'TIMESTAMP_RESET',
    ),
  ], [
    frame(0, `${role}-epoch-0`, 10, 1),
    frame(1, `${role}-epoch-0`, 11, 1),
    frame(2, `${role}-epoch-1`, -2, 1),
    frame(3, `${role}-epoch-1`, -1, 1),
  ]);
}

function timeline(
  role: SourceRoleV1,
  sourceTimebase: ExactRationalRateV1,
  epochs: readonly PresentationEpochV1[],
  frames: readonly MediaSourcePtsCadenceEpochPresentationFrameV3[],
): TimelineV1 {
  return { role, sourceTimebase, epochs, frames };
}

function epoch(
  epochId: string,
  secondsPerSourceTick: ExactRationalRateV1,
  sourceStartPresentationTimestampTicks: string,
  sourceEndExclusivePresentationTimestampTicks: string,
  canonicalStart: string,
  boundaryKind: PresentationEpochV1['boundaryKind'],
): PresentationEpochV1 {
  return {
    schemaVersion: 1,
    contractVersion: CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
    kind: 'presentation-epoch',
    epochId,
    streamId: 'video-0',
    secondsPerSourceTick,
    sourceStartPresentationTimestampTicks,
    sourceEndExclusivePresentationTimestampTicks,
    canonicalStartTime: time(canonicalStart),
    boundaryKind,
  };
}

function frame(
  sourceFrameOrdinal: number,
  epochId: string,
  presentationTimestampTicks: number,
  durationTicks: number,
): MediaSourcePtsCadenceEpochPresentationFrameV3 {
  return {
    sourceFrameOrdinal: String(sourceFrameOrdinal),
    epochId,
    presentationTimestampTicks: String(presentationTimestampTicks),
    durationTicks: String(durationTicks),
  };
}

function intervals(sourceTimeline: TimelineV1): readonly FrameIntervalV1[] {
  const epochs = new Map(sourceTimeline.epochs.map((entry) => [entry.epochId, entry]));
  let cursor = zeroTime();
  return sourceTimeline.frames.map((entry, ordinal) => {
    if (entry.sourceFrameOrdinal !== String(ordinal)) {
      throw new Error('MAPPING_SEGMENT_FIXTURE_FRAME_ORDINAL_INVALID');
    }
    const sourceEpoch = epochs.get(entry.epochId);
    if (!sourceEpoch) throw new Error('MAPPING_SEGMENT_FIXTURE_EPOCH_MISSING');
    const start = mediaTimeFromPresentationEpochTicksV1(
      sourceEpoch,
      entry.presentationTimestampTicks,
    );
    const end = mediaTimeFromPresentationEpochTicksV1(
      sourceEpoch,
      String(
        BigInt(entry.presentationTimestampTicks) + BigInt(entry.durationTicks),
      ),
    );
    if (compareCanonicalMediaTimeV1(start, cursor) !== 0
      || compareCanonicalMediaTimeV1(start, end) >= 0) {
      throw new Error('MAPPING_SEGMENT_FIXTURE_PRESENTATION_INVALID');
    }
    cursor = end;
    return { frameOrdinal: entry.sourceFrameOrdinal, start, end };
  });
}

function correspondenceSpans(
  proxy: readonly FrameIntervalV1[],
  master: readonly FrameIntervalV1[],
) {
  const spans = [];
  let proxyIndex = 0;
  let masterIndex = 0;
  let cursor = zeroTime();
  while (proxyIndex < proxy.length && masterIndex < master.length) {
    const proxyFrame = proxy[proxyIndex]!;
    const masterFrame = master[masterIndex]!;
    const start = laterTime(proxyFrame.start, masterFrame.start);
    const end = earlierTime(proxyFrame.end, masterFrame.end);
    if (compareCanonicalMediaTimeV1(start, cursor) !== 0
      || compareCanonicalMediaTimeV1(start, end) >= 0) {
      throw new Error('MAPPING_SEGMENT_FIXTURE_CORRESPONDENCE_INVALID');
    }
    spans.push({
      spanOrdinal: String(spans.length),
      canonicalStartTime: start,
      canonicalEndExclusiveTime: end,
      proxyFrameOrdinal: proxyFrame.frameOrdinal,
      masterFrameOrdinal: masterFrame.frameOrdinal,
    });
    cursor = end;
    if (compareCanonicalMediaTimeV1(proxyFrame.end, end) === 0) proxyIndex += 1;
    if (compareCanonicalMediaTimeV1(masterFrame.end, end) === 0) masterIndex += 1;
  }
  if (proxyIndex !== proxy.length || masterIndex !== master.length) {
    throw new Error('MAPPING_SEGMENT_FIXTURE_CORRESPONDENCE_TERMINAL_INVALID');
  }
  return spans;
}

function timeMap(
  role: SourceRoleV1,
  totalFrameCount: number,
): MediaProxyMasterTimeMapReferenceV1 {
  return {
    sourceVersionSha256: fixtureSha256V1(`${role}-source`),
    storageVersionSha256: fixtureSha256V1(`${role}-storage`),
    sourceBindingSha256: fixtureSha256V1(`${role}-source-binding`),
    technicalObservationSha256: fixtureSha256V1(`${role}-observation`),
    sourcePtsCadenceMapStateSha256V3: fixtureSha256V1(`${role}-state`),
    mapBindingSha256: fixtureSha256V1(`${role}-map-binding`),
    terminalReceiptSha256: fixtureSha256V1(`${role}-terminal`),
    verificationSha256: fixtureSha256V1(`${role}-verification`),
    epochIndexContentSha256: fixtureSha256V1(`${role}-epoch-index`),
    streamId: 'video-0',
    videoStreamIndex: 0,
    totalFrameCount: String(totalFrameCount),
  };
}

function rate(numerator: number, denominator: number): ExactRationalRateV1 {
  return { numerator: String(numerator), denominator: String(denominator) };
}

function time(value: string): CanonicalMediaTimeV1 {
  const [ticks, timescale = '1'] = value.split('/');
  return parseCanonicalMediaTimeV1({ ticks: ticks!, timescale });
}

function zeroTime(): CanonicalMediaTimeV1 {
  return time('0');
}

function laterTime(
  left: CanonicalMediaTimeV1,
  right: CanonicalMediaTimeV1,
): CanonicalMediaTimeV1 {
  return compareCanonicalMediaTimeV1(left, right) >= 0 ? left : right;
}

function earlierTime(
  left: CanonicalMediaTimeV1,
  right: CanonicalMediaTimeV1,
): CanonicalMediaTimeV1 {
  return compareCanonicalMediaTimeV1(left, right) <= 0 ? left : right;
}
