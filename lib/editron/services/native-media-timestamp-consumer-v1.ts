import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import type { MediaSourcePtsCadenceMapAssetStateInputV3 } from './media-source-pts-cadence-map-asset-owner-v3';
import {
  assertMediaSourceVersionV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';
import type { ProjectRevisionV1 } from './project-service';
import {
  assertVideoSourceTimestampConformV3,
  resolveVerifiedVideoSourceEpochTimeBindingV3,
  type VideoSourceTimestampConformV3,
} from './video-source-time-transform-v1';

export const NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_V1' as const;
export const NATIVE_MEDIA_TIMESTAMP_DECODER_BATCH_REQUEST_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_DECODER_BATCH_REQUEST_V1' as const;
export const NATIVE_MEDIA_TIMESTAMP_DECODER_BATCH_OUTPUT_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_DECODER_BATCH_OUTPUT_V1' as const;
export const NATIVE_MEDIA_TIMESTAMP_CONSUMPTION_RECEIPT_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_CONSUMPTION_RECEIPT_V1' as const;
export const NATIVE_MEDIA_TIMESTAMP_AUDIO_OWNERSHIP_V1 =
  'SEPARATE_NATIVE_SAMPLE_DOMAIN_V1' as const;
export const NATIVE_MEDIA_TIMESTAMP_ABSOLUTE_MAX_UNIQUE_PICTURES_V1 = 100_000;
export const NATIVE_MEDIA_TIMESTAMP_ABSOLUTE_MAX_DECODED_BYTES_V1 = 16 * 1024 * 1024 * 1024;
export const NATIVE_MEDIA_TIMESTAMP_ABSOLUTE_MAX_DIMENSION_V1 = 32_768;

const PIXEL_FORMATS_V1 = new Set<NativeMediaDecodedPictureV1['pixelFormat']>([
  'I420', 'I420A', 'I420P10', 'I422', 'I422P10', 'I444', 'I444P10',
  'NV12', 'P010', 'RGBA', 'RGBX', 'BGRA', 'BGRX',
]);

export type NativeMediaTimestampDecoderResourcePolicyV1 = Readonly<{
  policyVersion: string;
  maxUniquePictures: number;
  maxDecodedBytes: number;
  maxCodedDimension: number;
  maxDisplayDimension: number;
}>;

export type NativeMediaTimestampDecoderPictureRequestV1 = Readonly<{
  sourceFrameOrdinal: string;
  epochId: string;
  presentationTimestampTicks: string;
  decoderPictureRequestSha256: string;
}>;

export type NativeMediaTimestampDecoderBatchRequestV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_TIMESTAMP_DECODER_BATCH_REQUEST_KIND_V1;
  decoderPortVersion: typeof NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_VERSION_V1;
  sourceVersion: Readonly<MediaSourceVersionV1>;
  streamId: string;
  videoStreamIndex: number;
  pictureRequests: readonly NativeMediaTimestampDecoderPictureRequestV1[];
  resourcePolicy: NativeMediaTimestampDecoderResourcePolicyV1;
  decoderRequestSha256: string;
}>;

export type NativeMediaDecodedPictureV1 = Readonly<{
  decoderPictureRequestSha256: string;
  sourceVersionSha256: string;
  storageVersionSha256: string;
  streamId: string;
  sourceFrameOrdinal: string;
  epochId: string;
  presentationTimestampTicks: string;
  pictureHandle: string;
  decodedPictureContentSha256: string;
  decodedByteLength: number;
  codedWidth: number;
  codedHeight: number;
  displayWidth: number;
  displayHeight: number;
  rotationDegrees: 0 | 90 | 180 | 270;
  pixelFormat:
    | 'I420'
    | 'I420A'
    | 'I420P10'
    | 'I422'
    | 'I422P10'
    | 'I444'
    | 'I444P10'
    | 'NV12'
    | 'P010'
    | 'RGBA'
    | 'RGBX'
    | 'BGRA'
    | 'BGRX';
  colorSpace: Readonly<{
    primaries: string | null;
    transfer: string | null;
    matrix: string | null;
    fullRange: boolean | null;
  }>;
}>;

