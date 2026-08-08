/**
 * S2 — Human-labelled SFX evaluation corpus contract.
 *
 * The evaluation authority created BEFORE any selector calibration. Selector
 * weights and thresholds MUST NOT be tuned from this corpus while labels are
 * being created (S2 order). This module is types + validation only — it does
 * not read, mutate, or tune the selector.
 *
 * Two artifact families:
 *   - IsolatedOpportunityV1: one editorial SFX decision, human-labelled with
 *     acceptable/unacceptable/absurd assets, silence policy, and the realized
 *     evidence that should (later) drive selection. Minimum 64 isolates.
 *   - SequenceCanaryV1: one rendered audiovisual sequence judged as a whole
 *     (not by filenames): timing, audibility, dialogue masking, density,
 *     repetition, transition/MG fit, silence quality, overall taste. Minimum 8.
 *
 * Label contract per the S2 order: acceptable assets, unacceptable assets,
 * high-severity absurd assets, silence acceptable?, silence required?, role,
 * surface, direction (only when genuinely perceptible), motion character/speed
 * (only when genuinely perceptible), material (only when meaningful),
 * contextual notes, reviewer identity, disagreement/adjudication.
 *
 * ABSENT/UNKNOWN is explicit: an unlabelled field is `{state:'unlabelled'}`, not
 * a fabricated value. Corpus labels are evidence, never selector instructions.
 */

import type { SfxCatalogDirection, SfxCatalogEventRole, SfxCatalogSurface } from './sfx-catalog';
import type { SfxSelectionMotionSpeed } from './sfx-selection-evidence';

export const SFX_EVALUATION_CORPUS_VERSION = 'editron-sfx-evaluation-corpus-v1' as const;
export const S2_MIN_ISOLATED_OPPORTUNITIES = 64;
export const S2_MIN_SEQUENCE_CANARIES = 8;

/** An editorially explicit absolute truth for a label, or explicitly unknown. */
export interface CorpusValue<T> {
  state: 'label' | 'unlabelled' | 'unavailable';
  value?: T;
  note?: string;
}

/** Each labelled opportunity is scoped to exactly one editorial decision context. */
export interface IsolatedOpportunityContextV1 {
  opportunityId: string;
  /** The editorial surface this decision belongs to. */
  surface: CorpusValue<SfxCatalogSurface>;
  /** The editorial role the placement is for. */
  role: CorpusValue<SfxCatalogEventRole>;
  /** Direction ONLY when genuinely perceptible in the realized visual. */
  direction?: CorpusValue<SfxCatalogDirection>;
  /** Motion character/speed ONLY when genuinely perceptible. */
  motionSpeed?: CorpusValue<SfxSelectionMotionSpeed>;
  /** Material ONLY when meaningful to placement (paper, glass, ...). */
  material?: CorpusValue<string>;
  /** Free-form contextual note describing the moment. */
  contextualNote?: string;
}

/** Human label for one isolated opportunity. */
export interface IsolatedOpportunityLabelV1 {
  labelVersion: typeof SFX_EVALUATION_CORPUS_VERSION;
  opportunityId: string;
  /** Assets the reviewer qualifies as acceptable for this moment. */
  acceptableAssetIds: string[];
  /** Assets the reviewer explicitly rejects. */
  unacceptableAssetIds: string[];
  /** High-severity absurd selections: choosing any of these is a FAILURE. */
  absurdAssetIds: string[];
  /** Whether deliberate silence is an acceptable outcome. */
  silenceAcceptable: boolean;
  /** Whether silence is REQUIRED (no sound may be placed). */
  silenceRequired: boolean;
  /** Asset ids that satisfy the moment if no labelled preference exists — optional. */
  preferredAssetIds?: string[];
  reviewerId: string;
  reviewedAt: string;
  /** Adjudication of disagreements, when the same opportunity is double-labelled. */
  adjudication?: {
    conflictingReviewerIds: string[];
    resolved: boolean;
    result: 'accepted-consensus' | 'adjudicated-choice' | 'unresolved';
    note?: string;
  };
}

export interface IsolatedOpportunityV1 {
  context: IsolatedOpportunityContextV1;
  /** The deterministic selection BEFORE tuning was applied at freeze time. */
  frozenPreTuningSelection?: {
    decision: 'selected' | 'silence' | 'no-match';
    selectedAssetId?: string;
    /** Recommended acceptable (from label) minus absurd. */
    feezeNote?: string;
  };
  label: IsolatedOpportunityLabelV1 | null;
}

/** One rendered sequence judged as a whole. */
export interface SequenceCanaryJudgementV1 {
  canaryId: string;
  reviewerId: string;
  reviewedAt: string;
  /** 1..5, higher is better. Absent = not yet judged. */
  timing?: number;
  audibility?: number;
  dialogueMasking?: number;
  density?: number;
  repetition?: number;
  transitionMgFit?: number;
  silenceQuality?: number;
  overallTaste?: number;
  /** Free-form: what was judged about the ACTUAL audiovisual article. */
  notes?: string;
}

export interface SequenceCanaryV1 {
  canaryId: string;
  scenario: string;
  /** Source context producing the renders — the same fixtures the sequence exercises. */
  renderedArtifactRefs: string[];
  /** Editorially expected behaviour (what "good" looks like) BEFORE any render. */
  expectations: string[];
  judgement: SequenceCanaryJudgementV1 | null;
}

export interface SfxEvaluationCorpusV1 {
  version: typeof SFX_EVALUATION_CORPUS_VERSION;
  /** Invariant: >= S2_MIN_ISOLATED_OPPORTUNITIES when frozen for the S2 gate. */
  isolated: IsolatedOpportunityV1[];
  /** Invariant: >= S2_MIN_SEQUENCE_CANARIES when frozen for the S2 gate. */
  sequences: SequenceCanaryV1[];
  /** When the corpus was frozen as the pre-tuning baseline. */
  frozenAt?: string;
}

export function assertEvaluationCorpusShape(corpus: SfxEvaluationCorpusV1): void {
  if (corpus.version !== SFX_EVALUATION_CORPUS_VERSION) {
    throw new Error(`SFX corpus version mismatch: ${corpus.version}`);
  }
  for (const item of corpus.isolated) {
    if (!item.context.opportunityId) throw new Error('isolated opportunity missing opportunityId');
    if (item.label) {
      if (item.label.opportunityId !== item.context.opportunityId) {
        throw new Error(`label opportunityId mismatch: ${item.label.opportunityId}`);
      }
      if (!item.label.reviewerId) throw new Error(`label missing reviewer for ${item.label.opportunityId}`);
      if (!Array.isArray(item.label.acceptableAssetIds) || !Array.isArray(item.label.absurdAssetIds)) {
        throw new Error(`label missing asset sets for ${item.label.opportunityId}`);
      }
    }
  }
  for (const seq of corpus.sequences) {
    if (!seq.canaryId || !Array.isArray(seq.renderedArtifactRefs)) {
      throw new Error(`sequence canary malformed: ${seq.canaryId ?? '<missing id>'}`);
    }
  }
}
