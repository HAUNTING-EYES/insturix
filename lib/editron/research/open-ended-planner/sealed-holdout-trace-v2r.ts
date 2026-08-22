import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { V2R_OPERATOR_CATALOG } from './operator-catalog-v2r';
import type { ProviderNativeEpisodeReceiptV2R } from './provider-native-tool-episode-v2r';
import {
  assertBudgetedSealedHoldoutEpisodeReceiptV2R,
  buildBudgetedSealedHoldoutEpisodeContextFromManifestV2R,
  buildBudgetedSealedHoldoutEpisodeContextV2R,
  buildSealedHoldoutEpisodeContextFromManifestV2R,
  buildSealedHoldoutEpisodeContextV2R,
  type BudgetedSealedHoldoutEpisodeReceiptV2R,
} from './sealed-holdout-episode-v2r';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import { SEALED_HOLDOUT_OPERATOR_CATALOG_V3R }
  from './sealed-holdout-catalog-v3r';
import {
  assertSealedHoldoutCohortManifestV3R,
  type SealedHoldoutCohortManifestV3R,
} from './sealed-holdout-cohort-v3r';
import {
  assertSealedHoldoutCohortManifestV3R2,
  type SealedHoldoutCohortManifestV3R2,
} from './sealed-holdout-cohort-v3r2';
import {
  assertBudgetedSealedHoldoutEpisodeReceiptV3R2,
  BUDGETED_SEALED_HOLDOUT_EPISODE_VERSION_V3R2,
  SEALED_HOLDOUT_EPISODE_VERSION_V3R,
  type BudgetedSealedHoldoutEpisodeReceiptV3R2,
} from './sealed-holdout-episode-v3r';
import { SEALED_HOLDOUT_EPISODE_VERSION_V3R2 }
  from './sealed-holdout-episode-v3r2';

type JsonRecord = Record<string, unknown>;

const SEALED_HOLDOUT_TRACE_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_SELECTED_OPERATION_TRACE_V2R_1' as const;
const BUDGETED_SEALED_HOLDOUT_TRACE_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_SELECTED_OPERATION_TRACE_V2R_2' as const;
const SEALED_HOLDOUT_TRACE_VERSION_V3R =
  'EDITRON_OE_SEALED_HOLDOUT_SELECTED_OPERATION_TRACE_V3R_1' as const;
const SEALED_HOLDOUT_TRACE_VERSION_V3R2 =
  'EDITRON_OE_SEALED_HOLDOUT_SELECTED_OPERATION_TRACE_V3R_2_H03_SOURCE' as const;
const BUDGETED_SEALED_HOLDOUT_TRACE_VERSION_V3R2 =
  'EDITRON_OE_SEALED_HOLDOUT_SELECTED_OPERATION_TRACE_V3R_2_RESOURCE_BOUND_1' as const;

export interface SealedHoldoutTraceNodeV2R {
  nodeId: string;
  turn: number;
  selectedOperatorId: string;
  operatorKind: string;
  normalizedArguments: Readonly<JsonRecord>;
  argumentReferenceBindings: readonly Readonly<JsonRecord>[];
  executionDisposition: string;
  executionEvidenceRefs: readonly string[];
  writerIssuedProjectRevision: string | null;
  researchCloneMutation: boolean;
  argumentSha256: string;
  outputSha256: string;
  generatedSourceBinding?: Readonly<JsonRecord>;
  nodeSha256: string;
}

export interface SealedHoldoutSelectedOperationTraceV2R {
  version: typeof SEALED_HOLDOUT_TRACE_VERSION_V2R;
  authority: 'LOSSLESS_MODEL_CALL_PROJECTION_NO_CREATIVE_LOWERING_NO_PROJECT_MUTATION';
  caseId: string;
  episodeId: string;
  contextSha256: string;
  providerEpisodeReceiptSha256: string;
  route: Readonly<JsonRecord>;
  terminalDisposition: string;
  nodes: readonly Readonly<SealedHoldoutTraceNodeV2R>[];
  researchCloneMutationCount: number;
  assessment: 'PASS' | 'FAIL';
  diagnostics: readonly string[];
  stateEffects: readonly [];
  traceSha256: string;
  artifactSha256: string;
}

