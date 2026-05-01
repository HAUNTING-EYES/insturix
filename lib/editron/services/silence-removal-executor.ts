/**
 * Silence Removal Executor — Atomic Timeline Operations
 *
 * Takes an IMMUTABLE SilenceRemovalPlan (fully computed by raw-footage-processor)
 * and executes ALL removals on the project timeline.
 *
 * Critical design constraints:
 *   1. ATOMIC: plan is fully computed before any split. No interleaved compute+execute.
 *   2. REVERSE ORDER: process last removal first to avoid frame offset drift.
 *   3. RE-SYNC: after each removal, ALL downstream overlays (video, caption, sound,
 *      graphics) are shifted left by the removed duration.
 *   4. MIN SEGMENT: 1.5 * clip.fps at runtime (never hardcoded frames).
 */

import { projectService } from '@/lib/editron/services/project-service';
import { DEFAULT_CONFIG } from '@/lib/editron/config/editron-config';
import type { SilenceRemovalAction } from '@/lib/editron/services/raw-footage-processor';

// ─── Types ───────────────────────────────────────────────────────

export interface SilenceRemovalResult {
  /** Number of silence actions executed */
  actionsExecuted: number;
  /** Total frames removed from timeline */
  totalFramesRemoved: number;
  /** New project duration in frames */
  newDurationInFrames: number;
  /** Original project duration in frames */
  originalDurationInFrames: number;
  /** Overlays created from splits */
  overlaysCreated: number;
  /** Overlays deleted (dead air chunks) */
  overlaysDeleted: number;
  /** Warnings from execution */
  warnings: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────

function msToFrames(ms: number, fps: number): number {
  return Math.round((ms / 1000) * fps);
}

// ─── Main Entry ──────────────────────────────────────────────────

/**
 * Execute silence removal plan on a project. ATOMIC operation.
 *
 * @param projectId - Project to modify
 * @param userId - User who owns the project
 * @param plan - Immutable removal plan from raw-footage-processor
 * @param clipFps - Actual frame rate of the source clip (24, 29.97, 30, 60, etc.)
 */
export async function executeSilenceRemoval(
  projectId: string,
  userId: string,
  plan: SilenceRemovalAction[],
  clipFps?: number,
): Promise<SilenceRemovalResult> {
  const warnings: string[] = [];

  if (plan.length === 0) {
    return {
      actionsExecuted: 0,
      totalFramesRemoved: 0,
      newDurationInFrames: 0,
      originalDurationInFrames: 0,
      overlaysCreated: 0,
      overlaysDeleted: 0,
      warnings: ['Empty plan — no silence to remove'],
    };
  }

  // Load project
  const project = await projectService.loadProject(userId, projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const fps = clipFps || project.fps || 30;
  const minSegmentFrames = Math.round(DEFAULT_CONFIG.rawFootage.minSegmentAfterCutSeconds * fps);
  const originalDuration = project.durationInFrames;

  // Work on a mutable copy of overlays
  let overlays = JSON.parse(JSON.stringify(project.overlays)) as any[];
  let nextId = Math.max(...overlays.map((o: any) => o.id), 0) + 1;
  let overlaysCreated = 0;
  let overlaysDeleted = 0;
  let totalFramesRemoved = 0;

  // Process in REVERSE chronological order to prevent frame drift
  const reversedPlan = [...plan].sort((a, b) => b.startMs - a.startMs);

  for (const action of reversedPlan) {
    const actionStartFrame = msToFrames(action.startMs, fps);
    const actionEndFrame = msToFrames(action.endMs, fps);

    let framesToRemove: number;
    if (action.action === 'remove') {
      framesToRemove = actionEndFrame - actionStartFrame;
    } else {
      // 'shorten' — keep shortenToMs worth of frames
      const keepFrames = msToFrames(action.shortenToMs || 300, fps);
      framesToRemove = (actionEndFrame - actionStartFrame) - keepFrames;
    }

    if (framesToRemove <= 0) continue;

    // The actual cut point where content is removed
    const cutStart = action.action === 'shorten'
      ? actionStartFrame + msToFrames(action.shortenToMs || 300, fps)
      : actionStartFrame;
    const cutEnd = actionEndFrame;

    // Find overlays that intersect with the removal range
    const newOverlays: any[] = [];
    const toDelete: number[] = [];

    for (let i = 0; i < overlays.length; i++) {
      const ov = overlays[i];
      const ovStart = ov.from;
      const ovEnd = ov.from + ov.durationInFrames;

      // No intersection — overlay is entirely before the cut
      if (ovEnd <= cutStart) {
        continue;
      }

      // No intersection — overlay starts at or after the cut end
      // Shift it left by the removed duration
      if (ovStart >= cutEnd) {
        ov.from -= framesToRemove;
        continue;
      }

      // Overlay is entirely inside the cut — delete it
      if (ovStart >= cutStart && ovEnd <= cutEnd) {
        toDelete.push(i);
        continue;
      }

      // Overlay spans the cut — needs splitting
      if (ovStart < cutStart && ovEnd > cutEnd) {
        // Split into two parts: before-cut and after-cut
        const beforeDuration = cutStart - ovStart;
        const afterDuration = ovEnd - cutEnd;

        // Only create segments that meet minimum duration
        if (beforeDuration >= minSegmentFrames) {
          // Trim current overlay to before-cut portion
          ov.durationInFrames = beforeDuration;
        } else {
          toDelete.push(i);
          warnings.push(`Segment at frame ${ovStart} too short after split (${beforeDuration} < ${minSegmentFrames})`);
        }

        if (afterDuration >= minSegmentFrames) {
          // Create new overlay for after-cut portion
          const afterOverlay = JSON.parse(JSON.stringify(ov));
          afterOverlay.id = nextId++;
          afterOverlay.from = cutStart; // Will be at cutStart after removal (shifted left below)
          afterOverlay.durationInFrames = afterDuration;
          // Adjust source offset if the overlay has one (for trimmed video clips)
          if (typeof afterOverlay.sourceStartFrame === 'number') {
            afterOverlay.sourceStartFrame += (cutEnd - ovStart);
          }
          newOverlays.push(afterOverlay);
          overlaysCreated++;
        } else {
          warnings.push(`After-cut segment at frame ${cutEnd} too short (${afterDuration} < ${minSegmentFrames})`);
        }
        continue;
      }

      // Overlay starts before cut, ends inside cut — trim end
      if (ovStart < cutStart && ovEnd > cutStart && ovEnd <= cutEnd) {
        const newDuration = cutStart - ovStart;
        if (newDuration >= minSegmentFrames) {
          ov.durationInFrames = newDuration;
        } else {
          toDelete.push(i);
          warnings.push(`Trimmed overlay at frame ${ovStart} too short (${newDuration} < ${minSegmentFrames})`);
        }
        continue;
      }

      // Overlay starts inside cut, ends after cut — trim start + shift
      if (ovStart >= cutStart && ovStart < cutEnd && ovEnd > cutEnd) {
        const trimAmount = cutEnd - ovStart;
        const newDuration = ov.durationInFrames - trimAmount;
        if (newDuration >= minSegmentFrames) {
          ov.from = cutStart; // Moved to cut boundary, will be shifted left
          ov.durationInFrames = newDuration;
          if (typeof ov.sourceStartFrame === 'number') {
            ov.sourceStartFrame += trimAmount;
          }
        } else {
          toDelete.push(i);
          warnings.push(`Trimmed overlay at frame ${ovStart} too short (${newDuration} < ${minSegmentFrames})`);
        }
        continue;
      }
    }

    // Delete marked overlays (reverse order to preserve indices)
    const sortedDeletes = [...new Set(toDelete)].sort((a, b) => b - a);
    for (const idx of sortedDeletes) {
      overlays.splice(idx, 1);
      overlaysDeleted++;
    }

    // Add new overlays from splits
    overlays.push(...newOverlays);

    // Shift all overlays after cutStart left by framesToRemove
    for (const ov of overlays) {
      if (ov.from >= cutStart) {
        ov.from = Math.max(0, ov.from - framesToRemove);
      }
    }

    totalFramesRemoved += framesToRemove;
  }

  // Sort overlays by position for consistency
  overlays.sort((a: any, b: any) => a.from - b.from || a.row - b.row);

  // Recalculate project duration
  const newDuration = overlays.length > 0
    ? Math.max(...overlays.map((o: any) => o.from + o.durationInFrames))
    : 0;

  // Save updated project
  project.overlays = overlays;
  project.durationInFrames = newDuration;
  await projectService.saveProject(userId, projectId, project);

  console.log(`[SilenceRemoval] Executed ${reversedPlan.length} actions: removed ${totalFramesRemoved} frames (${Math.round(totalFramesRemoved / fps)}s), ${overlaysCreated} created, ${overlaysDeleted} deleted. Duration: ${originalDuration} → ${newDuration} frames`);

  return {
    actionsExecuted: reversedPlan.length,
    totalFramesRemoved,
    newDurationInFrames: newDuration,
    originalDurationInFrames: originalDuration,
    overlaysCreated,
    overlaysDeleted,
    warnings,
  };
}
