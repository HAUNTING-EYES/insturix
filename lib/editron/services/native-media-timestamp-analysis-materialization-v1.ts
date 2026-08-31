import {
  parseCanonicalMediaTimeV1,
  parseExactRationalRateV1,
} from '../contracts/canonical-media-time-v1';
import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  NATIVE_MEDIA_TIMESTAMP_ANALYSIS_RECEIPT_KIND_V1,
  type NativeMediaTimestampAnalysisReceiptV1,
} from './native-media-timestamp-analysis-consumer-v1';
import {
  analysisExactKeys,
  analysisIntegerText,
  analysisNonNegativeIntegerText,
  analysisObjectRecord,
  analysisPositiveInteger,
  analysisProjectRevision,
  analysisSameRevision,
  analysisSha256,
  analysisText,
  freezeNativeMediaTimestampAnalysisV1,
} from './native-media-timestamp-analysis-validation-v1';
import {
  NATIVE_MEDIA_TIMESTAMP_ANALYSIS_SAMPLE_PLAN_KIND_V1,
  type NativeMediaTimestampAnalysisSamplePlanV1,
} from './native-media-timestamp-analysis-sample-plan-v1';
import {
  NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_KIND_V1,
} from './native-media-timestamp-preview-materializer-v1';
import type { ProjectRevisionV1 } from './project-service';

export type NativeMediaTimestampAnalysisMaterializationV1 = Readonly<{
  samplePlan: NativeMediaTimestampAnalysisSamplePlanV1;
  analysisReceipt: NativeMediaTimestampAnalysisReceiptV1;
  samplePlanSha256: string;
  analysisReceiptSha256: string;
  sourcePtsCadenceMapStateSha256V3: string;
  transformSha256: string;
  materializedPictureCount: number;
  materializationSha256: string;
}>;

export function assertNativeMediaTimestampAnalysisMaterializationV1(
  value: unknown,
  expected: Readonly<{
    projectId: string;
    sequenceId: string;
    overlayId: string;
    projectRevision: ProjectRevisionV1;
    timelineStartFrame: string;
    timelineEndExclusiveFrame: string;
  }>,
): NativeMediaTimestampAnalysisMaterializationV1 {
  const scope = normalizeExpectedScope(expected);
  const root = analysisObjectRecord(
    value,
    'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_INVALID',
  );
  analysisExactKeys(root, [
    'analysisReceipt', 'analysisReceiptSha256', 'disposition', 'kind',
    'materializationSha256', 'materializedPictureCount', 'samplePlan',
    'samplePlanSha256', 'schemaVersion', 'sourcePtsCadenceMapStateSha256V3',
    'transformSha256',
  ], 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_FIELDS_INVALID');
  if (root.disposition !== 'ANALYSIS_MATERIALIZED'
    || root.schemaVersion !== 1
    || root.kind !== NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_KIND_V1) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_INVALID');
  }

  const samplePlan = assertSamplePlan(root.samplePlan, scope);
  const receipt = assertAnalysisReceipt(root.analysisReceipt, scope, samplePlan);
  const samplePlanSha256 = analysisSha256(
    root.samplePlanSha256,
    'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_PLAN_HASH_INVALID',
  );
  const analysisReceiptSha256 = analysisSha256(
    root.analysisReceiptSha256,
    'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_RECEIPT_HASH_INVALID',
  );
  const sourcePtsCadenceMapStateSha256V3 = analysisSha256(
    root.sourcePtsCadenceMapStateSha256V3,
    'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_STATE_HASH_INVALID',
  );
  const transformSha256 = analysisSha256(
    root.transformSha256,
    'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_TRANSFORM_HASH_INVALID',
  );
  const materializedPictureCount = analysisPositiveInteger(
    root.materializedPictureCount,
    'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_PICTURE_COUNT_INVALID',
  );
  const uniquePictures = new Set(
    receipt.frameMap.map((frame) => frame.decoderPictureRequestSha256),
  ).size;
  if (samplePlanSha256 !== samplePlan.samplePlanSha256
    || analysisReceiptSha256 !== receipt.receiptSha256
    || transformSha256 !== receipt.transformSha256
    || materializedPictureCount !== uniquePictures) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_SCOPE_MISMATCH');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_KIND_V1,
    samplePlanSha256,
    analysisReceiptSha256,
    sourcePtsCadenceMapStateSha256V3,
    transformSha256,
    materializedPictureCount,
  };
  const materializationSha256 = analysisSha256(
    root.materializationSha256,
    'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_HASH_INVALID',
  );
  if (materializationSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_HASH_MISMATCH');
  }
  return freezeNativeMediaTimestampAnalysisV1({
    samplePlan,
    analysisReceipt: receipt,
    samplePlanSha256,
    analysisReceiptSha256,
    sourcePtsCadenceMapStateSha256V3,
    transformSha256,
    materializedPictureCount,
    materializationSha256,
  });
}

