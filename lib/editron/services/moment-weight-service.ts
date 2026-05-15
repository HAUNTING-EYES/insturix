/**
 * Moment Weight Service — TRIBE-Compatible Multi-Source Weighting (FLAG 6)
 *
 * Moment weights determine HOW MUCH each editing technique is amplified or suppressed
 * at each point in the video. Weight 0.9 = important moment, amplify everything.
 * Weight 0.3 = transitional moment, keep it subtle.
 *
 * Multi-source structure ready for future HUMAN stack integration:
 *   Phase 0 (now):   gemini only (or flat 0.5 if Gemini skipped)
 *   Phase 1 (weeks): + thompson_adjustment (learned per-brand corrections)
 *   Phase 2 (months): + vjepa (visual significance) + wav2vec (vocal emotion)
 *   Phase 3 (data):  + eml_override (discovered mathematical laws)
 *
 * Consumers: signal-executor.ts (reads final_weight per frame to modulate technique intensity)
 */

import type { GeminiCreativeIntentOutput } from './genre-parameter-computer';
import type { RawFootageAnalysis } from './signal-registry';
import type { BanditState, BanditContext } from './genre-parameter-bandit';
import { computeMomentAdjustments } from './genre-parameter-bandit';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MomentWeightSources {
  gemini: number | null;            // transcript-based assessment (available now)
  vjepa: number | null;             // visual significance (Phase 2)
  wav2vec: number | null;           // vocal emotion intensity (Phase 2)
  thompson_adjustment: number;      // learned correction (Phase 1, default 0)
  eml_override: number | null;      // formula-derived (Phase 3)
}