export type NativeMediaTimestampDecoderBatchOutputV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_TIMESTAMP_DECODER_BATCH_OUTPUT_KIND_V1;
  decoderPortVersion: typeof NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_VERSION_V1;
  decoderRequestSha256: string;
  pictures: readonly NativeMediaDecodedPictureV1[];
}>;

export interface NativeMediaTimestampDecoderPortV1 {
  decodePictures(
    request: NativeMediaTimestampDecoderBatchRequestV1,
  ): Promise<NativeMediaTimestampDecoderBatchOutputV1>;
}

export interface NativeMediaTimestampDecoderReleasePortV1 {
  /** Idempotently removes every materialized picture for one decoder batch. */
  releaseDecodedBatch(decoderRequestSha256: string): Promise<void>;
}

export type NativeMediaTimestampMaterializingDecoderV1 =
  NativeMediaTimestampDecoderPortV1 & NativeMediaTimestampDecoderReleasePortV1;

export interface NativeMediaProjectRevisionReaderPortV1 {
  getProjectRevision(userId: string, projectId: string): Promise<ProjectRevisionV1>;
}

export const projectServiceNativeMediaProjectRevisionReaderV1:
NativeMediaProjectRevisionReaderPortV1 = {
  async getProjectRevision(userId, projectId) {
    const { projectService } = await import('./project-service');
    return projectService.getProjectRevision(userId, projectId);
  },
};

export type NativeMediaTimestampConsumptionReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_TIMESTAMP_CONSUMPTION_RECEIPT_KIND_V1;
  consumerVersion: typeof NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_VERSION_V1;
  projectId: string;
  sequenceId: string;
  overlayId: string;
  projectRevision: ProjectRevisionV1;
  assetId: string;
  sourceVersionSha256: string;
  storageVersionSha256: string;
  sourceBindingSha256: string;
  transformSha256: string;
  decoderRequestSha256: string;
  audioOwnership: Readonly<{
    kind: typeof NATIVE_MEDIA_TIMESTAMP_AUDIO_OWNERSHIP_V1;
    disposition: 'EXACT_SAMPLE_MAPPING_BOUND' | 'NO_AUDIO_MAPPING_REQUESTED';
    audioMappingSha256: string | null;
    decoderMaySupplyOrReplaceAudio: false;
  }>;
  decodedPictures: readonly NativeMediaDecodedPictureV1[];
  timelinePictures: readonly Readonly<{
    timelineFrame: string;
    decoderPictureRequestSha256: string;
    sourceFrameOrdinal: string;
    epochId: string;
    presentationTimestampTicks: string;
    selection: VideoSourceTimestampConformV3['frameSelections'][number]['selection'];
    pictureHandle: string;
    decodedPictureContentSha256: string;
  }>[];
  totalDecodedBytes: number;
  receiptSha256: string;
}>;

export type NativeMediaTimestampConsumptionUnverifiableReasonV1 =
  | 'CONSUMER_INPUT_INVALID'
  | 'PROJECT_REVISION_UNAVAILABLE'
  | 'PROJECT_REVISION_STALE'
  | 'CURRENT_SOURCE_NOT_VERIFIED'
  | 'SOURCE_BINDING_STALE'
  | 'SOURCE_NOT_VIDEO'
  | 'RESOURCE_LIMIT_EXCEEDED'
  | 'DECODER_PORT_INVALID'
  | 'DECODER_FAILED'
  | 'DECODER_OUTPUT_INVALID'
  | 'DECODER_SCOPE_MISMATCH'
  | 'DECODER_RELEASE_FAILED'
  | 'DECODER_RESOURCE_LIMIT_EXCEEDED';

