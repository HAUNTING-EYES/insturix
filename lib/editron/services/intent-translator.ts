/**
 * Intent Translator — Creative Intent → Frame-Accurate EDL
 *
 * Layer 2 of the 3-layer editing architecture:
 *   Layer 1 (LLM): Creative decisions — WHAT + WHY, no frame numbers
 *   Layer 2 (This): Frame resolution — maps intent to exact frames using 5-Track data
 *   Layer 3 (EDL Executor): Execution — applies decisions to overlays
 *
 * The LLM says "zoom at the toddler's smile — this is the emotional anchor."
 * This module finds that frame 82 is where the smile peaks (from 5-Track
 * keyframe analysis), snaps to the nearest motion peak, and outputs:
 *   { type: 'zoom', frame: 82, zoomType: 'punch-in', scaleTo: 1.15 }
 *
 * Uses existing snap functions from edl-executor.ts for precision.
 */

import type { AssetAnalysis, FrameAnalysis } from './five-track-analysis';
import type {
  SceneIntent,
  CreativeIntentPlan,
  ZoomIntent,
  PacingIntent,
  TransitionIntent,
  ShakeIntent,
} from './unified-edit-intelligence';
import { snapToClipBoundary, findClipAtFrame } from './edl-executor';

// ─── Types ───────────────────────────────────────────────────────

/** Scene context needed for frame resolution (subset of UnifiedContext.SceneContext) */
interface SceneFrameContext {
  sceneIndex: number;
  fromFrame: number;
  durationFrames: number;
  voiceoverWords: Array<{ word: string; startMs: number; endMs: number }>;
  motionPeaks?: number[];     // Relative to scene start
  naturalCutPoints?: number[]; // Relative to scene start
  /**
   * Script-extracted on-screen text lines for this scene.
   * Used by the deterministic safety-net at the end of translateCreativeIntentToEDL
   * to guarantee EVERY onScreenText entry emits a graphic decision, even when
   * the LLM's `graphicIntents` array drops some. Without this, EDL output for
   * no-VO scenes could miss user's branded text entirely (the caption fallback
   * was removed in commit dd758500; EDL is now the sole owner of on-screen
   * text rendering — Rule 18N says rule-driven > LLM-probabilistic for
   * mechanical "render this text" work).
   * See pipeline_investigations.md 2026-04-19 EDL onScreenText enforcement.
   */
  onScreenText?: string[];
}

/** A single frame-level edit decision (same type EDL executor consumes) */
export interface TranslatedDecision {
  type: 'cut' | 'transition' | 'zoom' | 'speed-change' | 'graphic' | 'sfx-trigger' | 'camera-shake';
  frame: number;
  durationFrames?: number;
  reason: string;
  params: Record<string, any>;
  confidence: number;
  sources: string[];
}

export interface TranslationResult {
  decisions: TranslatedDecision[];
  warnings: string[];
  stats: {
    scenesTranslated: number;
    decisionsGenerated: number;
    momentsResolved: number;
    momentsFallback: number;
  };
}

// ─── Main Entry Point ────────────────────────────────────────────

/**
 * Translate a CreativeIntentPlan into frame-accurate EDL decisions.
 *
 * @param plan - Creative intent from the LLM (no frame numbers)
 * @param sceneContexts - Per-scene frame/timing data from UnifiedContext
 * @param analyses - Raw 5-Track analyses keyed by assetId
 * @param overlays - Current project overlays (for snap functions)
 * @param fps - Frames per second
 */
