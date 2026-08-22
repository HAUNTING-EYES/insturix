import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { HoldoutMediaManifestV2R } from './holdout-media-materializer-v2r';
import {
  evaluateSealedHoldoutTraceV3R2,
  type SealedHoldoutEvaluationReceiptV3R2,
} from './sealed-holdout-evaluator-v2r';
import {
  assertSealedHoldoutCohortManifestV3R,
  type SealedHoldoutCohortManifestV3R,
} from './sealed-holdout-cohort-v3r';
import {
  executeSealedHoldoutH04RenderedAvMechanicsV2R,
  type SealedHoldoutH04RenderedAvMechanicsV2R,
} from './sealed-holdout-h04-native-proof-v2r';
import {
  SEALED_HOLDOUT_H04_OWNER_STATE_VERSION_V3R,
  SealedHoldoutH04OwnerStateV3R,
} from './sealed-holdout-h04-owner-state-v3r';
import {
  PROVIDER_NATIVE_EPISODE_VERSION_V2R,
  type ProviderNativeEpisodeReceiptV2R,
} from './provider-native-tool-episode-v2r';
import {
  assertSealedHoldoutSelectedOperationTraceV3R,
  type SealedHoldoutSelectedOperationTraceV3R,
  type SealedHoldoutTraceNodeV2R,
} from './sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_H04_NATIVE_PROOF_VERSION_V3R =
  'EDITRON_OE_SEALED_HOLDOUT_H04_NATIVE_AV_STATE_PROOF_V3R_1' as const;

export interface SealedHoldoutH04NativeProofReceiptV3R
  extends SealedHoldoutH04RenderedAvMechanicsV2R {
  version: typeof SEALED_HOLDOUT_H04_NATIVE_PROOF_VERSION_V3R;
  authority: 'RESEARCH_NATIVE_OWNER_AND_RENDERED_AV_PROXY_NO_PROJECT_MUTATION_NO_RESOURCE_BUDGET_CLAIM';
  caseId: 'HOLD-04:C1';
  taskId: 'HOLD-04';
  manifestSha256: string;
  publicCaseSha256: string;
  providerEpisodeReceiptSha256: string;
  traceArtifactSha256: string;
  evaluationReceiptSha256: string;
  writerIssuedProjectRevision: string;
  selectedMutation: Readonly<{
    nodeId: string;
    operatorId: 'cut_section';
    argumentSha256: string;
    removedRange: Readonly<{ startFrame: 120; endFrame: 225 }>;
  }>;
  evolvingOwnerStateProof: Readonly<{
    ownerStateVersion: typeof SEALED_HOLDOUT_H04_OWNER_STATE_VERSION_V3R;
    beforeStateSha256: string;
    afterStateSha256: string;
    postMutationReadSha256: string;
    beforeDurationInFrames: 540;
    afterDurationInFrames: 435;
    rightSourceStartFrame: 225;
    retainedCaptionText: 'our launch is Friday';
    retainedCaptionWordCount: 4;
    retainedCaptionGroupCount: 1;
    presentationReference: 'sha256:caption-presentation-v1';
  }>;
  resourceBudgetProof: 'NOT_CLAIMED';
  assessment: 'PASS_RESEARCH_NATIVE_OWNER_STATE_AND_RENDERED_AV_PROXY';
  productProjectMutationProof: 'NOT_CLAIMED';
  stateEffects: readonly [];
  receiptSha256: string;
}

