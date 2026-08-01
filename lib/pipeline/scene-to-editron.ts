/**
 * Scene-to-Editron Converter v2
 *
 * Converts SceneDescriptor arrays into Editron overlay arrays with proper
 * row-based timeline structure and sub-shot cutting support.
 *
 * ROW LAYOUT (standardized):
 *   Row 0: SFX (sound effects)
 *   Row 1: BGM (background music) — full-length track
 *   Row 2: Video clips (base video track) — cut/stitched per script
 *   Row 3: Voiceover (per-scene narration audio)
 *   Row 4: Captions (single row, proper caption overlays)
 *   Row 5: Transitions (overlap zone between video clips on Row 2)
 *   Row 6: Motion graphics / stickers / overlays
 *
 * GENERATION UNIT SYSTEM:
 * - Scenes with the same generationUnitId share ONE generated video
 * - The primaryVisualForUnit scene gets the video generation call
 * - Sub-shots cut the 5s generated clip into multiple timeline segments
 * - Non-primary scenes reuse the same video with different in/out points
 */

import type { SceneDescriptor, SubShot } from './schemas/storyboard';
import {
  buildOverlayAtomicReceipt,
  overlayAtom,
  type AtomicOverlayAtom,
  type AtomicOverlayFamily,
} from '../editron/engine/atomic-overlay-core';

// ─── Constants ─────────────────────────────────────────────────

export const ROW = {
  SFX: 0,
  BGM: 1,
  VIDEO: 2,
  VOICEOVER: 3,
  CAPTIONS: 4,
  TRANSITIONS: 5,
  MOTION_GRAPHICS: 6,
} as const;

interface EditronConvertOptions {
  fps: number;
  width: number;
  height: number;
}

export interface StoryboardImage {
  sceneIndex: number;
  imageUrl: string;
  assetId?: string;
}

// Background gradient presets based on mood
const MOOD_GRADIENTS: Record<string, { from: string; to: string }> = {
  energetic: { from: '#ff6b35', to: '#f72585' },
  calm: { from: '#1a535c', to: '#4ecdc4' },
  serious: { from: '#1a1a2e', to: '#16213e' },
  playful: { from: '#7209b7', to: '#f72585' },
  dramatic: { from: '#0d0d0d', to: '#1a1a2e' },
  mysterious: { from: '#1a0a2e', to: '#0d1b2a' },
  inspirational: { from: '#1a3a5c', to: '#4ecdc4' },
  neutral: { from: '#0f0c29', to: '#302b63' },
};

let overlayIdCounter = 1;
function nextId(): number { return overlayIdCounter++; }

function pushSceneOverlay(
  overlays: any[],
  overlay: any,
  scene: SceneDescriptor,
  input: {
    family: AtomicOverlayFamily;
    intent: string;
    reason: string;
    source?: string;
    signals?: Record<string, unknown>;
    atoms?: AtomicOverlayAtom[];
  },
): void {
  const existingReceipts = Array.isArray(overlay.metadata?.atomicOverlayReceipts)
    ? overlay.metadata.atomicOverlayReceipts
    : [];
  const receipt = buildOverlayAtomicReceipt({
    family: input.family,
    intent: input.intent,
    frame: overlay.from,
    durationFrames: overlay.durationInFrames,
    source: input.source ?? 'scene-to-editron',
    reason: input.reason,
    signals: input.signals ?? sceneSignals(scene, input.family),
    target: {
      overlayId: overlay.id,
      row: overlay.row,
      x: overlay.left,
      y: overlay.top,
      width: overlay.width,
      height: overlay.height,
    },
    payload: {
      sceneIndex: scene.sceneIndex,
      sceneType: (scene as any).sceneType || 'continuous',
      generationUnitId: (scene as any).generationUnitId,
    },
    atoms: [
      ...sceneOverlayAtoms(overlay, scene, input.family),
      ...(input.atoms ?? []),
    ],
  });

  overlay.metadata = {
    ...(overlay.metadata ?? {}),
    atomicOverlayReceipt: receipt,
    atomicOverlayReceipts: [...existingReceipts, receipt],
    atomicPlanObserveMode: true,
  };
  overlays.push(overlay);
}

