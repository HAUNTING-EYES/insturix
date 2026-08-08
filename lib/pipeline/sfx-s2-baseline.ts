/**
 * S2 — frozen pre-tuning baseline metrics.
 *
 * Runs the CURRENT (unfrozen) selector exactly as a production caller would
 * (via the shipped searchAndDownloadSFX selector path, report-only S1 shadow)
 * over every labelled isolated opportunity, capturing a FROZEN pre-tuning
 * snapshot of what the selector does TODAY. Selector weights/thresholds are
 * NOT modified here; this only measures and records.
 *
 * Metrics per the S2 plan (independent of label features):
 *   - recallAt1: label has >=1 acceptable/preferred and the selector chose it.
 *   - absurdRate: label has absurd set and the selector chose an absurd asset.
 *   - silenceRetention: label requires silence AND selector chose silence.
 *   - silenceUnwanted: label forbids silence and selector chose silence.
 *   - decisionTypeCounts / roleCounts / surfaceCounts: coverage inventory.
 *
 * Pure + deterministic: takes the corpus + a selector function, returns the
 * report. The selector function is injected so this never couples to scoring
 * internals; the shipped default uses BUNDLED_SFX_CATALOG + no semantic.
 */

import type { SfxEvaluationCorpusV1 } from './sfx-evaluation-corpus';

export interface S2BaselineMetricRow {
  opportunityId: string;
  decision: 'selected' | 'silence' | 'no-match';
  selectedAssetId: string | null;
  /** 1 if selected asset is in the acceptable/preferred set (recall@1 true). */
  acceptedAt1: 0 | 1;
  /** 1 if selected asset is in the absurd set. */
  absurd: 0 | 1;
  /** 1 if selected asset is explicitly unacceptable. */
  unacceptable: 0 | 1;
  /** 1 if decision=silence and label.silenceRequired. */
  silenceRequiredMet: 0 | 1;
  /** 1 if decision=silence and label.silenceAcceptable===false. */
  unwantedSilence: 0 | 1;
}

export interface S2BaselineReport {
  version: 'editron-sfx-s2-baseline-v1';
  frozenAt: string;
  corpusSize: number;
  labelledCount: number;
  rows: S2BaselineMetricRow[];
  aggregate: {
    recallAt1: number | null;      // null when no labelled acceptable cases
    absurdRate: number | null;     // null when no absurd-labelled cases
    silenceRetention: number | null;   // required-silence cases, fraction met
    unwantedSilenceRate: number | null; // silence-forbidden cases, fraction violated
    decisionCounts: Record<string, number>;
    roleCounts: Record<string, number>;
    surfaceCounts: Record<string, number>;
  };
}

export type S2BaselineSelector = (opportunityId: string, query: string, maxDurationSec: number) => Promise<{
  decision: 'selected' | 'silence' | 'no-match';
  selectedAssetId: string | null;
} | null>;

