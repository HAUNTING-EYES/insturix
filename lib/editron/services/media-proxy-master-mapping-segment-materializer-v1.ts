import {
  compareCanonicalMediaTimeV1,
  mediaTimeFromPresentationEpochTicksV1,
  parseCanonicalMediaTimeV1,
  parsePresentationEpochV1,
  parseSourcePositionV1,
  type CanonicalMediaTimeV1,
  type PresentationEpochV1,
  type SourcePositionV1,
} from '../contracts/canonical-media-time-v1';

import {
  canonicalizeEditronJsonV1,
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaProxyMasterCorrespondenceV3DerivationReceiptV1,
  type MediaProxyMasterCorrespondenceV3DerivationReceiptV1,
} from './media-proxy-master-correspondence-v3-derivation-verifier-v1';
import type { MediaProxyMasterCorrespondenceProducerSourceV1 }
  from './media-proxy-master-correspondence-producer-v1';
import {
  readMediaSourcePtsCadenceEpochPresentationWindowV3,
  type MediaSourcePtsCadenceEpochPresentationWindowResultV3,
  type MediaSourcePtsCadenceEpochPresentationWindowV3,
} from './media-source-pts-cadence-epoch-window-reader-v3';
import type {
  MediaProxyMasterTimeMappingSegmentV1,
  MediaProxyMasterTimeMapReferenceV1,
} from './media-proxy-master-time-mapping-v1';

export const MEDIA_PROXY_MASTER_MAPPING_SEGMENT_MATERIALIZATION_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_MAPPING_SEGMENT_MATERIALIZATION_V1' as const;
export const MEDIA_PROXY_MASTER_MAPPING_SEGMENT_MATERIALIZATION_POLICY_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_MAPPING_SEGMENT_MATERIALIZATION_POLICY_V1' as const;
export const MEDIA_PROXY_MASTER_MAPPING_SEGMENT_MATERIALIZER_VERSION_V1 =
  'editron-media-proxy-master-mapping-segment-materializer-v1' as const;

const MAX_PAGE_FRAME_RECORDS = 100_000;
const MAX_PAGE_READS = 100_000;
const MAX_SEGMENTS = 10_000;
const MAX_TOTAL_FRAME_RECORDS = 40_000_000;
const MAX_TOTAL_SELECTED_BATCH_BYTES = 64 * 1024 * 1024 * 1024;
const ZERO_TIME = parseCanonicalMediaTimeV1({ ticks: '0', timescale: '1' });

export type MediaProxyMasterMappingSegmentMaterializationPolicyV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_MAPPING_SEGMENT_MATERIALIZATION_POLICY_KIND_V1;
  policyVersion: string;
  pageFrameRecords: number;
  maxPageReads: number;
  maxSegments: number;
  maxTotalFrameRecords: number;
  maxTotalSelectedBatchBytes: number;
  policySha256: string;
}>;

export type MediaProxyMasterMappingSegmentWindowPageReceiptV1 = Readonly<{
  sequence: number;
  firstFrameOrdinal: string;
  endExclusiveFrameOrdinal: string;
  frameCount: number;
  selectedBatchCount: number;
  selectedBatchBytes: number;
  presentationWindowEvidenceSha256: string;
}>;

export type MediaProxyMasterMappingSegmentMaterializationReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_MAPPING_SEGMENT_MATERIALIZATION_KIND_V1;
  disposition: 'MAPPING_SEGMENTS_MATERIALIZED';
  materializerVersion:
    typeof MEDIA_PROXY_MASTER_MAPPING_SEGMENT_MATERIALIZER_VERSION_V1;
  derivationSha256: string;
  basis: MediaProxyMasterCorrespondenceV3DerivationReceiptV1['basis'];
  indexReference: MediaProxyMasterCorrespondenceV3DerivationReceiptV1['indexReference'];
  materializationPolicy: MediaProxyMasterMappingSegmentMaterializationPolicyV1;
  segments: readonly MediaProxyMasterTimeMappingSegmentV1[];
  canonicalEndExclusiveTime: CanonicalMediaTimeV1;
  proxyPages: readonly MediaProxyMasterMappingSegmentWindowPageReceiptV1[];
  masterPages: readonly MediaProxyMasterMappingSegmentWindowPageReceiptV1[];
  totalPageReads: number;
  totalFrameRecords: number;
  totalSelectedBatchBytes: number;
  materializationSha256: string;
}>;

export type MediaProxyMasterMappingSegmentMaterializationUnverifiableReasonV1 =
  | 'REQUEST_INVALID'
  | 'RESOURCE_LIMIT_EXCEEDED'
  | 'WINDOW_EVIDENCE_REJECTED'
  | 'NON_CONTIGUOUS_PRESENTATION'
  | 'FRAME_INTERVAL_INVALID'
  | 'SHARED_PRESENTATION_MISSING'
  | 'TERMINAL_DURATION_MISMATCH'
  | 'UNREPRESENTABLE_EPOCH_BOUNDARY'
  | 'SEGMENT_LIMIT_EXCEEDED'
  | 'SEGMENT_INVALID';

export type MediaProxyMasterMappingSegmentMaterializationResultV1 = Readonly<
  | MediaProxyMasterMappingSegmentMaterializationReceiptV1
  | {
      disposition: 'UNVERIFIABLE';
      reason: MediaProxyMasterMappingSegmentMaterializationUnverifiableReasonV1;
      sourceRole: 'PROXY' | 'MASTER' | null;
      failedFrameOrdinal: string | null;
      diagnostic: string | null;
    }
  | {
      disposition: 'RETRYABLE';
      reason: 'WINDOW_READER_UNAVAILABLE';
      sourceRole: 'PROXY' | 'MASTER';
      failedFrameOrdinal: string;
      diagnostic: string | null;
    }
>;

type ReadWindowV3 = typeof readMediaSourcePtsCadenceEpochPresentationWindowV3;