function sceneSignals(scene: SceneDescriptor, family: AtomicOverlayFamily): Record<string, unknown> {
  const sceneType = (scene as any).sceneType || 'continuous';
  const narration = scene.narration || '';
  const textCoverage = family === 'text'
    ? Math.min(narration.length / 900, 0.72)
    : sceneType === 'text-card' || sceneType === 'logo-reveal'
      ? 0.38
      : 0;
  const motionHint = scene.cameraDirection || scene.videoMotionPrompt || scene.editDirections?.cameraRig;

  return {
    visual_complexity: sceneType === 'montage' ? 0.62 : sceneType === 'text-card' ? 0.5 : 0.32,
    text_on_screen: textCoverage > 0 ? 1 : 0,
    text_coverage: textCoverage,
    speech_energy: narration.trim() ? 0.56 : 0,
    word_importance: narration.trim() ? Math.min(narration.split(/\s+/).length / 42, 1) : 0,
    emotional_arousal: moodArousal(scene.mood),
    rhythm_density: pacingDensity(scene.editDirections?.pacing),
    visual_action_type: motionHint ? 'motion-directed' : undefined,
    visual_motion_type: motionHint ? 'camera_moving' : undefined,
    brand_vibe: scene.mood,
    screen_region: family === 'text' ? 'lower-third' : 'full-frame',
    safe_zone: family === 'text' ? 'caption-band' : 'full-frame',
  };
}

function sceneOverlayAtoms(overlay: any, scene: SceneDescriptor, family: AtomicOverlayFamily): AtomicOverlayAtom[] {
  const atoms: AtomicOverlayAtom[] = [
    overlayAtom('scene-index', 'scene.index', scene.sceneIndex, 1, 'edl'),
    overlayAtom('scene-title', 'scene.title', scene.title || '', scene.title ? 1 : 0, 'transcript'),
    overlayAtom('scene-type', 'scene.type', (scene as any).sceneType || 'continuous', 1, 'edl'),
    overlayAtom('content-channel', 'overlay.family', family, 1, 'edl'),
    overlayAtom('overlay-row', 'overlay.row', overlay.row, 1, 'layout-analysis'),
    overlayAtom('position-x', 'overlay.x', overlay.left ?? 0, 1, 'layout-analysis'),
    overlayAtom('position-y', 'overlay.y', overlay.top ?? 0, 1, 'layout-analysis'),
    overlayAtom('size-width', 'overlay.width', overlay.width ?? 0, 1, 'layout-analysis'),
    overlayAtom('size-height', 'overlay.height', overlay.height ?? 0, 1, 'layout-analysis'),
  ];

  if (overlay.styles?.opacity !== undefined) {
    atoms.push(overlayAtom('opacity', 'overlay.opacity', Number(overlay.styles.opacity), 1, 'decision-param'));
  }
  if (overlay.styles?.volume !== undefined) {
    atoms.push(overlayAtom('volume', 'audio.volume', Number(overlay.styles.volume), 1, 'decision-param'));
  }
  if (overlay.assetId) {
    atoms.push(overlayAtom('asset-id', 'media.asset_id', overlay.assetId, 1, 'edl'));
  }
  if (overlay.src) {
    atoms.push(overlayAtom('media-source', 'media.src', overlay.src, 1, 'edl'));
  }
  if (typeof overlay.content === 'string' && overlay.content.trim()) {
    atoms.push(overlayAtom('text-content', 'content.text', overlay.content.slice(0, 240), 1, 'transcript'));
  }

  return atoms;
}

function moodArousal(mood: string | undefined): number {
  switch ((mood || '').toLowerCase()) {
    case 'energetic':
    case 'dramatic':
    case 'playful':
      return 0.78;
    case 'inspirational':
    case 'mysterious':
      return 0.58;
    case 'calm':
      return 0.24;
    case 'serious':
      return 0.38;
    default:
      return 0.45;
  }
}