export type NativeMediaTimestampConsumptionResultV1 = Readonly<
  | {
      disposition: 'TIMESTAMP_MEDIA_CONSUMED';
      receipt: NativeMediaTimestampConsumptionReceiptV1;
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason: NativeMediaTimestampConsumptionUnverifiableReasonV1;
      diagnostic: string | null;
    }
>;

/**
 * Consumes an exact V3 timestamp transform through a versioned decoder port.
 * It never mutates a project and never asks the video decoder for audio. The
 * returned receipt is an integration input for preview/final-render owners;
 * it is not itself proof that either renderer displayed the pictures.
 */
export async function consumeNativeMediaTimestampTransformV1(input: Readonly<{
  userId: string;
  projectId: string;
  sequenceId: string;
  overlayId: string | number;
  projectRevision: ProjectRevisionV1;
  asset: MediaSourcePtsCadenceMapAssetStateInputV3;
  transform: VideoSourceTimestampConformV3;
  decoder: NativeMediaTimestampDecoderPortV1;
  decoderRelease: NativeMediaTimestampDecoderReleasePortV1;
  resourcePolicy: NativeMediaTimestampDecoderResourcePolicyV1;
  projectRevisionReader?: NativeMediaProjectRevisionReaderPortV1;
}>): Promise<NativeMediaTimestampConsumptionResultV1> {
  let userId: string;
  let projectId: string;
  let sequenceId: string;
  let overlayId: string;
  let projectRevision: ProjectRevisionV1;
  let sourceVersion: Readonly<MediaSourceVersionV1>;
  let transform: VideoSourceTimestampConformV3;
  let policy: NativeMediaTimestampDecoderResourcePolicyV1;
  try {
    userId = identifier(input.userId, 'NATIVE_MEDIA_USER_INVALID');
    projectId = identifier(input.projectId, 'NATIVE_MEDIA_PROJECT_INVALID');
    sequenceId = identifier(input.sequenceId, 'NATIVE_MEDIA_SEQUENCE_INVALID');
    overlayId = identifier(String(input.overlayId), 'NATIVE_MEDIA_OVERLAY_INVALID');
    projectRevision = normalizeProjectRevision(input.projectRevision);
    sourceVersion = assertMediaSourceVersionV1(input.asset.sourceVersionV1);
    transform = assertVideoSourceTimestampConformV3(input.transform);
    policy = normalizeResourcePolicy(input.resourcePolicy);
  } catch (error) {
    return unverifiable('CONSUMER_INPUT_INVALID', knownDiagnostic(error));
  }
  if (!input.decoder || typeof input.decoder.decodePictures !== 'function'
    || !input.decoderRelease
    || typeof input.decoderRelease.releaseDecodedBatch !== 'function') {
    return unverifiable('DECODER_PORT_INVALID', null);
  }
  const revisionReader = input.projectRevisionReader
    ?? projectServiceNativeMediaProjectRevisionReaderV1;
  const beforeRevision = await readCurrentProjectRevision(
    revisionReader,
    userId,
    projectId,
  );
  if (beforeRevision === null) {
    return unverifiable('PROJECT_REVISION_UNAVAILABLE', null);
  }
  if (!sameProjectRevision(beforeRevision, projectRevision)) {
    return unverifiable('PROJECT_REVISION_STALE', null);
  }
  if (sourceVersion.mediaKind !== 'video') {
    return unverifiable('SOURCE_NOT_VIDEO', null);
  }
  let currentBinding: ReturnType<typeof resolveVerifiedVideoSourceEpochTimeBindingV3>;
  try {
    currentBinding = resolveVerifiedVideoSourceEpochTimeBindingV3(input.asset);
  } catch (error) {
    return unverifiable('CURRENT_SOURCE_NOT_VERIFIED', knownDiagnostic(error));
  }
  if (currentBinding === null) {
    return unverifiable('CURRENT_SOURCE_NOT_VERIFIED', null);
  }
  if (currentBinding.bindingSha256 !== transform.sourceBinding.bindingSha256
    || currentBinding.sourceVersionSha256 !== sourceVersion.sourceVersionSha256
    || currentBinding.storageVersionSha256 !== sourceVersion.storageVersion.storageVersionSha256) {
    return unverifiable('SOURCE_BINDING_STALE', null);
  }

  const requestByIdentity = new Map<string, NativeMediaTimestampDecoderPictureRequestV1>();
  for (const selection of transform.frameSelections) {
    const identity = pictureIdentity(selection);
    if (!requestByIdentity.has(identity)) {
      const material = {
        sourceVersionSha256: sourceVersion.sourceVersionSha256,
        storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
        streamId: transform.streamId,
        sourceFrameOrdinal: selection.sourceFrameOrdinal,
        epochId: selection.epochId,
        presentationTimestampTicks: selection.presentationTimestampTicks,
      };
      requestByIdentity.set(identity, frozen({
        sourceFrameOrdinal: selection.sourceFrameOrdinal,
        epochId: selection.epochId,
        presentationTimestampTicks: selection.presentationTimestampTicks,
        decoderPictureRequestSha256: hashEditronCanonicalJsonV1(material),
      }));
    }
  }
  if (requestByIdentity.size > policy.maxUniquePictures) {
    return unverifiable('RESOURCE_LIMIT_EXCEEDED', 'UNIQUE_PICTURE_LIMIT_EXCEEDED');
  }
  const pictureRequests = [...requestByIdentity.values()];
  const decoderRequestMaterial = {
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_DECODER_BATCH_REQUEST_KIND_V1,
    decoderPortVersion: NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_VERSION_V1,
    sourceVersion,
    streamId: transform.streamId,
    videoStreamIndex: transform.sourceBinding.videoStreamIndex,
    pictureRequests,
    resourcePolicy: policy,
  };
  const decoderRequest = frozen({
    ...decoderRequestMaterial,
    decoderRequestSha256: hashEditronCanonicalJsonV1(decoderRequestMaterial),
  });

  let decoderOutput: NativeMediaTimestampDecoderBatchOutputV1;
  try {
    decoderOutput = await input.decoder.decodePictures(decoderRequest);
  } catch {
    if (!await releaseDecoderBatch(input.decoderRelease, decoderRequest.decoderRequestSha256)) {
      return unverifiable('DECODER_RELEASE_FAILED', 'DECODER_FAILED');
    }
    return unverifiable('DECODER_FAILED', null);
  }

  let decodedPictures: readonly NativeMediaDecodedPictureV1[];
  let totalDecodedBytes: number;
  try {
    ({ pictures: decodedPictures, totalDecodedBytes } = normalizeDecoderOutput(
      decoderOutput,
      decoderRequest,
    ));
  } catch (error) {
    const diagnostic = knownDiagnostic(error);
    if (!await releaseDecoderBatch(input.decoderRelease, decoderRequest.decoderRequestSha256)) {
      return unverifiable('DECODER_RELEASE_FAILED', diagnostic);
    }
    return unverifiable(classifyDecoderOutputError(diagnostic), diagnostic);
  }
  const afterRevision = await readCurrentProjectRevision(
    revisionReader,
    userId,
    projectId,
  );
  if (afterRevision === null || !sameProjectRevision(afterRevision, projectRevision)) {
    if (!await releaseDecoderBatch(input.decoderRelease, decoderRequest.decoderRequestSha256)) {
      return unverifiable('DECODER_RELEASE_FAILED', 'PROJECT_REVISION_STALE');
    }
    return unverifiable(
      afterRevision === null ? 'PROJECT_REVISION_UNAVAILABLE' : 'PROJECT_REVISION_STALE',
      null,
    );
  }
  const pictureByRequest = new Map(
    decodedPictures.map((picture) => [picture.decoderPictureRequestSha256, picture]),
  );
  const requestHashByIdentity = new Map(
    [...requestByIdentity.entries()].map(([identity, request]) => [
      identity,
      request.decoderPictureRequestSha256,
    ]),
  );
  const timelinePictures = transform.frameSelections.map((selection) => {
    const requestSha256 = requestHashByIdentity.get(pictureIdentity(selection));
    const picture = requestSha256 === undefined
      ? undefined
      : pictureByRequest.get(requestSha256);
    if (!requestSha256 || !picture) {
      throw new Error('NATIVE_MEDIA_DECODER_RESPONSE_COVERAGE_INVALID');
    }
    return {
      timelineFrame: selection.timelineFrame,
      decoderPictureRequestSha256: requestSha256,
      sourceFrameOrdinal: selection.sourceFrameOrdinal,
      epochId: selection.epochId,
      presentationTimestampTicks: selection.presentationTimestampTicks,
      selection: selection.selection,
      pictureHandle: picture.pictureHandle,
      decodedPictureContentSha256: picture.decodedPictureContentSha256,
    };
  });
  const audioMappingSha256 = transform.audioMapping === null
    ? null
    : hashEditronCanonicalJsonV1(transform.audioMapping);
  const receiptMaterial = {
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_CONSUMPTION_RECEIPT_KIND_V1,
    consumerVersion: NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_VERSION_V1,
    projectId,
    sequenceId,
    overlayId,
    projectRevision,
    assetId: sourceVersion.assetId,
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
    sourceBindingSha256: currentBinding.bindingSha256,
    transformSha256: transform.transformSha256,
    decoderRequestSha256: decoderRequest.decoderRequestSha256,
    audioOwnership: {
      kind: NATIVE_MEDIA_TIMESTAMP_AUDIO_OWNERSHIP_V1,
      disposition: transform.audioMapping === null
        ? 'NO_AUDIO_MAPPING_REQUESTED' as const
        : 'EXACT_SAMPLE_MAPPING_BOUND' as const,
      audioMappingSha256,
      decoderMaySupplyOrReplaceAudio: false as const,
    },
    decodedPictures,
    timelinePictures,
    totalDecodedBytes,
  };
  return frozen({
    disposition: 'TIMESTAMP_MEDIA_CONSUMED' as const,
    receipt: {
      ...receiptMaterial,
      receiptSha256: hashEditronCanonicalJsonV1(receiptMaterial),
    },
  });
}

