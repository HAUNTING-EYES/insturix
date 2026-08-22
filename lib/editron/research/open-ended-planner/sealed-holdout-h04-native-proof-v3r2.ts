import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { HoldoutMediaManifestV2R } from './holdout-media-materializer-v2r';
import type { BudgetedSealedHoldoutEvaluationReceiptV3R2 }
  from './sealed-holdout-evaluator-v2r';
import type { SealedHoldoutCohortManifestV3R2 }
  from './sealed-holdout-cohort-v3r2';
import { assertBudgetedSealedHoldoutEpisodeReceiptV3R2,
  type BudgetedSealedHoldoutEpisodeReceiptV3R2 }
  from './sealed-holdout-episode-v3r';
import {
  executeSealedHoldoutH04NativeProofMechanicsV3R,
  type SealedHoldoutH04NativeProofMechanicsV3R,
} from './sealed-holdout-h04-native-proof-v3r';
import { bindSealedHoldoutProofInputV3R2 }
  from './sealed-holdout-proof-input-v2r';
import type { BudgetedSealedHoldoutSelectedOperationTraceV3R2 }
  from './sealed-holdout-trace-v2r';

export const SEALED_HOLDOUT_H04_NATIVE_PROOF_VERSION_V3R2 =
  'EDITRON_OE_SEALED_HOLDOUT_H04_NATIVE_AV_STATE_PROOF_V3R_2_RESOURCE_BOUND_1' as const;

export interface SealedHoldoutH04NativeProofReceiptV3R2
  extends SealedHoldoutH04NativeProofMechanicsV3R {
  version: typeof SEALED_HOLDOUT_H04_NATIVE_PROOF_VERSION_V3R2;
  authority: 'RESEARCH_NATIVE_OWNER_AND_RENDERED_AV_PROXY_CURRENT_RESOURCE_BOUND_NO_PROJECT_MUTATION';
  caseId: 'HOLD-04:C1'; taskId: 'HOLD-04'; manifestSha256: string;
  publicCaseSha256: string; budgetedEpisodeReceiptSha256: string;
  providerEpisodeReceiptSha256: string; traceArtifactSha256: string;
  evaluationReceiptSha256: string; runtimeBudgetReceiptSha256: string;
  resourceBudgetProof: 'BOUND_ACCOUNTED_WITHIN_BUDGET';
  assessment: 'PASS_RESEARCH_NATIVE_OWNER_STATE_AND_RENDERED_AV_PROXY';
  productProjectMutationProof: 'NOT_CLAIMED'; stateEffects: readonly [];
  receiptSha256: string;
}

/** Current receipt adapter. The state replay and rendered AV predicates remain
 * in the sole H04 mechanics owner shared with the historical V3R proof. */
export async function proveSealedHoldoutH04NativeOutcomeV3R2(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: 'HOLD-04:C1';
  budgetedEpisode: Readonly<BudgetedSealedHoldoutEpisodeReceiptV3R2>;
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV3R2>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV3R2>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string; ffprobePath?: string;
}): Promise<Readonly<SealedHoldoutH04NativeProofReceiptV3R2>> {
  const budgetedEpisode = assertBudgetedSealedHoldoutEpisodeReceiptV3R2(
    input.budgetedEpisode,
  );
  const bound = bindSealedHoldoutProofInputV3R2({
    manifest: input.manifest, caseId: input.caseId, trace: input.trace,
    evaluation: input.evaluation, allowedTaskIds: ['HOLD-04'],
    allowedAssessments: ['READY_FOR_PROOF'], allowedExecutionForms: ['NATIVE'],
  });
  const episode = budgetedEpisode.providerEpisode;
  if (bound.trace.budgetedEpisodeReceiptSha256 !== budgetedEpisode.receiptSha256
    || bound.trace.providerEpisodeReceiptSha256 !== episode.receiptSha256
    || bound.trace.runtimeBudgetReceiptSha256 !== budgetedEpisode.runtimeBudget.receiptSha256
    || bound.trace.episodeId !== episode.episodeId
    || bound.trace.contextSha256 !== episode.contextSha256) {
    fail('SEALED_V3R2_H04_PROOF_EPISODE_BINDING_INVALID');
  }
  const taskCase = input.manifest.cases.find(({ caseId }) => caseId === input.caseId)
    ?? fail('SEALED_V3R2_H04_PROOF_CASE_MISSING');
  const mechanics = await executeSealedHoldoutH04NativeProofMechanicsV3R({
    manifest: input.manifest,
    caseId: input.caseId,
    providerEpisode: episode,
    traceNodes: bound.trace.nodes,
    publicCase: taskCase.publicCase,
    mediaManifest: input.mediaManifest,
    outputDirectory: input.outputDirectory,
    ffprobePath: input.ffprobePath,
  });
  const material = {
    version: SEALED_HOLDOUT_H04_NATIVE_PROOF_VERSION_V3R2,
    authority: 'RESEARCH_NATIVE_OWNER_AND_RENDERED_AV_PROXY_CURRENT_RESOURCE_BOUND_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId, taskId: 'HOLD-04' as const,
    manifestSha256: input.manifest.manifestSha256,
    publicCaseSha256: bound.publicCaseSha256,
    budgetedEpisodeReceiptSha256: budgetedEpisode.receiptSha256,
    providerEpisodeReceiptSha256: episode.receiptSha256,
    traceArtifactSha256: bound.trace.artifactSha256,
    evaluationReceiptSha256: bound.evaluation.receiptSha256,
    runtimeBudgetReceiptSha256: bound.trace.runtimeBudgetReceiptSha256,
    ...mechanics,
    resourceBudgetProof: 'BOUND_ACCOUNTED_WITHIN_BUDGET' as const,
    assessment: 'PASS_RESEARCH_NATIVE_OWNER_STATE_AND_RENDERED_AV_PROXY' as const,
    productProjectMutationProof: 'NOT_CLAIMED' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function fail(code: string): never { throw new Error(code); }
