import { createHash } from 'node:crypto';

import {
  compareCanonicalMediaTimeV1,
  mediaTimeFromPresentationEpochTicksV1,
  parseCanonicalMediaTimeV1,
  type CanonicalMediaTimeV1,
} from '../contracts/canonical-media-time-v1';
import {
  canonicalizeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaProxyMasterCorrespondenceArtifactVerificationPolicyV1,
  assertMediaProxyMasterCorrespondenceArtifactVerificationReceiptV1,
  type MediaProxyMasterCorrespondenceArtifactVerificationPolicyV1,
  type MediaProxyMasterCorrespondenceArtifactVerificationReceiptV1,
} from './media-proxy-master-correspondence-artifact-verifier-v1';
import {
  assertMediaProxyMasterCorrespondenceBasisV1,
  assertMediaProxyMasterCorrespondenceBatchResourcePolicyV1,
  createMediaProxyMasterCorrespondenceBatchSidecarV1,
  serializeMediaProxyMasterCorrespondenceBatchV1,
  type MediaProxyMasterCorrespondenceBasisV1,
  type MediaProxyMasterCorrespondenceBatchResourcePolicyV1,
  type MediaProxyMasterCorrespondenceBatchSerializationV1,
  type MediaProxyMasterCorrespondenceBatchSidecarV1,
  type MediaProxyMasterFrameCorrespondenceSpanV1,
} from './media-proxy-master-correspondence-batch-v1';
import {
  assertMediaProxyMasterCorrespondenceIndexResourcePolicyV1,
  assertMediaProxyMasterCorrespondenceIndexV1,
  createMediaProxyMasterCorrespondenceIndexReferenceV1,
  type MediaProxyMasterCorrespondenceIndexResourcePolicyV1,
  type MediaProxyMasterCorrespondenceIndexSerializationV1,
} from './media-proxy-master-correspondence-index-v1';
import {
  readMediaSourcePtsCadenceEpochPresentationWindowV3,
  type MediaSourcePtsCadenceEpochPresentationWindowResultV3,
  type MediaSourcePtsCadenceEpochPresentationWindowV3,
  type MediaSourcePtsCadenceEpochWindowResourcePolicyV3,
} from './media-source-pts-cadence-epoch-window-reader-v3';
import type {
  MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3,
} from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import type {
  MediaSourcePtsCadenceMapAssetStateInputV3,
} from './media-source-pts-cadence-map-asset-owner-v3';
import {
  MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_KIND_V1,
  type MediaProxyMasterCorrespondenceIndexReferenceV1,
  type MediaProxyMasterTimeMapReferenceV1,
} from './media-proxy-master-time-mapping-v1';

const ZERO_TIME = parseCanonicalMediaTimeV1({ ticks: '0', timescale: '1' });
const MAX_PAGE_FRAME_RECORDS = 100_000;

export type MediaProxyMasterCorrespondenceProducerPolicyV1 = Readonly<{
  policyVersion: string;
  pageFrameRecords: number;
  batch: MediaProxyMasterCorrespondenceBatchResourcePolicyV1;
  index: MediaProxyMasterCorrespondenceIndexResourcePolicyV1;
  verification: MediaProxyMasterCorrespondenceArtifactVerificationPolicyV1;
}>;

export type MediaProxyMasterCorrespondenceProducerSourceV1 = Readonly<{
  asset: MediaSourcePtsCadenceMapAssetStateInputV3;
  storedObjectReader: MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3;
  windowResourcePolicy: MediaSourcePtsCadenceEpochWindowResourcePolicyV3;
}>;

