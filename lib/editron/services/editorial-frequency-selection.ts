import type { EditorialFamily } from '@/lib/editron/production-brief/editorial-preferences';

export type EditorialFrequencyFamily = Extract<
  EditorialFamily,
  'captions' | 'motionGraphics' | 'zoom' | 'transitions' | 'sfx'
>;

export interface EditorialFrequencyCandidate {
  candidateKey: string;
  opportunityKey: string;
  family: EditorialFrequencyFamily;
  score: number;
  frame: number;
  requestedFrequency: number;
}

export interface EditorialFrequencySelectionEvidence {
  version: 'editorial-frequency-selection-v1';
  candidateKey: string;
  opportunityKey: string;
  family: EditorialFrequencyFamily;
  familyRank: number;
  opportunityCount: number;
  score: number;
  qualityPercentile: number;
  requestedFrequency: number;
  requiredPercentile: number;
  selected: boolean;
  reason: 'selected-by-editorial-frequency-pressure' | 'below-editorial-frequency-pressure';
  calibrationStatus: 'invented-needs-calibration';
}

export interface EditorialFrequencySelectionGroup {
  family: EditorialFrequencyFamily;
  requestedFrequency: number;
  candidateCount: number;
  opportunityCount: number;
  selectedOpportunityCount: number;
}

export interface EditorialFrequencySelectionReport {
  version: 'editorial-frequency-selection-report-v1';
  groups: EditorialFrequencySelectionGroup[];
  samples: EditorialFrequencySelectionEvidence[];
  sampleLimit: number;
  sampleCount: number;
  samplesTruncated: boolean;
  calibrationStatus: 'invented-needs-calibration';
}

export interface EditorialFrequencySelectionResult {
  selections: EditorialFrequencySelectionEvidence[];
  report: EditorialFrequencySelectionReport;
}

const DEFAULT_SAMPLE_LIMIT = 256;

/**
 * Applies user frequency as selection pressure over independently licensed opportunities.
 * It never changes candidate scores, licenses a candidate, or selects render form.
 */
export function resolveEditorialFrequencySelection(
  candidates: EditorialFrequencyCandidate[],
  sampleLimit = DEFAULT_SAMPLE_LIMIT,
): EditorialFrequencySelectionResult {
  const grouped = new Map<EditorialFrequencyFamily, EditorialFrequencyCandidate[]>();
  for (const candidate of candidates) {
    const familyCandidates = grouped.get(candidate.family);
    if (familyCandidates) familyCandidates.push(candidate);
    else grouped.set(candidate.family, [candidate]);
  }

  const selections: EditorialFrequencySelectionEvidence[] = [];
  const groups: EditorialFrequencySelectionGroup[] = [];

  for (const family of [...grouped.keys()].sort()) {
    const familyCandidates = grouped.get(family) ?? [];
    const requestedFrequency = clamp01(familyCandidates[0]?.requestedFrequency ?? 0);
    if (familyCandidates.some((candidate) => (
      Math.abs(clamp01(candidate.requestedFrequency) - requestedFrequency) > Number.EPSILON
    ))) {
      throw new Error(`Conflicting editorial frequency values for family: ${family}`);
    }
    const opportunities = collapseOpportunities(familyCandidates).sort(compareOpportunities);
    const opportunityCount = opportunities.length;
    const selectionByOpportunity = new Map<string, Omit<EditorialFrequencySelectionEvidence, 'candidateKey'>>();

    opportunities.forEach((opportunity, rankIndex) => {
      const requestedFrequency = clamp01(opportunity.requestedFrequency);
      const qualityPercentile = opportunityCount <= 1
        ? 1
        : 1 - rankIndex / (opportunityCount - 1);
      const requiredPercentile = 1 - requestedFrequency;
      const selected = qualityPercentile >= requiredPercentile;
      selectionByOpportunity.set(opportunity.opportunityKey, {
        version: 'editorial-frequency-selection-v1',
        opportunityKey: opportunity.opportunityKey,
        family,
        familyRank: rankIndex + 1,
        opportunityCount,
        score: roundEvidence(opportunity.score),
        qualityPercentile: roundEvidence(qualityPercentile),
        requestedFrequency: roundEvidence(requestedFrequency),
        requiredPercentile: roundEvidence(requiredPercentile),
        selected,
        reason: selected
          ? 'selected-by-editorial-frequency-pressure'
          : 'below-editorial-frequency-pressure',
        calibrationStatus: 'invented-needs-calibration',
      });
    });

    for (const candidate of familyCandidates) {
      const opportunitySelection = selectionByOpportunity.get(candidate.opportunityKey);
      if (!opportunitySelection) continue;
      selections.push({ ...opportunitySelection, candidateKey: candidate.candidateKey });
    }

    groups.push({
      family,
      requestedFrequency: roundEvidence(requestedFrequency),
      candidateCount: familyCandidates.length,
      opportunityCount,
      selectedOpportunityCount: [...selectionByOpportunity.values()]
        .filter((selection) => selection.selected).length,
    });
  }

  selections.sort((a, b) => (
    a.family.localeCompare(b.family)
    || a.familyRank - b.familyRank
    || a.candidateKey.localeCompare(b.candidateKey)
  ));
  const boundedSampleLimit = Math.max(0, Math.floor(sampleLimit));

  return {
    selections,
    report: {
      version: 'editorial-frequency-selection-report-v1',
      groups,
      samples: selections.slice(0, boundedSampleLimit),
      sampleLimit: boundedSampleLimit,
      sampleCount: Math.min(selections.length, boundedSampleLimit),
      samplesTruncated: selections.length > boundedSampleLimit,
      calibrationStatus: 'invented-needs-calibration',
    },
  };
}

interface EditorialFrequencyOpportunity {
  opportunityKey: string;
  score: number;
  frame: number;
  requestedFrequency: number;
}

function collapseOpportunities(candidates: EditorialFrequencyCandidate[]): EditorialFrequencyOpportunity[] {
  const opportunities = new Map<string, EditorialFrequencyOpportunity>();
  for (const candidate of candidates) {
    const current = opportunities.get(candidate.opportunityKey);
    const next = {
      opportunityKey: candidate.opportunityKey,
      score: clamp01(candidate.score),
      frame: Math.max(0, Math.round(candidate.frame)),
      requestedFrequency: clamp01(candidate.requestedFrequency),
    };
    if (!current || compareOpportunities(next, current) < 0) {
      opportunities.set(candidate.opportunityKey, next);
    }
  }
  return [...opportunities.values()];
}

function compareOpportunities(a: EditorialFrequencyOpportunity, b: EditorialFrequencyOpportunity): number {
  return b.score - a.score
    || a.frame - b.frame
    || a.opportunityKey.localeCompare(b.opportunityKey);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundEvidence(value: number): number {
  return Math.round(value * 1000) / 1000;
}
