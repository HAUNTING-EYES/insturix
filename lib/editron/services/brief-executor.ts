/**
 * Brief Executor — Translates Creative Brief to frame-level EDL
 *
 * Takes the word-index-based decisions from the Creative Brief service and
 * resolves each one to an exact frame number using word timestamps + audio
 * energy curves. Then dispatches to the existing executeEDL() which handles
 * all overlay creation, zoom application, transition placement, etc.
 *
 * Architecture:
 *   CreativeBrief (word indices) → Brief Executor → EditDecisionList (frames) → executeEDL()
 *
 * Deterministic: same CreativeBrief + same word timestamps = same frame numbers. Always.
 */

import type { EditDecision, EditDecisionList } from '../types/edit-decision';
import type { CreativeBrief, BriefDecision, BriefDecisionType } from './creative-brief';
import { TYPE_TO_EDL } from '../data/decision-registry';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BriefExecutorInput {
  brief: CreativeBrief;
  transcription: { word: string; startMs: number; endMs: number }[];
  fps: number;
  audioEnergyCurve?: number[];
  totalDurationMs: number;
  /** Video overlays with sourceStartFrame for original-to-cut timeline mapping */
  overlays?: { from: number; durationInFrames: number; sourceStartFrame?: number; type?: string }[];
}

export interface BriefExecutorOutput {
  edl: EditDecisionList;
  stats: {
    totalDecisions: number;
    resolvedToFrame: number;
    skippedOutOfRange: number;
    snappedToEnergy: number;
  };
}

// ─── Type Mapping (from Decision Registry — single source of truth) ─────────

const TYPE_MAP: Record<string, EditDecision['type']> = { ...TYPE_TO_EDL };

// ─── Main Function ──────────────────────────────────────────────────────────

const ENERGY_SNAP_WINDOW_MS = 500;

export function executeBrief(input: BriefExecutorInput): BriefExecutorOutput {
  const { brief, transcription, fps, audioEnergyCurve, totalDurationMs, overlays } = input;

  // Build clip map for original-to-cut timeline mapping (Mode 2)
  const videoClips = (overlays || [])
    .filter(o => o.type === 'video' || !o.type)
    .sort((a, b) => (a.sourceStartFrame || 0) - (b.sourceStartFrame || 0));
  const hasFrameMapping = videoClips.length > 0 && videoClips.some(c => c.sourceStartFrame !== undefined);

  const stats = {
    totalDecisions: brief.decisions.length,
    resolvedToFrame: 0,
    skippedOutOfRange: 0,
    snappedToEnergy: 0,
    mappedToCutTimeline: 0,
    snappedFromGap: 0,
  };

  const decisions: EditDecision[] = [];

  for (const decision of brief.decisions) {
    const resolved = resolveDecisionToFrame(decision, transcription, fps, audioEnergyCurve, totalDurationMs);

    if (resolved === null) {
      stats.skippedOutOfRange++;
      continue;
    }

    // Map from original-video frame space to cut-timeline frame space.
    // Word timestamps reference the original video (before silence removal).
    // Overlays are on the cut timeline (after silence removal).
    if (hasFrameMapping) {
      const mapped = mapOriginalFrameToCutTimeline(resolved.editDecision.frame, videoClips, fps);
      if (mapped === null) {
        stats.skippedOutOfRange++;
        console.warn(`[BriefExecutor] Frame ${resolved.editDecision.frame} falls in removed gap (no nearby clip) — SKIPPED (${resolved.editDecision.technique})`);
        continue;
      }
      if (mapped.snapped) {
        stats.snappedFromGap++;
        console.log(`[BriefExecutor] Frame ${resolved.editDecision.frame} → ${mapped.frame} (snapped from gap, distance: ${mapped.distance} frames)`);
      } else {
        console.log(`[BriefExecutor] Frame ${resolved.editDecision.frame} → ${mapped.frame} (mapped to cut timeline)`);
      }
      resolved.editDecision.frame = mapped.frame;
      stats.mappedToCutTimeline++;
    }

    if (resolved.snappedToEnergy) {
      stats.snappedToEnergy++;
    }

    decisions.push(resolved.editDecision);
    stats.resolvedToFrame++;
  }

  // Sort by frame (linear playback order) then confidence for tie-breaking
  decisions.sort((a, b) => a.frame - b.frame || b.confidence - a.confidence);

  const edl: EditDecisionList = {
    decisions,
    metadata: {
      totalMappingsEvaluated: brief.decisions.length,
      totalMappingsFired: brief.decisions.length,
      totalDecisionsGenerated: stats.resolvedToFrame,
      totalDecisionsSuppressed: stats.skippedOutOfRange,
      executionTimeMs: 0,
    },
  };

  console.log(
    `[BriefExecutor] ${stats.resolvedToFrame}/${stats.totalDecisions} resolved to frames ` +
    `(${stats.snappedToEnergy} snapped to energy peak, ${stats.skippedOutOfRange} out of range` +
    `${stats.mappedToCutTimeline > 0 ? `, ${stats.mappedToCutTimeline} mapped to cut timeline` : ''}` +
    `${stats.snappedFromGap > 0 ? `, ${stats.snappedFromGap} snapped from gap` : ''})`
  );

  return { edl, stats };
}