export function createMediaProxyMasterMappingSegmentMaterializationPolicyV1(
  input: Readonly<{
    policyVersion: string;
    pageFrameRecords: number;
    maxPageReads: number;
    maxSegments: number;
    maxTotalFrameRecords: number;
    maxTotalSelectedBatchBytes: number;
  }>,
): MediaProxyMasterMappingSegmentMaterializationPolicyV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_MAPPING_SEGMENT_MATERIALIZATION_POLICY_KIND_V1,
    policyVersion: identifier(
      input.policyVersion,
      'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_POLICY_VERSION_INVALID',
    ),
    pageFrameRecords: positiveSafeInteger(
      input.pageFrameRecords,
      MAX_PAGE_FRAME_RECORDS,
      'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_POLICY_PAGE_SIZE_INVALID',
    ),
    maxPageReads: positiveSafeInteger(
      input.maxPageReads,
      MAX_PAGE_READS,
      'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_POLICY_PAGE_READS_INVALID',
    ),
    maxSegments: positiveSafeInteger(
      input.maxSegments,
      MAX_SEGMENTS,
      'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_POLICY_SEGMENTS_INVALID',
    ),
    maxTotalFrameRecords: positiveSafeInteger(
      input.maxTotalFrameRecords,
      MAX_TOTAL_FRAME_RECORDS,
      'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_POLICY_FRAMES_INVALID',
    ),
    maxTotalSelectedBatchBytes: positiveSafeInteger(
      input.maxTotalSelectedBatchBytes,
      MAX_TOTAL_SELECTED_BATCH_BYTES,
      'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_POLICY_BYTES_INVALID',
    ),
  };
  return frozen({
    ...material,
    policySha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertMediaProxyMasterMappingSegmentMaterializationPolicyV1(
  value: unknown,
): MediaProxyMasterMappingSegmentMaterializationPolicyV1 {
  const record = object(
    value,
    'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_POLICY_INVALID',
  );
  exactKeys(record, [
    'schemaVersion', 'kind', 'policyVersion', 'pageFrameRecords',
    'maxPageReads', 'maxSegments', 'maxTotalFrameRecords',
    'maxTotalSelectedBatchBytes', 'policySha256',
  ], 'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_POLICY_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind
      !== MEDIA_PROXY_MASTER_MAPPING_SEGMENT_MATERIALIZATION_POLICY_KIND_V1) {
    fail('MEDIA_PROXY_MASTER_MAPPING_SEGMENT_POLICY_IDENTITY_INVALID');
  }
  const rebuilt = createMediaProxyMasterMappingSegmentMaterializationPolicyV1({
    policyVersion: record.policyVersion as string,
    pageFrameRecords: record.pageFrameRecords as number,
    maxPageReads: record.maxPageReads as number,
    maxSegments: record.maxSegments as number,
    maxTotalFrameRecords: record.maxTotalFrameRecords as number,
    maxTotalSelectedBatchBytes: record.maxTotalSelectedBatchBytes as number,
  });
  if (sha256(
    record.policySha256,
    'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_POLICY_HASH_INVALID',
  ) !== rebuilt.policySha256) {
    fail('MEDIA_PROXY_MASTER_MAPPING_SEGMENT_POLICY_HASH_MISMATCH');
  }
  return rebuilt;
}

export async function materializeMediaProxyMasterMappingSegmentsV1(
  input: Readonly<{
    derivationReceipt: MediaProxyMasterCorrespondenceV3DerivationReceiptV1;
    proxy: MediaProxyMasterCorrespondenceProducerSourceV1;
    master: MediaProxyMasterCorrespondenceProducerSourceV1;
    materializationPolicy:
      MediaProxyMasterMappingSegmentMaterializationPolicyV1;
    readWindow?: ReadWindowV3;
  }>,
): Promise<MediaProxyMasterMappingSegmentMaterializationResultV1> {
  let derivation: MediaProxyMasterCorrespondenceV3DerivationReceiptV1;
  let policy: MediaProxyMasterMappingSegmentMaterializationPolicyV1;
  try {
    derivation = assertMediaProxyMasterCorrespondenceV3DerivationReceiptV1(
      input.derivationReceipt,
    );
    policy = assertMediaProxyMasterMappingSegmentMaterializationPolicyV1(
      input.materializationPolicy,
    );
    assertSource(input.proxy, policy, 'PROXY');
    assertSource(input.master, policy, 'MASTER');
    if (input.readWindow !== undefined && typeof input.readWindow !== 'function') {
      fail('MEDIA_PROXY_MASTER_MAPPING_SEGMENT_WINDOW_READER_INVALID');
    }
  } catch (error) {
    return unverifiable('REQUEST_INVALID', null, null, error);
  }

  const proxyFrames = BigInt(derivation.basis.proxyTimeMap.totalFrameCount);
  const masterFrames = BigInt(derivation.basis.masterTimeMap.totalFrameCount);
  const totalFrames = proxyFrames + masterFrames;
  const totalPages = divideRoundUp(proxyFrames, BigInt(policy.pageFrameRecords))
    + divideRoundUp(masterFrames, BigInt(policy.pageFrameRecords));
  if (totalFrames > BigInt(policy.maxTotalFrameRecords)
    || totalPages > BigInt(policy.maxPageReads)) {
    return unverifiable('RESOURCE_LIMIT_EXCEEDED', null, null, null);
  }

  const metrics: MutableMetricsV1 = {
    proxyPages: [],
    masterPages: [],
    totalSelectedBatchBytes: 0,
  };
  const readWindow = input.readWindow
    ?? readMediaSourcePtsCadenceEpochPresentationWindowV3;
  const proxyIterator = sourceFrames({
    role: 'PROXY',
    source: input.proxy,
    map: derivation.basis.proxyTimeMap,
    policy,
    readWindow,
    metrics,
  })[Symbol.asyncIterator]();
  const masterIterator = sourceFrames({
    role: 'MASTER',
    source: input.master,
    map: derivation.basis.masterTimeMap,
    policy,
    readWindow,
    metrics,
  })[Symbol.asyncIterator]();

  const segments: MediaProxyMasterTimeMappingSegmentV1[] = [];
  let proxy: IteratorResult<FrameDetailV1>;
  let master: IteratorResult<FrameDetailV1>;
  try {
    [proxy, master] = await Promise.all([
      proxyIterator.next(),
      masterIterator.next(),
    ]);
  } catch (error) {
    return classifyMaterializationError(error);
  }
  let active: ActiveSegmentV1 | null = null;
  let lastProxy: FrameDetailV1 | null = null;
  let lastMaster: FrameDetailV1 | null = null;
  let canonicalCursor = ZERO_TIME;

  try {
    while (!proxy.done || !master.done) {
      if (proxy.done || master.done) {
        throw new MaterializationUnverifiableV1(
          'TERMINAL_DURATION_MISMATCH',
          proxy.done ? 'PROXY' : 'MASTER',
          null,
          null,
        );
      }
      const start = laterTime(proxy.value.start, master.value.start);
      const end = earlierTime(proxy.value.end, master.value.end);
      if (compareCanonicalMediaTimeV1(start, end) >= 0) {
        throw new MaterializationUnverifiableV1(
          'SHARED_PRESENTATION_MISSING', null, null, null,
        );
      }
      if (compareCanonicalMediaTimeV1(start, canonicalCursor) !== 0) {
        throw new MaterializationUnverifiableV1(
          'NON_CONTIGUOUS_PRESENTATION', null, null, null,
        );
      }

      if (active === null) {
        assertSharedFrameBoundary(proxy.value, master.value, start);
        active = activeSegment(proxy.value, master.value, start);
      } else {
        const proxyEpochChanged = active.proxyEpoch.epochId
          !== proxy.value.epoch.epochId;
        const masterEpochChanged = active.masterEpoch.epochId
          !== master.value.epoch.epochId;
        if (!proxyEpochChanged
          && !sameEpoch(active.proxyEpoch, proxy.value.epoch)) {
          throw new MaterializationUnverifiableV1(
            'WINDOW_EVIDENCE_REJECTED',
            'PROXY',
            proxy.value.frameOrdinal,
            'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_EPOCH_IDENTITY_CHANGED',
          );
        }
        if (!masterEpochChanged
          && !sameEpoch(active.masterEpoch, master.value.epoch)) {
          throw new MaterializationUnverifiableV1(
            'WINDOW_EVIDENCE_REJECTED',
            'MASTER',
            master.value.frameOrdinal,
            'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_EPOCH_IDENTITY_CHANGED',
          );
        }
        if (proxyEpochChanged || masterEpochChanged) {
          if (lastProxy === null || lastMaster === null
            || compareCanonicalMediaTimeV1(proxy.value.start, start) !== 0
            || compareCanonicalMediaTimeV1(master.value.start, start) !== 0
            || compareCanonicalMediaTimeV1(lastProxy.end, start) !== 0
            || compareCanonicalMediaTimeV1(lastMaster.end, start) !== 0) {
            throw new MaterializationUnverifiableV1(
              'UNREPRESENTABLE_EPOCH_BOUNDARY',
              proxyEpochChanged ? 'PROXY' : 'MASTER',
              proxyEpochChanged
                ? proxy.value.frameOrdinal : master.value.frameOrdinal,
              null,
            );
          }
          pushSegment(
            segments,
            createSegment(
              segments.length,
              active,
              lastProxy,
              lastMaster,
              start,
            ),
            policy,
          );
          active = activeSegment(proxy.value, master.value, start);
        }
      }

      lastProxy = proxy.value;
      lastMaster = master.value;
      canonicalCursor = end;
      const proxyEnds = compareCanonicalMediaTimeV1(proxy.value.end, end) === 0;
      const masterEnds = compareCanonicalMediaTimeV1(master.value.end, end) === 0;
      if (!proxyEnds && !masterEnds) {
        throw new MaterializationUnverifiableV1(
          'FRAME_INTERVAL_INVALID', null, null, null,
        );
      }
      if (proxyEnds) proxy = await proxyIterator.next();
      if (masterEnds) master = await masterIterator.next();
    }
    if (active === null || lastProxy === null || lastMaster === null
      || compareCanonicalMediaTimeV1(lastProxy.end, canonicalCursor) !== 0
      || compareCanonicalMediaTimeV1(lastMaster.end, canonicalCursor) !== 0
      || compareCanonicalMediaTimeV1(
        canonicalCursor,
        derivation.canonicalEndExclusiveTime,
      ) !== 0) {
      throw new MaterializationUnverifiableV1(
        'TERMINAL_DURATION_MISMATCH', null, null, null,
      );
    }
    pushSegment(
      segments,
      createSegment(
        segments.length,
        active,
        lastProxy,
        lastMaster,
        canonicalCursor,
      ),
      policy,
    );
  } catch (error) {
    return classifyMaterializationError(error);
  }

  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_MAPPING_SEGMENT_MATERIALIZATION_KIND_V1,
    disposition: 'MAPPING_SEGMENTS_MATERIALIZED' as const,
    materializerVersion:
      MEDIA_PROXY_MASTER_MAPPING_SEGMENT_MATERIALIZER_VERSION_V1,
    derivationSha256: derivation.derivationSha256,
    basis: derivation.basis,
    indexReference: derivation.indexReference,
    materializationPolicy: policy,
    segments,
    canonicalEndExclusiveTime: derivation.canonicalEndExclusiveTime,
    proxyPages: metrics.proxyPages,
    masterPages: metrics.masterPages,
    totalPageReads: metrics.proxyPages.length + metrics.masterPages.length,
    totalFrameRecords: Number(totalFrames),
    totalSelectedBatchBytes: metrics.totalSelectedBatchBytes,
  };
  try {
    return assertMediaProxyMasterMappingSegmentMaterializationReceiptV1({
      ...material,
      materializationSha256: hashEditronCanonicalJsonV1(material),
    }, derivation);
  } catch (error) {
    return unverifiable('SEGMENT_INVALID', null, null, error);
  }
}

export function assertMediaProxyMasterMappingSegmentMaterializationReceiptV1(
  value: unknown,
  derivationValue: MediaProxyMasterCorrespondenceV3DerivationReceiptV1,
): MediaProxyMasterMappingSegmentMaterializationReceiptV1 {
  const derivation =
    assertMediaProxyMasterCorrespondenceV3DerivationReceiptV1(derivationValue);
  const record = object(
    value,
    'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_INVALID',
  );
  exactKeys(record, [
    'schemaVersion', 'kind', 'disposition', 'materializerVersion',
    'derivationSha256', 'basis', 'indexReference', 'materializationPolicy',
    'segments', 'canonicalEndExclusiveTime', 'proxyPages', 'masterPages',
    'totalPageReads', 'totalFrameRecords', 'totalSelectedBatchBytes',
    'materializationSha256',
  ], 'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_MAPPING_SEGMENT_MATERIALIZATION_KIND_V1
    || record.disposition !== 'MAPPING_SEGMENTS_MATERIALIZED'
    || record.materializerVersion
      !== MEDIA_PROXY_MASTER_MAPPING_SEGMENT_MATERIALIZER_VERSION_V1) {
    fail('MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_IDENTITY_INVALID');
  }
  const derivationSha256 = sha256(
    record.derivationSha256,
    'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_DERIVATION_INVALID',
  );
  if (derivationSha256 !== derivation.derivationSha256
    || canonicalizeEditronJsonV1(record.basis)
      !== canonicalizeEditronJsonV1(derivation.basis)
    || canonicalizeEditronJsonV1(record.indexReference)
      !== canonicalizeEditronJsonV1(derivation.indexReference)) {
    fail('MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_DERIVATION_MISMATCH');
  }
  const policy = assertMediaProxyMasterMappingSegmentMaterializationPolicyV1(
    record.materializationPolicy,
  );
  const proxyPages = normalizePages(
    record.proxyPages,
    derivation.basis.proxyTimeMap.totalFrameCount,
    policy,
    'PROXY',
  );
  const masterPages = normalizePages(
    record.masterPages,
    derivation.basis.masterTimeMap.totalFrameCount,
    policy,
    'MASTER',
  );
  const totalPageReads = positiveSafeInteger(
    record.totalPageReads,
    MAX_PAGE_READS,
    'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_PAGE_READS_INVALID',
  );
  const totalFrameRecords = positiveSafeInteger(
    record.totalFrameRecords,
    MAX_TOTAL_FRAME_RECORDS,
    'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_FRAMES_INVALID',
  );
  const totalSelectedBatchBytes = positiveSafeInteger(
    record.totalSelectedBatchBytes,
    MAX_TOTAL_SELECTED_BATCH_BYTES,
    'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_BYTES_INVALID',
  );
  const expectedFrames = BigInt(derivation.basis.proxyTimeMap.totalFrameCount)
    + BigInt(derivation.basis.masterTimeMap.totalFrameCount);
  const expectedBytes = [...proxyPages, ...masterPages].reduce(
    (total, page) => total + page.selectedBatchBytes,
    0,
  );
  if (totalPageReads !== proxyPages.length + masterPages.length
    || totalPageReads > policy.maxPageReads
    || BigInt(totalFrameRecords) !== expectedFrames
    || totalFrameRecords > policy.maxTotalFrameRecords
    || totalSelectedBatchBytes !== expectedBytes
    || totalSelectedBatchBytes > policy.maxTotalSelectedBatchBytes) {
    fail('MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_RESOURCE_MISMATCH');
  }
  const canonicalEndExclusiveTime = parseCanonicalMediaTimeV1(
    record.canonicalEndExclusiveTime,
  );
  if (compareCanonicalMediaTimeV1(
    canonicalEndExclusiveTime,
    derivation.canonicalEndExclusiveTime,
  ) !== 0) {
    fail('MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_DURATION_MISMATCH');
  }
  const segments = normalizeSegments(
    record.segments,
    derivation.basis.proxyTimeMap,
    derivation.basis.masterTimeMap,
    canonicalEndExclusiveTime,
    policy.maxSegments,
  );
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_MAPPING_SEGMENT_MATERIALIZATION_KIND_V1,
    disposition: 'MAPPING_SEGMENTS_MATERIALIZED' as const,
    materializerVersion:
      MEDIA_PROXY_MASTER_MAPPING_SEGMENT_MATERIALIZER_VERSION_V1,
    derivationSha256,
    basis: derivation.basis,
    indexReference: derivation.indexReference,
    materializationPolicy: policy,
    segments,
    canonicalEndExclusiveTime,
    proxyPages,
    masterPages,
    totalPageReads,
    totalFrameRecords,
    totalSelectedBatchBytes,
  };
  const materializationSha256 = sha256(
    record.materializationSha256,
    'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_HASH_INVALID',
  );
  if (materializationSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_HASH_MISMATCH');
  }
  return frozen({ ...material, materializationSha256 });
}