function pacingDensity(pacing: NonNullable<SceneDescriptor['editDirections']>['pacing'] | undefined): number {
  switch (pacing) {
    case 'fast':
    case 'beat-synced':
      return 0.82;
    case 'building':
      return 0.68;
    case 'slow':
      return 0.28;
    case 'medium':
      return 0.5;
    default:
      return 0.45;
  }
}

// ─── Main Converter ────────────────────────────────────────────

/**
 * Convert scenes into Editron overlays with proper row-based layout.
 *
 * For each scene/generation unit creates:
 *   - Row 2: Video/image overlays (with sub-shot cutting if applicable)
 *   - Row 3: Voiceover placeholder (actual audio added by TTS worker)
 *   - Row 4: Caption text overlay for narration
 *
 * BGM (Row 1), SFX (Row 0), Transitions (Row 5), and Motion Graphics (Row 6)
 * are added by the Director Agent / edit-direction-applier, not here.
 */
export function scenesToOverlays(
  scenes: SceneDescriptor[],
  options: EditronConvertOptions,
  storyboardImages?: StoryboardImage[],
): any[] {
  overlayIdCounter = 1;
  const { fps, width, height } = options;
  const overlays: any[] = [];
  let currentFrame = 0;

  // Build image lookup
  const imageMap = new Map<number, StoryboardImage>();
  if (storyboardImages) {
    for (const img of storyboardImages) {
      imageMap.set(img.sceneIndex, img);
    }
  }

  // Track generation units to avoid duplicate video placement
  const _placedUnits = new Set<string>();

  for (const scene of scenes) {
    const sceneDurationFrames = Math.round(scene.durationSeconds * fps);
    const sbImage = imageMap.get(scene.sceneIndex);
    const unitId = (scene as any).generationUnitId || `scene_${scene.sceneIndex}`;
    const isPrimary = (scene as any).primaryVisualForUnit !== false;
    const subShots: SubShot[] = (scene as any).subShots || [];
    const sceneType = (scene as any).sceneType || 'continuous';

    // ─── Row 2: Video/Image Track ────────────────────────────

    if (sceneType === 'montage' && subShots.length > 0) {
      // MONTAGE: Cut one video into multiple sub-shot segments
      let subFrame = currentFrame;
      for (const sub of subShots) {
        const subDur = Math.round(sub.targetDurationSeconds * fps);
        if (sbImage) {
          pushSceneOverlay(overlays, {
            id: nextId(),
            type: 'image',
            from: subFrame,
            durationInFrames: subDur,
            row: ROW.VIDEO,
            left: 0, top: 0, width, height,
            isDragging: false, rotation: 0,
            src: sbImage.imageUrl,
            assetId: sbImage.assetId,
            styles: { opacity: 1, objectFit: 'cover' },
            metadata: {
              generationUnitId: unitId,
              subShotDescription: sub.description,
              subShotStart: sub.startNormalized,
              subShotEnd: sub.endNormalized,
              sceneIndex: scene.sceneIndex,
              sceneType,
            },
          }, scene, {
            family: 'image',
            intent: 'scene-subshot-visual',
            reason: 'montage sub-shot image overlay from storyboard media',
            signals: { ...sceneSignals(scene, 'image'), visual_action_type: sub.description },
          });
        } else {
          // Placeholder for sub-shot (will be replaced when video arrives)
          const gradient = MOOD_GRADIENTS[scene.mood] || MOOD_GRADIENTS.neutral;
          pushSceneOverlay(overlays, {
            id: nextId(),
            type: 'html-scene',
            from: subFrame,
            durationInFrames: subDur,
            row: ROW.VIDEO,
            left: 0, top: 0, width, height,
            isDragging: false, rotation: 0,
            content: `<div style="width:100%;height:100%;background:linear-gradient(135deg,${gradient.from},${gradient.to});display:flex;align-items:center;justify-content:center;"><span style="color:rgba(255,255,255,0.3);font-size:24px;font-family:sans-serif;">${sub.description}</span></div>`,
            styles: { opacity: 1 },
            metadata: {
              generationUnitId: unitId,
              subShotDescription: sub.description,
              subShotStart: sub.startNormalized,
              subShotEnd: sub.endNormalized,
              sceneIndex: scene.sceneIndex,
              sceneType,
            },
          }, scene, {
            family: 'html-scene',
            intent: 'scene-subshot-placeholder',
            reason: 'montage sub-shot html placeholder until generated media is available',
            signals: { ...sceneSignals(scene, 'html-scene'), text_on_screen: 1, text_coverage: Math.min(sub.description.length / 360, 0.55) },
          });
        }
        subFrame += subDur;
      }
    } else {
      // CONTINUOUS / LOGO / TEXT-CARD / TALKING-HEAD: One overlay for the full scene
      if (sbImage) {
        pushSceneOverlay(overlays, {
          id: nextId(),
          type: 'image',
          from: currentFrame,
          durationInFrames: sceneDurationFrames,
          row: ROW.VIDEO,
          left: 0, top: 0, width, height,
          isDragging: false, rotation: 0,
          src: sbImage.imageUrl,
          assetId: sbImage.assetId,
          styles: { opacity: 1, objectFit: 'cover' },
          metadata: {
            generationUnitId: unitId,
            sceneIndex: scene.sceneIndex,
            sceneType,
            isPrimaryVisual: isPrimary,
          },
        }, scene, {
          family: 'image',
          intent: 'scene-visual',
          reason: 'scene image overlay from storyboard media',
        });
      } else {
        const gradient = MOOD_GRADIENTS[scene.mood] || MOOD_GRADIENTS.neutral;
        pushSceneOverlay(overlays, {
          id: nextId(),
          type: 'html-scene',
          from: currentFrame,
          durationInFrames: sceneDurationFrames,
          row: ROW.VIDEO,
          left: 0, top: 0, width, height,
          isDragging: false, rotation: 0,
          content: `<div style="width:100%;height:100%;background:linear-gradient(135deg,${gradient.from},${gradient.to});display:flex;align-items:center;justify-content:center;"><span style="color:rgba(255,255,255,0.15);font-size:48px;font-family:sans-serif;">${scene.title}</span></div>`,
          styles: { opacity: 1 },
          metadata: {
            generationUnitId: unitId,
            sceneIndex: scene.sceneIndex,
            sceneType,
          },
        }, scene, {
          family: 'html-scene',
          intent: 'scene-placeholder',
          reason: 'html placeholder until generated media is available',
          signals: { ...sceneSignals(scene, 'html-scene'), text_on_screen: 1, text_coverage: Math.min(scene.title.length / 360, 0.5) },
        });
      }
    }

    // ─── Row 3: Voiceover Placeholder ────────────────────────
    // Actual audio gets added by TTS worker. This reserves the slot.
    if (scene.narration && scene.narration.trim()) {
      pushSceneOverlay(overlays, {
        id: nextId(),
        type: 'sound',
        from: currentFrame,
        durationInFrames: sceneDurationFrames,
        row: ROW.VOICEOVER,
        left: 0, top: 0, width: 200, height: 40,
        isDragging: false, rotation: 0,
        src: '', // TTS worker fills this
        content: `VO: ${scene.narration.substring(0, 50)}...`,
        styles: { opacity: 1 },
        metadata: {
          isVoiceover: true,
          sceneIndex: scene.sceneIndex,
          narrationText: scene.narration,
          generationUnitId: unitId,
        },
      }, scene, {
        family: 'sound',
        intent: 'scene-voiceover-slot',
        reason: 'voiceover placeholder reserved for scene narration audio',
      });
    }

    // ─── Row 4: Caption Text ─────────────────────────────────
    // Simple text overlay for narration. Director Agent upgrades to
    // proper caption overlays with word timing after TTS completes.
    if (scene.narration && scene.narration.trim()) {
      pushSceneOverlay(overlays, {
        id: nextId(),
        type: 'text',
        from: currentFrame,
        durationInFrames: sceneDurationFrames,
        row: ROW.CAPTIONS,
        left: Math.round(width * 0.05),
        top: Math.round(height * 0.82),
        width: Math.round(width * 0.9),
        height: Math.round(height * 0.14),
        isDragging: false, rotation: 0,
        content: scene.narration,
        styles: {
          fontSize: '28',
          fontFamily: 'font-sans',
          fontWeight: '500',
          color: '#ffffff',
          backgroundColor: 'rgba(0,0,0,0.6)',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'center',
          opacity: 1,
          borderRadius: '8px',
          padding: '12px',
          animation: { enter: 'fade', exit: 'fade', duration: 10 },
        },
        metadata: {
          sceneIndex: scene.sceneIndex,
          isNarrationCaption: true,
        },
      }, scene, {
        family: 'text',
        intent: 'scene-narration-caption',
        reason: 'readable narration caption generated from scene text',
        signals: { ...sceneSignals(scene, 'text'), text_on_screen: 1 },
      });
    }

    // Advance timeline cursor.
    // For montage sub-shots: use the ACTUAL total sub-shot duration, not the scene's durationSeconds.
    // Scene durationSeconds can be shorter than the sum of sub-shot durations (e.g., scene=5s but 3 sub-shots × 3s = 9s).
    // Using the shorter value causes the NEXT scene to overlap the last sub-shots → interleaving bug.
    if (sceneType === 'montage' && subShots.length > 0) {
      const totalSubDur = subShots.reduce((sum: number, s: SubShot) => sum + Math.round(s.targetDurationSeconds * fps), 0);
      currentFrame += Math.max(totalSubDur, sceneDurationFrames);
    } else {
      currentFrame += sceneDurationFrames;
    }
  }

  return overlays;
}

