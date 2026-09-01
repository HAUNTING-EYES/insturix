import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import {
  alignCutsToBeatsWithEvidence,
  type BeatAlignmentResult,
} from '@/lib/pipeline/scene-to-editron';

export type BeatSyncFilterV1 = 'all' | 'downbeats' | 'strong';

export interface BeatSyncAnalyzedBeatV1 {
  frame?: number;
  timeMs?: number;
  strength?: number;
  isDownbeat?: boolean;
}

export interface BeatSyncSourceEvidenceV1 {
  bpm?: number;
  bpmConfidence?: number;
  beats?: BeatSyncAnalyzedBeatV1[];
  downbeats?: number[];
}

export interface BeatSyncMutationResolutionV1 {
  candidateOverlays: Overlay[];
  sourceBeatCount: number;
  timelineBeatCount: number;
  timelineBeats: Array<{ frame: number; isDownbeat: boolean }>;
  protectedBoundaryFrames: number[];
  alignment: BeatAlignmentResult;
}

/**
 * Single physical form owner for beat-synchronized cut timing. It is pure and
 * deterministic: callers supply already-authorized evidence, while the real
 * mutation owner independently binds that evidence before committing.
 */
export function resolveBeatSyncMutationV1(input: {
  overlays: readonly Overlay[];
  fps: number;
  audioAssetId: string;
  sourceBeatEvidence: BeatSyncSourceEvidenceV1;
  beatFilter: BeatSyncFilterV1;
  strengthThreshold: number;
  targetOverlayId?: string | number;
  sourceDurationFramesByAssetId: Readonly<Record<string, number>>;
}): BeatSyncMutationResolutionV1 {
  const sourceBeats = selectSourceBeatsV1(
    input.sourceBeatEvidence,
    input.fps,
    input.beatFilter,
    input.strengthThreshold,
  );
  const audioFamily = input.overlays.filter((overlay) => (
    overlay.type === 'sound' && overlay.assetId === input.audioAssetId
  ));
  const timelineBeats = projectBeatsOntoTimelineV1(sourceBeats, audioFamily);
  const protectedBoundaryFrames = captionPhraseBoundaryFramesV1(input.overlays, input.fps);
  const candidateOverlays = structuredClone(input.overlays) as Overlay[];
  const alignment = alignCutsToBeatsWithEvidence(
    candidateOverlays,
    timelineBeats,
    input.fps,
    {
      ...(input.targetOverlayId == null ? {} : { targetOverlayId: input.targetOverlayId }),
      // CKG mapping:audio.cut_on_downbeat defines a +/-3 frame moderate lock.
      maxSnapFrames: Math.max(1, Math.round(input.fps * 0.1)),
      minClipFrames: 1,
      // CKG mapping/constraint requires a skipped alignment after four locks.
      maxConsecutiveBeatCuts: 4,
      protectedBoundaryFrames,
      protectedBoundaryToleranceFrames: Math.max(1, Math.round(input.fps / 30)),
      sourceDurationFramesByAssetId: input.sourceDurationFramesByAssetId,
      requireSourceHandles: true,
    },
  );
  return {
    candidateOverlays,
    sourceBeatCount: sourceBeats.length,
    timelineBeatCount: timelineBeats.length,
    timelineBeats,
    protectedBoundaryFrames,
    alignment,
  };
}

function selectSourceBeatsV1(
  evidence: BeatSyncSourceEvidenceV1,
  fps: number,
  filter: BeatSyncFilterV1,
  strengthThreshold: number,
): Array<{ frame: number; strength: number; isDownbeat: boolean }> {
  const rawDownbeats = new Set<number>(
    Array.isArray(evidence.downbeats)
      ? evidence.downbeats.filter(Number.isFinite).map((frame) => Math.round(frame))
      : [],
  );
  return (Array.isArray(evidence.beats) ? evidence.beats : [])
    .map((beat) => {
      const frame = Number.isFinite(beat?.frame)
        ? Math.round(beat.frame as number)
        : Number.isFinite(beat?.timeMs)
          ? Math.round(((beat.timeMs as number) / 1000) * fps)
          : null;
      return frame == null ? null : {
        frame,
        strength: Number.isFinite(beat?.strength) ? beat.strength as number : 0,
        isDownbeat: beat?.isDownbeat === true || rawDownbeats.has(frame),
      };
    })
    .filter((beat): beat is { frame: number; strength: number; isDownbeat: boolean } => beat !== null)
    .filter((beat) => (
      filter === 'all'
      || (filter === 'downbeats' && beat.isDownbeat)
      || (filter === 'strong' && beat.strength >= strengthThreshold)
    ));
}

function projectBeatsOntoTimelineV1(
  beats: Array<{ frame: number; isDownbeat: boolean }>,
  audioFamily: readonly Overlay[],
): Array<{ frame: number; isDownbeat: boolean }> {
  const projected = new Map<number, { frame: number; isDownbeat: boolean }>();
  for (const overlay of audioFamily) {
    const shape = overlay as Overlay & { startFromSound?: unknown };
    const timelineStart = nonNegativeFrameV1(overlay.from);
    const sourceStart = nonNegativeFrameV1(shape.startFromSound);
    const duration = nonNegativeFrameV1(overlay.durationInFrames);
    const sourceEnd = sourceStart + duration;
    for (const beat of beats) {
      if (beat.frame < sourceStart || beat.frame >= sourceEnd) continue;
      const frame = timelineStart + beat.frame - sourceStart;
      const existing = projected.get(frame);
      projected.set(frame, {
        frame,
        isDownbeat: existing?.isDownbeat === true || beat.isDownbeat,
      });
    }
  }
  return [...projected.values()].sort((left, right) => left.frame - right.frame);
}

function captionPhraseBoundaryFramesV1(overlays: readonly Overlay[], fps: number): number[] {
  return overlays
    .flatMap((overlay) => {
      const captions = (overlay as Overlay & {
        captions?: Array<{ endMs?: unknown }>;
      }).captions;
      if (overlay.type !== 'caption' || !Array.isArray(captions)) return [];
      return captions.map((caption) => (
        typeof caption.endMs === 'number' && Number.isFinite(caption.endMs)
          ? Math.round(nonNegativeFrameV1(overlay.from) + (caption.endMs / 1000) * fps)
          : null
      ));
    })
    .filter((frame): frame is number => Number.isFinite(frame));
}

function nonNegativeFrameV1(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}