export type SealedHoldoutSelectedOperationTraceV3R = Readonly<
  Omit<SealedHoldoutSelectedOperationTraceV2R, 'version'> & {
    version: typeof SEALED_HOLDOUT_TRACE_VERSION_V3R;
  }
>;

export type SealedHoldoutSelectedOperationTraceV3R2 = Readonly<
  Omit<SealedHoldoutSelectedOperationTraceV2R, 'version'> & {
    version: typeof SEALED_HOLDOUT_TRACE_VERSION_V3R2;
  }
>;

export type BudgetedSealedHoldoutSelectedOperationTraceV2R = Readonly<
  Omit<SealedHoldoutSelectedOperationTraceV2R,
  'version' | 'providerEpisodeReceiptSha256' | 'artifactSha256'> & {
    version: typeof BUDGETED_SEALED_HOLDOUT_TRACE_VERSION_V2R;
    budgetedEpisodeReceiptSha256: string;
    providerEpisodeReceiptSha256: string;
    runtimeBudgetReceiptSha256: string;
    runtimeBudgetAssessment: 'ACCOUNTED_WITHIN_BUDGET' | 'BUDGET_EXHAUSTED'
      | 'ACCOUNTING_UNVERIFIABLE';
    artifactSha256: string;
  }
>;

export type BudgetedSealedHoldoutSelectedOperationTraceV3R2 = Readonly<
  Omit<BudgetedSealedHoldoutSelectedOperationTraceV2R, 'version'> & {
    version: typeof BUDGETED_SEALED_HOLDOUT_TRACE_VERSION_V3R2;
  }
>;

export function buildSealedHoldoutSelectedOperationTraceV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: string;
  providerEpisode: Readonly<ProviderNativeEpisodeReceiptV2R>;
}): Readonly<SealedHoldoutSelectedOperationTraceV2R> {
  // Projection only: adding an operation here would create an undeclared planner
  // between the model episode and the hidden evaluator.
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const context = buildSealedHoldoutEpisodeContextV2R({ manifest, caseId: input.caseId });
  const { nodes, sortedDiagnostics } = projectProviderEpisode(
    input.providerEpisode,
    context,
    V2R_OPERATOR_CATALOG,
  );
  const traceSha256 = hashCanonicalJsonV1(nodes);
  const material = {
    version: SEALED_HOLDOUT_TRACE_VERSION_V2R,
    authority: 'LOSSLESS_MODEL_CALL_PROJECTION_NO_CREATIVE_LOWERING_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId,
    episodeId: input.providerEpisode.episodeId,
    contextSha256: input.providerEpisode.contextSha256,
    providerEpisodeReceiptSha256: input.providerEpisode.receiptSha256,
    route: input.providerEpisode.route as unknown as JsonRecord,
    terminalDisposition: input.providerEpisode.terminal.disposition,
    nodes,
    researchCloneMutationCount: nodes.filter(({ researchCloneMutation }) => researchCloneMutation).length,
    assessment: sortedDiagnostics.length ? 'FAIL' as const : 'PASS' as const,
    diagnostics: sortedDiagnostics,
    stateEffects: [] as const,
    traceSha256,
  };
  return deepFreezeV1({ ...material, artifactSha256: hashCanonicalJsonV1(material) });
}

