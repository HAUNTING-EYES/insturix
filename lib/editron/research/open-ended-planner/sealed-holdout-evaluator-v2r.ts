import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  isProviderNativeInfrastructureTerminalV2R,
  isProviderNativeResourceGuardTerminalV2R,
} from './provider-native-product-outcome-v2r';
import type { ProviderNativeTerminalDispositionV2R } from './provider-native-tool-episode-v2r';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import {
  assertSealedHoldoutCohortManifestV3R,
  type SealedHoldoutCohortManifestV3R,
} from './sealed-holdout-cohort-v3r';
import {
  assertSealedHoldoutCohortManifestV3R2,
  type SealedHoldoutCohortManifestV3R2,
} from './sealed-holdout-cohort-v3r2';
import {
  assertSealedH03ConnectedEpisodeReceiptV3R2,
  type SealedH03ConnectedEpisodeReceiptV3R2,
} from './sealed-holdout-episode-v3r2';
import {
  assertBudgetedSealedHoldoutSelectedOperationTraceV2R,
  assertBudgetedSealedHoldoutSelectedOperationTraceV3R2,
  assertSealedHoldoutSelectedOperationTraceV2R,
  assertSealedHoldoutSelectedOperationTraceV3R,
  assertSealedHoldoutSelectedOperationTraceV3R2,
  type BudgetedSealedHoldoutSelectedOperationTraceV2R,
  type BudgetedSealedHoldoutSelectedOperationTraceV3R2,
  type SealedHoldoutSelectedOperationTraceV2R,
  type SealedHoldoutSelectedOperationTraceV3R,
  type SealedHoldoutSelectedOperationTraceV3R2,
  type SealedHoldoutTraceNodeV2R,
} from './sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;

const SEALED_HOLDOUT_EVALUATOR_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_HIDDEN_PREPROOF_EVALUATOR_V2R_1' as const;
const BUDGETED_SEALED_HOLDOUT_EVALUATOR_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_HIDDEN_PREPROOF_EVALUATOR_V2R_2' as const;
const BUDGETED_SEALED_HOLDOUT_EVALUATOR_VERSION_V3R2 =
  'EDITRON_OE_SEALED_HOLDOUT_HIDDEN_PREPROOF_EVALUATOR_V3R_2_CURRENT_PROOF_ELIGIBILITY_1' as const;
const SEALED_HOLDOUT_EVALUATOR_VERSION_V3R =
  'EDITRON_OE_SEALED_HOLDOUT_HIDDEN_PREPROOF_EVALUATOR_V3R_1' as const;
const SEALED_HOLDOUT_EVALUATOR_VERSION_V3R2 =
  'EDITRON_OE_SEALED_HOLDOUT_HIDDEN_PREPROOF_EVALUATOR_V3R_2_H04_STATE' as const;
const SEALED_HOLDOUT_EVALUATOR_VERSION_V3R3 =
  'EDITRON_OE_SEALED_HOLDOUT_HIDDEN_PREPROOF_EVALUATOR_V3R_3_H03_SOURCE' as const;

type SealedHoldoutEvaluationAssessmentV2R = 'PASS' | 'FAIL' | 'READY_FOR_PROOF'
  | 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE'
  | 'NOT_EVALUATED_RESOURCE_GUARD';

/** Executable cases with a current V3R2 claim-proof owner. The evaluator and
 * dispatcher share this contract so a trace cannot be promoted to a proof
 * path that the runtime does not actually implement. */
export const SEALED_HOLDOUT_CURRENT_EXECUTABLE_PROOF_CASES_V3R2 = deepFreezeV1([
  'HOLD-01:C1',
  'HOLD-02:C1',
  'HOLD-02:C2',
  'HOLD-04:C1',
  'HOLD-05:C1',
] as const);

export interface SealedHoldoutEvaluationReceiptV2R {
  version: typeof SEALED_HOLDOUT_EVALUATOR_VERSION_V2R;
  authority: 'HIDDEN_POST_EPISODE_EVALUATOR_NO_MODEL_CONTEXT_NO_PROJECT_MUTATION';
  caseId: string;
  traceArtifactSha256: string;
  evaluatorPolicySha256: string;
  assessment: SealedHoldoutEvaluationAssessmentV2R;
  executionForm: 'NONE' | 'NATIVE' | 'GENERATED_COMPOSITION' | 'HYBRID';
  diagnostics: readonly string[];
  proofRequired: boolean;
  stateEffects: readonly [];
  receiptSha256: string;
}

