import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  analysisDigest as digest,
  analysisExactKeys as exactKeys,
  analysisIntegerText as integerText,
  analysisNonNegativeIntegerText as nonNegativeIntegerText,
  analysisObjectRecord as objectRecord,
  analysisPositiveInteger as positiveInteger,
  analysisProjectRevision as revision,
  analysisSha256 as sha256,
  analysisText as text,
  freezeNativeMediaTimestampAnalysisV1 as frozen,
} from './native-media-timestamp-analysis-validation-v1';
import type { ProjectRevisionV1 } from './project-service';

export const NATIVE_MEDIA_TIMESTAMP_ANALYSIS_REQUEST_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_ANALYSIS_REQUEST_V1' as const;
export const NATIVE_MEDIA_TIMESTAMP_ANALYSIS_OUTPUT_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_ANALYSIS_OUTPUT_V1' as const;
export const NATIVE_MEDIA_TIMESTAMP_ANALYSIS_REQUEST_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_ANALYSIS_REQUEST_V1' as const;

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SELECTIONS = new Set([
  'COVERING_PRESENTATION', 'NEAREST_PREVIOUS', 'NEAREST_NEXT',
]);

export type NativeMediaTimestampAnalysisFrameV1 = Readonly<{
  sampleIndex: number;
  timelineFrame: string;
  decoderPictureRequestSha256: string;
  sourceFrameOrdinal: string;
  epochId: string;
  presentationTimestampTicks: string;
  selection: 'COVERING_PRESENTATION' | 'NEAREST_PREVIOUS' | 'NEAREST_NEXT';
  pictureHandle: string;
  decodedPictureContentSha256: string;
  pngContentSha256: string;
  pngByteLength: number;
  width: number;
  height: number;
  pngBase64: string;
}>;

export type NativeMediaTimestampAnalysisRequestV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_TIMESTAMP_ANALYSIS_REQUEST_KIND_V1;
  requestVersion: typeof NATIVE_MEDIA_TIMESTAMP_ANALYSIS_REQUEST_VERSION_V1;
  projectId: string;
  sequenceId: string;
  overlayId: string;
  projectRevision: ProjectRevisionV1;
  consumptionReceiptSha256: string;
  timelineEndExclusiveFrame: string;
  frames: readonly NativeMediaTimestampAnalysisFrameV1[];
  analysisRequestSha256: string;
}>;

export type NativeMediaTimestampAnalysisEngineObservationV1 = Readonly<
  | { kind: 'POINT'; sampleIndex: number; signal: string; detail: string }
  | {
      kind: 'RANGE';
      startSampleIndex: number;
      endExclusiveSampleIndex: number;
      signal: string;
      detail: string;
    }
  | { kind: 'GLOBAL'; signal: string; detail: string }
>;

export type NativeMediaTimestampAnalysisEngineOutputV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_TIMESTAMP_ANALYSIS_OUTPUT_KIND_V1;
  engineVersion: string;
  analysisRequestSha256: string;
  observations: readonly NativeMediaTimestampAnalysisEngineObservationV1[];
  outputSha256: string;
}>;

export interface NativeMediaTimestampAnalysisEnginePortV1 {
  analyze(request: NativeMediaTimestampAnalysisRequestV1): Promise<unknown>;
}

export function createNativeMediaTimestampAnalysisRequestV1(input: Readonly<{
  projectId: string;
  sequenceId: string;
  overlayId: string;
  projectRevision: ProjectRevisionV1;
  consumptionReceiptSha256: string;
  timelineEndExclusiveFrame: string;
  frames: readonly NativeMediaTimestampAnalysisFrameV1[];
}>): NativeMediaTimestampAnalysisRequestV1 {
  const material = normalizeRequestMaterial(input);
  return frozen({
    ...material,
    analysisRequestSha256: hashEditronCanonicalJsonV1(requestHashMaterial(material)),
  });
}

