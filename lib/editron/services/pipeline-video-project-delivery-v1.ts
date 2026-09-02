import type { AudioRightsContract } from '@/lib/editron/shared/render-request-payload';
import type { GeneratedVideoReceipt } from '@/lib/pipeline/video-generation-service';
import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import type { ProjectRevisionV1 } from './project-service';
import {
  cloneCanonicalEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

const DIRECTOR_LEASE_DURATION_MS_V1 = 5 * 60 * 1000;

export interface PipelineVideoDeliveryTimelineRangeV1 {
  startFrame: number;
  endFrame: number;
}

export type PipelineVideoDeliveryInvalidationDerivativeClassV1 =
  | 'RENDERED_PREVIEW'
  | 'DELIVERY_PROOF';

export interface PipelineVideoDeliveryInvalidationAdmissionV1 {
  required: true;
  /** Durable admission only; downstream artifact invalidation is still pending. */
  status: 'ADMITTED_ARTIFACT_CHAIN_PENDING';
  admissionId: string;
  projectId: string;
  /** The authenticated ProjectService owner that issued this admission. */
  ownerId: string;
  beforeRevision: ProjectRevisionV1;
  afterRevision: ProjectRevisionV1;
  target: {
    overlayId: number;
    expectedAssetId: string;
    exactFrameRange: PipelineVideoDeliveryTimelineRangeV1;
    targetFingerprint: string;
  };
  affectedDerivativeClasses: readonly PipelineVideoDeliveryInvalidationDerivativeClassV1[];
  admittedAt: string;
  expiresAt: string;
  admissionHash: string;
}

export type PipelineVideoDeliveryInvalidationV1 =
  | PipelineVideoDeliveryInvalidationAdmissionV1
  | {
      required: true;
      status: 'UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN';
    };

/**
 * The ProjectService-snapshotted admission claim for one generated-video
 * delivery. It binds the exact snapshot but grants no mutation authority;
 * the worker carries it byte-for-byte and ProjectService validates it again.
 */
export interface PipelineVideoProjectDeliveryPrerequisiteV1 {
  schemaVersion: 1;
  projectId: string;
  expectedRevision: ProjectRevisionV1;
  target: {
    overlayId: number;
    expectedAssetId: string;
    exactFrameRange: PipelineVideoDeliveryTimelineRangeV1;
    targetFingerprint: string;
  };
  source: {
    expectedAssetId: string;
    sourceFingerprint: string;
  };
  locks: {
    directorLease: 'ABSENT';
    overlappingCutLockIds: readonly [];
  };
  replacement: {
    generatedPredecessor: 'REQUIRED';
    rights: 'MATCH_REPLACEMENT_AUDIO_PROVENANCE';
  };
  invalidation: PipelineVideoDeliveryInvalidationV1;
  envelopeHash: string;
}

export interface PipelineVideoProjectDeliveryAdmissionInputV1 {
  projectId: string;
  ownerId: string;
  expectedRevision: ProjectRevisionV1;
  target: PipelineVideoProjectDeliveryPrerequisiteV1['target'];
}

/**
 * Pure identity material for a generated-video replacement. ProjectService is
 * the only component permitted to decide whether this material can land on a
 * live project revision.
 */
export interface PipelineVideoDeliveryMaterialV1 {
  deliveryId: string;
  target: {
    overlayId: number;
    expectedAssetId: string;
  };
  replacement: {
    assetId: string;
    sourceUrl: string;
    durationMs: number;
    hasNativeAudio: boolean;
    audioRights: AudioRightsContract | null;
    generatedVideoReceipt: GeneratedVideoReceipt | null;
  };
}

/**
 * Producer-snapshotted delivery target carried unchanged through the signed
 * worker payload. It identifies one existing project overlay without granting
 * the producer or worker authority to mutate the project.
 */
export interface PipelineVideoProjectDeliveryTargetV1 {
  projectId: string;
  expectedRevision: ProjectRevisionV1;
  target: PipelineVideoDeliveryMaterialV1['target'];
}

export interface PipelineVideoProjectDeliveryRequestV1
  extends PipelineVideoProjectDeliveryTargetV1 {
  deliveryId: string;
  prerequisite: PipelineVideoProjectDeliveryPrerequisiteV1;
}

export type PipelineVideoProjectDeliveryTargetResolutionV1 =
  | { kind: 'NOT_REQUIRED' }
  | { kind: 'RESOLVED'; target: PipelineVideoProjectDeliveryTargetV1 }
  | { kind: 'TARGET_NOT_FOUND' }
  | { kind: 'TARGET_AMBIGUOUS' }
  | { kind: 'TARGET_INVALID_OVERLAY_ID' };

/**
 * Resolve an existing storyboard video asset to exactly one live video overlay.
 * This is deliberately a pure producer-side selection check: ProjectService
 * remains the only component that may apply the later replacement.
 */
export function resolvePipelineVideoProjectDeliveryTargetV1(input: {
  projectId: string;
  expectedRevision: ProjectRevisionV1;
  expectedAssetId: string | undefined;
  overlays: readonly Pick<Overlay, 'id' | 'type' | 'assetId'>[];
}): PipelineVideoProjectDeliveryTargetResolutionV1 {
  if (!input.expectedAssetId) return { kind: 'NOT_REQUIRED' };

  const matches = input.overlays.filter((overlay) => (
    overlay.type === 'video' && overlay.assetId === input.expectedAssetId
  ));
  if (matches.length === 0) return { kind: 'TARGET_NOT_FOUND' };
  if (matches.length > 1) return { kind: 'TARGET_AMBIGUOUS' };

  const overlayId = matches[0]?.id;
  if (!Number.isSafeInteger(overlayId) || overlayId < 0) {
    return { kind: 'TARGET_INVALID_OVERLAY_ID' };
  }

  return {
    kind: 'RESOLVED',
    target: {
      projectId: input.projectId,
      expectedRevision: structuredClone(input.expectedRevision),
      target: {
        overlayId,
        expectedAssetId: input.expectedAssetId,
      },
    },
  };
}

export function pipelineVideoDeliveryMaterialHashV1(
  input: PipelineVideoDeliveryMaterialV1 & {
    prerequisite: PipelineVideoProjectDeliveryPrerequisiteV1;
  },
): string {
  return hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    deliveryId: input.deliveryId,
    target: {
      overlayId: input.target.overlayId,
      expectedAssetId: input.target.expectedAssetId,
    },
    replacement: canonicalValueOrNull(input.replacement),
    prerequisite: canonicalValueOrNull(input.prerequisite),
  });
}