export function buildSealedHoldoutSelectedOperationTraceV3R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R>;
  caseId: string;
  providerEpisode: Readonly<ProviderNativeEpisodeReceiptV2R>;
}): Readonly<SealedHoldoutSelectedOperationTraceV3R> {
  // V3 opts into corrected schemas/evidence while preserving the same lossless
  // projection owner. No operation may be added between the episode and trace.
  const manifest = assertSealedHoldoutCohortManifestV3R(input.manifest);
  const context = buildSealedHoldoutEpisodeContextFromManifestV2R({
    manifest,
    caseId: input.caseId,
    episodeVersion: SEALED_HOLDOUT_EPISODE_VERSION_V3R,
  });
  const { nodes, sortedDiagnostics } = projectProviderEpisode(
    input.providerEpisode,
    context,
    SEALED_HOLDOUT_OPERATOR_CATALOG_V3R,
  );
  const traceSha256 = hashCanonicalJsonV1(nodes);
  const material = {
    version: SEALED_HOLDOUT_TRACE_VERSION_V3R,
    authority: 'LOSSLESS_MODEL_CALL_PROJECTION_NO_CREATIVE_LOWERING_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId,
    episodeId: input.providerEpisode.episodeId,
    contextSha256: input.providerEpisode.contextSha256,
    providerEpisodeReceiptSha256: input.providerEpisode.receiptSha256,
    route: input.providerEpisode.route as unknown as JsonRecord,
    terminalDisposition: input.providerEpisode.terminal.disposition,
    nodes,
    researchCloneMutationCount: nodes.filter(({ researchCloneMutation }) => researchCloneMutation).length,
    assessment: sortedDiagnostics.length ? 'FAIL' as const : 'PASS' as const,
    diagnostics: sortedDiagnostics,
    stateEffects: [] as const,
    traceSha256,
  };
  return deepFreezeV1({ ...material, artifactSha256: hashCanonicalJsonV1(material) });
}

export function buildSealedHoldoutSelectedOperationTraceV3R2(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: string;
  providerEpisode: Readonly<ProviderNativeEpisodeReceiptV2R>;
}): Readonly<SealedHoldoutSelectedOperationTraceV3R2> {
  const manifest = assertSealedHoldoutCohortManifestV3R2(input.manifest);
  const context = buildSealedHoldoutEpisodeContextFromManifestV2R({
    manifest,
    caseId: input.caseId,
    episodeVersion: SEALED_HOLDOUT_EPISODE_VERSION_V3R2,
  });
  const { nodes, sortedDiagnostics } = projectProviderEpisode(
    input.providerEpisode,
    context,
    SEALED_HOLDOUT_OPERATOR_CATALOG_V3R,
    { includeGeneratedSourceBinding: true },
  );
  const traceSha256 = hashCanonicalJsonV1(nodes);
  const material = {
    version: SEALED_HOLDOUT_TRACE_VERSION_V3R2,
    authority: 'LOSSLESS_MODEL_CALL_PROJECTION_NO_CREATIVE_LOWERING_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId,
    episodeId: input.providerEpisode.episodeId,
    contextSha256: input.providerEpisode.contextSha256,
    providerEpisodeReceiptSha256: input.providerEpisode.receiptSha256,
    route: input.providerEpisode.route as unknown as JsonRecord,
    terminalDisposition: input.providerEpisode.terminal.disposition,
    nodes,
    researchCloneMutationCount: nodes.filter(({ researchCloneMutation }) => researchCloneMutation).length,
    assessment: sortedDiagnostics.length ? 'FAIL' as const : 'PASS' as const,
    diagnostics: sortedDiagnostics,
    stateEffects: [] as const,
    traceSha256,
  };
  return deepFreezeV1({ ...material, artifactSha256: hashCanonicalJsonV1(material) });
}