export function assertNativeMediaTimestampAnalysisRequestV1(
  value: unknown,
): NativeMediaTimestampAnalysisRequestV1 {
  const record = objectRecord(value, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_REQUEST_INVALID');
  exactKeys(record, [
    'analysisRequestSha256', 'consumptionReceiptSha256', 'frames', 'kind',
    'overlayId', 'projectId', 'projectRevision', 'requestVersion', 'schemaVersion',
    'sequenceId', 'timelineEndExclusiveFrame',
  ], 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_REQUEST_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== NATIVE_MEDIA_TIMESTAMP_ANALYSIS_REQUEST_KIND_V1
    || record.requestVersion !== NATIVE_MEDIA_TIMESTAMP_ANALYSIS_REQUEST_VERSION_V1
    || !Array.isArray(record.frames)) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_REQUEST_INVALID');
  }
  const material = normalizeRequestMaterial({
    projectId: record.projectId as string,
    sequenceId: record.sequenceId as string,
    overlayId: record.overlayId as string,
    projectRevision: record.projectRevision as ProjectRevisionV1,
    consumptionReceiptSha256: record.consumptionReceiptSha256 as string,
    timelineEndExclusiveFrame: record.timelineEndExclusiveFrame as string,
    frames: record.frames as NativeMediaTimestampAnalysisFrameV1[],
  });
  if (sha256(record.analysisRequestSha256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_REQUEST_HASH_INVALID')
    !== hashEditronCanonicalJsonV1(requestHashMaterial(material))) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_REQUEST_HASH_MISMATCH');
  }
  return frozen({ ...material, analysisRequestSha256: record.analysisRequestSha256 as string });
}

export function createNativeMediaTimestampAnalysisEngineOutputV1(input: Readonly<{
  engineVersion: string;
  analysisRequestSha256: string;
  frameCount: number;
  observations: readonly NativeMediaTimestampAnalysisEngineObservationV1[];
}>): NativeMediaTimestampAnalysisEngineOutputV1 {
  const material = normalizeOutputMaterial(input);
  return frozen({ ...material, outputSha256: hashEditronCanonicalJsonV1(material) });
}

