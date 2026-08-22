import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { validateSelectedOperatorNodesV2R } from './stage2-selected-operator-contract-v2r';
import {
  STAGE25_ROUTE_ABLATION_VERSION_V1,
  stage25RouteAblationTargetClaimIdsV1,
  type Stage25RouteAblationArmV1,
  type Stage25RouteAblationPacketV1,
  type Stage25RouteAblationScopeIdV1,
} from './stage25-route-ablation-v1';
import { validateProviderStageArtifactV2 } from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;
type ExecutionForm = 'NATIVE' | 'GENERATED_COMPOSITION' | 'HYBRID';

export const STAGE25_ROUTE_ABLATION_EVALUATOR_VERSION_V1 =
  'EDITRON_OE_STAGE25_ROUTE_ABLATION_EVALUATOR_V1_1' as const;

export interface Stage25RouteAblationEvaluationV1 {
  disposition: 'PASS' | 'HONEST_CAPABILITY_GAP' | 'FAIL' | 'UNVERIFIABLE';
  observedExecutionForm: string | null;
  routeClassification: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  claimCoverage: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  operatorSelection: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  capabilityHonesty: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  diagnostics: readonly string[];
}

// This gold is evaluator-only. The provider packet module deliberately does not
// import this file, preventing a free-choice answer from leaking into model input.
const FREE_CHOICE_GOLD: Readonly<Record<Stage25RouteAblationScopeIdV1, ExecutionForm>> =
  deepFreezeV1({
    DEV02_BOUNDED_FILMSTRIP_ISLAND: 'GENERATED_COMPOSITION',
    DEV02_FULL_REQUESTED_SECTION: 'HYBRID',
  });

export function buildStage25RouteAblationEvaluatorFreezeV1(): Readonly<{
  version: typeof STAGE25_ROUTE_ABLATION_EVALUATOR_VERSION_V1;
  authority: 'HIDDEN_EVALUATOR_ONLY_NEVER_PROVIDER_INPUT';
  freeChoiceGold: Readonly<Record<Stage25RouteAblationScopeIdV1, ExecutionForm>>;
  policySha256: string;
}> {
  const material = {
    version: STAGE25_ROUTE_ABLATION_EVALUATOR_VERSION_V1,
    authority: 'HIDDEN_EVALUATOR_ONLY_NEVER_PROVIDER_INPUT' as const,
    freeChoiceGold: FREE_CHOICE_GOLD,
  };
  return deepFreezeV1({ ...material, policySha256: hashCanonicalJsonV1(material) });
}

export function evaluateStage25RouteAblationArtifactV1(input: {
  row: Readonly<Stage25RouteAblationPacketV1>;
  artifact: unknown;
}): Readonly<Stage25RouteAblationEvaluationV1> {
  const artifact = record(input.artifact);
  if (!Object.keys(artifact).length) return unverifiable('NO_ACCEPTED_ARTIFACT');
  const packetDiagnostics = validateProviderStageArtifactV2(input.row.artifact, artifact);
  if (packetDiagnostics.length) {
    return failure(null, packetDiagnostics.map((diagnostic) => `SCHEMA:${diagnostic}`));
  }
  const scopeContract = record(input.row.artifact.packet.modelInput.routeAblationScope);
  if (scopeContract.contractVersion !== STAGE25_ROUTE_ABLATION_VERSION_V1
    || scopeContract.scopeId !== input.row.scopeId
    || scopeContract.arm !== input.row.arm) {
    return failure(text(artifact.executionForm), ['ROUTE_ABLATION_SCOPE_BINDING_DRIFT']);
  }

  const executionForm = text(artifact.executionForm);
  const targetClaimIds = stage25RouteAblationTargetClaimIdsV1(input.row.scopeId);
  const hardClaimIds = targetClaimIds.filter((claimId) => claimId.startsWith('claim-user-'));
  const nodes = records(artifact.nodes);
  const catalogOperators = records(record(input.row.artifact.packet.modelInput.operatorCatalog).operators);
  const catalogIds = new Set(catalogOperators.map((operator) => text(operator.operatorId)));
  const selectionDiagnostics = [...validateSelectedOperatorNodesV2R(nodes, catalogIds)];
  const graphDiagnostics = graphShapeDiagnostics(nodes);
  const shortcutDiagnostics = operationCountShortcutDiagnostics(artifact);
  const routeDiagnostics = executionFormDiagnostics(
    input.row.arm, input.row.scopeId, executionForm, nodes, catalogOperators,
  );
  const capabilityDiagnostics = capabilityHonestyDiagnostics(
    artifact, input.row.artifact.packet.modelInput.capabilityDossier,
  );
  const coverageDiagnostics = claimCoverageDiagnostics(
    artifact, executionForm, targetClaimIds, hardClaimIds, catalogIds,
  );
  const isGap = executionForm === 'CAPABILITY_GAP';
  const gapDiagnostics = isGap ? capabilityGapDiagnostics(artifact) : [];
  const diagnostics = [
    ...selectionDiagnostics,
    ...graphDiagnostics,
    ...shortcutDiagnostics,
    ...routeDiagnostics,
    ...capabilityDiagnostics,
    ...(isGap ? gapDiagnostics : coverageDiagnostics),
  ];
  const routeClassification = routeDiagnostics.length ? 'FAIL' : 'PASS';
  const claimCoverage = isGap ? 'UNVERIFIABLE' : coverageDiagnostics.length ? 'FAIL' : 'PASS';
  const operatorSelection = selectionDiagnostics.length || graphDiagnostics.length ? 'FAIL' : 'PASS';
  const capabilityHonesty = capabilityDiagnostics.length || gapDiagnostics.length ? 'FAIL' : 'PASS';
  const disposition = diagnostics.length ? 'FAIL' : isGap ? 'HONEST_CAPABILITY_GAP' : 'PASS';
  return deepFreezeV1({
    disposition,
    observedExecutionForm: executionForm,
    routeClassification,
    claimCoverage,
    operatorSelection,
    capabilityHonesty,
    diagnostics,
  });
}

