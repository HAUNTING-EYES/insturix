/**
 * Edit Direction Applier
 *
 * Takes the base overlay assembly from finalize and applies edit directions:
 * - CSS filter presets to image/video overlays
 * - Pacing adjustments (duration scaling)
 * - Transition overlays between scenes
 * - SFX cue enhancement
 *
 * Called after base overlays are built but before BGM/SFX generation.
 */

import type { SceneEditDirections, GlobalEditDirections } from './schemas/storyboard';
import { getFilterPresetById, resolveFilterFromDescription } from '@/lib/editron/data/filter-presets';
// Transition imports removed — transitions now handled exclusively by Director/EDL
// (see comment in section 3 below). Old imports: buildTransitionOverlay,
// normalizeTransitionType, DEFAULT_TRANSITION_FRAMES, TransitionType.
import { ROW } from './scene-to-editron';

interface SceneFrameInfo {
  sceneIndex: number;
  fromFrame: number;
  durationFrames: number;
}

/**
 * Apply edit directions to the overlay assembly.
 * Mutates the overlays array in place (adds transitions, modifies filters).
 *
 * @returns Updated overlays array + any modified frame positions
 */
export async function applyEditDirections(
  overlays: any[],
  scenes: Array<{ sceneIndex: number; editDirections?: SceneEditDirections; audioDescription?: string }>,
  sceneFrameMap: SceneFrameInfo[],
  globalDirections: GlobalEditDirections | undefined,
  width: number,
  height: number,
  fps: number = 30,
): Promise<{ overlays: any[]; totalFrameShift: number }> {
  let nextOverlayId = Math.max(...overlays.map(o => o.id || 0), 0) + 1;
  let totalFrameShift = 0;

  // ─── Mood → filter fallback mapping ─────────────────────────
  // IMPORTANT: Only map to presets that preserve natural skin tones. Any preset using
  // hue-rotate >30deg (teal-orange, blade-runner, neon-nights, cool) is stylistic and
  // must NOT be selected by generic mood inference — it shifts skin color disastrously
  // on nostalgia/commercial content. See Phase A3.5.4 and creative_production_knowledge.md §6.
  const moodFilterMap: Record<string, string> = {
    'dramatic': 'desaturated-drama',
    'serious': 'muted-doc',
    'mysterious': 'desaturated-drama', // was 'noir' (full grayscale) — too heavy for most emotional moods
    'calm': 'golden-hour-pro',
    'inspirational': 'golden-hour-pro',
    'energetic': 'vivid',
    'playful': 'vivid',
    'neutral': 'clean-corporate',
  };

  // ─── 1. Apply filters ───────────────────────────────────────
  const globalFilterId = globalDirections?.defaultFilterPresetId
    || (globalDirections?.colorGrade ? resolveFilterFromDescription(globalDirections.colorGrade) : undefined);

  for (const scene of scenes) {
    // Priority: explicit scene filter > global filter > mood-based fallback
    const filterPresetId = scene.editDirections?.filterPresetId
      || globalFilterId
      || ((scene as any).mood ? moodFilterMap[(scene as any).mood] : undefined);
    if (!filterPresetId) continue;

    const preset = getFilterPresetById(filterPresetId);
    if (!preset || preset.id === 'none') continue;

    // Apply to all image and video overlays for this scene
    const frameInfo = sceneFrameMap.find(f => f.sceneIndex === scene.sceneIndex);
    if (!frameInfo) continue;

    for (const overlay of overlays) {
      if ((overlay.type === 'image' || overlay.type === 'video') &&
          overlay.row === ROW.VIDEO &&
          overlay.from >= frameInfo.fromFrame &&
          overlay.from < frameInfo.fromFrame + frameInfo.durationFrames) {
        overlay.styles = { ...overlay.styles, filter: preset.filter };
      }
    }
  }

  // ─── 2. Apply pacing adjustments (per-scene + global) ───────
  // Per-scene pacing from script editDirections takes precedence over global
  const pacingMultiplierMap: Record<string, number> = {
    'fast': 0.85,
    'slow': 1.2,
    'building': 0.95,
    'beat-synced': 1.0,
    'medium': 1.0,
  };
  const globalPacingMult = (globalDirections?.pacing ? (pacingMultiplierMap[globalDirections.pacing] ?? 1.0) : 1.0);

  {
    let frameShift = 0;
    let anyPacingApplied = false;

    for (const info of sceneFrameMap) {
      const scene = scenes.find(s => s.sceneIndex === info.sceneIndex);
      const scenePacing = scene?.editDirections?.pacing;
      const multiplier = scenePacing
        ? (pacingMultiplierMap[scenePacing] || 1.0)
        : globalPacingMult;

      if (multiplier === 1.0) {
        // Still need to shift by accumulated frameShift from previous scenes
        const sceneOverlays = overlays.filter(o =>
          o.from >= info.fromFrame && o.from < info.fromFrame + info.durationFrames,
        );
        for (const overlay of sceneOverlays) {
          overlay.from += frameShift;
        }
        continue;
      }

      anyPacingApplied = true;
      const sceneOverlays = overlays.filter(o =>
        o.from >= info.fromFrame && o.from < info.fromFrame + info.durationFrames,
      );

      const originalDuration = info.durationFrames;
      const newDuration = Math.max(30, Math.round(originalDuration * multiplier));
      const frameDelta = newDuration - originalDuration;

      for (const overlay of sceneOverlays) {
        if (overlay.type === 'video' || overlay.type === 'image') {
          overlay.durationInFrames = Math.max(30, Math.round(overlay.durationInFrames * multiplier));
        }
        overlay.from += frameShift;
      }

      frameShift += frameDelta;
    }

    if (anyPacingApplied) {
      totalFrameShift += frameShift;
      console.log(`[EditDirections] Per-scene pacing applied, totalShift=${totalFrameShift} frames`);
    }
  }

  // ─── 3. Transitions — DISABLED (single source of truth: Director/EDL) ────
  // OLD: edit-direction-applier placed clip-overlap transitions here by modifying
  // adjacent clip opacity keyframes. The Director's EDL executor ALSO placed
  // TransitionOverlay tiles on row 5. Neither system detected the other's work,
  // causing double transitions (A3.5.1/A3.5.2).
  //
  // NEW: All transitions are handled by the Director agent (step 6:
  // insert_transition_overlays_by_score). The Director already reads script
  // editDirections.transition hints per scene and uses them as the transition
  // type. This gives us:
  //   - Single source of truth (TransitionOverlay tiles on row 5)
  //   - Visible + editable transitions in the editor timeline
  //   - AI-intelligent placement based on 5-track analysis
  //   - Script intent preserved via editDirections.transition hints
  //
  // The clip-overlap keyframe approach is removed entirely — it was invisible
  // in the editor and caused the duplicate bug.

  // ─── 4. Apply camera/motion keyframes from script directions ──
  // Convert cameraRig and pacing directions into actual keyframe tracks
  // so the video plays with the intended camera movement.
  const CAMERA_KEYFRAMES: Record<string, (durationFrames: number) => any[]> = {
    // Slow push-in → scale 1.0 → 1.08 (subtle zoom)
    'push-in': (d) => [{ property: 'scale', keyframes: [{ frame: 0, value: 1.0, easing: 'ease-in-out' }, { frame: d, value: 1.08, easing: 'linear' }] }],
    'push in': (d) => [{ property: 'scale', keyframes: [{ frame: 0, value: 1.0, easing: 'ease-in-out' }, { frame: d, value: 1.08, easing: 'linear' }] }],
    'zoom in': (d) => [{ property: 'scale', keyframes: [{ frame: 0, value: 1.0, easing: 'ease-in-out' }, { frame: d, value: 1.15, easing: 'linear' }] }],
    'zoom out': (d) => [{ property: 'scale', keyframes: [{ frame: 0, value: 1.1, easing: 'ease-in-out' }, { frame: d, value: 1.0, easing: 'linear' }] }],
    'pull back': (d) => [{ property: 'scale', keyframes: [{ frame: 0, value: 1.1, easing: 'ease-in-out' }, { frame: d, value: 1.0, easing: 'linear' }] }],
    // Dolly/tracking → subtle x position shift
    'dolly': (d) => [{ property: 'x', keyframes: [{ frame: 0, value: -20, easing: 'ease-in-out' }, { frame: d, value: 20, easing: 'linear' }] }],
    'tracking': (d) => [{ property: 'x', keyframes: [{ frame: 0, value: -15, easing: 'ease-in-out' }, { frame: d, value: 15, easing: 'linear' }] }],
    'pan': (d) => [{ property: 'x', keyframes: [{ frame: 0, value: -30, easing: 'ease-in-out' }, { frame: d, value: 30, easing: 'linear' }] }],
    // Rising/crane → subtle y shift upward
    'crane': (d) => [{ property: 'y', keyframes: [{ frame: 0, value: 10, easing: 'ease-in-out' }, { frame: d, value: -10, easing: 'linear' }] }],
    'rising': (d) => [{ property: 'y', keyframes: [{ frame: 0, value: 10, easing: 'ease-in-out' }, { frame: d, value: -10, easing: 'linear' }] }],
  };

  for (const scene of scenes) {
    const cameraRig = scene.editDirections?.cameraRig?.toLowerCase();
    if (!cameraRig) continue;

    const frameInfo = sceneFrameMap.find(f => f.sceneIndex === scene.sceneIndex);
    if (!frameInfo) continue;

    // Find the video overlay for this scene
    const videoOverlay = overlays.find(
      o => o.type === 'video' && o.from >= frameInfo.fromFrame && o.from < frameInfo.fromFrame + frameInfo.durationFrames
    );
    if (!videoOverlay) continue;

    // Match camera direction to keyframe pattern
    for (const [keyword, makeTrack] of Object.entries(CAMERA_KEYFRAMES)) {
      if (cameraRig.includes(keyword)) {
        const tracks = makeTrack(videoOverlay.durationInFrames);
        if (!videoOverlay.keyframeTracks) videoOverlay.keyframeTracks = [];

        // Add tracks (don't replace existing — camera + other keyframes can coexist)
        for (const track of tracks) {
          // Only add if no existing track for this property
          if (!videoOverlay.keyframeTracks.some((t: any) => t.property === track.property)) {
            videoOverlay.keyframeTracks.push(track);
          }
        }

        console.log(`[EditDirections] Camera keyframe applied: "${keyword}" on scene ${scene.sceneIndex}`);
        break; // First match wins
      }
    }
  }

  return { overlays, totalFrameShift };
}