export async function proveSealedHoldoutH04NativeOutcomeV3R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R>;
  caseId: 'HOLD-04:C1';
  providerEpisode: Readonly<ProviderNativeEpisodeReceiptV2R>;
  trace: Readonly<SealedHoldoutSelectedOperationTraceV3R>;
  evaluation: Readonly<SealedHoldoutEvaluationReceiptV3R2>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string;
  ffprobePath?: string;
}): Promise<Readonly<SealedHoldoutH04NativeProofReceiptV3R>> {
  const manifest = assertSealedHoldoutCohortManifestV3R(input.manifest);
  const trace = assertSealedHoldoutSelectedOperationTraceV3R(input.trace);
  const episode = assertProviderEpisodeReceipt(input.providerEpisode);
  const taskCase = manifest.cases.find(({ caseId }) => caseId === input.caseId);
  const publicCase = record(taskCase?.publicCase);
  if (!taskCase || publicCase.taskId !== 'HOLD-04' || trace.caseId !== input.caseId) {
    fail('SEALED_V3_H04_PROOF_CASE_BINDING_INVALID');
  }
  if (trace.providerEpisodeReceiptSha256 !== episode.receiptSha256
    || trace.episodeId !== episode.episodeId
    || trace.contextSha256 !== episode.contextSha256) {
    fail('SEALED_V3_H04_PROOF_EPISODE_BINDING_INVALID');
  }
  const evaluation = evaluateSealedHoldoutTraceV3R2({
    manifest,
    caseId: input.caseId,
    trace,
  });
  if (hashCanonicalJsonV1(input.evaluation) !== hashCanonicalJsonV1(evaluation)) {
    fail('SEALED_V3_H04_PROOF_EVALUATION_DRIFT');
  }
  if (evaluation.assessment !== 'READY_FOR_PROOF'
    || evaluation.executionForm !== 'NATIVE'
    || trace.stateEffects.length
    || episode.stateEffects.length) {
    fail('SEALED_V3_H04_PROOF_PRECONDITION_FAILED');
  }

  const successful = trace.nodes.filter(({ executionDisposition }) =>
    executionDisposition === 'OK');
  const mutations = successful.filter(({ researchCloneMutation }) => researchCloneMutation);
  const mutation = mutations.length === 1 && mutations[0].selectedOperatorId === 'cut_section'
    ? mutations[0]
    : fail('SEALED_V3_H04_PROOF_MUTATION_FORM_INVALID');
  const writerRevision = mutation.writerIssuedProjectRevision
    ?? fail('SEALED_V3_H04_PROOF_WRITER_REVISION_MISSING');
  const removedRange = frameRange(mutation.normalizedArguments.targetRange);
  const postMutationRead = successful.find((node) => node.turn > mutation.turn
    && node.selectedOperatorId === 'get_timeline_view'
    && node.normalizedArguments.expectedProjectRevision === writerRevision)
    ?? fail('SEALED_V3_H04_PROOF_POST_MUTATION_READ_MISSING');
  if (mutation.normalizedArguments.projectId !== 'oe-hold-04'
    || mutation.normalizedArguments.expectedProjectRevision !== 'R6'
    || removedRange.startFrame !== 120
    || removedRange.endFrame !== 225
    || !['E1', 'E2'].every((value) =>
      strings(mutation.normalizedArguments.evidenceIds).includes(value))) {
    fail('SEALED_V3_H04_PROOF_SELECTED_MUTATION_INVALID');
  }

  const cutOutput = executionOutput(episode, mutation);
  const postReadOutput = executionOutput(episode, postMutationRead);
  const actualTransition = record(record(record(cutOutput.receipt).proof)
    .isolatedStateTransition);
  const actualPostState = record(record(postReadOutput.result).isolatedTimelineState);
  const replayOwner = new SealedHoldoutH04OwnerStateV3R({
    manifest,
    caseId: input.caseId,
  });
  const expectedMutation = replayOwner.executeMutation({
    operatorId: mutation.selectedOperatorId,
    arguments: mutation.normalizedArguments,
    beforeProjectRevision: 'R6',
    writerIssuedProjectRevision: writerRevision,
  });
  const expectedPostState = replayOwner.readTimeline({
    currentProjectRevision: writerRevision,
  });
  if (record(cutOutput.receipt).projectRevision !== writerRevision
    || hashCanonicalJsonV1(cutOutput.timelineCoordinateTransform)
      !== hashCanonicalJsonV1(expectedMutation.timelineCoordinateTransform)
    || hashCanonicalJsonV1(cutOutput.splitChildren)
      !== hashCanonicalJsonV1(expectedMutation.splitChildren)
    || hashCanonicalJsonV1(actualTransition)
      !== hashCanonicalJsonV1(record(expectedMutation.isolatedStateTransition))
    || hashCanonicalJsonV1(actualPostState) !== hashCanonicalJsonV1(expectedPostState)) {
    fail('SEALED_V3_H04_PROOF_OWNER_STATE_DRIFT');
  }
  const afterReceipt = record(actualPostState.stateReceipt);
  const projection = record(actualPostState.projection);
  const caption = record(projection.captionSemanticState);
  const split = records(cutOutput.splitChildren)
    .find(({ beforeOverlayId }) => beforeOverlayId === 401);
  if (actualTransition.ownerStateVersion !== SEALED_HOLDOUT_H04_OWNER_STATE_VERSION_V3R
    || afterReceipt.projectRevision !== writerRevision
    || afterReceipt.durationInFrames !== 435
    || projection.durationInFrames !== 435
    || split?.rightSourceStartFrame !== 225
    || caption.text !== 'our launch is Friday'
    || caption.wordCount !== 4
    || caption.groupCount !== 1
    || caption.presentationHash !== 'sha256:caption-presentation-v1') {
    fail('SEALED_V3_H04_PROOF_OWNER_STATE_PREDICATE_FAILED');
  }

  const publicMedia = records(publicCase.media);
  const host = publicMedia.find(({ assetId }) => assetId === 'h04-host');
  const avProof = await executeSealedHoldoutH04RenderedAvMechanicsV2R({
    removedRange,
    publicArtifactSha256: text(host?.artifactSha256),
    mediaManifest: input.mediaManifest,
    outputDirectory: input.outputDirectory,
    outputFilename: 'sealed-holdout-h04-clean-take-proxy-v3r.mp4',
    ffprobePath: input.ffprobePath,
  });
  const material = {
    version: SEALED_HOLDOUT_H04_NATIVE_PROOF_VERSION_V3R,
    authority: 'RESEARCH_NATIVE_OWNER_AND_RENDERED_AV_PROXY_NO_PROJECT_MUTATION_NO_RESOURCE_BUDGET_CLAIM' as const,
    caseId: input.caseId,
    taskId: 'HOLD-04' as const,
    manifestSha256: manifest.manifestSha256,
    publicCaseSha256: taskCase.publicCaseSha256,
    providerEpisodeReceiptSha256: episode.receiptSha256,
    traceArtifactSha256: trace.artifactSha256,
    evaluationReceiptSha256: evaluation.receiptSha256,
    writerIssuedProjectRevision: writerRevision,
    selectedMutation: {
      nodeId: mutation.nodeId,
      operatorId: 'cut_section' as const,
      argumentSha256: mutation.argumentSha256,
      removedRange: { startFrame: 120 as const, endFrame: 225 as const },
    },
    evolvingOwnerStateProof: {
      ownerStateVersion: SEALED_HOLDOUT_H04_OWNER_STATE_VERSION_V3R,
      beforeStateSha256: text(actualTransition.beforeStateSha256),
      afterStateSha256: text(afterReceipt.stateSha256),
      postMutationReadSha256: hashCanonicalJsonV1(actualPostState),
      beforeDurationInFrames: 540 as const,
      afterDurationInFrames: 435 as const,
      rightSourceStartFrame: 225 as const,
      retainedCaptionText: 'our launch is Friday' as const,
      retainedCaptionWordCount: 4 as const,
      retainedCaptionGroupCount: 1 as const,
      presentationReference: 'sha256:caption-presentation-v1' as const,
    },
    ...avProof,
    resourceBudgetProof: 'NOT_CLAIMED' as const,
    assessment: 'PASS_RESEARCH_NATIVE_OWNER_STATE_AND_RENDERED_AV_PROXY' as const,
    productProjectMutationProof: 'NOT_CLAIMED' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function assertProviderEpisodeReceipt(
  value: Readonly<ProviderNativeEpisodeReceiptV2R>,
): Readonly<ProviderNativeEpisodeReceiptV2R> {
  const { receiptSha256, ...material } = value;
  if (value.receiptVersion !== PROVIDER_NATIVE_EPISODE_VERSION_V2R
    || value.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION'
    || value.transcriptSha256 !== hashCanonicalJsonV1(value.turns)
    || receiptSha256 !== hashCanonicalJsonV1(material)
    || value.stateEffects.length) {
    fail('SEALED_V3_H04_PROOF_EPISODE_DRIFT');
  }
  return value;
}

function executionOutput(
  episode: Readonly<ProviderNativeEpisodeReceiptV2R>,
  node: Readonly<SealedHoldoutTraceNodeV2R>,
): JsonRecord {
  const turn = episode.turns.find((candidate) => number(candidate.turn) === node.turn)
    ?? fail('SEALED_V3_H04_PROOF_EPISODE_TURN_MISSING');
  const execution = record(turn.execution);
  const output = record(execution.output);
  if (execution.disposition !== 'OK'
    || hashCanonicalJsonV1(output) !== node.outputSha256) {
    fail('SEALED_V3_H04_PROOF_EPISODE_OUTPUT_DRIFT');
  }
  return output;
}

function frameRange(value: unknown): { startFrame: number; endFrame: number } {
  const range = record(value);
  const startFrame = integer(range.startFrame);
  const endFrame = integer(range.endFrame);
  if (startFrame < 0 || endFrame <= startFrame) fail('SEALED_V3_H04_PROOF_RANGE_INVALID');
  return { startFrame, endFrame };
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function integer(value: unknown): number { return Number.isSafeInteger(value) ? Number(value) : -1; }
function number(value: unknown): number { return Number.isSafeInteger(value) ? Number(value) : 0; }
function fail(code: string): never { throw new Error(code); }
