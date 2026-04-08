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
import { DEFAULT_TRANSITION_FRAMES } from '@/lib/editron/data/transition-templates';
import { projectService } from '@/lib/editron/services/project-service';
import type { Overlay, KeyframeTrack } from '@/components/editron/editor/version-7.0.0/types';
import { DEFAULT_CONFIG } from '@/lib/editron/config/editron-config';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import { getFilterPresetById } from '@/lib/editron/data/filter-presets';

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

  // Only execute high-confidence decisions (>0.5)
  const minConfidence = DEFAULT_CONFIG.analysis.minConfidenceForDecisions;
  const actionable = edl.decisions.filter(d => d.confidence > minConfidence);
  console.log(`[EDL-Exec] Executing ${actionable.length}/${edl.totalDecisions} decisions (confidence > ${minConfidence}) with budget enforcement`);

  // Deterministic epoch for overlay IDs — stable within this Director run, unique across runs.
  // Derived from projectId hash so the same EDL on the same project always produces the same IDs.
  const idEpoch = Math.floor(Date.now() / 1000);

  let budgetRejected = 0;
  let decisionIndex = 0;

  for (const decision of actionable) {
    const currentDecisionIndex = decisionIndex++;
    // Check budget BEFORE applying
    const budgetResult = budget.evaluate(decision as any);
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

      // If budget suggests an alternative, try that instead
      if (budgetResult.alternative) {
        const altDecision = { ...decision, ...budgetResult.alternative };
        const altBudgetResult = budget.evaluate(altDecision as any);
        if (altBudgetResult.allowed) {
          try {
            const applied = await applyDecision(altDecision as EditDecision, overlays, projectId, userId, canvasDimensions, analyses, idEpoch, currentDecisionIndex + 100000);
            if (applied) {
              budget.commit(altDecision as any);
              result.decisionsExecuted++;
              if (applied.created) result.overlaysCreated += applied.created;
              if (applied.modified) result.overlaysModified += applied.modified;
              console.log(`[EDL-Exec] BUDGET ALTERNATIVE: ${altDecision.type} at frame ${altDecision.frame} (replaced ${decision.type})`);
            }
          } catch {}
        }
      }
      continue;
    }

    try {
      const applied = await applyDecision(decision, overlays, projectId, userId, canvasDimensions, analyses, idEpoch, currentDecisionIndex);
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
      return applyFilterChange(decision, overlays);

    case 'caption-emphasis':
      // Caption emphasis is handled by Director's add_captions step with word-level timing
      return null;

    case 'sfx-trigger':
      // SFX triggers are informational — the SFX worker already placed sounds during finalize.
      // Future: could adjust volume/timing of existing SFX overlays at this frame.
      return null;

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
  const durationFrames = decision.durationFrames || (DEFAULT_TRANSITION_FRAMES as any)[transType] || 15;

  // hard-cut and editorial cuts don't produce visual transitions
  if (['hard-cut', 'smash-cut', 'match-cut', 'jump-cut', 'cut-on-action'].includes(transType)) {
    return null;
  }

  // Check if a transition already exists near this frame
  const existingTransition = overlays.find(o =>
    (o.type === 'transition' || (o as any).metadata?.isTransition) &&
    Math.abs(o.from - decision.frame) < 15,
  );
  if (existingTransition) {
    console.log(`[EDL-Exec] Transition at frame ${decision.frame}: SKIPPED — existing transition within 15 frames`);
    return null;
  }

  // Find the two clips at this boundary (clip A ends, clip B starts)
  const visualOverlays = overlays
    .filter(o => o.type === 'video' || o.type === 'image')
    .sort((a, b) => a.from - b.from);

  // Find clip A (ends near decision.frame) and clip B (starts near decision.frame)
  let clipA: any = null;
  let clipB: any = null;
  let bestDist = Infinity;

  for (let i = 0; i < visualOverlays.length - 1; i++) {
    const a = visualOverlays[i];
    const b = visualOverlays[i + 1];
    const boundary = a.from + a.durationInFrames;
    const dist = Math.abs(boundary - decision.frame);
    if (dist < bestDist && dist <= 30) {
      bestDist = dist;
      clipA = a;
      clipB = b;
    }
  }

  if (!clipA || !clipB) {
    console.log(`[EDL-Exec] Transition at frame ${decision.frame}: SKIPPED — no clip boundary found within 30 frames`);
    return null;
  }

  const anchorFrame = clipA.from + clipA.durationInFrames;

  // Create proper TransitionOverlay tile (System A — editor renders these)
  const transitionOverlay = {
    // Deterministic ID: stable across render passes, unique per decision index
    id: deterministicOverlayId(idEpoch, 'transition', decision.frame, decisionIndex),
    type: 'transition' as const,
    from: anchorFrame - Math.floor(durationFrames / 2),
    durationInFrames: durationFrames,
    row: ROW.TRANSITIONS,
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
      source: 'edl',
      edlReason: decision.reason,
    },
  };

  overlays.push(transitionOverlay as any);
  console.log(`[EDL-Exec] Transition APPLIED: ${transType} tile at frame ${anchorFrame} (clipA=${clipA.id}, clipB=${clipB.id}, dist=${bestDist})`);
  return { created: 1, modified: 0 };
}

function applyZoom(
  decision: EditDecision,
  overlays: Overlay[],
  analyses?: Map<string, any>,
): { created: number; modified: number } | null {
  // Find the video overlay active at this frame
  const videoOverlay = overlays.find(o =>
    o.type === 'video' &&
    o.from <= decision.frame &&
    o.from + o.durationInFrames > decision.frame,
  );
  if (!videoOverlay) return null;

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
  const videoOverlay = overlays.find(o =>
    o.type === 'video' &&
    o.from <= decision.frame &&
    o.from + o.durationInFrames > decision.frame,
  ) as any;
  if (!videoOverlay) return null;

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
  const overlay = overlays.find(o =>
    (o.type === 'video' || o.type === 'image') &&
    o.from <= decision.frame &&
    o.from + o.durationInFrames > decision.frame,
  );
  if (!overlay) return null;

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
  const graphicCheckDur = decision.durationFrames || 90;
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
  const isSquare = Math.abs(canvas.width - canvas.height) < 100;
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

  const graphicOverlay = {
    // Deterministic ID: stable across render passes, unique per decision index
    id: deterministicOverlayId(idEpoch, 'graphic', decision.frame, decisionIndex),
    type: 'html-scene' as const,
    from: decision.frame,
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

function applyFilterChange(
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
