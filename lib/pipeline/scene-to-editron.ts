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
  const placedUnits = new Set<string>();

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
          overlays.push({
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
          });
        } else {
          // Placeholder for sub-shot (will be replaced when video arrives)
          const gradient = MOOD_GRADIENTS[scene.mood] || MOOD_GRADIENTS.neutral;
          overlays.push({
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
          });
        }
        subFrame += subDur;
      }
    } else {
      // CONTINUOUS / LOGO / TEXT-CARD / TALKING-HEAD: One overlay for the full scene
      if (sbImage) {
        overlays.push({
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
        });
      } else {
        const gradient = MOOD_GRADIENTS[scene.mood] || MOOD_GRADIENTS.neutral;
        overlays.push({
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
        });
      }
    }

    // ─── Row 3: Voiceover Placeholder ────────────────────────
    // Actual audio gets added by TTS worker. This reserves the slot.
    if (scene.narration && scene.narration.trim()) {
      overlays.push({
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
      });
    }

    // ─── Row 4: Caption Text ─────────────────────────────────
    // Simple text overlay for narration. Director Agent upgrades to
    // proper caption overlays with word timing after TTS completes.
    if (scene.narration && scene.narration.trim()) {
      overlays.push({
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

/**
 * Align montage sub-shot cut points to the nearest beats in the BGM.
 *
 * For each sub-shot boundary, finds the closest beat and snaps the cut
 * to it. Preserves total scene duration by redistributing time across sub-shots.
 *
 * @param overlays - All project overlays (modifies montage overlays in place)
 * @param beats - Beat positions from beat detection service
 * @param fps - Frames per second
 * @returns Number of cuts that were snapped to beats
 */
export function alignCutsToBeats(
  overlays: any[],
  beats: BeatInfo[],
  fps: number = 30,
): number {
  if (!beats.length) return 0;

  // Find montage sub-shot overlays (grouped by sceneIndex)
  const montageGroups = new Map<number, any[]>();
  for (const o of overlays) {
    if (o.metadata?.isMontageSub && o.type === 'video') {
      const si = o.metadata.sceneIndex;
      if (!montageGroups.has(si)) montageGroups.set(si, []);
      montageGroups.get(si)!.push(o);
    }
  }

  let snappedCount = 0;
  const SNAP_THRESHOLD = Math.round(fps * 0.5); // Max 0.5s snap distance

  for (const [sceneIndex, group] of montageGroups) {
    if (group.length < 2) continue; // Need at least 2 sub-shots to have a cut point

    // Sort by from frame
    group.sort((a, b) => a.from - b.from);

    // For each cut point (between sub-shots), find nearest beat
    for (let i = 1; i < group.length; i++) {
      const cutFrame = group[i].from;

      // Find nearest beat
      let nearestBeat: BeatInfo | null = null;
      let nearestDist = Infinity;
      for (const beat of beats) {
        const dist = Math.abs(beat.frame - cutFrame);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestBeat = beat;
        }
      }

      // Snap if within threshold
      if (nearestBeat && nearestDist <= SNAP_THRESHOLD && nearestDist > 0) {
        const shift = nearestBeat.frame - cutFrame;

        // Adjust: extend previous sub-shot, shrink current (or vice versa)
        group[i - 1].durationInFrames += shift;
        group[i].from += shift;
        group[i].durationInFrames -= shift;

        // Ensure minimum duration (1s = 30 frames)
        if (group[i].durationInFrames < fps) {
          // Undo if it would make a sub-shot too short
          group[i - 1].durationInFrames -= shift;
          group[i].from -= shift;
          group[i].durationInFrames += shift;
        } else {
          snappedCount++;
        }
      }
    }
  }

  return snappedCount;
}
