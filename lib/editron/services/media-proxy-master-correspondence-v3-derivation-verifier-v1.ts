import { createHash } from 'node:crypto';

import {
  compareCanonicalMediaTimeV1,
  mediaTimeFromPresentationEpochTicksV1,
  parseCanonicalMediaTimeV1,
  type CanonicalMediaTimeV1,
} from '../contracts/canonical-media-time-v1';

import {
  canonicalizeEditronJsonV1,
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaProxyMasterCorrespondenceArtifactVerificationReceiptV1,
  verifyMediaProxyMasterCorrespondenceArtifactsV1,
  type MediaProxyMasterCorrespondenceArtifactReaderV1,
  type MediaProxyMasterCorrespondenceArtifactVerificationPolicyV1,
} from './media-proxy-master-correspondence-artifact-verifier-v1';
import {
  assertMediaProxyMasterCorrespondenceBasisV1,
  parseMediaProxyMasterCorrespondenceBatchV1,
  type MediaProxyMasterCorrespondenceBasisV1,
  type MediaProxyMasterFrameCorrespondenceSpanV1,
} from './media-proxy-master-correspondence-batch-v1';
import {
  assertMediaProxyMasterCorrespondenceIndexReferenceV1,
  expectedMediaProxyMasterCorrespondenceIndexObjectKeyV1,
} from './media-proxy-master-correspondence-index-v1';
import {
  readMediaSourcePtsCadenceEpochPresentationWindowV3,
  type MediaSourcePtsCadenceEpochPresentationWindowV3,
  type MediaSourcePtsCadenceEpochWindowResourcePolicyV3,
} from './media-source-pts-cadence-epoch-window-reader-v3';
import type {
  MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3,
} from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import type {
  MediaSourcePtsCadenceMapAssetStateInputV3,
} from './media-source-pts-cadence-map-asset-owner-v3';
import type {
  MediaProxyMasterCorrespondenceIndexReferenceV1,
  MediaProxyMasterTimeMapReferenceV1,
} from './media-proxy-master-time-mapping-v1';

export const MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_VERIFICATION_V1' as const;
export const MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_VERIFIER_VERSION_V1 =
  'editron-proxy-master-correspondence-v3-derivation-verifier-v1' as const;

const MAX_DERIVATION_BATCHES = 100_000;
const MAX_SPAN_CHECKS = 20_000_000;
const MAX_WINDOW_FRAME_RECORDS = 20_000_000;
const MAX_SELECTED_BATCH_BYTES = 64 * 1024 * 1024 * 1024;

export type MediaProxyMasterCorrespondenceV3DerivationPolicyV1 = Readonly<{
  policyVersion: string;
  maxSpanChecks: number;
  maxTotalWindowFrameRecords: number;
  maxTotalSelectedBatchBytes: number;
}>;

type DerivationBatchReceiptV1 = Readonly<{
  batchSequence: number;
  contentSha256: string;
  spanCount: string;
  proxyFirstFrameOrdinal: string;
  proxyEndExclusiveFrameOrdinal: string;
  masterFirstFrameOrdinal: string;
  masterEndExclusiveFrameOrdinal: string;
  proxySelectedBatchBytes: number;
  masterSelectedBatchBytes: number;
  proxyWindowEvidenceSha256: string;
  masterWindowEvidenceSha256: string;
}>;

export type MediaProxyMasterCorrespondenceV3DerivationReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_KIND_V1;
  disposition: 'CORRESPONDENCE_V3_DERIVATION_VERIFIED';
  verifierVersion:
    typeof MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_VERIFIER_VERSION_V1;
  basis: MediaProxyMasterCorrespondenceBasisV1;
  indexReference: MediaProxyMasterCorrespondenceIndexReferenceV1;
  artifactVerificationSha256: string;
  derivationPolicy: MediaProxyMasterCorrespondenceV3DerivationPolicyV1;
  verifiedBatchCount: number;
  verifiedSpanCount: string;
  totalWindowFrameRecords: number;
  totalSelectedBatchBytes: number;
  canonicalEndExclusiveTime: CanonicalMediaTimeV1;
  verifiedBatches: readonly DerivationBatchReceiptV1[];
  derivationSha256: string;
}>;

export type MediaProxyMasterCorrespondenceV3DerivationUnverifiableReasonV1 =
  | 'VERIFICATION_REQUEST_INVALID'
  | 'CORRESPONDENCE_ARTIFACT_UNVERIFIABLE'
  | 'CORRESPONDENCE_BATCH_REREAD_FAILED'
  | 'CORRESPONDENCE_BATCH_CHANGED'
  | 'CORRESPONDENCE_BATCH_PAYLOAD_INVALID'
  | 'PROXY_V3_WINDOW_UNVERIFIABLE'
  | 'MASTER_V3_WINDOW_UNVERIFIABLE'
  | 'V3_WINDOW_SCOPE_MISMATCH'
  | 'RESOURCE_LIMIT_EXCEEDED'
  | 'SPAN_DERIVATION_MISMATCH'
  | 'TERMINAL_DURATION_MISMATCH';