/**
 * Calculate total duration in frames from a scenes array.
 */
export function scenesToTotalFrames(scenes: SceneDescriptor[], fps: number): number {
  return scenes.reduce((sum, s) => {
    const subShots = (s as any).subShots || [];
    const sceneType = (s as any).sceneType || 'continuous';
    if (sceneType === 'montage' && subShots.length > 0) {
      const totalSubDur = subShots.reduce((subSum: number, sub: any) => subSum + Math.round(sub.targetDurationSeconds * fps), 0);
      return sum + Math.max(totalSubDur, Math.round(s.durationSeconds * fps));
    }
    return sum + Math.round(s.durationSeconds * fps);
  }, 0);
}

// ─── Beat-Synced Cutting ──────────────────────────────────────────

interface BeatInfo {
  /** Beat position in frames */
  frame: number;
  /** Is this a downbeat (strong beat)? */
  isDownbeat: boolean;
}

export type BeatAlignmentRejectionReason =
  | 'not-contiguous'
  | 'already-aligned'
  | 'outside-snap-window'
  | 'speech-boundary-priority'
  | 'metronomic-run-limit'
  | 'minimum-clip-duration'
  | 'missing-source-duration'
  | 'insufficient-source-handle';

export interface BeatAlignmentOptions {
  /** Restrict alignment to the visual track containing this overlay. */
  targetOverlayId?: string | number;
  /** Maximum distance from an existing cut to a licensed beat. */
  maxSnapFrames?: number;
  /** Minimum duration retained on both sides of a shifted boundary. */
  minClipFrames?: number;
  /** Skip an alignment after this many consecutive beat-locked boundaries. */
  maxConsecutiveBeatCuts?: number;
  /** Existing semantic/speech boundaries that must not be displaced. */
  protectedBoundaryFrames?: readonly number[];
  protectedBoundaryToleranceFrames?: number;
  /** Source durations used to prove that a boundary has enough trim handle. */
  sourceDurationFramesByAssetId?: Readonly<Record<string, number>>;
  /** Reject shifts that cannot prove source trim handles. */
  requireSourceHandles?: boolean;
}

