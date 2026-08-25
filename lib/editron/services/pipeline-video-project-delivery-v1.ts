import type { AudioRightsContract } from '@/lib/editron/shared/render-request-payload';
import type { GeneratedVideoReceipt } from '@/lib/pipeline/video-generation-service';
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
