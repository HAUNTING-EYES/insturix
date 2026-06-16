/**
 * MG Eval — Composite reward spine.
 *
 * Combines per-layer quality scores into ONE continuous reward ∈ [0,1] that downstream
 * tuning reads. Pure + deterministic (no IO, no randomness). This is the JUDGE organ's
 * spine — see D:\Insturix-Brain\07-Roadmap\MG-Automated-Eval-Calibration-Plan-2026-06-03.md.
 *
 *   render ──► [valid?] ──no──► composite = null, status='invalid'  (E1: excluded from reward,
 *      │                                                             never scored 0 — a broken
 *      │                                                             renderer must not blame the curve)
 *      yes
 *      ▼
 *   layers: legibility(L1) correctness(L2) communication(L3) aesthetic(L4)
 *      │  each → { score∈[0,1] | null, status }
 *      ▼
 *   combineLayers ──► renormalize weights over the layers that actually SCORED (E2),
 *                     mark 'degraded' if any layer is missing/null (never silently 0),
 *                     + a hard legibility floor flag (shippable vs not).
 *
 * The weights + floor below are ⚠️INVENTED starting points — they are CALIBRATION TARGETS,
 * not fixed magic. L4's weight is the human-calibratable one (plan decision D2).
 */

/** A render either produced a usable frame, or it failed in a way that must NOT be scored. */
export type RenderStatus =
  | { ok: true }
  | { ok: false; reason: 'throw' | 'blank' | 'overflow'; detail: string };

export type LayerName = 'legibility' | 'correctness' | 'communication' | 'aesthetic';

/** scored = real number; skipped = layer didn't run (e.g. no ground truth); degraded = ran but
 *  not trustworthy (e.g. L3 VLM below its measured-accuracy bar). skipped/degraded → score null. */
export type LayerStatus = 'scored' | 'skipped' | 'degraded';

export interface LayerResult {
  layer: LayerName;
  /** [0,1] when status==='scored'; null otherwise. */
  score: number | null;
  status: LayerStatus;
  /** L2 only (E3): tuner consumes 'human-label' rows only; 'extraction'/'none' are advisory. */
  groundTruthSource?: 'human-label' | 'extraction' | 'none';
  /** human-readable reason for skipped/degraded, so nothing fails silently (R18N). */
  notes?: string;
}

export interface CompositeResult {
  /** [0,1] reward, or null when the render was invalid or no layer scored (R18N: not 0). */
  composite: number | null;
  status: 'scored' | 'degraded' | 'invalid';
  /** Hard floor: L1 below LEGIBILITY_FLOOR ⇒ not shippable, regardless of composite. */
  failsLegibilityFloor: boolean;
  layers: LayerResult[];
  /** The renormalized weights actually applied (audit trail). */
  weightsUsed: Partial<Record<LayerName, number>>;
  renderStatus: RenderStatus;
}

// ⚠️ INVENTED — calibration targets, not fixed values. Correctness highest because it is the
// deterministic "did it show the right thing" anchor (the one metric grounded in ground truth).
export const DEFAULT_LAYER_WEIGHTS: Record<LayerName, number> = {
  legibility: 0.30,
  correctness: 0.40,
  communication: 0.15,
  aesthetic: 0.15,
};

// ⚠️ INVENTED — below this, L1 says "not legible enough to ship". Calibration target.
export const LEGIBILITY_FLOOR = 0.6;

/**
 * Combine layer results into the composite reward. Pure, total, deterministic.
 * Handles every shadow path: invalid render, all-null layers, partial layers, NaN scores.
 */
export function combineLayers(
  layers: LayerResult[],
  renderStatus: RenderStatus,
  weights: Record<LayerName, number> = DEFAULT_LAYER_WEIGHTS,
): CompositeResult {
  // E1: a render that threw / came back blank / overflowed is INVALID — excluded from the
  // composite and (upstream) from the tuner reward. Scoring it 0 would teach the tuner the
  // curve is bad when the renderer broke.
  if (!renderStatus.ok) {
    return {
      composite: null,
      status: 'invalid',
      failsLegibilityFloor: false,
      layers,
      weightsUsed: {},
      renderStatus,
    };
  }

  const legibility = layers.find((l) => l.layer === 'legibility');
  const failsLegibilityFloor =
    legibility?.status === 'scored' && legibility.score != null && isFinite(legibility.score)
      ? legibility.score < LEGIBILITY_FLOOR
      : false;

  const scored = layers.filter(
    (l): l is LayerResult & { score: number } =>
      l.status === 'scored' && l.score != null && isFinite(l.score),
  );

  // No layer produced a trustworthy score → composite is undefined, not 0 (R18N).
  if (scored.length === 0) {
    return {
      composite: null,
      status: 'invalid',
      failsLegibilityFloor,
      layers,
      weightsUsed: {},
      renderStatus,
    };
  }

  // E2: renormalize the weights over the layers that actually scored so a missing layer
  // (e.g. L3 degraded out) doesn't drag the composite toward 0 — it just doesn't vote.
  const weightSum = scored.reduce((s, l) => s + (weights[l.layer] ?? 0), 0);
  const weightsUsed: Partial<Record<LayerName, number>> = {};
  let composite = 0;
  for (const l of scored) {
    const w = weightSum > 0 ? (weights[l.layer] ?? 0) / weightSum : 1 / scored.length;
    weightsUsed[l.layer] = w;
    composite += w * l.score;
  }

  // 'degraded' = we scored, but not every layer voted (missing or explicitly degraded). Surfaced,
  // never hidden, so a partial composite is always distinguishable from a full one (R2N).
  const degraded =
    scored.length < layers.length || layers.some((l) => l.status === 'degraded');

  return {
    composite,
    status: degraded ? 'degraded' : 'scored',
    failsLegibilityFloor,
    layers,
    weightsUsed,
    renderStatus,
  };
}