export function buildBudgetedSealedHoldoutSelectedOperationTraceV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: string;
  budgetedEpisode: Readonly<BudgetedSealedHoldoutEpisodeReceiptV2R>;
}): Readonly<BudgetedSealedHoldoutSelectedOperationTraceV2R> {
  // V2 binds the resource receipt and V2R-3 context without changing the
  // historical V1 projection or pretending a guard stop is an edit failure.
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const budgetedEpisode = assertBudgetedSealedHoldoutEpisodeReceiptV2R(
    input.budgetedEpisode,
  );
  if (budgetedEpisode.manifestSha256 !== manifest.manifestSha256
    || budgetedEpisode.caseId !== input.caseId) {
    fail('BUDGETED_TRACE_EPISODE_BINDING_INVALID');
  }
  const context = buildBudgetedSealedHoldoutEpisodeContextV2R({
    manifest,
    caseId: input.caseId,
  });
  const { nodes, sortedDiagnostics } = projectProviderEpisode(
    budgetedEpisode.providerEpisode,
    context,
    V2R_OPERATOR_CATALOG,
  );
  const traceSha256 = hashCanonicalJsonV1(nodes);
  const material = {
    version: BUDGETED_SEALED_HOLDOUT_TRACE_VERSION_V2R,
    authority: 'LOSSLESS_MODEL_CALL_PROJECTION_NO_CREATIVE_LOWERING_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId,
    episodeId: budgetedEpisode.providerEpisode.episodeId,
    contextSha256: budgetedEpisode.providerEpisode.contextSha256,
    budgetedEpisodeReceiptSha256: budgetedEpisode.receiptSha256,
    providerEpisodeReceiptSha256: budgetedEpisode.providerEpisode.receiptSha256,
    runtimeBudgetReceiptSha256: budgetedEpisode.runtimeBudget.receiptSha256,
    runtimeBudgetAssessment: budgetedEpisode.runtimeBudget.assessment,
    route: budgetedEpisode.providerEpisode.route as unknown as JsonRecord,
    terminalDisposition: budgetedEpisode.providerEpisode.terminal.disposition,
    nodes,
    researchCloneMutationCount: nodes.filter(({ researchCloneMutation }) => researchCloneMutation).length,
    assessment: sortedDiagnostics.length ? 'FAIL' as const : 'PASS' as const,
    diagnostics: sortedDiagnostics,
    stateEffects: [] as const,
    traceSha256,
  };
  return deepFreezeV1({ ...material, artifactSha256: hashCanonicalJsonV1(material) });
}

export function buildBudgetedSealedHoldoutSelectedOperationTraceV3R2(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: string;
  budgetedEpisode: Readonly<BudgetedSealedHoldoutEpisodeReceiptV3R2>;
}): Readonly<BudgetedSealedHoldoutSelectedOperationTraceV3R2> {
  const manifest = assertSealedHoldoutCohortManifestV3R2(input.manifest);
  const budgetedEpisode = assertBudgetedSealedHoldoutEpisodeReceiptV3R2(
    input.budgetedEpisode,
  );
  if (budgetedEpisode.manifestSha256 !== manifest.manifestSha256
    || budgetedEpisode.caseId !== input.caseId) {
    fail('BUDGETED_V3R2_TRACE_EPISODE_BINDING_INVALID');
  }
  const context = buildBudgetedSealedHoldoutEpisodeContextFromManifestV2R({
    manifest,
    caseId: input.caseId,
    episodeVersion: BUDGETED_SEALED_HOLDOUT_EPISODE_VERSION_V3R2,
  });
  const { nodes, sortedDiagnostics } = projectProviderEpisode(
    budgetedEpisode.providerEpisode,
    context,
    SEALED_HOLDOUT_OPERATOR_CATALOG_V3R,
    { includeGeneratedSourceBinding: true },
  );
  const traceSha256 = hashCanonicalJsonV1(nodes);
  const material = {
    version: BUDGETED_SEALED_HOLDOUT_TRACE_VERSION_V3R2,
    authority: 'LOSSLESS_MODEL_CALL_PROJECTION_NO_CREATIVE_LOWERING_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId,
    episodeId: budgetedEpisode.providerEpisode.episodeId,
    contextSha256: budgetedEpisode.providerEpisode.contextSha256,
    budgetedEpisodeReceiptSha256: budgetedEpisode.receiptSha256,
    providerEpisodeReceiptSha256: budgetedEpisode.providerEpisode.receiptSha256,
    runtimeBudgetReceiptSha256: budgetedEpisode.runtimeBudget.receiptSha256,
    runtimeBudgetAssessment: budgetedEpisode.runtimeBudget.assessment,
    route: budgetedEpisode.providerEpisode.route as unknown as JsonRecord,
    terminalDisposition: budgetedEpisode.providerEpisode.terminal.disposition,
    nodes,
    researchCloneMutationCount: nodes.filter(({ researchCloneMutation }) =>
      researchCloneMutation).length,
    assessment: sortedDiagnostics.length ? 'FAIL' as const : 'PASS' as const,
    diagnostics: sortedDiagnostics,
    stateEffects: [] as const,
    traceSha256,
  };
  return deepFreezeV1({ ...material, artifactSha256: hashCanonicalJsonV1(material) });
}

