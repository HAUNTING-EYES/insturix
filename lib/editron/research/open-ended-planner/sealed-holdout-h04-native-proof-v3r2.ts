import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { HoldoutMediaManifestV2R } from './holdout-media-materializer-v2r';
import {
  evaluateBudgetedSealedHoldoutTraceV3R2,
  evaluateBudgetedSealedHoldoutTraceV4R,
  type BudgetedSealedHoldoutEvaluationReceiptV3R2,
  type BudgetedSealedHoldoutEvaluationReceiptV4R,
} from './sealed-holdout-evaluator-v2r';
import type { SealedHoldoutCohortManifestV3R2 }
  from './sealed-holdout-cohort-v3r2';
import { assertBudgetedSealedHoldoutEpisodeReceiptV3R2,
  type BudgetedSealedHoldoutEpisodeReceiptV3R2 }
  from './sealed-holdout-episode-v3r';
import {
  executeSealedHoldoutH04NativeProofMechanicsV3R,
  type SealedHoldoutH04NativeProofMechanicsV3R,
} from './sealed-holdout-h04-native-proof-v3r';
import {
  executeSealedHoldoutH04RenderedAvMechanicsV2R,
  type SealedHoldoutH04RenderedAvMechanicsV2R,
} from './sealed-holdout-h04-native-proof-v2r';
import {
  SEALED_HOLDOUT_H04_OWNER_STATE_VERSION_V3R,
  SealedHoldoutH04OwnerStateV3R,
} from './sealed-holdout-h04-owner-state-v3r';
import { bindSealedHoldoutProofInputV3R2 }
  from './sealed-holdout-proof-input-v2r';
import type { BudgetedSealedHoldoutSelectedOperationTraceV3R2 }
  from './sealed-holdout-trace-v2r';
import type { SealedHoldoutTraceNodeV2R }
  from './sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;
export type SealedHoldoutH04SourceRangeV4R = Readonly<{
  startFrame: number; endFrame: number;
}>;
type SourceRange = SealedHoldoutH04SourceRangeV4R;

export const SEALED_HOLDOUT_H04_NATIVE_PROOF_VERSION_V3R2 =
  'EDITRON_OE_SEALED_HOLDOUT_H04_NATIVE_AV_STATE_PROOF_V3R_2_RESOURCE_BOUND_1' as const;
export const SEALED_HOLDOUT_H04_NATIVE_PROOF_VERSION_V4R =
  'EDITRON_OE_SEALED_HOLDOUT_H04_FINAL_STATE_EQUIVALENCE_PROOF_V4R_1' as const;

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

export type SealedHoldoutH04NativeProofMechanicsV4R = Readonly<{
  writerIssuedProjectRevisions: readonly string[];
  operationAttempts: readonly Readonly<{
    nodeId: string; operatorId: string; operatorKind: string;
    executionDisposition: string; argumentSha256: string; appliedToOutcome: boolean;
  }>[];
  selectedMutations: readonly Readonly<{
    nodeId: string;
    operatorId: 'cut_section';
    argumentSha256: string;
    currentTimelineRange: SourceRange;
    writerIssuedProjectRevision: string;
  }>[];
  resultingSourceState: Readonly<{
    keptRanges: readonly SourceRange[];
    removedRanges: readonly SourceRange[];
  }>;
  evolvingOwnerStateProof: Readonly<{
    ownerStateVersion: typeof SEALED_HOLDOUT_H04_OWNER_STATE_VERSION_V3R;
    beforeStateSha256: string;
    afterStateSha256: string;
    finalWriterProjectRevision: string;
    finalStateReadSha256: string;
    beforeDurationInFrames: number;
    afterDurationInFrames: number;
    retainedCaptionText: 'our launch is Friday';
    retainedCaptionWordCount: 4;
    retainedCaptionGroupCount: 1;
    presentationReference: 'sha256:caption-presentation-v1';
  }>;
}> & SealedHoldoutH04RenderedAvMechanicsV2R;