type MutableMetricsV1 = {
  proxyPages: MediaProxyMasterMappingSegmentWindowPageReceiptV1[];
  masterPages: MediaProxyMasterMappingSegmentWindowPageReceiptV1[];
  totalSelectedBatchBytes: number;
};

type FrameDetailV1 = Readonly<{
  sourceVersionSha256: string;
  frameOrdinal: string;
  epoch: PresentationEpochV1;
  presentationTimestampTicks: string;
  durationTicks: string;
  start: CanonicalMediaTimeV1;
  end: CanonicalMediaTimeV1;
}>;

type ActiveSegmentV1 = Readonly<{
  canonicalStartTime: CanonicalMediaTimeV1;
  proxyStart: FrameDetailV1;
  masterStart: FrameDetailV1;
  proxyEpoch: PresentationEpochV1;
  masterEpoch: PresentationEpochV1;
}>;

async function* sourceFrames(input: Readonly<{
  role: 'PROXY' | 'MASTER';
  source: MediaProxyMasterCorrespondenceProducerSourceV1;
  map: MediaProxyMasterTimeMapReferenceV1;
  policy: MediaProxyMasterMappingSegmentMaterializationPolicyV1;
  readWindow: ReadWindowV3;
  metrics: MutableMetricsV1;
}>): AsyncGenerator<FrameDetailV1> {
  const totalFrames = BigInt(input.map.totalFrameCount);
  let first = BigInt(0);
  let previous: FrameDetailV1 | null = null;
  const pages = input.role === 'PROXY'
    ? input.metrics.proxyPages : input.metrics.masterPages;
  while (first < totalFrames) {
    const end = minimumBigInt(
      first + BigInt(input.policy.pageFrameRecords),
      totalFrames,
    );
    let result: MediaSourcePtsCadenceEpochPresentationWindowResultV3;
    try {
      result = await input.readWindow({
        asset: input.source.asset,
        storedObjectReader: input.source.storedObjectReader,
        firstFrameOrdinal: first.toString(),
        endExclusiveFrameOrdinal: end.toString(),
        resourcePolicy: input.source.windowResourcePolicy,
      });
    } catch (error) {
      throw new MaterializationRetryableV1(
        input.role,
        first.toString(),
        diagnostic(error),
      );
    }
    if (result.disposition === 'UNVERIFIABLE') {
      if (result.reason === 'WINDOW_INDEX_READ_FAILED'
        || result.reason === 'WINDOW_BATCH_READ_FAILED') {
        throw new MaterializationRetryableV1(
          input.role,
          first.toString(),
          result.reason,
        );
      }
      throw new MaterializationUnverifiableV1(
        'WINDOW_EVIDENCE_REJECTED',
        input.role,
        first.toString(),
        result.reason,
      );
    }
    if (!windowMatchesRequest(
      result,
      input.map,
      first,
      end,
      input.source,
    )) {
      throw new MaterializationUnverifiableV1(
        'WINDOW_EVIDENCE_REJECTED', input.role, first.toString(), null,
      );
    }
    input.metrics.totalSelectedBatchBytes += result.selectedBatchBytes;
    if (pages.length + (input.role === 'PROXY'
      ? input.metrics.masterPages.length : input.metrics.proxyPages.length) + 1
        > input.policy.maxPageReads
      || input.metrics.totalSelectedBatchBytes
        > input.policy.maxTotalSelectedBatchBytes) {
      throw new MaterializationUnverifiableV1(
        'RESOURCE_LIMIT_EXCEEDED', input.role, first.toString(), null,
      );
    }
    pages.push(frozen({
      sequence: pages.length,
      firstFrameOrdinal: first.toString(),
      endExclusiveFrameOrdinal: end.toString(),
      frameCount: Number(end - first),
      selectedBatchCount: result.selectedBatchCount,
      selectedBatchBytes: result.selectedBatchBytes,
      presentationWindowEvidenceSha256:
        result.presentationWindowEvidenceSha256,
    }));

    const epochs = new Map<string, PresentationEpochV1>();
    for (const epochValue of result.epochs) {
      const epoch = parsePresentationEpochV1(epochValue);
      if (epochs.has(epoch.epochId)
        || epoch.streamId !== result.streamId
        || canonicalizeEditronJsonV1(epoch.secondsPerSourceTick)
          !== canonicalizeEditronJsonV1(result.sourceTimebase)) {
        throw new MaterializationUnverifiableV1(
          'WINDOW_EVIDENCE_REJECTED', input.role, first.toString(), null,
        );
      }
      epochs.set(epoch.epochId, epoch);
    }
    for (let offset = 0; offset < result.frames.length; offset += 1) {
      const frame = result.frames[offset]!;
      const expectedOrdinal = first + BigInt(offset);
      const epoch = epochs.get(frame.epochId);
      const durationTicks = positiveIntegerText(
        frame.durationTicks,
        'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_FRAME_DURATION_INVALID',
      );
      if (frame.sourceFrameOrdinal !== expectedOrdinal.toString() || !epoch) {
        throw new MaterializationUnverifiableV1(
          'FRAME_INTERVAL_INVALID', input.role, frame.sourceFrameOrdinal, null,
        );
      }
      let start: CanonicalMediaTimeV1;
      let frameEnd: CanonicalMediaTimeV1;
      try {
        start = mediaTimeFromPresentationEpochTicksV1(
          epoch,
          frame.presentationTimestampTicks,
        );
        frameEnd = mediaTimeFromPresentationEpochTicksV1(
          epoch,
          String(
            BigInt(frame.presentationTimestampTicks) + BigInt(durationTicks),
          ),
        );
      } catch (error) {
        throw new MaterializationUnverifiableV1(
          'FRAME_INTERVAL_INVALID',
          input.role,
          frame.sourceFrameOrdinal,
          diagnostic(error),
        );
      }
      if (compareCanonicalMediaTimeV1(start, frameEnd) >= 0
        || (previous === null
          ? compareCanonicalMediaTimeV1(start, ZERO_TIME) !== 0
          : compareCanonicalMediaTimeV1(previous.end, start) !== 0)) {
        throw new MaterializationUnverifiableV1(
          'NON_CONTIGUOUS_PRESENTATION',
          input.role,
          frame.sourceFrameOrdinal,
          null,
        );
      }
      const detail = frozen({
        sourceVersionSha256: input.map.sourceVersionSha256,
        frameOrdinal: frame.sourceFrameOrdinal,
        epoch,
        presentationTimestampTicks: frame.presentationTimestampTicks,
        durationTicks,
        start,
        end: frameEnd,
      });
      previous = detail;
      yield detail;
    }
    first = end;
  }
}