// ─── Frame Resolution ───────────────────────────────────────────────────────

interface ResolvedDecision {
  editDecision: EditDecision;
  snappedToEnergy: boolean;
}

function resolveDecisionToFrame(
  decision: BriefDecision,
  transcription: { word: string; startMs: number; endMs: number }[],
  fps: number,
  energyCurve: number[] | undefined,
  totalDurationMs: number,
): ResolvedDecision | null {
  const { targetWordIdx: rawIdx, type, confidence, reason, params } = decision;

  if (transcription.length === 0) return null;

  // Smart clamping: recover near-boundary indices, discard hallucinated ones.
  // Gemini's creative brief sometimes generates indices beyond transcript bounds.
  // Off-by-a-few is recoverable (meant "near the end"). Wildly off (3x overshoot)
  // is hallucinated garbage that would dump random effects at the video boundary.
  // Proximity gate: clamp if within 10% of transcript length, discard if beyond.
  const MAX_OVERSHOOT_RATIO = 0.1; // 10% — e.g., index 44 for 40 words = OK, index 120 = garbage
  const maxAllowedOvershoot = Math.max(3, Math.ceil(transcription.length * MAX_OVERSHOOT_RATIO));
  let targetWordIdx = rawIdx;
  if (rawIdx < 0) {
    if (Math.abs(rawIdx) <= maxAllowedOvershoot) {
      targetWordIdx = 0;
      console.warn(`[BriefExecutor] Word index ${rawIdx} < 0 — clamped to 0 (decision: ${type})`);
    } else {
      console.warn(`[BriefExecutor] Word index ${rawIdx} wildly negative (max overshoot: ${maxAllowedOvershoot}) — DISCARDED (decision: ${type})`);
      return null;
    }
  } else if (rawIdx >= transcription.length) {
    const overshoot = rawIdx - (transcription.length - 1);
    if (overshoot <= maxAllowedOvershoot) {
      targetWordIdx = transcription.length - 1;
      console.warn(`[BriefExecutor] Word index ${rawIdx} >= transcript length ${transcription.length} — clamped to last word (overshoot: ${overshoot}, decision: ${type})`);
    } else {
      console.warn(`[BriefExecutor] Word index ${rawIdx} >> transcript length ${transcription.length} (overshoot: ${overshoot}, max: ${maxAllowedOvershoot}) — DISCARDED as hallucinated (decision: ${type})`);
      return null;
    }
  }

  const word = transcription[targetWordIdx];
  let targetMs = word.startMs;
  let snappedToEnergy = false;

  // For zoom/emphasis decisions, snap to the nearest audio energy peak within window
  if (shouldSnapToEnergy(type) && energyCurve && energyCurve.length > 0) {
    const snapped = snapToEnergyPeak(targetMs, energyCurve, totalDurationMs, fps);
    if (snapped !== null) {
      targetMs = snapped;
      snappedToEnergy = true;
    }
  }

  // For transition decisions, snap to BETWEEN words (the gap between end of prev and start of next)
  if (isTransitionType(type) && targetWordIdx > 0) {
    const prevWord = transcription[targetWordIdx - 1];
    targetMs = prevWord.endMs + (word.startMs - prevWord.endMs) / 2;
  }

  const frame = Math.round(targetMs / 1000 * fps);

  // Validate frame is within video bounds
  const maxFrame = Math.round(totalDurationMs / 1000 * fps);
  if (frame < 0 || frame > maxFrame) {
    return null;
  }

  const editDecision: EditDecision = {
    type: TYPE_MAP[type] || 'zoom',
    frame,
    confidence,
    source: `creative-brief:${reason}`,
    technique: type,
    params: { ...params },
    reason: reason,
  };

  return { editDecision, snappedToEnergy };
}

