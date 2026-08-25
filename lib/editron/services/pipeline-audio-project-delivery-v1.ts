import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import {
  cloneCanonicalEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

/**
 * Pure delivery-material helpers. ProjectService remains the only owner that
 * validates a fresh project revision and persists this material.
 */
export type PipelineAudioDeliveryKindV1 = 'BGM' | 'SFX';
export type PipelineAudioDeliveryOutcomeV1 = 'ATTACHED' | 'SKIPPED' | 'FAILED';

export interface PipelineAudioDeliveryBeatV1 {
  frame: number;
  isDownbeat: boolean;
}

export interface PipelineAudioDeliveryMaterialV1 {
  deliveryId: string;
  kind: PipelineAudioDeliveryKindV1;
  outcome: PipelineAudioDeliveryOutcomeV1;
  overlays: readonly Overlay[];
  musicCoveragePlan?: unknown;
  beatFrames?: readonly PipelineAudioDeliveryBeatV1[];
  warnings?: readonly Record<string, unknown>[];
}

export interface PipelineAudioPlanningSnapshotV1 {
  fps?: unknown;
  durationInFrames?: unknown;
  overlays?: unknown;
}

export function projectPipelineAudioTimelineBindingHashV1(
  project: PipelineAudioPlanningSnapshotV1,
): string {
  if (!Array.isArray(project.overlays)) {
    throw new Error('PIPELINE_AUDIO_TIMELINE_BINDING_OVERLAYS_INVALID');
  }

  const visualTimeline = project.overlays
    .filter((overlay): overlay is Overlay => isPlainRecord(overlay))
    .filter((overlay) => !isAudioOverlay(overlay))
    .map((overlay) => ({
      id: scalar(overlay.id),
      type: scalar(overlay.type),
      row: scalar(overlay.row),
      from: scalar(overlay.from),
      durationInFrames: scalar(overlay.durationInFrames),
      assetId: scalar((overlay as { assetId?: unknown }).assetId),
      content: scalar((overlay as { content?: unknown }).content),
      startFrom: scalar((overlay as { startFrom?: unknown }).startFrom),
      startFromSound: scalar((overlay as { startFromSound?: unknown }).startFromSound),
      audioStartFrame: scalar((overlay as { audioStartFrame?: unknown }).audioStartFrame),
      audioEndFrame: scalar((overlay as { audioEndFrame?: unknown }).audioEndFrame),
      sourceStartFrame: scalar((overlay as { sourceStartFrame?: unknown }).sourceStartFrame),
      sourceEndFrame: scalar((overlay as { sourceEndFrame?: unknown }).sourceEndFrame),
    }))
    .sort((left, right) => compareCanonicalScalarIds(left.id, right.id));

  return hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    coordinateDomain: 'PROJECT_TIMELINE_FRAME_V1',
    fps: scalar(project.fps),
    durationInFrames: scalar(project.durationInFrames),
    visualTimeline,
  });
}

export function pipelineAudioDeliveryMaterialHashV1(
  input: PipelineAudioDeliveryMaterialV1,
): string {
  return hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    deliveryId: input.deliveryId,
    kind: input.kind,
    outcome: input.outcome,
    // A delivery identity must cover every field that can alter the attached
    // audio or its reproducibility. ProjectService rejects non-canonical
    // material before it can be persisted under an idempotency key.
    overlays: input.overlays.map((overlay) => canonicalValueOrNull(overlay)),
    musicCoveragePlan: canonicalValueOrNull(input.musicCoveragePlan),
    beatFrames: input.beatFrames?.map((beat) => ({
      frame: scalar(beat.frame),
      isDownbeat: scalar(beat.isDownbeat),
    })) ?? [],
    warnings: input.warnings?.map((warning) => canonicalValueOrNull(warning)) ?? [],
  });
}

export function preparePipelineAudioDeliveryOverlaysV1(
  input: Pick<PipelineAudioDeliveryMaterialV1, 'deliveryId' | 'kind' | 'overlays'>,
  materialHash: string,
): Overlay[] {
  return input.overlays.map((overlay) => {
    const metadata = isPlainRecord((overlay as { metadata?: unknown }).metadata)
      ? (overlay as { metadata: Record<string, unknown> }).metadata
      : {};
    return {
      ...overlay,
      _workerAdded: true,
      metadata: {
        ...metadata,
        pipelineAudioDeliveryV1: {
          schemaVersion: 1,
          deliveryId: input.deliveryId,
          kind: input.kind,
          materialHash,
        },
      },
    } as unknown as Overlay;
  });
}

export function clonePipelineAudioCanonicalValueV1(value: unknown): unknown {
  return cloneCanonicalEditronJsonV1(value);
}

export function isPipelineAudioOverlayForKindV1(
  overlay: Overlay,
  kind: PipelineAudioDeliveryKindV1,
): boolean {
  return overlay.type === 'sound' && overlay.row === (kind === 'BGM' ? ROW.BGM : ROW.SFX);
}

function isAudioOverlay(overlay: Overlay): boolean {
  const type = (overlay as { type?: unknown }).type;
  return type === 'sound' || type === 'audio';
}

function scalar(value: unknown): string | number | boolean | null {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function compareCanonicalScalarIds(
  left: string | number | boolean | null,
  right: string | number | boolean | null,
): number {
  const leftValue = String(left);
  const rightValue = String(right);
  if (leftValue < rightValue) return -1;
  if (leftValue > rightValue) return 1;
  return 0;
}

function canonicalValueOrNull(value: unknown): unknown {
  return value === undefined ? null : cloneCanonicalEditronJsonV1(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
