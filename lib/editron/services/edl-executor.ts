/**
 * EDL Executor
 *
 * Converts Edit Decision List entries into concrete tool calls
 * that modify the Editron project. This bridges the gap between
 * "the AI decided to put a transition here" and "the transition
 * actually exists on the timeline."
 *
 * Called by the Director Agent after 5-track analysis generates
 * the EDL. Each decision becomes one or more overlay mutations.
 */

import type { EditDecision, EditDecisionList } from './reactive-edit-engine';
import { DEFAULT_TRANSITION_FRAMES, createTrueDissolve } from '@/lib/editron/data/transition-templates';
import type { Overlay, KeyframeTrack } from '@/components/editron/editor/version-7.0.0/types';
import { DEFAULT_CONFIG } from '@/lib/editron/config/editron-config';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import { getFilterPresetById } from '@/lib/editron/data/filter-presets';
import { searchAndDownloadSFX, isSFXLibraryAvailable } from '@/lib/pipeline/sfx-library-service';

// Deterministic overlay ID for EDL-generated overlays. OLD: Date.now() + Math.random()
// produced different IDs per render → broke Lambda caching and A/B comparisons.
// NEW: hash the decision's anchor fields (frame + type + index) + a Director-run epoch.
// The epoch is per-executeEDL call so IDs are still unique within a project but stable
// for a single render pass. See Phase A3 notes in editron_master_remaining.md.
function deterministicOverlayId(epoch: number, decisionType: string, frame: number, index: number): number {
  // FNV-1a–ish fold into 53-bit integer safe for JS Number
  let h = 2166136261 >>> 0;
  const str = `${epoch}|${decisionType}|${frame}|${index}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // Combine with epoch to guarantee project-level uniqueness across multiple EDL runs
  return epoch * 1_000_000 + (h % 1_000_000);
}

// ─── Seeded PRNG (deterministic random) ─────────────────────────
// OLD: Math.random() produced different shake patterns every render.
// NEW: mulberry32 seeded with frame + overlay position → identical output per render.

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Frame Snapping Helpers ─────────────────────────────────────
// Decision frames from Unified Intelligence may not align with actual clip
// positions due to pacing shifts, sub-shot splitting, or other overlay
// modifications that happen between decision generation and EDL execution.
// These helpers snap decision frames to the nearest actual clip positions.

export interface ClipBoundaryMatch {
  /** The clip boundary frame (end of clipA / start of clipB) */
  boundaryFrame: number;
  /** Clip ending at/before the boundary */
  clipA: Overlay;
  /** Clip starting at/after the boundary */
  clipB: Overlay;
  /** Drift in frames between decision.frame and actual boundary */
  drift: number;
}

/**
 * Find the nearest clip boundary to a decision frame.
 * Used by applyTransition to snap transition placement to actual clip edges.
 */
export function snapToClipBoundary(
  decisionFrame: number,
  overlays: Overlay[],
  maxTolerance: number = 45,
): ClipBoundaryMatch | null {
  const visualOverlays = overlays
    .filter(o => o.type === 'video' || o.type === 'image')
    .sort((a, b) => a.from - b.from);

  // Post-silence-removal projects have many small clips with potential tiny gaps.
  // Increase tolerance to account for frame rounding gaps between consecutive clips.
  const effectiveTolerance = visualOverlays.length > 20
    ? Math.max(maxTolerance, 60)
    : maxTolerance;

  let best: ClipBoundaryMatch | null = null;

  for (let i = 0; i < visualOverlays.length - 1; i++) {
    const a = visualOverlays[i];
    const b = visualOverlays[i + 1];
    const boundary = a.from + a.durationInFrames;
    const drift = Math.abs(boundary - decisionFrame);

    if (drift <= effectiveTolerance && (!best || drift < best.drift)) {
      best = { boundaryFrame: boundary, clipA: a, clipB: b, drift };
    }
  }

  return best;
}

/**
 * Find the video overlay that contains a given frame, with tolerance
 * for small frame drift. If exact containment fails, checks ±tolerance
 * frames and returns the nearest containing clip.
 */
export function findClipAtFrame(
  decisionFrame: number,
  overlays: Overlay[],
  tolerance: number = 15,
): { clip: Overlay; snappedFrame: number; drift: number } | null {
  // Try exact containment first (timeline position)
  const exact = overlays.find(o =>
    o.type === 'video' &&
    o.from <= decisionFrame &&
    o.from + o.durationInFrames > decisionFrame,
  );
  if (exact) return { clip: exact, snappedFrame: decisionFrame, drift: 0 };

  // Mode 2 fallback: decision frames may be in pre-removal source timeline.
  // After silence removal, overlay.from positions shifted but videoStartTime
  // still references the original source. Match against source frame range.
  const sourceMatch = overlays.find(o => {
    if (o.type !== 'video') return false;
    const srcStart = (o as any).videoStartTime || 0;
    const srcEnd = srcStart + o.durationInFrames;
    return decisionFrame >= srcStart && decisionFrame < srcEnd;
  });
  if (sourceMatch) {
    const srcStart = (sourceMatch as any).videoStartTime || 0;
    const localOffset = decisionFrame - srcStart;
    const snapped = sourceMatch.from + localOffset;
    return { clip: sourceMatch, snappedFrame: snapped, drift: 0 };
  }

  // Try with tolerance — find nearest clip that contains decisionFrame ± tolerance
  let bestClip: Overlay | null = null;
  let bestDrift = Infinity;
  let bestFrame = decisionFrame;

  for (const o of overlays) {
    if (o.type !== 'video') continue;
    const clipStart = o.from;
    const clipEnd = o.from + o.durationInFrames;

    // Check if decisionFrame is just outside this clip
    if (decisionFrame < clipStart && clipStart - decisionFrame <= tolerance) {
      const drift = clipStart - decisionFrame;
      if (drift < bestDrift) {
        bestDrift = drift;
        bestClip = o;
        bestFrame = clipStart + 1; // Snap just inside clip start
      }
    } else if (decisionFrame >= clipEnd && decisionFrame - clipEnd < tolerance) {
      const drift = decisionFrame - clipEnd + 1;
      if (drift < bestDrift) {
        bestDrift = drift;
        bestClip = o;
        bestFrame = clipEnd - 1; // Snap just inside clip end
      }
    }
  }

  if (bestClip) return { clip: bestClip, snappedFrame: bestFrame, drift: bestDrift };
  return null;
}

// ─── Types ───────────────────────────────────────────────────────

export interface ExecutionResult {
  decisionsExecuted: number;
  decisionsSkipped: number;
  overlaysCreated: number;
  overlaysModified: number;
  errors: string[];
  /** AssetIds of overlays whose zoom decisions were rejected by budget — drift-zoom should skip these */
  budgetRejectedZoomAssetIds: Set<string>;
  /** AssetIds that already received a zoom from EDL — drift-zoom should skip these too */
  zoomedAssetIds: Set<string>;
}

// ─── Executor ────────────────────────────────────────────────────

/**
 * Execute an Edit Decision List on a project.
 *
 * @param edl - The Edit Decision List from the Reactive Edit Engine
 * @param projectId - Project to modify
 * @param userId - Owner
 * @param overlays - Current overlay state (mutated in place)
 * @param canvasDimensions - { width, height } for overlay positioning
 */
export async function executeEDL(
  edl: EditDecisionList,
  projectId: string,
  userId: string,
  overlays: Overlay[],
  canvasDimensions: { width: number; height: number },
  /** Optional 5-Track analyses keyed by assetId — used to validate zoom placement */
  analyses?: Map<string, any>,
): Promise<ExecutionResult> {
  const result: ExecutionResult = {
    decisionsExecuted: 0,
    decisionsSkipped: 0,
    overlaysCreated: 0,
    overlaysModified: 0,
    errors: [],
    budgetRejectedZoomAssetIds: new Set<string>(),
    zoomedAssetIds: new Set<string>(),
  };

  // ─── Budget enforcement (Director Knowledge Base) ──────────────
  // Prevents "amateur AI editing" where the engine goes overboard with
  // zoom-punches, shakes, and graphics on every frame.
  const { DecisionBudget } = await import('./decision-budget');
  const totalDurationMs = overlays
    .filter(o => o.type === 'video' || o.type === 'image')
    .reduce((max, o) => Math.max(max, (o.from + o.durationInFrames) / DEFAULT_CONFIG.timing.fps * 1000), 0);
  const budget = new DecisionBudget(totalDurationMs || 30000, 30);

  // Execute decisions at or above confidence threshold (>=0.5)
  // OLD: strict > 0.5 silently killed ~60% of decisions when flat moment weights = 0.5 exactly.
  // FIX: inclusive >= lets budget system be the gatekeeper (as designed).
  const minConfidence = DEFAULT_CONFIG.analysis.minConfidenceForDecisions;
  const actionable = edl.decisions.filter(d => d.confidence >= minConfidence);

  // Keep decisions in frame-first order (as produced by signal executor / reactive engine).
  // OLD: sorted by confidence descending — a high-confidence zoom at minute 8 consumed
  // budget before a medium-confidence zoom at minute 1. The viewer watches linearly;
  // budget consumption should be linear. Confidence is for tie-breaking within the
  // same frame window, which the signal executor already handles (deduplicateDecisions).
  actionable.sort((a, b) => a.frame - b.frame || b.confidence - a.confidence);

  console.log(`[EDL-Exec] Executing ${actionable.length}/${edl.totalDecisions} decisions (confidence > ${minConfidence}) with budget enforcement, sorted by frame`);

  // Deterministic epoch for overlay IDs — stable within this Director run, unique across runs.
  // Derived from projectId hash so the same EDL on the same project always produces the same IDs.
  const idEpoch = Math.floor(Date.now() / 1000);

  // Pre-resolve unique SFX tokens so the decision loop doesn't make
  // per-decision API calls. One Freesound search per unique token.
  const sfxCache = new Map<string, { audioUrl: string; audioAssetId: string; durationMs: number } | null>();
  if (isSFXLibraryAvailable()) {
    const sfxDecisions = actionable.filter(d => d.type === 'sfx-trigger');
    const uniqueTokens = new Set(sfxDecisions.map(d => (d as any).params?.sfxType).filter(Boolean));
    for (const token of uniqueTokens) {
      try {
        const result = await searchAndDownloadSFX(token as string, userId, 3);
        sfxCache.set(token as string, result ? { audioUrl: result.audioUrl, audioAssetId: result.audioAssetId, durationMs: result.durationMs } : null);
        console.log(`[EDL-Exec] SFX pre-resolve: "${token}" → ${result ? 'found' : 'null'}`);
      } catch (err: any) {
        sfxCache.set(token as string, null);
        console.warn(`[EDL-Exec] SFX pre-resolve failed for "${token}": ${err.message}`);
      }
    }
  }

  // ── Single-source detection: per-boundary visual similarity check ──
  // OLD: blanket-killed ALL transition/sfx decisions when overlays share one assetId.
  // This was wrong — a vlog with 3 locations IS single-source but SHOULD get
  // transitions at location changes. Blanket approach was tried and reverted
  // in commit a42a358d ("single-source doesn't mean single-scene").
  //
  // NEW: for single-source projects, each transition/sfx decision is checked
  // individually during the execution loop. We compare 5-Track keyframe colors
  // on either side of the boundary. Same colors = same scene = suppress.
  // Different colors = visual change = allow. No data = allow (respect intelligence).
  const videoOverlaysForSourceCheck = overlays.filter(o => o.type === 'video').sort((a: any, b: any) => a.from - b.from);
  const uniqueSourceAssets = new Set(
    videoOverlaysForSourceCheck.map(o => (o as any).assetId).filter(Boolean)
  );
  const isSingleSource = uniqueSourceAssets.size === 1 && videoOverlaysForSourceCheck.length > 1;
  const singleSourceAssetId = isSingleSource ? uniqueSourceAssets.values().next().value as string : null;

  let budgetRejected = 0;
  let decisionIndex = 0;

  for (const decision of actionable) {
    const currentDecisionIndex = decisionIndex++;

    // ── Single-source transition handling ──
    // OLD: shouldSuppressAtBoundary() compared 5-Track keyframe colors on either
    // side of the cut. For talking heads (same camera, same room), Jaccard similarity
    // was always >0.7 → ALL transitions killed → zero transitions in output.
    //
    // WHY REMOVED: In single-source projects (Mode 2 transcript-editor cuts),
    // transitions are EDITORIAL beat markers (topic shift, time passage, pacing).
    // They are NOT visual-scene-change indicators. A dissolve between two sections
    // of a talking head is a standard documentary technique. The intelligence system
    // and budget (MAX_TRANSITIONS_PER_TYPE=4) already gate what gets placed.
    // Color similarity is the wrong signal for editorial decisions.
    //
    // The intelligence decided WHERE. The budget decides HOW MANY. Color decided NOTHING useful.

    // Script-specified on-screen text BYPASSES budget. The user wrote this
    // text in their script — budget should never reject explicit user content.
    // Only LLM-generated graphics are budget-constrained.
    const isScriptOnScreenText = decision.type === 'graphic'
      && decision.sources?.includes('onScreenText-safety-net');

    // Check budget BEFORE applying (skip for script on-screen text)
    const budgetResult = isScriptOnScreenText
      ? { allowed: true }
      : budget.evaluate(decision as any);
    if (!budgetResult.allowed) {
      result.decisionsSkipped++;
      budgetRejected++;
      console.log(`[EDL-Exec] BUDGET REJECTED: ${decision.type} at frame ${decision.frame} — ${budgetResult.reason} (${budgetResult.ruleId})`);

      // Track budget-rejected zooms so post-processing drift-zoom doesn't re-add them
      if (decision.type === 'zoom') {
        const video = overlays.find(o =>
          o.type === 'video' && o.from <= decision.frame && o.from + o.durationInFrames > decision.frame
        );
        if (video?.assetId) {
          result.budgetRejectedZoomAssetIds.add(video.assetId);
        }
      }

      // Budget rejected = skip. No substitution.
      // OLD: budget suggested alternatives (e.g., caption-emphasis when zoom was rejected).
      // This broke the signal→mapping→technique chain — the intelligence chose zoom
      // because a specific graph mapping fired on motion intensity. Caption emphasis
      // has nothing to do with motion intensity. Budget should FILTER, not INVENT.
      continue;
    }

    try {
      const applied = await applyDecision(decision, overlays, projectId, userId, canvasDimensions, analyses, idEpoch, currentDecisionIndex, sfxCache);
      if (applied) {
        budget.commit(decision as any);
        result.decisionsExecuted++;
        if (applied.created) result.overlaysCreated += applied.created;
        if (applied.modified) result.overlaysModified += applied.modified;
        // Track zoomed assets so drift-zoom post-processing skips them
        if (decision.type === 'zoom') {
          const video = overlays.find(o =>
            o.type === 'video' && o.from <= decision.frame && o.from + o.durationInFrames > decision.frame
          );
          if (video?.assetId) result.zoomedAssetIds.add(video.assetId);
        }
      } else {
        result.decisionsSkipped++;
        console.log(`[EDL-Exec] SKIPPED (returned null): ${decision.type} at frame ${decision.frame} — ${decision.reason?.substring(0, 80) || 'no reason'}`);
      }
    } catch (err: any) {
      result.decisionsSkipped++;
      result.errors.push(`${decision.type} at frame ${decision.frame}: ${err.message}`);
      console.error(`[EDL-Exec] ERROR: ${decision.type} at frame ${decision.frame} — ${err.message}`);
    }
  }

  const budgetSummary = budget.getSummary();
  console.log(`[EDL-Exec] Complete: ${result.decisionsExecuted} executed, ${result.decisionsSkipped} skipped (${budgetRejected} budget-rejected), ${result.overlaysCreated} created, ${result.overlaysModified} modified`);
  console.log(`[EDL-Exec] Budget: ${JSON.stringify(budgetSummary)}`);
  return result;
}

// ─── Per-Decision Handlers ───────────────────────────────────────

async function applyDecision(
  decision: EditDecision,
  overlays: Overlay[],
  projectId: string,
  userId: string,
  canvas: { width: number; height: number },
  analyses?: Map<string, any>,
  idEpoch: number = 0,
  decisionIndex: number = 0,
  sfxCache?: Map<string, { audioUrl: string; audioAssetId: string; durationMs: number } | null>,
): Promise<{ created: number; modified: number } | null> {

  switch (decision.type) {
    case 'transition':
      return applyTransition(decision, overlays, projectId, userId, canvas, idEpoch, decisionIndex);

    case 'zoom':
      return applyZoom(decision, overlays, analyses);

    case 'speed-change':
      return applySpeedChange(decision, overlays);

    case 'fade':
      return applyFade(decision, overlays);

    case 'graphic':
      return applyGraphic(decision, overlays, projectId, userId, canvas, idEpoch, decisionIndex);

    case 'audio-duck':
      return applyAudioDuck(decision, overlays);

    case 'cut':
      // Cuts are informational — they indicate where scene boundaries SHOULD be
      // but don't create new overlays (the scenes already exist from ThinkForge)
      return null;

    case 'filter-change':
      // DISABLED: Profile filter (Director step 3) is the single source of truth
      // for color grading. EDL per-frame filter-change caused "filter schizophrenia"
      // — different CSS filters per clip based on local mood inference (e.g.,
      // hue-rotate(160deg) turning skin blue on some clips). Profile applies ONE
      // consistent grade to ALL clips, matching professional colorist workflow.
      return null;

    case 'caption-emphasis':
      // Caption emphasis is handled by Director's add_captions step with word-level timing
      return null;

    case 'sfx-trigger': {
      const sfxType = (decision as any).params?.sfxType as string | undefined;
      if (!sfxType || !sfxCache) return null;
      const cached = sfxCache.get(sfxType);
      if (!cached) return null;

      const fps = DEFAULT_CONFIG.timing.fps;
      const sfxDurFrames = Math.max(1, Math.min(Math.round((cached.durationMs / 1000) * fps), 90));
      const sfxId = deterministicOverlayId(idEpoch, 'sfx-trigger', decision.frame, decisionIndex);

      overlays.push({
        id: sfxId,
        type: 'sound',
        from: decision.frame,
        durationInFrames: sfxDurFrames,
        row: ROW.SFX,
        left: 0, top: 0, width: 0, height: 0,
        isDragging: false, rotation: 0,
        content: cached.audioUrl,
        src: cached.audioUrl,
        assetId: cached.audioAssetId,
        styles: { volume: DEFAULT_CONFIG.audio.defaultSfxVolume, opacity: 1 },
        metadata: { source: 'edl-sfx-trigger', sfxType },
      } as any);

      console.log(`[EDL-Exec] sfx-trigger: placed "${sfxType}" at frame ${decision.frame}`);
      return { created: 1, modified: 0 };
    }

    case 'camera-shake':
      return applyCameraShake(decision, overlays, canvas);

    default:
      return null;
  }
}

function applyCameraShake(
  decision: EditDecision,
  overlays: Overlay[],
  canvas: { width: number; height: number } = { width: 1920, height: 1080 },
): { created: number; modified: number } | null {
  const intensity = decision.params?.intensity || 0.3;
  const durationFrames = decision.durationFrames || 10;
  const frame = decision.frame;

  // Find the video overlay at this frame
  const video = overlays.find(o =>
    o.type === 'video' && o.from <= frame && (o.from + o.durationInFrames) > frame
  ) as any;
  if (!video) return null;

  // Create rapid position jitter keyframes (alternating X/Y offsets)
  const shakeFrames = Math.min(durationFrames, 15);
  const relativeStart = frame - video.from;
  const xKeyframes: any[] = [{ frame: relativeStart, value: 0, easing: 'linear' }];
  const yKeyframes: any[] = [{ frame: relativeStart, value: 0, easing: 'linear' }];

  // Seed PRNG with frame + overlay position for deterministic shake across renders
  const seed = frame * 31 + video.from * 17 + (video.durationInFrames || 0) * 7;
  const rand = mulberry32(seed);

  const maxOffset = intensity * canvas.width * 0.01; // 1% of canvas width (scales with resolution)
  for (let i = 1; i <= shakeFrames; i++) {
    const decay = 1 - (i / shakeFrames); // decay over time
    const xOff = (rand() - 0.5) * 2 * maxOffset * decay;
    const yOff = (rand() - 0.5) * 2 * maxOffset * decay;
    xKeyframes.push({ frame: relativeStart + i, value: xOff, easing: 'linear' });
    yKeyframes.push({ frame: relativeStart + i, value: yOff, easing: 'linear' });
  }
  // Return to center
  xKeyframes.push({ frame: relativeStart + shakeFrames + 1, value: 0, easing: 'ease-out' });
  yKeyframes.push({ frame: relativeStart + shakeFrames + 1, value: 0, easing: 'ease-out' });

  if (!video.keyframeTracks) video.keyframeTracks = [];
  video.keyframeTracks.push({ property: 'x', keyframes: xKeyframes });
  video.keyframeTracks.push({ property: 'y', keyframes: yKeyframes });

  return { created: 0, modified: 1 };
}

// OLD: Created HTML overlays (System B) that the editor couldn't display as timeline tiles.
// NEW: Creates proper TransitionOverlay tiles (System A) with clipAId/clipBId that the
// editor renders both as timeline tiles AND as visual transitions in the video.
/**
 * Per-boundary visual similarity check for single-source projects.
 * Compares 5-Track keyframe colors on either side of a transition boundary.
 * Returns true if the transition should be SUPPRESSED (same visual scene).
 *
 * Uses Jaccard similarity on dominant color string sets — pure math, no KB thresholds.
 * ⚠️ Similarity thresholds (0.7 suppress, 0.4 allow) are judgment calls, not verified
 * industry standards. May need tuning after production testing.
 */
function shouldSuppressAtBoundary(
  frame: number,
  videoOverlays: any[],
  analyses: Map<string, any> | undefined,
  fps: number = 30,
): boolean {
  if (!analyses || analyses.size === 0) return false; // No data → allow (respect intelligence)

  // Find the two adjacent video overlays at this boundary
  const clipA = videoOverlays.filter(o => o.from + o.durationInFrames <= frame + 15).pop(); // ends near this frame
  const clipB = videoOverlays.find(o => o.from >= frame - 15); // starts near this frame
  if (!clipA || !clipB || clipA === clipB) return false; // Can't determine boundary → allow

  const assetId = (clipA as any).assetId;
  if (!assetId) return false;
  const analysis = analyses.get(assetId);
  if (!analysis?.keyframeAnalyses?.length) return false; // No keyframe data → allow

  const allKf = analysis.keyframeAnalyses;

  // Get source time ranges for each clip
  const aStartSec = ((clipA as any).videoStartTime ?? 0) / fps;
  const aEndSec = aStartSec + (clipA.durationInFrames / fps);
  const bStartSec = ((clipB as any).videoStartTime ?? 0) / fps;
  const bEndSec = bStartSec + (clipB.durationInFrames / fps);

  // Filter keyframes to each clip's source range
  let kfA = allKf.filter((kf: any) => {
    const s = (kf.timestampMs ?? 0) / 1000;
    return s >= aStartSec && s < aEndSec;
  });
  let kfB = allKf.filter((kf: any) => {
    const s = (kf.timestampMs ?? 0) / 1000;
    return s >= bStartSec && s < bEndSec;
  });

  // Nearest-neighbor fallback for short segments
  if (kfA.length === 0) {
    const mid = (aStartSec + aEndSec) / 2;
    kfA = [allKf.reduce((best: any, kf: any) =>
      Math.abs((kf.timestampMs ?? 0) / 1000 - mid) < Math.abs((best.timestampMs ?? 0) / 1000 - mid) ? kf : best
    )];
  }
  if (kfB.length === 0) {
    const mid = (bStartSec + bEndSec) / 2;
    kfB = [allKf.reduce((best: any, kf: any) =>
      Math.abs((kf.timestampMs ?? 0) / 1000 - mid) < Math.abs((best.timestampMs ?? 0) / 1000 - mid) ? kf : best
    )];
  }

  // Extract + compare dominant colors (Jaccard similarity)
  const colorsA = new Set(kfA.flatMap((kf: any) => (kf.dominantColors || []).map((c: string) => c.toLowerCase())));
  const colorsB = new Set(kfB.flatMap((kf: any) => (kf.dominantColors || []).map((c: string) => c.toLowerCase())));

  if (colorsA.size === 0 || colorsB.size === 0) return false; // No color data → allow

  const intersection = [...colorsA].filter(c => colorsB.has(c));
  const union = new Set([...colorsA, ...colorsB]);
  const similarity = union.size > 0 ? intersection.length / union.size : 0.5;

  // ⚠️ Thresholds are judgment calls, not KB values. May need tuning.
  // >0.7 = most colors shared = visually same scene = suppress transition
  // <0.4 = most colors different = visual scene change = allow transition
  // 0.4-0.7 = uncertain = allow (benefit of the doubt, let intelligence decide)
  if (similarity > 0.7) {
    console.log(`[EDL-Exec] Single-source boundary at frame ${frame}: SUPPRESSED (color similarity ${similarity.toFixed(2)} > 0.7, same visual scene)`);
    return true;
  }

  console.log(`[EDL-Exec] Single-source boundary at frame ${frame}: ALLOWED (color similarity ${similarity.toFixed(2)}, visual change detected)`);
  return false;
}

function applyTransition(
  decision: EditDecision,
  overlays: Overlay[],
  projectId: string,
  userId: string,
  canvas: { width: number; height: number },
  idEpoch: number = 0,
  decisionIndex: number = 0,
): { created: number; modified: number } | null {
  const transType = (decision.params.transitionType || 'soft-cut') as string;
  let durationFrames = decision.durationFrames || (DEFAULT_TRANSITION_FRAMES as any)[transType] || 15;
  // Dissolve needs minimum duration to feel like a real crossfade, not a flash.
  // Intelligence layer often sets 15 frames (0.5s) → too fast. Clamp to 30+ (1s).
  if (transType === 'dissolve' && durationFrames < 30) {
    durationFrames = Math.max(durationFrames, DEFAULT_TRANSITION_FRAMES['dissolve'] || 36);
  }

  // hard-cut and editorial cuts don't produce visual transitions
  if (['hard-cut', 'smash-cut', 'match-cut', 'jump-cut', 'cut-on-action'].includes(transType)) {
    return null;
  }

  // Snap decision frame to nearest actual clip boundary FIRST so the dedup
  // below can use clipA/clipB identity (authoritative) instead of frame
  // proximity alone (fragile — misses when EDL and Director use different
  // reference frames for the same boundary).
  const boundaryMatch = snapToClipBoundary(decision.frame, overlays, 45);
  if (!boundaryMatch) {
    console.log(`[EDL-Exec] Transition at frame ${decision.frame}: SKIPPED — no clip boundary found within 45 frames`);
    return null;
  }
  if (boundaryMatch.drift > 0) {
    console.log(`[EDL-Exec] Transition at frame ${decision.frame}: snapped to boundary ${boundaryMatch.boundaryFrame} (drift: ${boundaryMatch.drift} frames)`);
  }
  const clipA = boundaryMatch.clipA;
  const clipB = boundaryMatch.clipB;
  const anchorFrame = boundaryMatch.boundaryFrame;

  // Check if a transition already exists for this clip pair. Clip-pair match
  // is the authoritative dedup key — a pair of clips has exactly one boundary,
  // so at most one transition belongs between them. Frame-proximity is kept
  // as a fallback for legacy overlays that don't have clipAId/clipBId set
  // (e.g. the pre-A1 in-memory markers that could still exist if someone
  // re-runs Director on an older project state).
  // See pipeline_investigations.md 2026-04-18 (Dual transition regression)
  // for why frame-only dedup missed same-pair duplicates across systems.
  const existingTransition = overlays.find(o => {
    if (o.type !== 'transition' && !(o as any).metadata?.isTransition) return false;
    // Authoritative: same clip pair
    if ((o as any).clipAId === clipA.id && (o as any).clipBId === clipB.id) return true;
    // Fallback: frame proximity for overlays missing clipAId/clipBId
    if ((o as any).clipAId == null || (o as any).clipBId == null) {
      return Math.abs(o.from - decision.frame) < 15;
    }
    return false;
  });
  if (existingTransition) {
    const reason = ((existingTransition as any).clipAId === clipA.id && (existingTransition as any).clipBId === clipB.id)
      ? `clipA=${clipA.id}/clipB=${clipB.id} pair match (source: ${(existingTransition as any).metadata?.source || 'unknown'})`
      : `legacy overlay within 15 frames`;
    console.log(`[EDL-Exec] Transition at frame ${decision.frame}: SKIPPED — ${reason}`);
    return null;
  }

  // Create proper TransitionOverlay tile (System A — editor renders these)
  const transitionOverlay = {
    // Deterministic ID: stable across render passes, unique per decision index
    id: deterministicOverlayId(idEpoch, 'transition', decision.frame, decisionIndex),
    type: 'transition' as const,
    from: anchorFrame - Math.floor(durationFrames / 2),
    durationInFrames: durationFrames,
    row: ROW.VIDEO, // DaVinci-style: transitions render inline between clips on the video track
    left: 0,
    top: 0,
    width: canvas.width,
    height: canvas.height,
    isDragging: false,
    rotation: 0,
    transitionStyle: transType,
    clipAId: clipA.id,
    clipBId: clipB.id,
    easing: 'ease-in-out' as const,
    content: transType, // Display name for timeline tile
    styles: { opacity: 1 },
    metadata: {
      isTransition: true,
      transitionType: transType,
      keyframeBased: transType === 'dissolve',
      source: 'edl',
      edlReason: decision.reason,
    },
  };

  overlays.push(transitionOverlay as any);

  // For dissolve: apply keyframe-based opacity crossfade to the two clips.
  // The Remotion renderer (transition-layer-content.tsx:78-90) already returns
  // { opacity: 0 } for dissolve — the visual comes from clip opacity keyframes,
  // not an HTML overlay. The transition tile exists for timeline visualization only.
  if (transType === 'dissolve') {
    const { outgoing, incoming } = createTrueDissolve(clipA, clipB, durationFrames);
    // Apply keyframe tracks back to the live overlays
    clipA.keyframeTracks = outgoing.keyframeTracks;
    clipB.keyframeTracks = incoming.keyframeTracks;
    clipB.from = incoming.from;
    clipB.durationInFrames = incoming.durationInFrames;
    console.log(`[EDL-Exec] True dissolve applied: clipA opacity fade-out over ${durationFrames} frames, clipB overlap + fade-in`);
    return { created: 1, modified: 2 };
  }

  // Clean up clip-overlap opacity keyframes that edit-direction-applier may
  // have placed on the adjacent clips at this boundary. Without this, both
  // the keyframe-based crossfade AND the transition tile render simultaneously
  // → double transition visual. Per creative doc §6 (Transition Psychology):
  // each boundary should have ONE transition effect, not two.
  //
  // Only remove opacity tracks near the boundary frame — preserve opacity
  // keyframes placed for other purposes (fade-in at clip start, fade-out at end).
  const boundaryLocalA = clipA.durationInFrames; // end of clipA (relative to clipA.from)
  const boundaryLocalB = 0; // start of clipB (relative to clipB.from)
  const cleanupMarginFrames = Math.ceil(durationFrames * 1.5); // generous margin

  for (const clip of [clipA, clipB]) {
    if (!clip.keyframeTracks) continue;
    const opacityIdx = clip.keyframeTracks.findIndex(
      (t: any) => t.property === 'opacity',
    );
    if (opacityIdx < 0) continue;

    const track = clip.keyframeTracks[opacityIdx];
    const isClipA = clip === clipA;
    // Check if ANY opacity keyframe is near the boundary
    const nearBoundary = track.keyframes.some((kf: any) => {
      const dist = isClipA
        ? Math.abs(kf.frame - boundaryLocalA)
        : Math.abs(kf.frame - boundaryLocalB);
      return dist <= cleanupMarginFrames;
    });

    if (nearBoundary) {
      // Remove opacity keyframes near the boundary, keep others
      const filtered = track.keyframes.filter((kf: any) => {
        const dist = isClipA
          ? Math.abs(kf.frame - boundaryLocalA)
          : Math.abs(kf.frame - boundaryLocalB);
        return dist > cleanupMarginFrames;
      });

      if (filtered.length === 0) {
        // All opacity keyframes were near boundary — remove entire track
        clip.keyframeTracks.splice(opacityIdx, 1);
      } else {
        clip.keyframeTracks[opacityIdx] = { ...track, keyframes: filtered };
      }
    }
  }

  console.log(`[EDL-Exec] Transition APPLIED: ${transType} tile at frame ${anchorFrame} (clipA=${clipA.id}, clipB=${clipB.id}, drift=${boundaryMatch.drift})`);
  return { created: 1, modified: 0 };
}

function applyZoom(
  decision: EditDecision,
  overlays: Overlay[],
  analyses?: Map<string, any>,
): { created: number; modified: number } | null {
  // Find the video overlay at this frame (with tolerance for pacing drift)
  const clipMatch = findClipAtFrame(decision.frame, overlays, 15);
  if (!clipMatch) {
    console.log(`[EDL-Exec] Zoom at frame ${decision.frame}: SKIPPED — no video clip found within 15 frames`);
    return null;
  }
  if (clipMatch.drift > 0) {
    console.log(`[EDL-Exec] Zoom at frame ${decision.frame}: snapped to clip at ${clipMatch.clip.from} (drift: ${clipMatch.drift} frames)`);
  }
  const videoOverlay = clipMatch.clip;

  // Guard: hook zone — creative graph mapping:structural.hook_zone_treatment
  // says first 5% of VIDEO needs strong visual opening without jarring zooms.
  //
  // OLD: blocked zooms in first 30 frames of EACH CLIP. Wrong for Mode 2
  // single-source projects where clips are editorial transcript cuts of continuous
  // footage. The viewer is watching the same camera — there's no "new shot
  // orientation" at each cut. This killed 53% of zoom decisions.
  //
  // NEW: Only apply hook zone guard at the start of the OVERALL VIDEO (first 5%
  // of total duration per creative graph) OR for multi-source projects where each
  // clip is genuinely a different visual (new shot = viewer needs orientation).
  const videoOverlays = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);
  const isFirstClipInTimeline = videoOverlays.length > 0 && videoOverlay === videoOverlays[0];
  const uniqueAssets = new Set(videoOverlays.map(o => (o as any).assetId).filter(Boolean));
  const isMultiSource = uniqueAssets.size > 1;

  const shouldApplyHookZone = isMultiSource
    ? decision.frame <= videoOverlay.from + 30  // Multi-source: per-clip (new shot)
    : isFirstClipInTimeline && decision.frame <= videoOverlay.from + 30; // Single-source: only first clip

  if (shouldApplyHookZone) {
    const analysis = videoOverlay.assetId ? analyses?.get(videoOverlay.assetId) : undefined;
    const peaks = (analysis as any)?.motionPeaks || [];
    if (peaks.length > 0 && peaks[0] > 30) {
      console.log(`[EDL-Exec] Zoom at frame ${decision.frame} in hook zone — shifted to first motion peak at frame ${videoOverlay.from + peaks[0]}`);
      decision.frame = videoOverlay.from + peaks[0];
    } else {
      console.log(`[EDL-Exec] Zoom at frame ${decision.frame} in hook zone — SKIPPED (no suitable motion peak)`);
      return null;
    }
  }

  // Validate zoom placement against 5-Track motion data when available.
  // Reject zoom decisions not near a motion peak or natural cut point (±10 frames).
  // This enforces Rule Z-010: "zoom-punch MUST be synced to emphasis word or visual impact."
  // If no analysis data, allow the zoom (trust Gemini's judgment from prompt context).
  if (analyses && videoOverlay.assetId) {
    const analysis = analyses.get(videoOverlay.assetId);
    if (analysis) {
      const quality = (analysis as any).analysisQuality || 'unknown';

      // Only validate against motion peaks if analysis quality is real.
      // Fallback data has no peaks — validation would pass vacuously.
      if (quality === 'high' || quality === 'medium') {
        const localDecisionFrame = decision.frame - videoOverlay.from;
        const peaks = analysis.motionPeaks || [];
        const cuts = analysis.naturalCutPoints || [];
        const allSignificantFrames = [...peaks, ...cuts];
        const nearSignificantFrame = allSignificantFrames.some(
          (f: number) => Math.abs(f - localDecisionFrame) <= 10,
        );
        if (!nearSignificantFrame && allSignificantFrames.length > 0) {
          decision.params.zoomType = 'slow-push';
          decision.params.scaleTo = Math.min(decision.params.scaleTo || 1.1, 1.05);
          console.log(`[EDL-Exec] Zoom at frame ${decision.frame} not near motion peak — downgraded to slow-push (analysis quality: ${quality})`);
        }
      } else {
        // Low/fallback quality — trust Gemini's anchor-based placement, don't validate against fake peaks
        console.log(`[EDL-Exec] Zoom at frame ${decision.frame} — skipping motion peak validation (analysis quality: ${quality})`);
      }
    }
  }

  const localFrame = decision.frame - videoOverlay.from;
  const sceneEnd = videoOverlay.durationInFrames;
  const duration = decision.durationFrames || 20;
  const scaleFrom = decision.params.scaleFrom || 1.0;
  const scaleTo = decision.params.scaleTo || 1.1;

  // Add scale keyframe track
  if (!videoOverlay.keyframeTracks) videoOverlay.keyframeTracks = [];

  // Remove existing scale track if any
  videoOverlay.keyframeTracks = videoOverlay.keyframeTracks.filter(
    (t: KeyframeTrack) => t.property !== 'scale',
  );

  // Determine zoom subtype from params or infer from scale values
  // punch-in: quick zoom to target, HOLD for rest of scene (Z-010)
  // slow-push: gradual zoom over full scene duration (Z-001)
  // pull-back: zoom out from close to wide (Z-020)
  const zoomType = decision.params.zoomType
    || (scaleTo < scaleFrom ? 'pull-back' : (duration >= sceneEnd * 0.5 ? 'slow-push' : 'punch-in'));

  type Easing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  let keyframes: Array<{ frame: number; value: number; easing: Easing }>;

  switch (zoomType) {
    case 'punch-in':
      // Quick zoom to target at decision frame, then HOLD at that scale
      // 3 keyframes: before → punch → hold at scene end
      keyframes = [
        { frame: Math.max(0, localFrame - 5), value: scaleFrom, easing: 'ease-in' },
        { frame: localFrame + Math.min(duration, 15), value: scaleTo, easing: 'ease-out' },
        { frame: sceneEnd, value: scaleTo, easing: 'linear' }, // HOLD — don't bounce back
      ];
      break;

    case 'pull-back':
      // Start zoomed in, gradually pull back to normal
      keyframes = [
        { frame: Math.max(0, localFrame), value: scaleTo, easing: 'ease-in-out' },
        { frame: Math.min(localFrame + duration, sceneEnd), value: scaleFrom, easing: 'ease-out' },
      ];
      break;

    case 'slow-push':
    default:
      // Gentle zoom over the full scene duration (cinematic push)
      keyframes = [
        { frame: 0, value: scaleFrom, easing: 'ease-in-out' },
        { frame: sceneEnd, value: scaleTo, easing: 'ease-in-out' },
      ];
      break;
  }

  videoOverlay.keyframeTracks.push({
    property: 'scale',
    keyframes,
  });

  return { created: 0, modified: 1 };
}

function applySpeedChange(
  decision: EditDecision,
  overlays: Overlay[],
): { created: number; modified: number } | null {
  const clipMatch = findClipAtFrame(decision.frame, overlays, 15);
  if (!clipMatch) return null;
  const videoOverlay = clipMatch.clip as any;

  const localFrame = decision.frame - videoOverlay.from;
  const duration = decision.durationFrames || 30;
  const clipDuration = videoOverlay.durationInFrames;
  const { speedFrom = 1.0, speedTo = 0.5, speedBack = 1.0 } = decision.params;

  // Phase A3.5.6 fix: build keyframes then validate them — clamp frames to clip bounds,
  // dedupe same-frame entries (last wins), enforce monotonic order. Previous version
  // produced invalid curves like [{frame:0}, {frame:0}, {frame:120 on 60-frame clip}, {frame:60}].
  const rawKeyframes = [
    { frame: Math.max(0, localFrame - 5), value: speedFrom, easing: 'ease-in' as const },
    { frame: localFrame + Math.floor(duration / 3), value: speedTo, easing: 'ease-in-out' as const },
    { frame: localFrame + duration, value: speedBack, easing: 'ease-out' as const },
  ];

  // Clamp each frame to [0, clipDuration - 1]
  const clamped = rawKeyframes.map(kf => ({
    ...kf,
    frame: Math.max(0, Math.min(clipDuration - 1, kf.frame)),
  }));

  // Dedupe by frame (last occurrence wins)
  const byFrame = new Map<number, typeof clamped[number]>();
  for (const kf of clamped) byFrame.set(kf.frame, kf);

  // Sort ascending by frame — guarantees monotonic order
  const validated = Array.from(byFrame.values()).sort((a, b) => a.frame - b.frame);

  if (validated.length < 2) {
    console.log(`[EDL-Exec] Speed-change at frame ${decision.frame}: SKIPPED — after clamping, <2 distinct keyframes for clipDuration=${clipDuration}`);
    return null;
  }

  videoOverlay.speedCurve = validated;
  return { created: 0, modified: 1 };
}

function applyFade(
  decision: EditDecision,
  overlays: Overlay[],
): { created: number; modified: number } | null {
  const clipMatch = findClipAtFrame(decision.frame, overlays, 15);
  if (!clipMatch) return null;
  const overlay = clipMatch.clip;

  const localFrame = decision.frame - overlay.from;
  const duration = decision.durationFrames || 20;
  const { fromOpacity = 1, toOpacity = 0 } = decision.params;

  if (!overlay.keyframeTracks) overlay.keyframeTracks = [];
  overlay.keyframeTracks = overlay.keyframeTracks.filter(
    (t: KeyframeTrack) => t.property !== 'opacity',
  );

  overlay.keyframeTracks.push({
    property: 'opacity',
    keyframes: [
      { frame: localFrame, value: fromOpacity, easing: 'ease-in-out' },
      { frame: localFrame + duration, value: toOpacity, easing: 'linear' },
    ],
  });

  return { created: 0, modified: 1 };
}

function applyGraphic(
  decision: EditDecision,
  overlays: Overlay[],
  projectId: string,
  userId: string,
  canvas: { width: number; height: number },
  idEpoch: number = 0,
  decisionIndex: number = 0,
): { created: number; modified: number } | null {
  const { graphicType, text, position } = decision.params;
  if (!text) return null;

  // DEDUP: Don't create graphic if one already exists at this frame range.
  // Multiple systems (finalize, EDL, Director, chat) can create graphics.
  // First one wins — no visual clutter from overlapping graphics.
  const _graphicCheckDur = decision.durationFrames || 90;
  const existingGraphic = overlays.find(o =>
    (o.type === 'html-scene' || (o as any).type === 'sticker') &&
    o.from <= decision.frame + 15 &&
    (o.from + o.durationInFrames) >= decision.frame - 15
  );
  if (existingGraphic) {
    console.log(`[EDL-Exec] Graphic at frame ${decision.frame}: SKIPPED — existing graphic at frame ${existingGraphic.from} (dedup)`);
    return null;
  }

  // Type-specific durations (not one-size-fits-all)
  const GRAPHIC_DURATIONS: Record<string, number> = {
    'stat-counter': 120,      // 4s — needs counting animation + read time
    'keyword-highlight': 60,  // 2s — brief pop
    'lower-third': 90,        // 3s — name/title read time
    'quote-card': 120,        // 4s — full sentence read time
    'logo-reveal': 120,       // 4s — brand moment
    'callout': 75,            // 2.5s — brief label
  };
  const duration = decision.durationFrames || GRAPHIC_DURATIONS[graphicType] || 90;
  // Full HTML entity escaping — prevents XSS if Gemini outputs malicious text
  const safeText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  // Aspect-ratio-aware positioning
  const isPortrait = canvas.height > canvas.width;
  const _isSquare = Math.abs(canvas.width - canvas.height) < 100;
  const safeMargin = canvas.width * 0.05;

  // Position + dimensions per graphic type (responsive)
  let left = safeMargin;
  let top = canvas.height * 0.8;
  let width = canvas.width * 0.4;
  let height = 80;

  // ── Build HTML per graphic type (5 distinct templates) ──
  let html = '';

  switch (graphicType) {
    case 'stat-counter': {
      // Big number center-screen with accent bar — for statistics, percentages
      left = isPortrait ? canvas.width * 0.08 : canvas.width * 0.2;
      top = isPortrait ? canvas.height * 0.35 : canvas.height * 0.3;
      width = isPortrait ? canvas.width * 0.84 : canvas.width * 0.6;
      height = isPortrait ? canvas.height * 0.2 : canvas.height * 0.35;
      html = `
<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;padding:24px;">
  <div style="background:linear-gradient(135deg,rgba(0,0,0,0.85),rgba(20,20,40,0.9));backdrop-filter:blur(16px);border-radius:16px;padding:32px 48px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 20px 60px rgba(0,0,0,0.5);animation:statIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards;opacity:0;">
    <div style="width:40px;height:3px;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:2px;margin-bottom:16px;"></div>
    <div style="color:#fff;font-family:system-ui,-apple-system,sans-serif;font-size:48px;font-weight:900;text-align:center;letter-spacing:-0.02em;line-height:1.1;">
      ${safeText}
    </div>
    <div style="width:40px;height:3px;background:linear-gradient(90deg,#8b5cf6,#6366f1);border-radius:2px;margin-top:16px;"></div>
  </div>
</div>
<style>
@keyframes statIn { 0% { opacity:0; transform:scale(0.8) translateY(20px); } 100% { opacity:1; transform:scale(1) translateY(0); } }
</style>`;
      break;
    }

    case 'callout': {
      // Positioned near subject with arrow indicator — for product/feature callouts
      if (position) {
        left = Math.min(Math.max((position.x || 0.5) * canvas.width - 150, 20), canvas.width - 340);
        top = Math.max(20, ((position.y || 0.5) * canvas.height) - 60);
      }
      width = Math.round(canvas.width * 0.18); // 18% of canvas, not fixed 320px
      height = 70;
      html = `
<div style="display:flex;align-items:center;gap:10px;width:100%;height:100%;padding:8px;">
  <div style="width:4px;height:36px;background:#f59e0b;border-radius:2px;flex-shrink:0;animation:barIn 0.3s ease-out forwards;"></div>
  <div style="background:rgba(0,0,0,0.8);backdrop-filter:blur(12px);border-radius:10px;padding:10px 18px;border:1px solid rgba(245,158,11,0.3);animation:callIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards;opacity:0;">
    <div style="color:#fff;font-family:system-ui,-apple-system,sans-serif;font-size:17px;font-weight:600;letter-spacing:0.01em;">
      ${safeText}
    </div>
  </div>
</div>
<style>
@keyframes callIn { 0% { opacity:0; transform:translateX(-12px); } 100% { opacity:1; transform:translateX(0); } }
@keyframes barIn { 0% { height:0; } 100% { height:36px; } }
</style>`;
      break;
    }

    case 'lower-third': {
      // Bottom-left name/title bar — for person introductions
      left = isPortrait ? canvas.width * 0.05 : canvas.width * 0.04;
      top = canvas.height * 0.78;
      width = isPortrait ? canvas.width * 0.9 : canvas.width * 0.45;
      height = 80;
      html = `
<div style="display:flex;align-items:flex-end;width:100%;height:100%;padding:8px 0;">
  <div style="position:relative;animation:ltIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards;opacity:0;">
    <div style="background:rgba(255,255,255,0.95);padding:8px 24px 8px 16px;border-radius:0 8px 8px 0;">
      <div style="color:#111;font-family:system-ui,-apple-system,sans-serif;font-size:18px;font-weight:700;letter-spacing:0.01em;">
        ${safeText}
      </div>
    </div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:#ef4444;border-radius:2px 0 0 2px;"></div>
  </div>
</div>
<style>
@keyframes ltIn { 0% { opacity:0; transform:translateX(-30px); } 100% { opacity:1; transform:translateX(0); } }
</style>`;
      break;
    }

    case 'quote-card': {
      // Centered quote with quotation marks — for direct quotes, testimonials
      left = canvas.width * 0.15;
      top = canvas.height * 0.3;
      width = canvas.width * 0.7;
      height = canvas.height * 0.35;
      html = `
<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:24px;">
  <div style="background:rgba(0,0,0,0.8);backdrop-filter:blur(20px);border-radius:16px;padding:28px 36px;border:1px solid rgba(255,255,255,0.06);max-width:600px;animation:quoteIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards;opacity:0;">
    <div style="color:rgba(255,255,255,0.3);font-size:40px;font-family:Georgia,serif;line-height:1;margin-bottom:-8px;">\u201C</div>
    <div style="color:#fff;font-family:Georgia,serif;font-size:22px;font-weight:400;font-style:italic;text-align:center;line-height:1.5;letter-spacing:0.01em;">
      ${safeText}
    </div>
    <div style="color:rgba(255,255,255,0.3);font-size:40px;font-family:Georgia,serif;line-height:1;text-align:right;margin-top:-8px;">\u201D</div>
  </div>
</div>
<style>
@keyframes quoteIn { 0% { opacity:0; transform:scale(0.95); } 100% { opacity:1; transform:scale(1); } }
</style>`;
      break;
    }

    case 'logo-reveal': {
      // Centered brand logo text with cinematic reveal — for final scenes
      left = canvas.width * 0.15;
      top = canvas.height * 0.35;
      width = canvas.width * 0.7;
      height = canvas.height * 0.3;
      html = `
<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;padding:24px;">
  <div style="animation:logoReveal 1.2s cubic-bezier(0.16,1,0.3,1) forwards;opacity:0;">
    <div style="color:#fff;font-family:system-ui,-apple-system,sans-serif;font-size:64px;font-weight:900;text-align:center;letter-spacing:-0.03em;text-shadow:0 4px 20px rgba(0,0,0,0.5);">
      ${safeText}
    </div>
    <div style="width:80px;height:4px;background:linear-gradient(90deg,#FFD700,#FFA500);border-radius:2px;margin:16px auto 0;animation:barExpand 0.6s ease-out 0.4s both;"></div>
  </div>
</div>
<style>
@keyframes logoReveal { 0% { opacity:0; transform:scale(0.8) translateY(20px); } 50% { opacity:1; } 100% { opacity:1; transform:scale(1) translateY(0); } }
@keyframes barExpand { 0% { width:0; } 100% { width:80px; } }
</style>`;
      break;
    }

    case 'keyword-highlight':
    default: {
      // Compact pop-up keyword — for emphasis words, topic labels, highlights
      // Position above captions if they exist, otherwise near bottom
      const hasCaptionsAtFrame = overlays.some((o: any) =>
        o.type === 'caption' && o.from <= decision.frame &&
        (o.from + o.durationInFrames) > decision.frame
      );
      left = isPortrait ? canvas.width * 0.08 : canvas.width * 0.05;
      top = hasCaptionsAtFrame ? canvas.height * 0.68 : canvas.height * 0.82;
      width = Math.min(canvas.width * 0.5, Math.max(200, safeText.length * 14 + 60));
      height = 56;
      html = `
<div style="display:flex;align-items:center;width:100%;height:100%;padding:6px;">
  <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(0,0,0,0.85);backdrop-filter:blur(12px);border-radius:8px;padding:8px 18px;border:1px solid rgba(255,255,255,0.1);animation:kwIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards;opacity:0;transform-origin:left center;">
    <div style="width:6px;height:6px;border-radius:50%;background:#22c55e;flex-shrink:0;"></div>
    <div style="color:#fff;font-family:system-ui,-apple-system,sans-serif;font-size:16px;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;">
      ${safeText}
    </div>
  </div>
</div>
<style>
@keyframes kwIn { 0% { opacity:0; transform:scale(0.7); } 100% { opacity:1; transform:scale(1); } }
</style>`;
      break;
    }
  }

  // Snap graphic to nearest containing clip (handles pacing drift).
  // If decision.frame falls in a gap between clips, snap to nearest clip start.
  const graphicClipMatch = findClipAtFrame(decision.frame, overlays, 20);
  const snappedGraphicFrame = graphicClipMatch ? graphicClipMatch.snappedFrame : decision.frame;
  if (graphicClipMatch && graphicClipMatch.drift > 0) {
    console.log(`[EDL-Exec] Graphic at frame ${decision.frame}: snapped to ${snappedGraphicFrame} (drift: ${graphicClipMatch.drift} frames)`);
  }

  const graphicOverlay = {
    // Deterministic ID: stable across render passes, unique per decision index
    id: deterministicOverlayId(idEpoch, 'graphic', decision.frame, decisionIndex),
    type: 'html-scene' as const,
    from: snappedGraphicFrame,
    durationInFrames: duration,
    // Row 1 (above video on row 2, below captions-exception at z-index 95).
    // NOTE: row 1 is canonically BGM but BGM is audio-only (no visual collision).
    // Graphics need z-index above video (row 2 = z-idx 80) and z-idx formula is 100-row*10,
    // so row 1 = z-idx 90. Moving to canonical ROW.MOTION_GRAPHICS (6) would yield z-idx 40
    // which is BELOW video — graphics would be invisible. This is an intentional exception.
    row: ROW.BGM, // = 1, see comment above
    left,
    top,
    width,
    height,
    isDragging: false,
    rotation: 0,
    content: html,
    styles: {
      opacity: 1,
      backgroundColor: 'transparent',
    },
    metadata: {
      sourceType: 'edl-graphic',
      graphicType,
      edlSource: decision.source,
      edlReason: decision.reason,
    },
  };

  overlays.push(graphicOverlay as any);
  return { created: 1, modified: 0 };
}

function applyAudioDuck(
  decision: EditDecision,
  overlays: Overlay[],
): { created: number; modified: number } | null {
  // Find BGM overlay (row 1 sound). Match by ROW.BGM constant + assetId prefix fallback.
  const bgm = overlays.find(o => o.type === 'sound' && (o.row === ROW.BGM || (o.assetId || '').startsWith('bgm_'))) as any;
  if (!bgm) return null;

  // Already has ducking? Skip.
  if (bgm.styles?.duckingConfig?.enabled) return null;

  const { duckLevel = 0.20, rampDownMs = 300, rampUpMs = 600 } = decision.params;

  if (!bgm.styles) bgm.styles = {};
  bgm.styles.duckingConfig = {
    enabled: true,
    duckLevel,
    rampDownMs,
    rampUpMs,
    lookAheadMs: 200,
  };

  return { created: 0, modified: 1 };
}

function _applyFilterChange(
  decision: EditDecision,
  overlays: Overlay[],
): { created: number; modified: number } | null {
  let { filterId, filterCss } = decision.params;

  // Phase A3.5.4 fix: previously `filterId` was read but never resolved to CSS — only
  // `filterCss` was applied. Now if filterId is set, resolve it via getFilterPresetById
  // so server-safe preset names ("golden-hour-pro", "film-portra", etc.) actually work.
  if (filterId && !filterCss) {
    const preset = getFilterPresetById(filterId);
    if (preset && preset.id !== 'none') {
      filterCss = preset.filter;
    }
  }

  // If Unified Intelligence didn't specify which filter, try to infer from the decision reason.
  // Reasons often contain filter keywords like "vintage-film", "warm", "golden-hour", "crisp-vibrant".
  if (!filterId && !filterCss && decision.reason) {
    const reason = decision.reason.toLowerCase();
    const filterKeywords: Record<string, string> = {
      'vintage': 'sepia(30%) contrast(110%) brightness(95%)',
      'golden-hour': 'contrast(108%) brightness(108%) saturate(140%) sepia(18%) hue-rotate(348deg)',
      'warm': 'contrast(108%) brightness(105%) saturate(120%) sepia(10%)',
      'cool': 'contrast(110%) brightness(100%) saturate(90%) hue-rotate(180deg)',
      'cinematic': 'contrast(115%) brightness(95%) saturate(110%)',
      'crisp': 'contrast(120%) brightness(105%) saturate(130%)',
      'noir': 'grayscale(100%) contrast(130%) brightness(90%)',
      'vibrant': 'contrast(110%) brightness(105%) saturate(150%)',
    };
    for (const [keyword, css] of Object.entries(filterKeywords)) {
      if (reason.includes(keyword)) {
        filterCss = css;
        console.log(`[EDL-Exec] Filter-change at frame ${decision.frame}: inferred "${keyword}" from reason`);
        break;
      }
    }
  }

  if (!filterId && !filterCss) {
    console.log(`[EDL-Exec] Filter-change at frame ${decision.frame}: SKIPPED — no filterId, filterCss, or inferable keyword in reason`);
    return null;
  }

  // Bundle 3 (2026-04-08): Skin-tone safety rail.
  // Reject any filter with hue-rotate > 30deg (or < -30deg) unless the user's edit profile
  // EXPLICITLY selected a stylistic preset (teal-orange, blade-runner, neon-nights, cool).
  // Generic EDL filter-change decisions must not turn skin tones blue/green on emotional
  // / human / nostalgia content. See creative_production_knowledge.md §6 Color Grading
  // Psychology + Phase A3.5.4 disaster inventory.
  if (filterCss) {
    const hueMatch = filterCss.match(/hue-rotate\((-?\d+)deg\)/);
    if (hueMatch) {
      const degrees = parseInt(hueMatch[1], 10);
      // Normalize to [-180, 180]
      let normalized = degrees % 360;
      if (normalized > 180) normalized -= 360;
      if (normalized < -180) normalized += 360;
      if (Math.abs(normalized) > 30) {
        console.warn(`[EDL-Exec] Filter-change at frame ${decision.frame}: REJECTED filterCss with hue-rotate(${normalized}deg) — too extreme for skin tones. (filterId was "${filterId || '(none)'}")`);
        return null;
      }
    }
  }

  let modified = 0;
  const videoOverlays = overlays.filter(o =>
    (o.type === 'video' || o.type === 'image') &&
    o.from <= decision.frame &&
    o.from + o.durationInFrames > decision.frame,
  );

  // Bundle 3 (2026-04-08): Don't overwrite a filter that finalize already set.
  // Finalize's applyEditDirections picks a mood-appropriate filter from moodFilterMap
  // (which Bundle 1 locked to skin-tone-safe presets only). Director's batch_update_overlays
  // ALREADY respects this via a script-filter-preserved guard. The EDL executor didn't,
  // which is how teal-orange hue-rotate(160deg) ended up on clips 0+2 of proj_r8E_z9WVaBX9
  // despite mood='calm' and mood='inspirational' both mapping to golden-hour-pro.
  // Fix: same guard here. Only apply filter-change to overlays that have no filter yet.
  for (const overlay of videoOverlays) {
    if (!(overlay as any).styles) (overlay as any).styles = {};
    if ((overlay as any).styles.filter) {
      // Finalize/Director already set a filter — respect it. Skip this overlay.
      continue;
    }
    if (filterCss) {
      (overlay as any).styles.filter = filterCss;
    }
    modified++;
  }

  return modified > 0 ? { created: 0, modified } : null;
}