export type MediaProxyMasterCorrespondenceIncrementalPublisherV1 = Readonly<{
  publishBatch(input: Readonly<{
    basis: MediaProxyMasterCorrespondenceBasisV1;
    serialization: MediaProxyMasterCorrespondenceBatchSerializationV1;
    sidecar: MediaProxyMasterCorrespondenceBatchSidecarV1;
  }>): Promise<void>;
  publishIndexAndVerify(input: Readonly<{
    basis: MediaProxyMasterCorrespondenceBasisV1;
    indexSerialization: MediaProxyMasterCorrespondenceIndexSerializationV1;
    indexReference: MediaProxyMasterCorrespondenceIndexReferenceV1;
    verificationPolicy: MediaProxyMasterCorrespondenceArtifactVerificationPolicyV1;
  }>): Promise<MediaProxyMasterCorrespondenceArtifactVerificationReceiptV1>;
}>;

export type MediaProxyMasterCorrespondenceProductionResultV1 = Readonly<
  | {
      disposition: 'PUBLISHED';
      indexReference: MediaProxyMasterCorrespondenceIndexReferenceV1;
      artifactVerificationSha256: string;
      batchCount: number;
      totalSpanCount: string;
      canonicalEndExclusiveTime: CanonicalMediaTimeV1;
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason:
        | 'REQUEST_INVALID'
        | 'RESOURCE_LIMIT_EXCEEDED'
        | 'WINDOW_EVIDENCE_REJECTED'
        | 'NON_CONTIGUOUS_PRESENTATION'
        | 'FRAME_INTERVAL_INVALID'
        | 'SHARED_PRESENTATION_MISSING'
        | 'TERMINAL_DURATION_MISMATCH'
        | 'ARTIFACT_SERIALIZATION_REJECTED'
        | 'ARTIFACT_VERIFICATION_REJECTED';
      sourceRole: 'PROXY' | 'MASTER' | null;
      failedFrameOrdinal: string | null;
      diagnostic: string | null;
    }
  | {
      disposition: 'RETRYABLE';
      reason: 'WINDOW_READER_UNAVAILABLE' | 'ARTIFACT_STORE_UNAVAILABLE';
      sourceRole: 'PROXY' | 'MASTER' | null;
      failedFrameOrdinal: string | null;
      lastPublishedBatchSequence: number | null;
      diagnostic: string | null;
    }
>;

type ReadWindowV3 = typeof readMediaSourcePtsCadenceEpochPresentationWindowV3;

/**
 * Streams the exact union of proxy and master presentation boundaries.
 * Immutable batches may be orphaned after a later safe stop, but the index is
 * published only after complete two-sided coverage and then reread/verified.
 */