function createSegment(
  sequence: number,
  active: ActiveSegmentV1,
  proxyEnd: FrameDetailV1,
  masterEnd: FrameDetailV1,
  canonicalEndExclusiveTime: CanonicalMediaTimeV1,
): MediaProxyMasterTimeMappingSegmentV1 {
  if (!sameEpoch(active.proxyEpoch, proxyEnd.epoch)
    || !sameEpoch(active.masterEpoch, masterEnd.epoch)) {
    throw new MaterializationUnverifiableV1(
      'SEGMENT_INVALID', null, null,
      'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_CROSSES_EPOCH',
    );
  }
  const segment: MediaProxyMasterTimeMappingSegmentV1 = {
    sequence,
    canonicalStartTime: active.canonicalStartTime,
    canonicalEndExclusiveTime,
    proxyStart: sourcePosition(
      active.proxyStart,
      active.proxyStart.presentationTimestampTicks,
      active.proxyStart.epoch,
    ),
    proxyEndExclusive: sourcePosition(
      proxyEnd,
      endPresentationTimestampTicks(proxyEnd),
      proxyEnd.epoch,
    ),
    proxyFirstFrameOrdinal: active.proxyStart.frameOrdinal,
    proxyEndExclusiveFrameOrdinal:
      incrementIntegerText(proxyEnd.frameOrdinal),
    masterStart: sourcePosition(
      active.masterStart,
      active.masterStart.presentationTimestampTicks,
      active.masterStart.epoch,
    ),
    masterEndExclusive: sourcePosition(
      masterEnd,
      endPresentationTimestampTicks(masterEnd),
      masterEnd.epoch,
    ),
    masterFirstFrameOrdinal: active.masterStart.frameOrdinal,
    masterEndExclusiveFrameOrdinal:
      incrementIntegerText(masterEnd.frameOrdinal),
  };
  assertSegmentDuration(segment, 'PROXY');
  assertSegmentDuration(segment, 'MASTER');
  return frozen(segment);
}

