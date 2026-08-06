/**
 * Phase 9 (brief §18.2/§18.7/§13.4): the EVAL DATASET — labeled-render model + readiness gate.
 *
 * A calibration artifact can ONLY come from REAL human labels (accept/watchlist/reject + dims + revision owner +
 * reason codes) over real renders + the judge verdicts for those renders. This module is the data model + the
 * hard gate: `isCalibrationReady` requires ≥ MIN_CALIBRATION_LABELS labeled items, or nothing gets calibrated
 * (§13.4 — never ship thresholds from vibes).
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const humanAcceptSchema = z.enum(['accept', 'watchlist', 'reject']);

export const evalItemSchema = z.object({
  id: z.string().min(1),
  /** Corpus provenance — where the render came from (render/asset ref). Never fabricated. */
  source: z.string().min(1),
  renderRef: z.string().optional(),
  transcript: z.string().optional(),
  subjectBox: z.object({ x: z.number(), y: z.number(), width: z.number().optional(), height: z.number().optional() }).optional(),
  tasteContractHash: z.string().optional(),
  /** The raw judge verdict for THIS render (what parseJudgeResponse ran on). */
  judge: z.object({
    faithful: z.boolean(),
    score: z.number(),
    issues: z.array(z.string()),
    hierarchy: z.number().optional(),
    typography: z.number().optional(),
    color: z.number().optional(),
    composition: z.number().optional(),
    motion: z.number().optional(),
    form: z.number().optional(),
    hardFailures: z.record(z.string(), z.boolean()).default({}),
  }),
  /** Fix-2 geometry the judge saw (optional). */
  geometry: z.object({
    coveredPct: z.number().optional(),
    coverageByPhase: z.array(z.number()).optional(),
    hardVeto: z.boolean().optional(),
    hardVetoEligible: z.boolean().optional(),
  }).optional(),
  /** HUMAN ground-truth label — the thing calibration is built from. */
  human: z.object({
    accept: humanAcceptSchema,
    dims: z.record(z.string(), z.number()).optional(),
    revisionOwner: z.enum(['designer', 'coder', 'placement', 'system', 'none']).optional(),
    reasonCodes: z.array(z.string()).optional(),
    notes: z.string().optional(),
  }).optional(),
  deliveryOutcome: z.string().optional(),
}).strict();
export type EvalItem = z.infer<typeof evalItemSchema>;

export function datasetHashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function parseLabeledDataset(text: string): { items: EvalItem[]; datasetHash: string } {
  const items = text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => evalItemSchema.parse(JSON.parse(line)));
  return { items, datasetHash: datasetHashOf(text) };
}

/** Minimum labeled items before ANY threshold may be derived (brief §13.4 — conservative floor). */
export const MIN_CALIBRATION_LABELS = 20;

export function isCalibrationReady(items: EvalItem[]): { ok: boolean; labeled: number; reason?: string } {
  const labeled = items.filter((i) => i.human).length;
  if (labeled < MIN_CALIBRATION_LABELS) {
    return {
      ok: false,
      labeled,
      reason: `only ${labeled}/${MIN_CALIBRATION_LABELS} items have human labels — calibration needs a real labeled set (brief §18.2/§19.3); NO artifact produced`,
    };
  }
  return { ok: true, labeled };
}