export async function produceMediaProxyMasterCorrespondenceV1(input: Readonly<{
  basis: MediaProxyMasterCorrespondenceBasisV1;
  proxy: MediaProxyMasterCorrespondenceProducerSourceV1;
  master: MediaProxyMasterCorrespondenceProducerSourceV1;
  policy: MediaProxyMasterCorrespondenceProducerPolicyV1;
  publisher: MediaProxyMasterCorrespondenceIncrementalPublisherV1;
  readWindow?: ReadWindowV3;
}>): Promise<MediaProxyMasterCorrespondenceProductionResultV1> {
  let prepared: PreparedRequestV1;
  try {
    prepared = prepareRequest(input);
  } catch (error) {
    return unverifiable('REQUEST_INVALID', null, null, diagnostic(error));
  }
  if (!resourceAdmissionAllows(prepared)) {
    return unverifiable('RESOURCE_LIMIT_EXCEEDED', null, null, null);
  }

  const proxyIterator = presentationIntervals({
    role: 'PROXY',
    source: input.proxy,
    map: prepared.basis.proxyTimeMap,
    pageFrameRecords: prepared.pageFrameRecords,
    readWindow: input.readWindow ?? readMediaSourcePtsCadenceEpochPresentationWindowV3,
  })[Symbol.asyncIterator]();
  const masterIterator = presentationIntervals({
    role: 'MASTER',
    source: input.master,
    map: prepared.basis.masterTimeMap,
    pageFrameRecords: prepared.pageFrameRecords,
    readWindow: input.readWindow ?? readMediaSourcePtsCadenceEpochPresentationWindowV3,
  })[Symbol.asyncIterator]();

  const sidecars: MediaProxyMasterCorrespondenceBatchSidecarV1[] = [];
  let pending: MediaProxyMasterFrameCorrespondenceSpanV1[] = [];
  let spanOrdinal = BigInt(0);
  let batchSequence = 0;
  let lastPublishedBatchSequence: number | null = null;
  let canonicalEndExclusiveTime: CanonicalMediaTimeV1 | null = null;

  const flush = async (): Promise<void> => {
    if (pending.length === 0) return;
    if (batchSequence >= prepared.indexPolicy.maxBatchEntries
      || batchSequence >= prepared.verificationPolicy.maxBatchReads) {
      throw new ProducerUnverifiableV1(
        'RESOURCE_LIMIT_EXCEEDED', null, null, null,
      );
    }
    let serialization: MediaProxyMasterCorrespondenceBatchSerializationV1;
    let sidecar: MediaProxyMasterCorrespondenceBatchSidecarV1;
    try {
      serialization = serializeMediaProxyMasterCorrespondenceBatchV1({
        basis: prepared.basis,
        resourcePolicy: prepared.batchPolicy,
        batchSequence,
        firstSpanOrdinal: pending[0]!.spanOrdinal,
        spans: pending,
      });
      sidecar = createMediaProxyMasterCorrespondenceBatchSidecarV1({
        serialization,
      });
    } catch (error) {
      const code = diagnostic(error);
      throw new ProducerUnverifiableV1(
        code === 'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_BYTE_LIMIT_EXCEEDED'
          ? 'RESOURCE_LIMIT_EXCEEDED'
          : 'ARTIFACT_SERIALIZATION_REJECTED',
        null,
        pending[0]!.proxyFrameOrdinal,
        code,
      );
    }
    try {
      await input.publisher.publishBatch({
        basis: prepared.basis,
        serialization,
        sidecar,
      });
    } catch (error) {
      throw new ProducerRetryableV1(
        'ARTIFACT_STORE_UNAVAILABLE', null, null,
        lastPublishedBatchSequence, diagnostic(error),
      );
    }
    sidecars.push(sidecar);
    lastPublishedBatchSequence = batchSequence;
    batchSequence += 1;
    pending = [];
  };

  try {
    let proxy = await proxyIterator.next();
    let master = await masterIterator.next();
    while (!proxy.done || !master.done) {
      if (proxy.done || master.done) {
        throw new ProducerUnverifiableV1(
          'TERMINAL_DURATION_MISMATCH', proxy.done ? 'PROXY' : 'MASTER',
          null, null,
        );
      }
      const start = laterTime(proxy.value.start, master.value.start);
      const end = earlierTime(proxy.value.end, master.value.end);
      if (compareCanonicalMediaTimeV1(start, end) >= 0) {
        throw new ProducerUnverifiableV1(
          'SHARED_PRESENTATION_MISSING', null, null, null,
        );
      }
      pending.push(Object.freeze({
        spanOrdinal: spanOrdinal.toString(),
        canonicalStartTime: start,
        canonicalEndExclusiveTime: end,
        proxyFrameOrdinal: proxy.value.frameOrdinal,
        masterFrameOrdinal: master.value.frameOrdinal,
      }));
      spanOrdinal += BigInt(1);
      canonicalEndExclusiveTime = end;
      if (pending.length === prepared.batchPolicy.maxSpanRecords) await flush();

      const proxyEnds = compareCanonicalMediaTimeV1(proxy.value.end, end) === 0;
      const masterEnds = compareCanonicalMediaTimeV1(master.value.end, end) === 0;
      if (!proxyEnds && !masterEnds) {
        throw new ProducerUnverifiableV1(
          'FRAME_INTERVAL_INVALID', null, null, null,
        );
      }
      if (proxyEnds) proxy = await proxyIterator.next();
      if (masterEnds) master = await masterIterator.next();
    }
    if (spanOrdinal === BigInt(0) || canonicalEndExclusiveTime === null) {
      throw new ProducerUnverifiableV1(
        'SHARED_PRESENTATION_MISSING', null, null, null,
      );
    }
    await flush();
  } catch (error) {
    if (error instanceof ProducerRetryableV1) {
      return retryable(error);
    }
    if (error instanceof ProducerUnverifiableV1) {
      return unverifiable(
        error.reason, error.sourceRole, error.failedFrameOrdinal, error.diagnostic,
      );
    }
    return unverifiable('FRAME_INTERVAL_INVALID', null, null, diagnostic(error));
  }

  let indexSerialization: MediaProxyMasterCorrespondenceIndexSerializationV1;
  let indexReference: MediaProxyMasterCorrespondenceIndexReferenceV1;
  try {
    indexSerialization = createIndexSerializationFromSidecars({
      basis: prepared.basis,
      resourcePolicy: prepared.indexPolicy,
      sidecars,
      totalSpanCount: spanOrdinal.toString(),
      canonicalEndExclusiveTime: canonicalEndExclusiveTime!,
    });
    indexReference = createMediaProxyMasterCorrespondenceIndexReferenceV1({
      serialization: indexSerialization,
    });
  } catch (error) {
    if (error instanceof ProducerUnverifiableV1) {
      return unverifiable(
        error.reason, error.sourceRole, error.failedFrameOrdinal, error.diagnostic,
      );
    }
    return unverifiable(
      'ARTIFACT_VERIFICATION_REJECTED', null, null, diagnostic(error),
    );
  }
  let rawReceipt: MediaProxyMasterCorrespondenceArtifactVerificationReceiptV1;
  try {
    rawReceipt = await input.publisher.publishIndexAndVerify({
      basis: prepared.basis,
      indexSerialization,
      indexReference,
      verificationPolicy: prepared.verificationPolicy,
    });
  } catch (error) {
    return {
      disposition: 'RETRYABLE',
      reason: 'ARTIFACT_STORE_UNAVAILABLE',
      sourceRole: null,
      failedFrameOrdinal: null,
      lastPublishedBatchSequence,
      diagnostic: diagnostic(error),
    };
  }
  try {
    const receipt = assertMediaProxyMasterCorrespondenceArtifactVerificationReceiptV1(
      rawReceipt,
    );
    if (canonicalizeEditronJsonV1(receipt.basis)
        !== canonicalizeEditronJsonV1(prepared.basis)
      || canonicalizeEditronJsonV1(receipt.indexReference)
        !== canonicalizeEditronJsonV1(indexReference)
      || receipt.totalSpanCount !== spanOrdinal.toString()
      || compareCanonicalMediaTimeV1(
        receipt.canonicalEndExclusiveTime,
        canonicalEndExclusiveTime!,
      ) !== 0) {
      throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_RECEIPT_SCOPE_MISMATCH');
    }
    return Object.freeze({
      disposition: 'PUBLISHED' as const,
      indexReference,
      artifactVerificationSha256: receipt.verificationSha256,
      batchCount: sidecars.length,
      totalSpanCount: spanOrdinal.toString(),
      canonicalEndExclusiveTime: canonicalEndExclusiveTime!,
    });
  } catch (error) {
    return unverifiable(
      'ARTIFACT_VERIFICATION_REJECTED', null, null, diagnostic(error),
    );
  }
}