export function translateCreativeIntentToEDL(
  plan: CreativeIntentPlan,
  sceneContexts: SceneFrameContext[],
  analyses: Map<string, any>,
  overlays: Array<{ id: number; type: string; from: number; durationInFrames: number; row: number; [k: string]: any }>,
  fps: number = 30,
): TranslationResult {
  const decisions: TranslatedDecision[] = [];
  const warnings: string[] = [];
  let momentsResolved = 0;
  let momentsFallback = 0;

  for (const intent of plan.sceneIntents) {
    const sceneCtx = sceneContexts.find(s => s.sceneIndex === intent.sceneIndex);
    if (!sceneCtx) {
      warnings.push(`Scene ${intent.sceneIndex}: no frame context found, skipping`);
      continue;
    }

    // Resolve the decisive moment to a frame number
    const peakFrame = resolveDecisiveMoment(
      intent.decisiveMoment,
      sceneCtx,
      analyses,
      fps,
    );

    if (peakFrame.method === 'fallback') {
      momentsFallback++;
      warnings.push(`Scene ${intent.sceneIndex}: decisive moment "${intent.decisiveMoment}" resolved via fallback (midpoint)`);
    } else {
      momentsResolved++;
    }

    // ── Transition In ──
    if (intent.transitionIn !== 'hard-cut' && sceneCtx.sceneIndex > 0) {
      const boundary = snapToClipBoundary(sceneCtx.fromFrame, overlays as any, 45);
      if (boundary) {
        decisions.push({
          type: 'transition',
          frame: boundary.boundaryFrame,
          durationFrames: getTransitionDuration(intent.transitionIn, fps),
          reason: `${intent.transitionIn} into scene ${intent.sceneIndex + 1}: ${intent.reasoning}`,
          params: { transitionType: mapTransitionIntent(intent.transitionIn) },
          confidence: 0.8,
          sources: ['creative-intent', 'script'],
        });
      }
    }

    // ── Zoom ──
    if (intent.zoomIntent !== 'none' && intent.zoomIntent !== 'gentle-drift') {
      const zoomFrame = intent.zoomIntent === 'punch-at-peak'
        ? peakFrame.frame
        : sceneCtx.fromFrame; // slow-push/pull start at scene start

      const zoomParams = mapZoomIntent(intent.zoomIntent, sceneCtx.durationFrames);
      decisions.push({
        type: 'zoom',
        frame: zoomFrame,
        durationFrames: zoomParams.duration,
        reason: `${intent.zoomIntent} — ${intent.reasoning}`,
        params: zoomParams.params,
        confidence: peakFrame.method === 'fallback' ? 0.5 : 0.8,
        sources: ['creative-intent', peakFrame.method],
      });
    }

    // ── Camera Shake ──
    if (intent.shakeIntent !== 'none') {
      decisions.push({
        type: 'camera-shake',
        frame: peakFrame.frame,
        durationFrames: intent.shakeIntent === 'impact-hit' ? 8 : 12,
        reason: `${intent.shakeIntent} at decisive moment — ${intent.reasoning}`,
        params: {
          intensity: intent.shakeIntent === 'impact-hit' ? 0.6 : 0.2,
        },
        confidence: 0.7,
        sources: ['creative-intent'],
      });
    }

    // ── Graphics ──
    // Track emitted texts so the safety-net below can detect missed onScreenText.
    const emittedGraphicTexts = new Set<string>();
    for (const graphic of intent.graphicIntents) {
      if (graphic.type === 'none') continue;

      const graphicFrame = resolveGraphicTrigger(
        graphic.triggerMoment,
        sceneCtx,
        peakFrame.frame,
        fps,
      );

      decisions.push({
        type: 'graphic',
        frame: graphicFrame,
        durationFrames: Math.round(2.5 * fps), // 2.5s default
        reason: `${graphic.type}: "${graphic.text || ''}" — ${graphic.triggerMoment}`,
        params: {
          graphicType: graphic.type === 'text-overlay' ? 'keyword-highlight' : graphic.type,
          text: graphic.text || '',
        },
        confidence: 0.75,
        sources: ['creative-intent', 'script'],
      });
      if (graphic.text && graphic.text.trim().length > 0) {
        emittedGraphicTexts.add(graphic.text.trim().toLowerCase());
      }
    }

    // ── Deterministic onScreenText safety net ──
    // 2026-04-19 (Batch 5): after the LLM's graphicIntents are processed,
    // cross-check the scene's onScreenText array. Any entry the LLM failed
    // to emit as a graphic gets a deterministic fallback decision so the
    // user's script text is GUARANTEED to appear on screen.
    //
    // Why this exists: the LLM prompt says "Include ALL onScreenText entries
    // as separate graphics" but Gemini's output is probabilistic (max 3
    // graphicIntents per scene, no minimum). Scenes with 4+ onScreenText
    // entries routinely lost the 4th+ one. And the commit dd758500 (refined
    // Option 1) removed the caption fallback, making EDL the sole renderer
    // of standalone on-screen text — so drops here = text vanishes entirely.
    //
    // Rule 18N: rule-driven > LLM-probabilistic for mechanical render work.
    // Rule 8N: script's author explicitly wrote that text, we MUST show it.
    const onScreenText = sceneCtx.onScreenText || [];
    for (const text of onScreenText) {
      const trimmed = (text || '').trim();
      if (!trimmed) continue;
      if (emittedGraphicTexts.has(trimmed.toLowerCase())) continue; // LLM already covered it

      // Place at 1/3 into the scene (same default as LLM's fallback trigger
      // resolution — gives reading time after the scene establishes).
      const fallbackFrame = sceneCtx.fromFrame + Math.round(sceneCtx.durationFrames * 0.33);
      decisions.push({
        type: 'graphic',
        frame: fallbackFrame,
        durationFrames: Math.round(2.5 * fps),
        reason: `onScreenText safety-net: "${trimmed}" (LLM graphicIntents missed this entry)`,
        params: {
          graphicType: 'keyword-highlight',
          text: trimmed,
        },
        confidence: 0.6,
        sources: ['onScreenText-safety-net', 'script'],
      });
      emittedGraphicTexts.add(trimmed.toLowerCase());
      warnings.push(
        `Scene ${intent.sceneIndex}: onScreenText "${trimmed.substring(0, 40)}${trimmed.length > 40 ? '...' : ''}" ` +
        `was not in LLM graphicIntents — injected deterministic fallback graphic`
      );
    }

    // ── SFX ──
    if (intent.audioIntent.sfxOnEntry) {
      decisions.push({
        type: 'sfx-trigger',
        frame: sceneCtx.fromFrame,
        reason: `Entry SFX: ${intent.audioIntent.sfxOnEntry}`,
        params: { sfxType: intent.audioIntent.sfxOnEntry },
        confidence: 0.6,
        sources: ['creative-intent'],
      });
    }
    if (intent.audioIntent.sfxAtPeak) {
      decisions.push({
        type: 'sfx-trigger',
        frame: peakFrame.frame,
        reason: `Peak SFX: ${intent.audioIntent.sfxAtPeak}`,
        params: { sfxType: intent.audioIntent.sfxAtPeak },
        confidence: 0.6,
        sources: ['creative-intent'],
      });
    }

    // ── Transition Out (only if last scene — others handled by next scene's transitionIn) ──
    const isLastScene = intent.sceneIndex === plan.sceneIntents.length - 1;
    if (isLastScene && intent.transitionOut === 'dip-to-black') {
      const sceneEnd = sceneCtx.fromFrame + sceneCtx.durationFrames;
      decisions.push({
        type: 'transition',
        frame: sceneEnd - Math.round(0.5 * fps),
        durationFrames: Math.round(0.5 * fps),
        reason: `Closing dip-to-black — ${intent.reasoning}`,
        params: { transitionType: 'dip-to-black' },
        confidence: 0.8,
        sources: ['creative-intent'],
      });
    }
  }

  // Sort by frame
  decisions.sort((a, b) => a.frame - b.frame);

  return {
    decisions,
    warnings,
    stats: {
      scenesTranslated: plan.sceneIntents.length,
      decisionsGenerated: decisions.length,
      momentsResolved,
      momentsFallback,
    },
  };
}