function assertSamplePlan(
  value: unknown,
  expected: ReturnType<typeof normalizeExpectedScope>,
): NativeMediaTimestampAnalysisSamplePlanV1 {
  const plan = analysisObjectRecord(
    value,
    'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_PLAN_INVALID',
  );
  analysisExactKeys(plan, [
    'kind', 'policy', 'projectRate', 'samplePlanSha256', 'samples',
    'schemaVersion', 'timelineEndExclusiveFrame', 'timelineStartFrame',
  ], 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_PLAN_FIELDS_INVALID');
  if (plan.schemaVersion !== 1
    || plan.kind !== NATIVE_MEDIA_TIMESTAMP_ANALYSIS_SAMPLE_PLAN_KIND_V1
    || !Array.isArray(plan.samples)
    || plan.samples.length < 1) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_PLAN_INVALID');
  }
  parseExactRationalRateV1(plan.projectRate);
  const start = analysisNonNegativeIntegerText(
    plan.timelineStartFrame,
    'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_PLAN_RANGE_INVALID',
  );
  const end = analysisNonNegativeIntegerText(
    plan.timelineEndExclusiveFrame,
    'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_PLAN_RANGE_INVALID',
  );
  if (start !== expected.timelineStartFrame
    || end !== expected.timelineEndExclusiveFrame
    || BigInt(end) <= BigInt(start)) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_SCOPE_MISMATCH');
  }
  for (let index = 0; index < plan.samples.length; index += 1) {
    const sample = analysisObjectRecord(
      plan.samples[index],
      'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_SAMPLE_INVALID',
    );
    analysisExactKeys(sample, [
      'nominalWindowOffset', 'projectTime', 'sampleIndex', 'timelineFrame',
    ], 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_SAMPLE_FIELDS_INVALID');
    if (sample.sampleIndex !== index) {
      throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_SAMPLE_ORDER_INVALID');
    }
    const frame = analysisNonNegativeIntegerText(
      sample.timelineFrame,
      'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_SAMPLE_TIME_INVALID',
    );
    if (BigInt(frame) < BigInt(start) || BigInt(frame) >= BigInt(end)
      || (index > 0
        && BigInt(frame) <= BigInt((plan.samples[index - 1] as { timelineFrame: string }).timelineFrame))) {
      throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_SAMPLE_ORDER_INVALID');
    }
    parseCanonicalMediaTimeV1(sample.nominalWindowOffset);
    parseCanonicalMediaTimeV1(sample.projectTime);
  }
  const samplePlanSha256 = analysisSha256(
    plan.samplePlanSha256,
    'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_PLAN_HASH_INVALID',
  );
  const { samplePlanSha256: _samplePlanSha256, ...material } = plan;
  if (samplePlanSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_PLAN_HASH_MISMATCH');
  }
  return plan as unknown as NativeMediaTimestampAnalysisSamplePlanV1;
}