/**
 * Stable identity for one owner-scoped admission attempt. Timestamps are not
 * part of this key so a retried route can recover the same durable admission
 * without issuing a second project revision.
 */
export function pipelineVideoDeliveryInvalidationAdmissionKeyV1(
  input: PipelineVideoProjectDeliveryAdmissionInputV1,
): string {
  return hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    projectId: input.projectId,
    ownerId: input.ownerId,
    expectedRevision: canonicalValueOrNull(input.expectedRevision),
    target: canonicalValueOrNull(input.target),
  });
}

export function pipelineVideoDeliveryInvalidationAdmissionHashV1(
  input: Omit<PipelineVideoDeliveryInvalidationAdmissionV1, 'admissionHash'>,
): string {
  return hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    required: input.required,
    status: input.status,
    admissionId: input.admissionId,
    projectId: input.projectId,
    ownerId: input.ownerId,
    beforeRevision: canonicalValueOrNull(input.beforeRevision),
    afterRevision: canonicalValueOrNull(input.afterRevision),
    target: canonicalValueOrNull(input.target),
    affectedDerivativeClasses: canonicalValueOrNull(input.affectedDerivativeClasses),
    admittedAt: input.admittedAt,
    expiresAt: input.expiresAt,
  });
}

export function assertPipelineVideoDeliveryInvalidationAdmissionV1(
  input: unknown,
): asserts input is PipelineVideoDeliveryInvalidationAdmissionV1 {
  if (!isPlainRecord(input) || !isValidInvalidation(input)
    || input.status !== 'ADMITTED_ARTIFACT_CHAIN_PENDING') {
    throw new Error('PIPELINE_VIDEO_DELIVERY_INVALIDATION_ADMISSION_INVALID');
  }
}

/**
 * Bind the producer's unmaterialized claim to the exact durable ProjectService
 * admission and advance the prerequisite revision to its fence. The pending
 * status is intentionally not an artifact-invalidation completion receipt.
 */