// ─── Decisive Moment Resolution ──────────────────────────────────

interface ResolvedMoment {
  frame: number;
  method: 'vo-word' | 'subject' | 'subject-track' | 'motion-peak' | 'energy' | 'temporal' | 'fallback';
}

/**
 * Resolve a natural-language decisive moment description to an exact frame.
 *
 * Waterfall strategy (first match wins):
 * 1. VO word match — quoted words or keywords found in voiceover timing
 * 2. Motion peak — if description mentions motion/action, use nearest peak
 * 3. Temporal position — "beginning", "middle", "end" mapped to percentages
 * 4. Fallback — scene midpoint
 */
function resolveDecisiveMoment(
  description: string,
  scene: SceneFrameContext,
  analyses: Map<string, any>,
  fps: number,
): ResolvedMoment {
  const desc = description.toLowerCase();

  // ── Strategy 1: VO word match ──
  // Look for quoted words or key phrases in voiceover timing
  const quotedWords = description.match(/"([^"]+)"/g)?.map(w => w.replace(/"/g, '').toLowerCase()) || [];
  const allSearchTerms = [
    ...quotedWords,
    ...description.split(/\s+/).filter(w => w.length > 5).map(w => w.toLowerCase()),
  ];

  for (const term of allSearchTerms) {
    const match = scene.voiceoverWords.find(w =>
      w.word.toLowerCase().includes(term) || term.includes(w.word.toLowerCase())
    );
    if (match) {
      const frame = scene.fromFrame + Math.round((match.startMs / 1000) * fps);
      return { frame, method: 'vo-word' };
    }
  }

  // ── Strategy 2: Motion peak ──
  // If description mentions movement/action words, find the strongest motion peak
  const motionWords = ['movement', 'action', 'motion', 'peak', 'impact', 'burst', 'dramatic', 'climax', 'energy'];
  if (motionWords.some(w => desc.includes(w)) && scene.motionPeaks && scene.motionPeaks.length > 0) {
    // Use the highest motion peak (they're relative to scene start)
    const peakRelative = scene.motionPeaks[0]; // Already sorted by intensity in 5-Track
    return { frame: scene.fromFrame + peakRelative, method: 'motion-peak' };
  }

  // ── Strategy 3: Temporal position ──
  if (desc.includes('beginning') || desc.includes('start') || desc.includes('opening')) {
    return { frame: scene.fromFrame + Math.round(scene.durationFrames * 0.15), method: 'temporal' };
  }
  if (desc.includes('end') || desc.includes('closing') || desc.includes('final') || desc.includes('resolution')) {
    return { frame: scene.fromFrame + Math.round(scene.durationFrames * 0.85), method: 'temporal' };
  }
  if (desc.includes('middle') || desc.includes('center') || desc.includes('midpoint')) {
    return { frame: scene.fromFrame + Math.round(scene.durationFrames * 0.5), method: 'temporal' };
  }

  // ── Strategy 4: Subject tracking match ──
  // 5-Track has per-frame bounding boxes for subjects (person, product, logo,
  // etc.). If the LLM description mentions a subject category or label, find
  // the frame where that subject is most prominent (largest bounding box area).
  // This catches "zoom when the product appears" or "the child reaches for
  // the Happy Meal" — descriptions that reference visual subjects.
  const subjectWords: Record<string, string[]> = {
    person: ['person', 'child', 'kid', 'man', 'woman', 'grandparent', 'teenager', 'family', 'couple', 'friend', 'parent', 'boy', 'girl', 'people', 'hand'],
    product: ['product', 'item', 'package', 'box', 'bag', 'container', 'meal', 'fry', 'fries', 'burger', 'drink', 'cup', 'food', 'sandwich'],
    logo: ['logo', 'arches', 'brand', 'sign', 'symbol', 'icon'],
    animal: ['animal', 'dog', 'cat', 'pet'],
  };
  for (const [category, words] of Object.entries(subjectWords)) {
    if (words.some(w => desc.includes(w))) {
      for (const [, analysis] of analyses) {
        const tracks = (analysis as AssetAnalysis).subjectTracks || [];
        const matching = tracks.filter(t =>
          t.category === category || words.some(w => t.label.toLowerCase().includes(w))
        );
        if (matching.length > 0 && matching[0].frames && matching[0].frames.length > 0) {
          // Pick frame with largest bounding box (most prominent appearance)
          const bestFrame = matching[0].frames
            .filter(f => f.frame >= 0 && f.frame <= scene.durationFrames)
            .sort((a, b) => (b.box.w * b.box.h) - (a.box.w * a.box.h))[0];
          if (bestFrame) {
            return { frame: scene.fromFrame + bestFrame.frame, method: 'subject-track' };
          }
        }
      }
    }
  }

  // ── Strategy 5: Smile/expression keywords → check keyframe analysis ──
  const expressionWords = ['smile', 'laugh', 'cry', 'expression', 'emotion', 'reaction', 'surprise'];
  if (expressionWords.some(w => desc.includes(w))) {
    // Find keyframe with highest energy level (proxy for expression peak)
    for (const [, analysis] of analyses) {
      const kfs = (analysis as AssetAnalysis).keyframeAnalyses || [];
      const inRange = kfs.filter((kf: FrameAnalysis) =>
        kf.frame >= 0 && kf.frame <= scene.durationFrames
      );
      if (inRange.length > 0) {
        const best = inRange.sort((a: FrameAnalysis, b: FrameAnalysis) =>
          b.energyLevel - a.energyLevel
        )[0];
        return { frame: scene.fromFrame + best.frame, method: 'energy' };
      }
    }
  }

  // ── Fallback: scene midpoint ──
  return {
    frame: scene.fromFrame + Math.round(scene.durationFrames * 0.5),
    method: 'fallback',
  };
}