function normalizeDecoderOutput(
  value: unknown,
  request: NativeMediaTimestampDecoderBatchRequestV1,
): Readonly<{ pictures: readonly NativeMediaDecodedPictureV1[]; totalDecodedBytes: number }> {
  const record = objectRecord(value, 'NATIVE_MEDIA_DECODER_OUTPUT_INVALID');
  exactKeys(record, [
    'decoderPortVersion', 'decoderRequestSha256', 'kind', 'pictures', 'schemaVersion',
  ], 'NATIVE_MEDIA_DECODER_OUTPUT_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== NATIVE_MEDIA_TIMESTAMP_DECODER_BATCH_OUTPUT_KIND_V1
    || record.decoderPortVersion !== NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_VERSION_V1
    || record.decoderRequestSha256 !== request.decoderRequestSha256
    || !Array.isArray(record.pictures)
    || record.pictures.length !== request.pictureRequests.length) {
    throw new Error('NATIVE_MEDIA_DECODER_OUTPUT_SCOPE_INVALID');
  }
  const expectedByHash = new Map(
    request.pictureRequests.map((picture) => [picture.decoderPictureRequestSha256, picture]),
  );
  const normalizedByHash = new Map<string, NativeMediaDecodedPictureV1>();
  let totalDecodedBytes = 0;
  for (const candidate of record.pictures) {
    const picture = normalizeDecodedPicture(candidate, request.resourcePolicy);
    const expected = expectedByHash.get(picture.decoderPictureRequestSha256);
    if (!expected || normalizedByHash.has(picture.decoderPictureRequestSha256)
      || picture.sourceVersionSha256 !== request.sourceVersion.sourceVersionSha256
      || picture.storageVersionSha256
        !== request.sourceVersion.storageVersion.storageVersionSha256
      || picture.streamId !== request.streamId
      || picture.sourceFrameOrdinal !== expected.sourceFrameOrdinal
      || picture.epochId !== expected.epochId
      || picture.presentationTimestampTicks !== expected.presentationTimestampTicks) {
      throw new Error('NATIVE_MEDIA_DECODER_OUTPUT_SCOPE_INVALID');
    }
    if (picture.decodedByteLength
      > request.resourcePolicy.maxDecodedBytes - totalDecodedBytes) {
      throw new Error('NATIVE_MEDIA_DECODER_OUTPUT_RESOURCE_LIMIT_EXCEEDED');
    }
    totalDecodedBytes += picture.decodedByteLength;
    normalizedByHash.set(picture.decoderPictureRequestSha256, picture);
  }
  return frozen({
    pictures: request.pictureRequests.map((picture) => {
      const decoded = normalizedByHash.get(picture.decoderPictureRequestSha256);
      if (!decoded) throw new Error('NATIVE_MEDIA_DECODER_OUTPUT_SCOPE_INVALID');
      return decoded;
    }),
    totalDecodedBytes,
  });
}