export type SealedHoldoutEvaluationReceiptV3R = Readonly<
  Omit<SealedHoldoutEvaluationReceiptV2R, 'version'> & {
    version: typeof SEALED_HOLDOUT_EVALUATOR_VERSION_V3R;
  }
>;

export type SealedHoldoutEvaluationReceiptV3R2 = Readonly<
  Omit<SealedHoldoutEvaluationReceiptV2R, 'version'> & {
    version: typeof SEALED_HOLDOUT_EVALUATOR_VERSION_V3R2;
  }
>;

export type SealedHoldoutEvaluationReceiptV3R3 = Readonly<
  Omit<SealedHoldoutEvaluationReceiptV2R, 'version'> & {
    version: typeof SEALED_HOLDOUT_EVALUATOR_VERSION_V3R3;
    connectedEpisodeReceiptSha256: string;
  }
>;

export type BudgetedSealedHoldoutEvaluationReceiptV2R = Readonly<
  Omit<SealedHoldoutEvaluationReceiptV2R, 'version' | 'receiptSha256'> & {
    version: typeof BUDGETED_SEALED_HOLDOUT_EVALUATOR_VERSION_V2R;
    runtimeBudgetReceiptSha256: string;
    runtimeBudgetAssessment: BudgetedSealedHoldoutSelectedOperationTraceV2R[
      'runtimeBudgetAssessment'
    ];
    receiptSha256: string;
  }
>;

export type BudgetedSealedHoldoutEvaluationReceiptV3R2 = Readonly<
  Omit<SealedHoldoutEvaluationReceiptV2R, 'version' | 'receiptSha256'> & {
    version: typeof BUDGETED_SEALED_HOLDOUT_EVALUATOR_VERSION_V3R2;
    runtimeBudgetReceiptSha256: string;
    runtimeBudgetAssessment: BudgetedSealedHoldoutSelectedOperationTraceV3R2[
      'runtimeBudgetAssessment'
    ];
    receiptSha256: string;
  }
>;

