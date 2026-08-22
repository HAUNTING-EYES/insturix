import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { HoldoutMediaManifestV2R } from './holdout-media-materializer-v2r';
import type { BudgetedSealedHoldoutEvaluationReceiptV3R2 }
  from './sealed-holdout-evaluator-v2r';
import type { SealedHoldoutCohortManifestV3R2 }
  from './sealed-holdout-cohort-v3r2';
import {
  executeSealedHoldoutH05NativeProofMechanicsV2R,
  type SealedHoldoutH05NativeProofMechanicsV2R,
} from './sealed-holdout-h05-native-proof-v2r';
import { bindSealedHoldoutProofInputV3R2 }
  from './sealed-holdout-proof-input-v2r';
import type { BudgetedSealedHoldoutSelectedOperationTraceV3R2 }
  from './sealed-holdout-trace-v2r';

export const SEALED_HOLDOUT_H05_NATIVE_PROOF_VERSION_V3R2 =
  'EDITRON_OE_SEALED_HOLDOUT_H05_NATIVE_VISUAL_PROXY_PROOF_V3R_2_RESOURCE_BOUND_1' as const;

export interface SealedHoldoutH05NativeProofReceiptV3R2
  extends SealedHoldoutH05NativeProofMechanicsV2R {
  version: typeof SEALED_HOLDOUT_H05_NATIVE_PROOF_VERSION_V3R2;
  authority: 'RESEARCH_NATIVE_OWNER_AND_RENDERED_VISUAL_PROXY_CURRENT_RESOURCE_BOUND_NO_PROJECT_MUTATION';
  caseId: 'HOLD-05:C1'; taskId: 'HOLD-05'; manifestSha256: string;
  publicCaseSha256: string; traceArtifactSha256: string;
  evaluationReceiptSha256: string; runtimeBudgetReceiptSha256: string;
  resourceBudgetProof: 'BOUND_ACCOUNTED_WITHIN_BUDGET';
  assessment: 'PASS_RESEARCH_NATIVE_OWNER_AND_RENDERED_VISUAL_PROXY_LIMITED';
  productProjectMutationProof: 'NOT_CLAIMED'; stateEffects: readonly [];
  receiptSha256: string;
}

/** Current receipt adapter only. Subject tracking, reframe form and render checks
 * remain owned by the canonical V2 mechanics invoked below. */
export async function proveSealedHoldoutH05NativeOutcomeV3R2(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: 'HOLD-05:C1';
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV3R2>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV3R2>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string; ffprobePath?: string;
}): Promise<Readonly<SealedHoldoutH05NativeProofReceiptV3R2>> {
  const bound = bindSealedHoldoutProofInputV3R2({
    manifest: input.manifest, caseId: input.caseId, trace: input.trace,
    evaluation: input.evaluation, allowedTaskIds: ['HOLD-05'],
    allowedAssessments: ['READY_FOR_PROOF'], allowedExecutionForms: ['NATIVE'],
  });
  const taskCase = input.manifest.cases.find(({ caseId }) => caseId === input.caseId)
    ?? fail('SEALED_V3R2_H05_PROOF_CASE_MISSING');
  const mechanics = await executeSealedHoldoutH05NativeProofMechanicsV2R({
    traceNodes: bound.trace.nodes,
    publicCase: taskCase.publicCase,
    ownerOnly: taskCase.ownerOnly,
    mediaManifest: input.mediaManifest,
    outputDirectory: input.outputDirectory,
    ffprobePath: input.ffprobePath,
  });
  const material = {
    version: SEALED_HOLDOUT_H05_NATIVE_PROOF_VERSION_V3R2,
    authority: 'RESEARCH_NATIVE_OWNER_AND_RENDERED_VISUAL_PROXY_CURRENT_RESOURCE_BOUND_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId, taskId: 'HOLD-05' as const,
    manifestSha256: input.manifest.manifestSha256,
    publicCaseSha256: bound.publicCaseSha256,
    traceArtifactSha256: bound.trace.artifactSha256,
    evaluationReceiptSha256: bound.evaluation.receiptSha256,
    runtimeBudgetReceiptSha256: bound.trace.runtimeBudgetReceiptSha256,
    resourceBudgetProof: 'BOUND_ACCOUNTED_WITHIN_BUDGET' as const,
    ...mechanics,
    assessment: 'PASS_RESEARCH_NATIVE_OWNER_AND_RENDERED_VISUAL_PROXY_LIMITED' as const,
    productProjectMutationProof: 'NOT_CLAIMED' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function fail(code: string): never { throw new Error(code); }
