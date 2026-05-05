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

/**
 * Ghost Segment (FLAG 9) — reversible silence removal.
 * Instead of permanently deleting footage, store the removed sections as
 * "ghosts" that the user can restore. Implements the Automatic Car Principle:
 * "every decision the system makes is manually overridable."
 */
export interface GhostSegment {
  id: string;
  /** Source video time range (absolute, in original footage) */
  sourceStartMs: number;
  sourceEndMs: number;
  /** Why this segment was removed */
  removalReason: 'silence' | 'filler' | 'false_start' | 'duplicate_take' | 'low_quality';
  /** How confident are we this removal is correct (0-1) */
  removalConfidence: number;
  /** For duplicate_take: ID of the segment that was kept instead */
  alternativeTo?: string;
  /** What was said in this segment (if speech existed) */
  transcriptText?: string;
  /** Always true — ghosts are restorable by design */
  restorable: true;
  /** Original overlay data snapshot (for restoration) */
  originalOverlay?: any;
}

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
  /** Ghost segments stored for potential restoration */
  ghostSegments: GhostSegment[];
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
      ghostSegments: [],
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
  const overlays = JSON.parse(JSON.stringify(project.overlays)) as any[];
  let nextId = Math.max(...overlays.map((o: any) => o.id), 0) + 1;
  let overlaysCreated = 0;
  let overlaysDeleted = 0;
  let totalFramesRemoved = 0;

  // Ghost segments (FLAG 9): store removed content for potential restoration
  const ghostSegments: GhostSegment[] = [];

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

      // Overlay is entirely inside the cut — delete it (but store as ghost)
      if (ovStart >= cutStart && ovEnd <= cutEnd) {
        toDelete.push(i);
        // Ghost: preserve the removed overlay for potential restoration
        const reasonMap: Record<string, GhostSegment['removalReason']> = {
          'silence': 'silence', 'filler': 'filler', 'inferior-take': 'duplicate_take',
        };
        ghostSegments.push({
          id: `ghost_${projectId}_${action.startMs}_${action.endMs}`,
          sourceStartMs: action.startMs,
          sourceEndMs: action.endMs,
          removalReason: reasonMap[action.reason] || 'silence',
          removalConfidence: 0.8,  // Default confidence for automated removal
          restorable: true,
          originalOverlay: JSON.parse(JSON.stringify(ov)),
        });
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
          // Set source offset so the video player knows where to start in the source file.
          // Without this, every segment plays from frame 0 (repeating the start of the video).
          // cutEnd - ovStart = how far into the original overlay the after-cut portion begins.
          const currentSourceOffset = (typeof ov.sourceStartFrame === 'number' ? ov.sourceStartFrame : 0);
          afterOverlay.sourceStartFrame = currentSourceOffset + (cutEnd - ovStart);
          afterOverlay.videoStartTime = afterOverlay.sourceStartFrame;
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

    // Shift existing overlays after cutEnd left by framesToRemove.
    // MUST run BEFORE pushing newOverlays — the new "after" pieces are already
    // placed at cutStart (correct position after gap closure). Shifting them
    // too would push them into the "before" piece → overlap.
    // Bug was: shift ran AFTER push, with >= cutStart condition, which caught
    // the new pieces and shifted them left into overlapping territory.
    for (const ov of overlays) {
      if (ov.from >= cutEnd) {
        ov.from = Math.max(0, ov.from - framesToRemove);
      }
    }

    // Add new overlays from splits (already correctly positioned at cutStart)
    overlays.push(...newOverlays);

    totalFramesRemoved += framesToRemove;
  }

  // Sort overlays by position for consistency
  overlays.sort((a: any, b: any) => a.from - b.from || a.row - b.row);

  // Dedup: merge overlapping video overlays on same row until none remain.
  // The split algorithm can create overlaps when reverse-order processing
  // and shift operations interact across adjacent silence gaps.
  // Loop until stable — merging A+B may create new overlap with C.
  const videoOverlaysBefore = overlays.filter((o: any) => o.type === 'video').length;
  let mergedThisPass = true;
  while (mergedThisPass) {
    mergedThisPass = false;
    for (let i = overlays.length - 1; i > 0; i--) {
      const curr = overlays[i];
      const prev = overlays[i - 1];
      if (curr.type !== 'video' || prev.type !== 'video') continue;
      if (curr.row !== prev.row) continue;

      const prevEnd = prev.from + prev.durationInFrames;
      if (curr.from < prevEnd) {
        const currEnd = curr.from + curr.durationInFrames;
        prev.durationInFrames = Math.max(prevEnd, currEnd) - prev.from;
        overlays.splice(i, 1);
        mergedThisPass = true;
      }
    }
  }
  const videoOverlaysAfter = overlays.filter((o: any) => o.type === 'video').length;
  if (videoOverlaysBefore !== videoOverlaysAfter) {
    console.log(`[SilenceRemoval] Merged ${videoOverlaysBefore - videoOverlaysAfter} overlapping video overlays (${videoOverlaysBefore} → ${videoOverlaysAfter})`);
  }

  // Recalculate project duration
  const newDuration = overlays.length > 0
    ? Math.max(...overlays.map((o: any) => o.from + o.durationInFrames))
    : 0;

  // Save updated project (including ghost segments for restoration)
  project.overlays = overlays;
  project.durationInFrames = newDuration;
  (project as any).ghostSegments = ghostSegments;
  await projectService.saveProject(userId, projectId, project);

  console.log(`[SilenceRemoval] Executed ${reversedPlan.length} actions: removed ${totalFramesRemoved} frames (${Math.round(totalFramesRemoved / fps)}s), ${overlaysCreated} created, ${overlaysDeleted} deleted, ${ghostSegments.length} ghosts stored. Duration: ${originalDuration} → ${newDuration} frames`);

  return {
    actionsExecuted: reversedPlan.length,
    totalFramesRemoved,
    newDurationInFrames: newDuration,
    originalDurationInFrames: originalDuration,
    overlaysCreated,
    overlaysDeleted,
    ghostSegments,
    warnings,
  };
}