function assertAnalysisReceipt(
  value: unknown,
  expected: ReturnType<typeof normalizeExpectedScope>,
  samplePlan: NativeMediaTimestampAnalysisSamplePlanV1,
): NativeMediaTimestampAnalysisReceiptV1 {
  const receipt = analysisObjectRecord(
    value,
    'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_RECEIPT_INVALID',
  );
  analysisExactKeys(receipt, [
    'analysisRequestSha256', 'consumptionReceiptSha256', 'engineOutputSha256',
    'engineVersion', 'frameMap', 'kind', 'observations', 'overlayId',
    'projectId', 'projectRevision', 'receiptSha256', 'schemaVersion',
    'sequenceId', 'sourceVersionSha256', 'storageVersionSha256',
    'transformSha256',
  ], 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_RECEIPT_FIELDS_INVALID');
  const revision = analysisProjectRevision(receipt.projectRevision as ProjectRevisionV1);
  if (receipt.schemaVersion !== 1
    || receipt.kind !== NATIVE_MEDIA_TIMESTAMP_ANALYSIS_RECEIPT_KIND_V1
    || receipt.projectId !== expected.projectId
    || receipt.sequenceId !== expected.sequenceId
    || receipt.overlayId !== expected.overlayId
    || !analysisSameRevision(revision, expected.projectRevision)
    || !Array.isArray(receipt.frameMap)
    || receipt.frameMap.length !== samplePlan.samples.length
    || !Array.isArray(receipt.observations)) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_SCOPE_MISMATCH');
  }
  analysisSha256(receipt.sourceVersionSha256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_SOURCE_INVALID');
  analysisSha256(receipt.storageVersionSha256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_STORAGE_INVALID');
  analysisSha256(receipt.transformSha256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_TRANSFORM_HASH_INVALID');
  analysisSha256(receipt.consumptionReceiptSha256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_CONSUMPTION_INVALID');
  analysisSha256(receipt.analysisRequestSha256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_REQUEST_INVALID');
  analysisSha256(receipt.engineOutputSha256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_OUTPUT_INVALID');
  analysisText(receipt.engineVersion, 256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_ENGINE_INVALID');
  const frameMap = receipt.frameMap as unknown as Record<string, unknown>[];
  for (let index = 0; index < frameMap.length; index += 1) {
    assertFrameMapEntry(frameMap[index], samplePlan.samples[index]!.timelineFrame, index);
  }
  for (const observation of receipt.observations as unknown[]) {
    assertObservation(observation, frameMap, expected.timelineEndExclusiveFrame);
  }
  const receiptSha256 = analysisSha256(
    receipt.receiptSha256,
    'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_RECEIPT_HASH_INVALID',
  );
  const { receiptSha256: _receiptSha256, ...material } = receipt;
  if (receiptSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_RECEIPT_HASH_MISMATCH');
  }
  return receipt as unknown as NativeMediaTimestampAnalysisReceiptV1;
}

function assertFrameMapEntry(value: unknown, expectedFrame: string, index: number): void {
  const frame = analysisObjectRecord(value, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_FRAME_INVALID');
  analysisExactKeys(frame, [
    'decodedPictureContentSha256', 'decoderPictureRequestSha256', 'epochId',
    'height', 'pictureHandle', 'pngByteLength', 'pngContentSha256',
    'presentationTimestampTicks', 'sampleIndex', 'selection',
    'sourceFrameOrdinal', 'timelineFrame', 'width',
  ], 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_FRAME_FIELDS_INVALID');
  if (frame.sampleIndex !== index
    || analysisNonNegativeIntegerText(frame.timelineFrame, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_FRAME_TIME_INVALID') !== expectedFrame
    || !['COVERING_PRESENTATION', 'NEAREST_PREVIOUS', 'NEAREST_NEXT'].includes(String(frame.selection))) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_FRAME_SCOPE_MISMATCH');
  }
  analysisSha256(frame.decoderPictureRequestSha256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_FRAME_REQUEST_INVALID');
  analysisNonNegativeIntegerText(frame.sourceFrameOrdinal, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_FRAME_ORDINAL_INVALID');
  analysisText(frame.epochId, 256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_FRAME_EPOCH_INVALID');
  analysisIntegerText(frame.presentationTimestampTicks, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_FRAME_PTS_INVALID');
  analysisText(frame.pictureHandle, 1024, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_FRAME_HANDLE_INVALID');
  analysisSha256(frame.decodedPictureContentSha256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_FRAME_CONTENT_INVALID');
  analysisSha256(frame.pngContentSha256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_FRAME_PNG_INVALID');
  analysisPositiveInteger(frame.pngByteLength, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_FRAME_BYTES_INVALID');
  analysisPositiveInteger(frame.width, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_FRAME_GEOMETRY_INVALID');
  analysisPositiveInteger(frame.height, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_FRAME_GEOMETRY_INVALID');
}

function assertObservation(
  value: unknown,
  frameMap: readonly Record<string, unknown>[],
  timelineEndExclusiveFrame: string,
): void {
  const observation = analysisObjectRecord(value, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_OBSERVATION_INVALID');
  const signal = analysisText(observation.signal, 64, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_OBSERVATION_INVALID');
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(signal)) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_OBSERVATION_INVALID');
  }
  analysisText(observation.detail, 2048, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_OBSERVATION_INVALID');
  if (observation.kind === 'GLOBAL') {
    analysisExactKeys(observation, [
      'coordinateDisposition', 'detail', 'kind', 'signal',
    ], 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_OBSERVATION_FIELDS_INVALID');
    if (observation.coordinateDisposition !== 'NO_RANGE_COORDINATE') {
      throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_OBSERVATION_INVALID');
    }
    return;
  }
  if (observation.kind === 'POINT') {
    analysisExactKeys(observation, [
      'detail', 'kind', 'sampleIndex', 'signal', 'timelineFrame',
    ], 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_OBSERVATION_FIELDS_INVALID');
    const index = observationIndex(observation.sampleIndex, frameMap.length, false);
    if (observation.timelineFrame !== frameMap[index]!.timelineFrame) {
      throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_OBSERVATION_SCOPE_MISMATCH');
    }
    return;
  }
  if (observation.kind === 'RANGE') {
    analysisExactKeys(observation, [
      'detail', 'endExclusiveSampleIndex', 'kind', 'signal',
      'startSampleIndex', 'timelineEndExclusiveFrame', 'timelineStartFrame',
    ], 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_OBSERVATION_FIELDS_INVALID');
    const start = observationIndex(observation.startSampleIndex, frameMap.length, false);
    const end = observationIndex(observation.endExclusiveSampleIndex, frameMap.length, true);
    const expectedEnd = end === frameMap.length
      ? timelineEndExclusiveFrame
      : String(frameMap[end]!.timelineFrame);
    if (start >= end
      || observation.timelineStartFrame !== frameMap[start]!.timelineFrame
      || observation.timelineEndExclusiveFrame !== expectedEnd) {
      throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_OBSERVATION_SCOPE_MISMATCH');
    }
    return;
  }
  throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_OBSERVATION_INVALID');
}

function normalizeExpectedScope(expected: Readonly<{
  projectId: string;
  sequenceId: string;
  overlayId: string;
  projectRevision: ProjectRevisionV1;
  timelineStartFrame: string;
  timelineEndExclusiveFrame: string;
}>) {
  return {
    projectId: analysisText(expected.projectId, 256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_EXPECTED_SCOPE_INVALID'),
    sequenceId: analysisText(expected.sequenceId, 256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_EXPECTED_SCOPE_INVALID'),
    overlayId: analysisText(expected.overlayId, 256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_EXPECTED_SCOPE_INVALID'),
    projectRevision: analysisProjectRevision(expected.projectRevision),
    timelineStartFrame: analysisNonNegativeIntegerText(expected.timelineStartFrame, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_EXPECTED_SCOPE_INVALID'),
    timelineEndExclusiveFrame: analysisNonNegativeIntegerText(expected.timelineEndExclusiveFrame, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_EXPECTED_SCOPE_INVALID'),
  };
}

function observationIndex(value: unknown, count: number, boundary: boolean): number {
  if (!Number.isSafeInteger(value)
    || Number(value) < (boundary ? 1 : 0)
    || Number(value) > (boundary ? count : count - 1)) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_OBSERVATION_INDEX_INVALID');
  }
  return Number(value);
}