export function evaluateSealedHoldoutTraceV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: string;
  trace: Readonly<SealedHoldoutSelectedOperationTraceV2R>;
}): Readonly<SealedHoldoutEvaluationReceiptV2R> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const trace = assertSealedHoldoutSelectedOperationTraceV2R(input.trace);
  const evaluated = evaluateTrace({
    manifest,
    caseId: input.caseId,
    trace,
    evaluatorVersion: SEALED_HOLDOUT_EVALUATOR_VERSION_V2R,
    structuralPolicy: 'SEALED_HOLDOUT_STRUCTURAL_PREPROOF_V1',
    resourceGuardBound: false,
    requirePostMutationStateRead: false,
  });
  const material = {
    version: SEALED_HOLDOUT_EVALUATOR_VERSION_V2R,
    authority: 'HIDDEN_POST_EPISODE_EVALUATOR_NO_MODEL_CONTEXT_NO_PROJECT_MUTATION' as const,
    ...evaluated,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export function evaluateSealedHoldoutTraceV3R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R>;
  caseId: string;
  trace: Readonly<SealedHoldoutSelectedOperationTraceV3R>;
}): Readonly<SealedHoldoutEvaluationReceiptV3R> {
  const manifest = assertSealedHoldoutCohortManifestV3R(input.manifest);
  const trace = assertSealedHoldoutSelectedOperationTraceV3R(input.trace);
  const evaluated = evaluateTrace({
    manifest,
    caseId: input.caseId,
    trace,
    evaluatorVersion: SEALED_HOLDOUT_EVALUATOR_VERSION_V3R,
    structuralPolicy: 'SEALED_HOLDOUT_STRUCTURAL_PREPROOF_V3_CORRECTED_EVIDENCE',
    resourceGuardBound: false,
    requirePostMutationStateRead: false,
  });
  const material = {
    version: SEALED_HOLDOUT_EVALUATOR_VERSION_V3R,
    authority: 'HIDDEN_POST_EPISODE_EVALUATOR_NO_MODEL_CONTEXT_NO_PROJECT_MUTATION' as const,
    ...evaluated,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export function evaluateSealedHoldoutTraceV3R2(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R>;
  caseId: string;
  trace: Readonly<SealedHoldoutSelectedOperationTraceV3R>;
}): Readonly<SealedHoldoutEvaluationReceiptV3R2> {
  const manifest = assertSealedHoldoutCohortManifestV3R(input.manifest);
  const trace = assertSealedHoldoutSelectedOperationTraceV3R(input.trace);
  const evaluated = evaluateTrace({
    manifest,
    caseId: input.caseId,
    trace,
    evaluatorVersion: SEALED_HOLDOUT_EVALUATOR_VERSION_V3R2,
    structuralPolicy: 'SEALED_HOLDOUT_STRUCTURAL_PREPROOF_V3_H04_EVOLVING_STATE',
    resourceGuardBound: false,
    requirePostMutationStateRead: true,
  });
  const material = {
    version: SEALED_HOLDOUT_EVALUATOR_VERSION_V3R2,
    authority: 'HIDDEN_POST_EPISODE_EVALUATOR_NO_MODEL_CONTEXT_NO_PROJECT_MUTATION' as const,
    ...evaluated,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export function evaluateSealedHoldoutH03TraceV3R3(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: 'HOLD-03:C1' | 'HOLD-03:C2';
  trace: Readonly<SealedHoldoutSelectedOperationTraceV3R2>;
  connectedEpisode: Readonly<SealedH03ConnectedEpisodeReceiptV3R2>;
}): Readonly<SealedHoldoutEvaluationReceiptV3R3> {
  const manifest = assertSealedHoldoutCohortManifestV3R2(input.manifest);
  const trace = assertSealedHoldoutSelectedOperationTraceV3R2(input.trace);
  const connected = assertSealedH03ConnectedEpisodeReceiptV3R2(input.connectedEpisode);
  const evaluated = evaluateTrace({
    manifest,
    caseId: input.caseId,
    trace,
    evaluatorVersion: SEALED_HOLDOUT_EVALUATOR_VERSION_V3R3,
    structuralPolicy: 'SEALED_HOLDOUT_STRUCTURAL_PREPROOF_V3_H03_MODEL_SOURCE',
    resourceGuardBound: false,
    requirePostMutationStateRead: false,
  });
  const diagnostics = [...new Set([
    ...evaluated.diagnostics,
    ...h03SourceLineageDiagnostics(manifest, trace, connected, input.caseId),
  ])].sort(compareUtf16);
  const ready = evaluated.assessment === 'READY_FOR_PROOF'
    && evaluated.executionForm === 'GENERATED_COMPOSITION'
    && diagnostics.length === 0;
  const material = {
    version: SEALED_HOLDOUT_EVALUATOR_VERSION_V3R3,
    authority: 'HIDDEN_POST_EPISODE_EVALUATOR_NO_MODEL_CONTEXT_NO_PROJECT_MUTATION' as const,
    ...evaluated,
    diagnostics,
    assessment: ready ? 'READY_FOR_PROOF' as const : 'FAIL' as const,
    proofRequired: ready,
    connectedEpisodeReceiptSha256: connected.receiptSha256,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export function evaluateBudgetedSealedHoldoutTraceV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: string;
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV2R>;
}): Readonly<BudgetedSealedHoldoutEvaluationReceiptV2R> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const trace = assertBudgetedSealedHoldoutSelectedOperationTraceV2R(input.trace);
  const evaluated = evaluateTrace({
    manifest,
    caseId: input.caseId,
    trace,
    evaluatorVersion: BUDGETED_SEALED_HOLDOUT_EVALUATOR_VERSION_V2R,
    structuralPolicy: 'SEALED_HOLDOUT_STRUCTURAL_PREPROOF_V2_RESOURCE_BOUND',
    resourceGuardBound: true,
    requirePostMutationStateRead: false,
  });
  const material = {
    version: BUDGETED_SEALED_HOLDOUT_EVALUATOR_VERSION_V2R,
    authority: 'HIDDEN_POST_EPISODE_EVALUATOR_NO_MODEL_CONTEXT_NO_PROJECT_MUTATION' as const,
    ...evaluated,
    runtimeBudgetReceiptSha256: trace.runtimeBudgetReceiptSha256,
    runtimeBudgetAssessment: trace.runtimeBudgetAssessment,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export function evaluateBudgetedSealedHoldoutTraceV3R2(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: string;
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV3R2>;
}): Readonly<BudgetedSealedHoldoutEvaluationReceiptV3R2> {
  const manifest = assertSealedHoldoutCohortManifestV3R2(input.manifest);
  const trace = assertBudgetedSealedHoldoutSelectedOperationTraceV3R2(input.trace);
  const evaluated = evaluateTrace({
    manifest,
    caseId: input.caseId,
    trace,
    evaluatorVersion: BUDGETED_SEALED_HOLDOUT_EVALUATOR_VERSION_V3R2,
    structuralPolicy:
      'SEALED_HOLDOUT_STRUCTURAL_PREPROOF_V3_CURRENT_RESOURCE_BOUND_PROOF_ELIGIBILITY',
    resourceGuardBound: true,
    requirePostMutationStateRead: true,
  });
  const currentDiagnostics = currentExecutableProofDiagnostics(
    input.caseId,
    trace.nodes,
    evaluated.assessment,
  );
  const diagnostics = [...new Set([
    ...evaluated.diagnostics,
    ...currentDiagnostics,
  ])].sort(compareUtf16);
  const assessment = evaluated.assessment === 'READY_FOR_PROOF'
    && currentDiagnostics.length > 0
    ? 'FAIL' as const
    : evaluated.assessment;
  const material = {
    version: BUDGETED_SEALED_HOLDOUT_EVALUATOR_VERSION_V3R2,
    authority: 'HIDDEN_POST_EPISODE_EVALUATOR_NO_MODEL_CONTEXT_NO_PROJECT_MUTATION' as const,
    ...evaluated,
    diagnostics,
    assessment,
    proofRequired: assessment === 'READY_FOR_PROOF',
    runtimeBudgetReceiptSha256: trace.runtimeBudgetReceiptSha256,
    runtimeBudgetAssessment: trace.runtimeBudgetAssessment,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function currentExecutableProofDiagnostics(
  caseId: string,
  nodes: readonly Readonly<SealedHoldoutTraceNodeV2R>[],
  assessment: SealedHoldoutEvaluationAssessmentV2R,
): string[] {
  if (assessment !== 'READY_FOR_PROOF') return [];
  const diagnostics: string[] = [];
  const successfulIds = nodes
    .filter(({ executionDisposition }) => executionDisposition === 'OK')
    .map(({ selectedOperatorId }) => selectedOperatorId);
  if (!SEALED_HOLDOUT_CURRENT_EXECUTABLE_PROOF_CASES_V3R2
    .some((supportedCaseId) => supportedCaseId === caseId)) {
    diagnostics.push(`EVAL_CURRENT_EXECUTABLE_PROOF_OWNER_MISSING:${caseId}`);
  }
  if (caseId === 'HOLD-01:C1' && !successfulIds.includes('use_matching_footage')) {
    diagnostics.push('EVAL_H01_MATCHING_FOOTAGE_MISSING');
  }
  if (caseId.startsWith('HOLD-01:') && successfulIds.includes('cut_section')) {
    diagnostics.push('EVAL_H01_RANGE_DELETE_FORBIDDEN');
  }
  return diagnostics;
}

function evaluateTrace(input: Readonly<{
  manifest: Readonly<SealedHoldoutCohortManifestV2R | SealedHoldoutCohortManifestV3R
    | SealedHoldoutCohortManifestV3R2>;
  caseId: string;
  trace: Readonly<SealedHoldoutSelectedOperationTraceV2R
    | SealedHoldoutSelectedOperationTraceV3R
    | SealedHoldoutSelectedOperationTraceV3R2
    | BudgetedSealedHoldoutSelectedOperationTraceV2R
    | BudgetedSealedHoldoutSelectedOperationTraceV3R2>;
  evaluatorVersion: string;
  structuralPolicy: string;
  resourceGuardBound: boolean;
  requirePostMutationStateRead: boolean;
}>): Omit<SealedHoldoutEvaluationReceiptV2R,
  'version' | 'authority' | 'receiptSha256'> {
  const { manifest, trace } = input;
  const taskCase = manifest.cases.find(({ caseId }) => caseId === input.caseId);
  if (!taskCase || trace.caseId !== input.caseId) fail('SEALED_EVALUATOR_CASE_BINDING_INVALID');
  // Hidden rubric material is consulted only after the provider episode. Never
  // feed this policy or its receipt back into model context or owner execution.
  const evaluator = record(taskCase.evaluatorOnly);
  const publicCase = record(taskCase.publicCase);
  const taskId = text(publicCase.taskId);
  const terminal = trace.terminalDisposition as ProviderNativeTerminalDispositionV2R;
  const infrastructure = isProviderNativeInfrastructureTerminalV2R(terminal);
  const resourceGuard = isProviderNativeResourceGuardTerminalV2R(terminal);
  const successfulNodes = trace.nodes.filter(({ executionDisposition }) => executionDisposition === 'OK');
  const nativeMutations = successfulNodes.filter(({ researchCloneMutation }) => researchCloneMutation);
  const generated = successfulNodes.filter(({ operatorKind }) => operatorKind === 'GENERATED_COMPOSITION');
  const executionForm: SealedHoldoutEvaluationReceiptV2R['executionForm'] =
    generated.length && nativeMutations.length ? 'HYBRID'
    : generated.length ? 'GENERATED_COMPOSITION'
      : nativeMutations.length ? 'NATIVE' : 'NONE';
  const diagnostics: string[] = [];
  if (trace.assessment !== 'PASS') diagnostics.push('EVAL_TRACE_INVALID');
  const normalizedDisposition = terminal === 'READY_FOR_PROOF' ? 'PROCEED' : terminal;
  if (resourceGuard && !input.resourceGuardBound) {
    diagnostics.push('EVAL_RESOURCE_TERMINAL_WITHOUT_BOUND_BUDGET_RECEIPT');
  }
  if (input.resourceGuardBound && 'runtimeBudgetAssessment' in trace) {
    const expectedBudgetAssessment = terminal === 'RESOURCE_ACCOUNTING_UNVERIFIABLE'
      ? 'ACCOUNTING_UNVERIFIABLE'
      : terminal === 'RESOURCE_BUDGET_EXHAUSTED'
        ? 'BUDGET_EXHAUSTED'
        : 'ACCOUNTED_WITHIN_BUDGET';
    if (trace.runtimeBudgetAssessment !== expectedBudgetAssessment) {
      diagnostics.push('EVAL_RUNTIME_BUDGET_TERMINAL_BINDING_INVALID');
    }
  }
  if (!infrastructure && !resourceGuard
    && !strings(evaluator.allowedDispositions).includes(normalizedDisposition)) {
    diagnostics.push(`EVAL_DISPOSITION_NOT_ALLOWED:${normalizedDisposition}`);
  }
  const proceeds = normalizedDisposition === 'PROCEED';
  if (!infrastructure && !resourceGuard) {
    if (terminal === 'PASS') diagnostics.push('EVAL_PREMATURE_MODEL_PASS_WITHOUT_HIDDEN_PROOF');
    const suppliedEvidence = new Set(trace.nodes
      .flatMap(({ executionEvidenceRefs }) => executionEvidenceRefs));
    for (const requiredRef of requiredEvidenceRefs(
      evaluator,
      record(taskCase.ownerOnly),
      diagnostics,
    )) {
      if (!suppliedEvidence.has(requiredRef)) {
        diagnostics.push(`EVAL_REQUIRED_EVIDENCE_UNRESOLVED:${requiredRef}`);
      }
    }
    const selectedIds = trace.nodes.map(({ selectedOperatorId }) => selectedOperatorId);
    for (const forbiddenId of strings(record(evaluator.sourceEvaluator).forbiddenOperatorIds)) {
      if (selectedIds.includes(forbiddenId)) diagnostics.push(`EVAL_FORBIDDEN_OPERATOR:${forbiddenId}`);
    }
    if (!proceeds && (nativeMutations.length || generated.length)) {
      diagnostics.push('EVAL_SAFE_STOP_AFTER_SUCCESSFUL_EDIT_OPERATION');
    }
    if (proceeds) {
      const acceptableForms = strings(record(evaluator.v2Evaluator).acceptableExecutionForms);
      if (!acceptableForms.includes(executionForm)) {
        diagnostics.push(`EVAL_EXECUTION_FORM_NOT_ALLOWED:${executionForm}`);
      }
      diagnostics.push(...structuralDiagnostics(
        taskId,
        successfulNodes,
        record(taskCase.ownerOnly),
        input.requirePostMutationStateRead,
      ));
    }
  }
  const sortedDiagnostics = [...new Set(diagnostics)].sort(compareUtf16);
  const evaluatorPolicySha256 = hashCanonicalJsonV1({
    version: input.evaluatorVersion,
    evaluatorOnlySha256: taskCase.evaluatorOnlySha256,
    structuralPolicy: input.structuralPolicy,
  });
  const assessment: SealedHoldoutEvaluationAssessmentV2R =
    trace.assessment !== 'PASS' ? 'FAIL'
      : sortedDiagnostics.length ? 'FAIL'
        : resourceGuard && input.resourceGuardBound ? 'NOT_EVALUATED_RESOURCE_GUARD'
          : infrastructure ? 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE'
            : proceeds ? 'READY_FOR_PROOF' : 'PASS';
  return {
    caseId: input.caseId,
    traceArtifactSha256: trace.artifactSha256,
    evaluatorPolicySha256,
    assessment,
    executionForm,
    diagnostics: sortedDiagnostics,
    proofRequired: assessment === 'READY_FOR_PROOF',
    stateEffects: [] as const,
  };
}

function structuralDiagnostics(
  taskId: string,
  nodes: readonly Readonly<SealedHoldoutTraceNodeV2R>[],
  ownerOnly: JsonRecord,
  requirePostMutationStateRead: boolean,
): string[] {
  const ids = nodes.map(({ selectedOperatorId }) => selectedOperatorId);
  const diagnostics: string[] = [];
  if (taskId === 'HOLD-01') {
    if (!ids.some((id) => ['find_visual_moment', 'inspect_user_asset'].includes(id))) diagnostics.push('EVAL_H01_VISUAL_RETRIEVAL_MISSING');
    if (!nodes.some(({ researchCloneMutation }) => researchCloneMutation)) diagnostics.push('EVAL_H01_NATIVE_EDIT_MISSING');
  } else if (taskId === 'HOLD-02') {
    const placements = nodes.filter(({ selectedOperatorId }) => ['add_overlay', 'use_matching_footage'].includes(selectedOperatorId));
    const doors = placements.filter(({ normalizedArguments }) => normalizedArguments.assetId === 'h02-door');
    const processes = placements.filter(({ normalizedArguments }) => normalizedArguments.assetId === 'h02-process');
    const doorRanges = new Set(doors.map(({ normalizedArguments }) =>
      hashCanonicalJsonV1(normalizedArguments.sourceRange ?? null)));
    if (doors.length < 2 || doorRanges.size < 2) diagnostics.push('EVAL_H02_DISTINCT_DOOR_CALLBACKS_MISSING');
    if (!processes.length) diagnostics.push('EVAL_H02_PROCESS_PLACEMENT_MISSING');
  } else if (taskId === 'HOLD-03') {
    if (!ids.includes('generated_composition_program')) diagnostics.push('EVAL_H03_GENERATED_COMPOSITION_MISSING');
  } else if (taskId === 'HOLD-04') {
    if (!ids.some((id) => ['get_video_transcription', 'find_transcript_moment'].includes(id))) diagnostics.push('EVAL_H04_TRANSCRIPT_RETRIEVAL_MISSING');
    const cut = nodes.find(({ selectedOperatorId }) => selectedOperatorId === 'cut_section');
    if (!cut) diagnostics.push('EVAL_H04_CUT_MISSING');
    const transcript = records(ownerOnly.evidence).find(({ kind }) => kind === 'TRANSCRIPT');
    const value = record(transcript?.value);
    const first = numbers(value.firstOccurrence);
    const pause = numbers(value.pause);
    if (cut && first.length === 2 && pause.length === 2
      && hashCanonicalJsonV1(cut.normalizedArguments.targetRange)
        !== hashCanonicalJsonV1({ startFrame: first[0], endFrame: pause[1] })) {
      diagnostics.push('EVAL_H04_BASELINE_CUT_RANGE_DRIFT');
    }
    const postMutationRead = cut?.writerIssuedProjectRevision
      ? nodes.some((node) => node.turn > cut.turn
        && node.selectedOperatorId === 'get_timeline_view'
        && node.normalizedArguments.expectedProjectRevision
          === cut.writerIssuedProjectRevision)
      : false;
    if (requirePostMutationStateRead && !postMutationRead) {
      diagnostics.push('EVAL_H04_POST_MUTATION_STATE_READ_MISSING');
    }
  } else if (taskId === 'HOLD-05') {
    if (!ids.includes('find_visual_moment')) diagnostics.push('EVAL_H05_SPATIAL_RETRIEVAL_MISSING');
    if (!ids.includes('reframe_project')) diagnostics.push('EVAL_H05_REFRAME_MISSING');
  }
  return diagnostics;
}

function h03SourceLineageDiagnostics(
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>,
  trace: Readonly<SealedHoldoutSelectedOperationTraceV3R2>,
  connected: Readonly<SealedH03ConnectedEpisodeReceiptV3R2>,
  caseId: string,
): string[] {
  const diagnostics: string[] = [];
  const generated = trace.nodes.filter(({ executionDisposition, operatorKind }) =>
    executionDisposition === 'OK' && operatorKind === 'GENERATED_COMPOSITION');
  const accepted = connected.generatedCandidate;
  if (connected.caseId !== caseId || connected.manifestSha256 !== manifest.manifestSha256
    || connected.providerEpisode.receiptSha256 !== trace.providerEpisodeReceiptSha256
    || connected.disposition !== 'SOURCE_CONTRACT_READY_FOR_RENDERED_PROOF') {
    diagnostics.push('EVAL_H03_CONNECTED_EPISODE_BINDING_DRIFT');
  }
  if (generated.length !== 1 || generated[0].selectedOperatorId !== 'generated_composition_program') {
    diagnostics.push('EVAL_H03_VERIFIED_GENERATED_NODE_MISSING');
    return diagnostics;
  }
  if (!accepted) {
    diagnostics.push('EVAL_H03_ACCEPTED_MODEL_SOURCE_MISSING');
    return diagnostics;
  }
  const generator = accepted.candidate.program.generator;
  const expectedBinding = {
    candidateOrdinal: accepted.candidateOrdinal,
    sourceContractStatus: 'CONTRACT_VERIFIED',
    programHash: accepted.verification.programHash,
    sourceBundleHash: accepted.verification.sourceBundleHash,
    modelId: generator.modelId,
    promptHash: generator.promptHash,
    orchestratorSpecSha256: accepted.orchestratorArgumentsSha256,
    ownerAuthorizationOutputSha256: accepted.ownerAuthorizationOutputSha256,
    generationReceiptSha256: accepted.generationReceiptSha256,
    renderStatus: 'READY_FOR_BOUNDED_PROXY_RENDER',
    projectMutation: 'NONE',
  };
  if (hashCanonicalJsonV1(generated[0].generatedSourceBinding)
    !== hashCanonicalJsonV1(expectedBinding)) {
    diagnostics.push('EVAL_H03_MODEL_SOURCE_BINDING_DRIFT');
  }
  return diagnostics;
}

function requiredEvidenceRefs(evaluator: JsonRecord, ownerOnly: JsonRecord, diagnostics: string[]): string[] {
  const evidence = records(ownerOnly.evidence);
  const requiredIds = new Set(records(evaluator.activePredicates)
    .flatMap((predicate) => strings(predicate.requiredEvidenceIds)));
  return [...requiredIds].flatMap((evidenceId) => {
    const found = evidence.find((entry) => entry.evidenceId === evidenceId);
    if (!found) { diagnostics.push(`EVAL_POLICY_EVIDENCE_BINDING_MISSING:${evidenceId}`); return []; }
    return [text(found.evidenceRef)];
  }).sort(compareUtf16);
}

function fail(code: string): never { throw new Error(code); }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function numbers(value: unknown): number[] { return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === 'number') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
