import type { HoldoutMediaManifestV2R }
  from './holdout-media-materializer-v2r';
import {
  SEALED_HOLDOUT_CURRENT_EXECUTABLE_PROOF_CASES_V3R2,
  type BudgetedSealedHoldoutEvaluationReceiptV2R,
  type BudgetedSealedHoldoutEvaluationReceiptV3R2,
}
  from './sealed-holdout-evaluator-v2r';
import type {
  SealedHoldoutCohortManifestV2R,
}
  from './sealed-holdout-cohort-v2r';
import { proveSealedHoldoutH01NativeOutcomeV2R }
  from './sealed-holdout-h01-native-proof-v2r';
import { proveSealedHoldoutH01NativeOutcomeV3R2 }
  from './sealed-holdout-h01-native-proof-v3r';
import {
  proveSealedHoldoutH02NativeOutcomeV2R,
  proveSealedHoldoutH02NativeOutcomeV3R2,
}
  from './sealed-holdout-h02-native-proof-v2r';
import { proveSealedHoldoutH03HybridOutcomeV2R }
  from './sealed-holdout-h03-hybrid-proof-v2r';
import { proveSealedHoldoutH04NativeOutcomeV2R }
  from './sealed-holdout-h04-native-proof-v2r';
import { proveSealedHoldoutH04NativeOutcomeV3R2 }
  from './sealed-holdout-h04-native-proof-v3r2';
import { proveSealedHoldoutH05NativeOutcomeV2R }
  from './sealed-holdout-h05-native-proof-v2r';
import { proveSealedHoldoutH05NativeOutcomeV3R2 }
  from './sealed-holdout-h05-native-proof-v3r2';
import {
  proveSealedHoldoutGeneralNoEditOutcomeV2R,
  proveSealedHoldoutGeneralNoEditOutcomeV3R2,
} from './sealed-holdout-no-edit-proof-v2r';
import type { SealedHoldoutCohortManifestV3R2 }
  from './sealed-holdout-cohort-v3r2';
import type { BudgetedSealedHoldoutEpisodeReceiptV3R2 }
  from './sealed-holdout-episode-v3r';
import type {
  BudgetedSealedHoldoutSelectedOperationTraceV2R,
  BudgetedSealedHoldoutSelectedOperationTraceV3R2,
}
  from './sealed-holdout-trace-v2r';

export interface SealedHoldoutPaidProofSummaryV2R {
  assessment: string;
  receiptSha256: string;
  stateEffects: readonly unknown[];
}

export interface SealedHoldoutPaidProofInputV2R {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: string;
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV2R>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV2R>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string;
}

export interface SealedHoldoutPaidProofInputV3R2 {
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: string;
  budgetedEpisode: Readonly<BudgetedSealedHoldoutEpisodeReceiptV3R2>;
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV3R2>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV3R2>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string;
}

/**
 * Delegates to the frozen claim owner selected by the hidden evaluator. This
 * adapter never repairs a trace or substitutes a canonical edit for model work.
 */
export async function proveSealedHoldoutPaidOutcomeV2R(
  input: Readonly<SealedHoldoutPaidProofInputV2R>,
): Promise<Readonly<SealedHoldoutPaidProofSummaryV2R>> {
  if (input.evaluation.assessment === 'PASS') {
    return proveSealedHoldoutGeneralNoEditOutcomeV2R(input);
  }
  if (input.evaluation.assessment !== 'READY_FOR_PROOF') {
    throw new Error(`SEALED_PAID_PROOF_EVALUATION_NOT_PROVABLE:${input.evaluation.assessment}`);
  }
  if (input.caseId === 'HOLD-01:C1' || input.caseId === 'HOLD-01:C2') {
    return proveSealedHoldoutH01NativeOutcomeV2R({ ...input, caseId: input.caseId });
  }
  if (input.caseId === 'HOLD-02:C1' || input.caseId === 'HOLD-02:C2') {
    return proveSealedHoldoutH02NativeOutcomeV2R({ ...input, caseId: input.caseId });
  }
  if (input.caseId === 'HOLD-03:C1') {
    return proveSealedHoldoutH03HybridOutcomeV2R({ ...input, caseId: input.caseId });
  }
  if (input.caseId === 'HOLD-04:C1' || input.caseId === 'HOLD-04:C2') {
    return proveSealedHoldoutH04NativeOutcomeV2R({ ...input, caseId: input.caseId });
  }
  if (input.caseId === 'HOLD-05:C1') {
    return proveSealedHoldoutH05NativeOutcomeV2R({ ...input, caseId: input.caseId });
  }
  throw new Error(`SEALED_PAID_PROOF_EXECUTABLE_CASE_UNSUPPORTED:${input.caseId}`);
}

/** Current V4R dispatcher. It selects an existing proof owner only; it never
 * repairs the model trace or lowers an unsupported case into another edit. */
export async function proveSealedHoldoutPaidOutcomeV3R2(
  input: Readonly<SealedHoldoutPaidProofInputV3R2>,
): Promise<Readonly<SealedHoldoutPaidProofSummaryV2R>> {
  if (input.evaluation.assessment === 'PASS') {
    return proveSealedHoldoutGeneralNoEditOutcomeV3R2(input);
  }
  if (input.evaluation.assessment !== 'READY_FOR_PROOF') {
    throw new Error(
      `SEALED_CURRENT_PAID_PROOF_EVALUATION_NOT_PROVABLE:${input.evaluation.assessment}`,
    );
  }
  if (!SEALED_HOLDOUT_CURRENT_EXECUTABLE_PROOF_CASES_V3R2
    .some((caseId) => caseId === input.caseId)) {
    throw new Error(`SEALED_CURRENT_PAID_PROOF_EXECUTABLE_CASE_UNSUPPORTED:${input.caseId}`);
  }
  if (input.caseId === 'HOLD-01:C1') {
    return proveSealedHoldoutH01NativeOutcomeV3R2({ ...input, caseId: input.caseId });
  }
  if (input.caseId === 'HOLD-02:C1' || input.caseId === 'HOLD-02:C2') {
    return proveSealedHoldoutH02NativeOutcomeV3R2({ ...input, caseId: input.caseId });
  }
  if (input.caseId === 'HOLD-04:C1') {
    return proveSealedHoldoutH04NativeOutcomeV3R2({ ...input, caseId: input.caseId });
  }
  if (input.caseId === 'HOLD-05:C1') {
    return proveSealedHoldoutH05NativeOutcomeV3R2({ ...input, caseId: input.caseId });
  }
  throw new Error(`SEALED_CURRENT_PAID_PROOF_EXECUTABLE_CASE_UNSUPPORTED:${input.caseId}`);
}