export type SealedHoldoutH04NativeProofReceiptV4R = Readonly<
  SealedHoldoutH04NativeProofMechanicsV4R & {
    version: typeof SEALED_HOLDOUT_H04_NATIVE_PROOF_VERSION_V4R;
    authority: 'RESEARCH_NATIVE_OWNER_FINAL_STATE_EQUIVALENCE_AND_RENDERED_AV_PROXY_CURRENT_RESOURCE_BOUND_NO_PROJECT_MUTATION';
    caseId: 'HOLD-04:C1'; taskId: 'HOLD-04'; manifestSha256: string;
    publicCaseSha256: string; budgetedEpisodeReceiptSha256: string;
    providerEpisodeReceiptSha256: string; traceArtifactSha256: string;
    evaluationReceiptSha256: string; runtimeBudgetReceiptSha256: string;
    resourceBudgetProof: 'BOUND_ACCOUNTED_WITHIN_BUDGET';
    assessment: 'PASS_RESEARCH_NATIVE_OWNER_FINAL_STATE_EQUIVALENCE_AND_RENDERED_AV_PROXY';
    productProjectMutationProof: 'NOT_CLAIMED'; stateEffects: readonly [];
    receiptSha256: string;
  }
>;

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

/** Current equivalence proof. Every successful cut is replayed through the
 * sole state owner; correctness is judged from the last writer-bound read,
 * not from the number or topology of calls used to reach it. */