export function assertNativeMediaTimestampAnalysisEngineOutputV1(
  value: unknown,
  expected: Readonly<{ analysisRequestSha256: string; frameCount: number }>,
): NativeMediaTimestampAnalysisEngineOutputV1 {
  const record = objectRecord(value, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_OUTPUT_INVALID');
  exactKeys(record, [
    'analysisRequestSha256', 'engineVersion', 'kind', 'observations',
    'outputSha256', 'schemaVersion',
  ], 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_OUTPUT_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== NATIVE_MEDIA_TIMESTAMP_ANALYSIS_OUTPUT_KIND_V1
    || !Array.isArray(record.observations)) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_OUTPUT_INVALID');
  }
  const material = normalizeOutputMaterial({
    engineVersion: record.engineVersion as string,
    analysisRequestSha256: record.analysisRequestSha256 as string,
    frameCount: expected.frameCount,
    observations: record.observations as NativeMediaTimestampAnalysisEngineObservationV1[],
  });
  if (material.analysisRequestSha256 !== expected.analysisRequestSha256
    || sha256(record.outputSha256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_OUTPUT_HASH_INVALID')
      !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_OUTPUT_SCOPE_MISMATCH');
  }
  return frozen({ ...material, outputSha256: record.outputSha256 as string });
}

function normalizeRequestMaterial(input: Readonly<{
  projectId: string; sequenceId: string; overlayId: string;
  projectRevision: ProjectRevisionV1; consumptionReceiptSha256: string;
  timelineEndExclusiveFrame: string; frames: readonly NativeMediaTimestampAnalysisFrameV1[];
}>) {
  if (!Array.isArray(input.frames) || input.frames.length < 1) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_FRAMES_INVALID');
  }
  const frames = input.frames.map((frame, index) => normalizeFrame(frame, index));
  for (let index = 1; index < frames.length; index += 1) {
    if (BigInt(frames[index - 1]!.timelineFrame) >= BigInt(frames[index]!.timelineFrame)) {
      throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_FRAME_ORDER_INVALID');
    }
  }
  const timelineEndExclusiveFrame = integerText(
    input.timelineEndExclusiveFrame,
    'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_END_INVALID',
  );
  if (BigInt(timelineEndExclusiveFrame) <= BigInt(frames.at(-1)!.timelineFrame)) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_END_INVALID');
  }
  return {
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_ANALYSIS_REQUEST_KIND_V1,
    requestVersion: NATIVE_MEDIA_TIMESTAMP_ANALYSIS_REQUEST_VERSION_V1,
    projectId: text(input.projectId, 256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_PROJECT_INVALID'),
    sequenceId: text(input.sequenceId, 256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_SEQUENCE_INVALID'),
    overlayId: text(input.overlayId, 256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_OVERLAY_INVALID'),
    projectRevision: revision(input.projectRevision),
    consumptionReceiptSha256: sha256(input.consumptionReceiptSha256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_RECEIPT_INVALID'),
    timelineEndExclusiveFrame,
    frames,
  };
}

function normalizeFrame(value: NativeMediaTimestampAnalysisFrameV1, index: number) {
  const bytes = canonicalBase64(value.pngBase64);
  if (value.sampleIndex !== index || !Number.isSafeInteger(value.pngByteLength)
    || value.pngByteLength < PNG_SIGNATURE.length || bytes.byteLength !== value.pngByteLength
    || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
    || digest(bytes) !== value.pngContentSha256) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_FRAME_CONTENT_INVALID');
  }
  if (!SELECTIONS.has(value.selection)) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_FRAME_SELECTION_INVALID');
  }
  return {
    sampleIndex: index,
    timelineFrame: integerText(value.timelineFrame, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_FRAME_TIME_INVALID'),
    decoderPictureRequestSha256: sha256(value.decoderPictureRequestSha256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_FRAME_REQUEST_INVALID'),
    sourceFrameOrdinal: nonNegativeIntegerText(value.sourceFrameOrdinal, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_FRAME_ORDINAL_INVALID'),
    epochId: text(value.epochId, 256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_FRAME_EPOCH_INVALID'),
    presentationTimestampTicks: integerText(value.presentationTimestampTicks, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_FRAME_PTS_INVALID'),
    selection: value.selection,
    pictureHandle: text(value.pictureHandle, 1024, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_FRAME_HANDLE_INVALID'),
    decodedPictureContentSha256: sha256(value.decodedPictureContentSha256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_FRAME_DECODED_INVALID'),
    pngContentSha256: sha256(value.pngContentSha256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_FRAME_PNG_INVALID'),
    pngByteLength: value.pngByteLength,
    width: positiveInteger(value.width, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_FRAME_WIDTH_INVALID'),
    height: positiveInteger(value.height, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_FRAME_HEIGHT_INVALID'),
    pngBase64: bytes.toString('base64'),
  } as NativeMediaTimestampAnalysisFrameV1;
}

function requestHashMaterial(value: ReturnType<typeof normalizeRequestMaterial>) {
  return {
    ...value,
    frames: value.frames.map(({ pngBase64: _pngBase64, ...frame }) => frame),
  };
}

function normalizeOutputMaterial(input: Readonly<{
  engineVersion: string; analysisRequestSha256: string; frameCount: number;
  observations: readonly NativeMediaTimestampAnalysisEngineObservationV1[];
}>) {
  if (!Number.isSafeInteger(input.frameCount) || input.frameCount < 1
    || !Array.isArray(input.observations) || input.observations.length > 4096) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_OUTPUT_INVALID');
  }
  return {
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_ANALYSIS_OUTPUT_KIND_V1,
    engineVersion: text(input.engineVersion, 256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_ENGINE_INVALID'),
    analysisRequestSha256: sha256(input.analysisRequestSha256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_OUTPUT_REQUEST_INVALID'),
    observations: input.observations.map((value) => normalizeObservation(value, input.frameCount)),
  };
}

function normalizeObservation(value: NativeMediaTimestampAnalysisEngineObservationV1, frameCount: number) {
  const common = {
    signal: signal(value.signal),
    detail: text(value.detail, 2048, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_OBSERVATION_DETAIL_INVALID'),
  };
  if (value.kind === 'GLOBAL') return { kind: 'GLOBAL' as const, ...common };
  if (value.kind === 'POINT') {
    return { kind: 'POINT' as const, sampleIndex: index(value.sampleIndex, frameCount), ...common };
  }
  if (value.kind === 'RANGE') {
    const start = index(value.startSampleIndex, frameCount);
    const end = boundary(value.endExclusiveSampleIndex, frameCount);
    if (start >= end) throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_OBSERVATION_RANGE_INVALID');
    return { kind: 'RANGE' as const, startSampleIndex: start, endExclusiveSampleIndex: end, ...common };
  }
  throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_OBSERVATION_KIND_INVALID');
}

function canonicalBase64(value: unknown): Buffer {
  if (typeof value !== 'string' || value.length < 1) throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_FRAME_BASE64_INVALID');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_FRAME_BASE64_INVALID');
  return bytes;
}
function signal(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(value)) throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_SIGNAL_INVALID');
  return value;
}
function index(value: unknown, count: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) >= count) throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_OBSERVATION_INDEX_INVALID');
  return Number(value);
}
function boundary(value: unknown, count: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > count) throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_OBSERVATION_INDEX_INVALID');
  return Number(value);
}