export type MediaProxyMasterCorrespondenceV3DerivationResultV1 = Readonly<
  | MediaProxyMasterCorrespondenceV3DerivationReceiptV1
  | {
      disposition: 'UNVERIFIABLE';
      reason: MediaProxyMasterCorrespondenceV3DerivationUnverifiableReasonV1;
      failedObjectKey: string | null;
      failedBatchSequence: number | null;
      failedSpanOrdinal: string | null;
      sourceRole: 'PROXY' | 'MASTER' | null;
      diagnostic: string | null;
    }
>;

type V3SourceInput = Readonly<{
  asset: MediaSourcePtsCadenceMapAssetStateInputV3;
  storedObjectReader: MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3;
  windowResourcePolicy: MediaSourcePtsCadenceEpochWindowResourcePolicyV3;
}>;

export async function verifyMediaProxyMasterCorrespondenceV3DerivationV1(
  input: Readonly<{
    basis: MediaProxyMasterCorrespondenceBasisV1;
    indexReference: MediaProxyMasterCorrespondenceIndexReferenceV1;
    artifactVerificationPolicy:
      MediaProxyMasterCorrespondenceArtifactVerificationPolicyV1;
    derivationPolicy: MediaProxyMasterCorrespondenceV3DerivationPolicyV1;
    correspondenceReader: MediaProxyMasterCorrespondenceArtifactReaderV1;
    proxy: V3SourceInput;
    master: V3SourceInput;
  }>,
): Promise<MediaProxyMasterCorrespondenceV3DerivationResultV1> {
  let basis: MediaProxyMasterCorrespondenceBasisV1;
  let indexReference: MediaProxyMasterCorrespondenceIndexReferenceV1;
  let derivationPolicy: MediaProxyMasterCorrespondenceV3DerivationPolicyV1;
  try {
    basis = assertMediaProxyMasterCorrespondenceBasisV1(input.basis);
    indexReference = assertMediaProxyMasterCorrespondenceIndexReferenceV1(
      input.indexReference,
    );
    derivationPolicy = assertMediaProxyMasterCorrespondenceV3DerivationPolicyV1(
      input.derivationPolicy,
    );
    if (!input.correspondenceReader
      || typeof input.correspondenceReader.read !== 'function'
      || !input.proxy?.storedObjectReader
      || typeof input.proxy.storedObjectReader.read !== 'function'
      || !input.master?.storedObjectReader
      || typeof input.master.storedObjectReader.read !== 'function') {
      throw new Error('CORRESPONDENCE_V3_DERIVATION_READER_INVALID');
    }
  } catch (error) {
    return unverifiable(
      'VERIFICATION_REQUEST_INVALID', null, null, null, null, error,
    );
  }

  const artifactResult = await verifyMediaProxyMasterCorrespondenceArtifactsV1({
    basis,
    indexReference,
    verificationPolicy: input.artifactVerificationPolicy,
    reader: input.correspondenceReader,
  });
  if (artifactResult.disposition === 'UNVERIFIABLE') {
    return unverifiable(
      'CORRESPONDENCE_ARTIFACT_UNVERIFIABLE',
      artifactResult.failedObjectKey,
      artifactResult.failedBatchSequence,
      null,
      null,
      artifactResult.reason,
    );
  }
  const artifactReceipt =
    assertMediaProxyMasterCorrespondenceArtifactVerificationReceiptV1(artifactResult);
  if (artifactReceipt.verifiedBatchCount > MAX_DERIVATION_BATCHES) {
    return unverifiable('RESOURCE_LIMIT_EXCEEDED', null, null, null, null, null);
  }

  const verifiedBatches: DerivationBatchReceiptV1[] = [];
  let verifiedSpanCount = BigInt(0);
  let totalWindowFrameRecords = 0;
  let totalSelectedBatchBytes = 0;
  let terminalProxyEnd: CanonicalMediaTimeV1 | null = null;
  let terminalMasterEnd: CanonicalMediaTimeV1 | null = null;

  for (const batchReference of artifactReceipt.verifiedBatches) {
    const reread = await readCorrespondenceBatch(
      input.correspondenceReader,
      batchReference,
    );
    if (reread.disposition === 'UNVERIFIABLE') return reread.result;
    const batch = reread.batch;
    if (batch.batchSequence !== batchReference.batchSequence
      || String(batch.spans.length) !== batchReference.spanCount
      || canonicalizeEditronJsonV1(batch.basis) !== canonicalizeEditronJsonV1(basis)) {
      return unverifiable(
        'CORRESPONDENCE_BATCH_CHANGED',
        batchReference.objectKey,
        batchReference.batchSequence,
        null,
        null,
        null,
      );
    }

    const firstSpan = batch.spans[0]!;
    const lastSpan = batch.spans[batch.spans.length - 1]!;
    const proxyFirstFrameOrdinal = firstSpan.proxyFrameOrdinal;
    const proxyEndExclusiveFrameOrdinal = incrementIntegerText(lastSpan.proxyFrameOrdinal);
    const masterFirstFrameOrdinal = firstSpan.masterFrameOrdinal;
    const masterEndExclusiveFrameOrdinal = incrementIntegerText(lastSpan.masterFrameOrdinal);

    const [proxyWindowResult, masterWindowResult] = await Promise.all([
      readMediaSourcePtsCadenceEpochPresentationWindowV3({
        asset: input.proxy.asset,
        storedObjectReader: input.proxy.storedObjectReader,
        firstFrameOrdinal: proxyFirstFrameOrdinal,
        endExclusiveFrameOrdinal: proxyEndExclusiveFrameOrdinal,
        resourcePolicy: input.proxy.windowResourcePolicy,
      }),
      readMediaSourcePtsCadenceEpochPresentationWindowV3({
        asset: input.master.asset,
        storedObjectReader: input.master.storedObjectReader,
        firstFrameOrdinal: masterFirstFrameOrdinal,
        endExclusiveFrameOrdinal: masterEndExclusiveFrameOrdinal,
        resourcePolicy: input.master.windowResourcePolicy,
      }),
    ]);
    if (proxyWindowResult.disposition === 'UNVERIFIABLE') {
      return unverifiable(
        'PROXY_V3_WINDOW_UNVERIFIABLE',
        proxyWindowResult.failedObjectKey,
        batch.batchSequence,
        null,
        'PROXY',
        proxyWindowResult.reason,
      );
    }
    if (masterWindowResult.disposition === 'UNVERIFIABLE') {
      return unverifiable(
        'MASTER_V3_WINDOW_UNVERIFIABLE',
        masterWindowResult.failedObjectKey,
        batch.batchSequence,
        null,
        'MASTER',
        masterWindowResult.reason,
      );
    }

    if (!windowMatchesTimeMap(
      proxyWindowResult,
      basis.proxyTimeMap,
      proxyFirstFrameOrdinal,
      proxyEndExclusiveFrameOrdinal,
      input.proxy.windowResourcePolicy,
    )) {
      return unverifiable(
        'V3_WINDOW_SCOPE_MISMATCH', null, batch.batchSequence, null, 'PROXY', null,
      );
    }
    if (!windowMatchesTimeMap(
      masterWindowResult,
      basis.masterTimeMap,
      masterFirstFrameOrdinal,
      masterEndExclusiveFrameOrdinal,
      input.master.windowResourcePolicy,
    )) {
      return unverifiable(
        'V3_WINDOW_SCOPE_MISMATCH', null, batch.batchSequence, null, 'MASTER', null,
      );
    }

    const batchFrameRecords = proxyWindowResult.frames.length
      + masterWindowResult.frames.length;
    const batchSelectedBytes = proxyWindowResult.selectedBatchBytes
      + masterWindowResult.selectedBatchBytes;
    totalWindowFrameRecords += batchFrameRecords;
    totalSelectedBatchBytes += batchSelectedBytes;
    verifiedSpanCount += BigInt(batch.spans.length);
    if (verifiedSpanCount > BigInt(derivationPolicy.maxSpanChecks)
      || totalWindowFrameRecords > derivationPolicy.maxTotalWindowFrameRecords
      || totalSelectedBatchBytes > derivationPolicy.maxTotalSelectedBatchBytes) {
      return unverifiable(
        'RESOURCE_LIMIT_EXCEEDED',
        batchReference.objectKey,
        batch.batchSequence,
        null,
        null,
        null,
      );
    }

    let proxyIntervals: ReadonlyMap<string, FrameIntervalV1>;
    let masterIntervals: ReadonlyMap<string, FrameIntervalV1>;
    try {
      proxyIntervals = frameIntervals(proxyWindowResult);
      masterIntervals = frameIntervals(masterWindowResult);
    } catch (error) {
      return unverifiable(
        'V3_WINDOW_SCOPE_MISMATCH',
        null,
        batch.batchSequence,
        null,
        null,
        error,
      );
    }

    for (const span of batch.spans) {
      const proxyInterval = proxyIntervals.get(span.proxyFrameOrdinal);
      const masterInterval = masterIntervals.get(span.masterFrameOrdinal);
      if (!proxyInterval || !masterInterval
        || !spanEqualsIntersection(span, proxyInterval, masterInterval)) {
        return unverifiable(
          'SPAN_DERIVATION_MISMATCH',
          batchReference.objectKey,
          batch.batchSequence,
          span.spanOrdinal,
          null,
          null,
        );
      }
      if (span.spanOrdinal === '0'
        && (compareCanonicalMediaTimeV1(proxyInterval.start, span.canonicalStartTime) !== 0
          || compareCanonicalMediaTimeV1(masterInterval.start, span.canonicalStartTime) !== 0)) {
        return unverifiable(
          'SPAN_DERIVATION_MISMATCH',
          batchReference.objectKey,
          batch.batchSequence,
          span.spanOrdinal,
          null,
          null,
        );
      }
      terminalProxyEnd = proxyInterval.end;
      terminalMasterEnd = masterInterval.end;
    }

    verifiedBatches.push({
      batchSequence: batch.batchSequence,
      contentSha256: batchReference.contentSha256,
      spanCount: String(batch.spans.length),
      proxyFirstFrameOrdinal,
      proxyEndExclusiveFrameOrdinal,
      masterFirstFrameOrdinal,
      masterEndExclusiveFrameOrdinal,
      proxySelectedBatchBytes: proxyWindowResult.selectedBatchBytes,
      masterSelectedBatchBytes: masterWindowResult.selectedBatchBytes,
      proxyWindowEvidenceSha256: proxyWindowResult.presentationWindowEvidenceSha256,
      masterWindowEvidenceSha256: masterWindowResult.presentationWindowEvidenceSha256,
    });
  }

  const canonicalEndExclusiveTime = parseCanonicalMediaTimeV1(
    artifactReceipt.canonicalEndExclusiveTime,
  );
  if (verifiedSpanCount.toString() !== artifactReceipt.totalSpanCount
    || terminalProxyEnd === null
    || terminalMasterEnd === null
    || compareCanonicalMediaTimeV1(terminalProxyEnd, canonicalEndExclusiveTime) !== 0
    || compareCanonicalMediaTimeV1(terminalMasterEnd, canonicalEndExclusiveTime) !== 0) {
    return unverifiable(
      'TERMINAL_DURATION_MISMATCH', null, null, null, null, null,
    );
  }

  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_KIND_V1,
    disposition: 'CORRESPONDENCE_V3_DERIVATION_VERIFIED' as const,
    verifierVersion:
      MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_VERIFIER_VERSION_V1,
    basis,
    indexReference,
    artifactVerificationSha256: artifactReceipt.verificationSha256,
    derivationPolicy,
    verifiedBatchCount: verifiedBatches.length,
    verifiedSpanCount: verifiedSpanCount.toString(),
    totalWindowFrameRecords,
    totalSelectedBatchBytes,
    canonicalEndExclusiveTime,
    verifiedBatches,
  };
  return assertMediaProxyMasterCorrespondenceV3DerivationReceiptV1({
    ...material,
    derivationSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertMediaProxyMasterCorrespondenceV3DerivationReceiptV1(
  value: unknown,
): MediaProxyMasterCorrespondenceV3DerivationReceiptV1 {
  const record = object(value, 'CORRESPONDENCE_V3_DERIVATION_RECEIPT_INVALID');
  exactKeys(record, [
    'schemaVersion', 'kind', 'disposition', 'verifierVersion', 'basis',
    'indexReference', 'artifactVerificationSha256', 'derivationPolicy',
    'verifiedBatchCount', 'verifiedSpanCount', 'totalWindowFrameRecords',
    'totalSelectedBatchBytes', 'canonicalEndExclusiveTime', 'verifiedBatches',
    'derivationSha256',
  ], 'CORRESPONDENCE_V3_DERIVATION_RECEIPT_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_KIND_V1
    || record.disposition !== 'CORRESPONDENCE_V3_DERIVATION_VERIFIED'
    || record.verifierVersion
      !== MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_VERIFIER_VERSION_V1) {
    fail('CORRESPONDENCE_V3_DERIVATION_RECEIPT_IDENTITY_INVALID');
  }
  const basis = assertMediaProxyMasterCorrespondenceBasisV1(record.basis);
  const indexReference = assertMediaProxyMasterCorrespondenceIndexReferenceV1(
    record.indexReference,
  );
  const artifactVerificationSha256 = sha256(
    record.artifactVerificationSha256,
    'CORRESPONDENCE_V3_DERIVATION_ARTIFACT_HASH_INVALID',
  );
  const derivationPolicy = assertMediaProxyMasterCorrespondenceV3DerivationPolicyV1(
    record.derivationPolicy,
  );
  const verifiedBatches = assertDerivationBatches(record.verifiedBatches);
  const verifiedBatchCount = nonNegativeSafeInteger(
    record.verifiedBatchCount,
    MAX_DERIVATION_BATCHES,
    'CORRESPONDENCE_V3_DERIVATION_BATCH_COUNT_INVALID',
  );
  const verifiedSpanCount = positiveIntegerText(
    record.verifiedSpanCount,
    'CORRESPONDENCE_V3_DERIVATION_SPAN_COUNT_INVALID',
  );
  const totalWindowFrameRecords = positiveSafeInteger(
    record.totalWindowFrameRecords,
    MAX_WINDOW_FRAME_RECORDS,
    'CORRESPONDENCE_V3_DERIVATION_WINDOW_FRAMES_INVALID',
  );
  const totalSelectedBatchBytes = positiveSafeInteger(
    record.totalSelectedBatchBytes,
    MAX_SELECTED_BATCH_BYTES,
    'CORRESPONDENCE_V3_DERIVATION_WINDOW_BYTES_INVALID',
  );
  const canonicalEndExclusiveTime = parseCanonicalMediaTimeV1(
    record.canonicalEndExclusiveTime,
  );
  const expectedSpanCount = verifiedBatches.reduce(
    (total, batch) => total + BigInt(batch.spanCount), BigInt(0),
  );
  const expectedFrameRecords = verifiedBatches.reduce(
    (total, batch) => total
      + Number(BigInt(batch.proxyEndExclusiveFrameOrdinal)
        - BigInt(batch.proxyFirstFrameOrdinal))
      + Number(BigInt(batch.masterEndExclusiveFrameOrdinal)
        - BigInt(batch.masterFirstFrameOrdinal)),
    0,
  );
  const expectedSelectedBytes = verifiedBatches.reduce(
    (total, batch) => total + batch.proxySelectedBatchBytes
      + batch.masterSelectedBatchBytes,
    0,
  );
  if (verifiedBatchCount !== verifiedBatches.length
    || BigInt(verifiedSpanCount) !== expectedSpanCount
    || totalWindowFrameRecords !== expectedFrameRecords
    || totalSelectedBatchBytes !== expectedSelectedBytes
    || verifiedBatchCount !== indexReference.batchCount
    || verifiedSpanCount === '0'
    || BigInt(verifiedSpanCount) > BigInt(derivationPolicy.maxSpanChecks)
    || totalWindowFrameRecords > derivationPolicy.maxTotalWindowFrameRecords
    || totalSelectedBatchBytes > derivationPolicy.maxTotalSelectedBatchBytes
    || indexReference.mappedProxyFrameCount !== basis.proxyTimeMap.totalFrameCount
    || indexReference.mappedMasterFrameCount !== basis.masterTimeMap.totalFrameCount
    || indexReference.objectKey
      !== expectedMediaProxyMasterCorrespondenceIndexObjectKeyV1(
        hashEditronCanonicalJsonV1(basis),
        indexReference.contentSha256,
      )) {
    fail('CORRESPONDENCE_V3_DERIVATION_RECEIPT_SCOPE_MISMATCH');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_KIND_V1,
    disposition: 'CORRESPONDENCE_V3_DERIVATION_VERIFIED' as const,
    verifierVersion:
      MEDIA_PROXY_MASTER_CORRESPONDENCE_V3_DERIVATION_VERIFIER_VERSION_V1,
    basis,
    indexReference,
    artifactVerificationSha256,
    derivationPolicy,
    verifiedBatchCount,
    verifiedSpanCount,
    totalWindowFrameRecords,
    totalSelectedBatchBytes,
    canonicalEndExclusiveTime,
    verifiedBatches,
  };
  const derivationSha256 = sha256(
    record.derivationSha256,
    'CORRESPONDENCE_V3_DERIVATION_RECEIPT_HASH_INVALID',
  );
  if (derivationSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('CORRESPONDENCE_V3_DERIVATION_RECEIPT_HASH_MISMATCH');
  }
  return frozen({ ...material, derivationSha256 });
}

export function assertMediaProxyMasterCorrespondenceV3DerivationPolicyV1(
  value: unknown,
): MediaProxyMasterCorrespondenceV3DerivationPolicyV1 {
  const record = object(value, 'CORRESPONDENCE_V3_DERIVATION_POLICY_INVALID');
  exactKeys(record, [
    'policyVersion', 'maxSpanChecks', 'maxTotalWindowFrameRecords',
    'maxTotalSelectedBatchBytes',
  ], 'CORRESPONDENCE_V3_DERIVATION_POLICY_FIELDS_INVALID');
  return frozen({
    policyVersion: text(
      record.policyVersion,
      'CORRESPONDENCE_V3_DERIVATION_POLICY_VERSION_INVALID',
    ),
    maxSpanChecks: positiveSafeInteger(
      record.maxSpanChecks,
      MAX_SPAN_CHECKS,
      'CORRESPONDENCE_V3_DERIVATION_POLICY_SPANS_INVALID',
    ),
    maxTotalWindowFrameRecords: positiveSafeInteger(
      record.maxTotalWindowFrameRecords,
      MAX_WINDOW_FRAME_RECORDS,
      'CORRESPONDENCE_V3_DERIVATION_POLICY_FRAMES_INVALID',
    ),
    maxTotalSelectedBatchBytes: positiveSafeInteger(
      record.maxTotalSelectedBatchBytes,
      MAX_SELECTED_BATCH_BYTES,
      'CORRESPONDENCE_V3_DERIVATION_POLICY_BYTES_INVALID',
    ),
  });
}

type FrameIntervalV1 = Readonly<{
  start: CanonicalMediaTimeV1;
  end: CanonicalMediaTimeV1;
}>;

function frameIntervals(
  window: MediaSourcePtsCadenceEpochPresentationWindowV3,
): ReadonlyMap<string, FrameIntervalV1> {
  const epochs = new Map(window.epochs.map((epoch) => [epoch.epochId, epoch]));
  if (epochs.size !== window.epochs.length) {
    fail('CORRESPONDENCE_V3_DERIVATION_EPOCH_DUPLICATE');
  }
  const intervals = new Map<string, FrameIntervalV1>();
  let previous: FrameIntervalV1 | null = null;
  for (const frame of window.frames) {
    const epoch = epochs.get(frame.epochId);
    const durationTicks = positiveIntegerText(
      frame.durationTicks,
      'CORRESPONDENCE_V3_DERIVATION_FRAME_DURATION_INVALID',
    );
    if (!epoch || epoch.streamId !== window.streamId) {
      fail('CORRESPONDENCE_V3_DERIVATION_FRAME_EPOCH_INVALID');
    }
    const start = mediaTimeFromPresentationEpochTicksV1(
      epoch,
      frame.presentationTimestampTicks,
    );
    const end = mediaTimeFromPresentationEpochTicksV1(
      epoch,
      String(BigInt(frame.presentationTimestampTicks) + BigInt(durationTicks)),
    );
    if (compareCanonicalMediaTimeV1(start, end) >= 0
      || (previous !== null
        && compareCanonicalMediaTimeV1(previous.end, start) !== 0)) {
      fail('CORRESPONDENCE_V3_DERIVATION_FRAME_INTERVAL_INVALID');
    }
    const interval = frozen({ start, end });
    intervals.set(frame.sourceFrameOrdinal, interval);
    previous = interval;
  }
  if (intervals.size !== window.frames.length) {
    fail('CORRESPONDENCE_V3_DERIVATION_FRAME_DUPLICATE');
  }
  return intervals;
}

function spanEqualsIntersection(
  span: MediaProxyMasterFrameCorrespondenceSpanV1,
  proxy: FrameIntervalV1,
  master: FrameIntervalV1,
): boolean {
  const expectedStart = compareCanonicalMediaTimeV1(proxy.start, master.start) >= 0
    ? proxy.start : master.start;
  const expectedEnd = compareCanonicalMediaTimeV1(proxy.end, master.end) <= 0
    ? proxy.end : master.end;
  return compareCanonicalMediaTimeV1(expectedStart, expectedEnd) < 0
    && compareCanonicalMediaTimeV1(span.canonicalStartTime, expectedStart) === 0
    && compareCanonicalMediaTimeV1(span.canonicalEndExclusiveTime, expectedEnd) === 0;
}

function windowMatchesTimeMap(
  window: MediaSourcePtsCadenceEpochPresentationWindowV3,
  map: MediaProxyMasterTimeMapReferenceV1,
  firstFrameOrdinal: string,
  endExclusiveFrameOrdinal: string,
  resourcePolicy: MediaSourcePtsCadenceEpochWindowResourcePolicyV3,
): boolean {
  const { presentationWindowEvidenceSha256, ...material } = window;
  return presentationWindowEvidenceSha256 === hashEditronCanonicalJsonV1(material)
    && window.evidenceStatus === 'HASH_VERIFIED_SOURCE_BOUND_EPOCH_V3_WINDOW'
    && window.sourceVersionSha256 === map.sourceVersionSha256
    && window.storageVersionSha256 === map.storageVersionSha256
    && window.sourceBindingSha256 === map.sourceBindingSha256
    && window.technicalObservationSha256 === map.technicalObservationSha256
    && window.sourcePtsCadenceMapStateSha256V3 === map.sourcePtsCadenceMapStateSha256V3
    && window.mapBindingSha256 === map.mapBindingSha256
    && window.terminalReceiptSha256 === map.terminalReceiptSha256
    && window.verificationSha256 === map.verificationSha256
    && window.epochIndexContentSha256 === map.epochIndexContentSha256
    && window.streamId === map.streamId
    && window.videoStreamIndex === map.videoStreamIndex
    && window.firstFrameOrdinal === firstFrameOrdinal
    && window.endExclusiveFrameOrdinal === endExclusiveFrameOrdinal
    && window.frames.length
      === Number(BigInt(endExclusiveFrameOrdinal) - BigInt(firstFrameOrdinal))
    && canonicalizeEditronJsonV1(window.resourcePolicy)
      === canonicalizeEditronJsonV1(resourcePolicy);
}

async function readCorrespondenceBatch(
  reader: MediaProxyMasterCorrespondenceArtifactReaderV1,
  reference: Readonly<{
    batchSequence: number;
    objectKey: string;
    byteLength: number;
    contentSha256: string;
  }>,
): Promise<Readonly<
  | { disposition: 'VERIFIED'; batch: ReturnType<typeof parseMediaProxyMasterCorrespondenceBatchV1> }
  | { disposition: 'UNVERIFIABLE'; result: MediaProxyMasterCorrespondenceV3DerivationResultV1 }
>> {
  let stored: Readonly<{ canonicalJson: string; byteLength: number; contentSha256: string }>;
  try {
    stored = await reader.read(reference);
  } catch (error) {
    return {
      disposition: 'UNVERIFIABLE',
      result: unverifiable(
        'CORRESPONDENCE_BATCH_REREAD_FAILED',
        reference.objectKey,
        reference.batchSequence,
        null,
        null,
        error,
      ),
    };
  }
  if (!stored || typeof stored !== 'object'
    || typeof stored.canonicalJson !== 'string'
    || stored.byteLength !== reference.byteLength
    || stored.byteLength !== Buffer.byteLength(stored.canonicalJson, 'utf8')
    || stored.contentSha256 !== reference.contentSha256
    || stored.contentSha256 !== digest(stored.canonicalJson)) {
    return {
      disposition: 'UNVERIFIABLE',
      result: unverifiable(
        'CORRESPONDENCE_BATCH_CHANGED',
        reference.objectKey,
        reference.batchSequence,
        null,
        null,
        null,
      ),
    };
  }
  try {
    return {
      disposition: 'VERIFIED',
      batch: parseMediaProxyMasterCorrespondenceBatchV1(stored.canonicalJson),
    };
  } catch (error) {
    return {
      disposition: 'UNVERIFIABLE',
      result: unverifiable(
        'CORRESPONDENCE_BATCH_PAYLOAD_INVALID',
        reference.objectKey,
        reference.batchSequence,
        null,
        null,
        error,
      ),
    };
  }
}

function assertDerivationBatches(value: unknown): readonly DerivationBatchReceiptV1[] {
  if (!Array.isArray(value) || value.length === 0
    || value.length > MAX_DERIVATION_BATCHES) {
    fail('CORRESPONDENCE_V3_DERIVATION_RECEIPT_BATCHES_INVALID');
  }
  return frozen(value.map((entry, batchSequence) => {
    const record = object(entry, 'CORRESPONDENCE_V3_DERIVATION_RECEIPT_BATCH_INVALID');
    exactKeys(record, [
      'batchSequence', 'contentSha256', 'spanCount', 'proxyFirstFrameOrdinal',
      'proxyEndExclusiveFrameOrdinal', 'masterFirstFrameOrdinal',
      'masterEndExclusiveFrameOrdinal', 'proxySelectedBatchBytes',
      'masterSelectedBatchBytes', 'proxyWindowEvidenceSha256',
      'masterWindowEvidenceSha256',
    ], 'CORRESPONDENCE_V3_DERIVATION_RECEIPT_BATCH_FIELDS_INVALID');
    if (record.batchSequence !== batchSequence) {
      fail('CORRESPONDENCE_V3_DERIVATION_RECEIPT_BATCH_SEQUENCE_INVALID');
    }
    const proxyFirstFrameOrdinal = nonNegativeIntegerText(
      record.proxyFirstFrameOrdinal,
      'CORRESPONDENCE_V3_DERIVATION_RECEIPT_PROXY_START_INVALID',
    );
    const proxyEndExclusiveFrameOrdinal = positiveIntegerText(
      record.proxyEndExclusiveFrameOrdinal,
      'CORRESPONDENCE_V3_DERIVATION_RECEIPT_PROXY_END_INVALID',
    );
    const masterFirstFrameOrdinal = nonNegativeIntegerText(
      record.masterFirstFrameOrdinal,
      'CORRESPONDENCE_V3_DERIVATION_RECEIPT_MASTER_START_INVALID',
    );
    const masterEndExclusiveFrameOrdinal = positiveIntegerText(
      record.masterEndExclusiveFrameOrdinal,
      'CORRESPONDENCE_V3_DERIVATION_RECEIPT_MASTER_END_INVALID',
    );
    if (BigInt(proxyEndExclusiveFrameOrdinal) <= BigInt(proxyFirstFrameOrdinal)
      || BigInt(masterEndExclusiveFrameOrdinal) <= BigInt(masterFirstFrameOrdinal)) {
      fail('CORRESPONDENCE_V3_DERIVATION_RECEIPT_WINDOW_RANGE_INVALID');
    }
    return {
      batchSequence,
      contentSha256: sha256(
        record.contentSha256,
        'CORRESPONDENCE_V3_DERIVATION_RECEIPT_CONTENT_HASH_INVALID',
      ),
      spanCount: positiveIntegerText(
        record.spanCount,
        'CORRESPONDENCE_V3_DERIVATION_RECEIPT_BATCH_SPANS_INVALID',
      ),
      proxyFirstFrameOrdinal,
      proxyEndExclusiveFrameOrdinal,
      masterFirstFrameOrdinal,
      masterEndExclusiveFrameOrdinal,
      proxySelectedBatchBytes: nonNegativeSafeInteger(
        record.proxySelectedBatchBytes,
        MAX_SELECTED_BATCH_BYTES,
        'CORRESPONDENCE_V3_DERIVATION_RECEIPT_PROXY_BYTES_INVALID',
      ),
      masterSelectedBatchBytes: nonNegativeSafeInteger(
        record.masterSelectedBatchBytes,
        MAX_SELECTED_BATCH_BYTES,
        'CORRESPONDENCE_V3_DERIVATION_RECEIPT_MASTER_BYTES_INVALID',
      ),
      proxyWindowEvidenceSha256: sha256(
        record.proxyWindowEvidenceSha256,
        'CORRESPONDENCE_V3_DERIVATION_RECEIPT_PROXY_WINDOW_HASH_INVALID',
      ),
      masterWindowEvidenceSha256: sha256(
        record.masterWindowEvidenceSha256,
        'CORRESPONDENCE_V3_DERIVATION_RECEIPT_MASTER_WINDOW_HASH_INVALID',
      ),
    };
  }));
}

function unverifiable(
  reason: MediaProxyMasterCorrespondenceV3DerivationUnverifiableReasonV1,
  failedObjectKey: string | null,
  failedBatchSequence: number | null,
  failedSpanOrdinal: string | null,
  sourceRole: 'PROXY' | 'MASTER' | null,
  error: unknown,
): MediaProxyMasterCorrespondenceV3DerivationResultV1 {
  return frozen({
    disposition: 'UNVERIFIABLE' as const,
    reason,
    failedObjectKey,
    failedBatchSequence,
    failedSpanOrdinal,
    sourceRole,
    diagnostic: error === null
      ? null
      : boundedDiagnostic(error instanceof Error ? error.message : String(error)),
  });
}

function incrementIntegerText(value: string): string {
  return String(BigInt(nonNegativeIntegerText(
    value,
    'CORRESPONDENCE_V3_DERIVATION_FRAME_ORDINAL_INVALID',
  )) + BigInt(1));
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

function text(value: unknown, error: string): string {
  if (typeof value !== 'string' || value.trim() !== value
    || value.length === 0 || value.length > 256) fail(error);
  return value;
}

function sha256(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(error);
  return value;
}

function positiveIntegerText(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,127}$/.test(value)) fail(error);
  return value;
}

function nonNegativeIntegerText(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,127})$/.test(value)) {
    fail(error);
  }
  return value;
}

function positiveSafeInteger(value: unknown, maximum: number, error: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0
    || (value as number) > maximum) fail(error);
  return value as number;
}

function nonNegativeSafeInteger(value: unknown, maximum: number, error: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0
    || (value as number) > maximum) fail(error);
  return value as number;
}

function boundedDiagnostic(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').slice(0, 512);
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value));
}

function fail(code: string): never {
  throw new Error(code);
}