export function materializePipelineVideoProjectDeliveryPrerequisiteV1(
  input: PipelineVideoProjectDeliveryPrerequisiteV1,
  admission: PipelineVideoDeliveryInvalidationAdmissionV1,
): PipelineVideoProjectDeliveryPrerequisiteV1 {
  assertPipelineVideoDeliveryInvalidationAdmissionV1(admission);
  if (
    input.invalidation.status !== 'UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN'
    || input.projectId !== admission.projectId
    || !sameProjectRevisionV1(input.expectedRevision, admission.beforeRevision)
    || input.target.overlayId !== admission.target.overlayId
    || input.target.expectedAssetId !== admission.target.expectedAssetId
    || input.target.exactFrameRange.startFrame !== admission.target.exactFrameRange.startFrame
    || input.target.exactFrameRange.endFrame !== admission.target.exactFrameRange.endFrame
    || input.target.targetFingerprint !== admission.target.targetFingerprint
  ) {
    throw new Error('PIPELINE_VIDEO_DELIVERY_INVALIDATION_ADMISSION_MISMATCH');
  }
  const unsigned = {
    ...input,
    expectedRevision: structuredClone(admission.afterRevision),
    invalidation: structuredClone(admission),
  };
  return {
    ...unsigned,
    envelopeHash: pipelineVideoProjectDeliveryPrerequisiteHashV1(unsigned),
  };
}

/**
 * Derive the stable identity and exact occupied range of the target from the
 * ProjectService snapshot. The complete persisted overlay is bound so raw
 * writer bypasses cannot change style/layout/timing without being detected.
 * `assetResolver.resolveProjectAssets` derives `src` and `content` from the
 * authoritative assetId and may refresh signed/provider URLs, so those two
 * URL fields are the only deliberately excluded, non-authoritative material.
 */
export function pipelineVideoDeliveryTargetFingerprintV1(input: Overlay): string {
  const canonicalOverlay = cloneCanonicalEditronJsonV1(input) as Record<string, unknown>;
  delete canonicalOverlay.src;
  delete canonicalOverlay.content;
  return hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    targetOverlay: canonicalOverlay,
  });
}

export function pipelineVideoDeliveryExactFrameRangeV1(input: {
  from?: number;
  durationInFrames?: number;
}): PipelineVideoDeliveryTimelineRangeV1 {
  if (
    !Number.isSafeInteger(input.from)
    || (input.from as number) < 0
    || !Number.isSafeInteger(input.durationInFrames)
    || (input.durationInFrames as number) <= 0
  ) {
    throw new Error('PIPELINE_VIDEO_DELIVERY_TARGET_RANGE_INVALID');
  }
  const endFrame = (input.from as number) + (input.durationInFrames as number);
  if (!Number.isSafeInteger(endFrame)) {
    throw new Error('PIPELINE_VIDEO_DELIVERY_TARGET_RANGE_INVALID');
  }
  return { startFrame: input.from as number, endFrame };
}

/**
 * Create the immutable producer prerequisite carried by a queued job. It
 * starts unmaterialized; ProjectService must replace that claim with its
 * target/revision-bound admission before credit/provider dispatch. No absence
 * of a timeline receipt is interpreted as NOT_REQUIRED.
 */
export function createPipelineVideoProjectDeliveryPrerequisiteV1(input: {
  projectId: string;
  expectedRevision: ProjectRevisionV1;
  overlay: Overlay;
  directorLock?: boolean;
  directorLockAt?: Date | string;
  timelineRangeCutLocks?: readonly {
    lockId: string;
    frameRange: PipelineVideoDeliveryTimelineRangeV1;
    expiresAt: Date | string;
  }[];
  now?: Date;
}): PipelineVideoProjectDeliveryPrerequisiteV1 {
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error('PIPELINE_VIDEO_DELIVERY_PREREQUISITE_TIME_INVALID');
  }
  if (input.overlay.type !== 'video' || typeof input.overlay.assetId !== 'string') {
    throw new Error('PIPELINE_VIDEO_DELIVERY_SOURCE_EVIDENCE_INVALID');
  }

  const exactFrameRange = pipelineVideoDeliveryExactFrameRangeV1(input.overlay);
  const targetFingerprint = pipelineVideoDeliveryTargetFingerprintV1(input.overlay);
  const directorLockAt = input.directorLockAt === undefined
    ? null
    : new Date(input.directorLockAt);
  const directorLeaseActive = input.directorLock === true
    && (!directorLockAt || Number.isNaN(directorLockAt.getTime())
      || now.getTime() - directorLockAt.getTime() < DIRECTOR_LEASE_DURATION_MS_V1);
  if (directorLeaseActive) {
    throw new Error('PIPELINE_VIDEO_DELIVERY_DIRECTOR_LEASE_ACTIVE');
  }

  const overlappingCutLockIds: string[] = [];
  for (const lock of input.timelineRangeCutLocks ?? []) {
    const expiresAt = new Date(lock.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      throw new Error('PIPELINE_VIDEO_DELIVERY_CUT_LOCK_INVALID');
    }
    const overlaps = lock.frameRange.startFrame < exactFrameRange.endFrame
      && exactFrameRange.startFrame < lock.frameRange.endFrame;
    if (expiresAt.getTime() > now.getTime() && overlaps) {
      overlappingCutLockIds.push(lock.lockId);
    }
  }
  if (overlappingCutLockIds.length > 0) {
    throw new Error('PIPELINE_VIDEO_DELIVERY_TIMELINE_RANGE_LOCKED');
  }

  const invalidation: PipelineVideoDeliveryInvalidationV1 = {
    required: true,
    status: 'UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN',
  };
  const unsigned = {
    schemaVersion: 1 as const,
    projectId: input.projectId,
    expectedRevision: structuredClone(input.expectedRevision),
    target: {
      overlayId: input.overlay.id,
      expectedAssetId: input.overlay.assetId,
      exactFrameRange,
      targetFingerprint,
    },
    source: {
      expectedAssetId: input.overlay.assetId,
      sourceFingerprint: targetFingerprint,
    },
    locks: {
      directorLease: 'ABSENT' as const,
      overlappingCutLockIds: [] as const,
    },
    replacement: {
      generatedPredecessor: 'REQUIRED' as const,
      rights: 'MATCH_REPLACEMENT_AUDIO_PROVENANCE' as const,
    },
    invalidation,
  };
  return {
    ...unsigned,
    envelopeHash: pipelineVideoProjectDeliveryPrerequisiteHashV1(unsigned),
  };
}