export interface BeatAlignmentChange {
  clipAId: string | number;
  clipBId: string | number;
  originalFrame: number;
  alignedFrame: number;
  beatFrame: number;
  shiftFrames: number;
  transitionOverlayIds: Array<string | number>;
}

export interface BeatAlignmentRejection {
  clipAId: string | number;
  clipBId: string | number;
  boundaryFrame: number;
  beatFrame?: number;
  reason: BeatAlignmentRejectionReason;
}

export interface BeatAlignmentResult {
  snappedCount: number;
  trackOverlayIds: Array<string | number>;
  changes: BeatAlignmentChange[];
  rejections: BeatAlignmentRejection[];
}

/**
 * Align primary visual-track cut points to the nearest beats in the BGM.
 *
 * For each contiguous video/image boundary, finds the closest beat and snaps
 * the cut to it. The outer timeline envelope remains unchanged.
 *
 * @param overlays - All project overlays (modifies the selected primary visual track in place)
 * @param beats - Beat positions from beat detection service
 * @param fps - Frames per second
 * @returns Number of cuts that were snapped to beats
 */
export function alignCutsToBeats(
  overlays: any[],
  beats: BeatInfo[],
  fps: number = 30,
): number {
  return alignCutsToBeatsWithEvidence(overlays, beats, fps).snappedCount;
}

