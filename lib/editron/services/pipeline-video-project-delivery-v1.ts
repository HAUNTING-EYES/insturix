import type { AudioRightsContract } from '@/lib/editron/shared/render-request-payload';
import type { GeneratedVideoReceipt } from '@/lib/pipeline/video-generation-service';
import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import type { ProjectRevisionV1 } from './project-service';
import {
  cloneCanonicalEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

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
  input: PipelineVideoDeliveryMaterialV1,
): string {
  return hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    deliveryId: input.deliveryId,
    target: {
      overlayId: input.target.overlayId,
      expectedAssetId: input.target.expectedAssetId,
    },
    replacement: canonicalValueOrNull(input.replacement),
  });
}

export function clonePipelineVideoCanonicalValueV1<T>(value: T): T {
  return cloneCanonicalEditronJsonV1(value);
}

function canonicalValueOrNull(value: unknown): unknown {
  return value === undefined ? null : cloneCanonicalEditronJsonV1(value);
}
