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
import { getPresetById } from '@/components/editron/editor/version-7.0.0/templates/common/media-filter-presets';
import { resolveFilterFromDescription } from '@/components/editron/editor/version-7.0.0/templates/common/media-filter-presets';
import {
  buildTransitionOverlay,
  normalizeTransitionType,
  DEFAULT_TRANSITION_FRAMES,
  type TransitionType,
} from '@/lib/editron/data/transition-templates';

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
export function applyEditDirections(
  overlays: any[],
  scenes: Array<{ sceneIndex: number; editDirections?: SceneEditDirections; audioDescription?: string }>,
  sceneFrameMap: SceneFrameInfo[],
  globalDirections: GlobalEditDirections | undefined,
  width: number,
  height: number,
  fps: number = 30,
): { overlays: any[]; totalFrameShift: number } {
  let nextOverlayId = Math.max(...overlays.map(o => o.id || 0), 0) + 1;
  let totalFrameShift = 0;

  // ─── 1. Apply filters ───────────────────────────────────────
  const globalFilterId = globalDirections?.defaultFilterPresetId
    || (globalDirections?.colorGrade ? resolveFilterFromDescription(globalDirections.colorGrade) : undefined);

  for (const scene of scenes) {
    const filterPresetId = scene.editDirections?.filterPresetId || globalFilterId;
    if (!filterPresetId) continue;

    const preset = getPresetById(filterPresetId);
    if (!preset || preset.id === 'none') continue;

    // Apply to all image and video overlays for this scene
    const frameInfo = sceneFrameMap.find(f => f.sceneIndex === scene.sceneIndex);
    if (!frameInfo) continue;

    for (const overlay of overlays) {
      if ((overlay.type === 'image' || overlay.type === 'video') &&
          overlay.from >= frameInfo.fromFrame &&
          overlay.from < frameInfo.fromFrame + frameInfo.durationFrames) {
        overlay.styles = { ...overlay.styles, filter: preset.filter };
      }
    }
  }

  // ─── 2. Apply pacing adjustments ────────────────────────────
  // (Deferred — requires recalculating all frame positions.
  //  Will be implemented when Director Agent can orchestrate
  //  multi-overlay timeline adjustments.)

  // ─── 3. Insert transition overlays ──────────────────────────
  const transitionsToInsert: any[] = [];

  for (let i = 1; i < scenes.length; i++) {
    const scene = scenes[i];
    const prevFrameInfo = sceneFrameMap.find(f => f.sceneIndex === scenes[i - 1].sceneIndex);
    if (!prevFrameInfo) continue;

    // Determine transition type: per-scene > global default > hard-cut
    let transType: TransitionType = 'hard-cut';
    let transDurationMs: number | undefined;

    if (scene.editDirections?.transition) {
      transType = normalizeTransitionType(scene.editDirections.transition.type);
      transDurationMs = scene.editDirections.transition.durationMs;
    } else if (globalDirections?.defaultTransition) {
      transType = normalizeTransitionType(globalDirections.defaultTransition.type);
      transDurationMs = globalDirections.defaultTransition.durationMs;
    }

    if (transType === 'hard-cut') continue; // No overlay needed

    const durationFrames = transDurationMs
      ? Math.round((transDurationMs / 1000) * fps)
      : DEFAULT_TRANSITION_FRAMES[transType] || 12;

    // Position: centered on the cut point (half before, half after)
    const cutFrame = prevFrameInfo.fromFrame + prevFrameInfo.durationFrames;
    const startFrame = Math.max(0, cutFrame - Math.floor(durationFrames / 2));

    const transOverlay = buildTransitionOverlay(transType, {
      startFrame,
      durationFrames,
      width,
      height,
    }, nextOverlayId++);

    if (transOverlay) {
      transitionsToInsert.push({ id: nextOverlayId - 1, ...transOverlay });
    }
  }

  // Add all transitions to overlays
  overlays.push(...transitionsToInsert);

  return { overlays, totalFrameShift };
}