function normalizeDecodedPicture(
  value: unknown,
  policy: NativeMediaTimestampDecoderResourcePolicyV1,
): NativeMediaDecodedPictureV1 {
  const record = objectRecord(value, 'NATIVE_MEDIA_DECODED_PICTURE_INVALID');
  exactKeys(record, [
    'codedHeight', 'codedWidth', 'colorSpace', 'decodedByteLength',
    'decodedPictureContentSha256', 'decoderPictureRequestSha256', 'displayHeight',
    'displayWidth', 'epochId', 'pictureHandle', 'pixelFormat',
    'presentationTimestampTicks', 'rotationDegrees', 'sourceFrameOrdinal',
    'sourceVersionSha256', 'storageVersionSha256', 'streamId',
  ], 'NATIVE_MEDIA_DECODED_PICTURE_FIELDS_INVALID');
  const pixelFormat = record.pixelFormat as NativeMediaDecodedPictureV1['pixelFormat'];
  const rotationDegrees = record.rotationDegrees as NativeMediaDecodedPictureV1['rotationDegrees'];
  if (!PIXEL_FORMATS_V1.has(pixelFormat)
    || (rotationDegrees !== 0 && rotationDegrees !== 90
      && rotationDegrees !== 180 && rotationDegrees !== 270)) {
    throw new Error('NATIVE_MEDIA_DECODED_PICTURE_FORMAT_INVALID');
  }
  return frozen({
    decoderPictureRequestSha256: sha256(record.decoderPictureRequestSha256, 'NATIVE_MEDIA_DECODED_PICTURE_REQUEST_INVALID'),
    sourceVersionSha256: sha256(record.sourceVersionSha256, 'NATIVE_MEDIA_DECODED_PICTURE_SOURCE_INVALID'),
    storageVersionSha256: sha256(record.storageVersionSha256, 'NATIVE_MEDIA_DECODED_PICTURE_STORAGE_INVALID'),
    streamId: identifier(record.streamId, 'NATIVE_MEDIA_DECODED_PICTURE_STREAM_INVALID'),
    sourceFrameOrdinal: nonNegativeIntegerText(record.sourceFrameOrdinal, 'NATIVE_MEDIA_DECODED_PICTURE_ORDINAL_INVALID'),
    epochId: identifier(record.epochId, 'NATIVE_MEDIA_DECODED_PICTURE_EPOCH_INVALID'),
    presentationTimestampTicks: integerText(record.presentationTimestampTicks, 'NATIVE_MEDIA_DECODED_PICTURE_PTS_INVALID'),
    pictureHandle: boundedText(record.pictureHandle, 1024, 'NATIVE_MEDIA_DECODED_PICTURE_HANDLE_INVALID'),
    decodedPictureContentSha256: sha256(record.decodedPictureContentSha256, 'NATIVE_MEDIA_DECODED_PICTURE_CONTENT_INVALID'),
    decodedByteLength: positiveSafeIntegerInRange(record.decodedByteLength, policy.maxDecodedBytes, 'NATIVE_MEDIA_DECODED_PICTURE_BYTES_INVALID'),
    codedWidth: positiveSafeIntegerInRange(record.codedWidth, policy.maxCodedDimension, 'NATIVE_MEDIA_DECODED_PICTURE_CODED_WIDTH_INVALID'),
    codedHeight: positiveSafeIntegerInRange(record.codedHeight, policy.maxCodedDimension, 'NATIVE_MEDIA_DECODED_PICTURE_CODED_HEIGHT_INVALID'),
    displayWidth: positiveSafeIntegerInRange(record.displayWidth, policy.maxDisplayDimension, 'NATIVE_MEDIA_DECODED_PICTURE_DISPLAY_WIDTH_INVALID'),
    displayHeight: positiveSafeIntegerInRange(record.displayHeight, policy.maxDisplayDimension, 'NATIVE_MEDIA_DECODED_PICTURE_DISPLAY_HEIGHT_INVALID'),
    rotationDegrees,
    pixelFormat,
    colorSpace: normalizeColorSpace(record.colorSpace),
  });
}

