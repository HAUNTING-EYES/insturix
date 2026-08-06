/**
 * Phase 7 (brief §14.1): PLAN-LEVEL PAIRWISE SELECTION — A/B, never force a preference.
 *
 * Deterministic comparator over the SAME taste contract + SAME semantic job (per §14.1). The selector must not
 * choose on content type or its own unrelated taste; a tie is honest (`tie`), never a forced winner. Only the
 * winner goes to codegen (the wiring that runs the designer's candidate pairs is the flagged follow-on).
 */
import type { MgMomentDesignPlan } from '../design/design-plan';
import type { VideoTasteContract } from './taste-schemas';

export interface PairwisePlanDecision {
  winner: 'A' | 'B' | 'tie';
  reasons: string[];
  contractAlignment: { A: number; B: number };
  semanticAlignment: { A: number; B: number };
  confidence: 'high' | 'medium' | 'low';
}

export function pairPlanSelectionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.MG_PAIRWISE_PLAN_SELECTION_ENABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Semantic alignment: does the plan's CONCEPT actually encode the licensed payload + viewer response? */
function planSemanticScore(plan: MgMomentDesignPlan, payload?: string): number {
  let s = 0;
  if (payload?.trim()) {
    const tokens = payload.toLowerCase().split(/\W+/).filter(Boolean);
    const concept = (plan.concept ?? '').toLowerCase();
    s += (tokens.filter((t) => concept.includes(t)).length / Math.max(1, tokens.length)) * 3;
  }
  if (plan.semanticPayload?.trim()) s += 1;
  if (plan.visualMetaphor?.trim()) s += 1;
  if (plan.intendedViewerResponse?.trim()) s += 0.5;
  s -= (plan.intentionalDeviations?.length ?? 0) * 0.5;
  return Math.max(0, s);
}

/** Contract alignment: provenance + no prohibited motifs + designed structure (≥2 marks) + justified panel. */
function planContractScore(plan: MgMomentDesignPlan, contract?: VideoTasteContract | null): number {
  if (!contract) return 3; // no contract → neutral baseline (legacy callers)
  let s = 0;
  if (plan.tasteContractHash && plan.tasteContractHash === contract.contractHash) s += 2;
  const text = `${plan.concept ?? ''} ${plan.visualMetaphor ?? ''}`.toLowerCase();
  for (const motif of contract.prohibitedMotifs) {
    if (text.includes(motif.toLowerCase())) s -= 1;
  }
  if ((plan.elements?.length ?? 0) >= 2) s += 1;
  if (plan.look === 'panel' && !plan.panelReason) s -= 0.5;
  return Math.max(0, s);
}

export function comparePlans(
  a: MgMomentDesignPlan,
  b: MgMomentDesignPlan,
  ctx: { contract?: VideoTasteContract | null; semanticPayload?: string } = {},
): PairwisePlanDecision {
  const contractAlignment = { A: planContractScore(a, ctx.contract), B: planContractScore(b, ctx.contract) };
  const semanticAlignment = { A: planSemanticScore(a, ctx.semanticPayload), B: planSemanticScore(b, ctx.semanticPayload) };
  const scoreA = contractAlignment.A + semanticAlignment.A;
  const scoreB = contractAlignment.B + semanticAlignment.B;
  const margin = 0.05;
  if (Math.abs(scoreA - scoreB) <= margin) {
    return {
      winner: 'tie',
      reasons: ['scores within margin — a tie is honest; never force a preference (brief §14.1)'],
      contractAlignment,
      semanticAlignment,
      confidence: 'low',
    };
  }
  const winner = scoreA > scoreB ? 'A' : 'B';
  return {
    winner,
    reasons: [`plan ${winner} scores higher (${Math.max(scoreA, scoreB).toFixed(2)} vs ${Math.min(scoreA, scoreB).toFixed(2)}) on semantic + contract alignment`],
    contractAlignment,
    semanticAlignment,
    confidence: Math.abs(scoreA - scoreB) > 1 ? 'high' : 'medium',
  };
}