export async function computeS2Baseline(
  corpus: SfxEvaluationCorpusV1,
  select: S2BaselineSelector,
  now: () => Date = () => new Date(),
): Promise<S2BaselineReport> {
  const rows: S2BaselineMetricRow[] = [];
  const decisionCounts: Record<string, number> = {};
  const roleCounts: Record<string, number> = {};
  const surfaceCounts: Record<string, number> = {};

  for (const item of corpus.isolated) {
    const label = item.label;
    const id = item.context.opportunityId;

    // A default generic query term built from role/surface so the selector can
    // be exercised even before human queries are authored. Speculative but
    // deterministic and documented.
    const query = [item.context.role.value, item.context.surface.value].filter(Boolean).join(' ').trim() || id;
    const maxDurationSec = 3;

    const roleValue = item.context.role.value;
    const surfaceValue = item.context.surface.value;
    if (roleValue) roleCounts[roleValue] = (roleCounts[roleValue] ?? 0) + 1;
    if (surfaceValue) surfaceCounts[surfaceValue] = (surfaceCounts[surfaceValue] ?? 0) + 1;

    const selection = await select(id, query, maxDurationSec);
    const decision = selection?.decision ?? 'no-match';
    const selectedAssetId = selection?.selectedAssetId ?? null;
    decisionCounts[decision] = (decisionCounts[decision] ?? 0) + 1;

    const acceptable = new Set([
      ...(label?.acceptableAssetIds ?? []),
      ...(label?.preferredAssetIds ?? []),
    ]);
    const absurd = new Set(label?.absurdAssetIds ?? []);
    const unacceptable = new Set(label?.unacceptableAssetIds ?? []);

    const selectedInAcceptable = selectedAssetId !== null && acceptable.has(selectedAssetId);
    const selectedAbsurd = selectedAssetId !== null && absurd.has(selectedAssetId);
    const selectedUnacceptable = selectedAssetId !== null && unacceptable.has(selectedAssetId);
    const labelRequiresSilence = label?.silenceRequired === true;
    const labelAcceptsSilence = label?.silenceAcceptable !== false;

    rows.push({
      opportunityId: id,
      decision,
      selectedAssetId,
      acceptedAt1: selectedInAcceptable ? 1 : 0,
      absurd: selectedAbsurd ? 1 : 0,
      unacceptable: selectedUnacceptable ? 1 : 0,
      silenceRequiredMet: labelRequiresSilence && decision === 'silence' ? 1 : 0,
      unwantedSilence: decision === 'silence' && !labelAcceptsSilence ? 1 : 0,
    });
  }

  const acceptedCases = rows.filter((r) => r.acceptedAt1 === 1 || r.absurd === 1 || r.unacceptable === 1 || r.silenceRequiredMet === 1);
  void acceptedCases;
  const labelByOpp = new Map<string, NonNullable<SfxEvaluationCorpusV1['isolated'][number]['label']>>();
  for (const item of corpus.isolated) {
    if (item.label) labelByOpp.set(item.context.opportunityId, item.label);
  }
  const labelledCount = labelByOpp.size;

  const recallAt1 = meanOf(rows, 'acceptedAt1', (r) => {
    const label = labelByOpp.get(r.opportunityId);
    return (label?.acceptableAssetIds?.length ?? 0) + (label?.preferredAssetIds?.length ?? 0);
  });
  const absurdRate = meanOf(rows, 'absurd', (r) => labelByOpp.get(r.opportunityId)?.absurdAssetIds?.length ?? 0);
  const requiredSilenceCases = rows.filter((r) => labelByOpp.get(r.opportunityId)?.silenceRequired).length;
  const silenceRetention = requiredSilenceCases > 0
    ? rows.filter((r) => labelByOpp.get(r.opportunityId)?.silenceRequired && r.silenceRequiredMet === 1).length / requiredSilenceCases
    : null;
  const forbiddenSilenceCases = rows.filter((r) => labelByOpp.get(r.opportunityId)?.silenceAcceptable === false).length;
  const unwantedSilenceRate = forbiddenSilenceCases > 0
    ? rows.filter((r) => labelByOpp.get(r.opportunityId)?.silenceAcceptable === false && r.unwantedSilence === 1).length / forbiddenSilenceCases
    : null;

  return {
    version: 'editron-sfx-s2-baseline-v1',
    frozenAt: now().toISOString(),
    corpusSize: corpus.isolated.length,
    labelledCount,
    rows,
    aggregate: {
      recallAt1,
      absurdRate,
      silenceRetention,
      unwantedSilenceRate,
      decisionCounts,
      roleCounts,
      surfaceCounts,
    },
  };
}

function meanOf(
  rows: S2BaselineMetricRow[],
  field: 'acceptedAt1' | 'absurd' | 'unacceptable',
  hasLabelEvidence: (r: S2BaselineMetricRow) => number | undefined,
): number | null {
  const relevant = rows.filter((r) => hasLabelEvidence(r) && hasLabelEvidence(r)! > 0);
  if (relevant.length === 0) return null;
  return relevant.reduce((sum, r) => sum + r[field], 0) / relevant.length;
}
