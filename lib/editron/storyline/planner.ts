/**
 * planner - the edit-plan capstone: compose the cut AND explain it as editorial DECISIONS, so a
 * user (or the UI) can see what the system did and what's missing, not just get an opaque video.
 * It unifies the composer (select/order/fit) with the feasibility gaps into one plan with a
 * typed action per clip.
 *
 * Actions: retain (kept whole), trim (kept a sub-window), reorder (sequenced by narrative, not
 * capture order), split / repurpose (produced by the interactive cutting + role flows,
 * cutToMoment / role assignment - not auto-derived here), request-coverage (a wanted moment we
 * don't have - the "film this" action, folded in from a feasibility report).
 *
 * Pure: feasibility (async, vision-verified) is computed upstream and passed in; this turns the
 * deterministic storyline + that report into a plan. Never throws.
 */

import { composeStoryline, type ComposeOptions } from './compose';
import type { FeasibilityReport } from './feasibility';
import type { ProductionBrief } from '../production-brief/production-brief';
import type { Scene } from './scene';
import type { Storyline } from './storyline';

export type PlannerAction = 'retain' | 'trim' | 'reorder' | 'split' | 'repurpose' | 'request-coverage';

export interface PlannerDecision {
  action: PlannerAction;
  /** The clip's order index (as a string), 'timeline' for a whole-sequence action, or a request id. */
  ref: string;
  reason: string;
  params?: Record<string, number | string>;
}

export interface EditPlan {
  storyline: Storyline;
  decisions: PlannerDecision[];
  /** Present when a shot list was assessed (its gaps become request-coverage decisions). */
  feasibility?: FeasibilityReport;
  statement: string;
}

/** Did the timeline depart from capture order? Compares the actual clip order to the natural
 *  chronological order (asset createdAt, then source, then in-point). */
function isReordered(storyline: Storyline, byId: Map<string, Scene>): boolean {
  const natural = [...storyline.clips].sort((a, b) => {
    const ca = byId.get(a.sourceRef)?.createdAt ?? 0;
    const cb = byId.get(b.sourceRef)?.createdAt ?? 0;
    return ca - cb || (a.source < b.source ? -1 : a.source > b.source ? 1 : a.in - b.in);
  });
  return storyline.clips.some((c, i) => c.sourceRef !== natural[i]?.sourceRef);
}

/**
 * Derive the editorial decisions a composed storyline represents: per clip, was the source
 * trimmed to a sub-window or retained whole; plus one reorder note if the sequence isn't capture
 * order. Pure.
 */
export function decisionsFromStoryline(storyline: Storyline, scenes: readonly Scene[]): PlannerDecision[] {
  const byId = new Map(scenes.map((s) => [s.id, s] as const));
  const decisions: PlannerDecision[] = [];
  for (const clip of storyline.clips) {
    const src = byId.get(clip.sourceRef);
    const trimmed = src ? clip.in > src.startTime + 1e-6 || clip.out < src.endTime - 1e-6 : false;
    decisions.push(
      trimmed
        ? { action: 'trim', ref: String(clip.order), reason: `kept ${clip.durationSec.toFixed(1)}s of the source`, params: { in: clip.in, out: clip.out } }
        : { action: 'retain', ref: String(clip.order), reason: 'kept whole' },
    );
  }
  if (isReordered(storyline, byId)) {
    decisions.push({ action: 'reorder', ref: 'timeline', reason: 'clips sequenced by narrative, not capture order' });
  }
  return decisions;
}

/** Turn a feasibility report's coverage gaps into request-coverage decisions (the "film this" list). */
function coverageGapDecisions(report: FeasibilityReport): PlannerDecision[] {
  return report.coverageGaps.map((g) => ({
    action: 'request-coverage' as const,
    ref: g.request.id,
    reason: g.verdict === 'missing' ? `no footage for "${g.request.text}" — film it` : `only a partial match for "${g.request.text}"`,
    params: { verdict: g.verdict },
  }));
}

function buildStatement(storyline: Storyline, decisions: PlannerDecision[], feasibility?: FeasibilityReport): string {
  const clips = storyline.clips.length;
  const trims = decisions.filter((d) => d.action === 'trim').length;
  const reordered = decisions.some((d) => d.action === 'reorder');
  const gaps = decisions.filter((d) => d.action === 'request-coverage').length;
  const parts = [`${clips} clip${clips === 1 ? '' : 's'}`];
  if (trims > 0) parts.push(`${trims} trimmed`);
  if (reordered) parts.push('resequenced for story');
  let s = `Cut: ${parts.join(', ')}.`;
  if (feasibility && feasibility.status !== 'ready') s += ` ${gaps} requested moment(s) to film — ${feasibility.statement}`;
  return s;
}

/**
 * Build the edit plan: compose the storyline, explain it as decisions, and fold in any
 * feasibility coverage gaps as request-coverage decisions. Pure; never throws.
 */
export function buildEditPlan(
  scenes: Scene[],
  brief: ProductionBrief,
  opts?: { feasibility?: FeasibilityReport; compose?: ComposeOptions },
): EditPlan {
  const storyline = composeStoryline(scenes, brief, opts?.compose);
  const decisions = decisionsFromStoryline(storyline, scenes);
  if (opts?.feasibility) decisions.push(...coverageGapDecisions(opts.feasibility));
  return { storyline, decisions, feasibility: opts?.feasibility, statement: buildStatement(storyline, decisions, opts?.feasibility) };
}