function activeSegment(
  proxy: FrameDetailV1,
  master: FrameDetailV1,
  canonicalStartTime: CanonicalMediaTimeV1,
): ActiveSegmentV1 {
  return frozen({
    canonicalStartTime,
    proxyStart: proxy,
    masterStart: master,
    proxyEpoch: proxy.epoch,
    masterEpoch: master.epoch,
  });
}

function assertSharedFrameBoundary(
  proxy: FrameDetailV1,
  master: FrameDetailV1,
  boundary: CanonicalMediaTimeV1,
): void {
  if (compareCanonicalMediaTimeV1(proxy.start, boundary) !== 0
    || compareCanonicalMediaTimeV1(master.start, boundary) !== 0) {
    throw new MaterializationUnverifiableV1(
      'UNREPRESENTABLE_EPOCH_BOUNDARY', null, null, null,
    );
  }
}

function pushSegment(
  segments: MediaProxyMasterTimeMappingSegmentV1[],
  segment: MediaProxyMasterTimeMappingSegmentV1,
  policy: MediaProxyMasterMappingSegmentMaterializationPolicyV1,
): void {
  if (segments.length >= policy.maxSegments) {
    throw new MaterializationUnverifiableV1(
      'SEGMENT_LIMIT_EXCEEDED', null, null, null,
    );
  }
  segments.push(segment);
}