// ─── Intent Mapping Tables ───────────────────────────────────────

function mapZoomIntent(
  intent: ZoomIntent,
  sceneDurationFrames: number,
): { params: Record<string, any>; duration: number } {
  switch (intent) {
    case 'slow-push':
      return {
        params: { zoomType: 'slow-push', scaleFrom: 1.0, scaleTo: 1.08 },
        duration: sceneDurationFrames,
      };
    case 'slow-pull':
      return {
        params: { zoomType: 'pull-back', scaleFrom: 1.08, scaleTo: 1.0 },
        duration: sceneDurationFrames,
      };
    case 'punch-at-peak':
      return {
        params: { zoomType: 'punch-in', scaleFrom: 1.0, scaleTo: 1.15 },
        duration: 12, // ~0.4s punch
      };
    case 'push-to-subject':
      return {
        params: { zoomType: 'slow-push', scaleFrom: 1.0, scaleTo: 1.12 },
        duration: Math.round(sceneDurationFrames * 0.6),
      };
    case 'pull-from-detail':
      return {
        params: { zoomType: 'pull-back', scaleFrom: 1.15, scaleTo: 1.0 },
        duration: Math.round(sceneDurationFrames * 0.7),
      };
    default: // 'none', 'gentle-drift' handled by post-processing
      return { params: {}, duration: 0 };
  }
}