function projectProviderEpisode(
  providerEpisode: Readonly<ProviderNativeEpisodeReceiptV2R>,
  context: Readonly<JsonRecord>,
  operatorCatalog: Readonly<JsonRecord>,
  options?: Readonly<{ includeGeneratedSourceBinding: boolean }>,
): Readonly<{
  nodes: readonly Readonly<SealedHoldoutTraceNodeV2R>[];
  sortedDiagnostics: readonly string[];
}> {
  const diagnostics: string[] = [];
  if (providerEpisode.episodeId !== context.episodeId) diagnostics.push('TRACE_EPISODE_ID_DRIFT');
  if (providerEpisode.contextSha256 !== hashCanonicalJsonV1(context)) diagnostics.push('TRACE_CONTEXT_HASH_DRIFT');
  if (providerEpisode.stateEffects.length) diagnostics.push('TRACE_REAL_PROJECT_STATE_EFFECT_REPORTED');
  const operators = new Map(records(operatorCatalog.operators)
    .map((operator) => [text(operator.operatorId), operator]));
  const nodes = providerEpisode.turns.flatMap((turn, index) => {
    const execution = record(turn.execution);
    if (!Object.keys(execution).length) return [];
    const modelCall = record(turn.modelCall);
    const selectedOperatorId = text(modelCall.name);
    const operator = operators.get(selectedOperatorId);
    if (!operator || operator.compilerEligibility === 'NOT_COMPILABLE') {
      diagnostics.push(`TRACE_OPERATOR_FORBIDDEN:${selectedOperatorId || 'missing'}`);
      return [];
    }
    const output = record(execution.output);
    const receipt = record(output.receipt);
    const executionDisposition = text(execution.disposition);
    const operatorKind = text(operator.kind);
    const researchCloneMutation = executionDisposition === 'OK'
      && ['MUTATION', 'MUTATION_LEGACY'].includes(operatorKind);
    const writerIssuedProjectRevision = text(receipt.projectRevision) || null;
    if (researchCloneMutation && !writerIssuedProjectRevision) {
      diagnostics.push(`TRACE_WRITER_REVISION_MISSING:${selectedOperatorId}`);
    }
    if (options?.includeGeneratedSourceBinding
      && operatorKind === 'GENERATED_COMPOSITION'
      && containsRawGeneratedSource(output)) {
      diagnostics.push('TRACE_GENERATED_SOURCE_LEAKED_TO_PROVIDER_EPISODE');
    }
    const generatedSourceBinding = options?.includeGeneratedSourceBinding
      && operatorKind === 'GENERATED_COMPOSITION'
      && executionDisposition === 'OK'
      ? projectGeneratedSourceBinding(output)
      : null;
    if (options?.includeGeneratedSourceBinding
      && operatorKind === 'GENERATED_COMPOSITION'
      && executionDisposition === 'OK'
      && !generatedSourceBinding) {
      diagnostics.push('TRACE_GENERATED_SOURCE_BINDING_INCOMPLETE');
    }
    const nodeMaterial = {
      nodeId: `turn-${number(turn.turn) || index + 1}`,
      turn: number(turn.turn) || index + 1,
      selectedOperatorId,
      operatorKind,
      normalizedArguments: record(turn.normalizedArguments),
      argumentReferenceBindings: records(turn.argumentReferenceBindings),
      executionDisposition,
      executionEvidenceRefs: strings(execution.evidenceIds).sort(compareUtf16),
      writerIssuedProjectRevision,
      researchCloneMutation,
      argumentSha256: hashCanonicalJsonV1(record(turn.normalizedArguments)),
      outputSha256: hashCanonicalJsonV1(output),
      ...(generatedSourceBinding ? { generatedSourceBinding } : {}),
    };
    return [{ ...nodeMaterial, nodeSha256: hashCanonicalJsonV1(nodeMaterial) }];
  });
  if (!sameArray(nodes.map(({ selectedOperatorId }) => selectedOperatorId),
    providerEpisode.selectedOperatorIds)) {
    diagnostics.push('TRACE_SELECTED_OPERATOR_SEQUENCE_DRIFT');
  }
  const sortedDiagnostics = [...new Set(diagnostics)].sort(compareUtf16);
  return { nodes, sortedDiagnostics };
}