function executionFormDiagnostics(
  arm: Stage25RouteAblationArmV1,
  scopeId: Stage25RouteAblationScopeIdV1,
  observed: string,
  nodes: JsonRecord[],
  catalogOperators: JsonRecord[],
): string[] {
  if (observed === 'CAPABILITY_GAP') return [];
  const expected = arm === 'FREE_CHOICE'
    ? FREE_CHOICE_GOLD[scopeId]
    : arm === 'FORCED_NATIVE' ? 'NATIVE'
    : arm === 'FORCED_GENERATED_COMPOSITION' ? 'GENERATED_COMPOSITION'
    : 'HYBRID';
  const diagnostics = observed === expected ? [] : [`EXECUTION_FORM_MISMATCH:${expected}:${observed}`];
  const kinds = new Map(catalogOperators.map((operator) => [text(operator.operatorId), text(operator.kind)]));
  const selected = nodes.filter((node) => typeof node.selectedOperatorId === 'string');
  const hasGenerated = selected.some((node) => node.selectedOperatorId === 'generated_composition_program');
  const hasNativeCreativeMutation = selected.some((node) => kinds.get(text(node.selectedOperatorId)) === 'MUTATION');
  const hasNativeSurround = selected.some((node) => node.executionForm === 'NATIVE');
  if (observed === 'NATIVE' && hasGenerated) diagnostics.push('NATIVE_ROUTE_CONTAINS_GENERATED_OWNER');
  if (observed === 'GENERATED_COMPOSITION' && (!hasGenerated || hasNativeCreativeMutation)) {
    diagnostics.push('GENERATED_ROUTE_FORM_INCONSISTENT');
  }
  if (observed === 'HYBRID' && (!hasGenerated || !hasNativeSurround)) {
    diagnostics.push('HYBRID_ROUTE_MISSING_GENERATED_OR_NATIVE_SIDE');
  }
  return diagnostics;
}

function claimCoverageDiagnostics(
  artifact: JsonRecord,
  executionForm: string,
  targetClaimIds: readonly string[],
  hardClaimIds: readonly string[],
  catalogIds: ReadonlySet<string>,
): string[] {
  const routeDecision = record(artifact.routeDecision);
  const candidate = records(routeDecision.candidateForms).find((entry) => entry.form === executionForm);
  if (!candidate) return ['ROUTE_CANDIDATE_MISSING'];
  const coverage = records(candidate.claimCoverage);
  const coverageByClaim = new Map(coverage.map((entry) => [text(entry.claimId), entry]));
  const diagnostics: string[] = [];
  for (const claimId of targetClaimIds) {
    const entry = coverageByClaim.get(claimId);
    if (!entry) diagnostics.push(`CLAIM_COVERAGE_MISSING:${claimId}`);
    for (const ownerRef of strings(entry?.ownerRefs)) {
      if (!catalogIds.has(ownerRef)) diagnostics.push(`CLAIM_OWNER_UNKNOWN:${claimId}:${ownerRef}`);
    }
  }
  const graphClaims = new Set(records(artifact.nodes).flatMap((node) => strings(node.targetClaimIds)));
  for (const claimId of hardClaimIds) {
    const coverageEntry = coverageByClaim.get(claimId);
    if (coverageEntry?.status !== 'COVERED') diagnostics.push(`HARD_CLAIM_NOT_COVERED:${claimId}`);
    if (!graphClaims.has(claimId)) diagnostics.push(`HARD_CLAIM_NOT_IN_GRAPH:${claimId}`);
  }
  return diagnostics;
}