function sourcePosition(
  frame: FrameDetailV1,
  presentationTimestampTicks: string,
  epoch: PresentationEpochV1,
): SourcePositionV1 {
  return parseSourcePositionV1({
    sourceVersionSha256: frame.sourceVersionSha256,
    streamId: epoch.streamId,
    epochId: epoch.epochId,
    presentationTimestampTicks,
    secondsPerSourceTick: epoch.secondsPerSourceTick,
  });
}

function normalizeSegments(
  value: unknown,
  proxyMap: MediaProxyMasterTimeMapReferenceV1,
  masterMap: MediaProxyMasterTimeMapReferenceV1,
  canonicalEndExclusiveTime: CanonicalMediaTimeV1,
  maxSegments: number,
): readonly MediaProxyMasterTimeMappingSegmentV1[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxSegments) {
    fail('MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_SEGMENTS_INVALID');
  }
  let canonicalCursor = ZERO_TIME;
  let proxyOrdinalCursor = BigInt(0);
  let masterOrdinalCursor = BigInt(0);
  const segments = value.map((entry, sequence) => {
    const record = object(
      entry,
      'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_SEGMENT_INVALID',
    );
    exactKeys(record, [
      'sequence', 'canonicalStartTime', 'canonicalEndExclusiveTime',
      'proxyStart', 'proxyEndExclusive', 'proxyFirstFrameOrdinal',
      'proxyEndExclusiveFrameOrdinal', 'masterStart', 'masterEndExclusive',
      'masterFirstFrameOrdinal', 'masterEndExclusiveFrameOrdinal',
    ], 'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_SEGMENT_FIELDS_INVALID');
    if (record.sequence !== sequence) {
      fail('MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_SEQUENCE_INVALID');
    }
    const segment: MediaProxyMasterTimeMappingSegmentV1 = {
      sequence,
      canonicalStartTime: parseCanonicalMediaTimeV1(record.canonicalStartTime),
      canonicalEndExclusiveTime:
        parseCanonicalMediaTimeV1(record.canonicalEndExclusiveTime),
      proxyStart: parseSourcePositionV1(record.proxyStart),
      proxyEndExclusive: parseSourcePositionV1(record.proxyEndExclusive),
      proxyFirstFrameOrdinal: nonNegativeIntegerText(
        record.proxyFirstFrameOrdinal,
        'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_PROXY_START_INVALID',
      ),
      proxyEndExclusiveFrameOrdinal: positiveIntegerText(
        record.proxyEndExclusiveFrameOrdinal,
        'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_PROXY_END_INVALID',
      ),
      masterStart: parseSourcePositionV1(record.masterStart),
      masterEndExclusive: parseSourcePositionV1(record.masterEndExclusive),
      masterFirstFrameOrdinal: nonNegativeIntegerText(
        record.masterFirstFrameOrdinal,
        'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_MASTER_START_INVALID',
      ),
      masterEndExclusiveFrameOrdinal: positiveIntegerText(
        record.masterEndExclusiveFrameOrdinal,
        'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_MASTER_END_INVALID',
      ),
    };
    if (compareCanonicalMediaTimeV1(segment.canonicalStartTime, canonicalCursor) !== 0
      || compareCanonicalMediaTimeV1(
        segment.canonicalStartTime,
        segment.canonicalEndExclusiveTime,
      ) >= 0
      || BigInt(segment.proxyFirstFrameOrdinal) !== proxyOrdinalCursor
      || BigInt(segment.masterFirstFrameOrdinal) !== masterOrdinalCursor) {
      fail('MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_COVERAGE_GAP');
    }
    assertPositionScope(segment.proxyStart, proxyMap, 'PROXY');
    assertPositionScope(segment.proxyEndExclusive, proxyMap, 'PROXY');
    assertPositionScope(segment.masterStart, masterMap, 'MASTER');
    assertPositionScope(segment.masterEndExclusive, masterMap, 'MASTER');
    assertSegmentDuration(segment, 'PROXY');
    assertSegmentDuration(segment, 'MASTER');
    canonicalCursor = segment.canonicalEndExclusiveTime;
    proxyOrdinalCursor = BigInt(segment.proxyEndExclusiveFrameOrdinal);
    masterOrdinalCursor = BigInt(segment.masterEndExclusiveFrameOrdinal);
    return segment;
  });
  if (compareCanonicalMediaTimeV1(canonicalCursor, canonicalEndExclusiveTime) !== 0
    || proxyOrdinalCursor !== BigInt(proxyMap.totalFrameCount)
    || masterOrdinalCursor !== BigInt(masterMap.totalFrameCount)) {
    fail('MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_TERMINAL_COVERAGE_MISMATCH');
  }
  return frozen(segments);
}