export function assertSealedHoldoutSelectedOperationTraceV2R(
  value: unknown,
): Readonly<SealedHoldoutSelectedOperationTraceV2R> {
  if (!isRecord(value)) fail('SEALED_TRACE_MISSING');
  const candidate = value as unknown as SealedHoldoutSelectedOperationTraceV2R;
  const { artifactSha256, ...material } = candidate;
  if (candidate.version !== SEALED_HOLDOUT_TRACE_VERSION_V2R
    || candidate.authority !== 'LOSSLESS_MODEL_CALL_PROJECTION_NO_CREATIVE_LOWERING_NO_PROJECT_MUTATION'
    || candidate.traceSha256 !== hashCanonicalJsonV1(candidate.nodes)
    || artifactSha256 !== hashCanonicalJsonV1(material)
    || candidate.stateEffects.length) fail('SEALED_TRACE_DRIFT');
  return deepFreezeV1(candidate);
}

export function assertSealedHoldoutSelectedOperationTraceV3R(
  value: unknown,
): Readonly<SealedHoldoutSelectedOperationTraceV3R> {
  if (!isRecord(value)) fail('SEALED_V3_TRACE_MISSING');
  const candidate = value as unknown as SealedHoldoutSelectedOperationTraceV3R;
  const { artifactSha256, ...material } = candidate;
  if (candidate.version !== SEALED_HOLDOUT_TRACE_VERSION_V3R
    || candidate.authority !== 'LOSSLESS_MODEL_CALL_PROJECTION_NO_CREATIVE_LOWERING_NO_PROJECT_MUTATION'
    || candidate.traceSha256 !== hashCanonicalJsonV1(candidate.nodes)
    || artifactSha256 !== hashCanonicalJsonV1(material)
    || candidate.stateEffects.length) fail('SEALED_V3_TRACE_DRIFT');
  return deepFreezeV1(candidate);
}

export function assertSealedHoldoutSelectedOperationTraceV3R2(
  value: unknown,
): Readonly<SealedHoldoutSelectedOperationTraceV3R2> {
  if (!isRecord(value)) fail('SEALED_V3R2_TRACE_MISSING');
  const candidate = value as unknown as SealedHoldoutSelectedOperationTraceV3R2;
  const { artifactSha256, ...material } = candidate;
  if (candidate.version !== SEALED_HOLDOUT_TRACE_VERSION_V3R2
    || candidate.authority !== 'LOSSLESS_MODEL_CALL_PROJECTION_NO_CREATIVE_LOWERING_NO_PROJECT_MUTATION'
    || candidate.traceSha256 !== hashCanonicalJsonV1(candidate.nodes)
    || artifactSha256 !== hashCanonicalJsonV1(material)
    || candidate.stateEffects.length) fail('SEALED_V3R2_TRACE_DRIFT');
  return deepFreezeV1(candidate);
}

