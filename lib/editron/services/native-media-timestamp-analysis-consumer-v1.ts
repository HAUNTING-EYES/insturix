import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  assertNativeMediaTimestampAnalysisEngineOutputV1,
  createNativeMediaTimestampAnalysisRequestV1,
  type NativeMediaTimestampAnalysisEngineObservationV1,
  type NativeMediaTimestampAnalysisEnginePortV1,
  type NativeMediaTimestampAnalysisFrameV1,
} from './native-media-timestamp-analysis-contract-v1';
import {
  projectServiceNativeMediaProjectRevisionReaderV1,
  type NativeMediaProjectRevisionReaderPortV1,
  type NativeMediaTimestampConsumptionReceiptV1,
  type NativeMediaTimestampDecoderReleasePortV1,
} from './native-media-timestamp-consumer-v1';
import {
  analysisIntegerText as integerText,
  analysisSameRevision as sameRevision,
  analysisText as text,
  assertNativeMediaTimestampAnalysisSurfaceScopeV1,
  assertNativeMediaTimestampConsumptionReceiptForAnalysisV1,
  freezeNativeMediaTimestampAnalysisV1 as frozen,
} from './native-media-timestamp-analysis-validation-v1';
import type { NativeMediaTimestampPreviewSurfaceReaderPortV1 } from './native-media-timestamp-r2-preview-surface-v1';
import type { ProjectRevisionV1 } from './project-service';

export const NATIVE_MEDIA_TIMESTAMP_ANALYSIS_RECEIPT_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_ANALYSIS_RECEIPT_V1' as const;

export type NativeMediaTimestampAnalysisConsumerPolicyV1 = Readonly<{
  policyVersion: string; maxSampleFrames: number;
  maxSinglePngBytes: number; maxTotalPngBytes: number;
}>;

export type NativeMediaTimestampAnalysisReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_TIMESTAMP_ANALYSIS_RECEIPT_KIND_V1;
  projectId: string;
  sequenceId: string;
  overlayId: string;
  projectRevision: ProjectRevisionV1;
  sourceVersionSha256: string;
  storageVersionSha256: string;
  transformSha256: string;
  consumptionReceiptSha256: string;
  analysisRequestSha256: string;
  engineVersion: string;
  engineOutputSha256: string;
  frameMap: readonly Omit<NativeMediaTimestampAnalysisFrameV1, 'pngBase64'>[];
  observations: readonly MappedObservationV1[];
  receiptSha256: string;
}>;

type MappedObservationV1 = Readonly<
  | ({ kind: 'POINT'; timelineFrame: string } & NativeMediaTimestampAnalysisEngineObservationV1)
  | ({
      kind: 'RANGE';
      timelineStartFrame: string;
      timelineEndExclusiveFrame: string;
    } & NativeMediaTimestampAnalysisEngineObservationV1)
  | ({
      kind: 'GLOBAL';
      coordinateDisposition: 'NO_RANGE_COORDINATE';
    } & NativeMediaTimestampAnalysisEngineObservationV1)
>;

export type NativeMediaTimestampAnalysisResultV1 = Readonly<
  | { disposition: 'ANALYZED'; receipt: NativeMediaTimestampAnalysisReceiptV1 }
  | {
      disposition: 'UNVERIFIABLE';
      reason: 'INPUT_INVALID' | 'PROJECT_REVISION_UNAVAILABLE'
        | 'PROJECT_REVISION_STALE' | 'SURFACE_UNAVAILABLE' | 'SURFACE_EXPIRED'
        | 'SURFACE_SCOPE_MISMATCH' | 'RESOURCE_LIMIT_EXCEEDED' | 'ENGINE_FAILED'
        | 'ENGINE_OUTPUT_INVALID' | 'CLEANUP_FAILED';
      diagnostic: string | null;
    }
>;