/**
 * Align existing visual boundaries and return an auditable result. This is the
 * single physical owner for beat-aligned cut timing; callers decide whether
 * the evidence is trustworthy and how the resulting project write is made.
 */
export function alignCutsToBeatsWithEvidence(
  overlays: any[],
  beats: BeatInfo[],
  fps: number = 30,
  options: BeatAlignmentOptions = {},
): BeatAlignmentResult {
  const visualTrack = selectPrimaryVisualTrack(overlays, options.targetOverlayId);
  const result: BeatAlignmentResult = {
    snappedCount: 0,
    trackOverlayIds: visualTrack.map((overlay) => overlay.id),
    changes: [],
    rejections: [],
  };
  if (visualTrack.length < 2 || beats.length === 0) return result;

  const orderedBeats = beats
    .filter((beat) => Number.isFinite(beat?.frame))
    .map((beat) => ({ ...beat, frame: Math.round(beat.frame) }))
    .sort((left, right) => left.frame - right.frame);
  const maxSnapFrames = Math.max(0, Math.round(options.maxSnapFrames ?? fps * 0.5));
  const minClipFrames = Math.max(1, Math.round(options.minClipFrames ?? fps));
  const maxConsecutive = Math.max(1, Math.round(options.maxConsecutiveBeatCuts ?? 4));
  const protectedTolerance = Math.max(0, Math.round(options.protectedBoundaryToleranceFrames ?? 2));
  const protectedFrames = (options.protectedBoundaryFrames ?? [])
    .filter(Number.isFinite)
    .map((frame) => Math.round(frame));
  const usedBeatFrames = new Set<number>();
  let consecutiveBeatCuts = 0;

  for (let index = 1; index < visualTrack.length; index++) {
    const previous = visualTrack[index - 1];
    const current = visualTrack[index];
    const boundaryFrame = Math.round(current.from);
    if (Math.round(previous.from + previous.durationInFrames) !== boundaryFrame) {
      consecutiveBeatCuts = 0;
      reject(result, previous, current, boundaryFrame, 'not-contiguous');
      continue;
    }

    const nearestBeat = nearestUnusedBeat(orderedBeats, boundaryFrame, usedBeatFrames);
    if (!nearestBeat) {
      consecutiveBeatCuts = 0;
      continue;
    }
    const distance = Math.abs(nearestBeat.frame - boundaryFrame);
    if (distance === 0) {
      usedBeatFrames.add(nearestBeat.frame);
      consecutiveBeatCuts++;
      reject(result, previous, current, boundaryFrame, 'already-aligned', nearestBeat.frame);
      continue;
    }
    if (distance > maxSnapFrames) {
      consecutiveBeatCuts = 0;
      reject(result, previous, current, boundaryFrame, 'outside-snap-window', nearestBeat.frame);
      continue;
    }
    if (isProtectedBoundary(boundaryFrame, protectedFrames, protectedTolerance)) {
      consecutiveBeatCuts = 0;
      reject(result, previous, current, boundaryFrame, 'speech-boundary-priority', nearestBeat.frame);
      continue;
    }
    if (consecutiveBeatCuts >= maxConsecutive) {
      consecutiveBeatCuts = 0;
      reject(result, previous, current, boundaryFrame, 'metronomic-run-limit', nearestBeat.frame);
      continue;
    }

    const shiftFrames = nearestBeat.frame - boundaryFrame;
    const previousDuration = previous.durationInFrames + shiftFrames;
    const currentDuration = current.durationInFrames - shiftFrames;
    if (previousDuration < minClipFrames || currentDuration < minClipFrames) {
      consecutiveBeatCuts = 0;
      reject(result, previous, current, boundaryFrame, 'minimum-clip-duration', nearestBeat.frame);
      continue;
    }
    const handleFailure = sourceHandleFailure(previous, current, shiftFrames, options);
    if (handleFailure) {
      consecutiveBeatCuts = 0;
      reject(result, previous, current, boundaryFrame, handleFailure, nearestBeat.frame);
      continue;
    }

    previous.durationInFrames = previousDuration;
    current.from += shiftFrames;
    current.durationInFrames = currentDuration;
    advanceIncomingSourceStart(current, shiftFrames);
    const transitionOverlayIds = moveLinkedTransitions(
      overlays,
      previous.id,
      current.id,
      boundaryFrame,
      shiftFrames,
    );
    usedBeatFrames.add(nearestBeat.frame);
    consecutiveBeatCuts++;
    result.changes.push({
      clipAId: previous.id,
      clipBId: current.id,
      originalFrame: boundaryFrame,
      alignedFrame: nearestBeat.frame,
      beatFrame: nearestBeat.frame,
      shiftFrames,
      transitionOverlayIds,
    });
  }

  result.snappedCount = result.changes.length;
  return result;
}

