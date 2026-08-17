import { deriveZoomFocalAnchor, type ZoomFocalAnchor } from './zoom-form';

export type KeyframeMutationProperty = 'x' | 'y' | 'scale' | 'opacity' | 'rotation' | 'speed';

export interface KeyframeMutationPoint {
  frame: number;
  value: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface KeyframeMutationFocalPoint {
  x: number;
  y: number;
}

export interface KeyframeMutationPatch {
  keyframeTracks: Array<Record<string, unknown>>;
  styles?: Record<string, unknown>;
  speedCurve?: KeyframeMutationPoint[];
}

export function buildKeyframeMutationPatch(input: {
  overlay: Record<string, unknown>;
  property: KeyframeMutationProperty;
  keyframes: readonly KeyframeMutationPoint[];
  focalPoint?: KeyframeMutationFocalPoint;
}): { patch: KeyframeMutationPatch; focal?: ZoomFocalAnchor } {
  if (input.keyframes.length < 2 || input.keyframes.some((point) =>
    !Number.isFinite(point.frame) || !Number.isFinite(point.value))) {
    throw new Error('KEYFRAME_MUTATION_POINTS_INVALID');
  }
  if (input.focalPoint && input.property !== 'scale') {
    throw new Error('KEYFRAME_MUTATION_FOCAL_REQUIRES_SCALE');
  }
  if (input.focalPoint && (![input.focalPoint.x, input.focalPoint.y]
    .every((value) => Number.isFinite(value) && value >= 0 && value <= 1))) {
    throw new Error('KEYFRAME_MUTATION_FOCAL_OUT_OF_RANGE');
  }

  const keyframes = input.keyframes.map((point) => ({ ...point }));
  const existingTracks = Array.isArray(input.overlay.keyframeTracks)
    ? input.overlay.keyframeTracks.filter(isRecord).map((track) => structuredClone(track))
    : [];
  const keyframeTracks = existingTracks
    .filter((track) => track.property !== input.property)
    .concat({ property: input.property, keyframes });
  const focal = input.focalPoint
    ? deriveZoomFocalAnchor({
        zoom_focal_x: input.focalPoint.x,
        zoom_focal_y: input.focalPoint.y,
      })
    : undefined;
  const styles = focal
    ? { ...record(input.overlay.styles), transformOrigin: focal.transformOrigin }
    : undefined;

  return {
    patch: {
      keyframeTracks,
      ...(styles ? { styles } : {}),
      ...(input.property === 'speed' ? { speedCurve: keyframes } : {}),
    },
    ...(focal ? { focal } : {}),
  };
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