export function pipelineVideoProjectDeliveryPrerequisiteHashV1(
  input: Omit<PipelineVideoProjectDeliveryPrerequisiteV1, 'envelopeHash'>,
): string {
  return hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    projectId: input.projectId,
    expectedRevision: canonicalValueOrNull(input.expectedRevision),
    target: canonicalValueOrNull(input.target),
    source: canonicalValueOrNull(input.source),
    locks: canonicalValueOrNull(input.locks),
    replacement: canonicalValueOrNull(input.replacement),
    invalidation: canonicalValueOrNull(input.invalidation),
  });
}

export function assertPipelineVideoProjectDeliveryPrerequisiteV1(
  input: unknown,
): asserts input is PipelineVideoProjectDeliveryPrerequisiteV1 {
  if (!isPlainRecord(input)) {
    throw new Error('PIPELINE_VIDEO_DELIVERY_PREREQUISITE_INVALID');
  }
  const keys = Object.keys(input);
  const allowedKeys = [
    'schemaVersion',
    'projectId',
    'expectedRevision',
    'target',
    'source',
    'locks',
    'replacement',
    'invalidation',
    'envelopeHash',
  ];
  if (keys.some((key) => !allowedKeys.includes(key))) {
    throw new Error('PIPELINE_VIDEO_DELIVERY_PREREQUISITE_INVALID');
  }
  const target = input.target;
  const source = input.source;
  const locks = input.locks;
  const replacement = input.replacement;
  const invalidation = input.invalidation;
  if (
    input.schemaVersion !== 1
    || !isBoundedNonEmptyString(input.projectId, 200)
    || !isProjectRevision(input.expectedRevision)
    || !isPlainRecord(target)
    || !isPlainRecord(source)
    || !isPlainRecord(locks)
    || !isPlainRecord(replacement)
    || !isPlainRecord(invalidation)
    || !/^[a-f0-9]{64}$/.test(String(input.envelopeHash))
    || Object.keys(target).some((key) => ![
      'overlayId', 'expectedAssetId', 'exactFrameRange', 'targetFingerprint',
    ].includes(key))
    || !Number.isSafeInteger(target.overlayId)
    || target.overlayId < 0
    || !isBoundedNonEmptyString(target.expectedAssetId, 500)
    || !isPlainRecord(target.exactFrameRange)
    || !isExactFrameRange(target.exactFrameRange)
    || !/^[a-f0-9]{64}$/.test(String(target.targetFingerprint))
    || Object.keys(source).some((key) => !['expectedAssetId', 'sourceFingerprint'].includes(key))
    || source.expectedAssetId !== target.expectedAssetId
    || !/^[a-f0-9]{64}$/.test(String(source.sourceFingerprint))
    || Object.keys(locks).some((key) => !['directorLease', 'overlappingCutLockIds'].includes(key))
    || locks.directorLease !== 'ABSENT'
    || !Array.isArray(locks.overlappingCutLockIds)
    || locks.overlappingCutLockIds.length !== 0
    || Object.keys(replacement).some((key) => !['generatedPredecessor', 'rights'].includes(key))
    || replacement.generatedPredecessor !== 'REQUIRED'
    || replacement.rights !== 'MATCH_REPLACEMENT_AUDIO_PROVENANCE'
    || !isValidInvalidation(invalidation)
  ) {
    throw new Error('PIPELINE_VIDEO_DELIVERY_PREREQUISITE_INVALID');
  }
  const { envelopeHash, ...unsigned } = input as unknown as PipelineVideoProjectDeliveryPrerequisiteV1;
  if (pipelineVideoProjectDeliveryPrerequisiteHashV1(unsigned) !== envelopeHash) {
    throw new Error('PIPELINE_VIDEO_DELIVERY_PREREQUISITE_HASH_MISMATCH');
  }
}