export interface MomentWeight {
  segment_start_ms: number;
  segment_end_ms: number;
  final_weight: number;             // the computed weight the executor uses (0-1)
  sources: MomentWeightSources;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface MomentWeightMap {
  weights: MomentWeight[];
  default_weight: number;           // used for frames not covered by any segment
  computation_phase: 0 | 1 | 2 | 3;
}

// ─── Weight Computation ─────────────────────────────────────────────────────

/**
 * Build moment weight map from Gemini output (Phase 0 — current).
 * If Gemini output is null (call failed/skipped), returns flat weights.
 */
export function buildMomentWeightMap(
  geminiOutput: GeminiCreativeIntentOutput | null,
  rawFootage: RawFootageAnalysis | null,
  thompsonAdjustments?: Map<string, number>  // segment_id → adjustment from Graphiti
): MomentWeightMap {
  // No Gemini output — flat weights
  if (!geminiOutput?.moment_weights?.length) {
    return buildFlatWeightMap(rawFootage);
  }

  const weights: MomentWeight[] = geminiOutput.moment_weights.map(gw => {
    const segmentId = `${gw.segment_start_ms}-${gw.segment_end_ms}`;
    const thompsonAdj = thompsonAdjustments?.get(segmentId) ?? 0;

    const sources: MomentWeightSources = {
      gemini: gw.weight,
      vjepa: null,              // Phase 2
      wav2vec: null,            // Phase 2
      thompson_adjustment: thompsonAdj,
      eml_override: null,       // Phase 3
    };

    // Phase 0 computation: final = gemini + thompson
    const final_weight = clamp(gw.weight + thompsonAdj, 0, 1);

    // Confidence based on source availability
    const confidence: MomentWeight['confidence'] =
      Math.abs(thompsonAdj) > 0.1 ? 'high' : 'medium';

    return {
      segment_start_ms: gw.segment_start_ms,
      segment_end_ms: gw.segment_end_ms,
      final_weight,
      sources,
      reason: gw.reason,
      confidence,
    };
  });

  return {
    weights,
    default_weight: 0.55,
    computation_phase: thompsonAdjustments ? 1 : 0,
  };
}

/**
 * Build flat weight map from transcript segments (no Gemini needed).
 * Uses simple heuristics: opening/closing get higher weight, middle is neutral.
 */
function buildFlatWeightMap(rawFootage: RawFootageAnalysis | null): MomentWeightMap {
  if (!rawFootage?.segments?.length) {
    return { weights: [], default_weight: 0.55, computation_phase: 0 };
  }

  const totalDuration = rawFootage.originalDurationMs ?? rawFootage.estimatedCleanDurationMs ?? 30000;
  const weights: MomentWeight[] = rawFootage.segments.map(seg => {
    const position = seg.startMs / totalDuration;

    // Simple position-based weighting (no LLM needed):
    // Hook zone (0-5%): weight 0.8 (strong opening)
    // Closing zone (85-100%): weight 0.75 (strong close)
    // Middle: weight 0.55 (above threshold so budget system is the gatekeeper)
    // OLD: default was 0.5, exactly at the confidence gate. With strict > 0.5,
    //   ~60% of decisions were silently killed. With inclusive >= 0.5, 0.55
    //   provides margin so the budget system (not the gate) controls density.
    // ⚠️ INVENTED — 0.55 is an engineering heuristic, needs validation.
    let weight = 0.55;
    if (position < 0.05) weight = 0.8;
    else if (position > 0.85) weight = 0.75;
    else if (position > 0.4 && position < 0.6) weight = 0.6; // slight mid-boost

    return {
      segment_start_ms: seg.startMs,
      segment_end_ms: seg.endMs,
      final_weight: weight,
      sources: {
        gemini: null,
        vjepa: null,
        wav2vec: null,
        thompson_adjustment: 0,
        eml_override: null,
      },
      reason: position < 0.05 ? 'hook zone' : position > 0.85 ? 'closing zone' : 'neutral',
      confidence: 'low',
    };
  });

  return { weights, default_weight: 0.55, computation_phase: 0 };
}

// ─── Weight Lookup ──────────────────────────────────────────────────────────

/**
 * Get the moment weight for a specific timestamp.
 * Resolution rules (from v3 doc §0.3):
 *   1. If a moment-level weight exists for this timestamp, use it
 *   2. Otherwise, use the default weight (0.5)
 */
export function getWeightAtTimestamp(map: MomentWeightMap, timestampMs: number): number {
  // Find the segment containing this timestamp
  const segment = map.weights.find(
    w => timestampMs >= w.segment_start_ms && timestampMs <= w.segment_end_ms
  );
  return segment?.final_weight ?? map.default_weight;
}

/**
 * Get the full MomentWeight object for a timestamp (includes sources + confidence).
 */
export function getMomentWeightAt(map: MomentWeightMap, timestampMs: number): MomentWeight | null {
  return map.weights.find(
    w => timestampMs >= w.segment_start_ms && timestampMs <= w.segment_end_ms
  ) ?? null;
}

// ─── Future Phase Integration Points ────────────────────────────────────────

/**
 * Phase 1: Apply Thompson Sampling adjustments from Graphiti.
 * Called when user history is available for this brand.
 */
export function applyThompsonAdjustments(
  map: MomentWeightMap,
  adjustments: Map<string, number>
): MomentWeightMap {
  const updated = map.weights.map(w => {
    const segId = `${w.segment_start_ms}-${w.segment_end_ms}`;
    const adj = adjustments.get(segId) ?? 0;
    if (adj === 0) return w;

    return {
      ...w,
      final_weight: clamp(w.final_weight + adj, 0, 1),
      sources: { ...w.sources, thompson_adjustment: adj },
      confidence: 'high' as const,
    };
  });

  return { ...map, weights: updated, computation_phase: 1 };
}

/**
 * Phase 2: Integrate V-JEPA visual significance scores.
 * Called when V-JEPA features are available (fal.ai deployment).
 */
export function integrateVjepaScores(
  map: MomentWeightMap,
  vjepaScores: Array<{ startMs: number; endMs: number; significance: number }>
): MomentWeightMap {
  const updated = map.weights.map(w => {
    const vjepa = vjepaScores.find(
      v => v.startMs <= w.segment_start_ms && v.endMs >= w.segment_end_ms
    );
    if (!vjepa) return w;

    // Phase 2: 50% gemini + 30% vjepa + 20% wav2vec + thompson
    const geminiContrib = (w.sources.gemini ?? 0.5) * 0.5;
    const vjepaContrib = vjepa.significance * 0.3;
    const wav2vecContrib = (w.sources.wav2vec ?? 0.5) * 0.2;
    const final = clamp(geminiContrib + vjepaContrib + wav2vecContrib + w.sources.thompson_adjustment, 0, 1);

    return {
      ...w,
      final_weight: final,
      sources: { ...w.sources, vjepa: vjepa.significance },
      confidence: 'high' as const,
    };
  });

  return { ...map, weights: updated, computation_phase: 2 };
}

/**
 * Phase 2: Integrate Wav2Vec vocal emotion scores.
 * Called when Wav2Vec features are available (fal.ai deployment).
 *
 * Order-independent with integrateVjepaScores — either can be called first.
 * When both sources are populated, full Phase 2 recomputation uses all three:
 *   50% gemini + 30% vjepa + 20% wav2vec + thompson_adjustment
 */
export function integrateWav2vecScores(
  map: MomentWeightMap,
  wav2vecScores: Array<{ startMs: number; endMs: number; emotionIntensity: number }>
): MomentWeightMap {
  const updated = map.weights.map(w => {
    const wav2vec = wav2vecScores.find(
      v => v.startMs <= w.segment_start_ms && v.endMs >= w.segment_end_ms
    );
    if (!wav2vec) return w;

    const updatedSources = { ...w.sources, wav2vec: wav2vec.emotionIntensity };

    // If vjepa is also populated, do full Phase 2 recomputation
    // Otherwise store wav2vec value — full recompute happens when vjepa arrives
    let finalWeight = w.final_weight;
    if (updatedSources.vjepa !== null) {
      const geminiContrib = (updatedSources.gemini ?? 0.5) * 0.5;
      const vjepaContrib = updatedSources.vjepa * 0.3;
      const wav2vecContrib = wav2vec.emotionIntensity * 0.2;
      finalWeight = clamp(
        geminiContrib + vjepaContrib + wav2vecContrib + updatedSources.thompson_adjustment,
        0, 1,
      );
    }

    return {
      ...w,
      final_weight: finalWeight,
      sources: updatedSources,
      confidence: 'high' as const,
    };
  });

  return { ...map, weights: updated, computation_phase: 2 };
}

/**
 * Phase 3: Apply EML formula override.
 * Called when EML has discovered a mathematical law for this signal combination.
 */
export function applyEmlOverride(
  map: MomentWeightMap,
  overrides: Array<{ startMs: number; endMs: number; weight: number }>
): MomentWeightMap {
  const updated = map.weights.map(w => {
    const override = overrides.find(
      o => o.startMs <= w.segment_start_ms && o.endMs >= w.segment_end_ms
    );
    if (!override) return w;

    // EML override supersedes all other sources
    return {
      ...w,
      final_weight: override.weight,
      sources: { ...w.sources, eml_override: override.weight },
      confidence: 'high' as const,
    };
  });

  return { ...map, weights: updated, computation_phase: 3 };
}

// ─── Bandit Bridge (TRIBE §1C — signal-driven) ────────────────────────────

/**
 * Phase 1: Apply Thompson Sampling adjustments from genre-parameter-bandit.
 *
 * Bridges genre-parameter-bandit.ts → moment-weight-service.ts:
 *   1. Calls computeMomentAdjustments (bandit) to get per-segment adjustments
 *   2. Applies them via applyThompsonAdjustments (this service)
 *
 * Returns the original map unchanged when bandit has insufficient data.
 */
export function applyBanditAdjustments(
  map: MomentWeightMap,
  banditState: BanditState | null,
  context: BanditContext | null,
): MomentWeightMap {
  if (!banditState || !context) return map;
  if (map.weights.length === 0) return map;

  const totalDuration = Math.max(...map.weights.map(w => w.segment_end_ms), 1);

  const segmentPositions = map.weights.map(w => ({
    id: `${w.segment_start_ms}-${w.segment_end_ms}`,
    normalizedPosition: w.segment_start_ms / totalDuration,
  }));

  const adjustments = computeMomentAdjustments(banditState, context, segmentPositions);
  if (adjustments.size === 0) return map;

  return applyThompsonAdjustments(map, adjustments);
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