type PreparedRequestV1 = Readonly<{
  basis: MediaProxyMasterCorrespondenceBasisV1;
  pageFrameRecords: number;
  batchPolicy: MediaProxyMasterCorrespondenceBatchResourcePolicyV1;
  indexPolicy: MediaProxyMasterCorrespondenceIndexResourcePolicyV1;
  verificationPolicy: MediaProxyMasterCorrespondenceArtifactVerificationPolicyV1;
}>;

function prepareRequest(input: Readonly<{
  basis: MediaProxyMasterCorrespondenceBasisV1;
  proxy: MediaProxyMasterCorrespondenceProducerSourceV1;
  master: MediaProxyMasterCorrespondenceProducerSourceV1;
  policy: MediaProxyMasterCorrespondenceProducerPolicyV1;
  publisher: MediaProxyMasterCorrespondenceIncrementalPublisherV1;
}>): PreparedRequestV1 {
  const basis = assertMediaProxyMasterCorrespondenceBasisV1(input.basis);
  const pageFrameRecords = positiveSafeInteger(
    input.policy?.pageFrameRecords,
    MAX_PAGE_FRAME_RECORDS,
    'MEDIA_PROXY_MASTER_CORRESPONDENCE_PAGE_SIZE_INVALID',
  );
  const batchPolicy = assertMediaProxyMasterCorrespondenceBatchResourcePolicyV1(
    input.policy?.batch,
  );
  const indexPolicy = assertMediaProxyMasterCorrespondenceIndexResourcePolicyV1(
    input.policy?.index,
  );
  const verificationPolicy =
    assertMediaProxyMasterCorrespondenceArtifactVerificationPolicyV1(
      input.policy?.verification,
    );
  if (typeof input.policy?.policyVersion !== 'string'
    || !input.policy.policyVersion.trim()
    || input.policy.policyVersion.trim() !== input.policy.policyVersion
    || input.policy.policyVersion.length > 255
    || pageFrameRecords > input.proxy?.windowResourcePolicy?.maxFrameRecords
    || pageFrameRecords > input.master?.windowResourcePolicy?.maxFrameRecords
    || !input.publisher
    || typeof input.publisher.publishBatch !== 'function'
    || typeof input.publisher.publishIndexAndVerify !== 'function'
    || !input.proxy?.storedObjectReader
    || typeof input.proxy.storedObjectReader.read !== 'function'
    || !input.master?.storedObjectReader
    || typeof input.master.storedObjectReader.read !== 'function') {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_REQUEST_INVALID');
  }
  if (indexPolicy.requiredBatchPolicyVersion !== batchPolicy.policyVersion) {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_POLICY_MISMATCH');
  }
  return Object.freeze({
    basis,
    pageFrameRecords,
    batchPolicy,
    indexPolicy,
    verificationPolicy,
  });
}