export async function proveSealedHoldoutH04NativeOutcomeV4R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: 'HOLD-04:C1';
  budgetedEpisode: Readonly<BudgetedSealedHoldoutEpisodeReceiptV3R2>;
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV3R2>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV4R>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string; ffprobePath?: string;
}): Promise<Readonly<SealedHoldoutH04NativeProofReceiptV4R>> {
  const budgetedEpisode = assertBudgetedSealedHoldoutEpisodeReceiptV3R2(
    input.budgetedEpisode,
  );
  const legacyEvaluation = evaluateBudgetedSealedHoldoutTraceV3R2({
    manifest: input.manifest, caseId: input.caseId, trace: input.trace,
  });
  const bound = bindSealedHoldoutProofInputV3R2({
    manifest: input.manifest, caseId: input.caseId, trace: input.trace,
    evaluation: legacyEvaluation, allowedTaskIds: ['HOLD-04'],
    allowedAssessments: ['READY_FOR_PROOF', 'FAIL'], allowedExecutionForms: ['NATIVE'],
  });
  const evaluation = evaluateBudgetedSealedHoldoutTraceV4R({
    manifest: input.manifest, caseId: input.caseId, trace: input.trace,
  });
  if (hashCanonicalJsonV1(input.evaluation) !== hashCanonicalJsonV1(evaluation)
    || evaluation.assessment !== 'READY_FOR_PROOF'
    || evaluation.executionForm !== 'NATIVE') fail('SEALED_V4_H04_PROOF_EVALUATION_INVALID');
  const episode = budgetedEpisode.providerEpisode;
  if (bound.trace.budgetedEpisodeReceiptSha256 !== budgetedEpisode.receiptSha256
    || bound.trace.providerEpisodeReceiptSha256 !== episode.receiptSha256
    || bound.trace.runtimeBudgetReceiptSha256 !== budgetedEpisode.runtimeBudget.receiptSha256
    || bound.trace.episodeId !== episode.episodeId
    || bound.trace.contextSha256 !== episode.contextSha256) {
    fail('SEALED_V4_H04_PROOF_EPISODE_BINDING_INVALID');
  }
  const taskCase = input.manifest.cases.find(({ caseId }) => caseId === input.caseId)
    ?? fail('SEALED_V4_H04_PROOF_CASE_MISSING');
  const mechanics = await executeSealedHoldoutH04NativeProofMechanicsV4R({
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
    version: SEALED_HOLDOUT_H04_NATIVE_PROOF_VERSION_V4R,
    authority: 'RESEARCH_NATIVE_OWNER_FINAL_STATE_EQUIVALENCE_AND_RENDERED_AV_PROXY_CURRENT_RESOURCE_BOUND_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId, taskId: 'HOLD-04' as const,
    manifestSha256: input.manifest.manifestSha256,
    publicCaseSha256: bound.publicCaseSha256,
    budgetedEpisodeReceiptSha256: budgetedEpisode.receiptSha256,
    providerEpisodeReceiptSha256: episode.receiptSha256,
    traceArtifactSha256: bound.trace.artifactSha256,
    evaluationReceiptSha256: evaluation.receiptSha256,
    runtimeBudgetReceiptSha256: bound.trace.runtimeBudgetReceiptSha256,
    ...mechanics,
    resourceBudgetProof: 'BOUND_ACCOUNTED_WITHIN_BUDGET' as const,
    assessment: 'PASS_RESEARCH_NATIVE_OWNER_FINAL_STATE_EQUIVALENCE_AND_RENDERED_AV_PROXY' as const,
    productProjectMutationProof: 'NOT_CLAIMED' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

async function executeSealedHoldoutH04NativeProofMechanicsV4R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: 'HOLD-04:C1';
  providerEpisode: Readonly<BudgetedSealedHoldoutEpisodeReceiptV3R2['providerEpisode']>;
  traceNodes: readonly Readonly<SealedHoldoutTraceNodeV2R>[];
  publicCase: Readonly<JsonRecord>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string; ffprobePath?: string;
}): Promise<Readonly<SealedHoldoutH04NativeProofMechanicsV4R>> {
  const operationAttempts = outcomeOperationAttempts(input.traceNodes);
  const successful = input.traceNodes.filter(({ executionDisposition }) =>
    executionDisposition === 'OK');
  const mutations = successful.filter(({ researchCloneMutation }) => researchCloneMutation);
  if (!mutations.length
    || mutations.some(({ selectedOperatorId }) => selectedOperatorId !== 'cut_section')) {
    fail('SEALED_V4_H04_PROOF_MUTATION_FORM_INVALID');
  }
  const replayOwner = new SealedHoldoutH04OwnerStateV3R({
    manifest: input.manifest,
    caseId: input.caseId,
  });
  const taskCase = input.manifest.cases.find(({ caseId }) => caseId === input.caseId)
    ?? fail('SEALED_V4_H04_PROOF_CASE_MISSING');
  const finalStateContract = h04FinalStateContractV4R(
    input.publicCase,
    record(taskCase.ownerOnly),
  );
  const project = record(input.publicCase.project);
  const projectId = text(project.projectId);
  let expectedRevision = text(project.expectedProjectRevision);
  if (!projectId || !expectedRevision) fail('SEALED_V4_H04_PROOF_PUBLIC_PROJECT_INVALID');
  let firstBeforeStateSha256 = '';
  const selectedMutations: Array<{
    nodeId: string; operatorId: 'cut_section'; argumentSha256: string;
    currentTimelineRange: SourceRange; writerIssuedProjectRevision: string;
  }> = [];
  for (const mutation of mutations) {
    const writerRevision = mutation.writerIssuedProjectRevision
      ?? fail('SEALED_V4_H04_PROOF_WRITER_REVISION_MISSING');
    const currentTimelineRange = frameRange(mutation.normalizedArguments.targetRange);
    if (mutation.normalizedArguments.projectId !== projectId
      || mutation.normalizedArguments.expectedProjectRevision !== expectedRevision
      || !['E1', 'E2'].every((value) =>
        strings(mutation.normalizedArguments.evidenceIds).includes(value))) {
      fail('SEALED_V4_H04_PROOF_SELECTED_MUTATION_INVALID');
    }
    const actualOutput = executionOutput(input.providerEpisode, mutation);
    const actualTransition = record(record(record(actualOutput.receipt).proof)
      .isolatedStateTransition);
    const expectedMutation = replayOwner.executeMutation({
      operatorId: mutation.selectedOperatorId,
      arguments: mutation.normalizedArguments,
      beforeProjectRevision: expectedRevision,
      writerIssuedProjectRevision: writerRevision,
    });
    if (record(actualOutput.receipt).projectRevision !== writerRevision
      || hashCanonicalJsonV1(actualOutput.timelineCoordinateTransform)
        !== hashCanonicalJsonV1(expectedMutation.timelineCoordinateTransform)
      || hashCanonicalJsonV1(actualOutput.splitChildren)
        !== hashCanonicalJsonV1(expectedMutation.splitChildren)
      || hashCanonicalJsonV1(actualTransition)
        !== hashCanonicalJsonV1(record(expectedMutation.isolatedStateTransition))) {
      fail('SEALED_V4_H04_PROOF_OWNER_TRANSITION_DRIFT');
    }
    if (!firstBeforeStateSha256) {
      firstBeforeStateSha256 = text(actualTransition.beforeStateSha256);
    }
    selectedMutations.push({
      nodeId: mutation.nodeId,
      operatorId: 'cut_section',
      argumentSha256: mutation.argumentSha256,
      currentTimelineRange,
      writerIssuedProjectRevision: writerRevision,
    });
    expectedRevision = writerRevision;
  }
  const lastMutation = mutations[mutations.length - 1];
  const finalRead = successful.filter((node) => node.turn > lastMutation.turn
    && node.selectedOperatorId === 'get_timeline_view').at(-1)
    ?? fail('SEALED_V4_H04_PROOF_FINAL_STATE_READ_MISSING');
  if (finalRead.normalizedArguments.expectedProjectRevision !== expectedRevision) {
    fail('SEALED_V4_H04_PROOF_FINAL_STATE_READ_STALE');
  }
  const resultingSourceState = assertSealedHoldoutH04FinalStateEquivalenceV4R({
    currentTimelineCuts: selectedMutations.map(({ currentTimelineRange }) =>
      currentTimelineRange),
    writerIssuedProjectRevisions: selectedMutations.map(({ writerIssuedProjectRevision }) =>
      writerIssuedProjectRevision),
    finalReadExpectedProjectRevision: text(
      finalRead.normalizedArguments.expectedProjectRevision),
    contract: finalStateContract,
  });
  const finalReadOutput = executionOutput(input.providerEpisode, finalRead);
  const actualFinalState = record(record(finalReadOutput.result).isolatedTimelineState);
  const expectedFinalState = replayOwner.readTimeline({
    currentProjectRevision: expectedRevision,
  });
  if (hashCanonicalJsonV1(actualFinalState) !== hashCanonicalJsonV1(expectedFinalState)) {
    fail('SEALED_V4_H04_PROOF_FINAL_OWNER_STATE_DRIFT');
  }
  const { keptRanges, removedRanges } = resultingSourceState;
  const stateReceipt = record(actualFinalState.stateReceipt);
  const projection = record(actualFinalState.projection);
  const caption = record(projection.captionSemanticState);
  const expectedAfterDuration = finalStateContract.projectDurationInFrames
    - (finalStateContract.expectedRemovedRange.endFrame
      - finalStateContract.expectedRemovedRange.startFrame);
  if (stateReceipt.projectRevision !== expectedRevision
    || stateReceipt.durationInFrames !== expectedAfterDuration
    || projection.durationInFrames !== expectedAfterDuration
    || caption.text !== 'our launch is Friday'
    || caption.wordCount !== 4
    || caption.groupCount !== 1
    || caption.presentationHash !== 'sha256:caption-presentation-v1') {
    fail('SEALED_V4_H04_PROOF_FINAL_STATE_PREDICATE_FAILED');
  }
  const publicMedia = records(input.publicCase.media);
  const host = publicMedia.find(({ assetId }) => assetId === 'h04-host');
  const avProof = await executeSealedHoldoutH04RenderedAvMechanicsV2R({
    removedRange: removedRanges[0],
    publicArtifactSha256: text(host?.artifactSha256),
    mediaManifest: input.mediaManifest,
    outputDirectory: input.outputDirectory,
    outputFilename: 'sealed-holdout-h04-final-state-equivalence-v4r.mp4',
    ffprobePath: input.ffprobePath,
  });
  return deepFreezeV1({
    writerIssuedProjectRevisions: selectedMutations
      .map(({ writerIssuedProjectRevision }) => writerIssuedProjectRevision),
    operationAttempts,
    selectedMutations,
    resultingSourceState,
    evolvingOwnerStateProof: {
      ownerStateVersion: SEALED_HOLDOUT_H04_OWNER_STATE_VERSION_V3R,
      beforeStateSha256: firstBeforeStateSha256,
      afterStateSha256: text(stateReceipt.stateSha256),
      finalWriterProjectRevision: expectedRevision,
      finalStateReadSha256: hashCanonicalJsonV1(actualFinalState),
      beforeDurationInFrames: finalStateContract.projectDurationInFrames,
      afterDurationInFrames: expectedAfterDuration,
      retainedCaptionText: 'our launch is Friday' as const,
      retainedCaptionWordCount: 4 as const,
      retainedCaptionGroupCount: 1 as const,
      presentationReference: 'sha256:caption-presentation-v1' as const,
    },
    ...avProof,
  });
}

function executionOutput(
  episode: Readonly<BudgetedSealedHoldoutEpisodeReceiptV3R2['providerEpisode']>,
  node: Readonly<SealedHoldoutTraceNodeV2R>,
): JsonRecord {
  const turn = episode.turns.find((candidate) => number(candidate.turn) === node.turn)
    ?? fail('SEALED_V4_H04_PROOF_EPISODE_TURN_MISSING');
  const execution = record(turn.execution);
  const output = record(execution.output);
  if (execution.disposition !== 'OK'
    || hashCanonicalJsonV1(output) !== node.outputSha256) {
    fail('SEALED_V4_H04_PROOF_EPISODE_OUTPUT_DRIFT');
  }
  return output;
}

export function assertSealedHoldoutH04FinalStateEquivalenceV4R(input: Readonly<{
  currentTimelineCuts: readonly SealedHoldoutH04SourceRangeV4R[];
  writerIssuedProjectRevisions: readonly string[];
  finalReadExpectedProjectRevision: string;
  contract: SealedHoldoutH04FinalStateContractV4R;
}>): Readonly<{
  keptRanges: readonly SealedHoldoutH04SourceRangeV4R[];
  removedRanges: readonly SealedHoldoutH04SourceRangeV4R[];
}> {
  if (!input.currentTimelineCuts.length
    || input.currentTimelineCuts.length !== input.writerIssuedProjectRevisions.length
    || input.writerIssuedProjectRevisions.some((revision) => !revision)) {
    fail('SEALED_V4_H04_PROOF_MUTATION_FORM_INVALID');
  }
  const finalWriterRevision = input.writerIssuedProjectRevisions.at(-1)
    ?? fail('SEALED_V4_H04_PROOF_WRITER_REVISION_MISSING');
  if (input.finalReadExpectedProjectRevision !== finalWriterRevision) {
    fail('SEALED_V4_H04_PROOF_FINAL_STATE_READ_STALE');
  }
  const { projectDurationInFrames, expectedRemovedRange } = input.contract;
  if (projectDurationInFrames <= 0 || expectedRemovedRange.startFrame < 0
    || expectedRemovedRange.endFrame <= expectedRemovedRange.startFrame
    || expectedRemovedRange.endFrame > projectDurationInFrames) {
    fail('SEALED_V4_H04_PROOF_FINAL_STATE_CONTRACT_INVALID');
  }
  let sourceRanges: readonly SourceRange[] = [
    { startFrame: 0, endFrame: projectDurationInFrames },
  ];
  for (const currentTimelineCut of input.currentTimelineCuts) {
    sourceRanges = removeCurrentTimelineRange(sourceRanges, currentTimelineCut);
  }
  const keptRanges = normalizeSourceRanges(sourceRanges);
  const removedRanges = complementSourceRanges(keptRanges, projectDurationInFrames);
  const expectedKeptRanges = [
    ...(expectedRemovedRange.startFrame > 0
      ? [{ startFrame: 0, endFrame: expectedRemovedRange.startFrame }]
      : []),
    ...(expectedRemovedRange.endFrame < projectDurationInFrames
      ? [{ startFrame: expectedRemovedRange.endFrame, endFrame: projectDurationInFrames }]
      : []),
  ];
  const expectedRemovedRanges = [expectedRemovedRange];
  if (hashCanonicalJsonV1(keptRanges) !== hashCanonicalJsonV1(expectedKeptRanges)
    || hashCanonicalJsonV1(removedRanges) !== hashCanonicalJsonV1(expectedRemovedRanges)) {
    fail('SEALED_V4_H04_PROOF_FINAL_STATE_PREDICATE_FAILED');
  }
  return deepFreezeV1({ keptRanges, removedRanges });
}

export type SealedHoldoutH04FinalStateContractV4R = Readonly<{
  projectDurationInFrames: number;
  expectedRemovedRange: SealedHoldoutH04SourceRangeV4R;
}>;

function h04FinalStateContractV4R(
  publicCase: JsonRecord,
  ownerOnly: JsonRecord,
): SealedHoldoutH04FinalStateContractV4R {
  const projectDurationInFrames = integer(record(publicCase.project).durationFrames);
  const transcript = records(ownerOnly.evidence).find(({ kind }) => kind === 'TRANSCRIPT');
  const value = record(transcript?.value);
  const firstOccurrence = numbers(value.firstOccurrence);
  const pause = numbers(value.pause);
  if (projectDurationInFrames <= 0 || firstOccurrence.length !== 2 || pause.length !== 2) {
    fail('SEALED_V4_H04_PROOF_FINAL_STATE_CONTRACT_INVALID');
  }
  const expectedRemovedRange = frameRange({
    startFrame: firstOccurrence[0], endFrame: pause[1],
  });
  if (expectedRemovedRange.endFrame > projectDurationInFrames) {
    fail('SEALED_V4_H04_PROOF_FINAL_STATE_CONTRACT_INVALID');
  }
  return deepFreezeV1({ projectDurationInFrames, expectedRemovedRange });
}

function outcomeOperationAttempts(
  nodes: readonly Readonly<SealedHoldoutTraceNodeV2R>[],
) {
  return nodes.filter(({ operatorKind }) =>
    ['MUTATION', 'MUTATION_LEGACY', 'GENERATED_COMPOSITION'].includes(operatorKind))
    .map((node) => ({
      nodeId: node.nodeId,
      operatorId: node.selectedOperatorId,
      operatorKind: node.operatorKind,
      executionDisposition: node.executionDisposition,
      argumentSha256: node.argumentSha256,
      appliedToOutcome: node.executionDisposition === 'OK',
    }));
}

function removeCurrentTimelineRange(
  ranges: readonly SourceRange[],
  removal: SourceRange,
): readonly SourceRange[] {
  const duration = ranges.reduce((sum, range) => sum + range.endFrame - range.startFrame, 0);
  if (removal.startFrame < 0 || removal.endFrame <= removal.startFrame
    || removal.endFrame > duration) fail('SEALED_V4_H04_PROOF_RANGE_INVALID');
  const retained: SourceRange[] = [];
  let cursor = 0;
  for (const range of ranges) {
    const length = range.endFrame - range.startFrame;
    const currentEnd = cursor + length;
    const overlapStart = Math.max(cursor, removal.startFrame);
    const overlapEnd = Math.min(currentEnd, removal.endFrame);
    if (overlapStart >= overlapEnd) {
      retained.push(range);
    } else {
      const leftLength = overlapStart - cursor;
      const rightOffset = overlapEnd - cursor;
      if (leftLength > 0) retained.push({
        startFrame: range.startFrame,
        endFrame: range.startFrame + leftLength,
      });
      if (rightOffset < length) retained.push({
        startFrame: range.startFrame + rightOffset,
        endFrame: range.endFrame,
      });
    }
    cursor = currentEnd;
  }
  return normalizeSourceRanges(retained);
}

function normalizeSourceRanges(ranges: readonly SourceRange[]): readonly SourceRange[] {
  return ranges.reduce<SourceRange[]>((normalized, range) => {
    const previous = normalized.at(-1);
    if (previous?.endFrame === range.startFrame) {
      normalized[normalized.length - 1] = {
        startFrame: previous.startFrame, endFrame: range.endFrame,
      };
    } else {
      normalized.push({ ...range });
    }
    return normalized;
  }, []);
}

function complementSourceRanges(
  keptRanges: readonly SourceRange[],
  durationInFrames: number,
): readonly SourceRange[] {
  const removed: SourceRange[] = [];
  let cursor = 0;
  for (const kept of keptRanges) {
    if (kept.startFrame > cursor) removed.push({ startFrame: cursor, endFrame: kept.startFrame });
    cursor = kept.endFrame;
  }
  if (cursor < durationInFrames) removed.push({ startFrame: cursor, endFrame: durationInFrames });
  return removed;
}

function frameRange(value: unknown): SourceRange {
  const range = record(value);
  const startFrame = integer(range.startFrame);
  const endFrame = integer(range.endFrame);
  if (startFrame < 0 || endFrame <= startFrame) fail('SEALED_V4_H04_PROOF_RANGE_INVALID');
  return { startFrame, endFrame };
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function integer(value: unknown): number { return Number.isSafeInteger(value) ? Number(value) : -1; }
function number(value: unknown): number { return Number.isSafeInteger(value) ? Number(value) : 0; }
function numbers(value: unknown): number[] { return Array.isArray(value) ? value.filter((entry): entry is number => Number.isSafeInteger(entry)) : []; }

function fail(code: string): never { throw new Error(code); }