function assertPositionScope(
  position: SourcePositionV1,
  map: MediaProxyMasterTimeMapReferenceV1,
  role: 'PROXY' | 'MASTER',
): void {
  if (position.sourceVersionSha256 !== map.sourceVersionSha256
    || position.streamId !== map.streamId) {
    fail(`MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_${role}_SCOPE_MISMATCH`);
  }
}

function assertSegmentDuration(
  segment: MediaProxyMasterTimeMappingSegmentV1,
  role: 'PROXY' | 'MASTER',
): void {
  const start = role === 'PROXY' ? segment.proxyStart : segment.masterStart;
  const end = role === 'PROXY'
    ? segment.proxyEndExclusive : segment.masterEndExclusive;
  const firstOrdinal = BigInt(role === 'PROXY'
    ? segment.proxyFirstFrameOrdinal : segment.masterFirstFrameOrdinal);
  const endOrdinal = BigInt(role === 'PROXY'
    ? segment.proxyEndExclusiveFrameOrdinal
    : segment.masterEndExclusiveFrameOrdinal);
  if (start.sourceVersionSha256 !== end.sourceVersionSha256
    || start.streamId !== end.streamId
    || start.epochId !== end.epochId
    || canonicalizeEditronJsonV1(start.secondsPerSourceTick)
      !== canonicalizeEditronJsonV1(end.secondsPerSourceTick)
    || BigInt(start.presentationTimestampTicks)
      >= BigInt(end.presentationTimestampTicks)
    || firstOrdinal >= endOrdinal) {
    fail(`MEDIA_PROXY_MASTER_MAPPING_SEGMENT_${role}_SPAN_INVALID`);
  }
  const sourceNumerator = (
    BigInt(end.presentationTimestampTicks)
      - BigInt(start.presentationTimestampTicks)
  ) * BigInt(start.secondsPerSourceTick.numerator);
  const sourceDenominator = BigInt(start.secondsPerSourceTick.denominator);
  const canonicalNumerator =
    BigInt(segment.canonicalEndExclusiveTime.ticks)
      * BigInt(segment.canonicalStartTime.timescale)
    - BigInt(segment.canonicalStartTime.ticks)
      * BigInt(segment.canonicalEndExclusiveTime.timescale);
  const canonicalDenominator =
    BigInt(segment.canonicalStartTime.timescale)
      * BigInt(segment.canonicalEndExclusiveTime.timescale);
  if (sourceNumerator * canonicalDenominator
    !== canonicalNumerator * sourceDenominator) {
    fail(`MEDIA_PROXY_MASTER_MAPPING_SEGMENT_${role}_DURATION_MISMATCH`);
  }
}

function normalizePages(
  value: unknown,
  totalFrameCount: string,
  policy: MediaProxyMasterMappingSegmentMaterializationPolicyV1,
  role: 'PROXY' | 'MASTER',
): readonly MediaProxyMasterMappingSegmentWindowPageReceiptV1[] {
  if (!Array.isArray(value) || value.length === 0
    || value.length > policy.maxPageReads) {
    fail(`MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_${role}_PAGES_INVALID`);
  }
  let cursor = BigInt(0);
  const pages = value.map((entry, sequence) => {
    const record = object(
      entry,
      `MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_${role}_PAGE_INVALID`,
    );
    exactKeys(record, [
      'sequence', 'firstFrameOrdinal', 'endExclusiveFrameOrdinal',
      'frameCount', 'selectedBatchCount', 'selectedBatchBytes',
      'presentationWindowEvidenceSha256',
    ], `MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_${role}_PAGE_FIELDS_INVALID`);
    const firstFrameOrdinal = nonNegativeIntegerText(
      record.firstFrameOrdinal,
      `MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_${role}_PAGE_START_INVALID`,
    );
    const endExclusiveFrameOrdinal = positiveIntegerText(
      record.endExclusiveFrameOrdinal,
      `MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_${role}_PAGE_END_INVALID`,
    );
    const frameCount = positiveSafeInteger(
      record.frameCount,
      policy.pageFrameRecords,
      `MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_${role}_PAGE_FRAMES_INVALID`,
    );
    if (record.sequence !== sequence
      || BigInt(firstFrameOrdinal) !== cursor
      || BigInt(endExclusiveFrameOrdinal) - BigInt(firstFrameOrdinal)
        !== BigInt(frameCount)) {
      fail(`MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_${role}_PAGE_COVERAGE_INVALID`);
    }
    cursor = BigInt(endExclusiveFrameOrdinal);
    return {
      sequence,
      firstFrameOrdinal,
      endExclusiveFrameOrdinal,
      frameCount,
      selectedBatchCount: positiveSafeInteger(
        record.selectedBatchCount,
        MAX_PAGE_READS,
        `MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_${role}_PAGE_BATCHES_INVALID`,
      ),
      selectedBatchBytes: positiveSafeInteger(
        record.selectedBatchBytes,
        MAX_TOTAL_SELECTED_BATCH_BYTES,
        `MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_${role}_PAGE_BYTES_INVALID`,
      ),
      presentationWindowEvidenceSha256: sha256(
        record.presentationWindowEvidenceSha256,
        `MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_${role}_PAGE_EVIDENCE_INVALID`,
      ),
    };
  });
  if (cursor !== BigInt(totalFrameCount)) {
    fail(`MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_${role}_PAGE_TERMINAL_INVALID`);
  }
  return frozen(pages);
}