function resourceAdmissionAllows(request: PreparedRequestV1): boolean {
  const maximumSpanCount = BigInt(request.basis.proxyTimeMap.totalFrameCount)
    + BigInt(request.basis.masterTimeMap.totalFrameCount) - BigInt(1);
  const maximumBatchCount = (
    maximumSpanCount + BigInt(request.batchPolicy.maxSpanRecords) - BigInt(1)
  ) / BigInt(request.batchPolicy.maxSpanRecords);
  return maximumBatchCount <= BigInt(request.indexPolicy.maxBatchEntries)
    && maximumBatchCount <= BigInt(request.verificationPolicy.maxBatchReads);
}

type FrameIntervalV1 = Readonly<{
  frameOrdinal: string;
  start: CanonicalMediaTimeV1;
  end: CanonicalMediaTimeV1;
}>;

async function* presentationIntervals(input: Readonly<{
  role: 'PROXY' | 'MASTER';
  source: MediaProxyMasterCorrespondenceProducerSourceV1;
  map: MediaProxyMasterTimeMapReferenceV1;
  pageFrameRecords: number;
  readWindow: ReadWindowV3;
}>): AsyncGenerator<FrameIntervalV1> {
  const totalFrames = BigInt(input.map.totalFrameCount);
  let first = BigInt(0);
  let previousEnd: CanonicalMediaTimeV1 | null = null;
  while (first < totalFrames) {
    const end = minimumBigInt(
      first + BigInt(input.pageFrameRecords),
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
      throw new ProducerRetryableV1(
        'WINDOW_READER_UNAVAILABLE', input.role, first.toString(),
        null, diagnostic(error),
      );
    }
    if (result.disposition === 'UNVERIFIABLE') {
      if (result.reason === 'WINDOW_INDEX_READ_FAILED'
        || result.reason === 'WINDOW_BATCH_READ_FAILED') {
        throw new ProducerRetryableV1(
          'WINDOW_READER_UNAVAILABLE', input.role, first.toString(),
          null, result.reason,
        );
      }
      throw new ProducerUnverifiableV1(
        'WINDOW_EVIDENCE_REJECTED', input.role, first.toString(), result.reason,
      );
    }
    if (!windowMatchesRequest(result, input.map, first, end, input.source)) {
      throw new ProducerUnverifiableV1(
        'WINDOW_EVIDENCE_REJECTED', input.role, first.toString(), null,
      );
    }
    const epochs = new Map(result.epochs.map((epoch) => [epoch.epochId, epoch]));
    if (epochs.size !== result.epochs.length) {
      throw new ProducerUnverifiableV1(
        'WINDOW_EVIDENCE_REJECTED', input.role, first.toString(),
        'MEDIA_PROXY_MASTER_CORRESPONDENCE_EPOCH_DUPLICATE',
      );
    }
    for (let offset = 0; offset < result.frames.length; offset += 1) {
      const frame = result.frames[offset]!;
      const expectedOrdinal = first + BigInt(offset);
      const epoch = epochs.get(frame.epochId);
      if (frame.sourceFrameOrdinal !== expectedOrdinal.toString()
        || !epoch || epoch.streamId !== input.map.streamId
        || !positiveIntegerText(frame.durationTicks)) {
        throw new ProducerUnverifiableV1(
          'FRAME_INTERVAL_INVALID', input.role, frame.sourceFrameOrdinal, null,
        );
      }
      let frameStart: CanonicalMediaTimeV1;
      let frameEnd: CanonicalMediaTimeV1;
      try {
        frameStart = mediaTimeFromPresentationEpochTicksV1(
          epoch,
          frame.presentationTimestampTicks,
        );
        frameEnd = mediaTimeFromPresentationEpochTicksV1(
          epoch,
          (BigInt(frame.presentationTimestampTicks) + BigInt(frame.durationTicks)).toString(),
        );
      } catch (error) {
        throw new ProducerUnverifiableV1(
          'FRAME_INTERVAL_INVALID', input.role, frame.sourceFrameOrdinal,
          diagnostic(error),
        );
      }
      if (compareCanonicalMediaTimeV1(frameStart, frameEnd) >= 0) {
        throw new ProducerUnverifiableV1(
          'FRAME_INTERVAL_INVALID', input.role, frame.sourceFrameOrdinal, null,
        );
      }
      if (previousEnd === null) {
        if (compareCanonicalMediaTimeV1(frameStart, ZERO_TIME) !== 0) {
          throw new ProducerUnverifiableV1(
            'NON_CONTIGUOUS_PRESENTATION', input.role, frame.sourceFrameOrdinal,
            null,
          );
        }
      } else if (compareCanonicalMediaTimeV1(previousEnd, frameStart) !== 0) {
        throw new ProducerUnverifiableV1(
          'NON_CONTIGUOUS_PRESENTATION', input.role, frame.sourceFrameOrdinal,
          null,
        );
      }
      previousEnd = frameEnd;
      yield Object.freeze({
        frameOrdinal: frame.sourceFrameOrdinal,
        start: frameStart,
        end: frameEnd,
      });
    }
    first = end;
  }
}