function mapTransitionIntent(intent: TransitionIntent): string {
  // Map creative intent names to EDL executor transition type names
  const map: Record<string, string> = {
    'hard-cut': 'hard-cut',
    'dissolve': 'dissolve',
    'dip-to-black': 'dip-to-black',
    'dip-to-white': 'dip-to-white',
    'soft-cut': 'soft-cut',
    'zoom-punch': 'zoom-punch',
    'flash': 'flash',
    'blur': 'blur-transition',
    'wipe': 'wipe-left',
    'film-burn': 'film-burn',
    'glitch': 'glitch',
    'match-cut': 'hard-cut', // Match-cut is conceptual — executor does hard-cut
  };
  return map[intent] || 'hard-cut';
}

function getTransitionDuration(intent: TransitionIntent, fps: number): number {
  const durationMap: Record<string, number> = {
    'hard-cut': 0,
    'dissolve': 0.5,
    'dip-to-black': 0.5,
    'dip-to-white': 0.5,
    'soft-cut': 0.4,
    'zoom-punch': 0.3,
    'flash': 0.2,
    'blur': 0.4,
    'wipe': 0.4,
    'film-burn': 0.6,
    'glitch': 0.3,
    'match-cut': 0,
  };
  return Math.round((durationMap[intent] || 0.4) * fps);
}

function resolveGraphicTrigger(
  triggerMoment: string,
  scene: SceneFrameContext,
  peakFrame: number,
  fps: number,
): number {
  const trigger = triggerMoment.toLowerCase();

  // "at scene start" / "on entry"
  if (trigger.includes('start') || trigger.includes('entry') || trigger.includes('beginning')) {
    return scene.fromFrame + Math.round(0.5 * fps); // 0.5s after scene start
  }

  // "at emotional peak" / "at decisive moment"
  if (trigger.includes('peak') || trigger.includes('decisive') || trigger.includes('climax')) {
    return peakFrame;
  }

  // "at scene end" / "closing"
  if (trigger.includes('end') || trigger.includes('closing') || trigger.includes('final')) {
    return scene.fromFrame + scene.durationFrames - Math.round(1.5 * fps);
  }

  // "when narrator says X" — find the word in voiceover timing
  const saysMatch = trigger.match(/(?:when|as).*(?:says?|mentions?|speaks?)\s+['""]?(\w+)/);
  if (saysMatch) {
    const targetWord = saysMatch[1].toLowerCase();
    const match = scene.voiceoverWords.find(w =>
      w.word.toLowerCase().includes(targetWord)
    );
    if (match) {
      return scene.fromFrame + Math.round((match.startMs / 1000) * fps);
    }
  }

  // Default: 1/3 into the scene (early-ish, gives time to read)
  return scene.fromFrame + Math.round(scene.durationFrames * 0.33);
}