function windowMatchesRequest(
  window: MediaSourcePtsCadenceEpochPresentationWindowV3,
  map: MediaProxyMasterTimeMapReferenceV1,
  first: bigint,
  end: bigint,
  source: MediaProxyMasterCorrespondenceProducerSourceV1,
): boolean {
  const { presentationWindowEvidenceSha256, ...material } = window;
  return presentationWindowEvidenceSha256
      === hashEditronCanonicalJsonV1(material)
    && window.evidenceStatus === 'HASH_VERIFIED_SOURCE_BOUND_EPOCH_V3_WINDOW'
    && window.sourceVersionSha256 === map.sourceVersionSha256
    && window.storageVersionSha256 === map.storageVersionSha256
    && window.sourceBindingSha256 === map.sourceBindingSha256
    && window.technicalObservationSha256 === map.technicalObservationSha256
    && window.sourcePtsCadenceMapStateSha256V3
      === map.sourcePtsCadenceMapStateSha256V3
    && window.mapBindingSha256 === map.mapBindingSha256
    && window.terminalReceiptSha256 === map.terminalReceiptSha256
    && window.verificationSha256 === map.verificationSha256
    && window.epochIndexContentSha256 === map.epochIndexContentSha256
    && window.streamId === map.streamId
    && window.videoStreamIndex === map.videoStreamIndex
    && window.firstFrameOrdinal === first.toString()
    && window.endExclusiveFrameOrdinal === end.toString()
    && window.frames.length === Number(end - first)
    && canonicalizeEditronJsonV1(window.resourcePolicy)
      === canonicalizeEditronJsonV1(source.windowResourcePolicy);
}

function assertSource(
  source: MediaProxyMasterCorrespondenceProducerSourceV1,
  policy: MediaProxyMasterMappingSegmentMaterializationPolicyV1,
  role: 'PROXY' | 'MASTER',
): void {
  if (!source?.storedObjectReader
    || typeof source.storedObjectReader.read !== 'function'
    || !source.windowResourcePolicy
    || policy.pageFrameRecords > source.windowResourcePolicy.maxFrameRecords) {
    fail(`MEDIA_PROXY_MASTER_MAPPING_SEGMENT_${role}_SOURCE_INVALID`);
  }
}

function sameEpoch(left: PresentationEpochV1, right: PresentationEpochV1): boolean {
  return canonicalizeEditronJsonV1(left) === canonicalizeEditronJsonV1(right);
}

function endPresentationTimestampTicks(frame: FrameDetailV1): string {
  return String(
    BigInt(frame.presentationTimestampTicks) + BigInt(frame.durationTicks),
  );
}

function divideRoundUp(value: bigint, divisor: bigint): bigint {
  return (value + divisor - BigInt(1)) / divisor;
}

function laterTime(left: CanonicalMediaTimeV1, right: CanonicalMediaTimeV1) {
  return compareCanonicalMediaTimeV1(left, right) >= 0 ? left : right;
}

function earlierTime(left: CanonicalMediaTimeV1, right: CanonicalMediaTimeV1) {
  return compareCanonicalMediaTimeV1(left, right) <= 0 ? left : right;
}

function minimumBigInt(left: bigint, right: bigint): bigint {
  return left <= right ? left : right;
}

function incrementIntegerText(value: string): string {
  return (BigInt(value) + BigInt(1)).toString();
}

class MaterializationUnverifiableV1 extends Error {
  constructor(
    readonly reason:
      MediaProxyMasterMappingSegmentMaterializationUnverifiableReasonV1,
    readonly sourceRole: 'PROXY' | 'MASTER' | null,
    readonly failedFrameOrdinal: string | null,
    readonly diagnostic: string | null,
  ) {
    super(reason);
  }
}

class MaterializationRetryableV1 extends Error {
  constructor(
    readonly sourceRole: 'PROXY' | 'MASTER',
    readonly failedFrameOrdinal: string,
    readonly diagnostic: string | null,
  ) {
    super('WINDOW_READER_UNAVAILABLE');
  }
}

function classifyMaterializationError(
  error: unknown,
): MediaProxyMasterMappingSegmentMaterializationResultV1 {
  if (error instanceof MaterializationRetryableV1) {
    return frozen({
      disposition: 'RETRYABLE' as const,
      reason: 'WINDOW_READER_UNAVAILABLE' as const,
      sourceRole: error.sourceRole,
      failedFrameOrdinal: error.failedFrameOrdinal,
      diagnostic: error.diagnostic,
    });
  }
  if (error instanceof MaterializationUnverifiableV1) {
    return unverifiable(
      error.reason,
      error.sourceRole,
      error.failedFrameOrdinal,
      error.diagnostic,
    );
  }
  return unverifiable('SEGMENT_INVALID', null, null, error);
}

function unverifiable(
  reason: MediaProxyMasterMappingSegmentMaterializationUnverifiableReasonV1,
  sourceRole: 'PROXY' | 'MASTER' | null,
  failedFrameOrdinal: string | null,
  diagnosticValue: unknown,
): MediaProxyMasterMappingSegmentMaterializationResultV1 {
  return frozen({
    disposition: 'UNVERIFIABLE' as const,
    reason,
    sourceRole,
    failedFrameOrdinal,
    diagnostic: typeof diagnosticValue === 'string'
      ? safeDiagnostic(diagnosticValue)
      : diagnostic(diagnosticValue),
  });
}

function diagnostic(value: unknown): string | null {
  return value instanceof Error ? safeDiagnostic(value.message) : null;
}

function safeDiagnostic(value: string): string | null {
  return /^[A-Z0-9_:.-]{1,240}$/.test(value) ? value : null;
}

function object(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail(error);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  error: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) fail(error);
}

function identifier(value: unknown, error: string): string {
  if (typeof value !== 'string' || value.trim() !== value
    || value.length === 0 || value.length > 240) fail(error);
  return value;
}

function sha256(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(error);
  return value;
}

function nonNegativeIntegerText(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,127})$/.test(value)) {
    fail(error);
  }
  return value;
}

function positiveIntegerText(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,127}$/.test(value)) {
    fail(error);
  }
  return value;
}

function positiveSafeInteger(value: unknown, max: number, error: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0
    || (value as number) > max) fail(error);
  return value as number;
}

function frozen<const T>(value: T): T {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value));
}

function fail(message: string): never {
  throw new Error(message);
}