function normalizeColorSpace(value: unknown): NativeMediaDecodedPictureV1['colorSpace'] {
  const record = objectRecord(value, 'NATIVE_MEDIA_DECODED_PICTURE_COLOR_INVALID');
  exactKeys(record, [
    'fullRange', 'matrix', 'primaries', 'transfer',
  ], 'NATIVE_MEDIA_DECODED_PICTURE_COLOR_FIELDS_INVALID');
  if (record.fullRange !== null && typeof record.fullRange !== 'boolean') {
    throw new Error('NATIVE_MEDIA_DECODED_PICTURE_COLOR_RANGE_INVALID');
  }
  return frozen({
    primaries: nullableBoundedText(record.primaries, 'NATIVE_MEDIA_DECODED_PICTURE_PRIMARIES_INVALID'),
    transfer: nullableBoundedText(record.transfer, 'NATIVE_MEDIA_DECODED_PICTURE_TRANSFER_INVALID'),
    matrix: nullableBoundedText(record.matrix, 'NATIVE_MEDIA_DECODED_PICTURE_MATRIX_INVALID'),
    fullRange: record.fullRange as boolean | null,
  });
}

function normalizeResourcePolicy(
  value: NativeMediaTimestampDecoderResourcePolicyV1,
): NativeMediaTimestampDecoderResourcePolicyV1 {
  if (!value || typeof value !== 'object') throw new Error('NATIVE_MEDIA_RESOURCE_POLICY_INVALID');
  return frozen({
    policyVersion: identifier(value.policyVersion, 'NATIVE_MEDIA_RESOURCE_POLICY_VERSION_INVALID'),
    maxUniquePictures: positiveSafeIntegerInRange(value.maxUniquePictures, NATIVE_MEDIA_TIMESTAMP_ABSOLUTE_MAX_UNIQUE_PICTURES_V1, 'NATIVE_MEDIA_RESOURCE_POLICY_PICTURES_INVALID'),
    maxDecodedBytes: positiveSafeIntegerInRange(value.maxDecodedBytes, NATIVE_MEDIA_TIMESTAMP_ABSOLUTE_MAX_DECODED_BYTES_V1, 'NATIVE_MEDIA_RESOURCE_POLICY_BYTES_INVALID'),
    maxCodedDimension: positiveSafeIntegerInRange(value.maxCodedDimension, NATIVE_MEDIA_TIMESTAMP_ABSOLUTE_MAX_DIMENSION_V1, 'NATIVE_MEDIA_RESOURCE_POLICY_CODED_DIMENSION_INVALID'),
    maxDisplayDimension: positiveSafeIntegerInRange(value.maxDisplayDimension, NATIVE_MEDIA_TIMESTAMP_ABSOLUTE_MAX_DIMENSION_V1, 'NATIVE_MEDIA_RESOURCE_POLICY_DISPLAY_DIMENSION_INVALID'),
  });
}