function selectPrimaryVisualTrack(overlays: any[], targetOverlayId?: string | number): any[] {
  const candidates = overlays.filter((overlay) => (
    (overlay?.type === 'video' || overlay?.type === 'image')
    && Number.isFinite(overlay?.from)
    && Number.isFinite(overlay?.durationInFrames)
    && overlay.durationInFrames > 0
  ));
  const target = targetOverlayId == null
    ? null
    : candidates.find((overlay) => String(overlay.id) === String(targetOverlayId));
  if (target) {
    const targetKey = visualTrackKey(target);
    return candidates
      .filter((overlay) => visualTrackKey(overlay) === targetKey)
      .sort((left, right) => left.from - right.from);
  }

  const groups = new Map<string, any[]>();
  for (const overlay of candidates) {
    const key = visualTrackKey(overlay);
    const group = groups.get(key) ?? [];
    group.push(overlay);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => group.sort((left, right) => left.from - right.from))
    .sort((left, right) => {
      const boundaryDelta = contiguousBoundaryCount(right) - contiguousBoundaryCount(left);
      if (boundaryDelta !== 0) return boundaryDelta;
      if (right.length !== left.length) return right.length - left.length;
      return visualCoverage(right) - visualCoverage(left);
    })[0] ?? [];
}

function visualTrackKey(overlay: any): string {
  if (overlay?.row != null) return `row:${String(overlay.row)}`;
  if (overlay?.metadata?.isMontageSub === true) return 'legacy-montage';
  return `rowless:${String(overlay?.id)}`;
}

function contiguousBoundaryCount(track: any[]): number {
  let count = 0;
  for (let index = 1; index < track.length; index++) {
    if (Math.round(track[index - 1].from + track[index - 1].durationInFrames) === Math.round(track[index].from)) {
      count++;
    }
  }
  return count;
}