export function assertBudgetedSealedHoldoutSelectedOperationTraceV2R(
  value: unknown,
): Readonly<BudgetedSealedHoldoutSelectedOperationTraceV2R> {
  if (!isRecord(value)) fail('BUDGETED_SEALED_TRACE_MISSING');
  const candidate = value as unknown as BudgetedSealedHoldoutSelectedOperationTraceV2R;
  const { artifactSha256, ...material } = candidate;
  if (candidate.version !== BUDGETED_SEALED_HOLDOUT_TRACE_VERSION_V2R
    || candidate.authority !== 'LOSSLESS_MODEL_CALL_PROJECTION_NO_CREATIVE_LOWERING_NO_PROJECT_MUTATION'
    || !['ACCOUNTED_WITHIN_BUDGET', 'BUDGET_EXHAUSTED', 'ACCOUNTING_UNVERIFIABLE']
      .includes(candidate.runtimeBudgetAssessment)
    || candidate.traceSha256 !== hashCanonicalJsonV1(candidate.nodes)
    || artifactSha256 !== hashCanonicalJsonV1(material)
    || candidate.stateEffects.length) fail('BUDGETED_SEALED_TRACE_DRIFT');
  return deepFreezeV1(candidate);
}

export function assertBudgetedSealedHoldoutSelectedOperationTraceV3R2(
  value: unknown,
): Readonly<BudgetedSealedHoldoutSelectedOperationTraceV3R2> {
  if (!isRecord(value)) fail('BUDGETED_SEALED_V3R2_TRACE_MISSING');
  const candidate = value as unknown as BudgetedSealedHoldoutSelectedOperationTraceV3R2;
  const { artifactSha256, ...material } = candidate;
  if (candidate.version !== BUDGETED_SEALED_HOLDOUT_TRACE_VERSION_V3R2
    || candidate.authority !== 'LOSSLESS_MODEL_CALL_PROJECTION_NO_CREATIVE_LOWERING_NO_PROJECT_MUTATION'
    || !['ACCOUNTED_WITHIN_BUDGET', 'BUDGET_EXHAUSTED', 'ACCOUNTING_UNVERIFIABLE']
      .includes(candidate.runtimeBudgetAssessment)
    || candidate.traceSha256 !== hashCanonicalJsonV1(candidate.nodes)
    || artifactSha256 !== hashCanonicalJsonV1(material)
    || candidate.stateEffects.length) fail('BUDGETED_SEALED_V3R2_TRACE_DRIFT');
  return deepFreezeV1(candidate);
}

function sameArray(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((entry, index) => entry === right[index]); }
function projectGeneratedSourceBinding(output: Readonly<JsonRecord>): Readonly<JsonRecord> | null {
  const code = record(output.codeBundle);
  const render = record(output.renderContract);
  const binding = {
    candidateOrdinal: code.candidateOrdinal,
    sourceContractStatus: code.status,
    programHash: code.programHash,
    sourceBundleHash: code.sourceBundleHash,
    modelId: code.modelId,
    promptHash: code.promptHash,
    orchestratorSpecSha256: code.orchestratorSpecSha256,
    ownerAuthorizationOutputSha256: code.ownerAuthorizationOutputSha256,
    generationReceiptSha256: code.generationReceiptSha256,
    renderStatus: render.status,
    projectMutation: render.projectMutation,
  };
  const stringsValid = Object.entries(binding)
    .filter(([key]) => key !== 'candidateOrdinal')
    .every(([, value]) => typeof value === 'string' && Boolean(value));
  return Number.isSafeInteger(binding.candidateOrdinal)
    && Number(binding.candidateOrdinal) >= 0
    && stringsValid
    ? binding
    : null;
}
function containsRawGeneratedSource(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsRawGeneratedSource);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => (
    ['source', 'sourceCode', 'tsx'].includes(key)
      && typeof child === 'string' && Boolean(child.trim())
  ) || containsRawGeneratedSource(child));
}
function fail(code: string): never { throw new Error(code); }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number { return typeof value === 'number' && Number.isSafeInteger(value) ? value : 0; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