function normalizeProjectRevision(value: ProjectRevisionV1): ProjectRevisionV1 {
  if (!value || value.schemaVersion !== 1 || !Number.isSafeInteger(value.value) || value.value < 0) {
    throw new Error('NATIVE_MEDIA_PROJECT_REVISION_INVALID');
  }
  return frozen({
    schemaVersion: 1 as const,
    value: value.value,
    compatibilityUpdatedAt: boundedText(
      value.compatibilityUpdatedAt,
      240,
      'NATIVE_MEDIA_PROJECT_REVISION_INVALID',
    ),
  });
}

async function readCurrentProjectRevision(
  reader: NativeMediaProjectRevisionReaderPortV1,
  userId: string,
  projectId: string,
): Promise<ProjectRevisionV1 | null> {
  if (!reader || typeof reader.getProjectRevision !== 'function') return null;
  try {
    return normalizeProjectRevision(await reader.getProjectRevision(userId, projectId));
  } catch {
    return null;
  }
}

function sameProjectRevision(left: ProjectRevisionV1, right: ProjectRevisionV1): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}

async function releaseDecoderBatch(
  decoder: NativeMediaTimestampDecoderReleasePortV1,
  decoderRequestSha256: string,
): Promise<boolean> {
  try {
    await decoder.releaseDecodedBatch(decoderRequestSha256);
    return true;
  } catch {
    return false;
  }
}