function visualCoverage(track: any[]): number {
  return track.reduce((sum, overlay) => sum + Math.max(0, Number(overlay.durationInFrames) || 0), 0);
}

function nearestUnusedBeat(beats: BeatInfo[], frame: number, used: Set<number>): BeatInfo | null {
  let nearest: BeatInfo | null = null;
  let distance = Infinity;
  for (const beat of beats) {
    if (used.has(beat.frame)) continue;
    const candidateDistance = Math.abs(beat.frame - frame);
    if (candidateDistance < distance) {
      nearest = beat;
      distance = candidateDistance;
    }
  }
  return nearest;
}

function isProtectedBoundary(frame: number, protectedFrames: number[], tolerance: number): boolean {
  return protectedFrames.some((protectedFrame) => Math.abs(protectedFrame - frame) <= tolerance);
}

function sourceHandleFailure(
  previous: any,
  current: any,
  shiftFrames: number,
  options: BeatAlignmentOptions,
): 'missing-source-duration' | 'insufficient-source-handle' | null {
  if (!options.requireSourceHandles || shiftFrames === 0) return null;
  if (shiftFrames < 0 && current?.type === 'video') {
    const sourceStart = finiteFrame(current.sourceStartFrame ?? current.videoStartTime) ?? 0;
    return sourceStart + shiftFrames < 0 ? 'insufficient-source-handle' : null;
  }
  if (shiftFrames > 0 && previous?.type === 'video') {
    const assetId = typeof previous.assetId === 'string' ? previous.assetId : '';
    const sourceDuration = assetId ? options.sourceDurationFramesByAssetId?.[assetId] : undefined;
    if (!Number.isFinite(sourceDuration)) return 'missing-source-duration';
    const sourceStart = finiteFrame(previous.sourceStartFrame ?? previous.videoStartTime) ?? 0;
    const sourceEnd = sourceStart + Math.max(0, Math.round(previous.durationInFrames));
    return sourceEnd + shiftFrames > Math.round(sourceDuration as number)
      ? 'insufficient-source-handle'
      : null;
  }
  return null;
}

function advanceIncomingSourceStart(overlay: any, shiftFrames: number): void {
  if (overlay?.type !== 'video' || shiftFrames === 0) return;
  const sourceStart = finiteFrame(overlay.sourceStartFrame ?? overlay.videoStartTime) ?? 0;
  const nextSourceStart = sourceStart + shiftFrames;
  overlay.sourceStartFrame = nextSourceStart;
  overlay.videoStartTime = nextSourceStart;
}

function moveLinkedTransitions(
  overlays: any[],
  clipAId: string | number,
  clipBId: string | number,
  previousBoundaryFrame: number,
  shiftFrames: number,
): Array<string | number> {
  const moved: Array<string | number> = [];
  for (const overlay of overlays) {
    if (overlay?.type !== 'transition') continue;
    const linked = String(overlay.clipAId) === String(clipAId)
      && String(overlay.clipBId) === String(clipBId);
    const legacyAtBoundary = overlay.clipAId == null
      && overlay.clipBId == null
      && Math.abs((finiteFrame(overlay.from) ?? Infinity) - previousBoundaryFrame) <= 1;
    if (!linked && !legacyAtBoundary) continue;
    if (Number.isFinite(overlay.from)) overlay.from += shiftFrames;
    if (Number.isFinite(overlay.boundaryFrame)) overlay.boundaryFrame += shiftFrames;
    if (Number.isFinite(overlay.metadata?.boundaryFrame)) overlay.metadata.boundaryFrame += shiftFrames;
    moved.push(overlay.id);
  }
  return moved;
}

function reject(
  result: BeatAlignmentResult,
  previous: any,
  current: any,
  boundaryFrame: number,
  reason: BeatAlignmentRejectionReason,
  beatFrame?: number,
): void {
  result.rejections.push({
    clipAId: previous.id,
    clipBId: current.id,
    boundaryFrame,
    ...(beatFrame == null ? {} : { beatFrame }),
    reason,
  });
}

function finiteFrame(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}