function windowMatchesRequest(
  window: MediaSourcePtsCadenceEpochPresentationWindowV3,
  map: MediaProxyMasterTimeMapReferenceV1,
  first: bigint,
  end: bigint,
  source: MediaProxyMasterCorrespondenceProducerSourceV1,
): boolean {
  const { presentationWindowEvidenceSha256, ...material } = window;
  return presentationWindowEvidenceSha256 === hashEditronCanonicalJsonV1(material)
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

function createIndexSerializationFromSidecars(input: Readonly<{
  basis: MediaProxyMasterCorrespondenceBasisV1;
  resourcePolicy: MediaProxyMasterCorrespondenceIndexResourcePolicyV1;
  sidecars: readonly MediaProxyMasterCorrespondenceBatchSidecarV1[];
  totalSpanCount: string;
  canonicalEndExclusiveTime: CanonicalMediaTimeV1;
}>): MediaProxyMasterCorrespondenceIndexSerializationV1 {
  const index = assertMediaProxyMasterCorrespondenceIndexV1({
    schemaVersion: 1,
    kind: MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_KIND_V1,
    basis: input.basis,
    basisSha256: hashEditronCanonicalJsonV1(input.basis),
    resourcePolicy: input.resourcePolicy,
    batches: input.sidecars,
    totalSpanCount: input.totalSpanCount,
    mappedProxyFrameCount: input.basis.proxyTimeMap.totalFrameCount,
    mappedMasterFrameCount: input.basis.masterTimeMap.totalFrameCount,
    canonicalEndExclusiveTime: input.canonicalEndExclusiveTime,
  });
  const canonicalJson = canonicalizeEditronJsonV1(index);
  const byteLength = Buffer.byteLength(canonicalJson, 'utf8');
  if (byteLength > input.resourcePolicy.maxCanonicalJsonBytes) {
    throw new ProducerUnverifiableV1(
      'RESOURCE_LIMIT_EXCEEDED', null, null, null,
    );
  }
  return Object.freeze({
    index,
    canonicalJson,
    byteLength,
    contentSha256: createHash('sha256').update(canonicalJson).digest('hex'),
  });
}

class ProducerUnverifiableV1 extends Error {
  constructor(
    public readonly reason: Extract<
      MediaProxyMasterCorrespondenceProductionResultV1,
      { disposition: 'UNVERIFIABLE' }
    >['reason'],
    public readonly sourceRole: 'PROXY' | 'MASTER' | null,
    public readonly failedFrameOrdinal: string | null,
    public readonly diagnostic: string | null,
  ) {
    super(reason);
  }
}

class ProducerRetryableV1 extends Error {
  constructor(
    public readonly reason: Extract<
      MediaProxyMasterCorrespondenceProductionResultV1,
      { disposition: 'RETRYABLE' }
    >['reason'],
    public readonly sourceRole: 'PROXY' | 'MASTER' | null,
    public readonly failedFrameOrdinal: string | null,
    public readonly lastPublishedBatchSequence: number | null,
    public readonly diagnostic: string | null,
  ) {
    super(reason);
  }
}

function retryable(
  error: ProducerRetryableV1,
): Extract<MediaProxyMasterCorrespondenceProductionResultV1, {
  disposition: 'RETRYABLE';
}> {
  return Object.freeze({
    disposition: 'RETRYABLE' as const,
    reason: error.reason,
    sourceRole: error.sourceRole,
    failedFrameOrdinal: error.failedFrameOrdinal,
    lastPublishedBatchSequence: error.lastPublishedBatchSequence,
    diagnostic: error.diagnostic,
  });
}

function unverifiable(
  reason: Extract<MediaProxyMasterCorrespondenceProductionResultV1, {
    disposition: 'UNVERIFIABLE';
  }>['reason'],
  sourceRole: 'PROXY' | 'MASTER' | null,
  failedFrameOrdinal: string | null,
  diagnosticValue: string | null,
): Extract<MediaProxyMasterCorrespondenceProductionResultV1, {
  disposition: 'UNVERIFIABLE';
}> {
  return Object.freeze({
    disposition: 'UNVERIFIABLE' as const,
    reason,
    sourceRole,
    failedFrameOrdinal,
    diagnostic: diagnosticValue,
  });
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

function positiveIntegerText(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9][0-9]{0,127}$/.test(value);
}

function positiveSafeInteger(value: unknown, max: number, error: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > max) {
    throw new Error(error);
  }
  return Number(value);
}

function diagnostic(value: unknown): string | null {
  const message = value instanceof Error ? value.message : null;
  return message && /^[A-Z0-9_:.-]{1,240}$/.test(message) ? message : null;
}