export async function analyzeNativeMediaTimestampReceiptV1(input: Readonly<{
  userId: string;
  receipt: NativeMediaTimestampConsumptionReceiptV1;
  timelineEndExclusiveFrame: string;
  policy: NativeMediaTimestampAnalysisConsumerPolicyV1;
  pictureReader: NativeMediaTimestampPreviewSurfaceReaderPortV1;
  engine: NativeMediaTimestampAnalysisEnginePortV1;
  decoderRelease: NativeMediaTimestampDecoderReleasePortV1;
  projectRevisionReader?: NativeMediaProjectRevisionReaderPortV1;
}>): Promise<NativeMediaTimestampAnalysisResultV1> {
  let userId: string;
  let receipt: NativeMediaTimestampConsumptionReceiptV1;
  let timelineEndExclusiveFrame: string;
  let policy: NativeMediaTimestampAnalysisConsumerPolicyV1;
  try {
    userId = text(input.userId, 256, 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_USER_INVALID');
    receipt = assertNativeMediaTimestampConsumptionReceiptForAnalysisV1(input.receipt);
    timelineEndExclusiveFrame = integerText(
      input.timelineEndExclusiveFrame,
      'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_INTEGER_INVALID',
    );
    policy = normalizePolicy(input.policy);
    if (receipt.timelinePictures.length > policy.maxSampleFrames
      || BigInt(timelineEndExclusiveFrame)
        <= BigInt(receipt.timelinePictures.at(-1)!.timelineFrame)) {
      throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_RANGE_INVALID');
    }
  } catch (error) {
    return unverifiable('INPUT_INVALID', diagnostic(error));
  }
  if (!input.decoderRelease || typeof input.decoderRelease.releaseDecodedBatch !== 'function') {
    return unverifiable('INPUT_INVALID', 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_PORT_INVALID');
  }
  const finish = async (result: NativeMediaTimestampAnalysisResultV1) => {
    try {
      await input.decoderRelease.releaseDecodedBatch(receipt.decoderRequestSha256);
      return result;
    } catch {
      return unverifiable('CLEANUP_FAILED', null);
    }
  };
  if (!input.pictureReader || typeof input.pictureReader.readPicture !== 'function'
    || !input.engine || typeof input.engine.analyze !== 'function'
    || (input.projectRevisionReader
      && typeof input.projectRevisionReader.getProjectRevision !== 'function')) {
    return finish(unverifiable('INPUT_INVALID', 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_PORT_INVALID'));
  }
  const revisionReader = input.projectRevisionReader
    ?? projectServiceNativeMediaProjectRevisionReaderV1;
  const before = await readRevision(revisionReader, userId, receipt.projectId);
  if (before === null) return finish(unverifiable('PROJECT_REVISION_UNAVAILABLE', null));
  if (!sameRevision(before, receipt.projectRevision)) {
    return finish(unverifiable('PROJECT_REVISION_STALE', null));
  }

  let frames: readonly NativeMediaTimestampAnalysisFrameV1[];
  try {
    frames = await readAnalysisFrames(userId, receipt, input.pictureReader, policy);
  } catch (error) {
    const code = diagnostic(error);
    const reason = code === 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_SURFACE_EXPIRED'
      ? 'SURFACE_EXPIRED'
      : code?.includes('RESOURCE_LIMIT')
        ? 'RESOURCE_LIMIT_EXCEEDED'
        : code?.includes('SCOPE') || code?.includes('MISMATCH')
          ? 'SURFACE_SCOPE_MISMATCH'
          : 'SURFACE_UNAVAILABLE';
    return finish(unverifiable(reason, code));
  }
  let request: ReturnType<typeof createNativeMediaTimestampAnalysisRequestV1>;
  try {
    request = createNativeMediaTimestampAnalysisRequestV1({
      projectId: receipt.projectId,
      sequenceId: receipt.sequenceId,
      overlayId: receipt.overlayId,
      projectRevision: receipt.projectRevision,
      consumptionReceiptSha256: receipt.receiptSha256,
      timelineEndExclusiveFrame,
      frames,
    });
  } catch (error) {
    return finish(unverifiable('INPUT_INVALID', diagnostic(error)));
  }

  let rawOutput: unknown;
  try {
    rawOutput = await input.engine.analyze(request);
  } catch (error) {
    return finish(unverifiable('ENGINE_FAILED', diagnostic(error)));
  }
  let output: ReturnType<typeof assertNativeMediaTimestampAnalysisEngineOutputV1>;
  try {
    output = assertNativeMediaTimestampAnalysisEngineOutputV1(rawOutput, {
      analysisRequestSha256: request.analysisRequestSha256,
      frameCount: request.frames.length,
    });
  } catch (error) {
    return finish(unverifiable('ENGINE_OUTPUT_INVALID', diagnostic(error)));
  }
  const after = await readRevision(revisionReader, userId, receipt.projectId);
  if (after === null) return finish(unverifiable('PROJECT_REVISION_UNAVAILABLE', null));
  if (!sameRevision(after, receipt.projectRevision)) {
    return finish(unverifiable('PROJECT_REVISION_STALE', null));
  }
  const frameMap = request.frames.map(({ pngBase64: _pngBase64, ...frame }) => frame);
  const observations = output.observations.map((observation) => (
    mapObservation(observation, frameMap, timelineEndExclusiveFrame)
  ));
  const material = {
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_ANALYSIS_RECEIPT_KIND_V1,
    projectId: receipt.projectId,
    sequenceId: receipt.sequenceId,
    overlayId: receipt.overlayId,
    projectRevision: receipt.projectRevision,
    sourceVersionSha256: receipt.sourceVersionSha256,
    storageVersionSha256: receipt.storageVersionSha256,
    transformSha256: receipt.transformSha256,
    consumptionReceiptSha256: receipt.receiptSha256,
    analysisRequestSha256: request.analysisRequestSha256,
    engineVersion: output.engineVersion,
    engineOutputSha256: output.outputSha256,
    frameMap,
    observations,
  };
  return finish(frozen({
    disposition: 'ANALYZED' as const,
    receipt: { ...material, receiptSha256: hashEditronCanonicalJsonV1(material) },
  }));
}

async function readAnalysisFrames(
  userId: string,
  receipt: NativeMediaTimestampConsumptionReceiptV1,
  reader: NativeMediaTimestampPreviewSurfaceReaderPortV1,
  policy: NativeMediaTimestampAnalysisConsumerPolicyV1,
) {
  const decodedByRequest = new Map(
    receipt.decodedPictures.map((picture) => [picture.decoderPictureRequestSha256, picture]),
  );
  const surfaceByHandle = new Map<string, Extract<
    Awaited<ReturnType<typeof reader.readPicture>>, { disposition: 'AVAILABLE' }
  >>();
  let totalPngBytes = 0;
  const frames: NativeMediaTimestampAnalysisFrameV1[] = [];
  for (let sampleIndex = 0; sampleIndex < receipt.timelinePictures.length; sampleIndex += 1) {
    const timeline = receipt.timelinePictures[sampleIndex]!;
    const decoded = decodedByRequest.get(timeline.decoderPictureRequestSha256);
    if (!decoded || decoded.pictureHandle !== timeline.pictureHandle
      || decoded.decodedPictureContentSha256 !== timeline.decodedPictureContentSha256) {
      throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_RECEIPT_SCOPE_MISMATCH');
    }
    let surface = surfaceByHandle.get(decoded.pictureHandle);
    if (!surface) {
      const result = await reader.readPicture(decoded.pictureHandle);
      if (result.disposition === 'EXPIRED') throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_SURFACE_EXPIRED');
      if (result.disposition !== 'AVAILABLE') throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_SURFACE_UNAVAILABLE');
      if (result.pngBytes.byteLength > policy.maxSinglePngBytes
        || result.pngBytes.byteLength > policy.maxTotalPngBytes - totalPngBytes) {
        throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_RESOURCE_LIMIT_EXCEEDED');
      }
      totalPngBytes += result.pngBytes.byteLength;
      surface = result;
      surfaceByHandle.set(decoded.pictureHandle, result);
    }
    assertNativeMediaTimestampAnalysisSurfaceScopeV1({ surface, userId, receipt, decoded });
    frames.push({
      sampleIndex,
      timelineFrame: timeline.timelineFrame,
      decoderPictureRequestSha256: timeline.decoderPictureRequestSha256,
      sourceFrameOrdinal: timeline.sourceFrameOrdinal,
      epochId: timeline.epochId,
      presentationTimestampTicks: timeline.presentationTimestampTicks,
      selection: timeline.selection,
      pictureHandle: timeline.pictureHandle,
      decodedPictureContentSha256: timeline.decodedPictureContentSha256,
      pngContentSha256: surface.binding.pngContentSha256,
      pngByteLength: surface.binding.pngByteLength,
      width: surface.binding.width,
      height: surface.binding.height,
      pngBase64: Buffer.from(surface.pngBytes).toString('base64'),
    });
  }
  return frames;
}

function mapObservation(
  observation: NativeMediaTimestampAnalysisEngineObservationV1,
  frames: NativeMediaTimestampAnalysisReceiptV1['frameMap'],
  timelineEndExclusiveFrame: string,
): MappedObservationV1 {
  if (observation.kind === 'GLOBAL') {
    return { ...observation, coordinateDisposition: 'NO_RANGE_COORDINATE' };
  }
  if (observation.kind === 'POINT') {
    return { ...observation, timelineFrame: frames[observation.sampleIndex]!.timelineFrame };
  }
  return {
    ...observation,
    timelineStartFrame: frames[observation.startSampleIndex]!.timelineFrame,
    timelineEndExclusiveFrame: observation.endExclusiveSampleIndex === frames.length
      ? timelineEndExclusiveFrame
      : frames[observation.endExclusiveSampleIndex]!.timelineFrame,
  };
}

async function readRevision(reader: NativeMediaProjectRevisionReaderPortV1, userId: string, projectId: string) {
  try { return await reader.getProjectRevision(userId, projectId); } catch { return null; }
}
function normalizePolicy(value: NativeMediaTimestampAnalysisConsumerPolicyV1) {
  const positive = (candidate: number) => Number.isSafeInteger(candidate) && candidate > 0;
  if (!value || !value.policyVersion?.trim() || !positive(value.maxSampleFrames)
    || !positive(value.maxSinglePngBytes) || !positive(value.maxTotalPngBytes)
    || value.maxSinglePngBytes > value.maxTotalPngBytes || value.maxSampleFrames > 10_000) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_POLICY_INVALID');
  }
  return { ...value, policyVersion: value.policyVersion.trim() };
}
function diagnostic(error: unknown): string | null {
  return error instanceof Error && /^[A-Z0-9_]{1,160}$/.test(error.message) ? error.message : null;
}
function unverifiable(reason: Extract<NativeMediaTimestampAnalysisResultV1, { disposition: 'UNVERIFIABLE' }>['reason'], diagnosticValue: string | null): NativeMediaTimestampAnalysisResultV1 {
  return frozen({ disposition: 'UNVERIFIABLE' as const, reason, diagnostic: diagnosticValue });
}
