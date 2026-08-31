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

export type PipelineVideoDeliveryInvalidationV1 =
  | {
      required: true;
      status: 'MATERIALIZED';
      evidenceHash: string;
    }
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
 * Create the immutable prerequisite carried by each queued job. The current
 * source has no durable invalidation owner, so every new claim is explicitly
 * unmaterialized and must be rejected before credit/provider dispatch. A
 * future owner may issue the separate MATERIALIZED form; no absence of a
 * timeline receipt is interpreted as NOT_REQUIRED.
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
  return value.required === true
    && value.status === 'MATERIALIZED'
    && keys.every((key) => key === 'required' || key === 'status' || key === 'evidenceHash')
    && /^[a-f0-9]{64}$/.test(String(value.evidenceHash));
}
