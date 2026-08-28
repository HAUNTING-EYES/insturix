import type { ScriptEditorialPlan } from '../agents/script-editorial-plan';
import {
  hasUnicodeFactualMarker,
  countUnicodeWords,
  normalizeUnicodeText,
  segmentUnicodeSentences,
} from '../text/unicode-text';
import { parseSourceLedger, type SourceLedger } from './source-ledger';

// The writing doctrine defines five to thirty minutes as the long-form band. This is an
// evidence-readiness boundary only: it never limits runtime, acts, scenes, or beats.
const SOURCE_BOUNDED_LONG_FORM_START_SECONDS = 5 * 60;
const MINIMUM_DISTINCT_EVIDENCE_UNITS = 2;
const SOURCE_WORDS_PER_REFERENCE_NARRATION_WORD = 0.25;

export type ScriptEvidenceSufficiencyStatus =
  | 'not_applicable'
  | 'sufficient'
  | 'requires_additional_evidence';

export type ScriptEvidenceSufficiencyAssessment =
  | { status: 'not_applicable' }
  | {
      status: 'sufficient';
      targetDurationSeconds: number;
      availableEvidenceUnits: number;
      availableSourceWords: number;
      requiredEvidenceUnits: number;
      requiredSourceWords: number;
    }
  | {
      status: 'requires_additional_evidence';
      targetDurationSeconds: number;
      availableEvidenceUnits: number;
      availableSourceWords: number;
      requiredEvidenceUnits: number;
      requiredSourceWords: number;
    };

export interface AssessScriptEvidenceSufficiencyInput {
  editorialPlan: ScriptEditorialPlan;
  sourceLedger?: SourceLedger | null;
}

interface EvidenceUnit {
  normalizedText: string;
  wordCount: number;
  hasFactualMarker: boolean;
}

function collectEvidenceUnits(sourceLedger: SourceLedger): EvidenceUnit[] {
  const unique = new Map<string, EvidenceUnit>();

  for (const entry of sourceLedger.entries) {
    for (const segment of segmentUnicodeSentences(entry.summary)) {
      const normalizedText = normalizeUnicodeText(segment);
      if (!normalizedText || unique.has(normalizedText)) continue;
      unique.set(normalizedText, {
        normalizedText,
        wordCount: countUnicodeWords(segment),
        hasFactualMarker: hasUnicodeFactualMarker(segment),
      });
    }
  }

  return [...unique.values()];
}

/**
 * Detect the clear failure mode where a long factual, source-bounded narrative has too little
 * supplied record to remain specific without repeating or inventing claims. This is deliberately
 * a readiness check, not a generated-script word quota.
 */
export function assessScriptEvidenceSufficiency(
  input: AssessScriptEvidenceSufficiencyInput,
): ScriptEvidenceSufficiencyAssessment {
  const { editorialPlan } = input;
  if (
    editorialPlan.evidenceNarrative.mode !== 'source_bounded_inquiry'
    || editorialPlan.runtime.policy !== 'exact'
    || editorialPlan.runtime.targetDurationSeconds < SOURCE_BOUNDED_LONG_FORM_START_SECONDS
    || editorialPlan.narration.wordBudgetPolicy !== 'guided'
    || editorialPlan.narration.mode === 'minimal'
    || editorialPlan.narration.mode === 'none'
    || !input.sourceLedger
  ) {
    return { status: 'not_applicable' };
  }

  const sourceLedger = parseSourceLedger(input.sourceLedger);
  const evidenceUnits = collectEvidenceUnits(sourceLedger);
  if (!evidenceUnits.some((unit) => unit.hasFactualMarker)) {
    return { status: 'not_applicable' };
  }

  const availableEvidenceUnits = evidenceUnits.length;
  const availableSourceWords = evidenceUnits.reduce((total, unit) => total + unit.wordCount, 0);
  const requiredSourceWords = Math.ceil(
    editorialPlan.narration.fullRuntimeReferenceSpokenWords
      * SOURCE_WORDS_PER_REFERENCE_NARRATION_WORD,
  );
  const assessment = {
    targetDurationSeconds: editorialPlan.runtime.targetDurationSeconds,
    availableEvidenceUnits,
    availableSourceWords,
    requiredEvidenceUnits: MINIMUM_DISTINCT_EVIDENCE_UNITS,
    requiredSourceWords,
  };

  return availableEvidenceUnits < MINIMUM_DISTINCT_EVIDENCE_UNITS
    || availableSourceWords < requiredSourceWords
    ? { status: 'requires_additional_evidence', ...assessment }
    : { status: 'sufficient', ...assessment };
}

export class ScriptEvidenceSufficiencyError extends Error {
  readonly code = 'SCRIPT_REQUIRES_ADDITIONAL_EVIDENCE';

  constructor(readonly assessment: Extract<
    ScriptEvidenceSufficiencyAssessment,
    { status: 'requires_additional_evidence' }
  >) {
    super(
      `This ${assessment.targetDurationSeconds}-second factual, source-bounded script needs more approved evidence before it can be written safely. `
      + `The current record has ${assessment.availableEvidenceUnits} distinct source unit(s) and ${assessment.availableSourceWords} usable source words; `
      + `the request needs at least ${assessment.requiredEvidenceUnits} units and ${assessment.requiredSourceWords} source words. `
      + 'Add a fuller approved record, upload, or source link, or change this to a non-factual creative treatment. ThinkForge will not pad the runtime with unsupported claims.',
    );
    this.name = 'ScriptEvidenceSufficiencyError';
  }
}

export function assertScriptEvidenceSufficiency(
  input: AssessScriptEvidenceSufficiencyInput,
): void {
  const assessment = assessScriptEvidenceSufficiency(input);
  if (assessment.status === 'requires_additional_evidence') {
    throw new ScriptEvidenceSufficiencyError(assessment);
  }
}