// ─── Energy Snap ────────────────────────────────────────────────────────────

function snapToEnergyPeak(
  targetMs: number,
  energyCurve: number[],
  totalDurationMs: number,
  fps: number,
): number | null {
  if (energyCurve.length === 0 || totalDurationMs <= 0) return null;

  const msPerSample = totalDurationMs / energyCurve.length;
  const targetSample = Math.round(targetMs / msPerSample);
  const windowSamples = Math.round(ENERGY_SNAP_WINDOW_MS / msPerSample);

  const startSample = Math.max(0, targetSample - windowSamples);
  const endSample = Math.min(energyCurve.length - 1, targetSample + windowSamples);

  let peakSample = targetSample;
  let peakValue = energyCurve[targetSample] ?? 0;

  for (let i = startSample; i <= endSample; i++) {
    if (energyCurve[i] > peakValue) {
      peakValue = energyCurve[i];
      peakSample = i;
    }
  }

  // Only snap if peak is meaningfully higher than target (avoid snapping to noise)
  const targetValue = energyCurve[targetSample] ?? 0;
  if (peakValue - targetValue < 0.05) return null;

  return peakSample * msPerSample;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function shouldSnapToEnergy(type: BriefDecisionType): boolean {
  return type.startsWith('zoom_') || type === 'caption_emphasis' || type === 'camera_shake';
}

function isTransitionType(type: BriefDecisionType): boolean {
  return type.startsWith('transition_');
}

// ─── Original-to-Cut Timeline Mapping ──────────────────────────────────────

interface FrameMapResult {
  frame: number;
  snapped: boolean;
  distance: number;
}

/**
 * Map a frame from original video space to cut-timeline space.
 *
 * After silence removal, each video overlay has:
 *   - `from`: position on the CUT timeline
 *   - `durationInFrames`: length on the CUT timeline
 *   - `sourceStartFrame`: position in the ORIGINAL video
 *
 * If the original frame falls inside a clip's source range, the mapping is exact.
 * If it falls in a removed gap, snap to the nearest clip boundary (within tolerance).
 * If no clip is within tolerance, return null (decision should be skipped).
 */
function mapOriginalFrameToCutTimeline(
  originalFrame: number,
  clips: { from: number; durationInFrames: number; sourceStartFrame?: number }[],
  fps: number,
): FrameMapResult | null {
  // Exact containment: original frame is inside a clip's source range
  for (const clip of clips) {
    const srcStart = clip.sourceStartFrame ?? 0;
    const srcEnd = srcStart + clip.durationInFrames;
    if (originalFrame >= srcStart && originalFrame < srcEnd) {
      const offset = originalFrame - srcStart;
      return { frame: clip.from + offset, snapped: false, distance: 0 };
    }
  }

  // Frame falls in a removed gap. Snap to nearest clip boundary.
  const SNAP_TOLERANCE = fps * 5; // 5 seconds
  let bestClip: typeof clips[0] | null = null;
  let bestDistance = Infinity;
  let snapToStart = true;

  for (const clip of clips) {
    const srcStart = clip.sourceStartFrame ?? 0;
    const srcEnd = srcStart + clip.durationInFrames;

    const distToStart = Math.abs(originalFrame - srcStart);
    const distToEnd = Math.abs(originalFrame - srcEnd);

    if (distToStart < bestDistance) {
      bestDistance = distToStart;
      bestClip = clip;
      snapToStart = true;
    }
    if (distToEnd < bestDistance) {
      bestDistance = distToEnd;
      bestClip = clip;
      snapToStart = false;
    }
  }

  if (bestClip && bestDistance <= SNAP_TOLERANCE) {
    // Snap to the edge of the nearest clip
    const frame = snapToStart
      ? bestClip.from // Start of nearest clip
      : bestClip.from + bestClip.durationInFrames - 1; // End of nearest clip
    return { frame, snapped: true, distance: bestDistance };
  }

  // Gap too large — decision was for deeply removed content
  return null;
}