function pictureIdentity(
  value: Pick<NativeMediaTimestampDecoderPictureRequestV1, 'epochId' | 'presentationTimestampTicks' | 'sourceFrameOrdinal'>,
): string {
  return hashEditronCanonicalJsonV1({
    sourceFrameOrdinal: value.sourceFrameOrdinal,
    epochId: value.epochId,
    presentationTimestampTicks: value.presentationTimestampTicks,
  });
}

function classifyDecoderOutputError(
  diagnostic: string | null,
): NativeMediaTimestampConsumptionUnverifiableReasonV1 {
  if (diagnostic?.includes('_RESOURCE_LIMIT_') || diagnostic?.includes('_BYTES_INVALID')) {
    return 'DECODER_RESOURCE_LIMIT_EXCEEDED';
  }
  if (diagnostic?.includes('_SCOPE_INVALID')) return 'DECODER_SCOPE_MISMATCH';
  return 'DECODER_OUTPUT_INVALID';
}

function unverifiable(
  reason: NativeMediaTimestampConsumptionUnverifiableReasonV1,
  diagnostic: string | null,
): NativeMediaTimestampConsumptionResultV1 {
  return frozen({ disposition: 'UNVERIFIABLE' as const, reason, diagnostic });
}

function objectRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(code);
  }
}

function identifier(value: unknown, code: string): string {
  return boundedText(value, 256, code);
}

function nullableBoundedText(value: unknown, code: string): string | null {
  return value === null ? null : boundedText(value, 128, code);
}

function boundedText(value: unknown, maximum: number, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}

function nonNegativeIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,127})$/.test(value)) throw new Error(code);
  return BigInt(value).toString();
}

function integerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d{0,127})$/.test(value)) throw new Error(code);
  return BigInt(value).toString();
}

function positiveSafeIntegerInRange(value: unknown, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > maximum) {
    throw new Error(code);
  }
  return Number(value);
}

function knownDiagnostic(error: unknown): string | null {
  if (!(error instanceof Error) || !/^[A-Z0-9_]{1,160}$/.test(error.message)) return null;
  return error.message;
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value) as Readonly<T>;
}
