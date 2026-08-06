/**
 * Phase 5 (brief §6.7/§12): JudgeResultV2 + REVISION ROUTING.
 *
 * The judge's raw outcome is {score, issues} + (via FACT) subjectOverlap/tasteContract. This module:
 *  1. `deriveRevisionRouting` — decides WHO should fix a rejected render (designer | coder | placement | system |
 *     none) from the judge's issues, so a wrong-concept goes back to the DESIGNER and a typography slip to the
 *     CODER instead of every failure being treated as a coder problem (§12 table).
 *  2. `buildJudgeResultV2` — the structured V2 verdict (schemaVersion, routing, fidelity deviations, per-issue
 *     categorization, legacyOverallScore) for telemetry/persistence.
 *
 * Heuristics are DETERMINISTIC and documented (Rule 35/R18N): priority designer > placement > coder > none.
 * The full designer-replan loop (a new plan version) is the flagged follow-on; this phase ships routing + the
 * owner-targeted revision instruction + telemetry.
 */
import { z } from 'zod';

export const revisionOwnerSchema = z.enum(['designer', 'coder', 'placement', 'system', 'none']);
export type RevisionOwner = z.infer<typeof revisionOwnerSchema>;

export const judgeResultV2Schema = z.object({
  schemaVersion: z.literal('judge-result-v2'),
  revisionOwner: revisionOwnerSchema,
  revisionOwnerReason: z.string(),
  revisionInstruction: z.string(),
  legacyOverallScore: z.number(),
  contractFidelityDeviations: z.array(z.string()),
  semanticEffectivenessIssues: z.array(z.string()),
  otherIssues: z.array(z.string()),
}).strict();
export type JudgeResultV2 = z.infer<typeof judgeResultV2Schema>;

/** Keyword routes: strong concept/fidelity signals ALWAYS beat execution signals (a wrong idea can't be repainted). */
const DESIGNER_SIGNALS = [
  /concept|visual metaphor|metaphor/i,
  /does not (encode|represent|capture|express)/i,
  /semantic|meaning|the licensed (fact|claim|idea)|fidelity|contract direction|art direction/i,
  /wrong (idea|claim|fact)|not the (point|message)|misrepresents/i,
  /emotional (beat|target|moment)/i,
];
const PLACEMENT_SIGNALS = [
  /place|placement|position|region/i,
  /negative space|frame's room|clear of the (subject|face)|safe area/i,
  /subject|caption.*(collision|overlap|obstr)|collision|overlap|obstruct/i,
];
const CODER_SIGNALS = [
  /typograph|hierarchy|spacing|weight|tracking|case/i,
  /clip|overflow|truncat|edge/i,
  /contrast|readab|legib/i,
  /color|palette|accent/i,
  /motion|ease|stagger|timeline|frozen|static|float/i,
  /form|designed|minimal-viable|bare|slide/i,
];

export function deriveRevisionRouting(
  issues: string[],
  ctx: { hasContract?: boolean } = {},
): { owner: RevisionOwner; reason: string; instruction: string } {
  const joined = issues.join(' ');
  for (const pattern of DESIGNER_SIGNALS) {
    if (pattern.test(joined)) {
      return {
        owner: 'designer',
        reason: `concept/contract signal: ${pattern.source}`,
        instruction: 'The flagged problem is the CONCEPT or the chosen style direction, not raw execution. You are the coder — you must NOT invent a new concept. Re-encode the SAME licensed fact through stronger meaning-bearing form; if the concept itself is wrong it routes to the designer on the next design pass. Preserve the fact; never fabricate new facts.',
      };
    }
  }
  for (const pattern of PLACEMENT_SIGNALS) {
    if (pattern.test(joined)) {
      return {
        owner: 'placement',
        reason: `placement/geometry signal: ${pattern.source}`,
        instruction: 'Placement problem: move the graphic into the frame\'s room — clear of the subject, negative space, and any collision — while preserving the design and the animation timeline.',
      };
    }
  }
  for (const pattern of CODER_SIGNALS) {
    if (pattern.test(joined)) {
      return {
        owner: 'coder',
        reason: `craft/execution signal: ${pattern.source}`,
        instruction: 'Execution problem: revise SURGICALLY, targeting ONLY the named craft axis; keep everything else byte-identical. PRESERVE the animation timeline unless an issue names it.',
      };
    }
  }
  return {
    owner: 'none',
    reason: 'no actionable issue named',
    instruction: 'Revise SURGICALLY: change ONLY what the issues name; PRESERVE the animation timeline unless an issue names it.',
  };
}

/** Categorize judge issues into contract-fidelity vs semantic-effectiveness vs other (for §11 telemetry). */
export function categorizeIssues(
  issues: string[],
  ctx: { hasContract?: boolean } = {},
): { contractFidelityDeviations: string[]; semanticEffectivenessIssues: string[]; otherIssues: string[] } {
  const contractFidelityDeviations: string[] = [];
  const semanticEffectivenessIssues: string[] = [];
  const otherIssues: string[] = [];
  for (const issue of issues) {
    if (ctx.hasContract && /fidelity|direction|contract|anchor|prohibited|deviation/i.test(issue)) {
      contractFidelityDeviations.push(issue);
    } else if (/meaning|semantic|concept|claim|fact|does not (encode|represent|capture|express)|licensed/i.test(issue)) {
      semanticEffectivenessIssues.push(issue);
    } else {
      otherIssues.push(issue);
    }
  }
  return { contractFidelityDeviations, semanticEffectivenessIssues, otherIssues };
}

export function buildJudgeResultV2(
  score: number,
  issues: string[],
  ctx: { hasContract?: boolean } = {},
): JudgeResultV2 {
  const routed = deriveRevisionRouting(issues, ctx);
  const categorized = categorizeIssues(issues, ctx);
  return {
    schemaVersion: 'judge-result-v2',
    revisionOwner: routed.owner,
    revisionOwnerReason: routed.reason,
    revisionInstruction: routed.instruction,
    legacyOverallScore: score,
    ...categorized,
  };
}