export function clonePipelineVideoCanonicalValueV1<T>(value: T): T {
  return cloneCanonicalEditronJsonV1(value);
}

function canonicalValueOrNull(value: unknown): unknown {
  return value === undefined ? null : cloneCanonicalEditronJsonV1(value);
}

function isPlainRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isBoundedNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isProjectRevision(value: unknown): value is ProjectRevisionV1 {
  return isPlainRecord(value)
    && value.schemaVersion === 1
    && Number.isSafeInteger(value.value)
    && value.value >= 0
    && typeof value.compatibilityUpdatedAt === 'string'
    && !Number.isNaN(new Date(value.compatibilityUpdatedAt).getTime());
}

function isExactFrameRange(value: Record<string, any>): boolean {
  return Object.keys(value).every((key) => key === 'startFrame' || key === 'endFrame')
    && Number.isSafeInteger(value.startFrame)
    && Number.isSafeInteger(value.endFrame)
    && value.startFrame >= 0
    && value.endFrame > value.startFrame;
}

function isValidInvalidation(value: Record<string, any>): boolean {
  const keys = Object.keys(value);
  if (value.required === true && value.status === 'UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN') {
    return keys.every((key) => key === 'required' || key === 'status');
  }
  if (
    value.required !== true
    || value.status !== 'ADMITTED_ARTIFACT_CHAIN_PENDING'
    || keys.some((key) => ![
      'required',
      'status',
      'admissionId',
      'projectId',
      'ownerId',
      'beforeRevision',
      'afterRevision',
      'target',
      'affectedDerivativeClasses',
      'admittedAt',
      'expiresAt',
      'admissionHash',
    ].includes(key))
    || !/^pipeline-video-invalidation_[a-f0-9]{64}$/.test(String(value.admissionId))
    || !isBoundedNonEmptyString(value.projectId, 200)
    || value.projectId !== value.projectId.trim()
    || !isBoundedNonEmptyString(value.ownerId, 200)
    || value.ownerId !== value.ownerId.trim()
    || !isProjectRevision(value.beforeRevision)
    || !isProjectRevision(value.afterRevision)
    || value.afterRevision.value !== value.beforeRevision.value + 1
    || !isPlainRecord(value.target)
    || Object.keys(value.target).some((key) => ![
      'overlayId', 'expectedAssetId', 'exactFrameRange', 'targetFingerprint',
    ].includes(key))
    || !Number.isSafeInteger(value.target.overlayId)
    || value.target.overlayId < 0
    || !isBoundedNonEmptyString(value.target.expectedAssetId, 500)
    || !isPlainRecord(value.target.exactFrameRange)
    || !isExactFrameRange(value.target.exactFrameRange)
    || !/^[a-f0-9]{64}$/.test(String(value.target.targetFingerprint))
    || !Array.isArray(value.affectedDerivativeClasses)
    || value.affectedDerivativeClasses.length < 1
    || value.affectedDerivativeClasses.length > 2
    || new Set(value.affectedDerivativeClasses).size !== value.affectedDerivativeClasses.length
    || value.affectedDerivativeClasses.some((item: unknown) => (
      item !== 'RENDERED_PREVIEW' && item !== 'DELIVERY_PROOF'
    ))
    || !isValidDateValue(value.admittedAt)
    || !isValidDateValue(value.expiresAt)
    || new Date(value.expiresAt).getTime() <= new Date(value.admittedAt).getTime()
    || !/^[a-f0-9]{64}$/.test(String(value.admissionHash))
  ) {
    return false;
  }
  const { admissionHash, ...unsigned } = value as unknown as PipelineVideoDeliveryInvalidationAdmissionV1;
  return pipelineVideoDeliveryInvalidationAdmissionHashV1(unsigned) === admissionHash;
}

function isValidDateValue(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function sameProjectRevisionV1(
  left: ProjectRevisionV1,
  right: ProjectRevisionV1,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}
