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
import { buildTransitionOverlay, type TransitionType, DEFAULT_TRANSITION_FRAMES } from '@/lib/editron/data/transition-templates';
import { projectService } from '@/lib/editron/services/project-service';

// ─── Types ───────────────────────────────────────────────────────

export interface ExecutionResult {
  decisionsExecuted: number;
  decisionsSkipped: number;
  overlaysCreated: number;
  overlaysModified: number;
  errors: string[];
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
): Promise<ExecutionResult> {
  const result: ExecutionResult = {
    decisionsExecuted: 0,
    decisionsSkipped: 0,
    overlaysCreated: 0,
    overlaysModified: 0,
    errors: [],
  };

  // ─── Budget enforcement (Director Knowledge Base) ──────────────
  // Prevents "amateur AI editing" where the engine goes overboard with
  // zoom-punches, shakes, and graphics on every frame.
  const { DecisionBudget } = await import('./decision-budget');
  const totalDurationMs = overlays
    .filter(o => o.type === 'video' || o.type === 'image')
    .reduce((max, o) => Math.max(max, (o.from + o.durationInFrames) / 30 * 1000), 0);
  const budget = new DecisionBudget(totalDurationMs || 30000, 30);

  // Only execute high-confidence decisions (>0.5)
  const actionable = edl.decisions.filter(d => d.confidence > 0.5);
  console.log(`[EDL-Exec] Executing ${actionable.length}/${edl.totalDecisions} decisions (confidence > 0.5) with budget enforcement`);

  let budgetRejected = 0;

  for (const decision of actionable) {
    // Check budget BEFORE applying
    const budgetResult = budget.evaluate(decision as any);
    if (!budgetResult.allowed) {
      result.decisionsSkipped++;
      budgetRejected++;
      console.log(`[EDL-Exec] BUDGET REJECTED: ${decision.type} at frame ${decision.frame} — ${budgetResult.reason} (${budgetResult.ruleId})`);

      // If budget suggests an alternative, try that instead
      if (budgetResult.alternative) {
        const altDecision = { ...decision, ...budgetResult.alternative };
        const altBudgetResult = budget.evaluate(altDecision as any);
        if (altBudgetResult.allowed) {
          try {
            const applied = await applyDecision(altDecision, overlays, projectId, userId, canvasDimensions);
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
      const applied = await applyDecision(decision, overlays, projectId, userId, canvasDimensions);
      if (applied) {
        budget.commit(decision as any);
        result.decisionsExecuted++;
        if (applied.created) result.overlaysCreated += applied.created;
        if (applied.modified) result.overlaysModified += applied.modified;
      } else {
        result.decisionsSkipped++;
      }
    } catch (err: any) {
      result.decisionsSkipped++;
      result.errors.push(`${decision.type} at frame ${decision.frame}: ${err.message}`);
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
): Promise<{ created: number; modified: number } | null> {

  switch (decision.type) {
    case 'transition':
      return applyTransition(decision, overlays, projectId, userId, canvas);

    case 'zoom':
      return applyZoom(decision, overlays);

    case 'speed-change':
      return applySpeedChange(decision, overlays);

    case 'fade':
      return applyFade(decision, overlays);

    case 'graphic':
      return applyGraphic(decision, overlays, projectId, userId, canvas);

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

  const maxOffset = intensity * canvas.width * 0.01; // 1% of canvas width (scales with resolution)
  for (let i = 1; i <= shakeFrames; i++) {
    const decay = 1 - (i / shakeFrames); // decay over time
    const xOff = (Math.random() - 0.5) * 2 * maxOffset * decay;
    const yOff = (Math.random() - 0.5) * 2 * maxOffset * decay;
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

function applyTransition(
  decision: EditDecision,
  overlays: Overlay[],
  projectId: string,
  userId: string,
  canvas: { width: number; height: number },
): { created: number; modified: number } | null {
  const transType = (decision.params.transitionType || 'soft-cut') as TransitionType;
  const durationFrames = decision.durationFrames || DEFAULT_TRANSITION_FRAMES[transType] || 15;

  // Check if a transition already exists near this frame
  const existingTransition = overlays.find(o =>
    o.type === 'html-scene' && Math.abs(o.from - decision.frame) < 15,
  );
  if (existingTransition) return null; // Don't double-insert

  const transOverlay = buildTransitionOverlay(transType, {
    startFrame: decision.frame - Math.floor(durationFrames / 2),
    durationFrames,
    width: canvas.width,
    height: canvas.height,
  }, Date.now() + Math.random() * 10000);

  if (transOverlay) {
    overlays.push({ ...transOverlay, id: Date.now() + Math.floor(Math.random() * 10000) } as any);
    return { created: 1, modified: 0 };
  }
  return null;
}

function applyZoom(
  decision: EditDecision,
  overlays: Overlay[],
): { created: number; modified: number } | null {
  // Find the video overlay active at this frame
  const videoOverlay = overlays.find(o =>
    o.type === 'video' &&
    o.from <= decision.frame &&
    o.from + o.durationInFrames > decision.frame,
  );
  if (!videoOverlay) return null;

  const localFrame = decision.frame - videoOverlay.from;
  const duration = decision.durationFrames || 20;
  const scaleFrom = decision.params.scaleFrom || 1.0;
  const scaleTo = decision.params.scaleTo || 1.1;

  // Add scale keyframe track
  if (!videoOverlay.keyframeTracks) videoOverlay.keyframeTracks = [];

  // Remove existing scale track if any
  videoOverlay.keyframeTracks = videoOverlay.keyframeTracks.filter(
    (t: KeyframeTrack) => t.property !== 'scale',
  );

  videoOverlay.keyframeTracks.push({
    property: 'scale',
    keyframes: [
      { frame: Math.max(0, localFrame - 5), value: scaleFrom, easing: 'ease-in-out' },
      { frame: localFrame + Math.floor(duration / 2), value: scaleTo, easing: 'ease-in-out' },
      { frame: localFrame + duration, value: scaleFrom, easing: 'ease-out' },
    ],
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
  const { speedFrom = 1.0, speedTo = 0.5, speedBack = 1.0 } = decision.params;

  videoOverlay.speedCurve = [
    { frame: Math.max(0, localFrame - 5), value: speedFrom, easing: 'ease-in' },
    { frame: localFrame + Math.floor(duration / 3), value: speedTo, easing: 'ease-in-out' },
    { frame: localFrame + duration, value: speedBack, easing: 'ease-out' },
  ];

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
): { created: number; modified: number } | null {
  const { graphicType, text, position } = decision.params;
  if (!text) return null;

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
  const safeText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
    id: Date.now() + Math.floor(Math.random() * 10000),
    type: 'html-scene' as const,
    from: decision.frame,
    durationInFrames: duration,
    row: 1, // Row 1 (above video on row 2, below captions on row 0)
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
  // Find BGM overlay (row 1 sound)
  const bgm = overlays.find(o => o.type === 'sound' && o.row === 1) as any;
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
  const { filterId, filterCss } = decision.params;
  if (!filterId && !filterCss) return null;

  let modified = 0;
  const videoOverlays = overlays.filter(o =>
    (o.type === 'video' || o.type === 'image') &&
    o.from <= decision.frame &&
    o.from + o.durationInFrames > decision.frame,
  );

  for (const overlay of videoOverlays) {
    if (!(overlay as any).styles) (overlay as any).styles = {};
    if (filterCss) {
      (overlay as any).styles.filter = filterCss;
    }
    modified++;
  }

  return modified > 0 ? { created: 0, modified } : null;
}