function capabilityHonestyDiagnostics(artifact: JsonRecord, dossierValue: unknown): string[] {
  const routeDecision = record(artifact.routeDecision);
  const observed = text(artifact.executionForm);
  const candidate = records(routeDecision.candidateForms).find((entry) => entry.form === observed);
  if (!candidate || observed === 'CAPABILITY_GAP') return [];
  const cards = new Map(records(record(dossierValue).operators)
    .map((operator) => [text(operator.operatorId), operator]));
  const selectedIds = records(artifact.nodes)
    .map((node) => text(node.selectedOperatorId)).filter(Boolean);
  const hasUncertifiedSelection = selectedIds.some((operatorId) => {
    const availability = record(cards.get(operatorId)?.availability);
    return text(availability.certificationStatus) !== 'CERTIFIED';
  });
  return hasUncertifiedSelection && candidate.hardGateStatus === 'ELIGIBLE'
    ? ['UNCERTIFIED_ROUTE_FALSELY_MARKED_ELIGIBLE']
    : [];
}

function capabilityGapDiagnostics(artifact: JsonRecord): string[] {
  const hasGapNode = records(artifact.nodes).some((node) => node.selectedOperatorId === null
    && node.failureDisposition === 'CAPABILITY_GAP');
  const hasGapRequirement = records(artifact.unresolvedRequirements)
    .some((requirement) => requirement.disposition === 'CAPABILITY_GAP');
  return hasGapNode && hasGapRequirement ? [] : ['CAPABILITY_GAP_NOT_STRUCTURED'];
}

function graphShapeDiagnostics(nodes: JsonRecord[]): string[] {
  const ids = nodes.map((node) => text(node.intentNodeId));
  const known = new Set(ids);
  const diagnostics = ids.length === known.size ? [] : ['INTENT_NODE_ID_DUPLICATE'];
  for (const node of nodes) {
    for (const dependency of strings(node.requiresNodeIds)) {
      if (!known.has(dependency)) diagnostics.push(`DEPENDENCY_NODE_MISSING:${text(node.intentNodeId)}:${dependency}`);
    }
  }
  return diagnostics;
}

function operationCountShortcutDiagnostics(artifact: JsonRecord): string[] {
  const routeDecision = record(artifact.routeDecision);
  const material = [
    ...strings(routeDecision.selectedReasonCodes),
    ...records(routeDecision.candidateForms).flatMap((candidate) => [
      ...strings(candidate.blockers),
      ...records(candidate.claimCoverage).flatMap((coverage) => strings(coverage.reasonCodes)),
    ]),
  ].join(' ');
  return /(STEP|NODE|OPERATION)_COUNT|MORE_THAN_[A-Z0-9_]*STEPS|THRESHOLD_N/i.test(material)
    ? ['OPERATION_COUNT_ROUTING_SHORTCUT']
    : [];
}

function failure(
  observedExecutionForm: string | null,
  diagnostics: readonly string[],
): Readonly<Stage25RouteAblationEvaluationV1> {
  return deepFreezeV1({
    disposition: 'FAIL', observedExecutionForm, routeClassification: 'FAIL',
    claimCoverage: 'UNVERIFIABLE', operatorSelection: 'UNVERIFIABLE',
    capabilityHonesty: 'UNVERIFIABLE', diagnostics,
  });
}

function unverifiable(diagnostic: string): Readonly<Stage25RouteAblationEvaluationV1> {
  return deepFreezeV1({
    disposition: 'UNVERIFIABLE', observedExecutionForm: null, routeClassification: 'UNVERIFIABLE',
    claimCoverage: 'UNVERIFIABLE', operatorSelection: 'UNVERIFIABLE',
    capabilityHonesty: 'UNVERIFIABLE', diagnostics: [diagnostic],
  });
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
