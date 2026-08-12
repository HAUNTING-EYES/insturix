import {
  OE1_CONDITION_IDS,
  cloneCanonicalJsonV1,
  deepFreezeV1,
  hashCanonicalJsonV1,
  type BenchmarkContractV1,
  type EvidenceBindingV1,
  type KnowledgeEntryV1,
  type MaterializedPlannerEnvelopeV1,
  type MaterializedPlannerPacketArtifactV1,
  type OperatorCatalogV1,
  type OperatorSpecV1,
  type PlannerConditionIdV1,
  type PlannerPacketV1,
  type PlannerTaskFixtureV1,
} from './contracts-v1';

export class PlannerPacketMaterializationErrorV1 extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PlannerPacketMaterializationErrorV1';
  }
}

export function materializePlannerPacketV1(input: {
  benchmarkContract: BenchmarkContractV1;
  task: PlannerTaskFixtureV1;
  conditionId: PlannerConditionIdV1;
  operatorCatalog: OperatorCatalogV1;
  knowledgeEntries: KnowledgeEntryV1[];
}): MaterializedPlannerPacketArtifactV1 {
  const { benchmarkContract, task, conditionId, operatorCatalog, knowledgeEntries } = input;
  if (!OE1_CONDITION_IDS.includes(conditionId)) {
    fail('UNKNOWN_CONDITION', `Unknown planner condition: ${conditionId}`);
  }
  validateTaskRevision(task);
  const operatorById = new Map(operatorCatalog.operators.map((operator) => [operator.operatorId, operator]));
  const primaryOperatorIds = unique(task.plannerEnvelope.allowedOperatorIds, 'primary allowed operator');
  const distractorIds = unique(task.eligibleDistractorIds, 'eligible distractor');
  const denied = new Set(task.plannerEnvelope.deniedOperatorIds);
  const visibleOperatorIds = unique([...primaryOperatorIds, ...distractorIds], 'visible operator');
  const visibleOperators = visibleOperatorIds.map((operatorId) => {
    const operator = operatorById.get(operatorId);
    if (!operator) fail('UNKNOWN_OPERATOR', `Operator ${operatorId} is absent from the frozen catalog`);
    if (operator.plannerEligibility === 'EXCLUDED_FROM_ENVELOPE') {
      fail('INELIGIBLE_OPERATOR', `Operator ${operatorId} is excluded from research envelopes`);
    }
    if (denied.has(operatorId)) {
      fail('DENIED_OPERATOR', `Operator ${operatorId} is both visible and denied`);
    }
    return cloneCanonicalJsonV1(operator);
  });
  const evidence = materializeEvidence(task, conditionId);
  const materializedPlannerEnvelope = buildEnvelope(task, visibleOperatorIds, evidence);
  const envelopeHash = hashCanonicalJsonV1(materializedPlannerEnvelope);
  const candidateGraphOutputContract = cloneCanonicalJsonV1(benchmarkContract.schemas.candidateGraphV1);
  const packet: PlannerPacketV1 = {
    packetVersion: 'OE1_PLANNER_PACKET_V1',
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
    benchmarkContractVersion: benchmarkContract.plannerPacketContractVersion,
    taskId: task.taskId,
    taskVersion: task.version,
    conditionId,
    envelopeHash,
    operatorCatalogVersion: operatorCatalog.version,
    knowledgeEntryVersions: [],
    candidateGraphSchemaHash: hashCanonicalJsonV1(candidateGraphOutputContract),
    behaviourBrief: cloneCanonicalJsonV1(task.behaviourBrief),
    materializedPlannerEnvelope,
    candidateGraphOutputContract,
  };
  addConditionPayload(packet, conditionId, visibleOperators, primaryOperatorIds, knowledgeEntries, benchmarkContract);
  const artifact = {
    packet,
    packetHash: hashCanonicalJsonV1(packet),
  };
  return deepFreezeV1(artifact) as MaterializedPlannerPacketArtifactV1;
}

function addConditionPayload(
  packet: PlannerPacketV1,
  conditionId: PlannerConditionIdV1,
  visibleOperators: OperatorSpecV1[],
  primaryOperatorIds: string[],
  knowledgeEntries: KnowledgeEntryV1[],
  benchmarkContract: BenchmarkContractV1,
): void {
  if (conditionId === 'C0_SIGNATURES_ONLY') {
    packet.operatorNamesAndPorts = visibleOperators.map((operator) => ({
      operatorId: operator.operatorId,
      version: operator.version,
      kind: operator.kind,
      inputPorts: cloneCanonicalJsonV1(operator.inputPorts),
      outputPorts: cloneCanonicalJsonV1(operator.outputPorts),
    }));
    return;
  }
  packet.fullAllowedOperatorSpecs = visibleOperators;
  if (conditionId === 'C2_REVIEWED_KNOWLEDGE') {
    const selected = selectReviewedKnowledgeV1(
      knowledgeEntries,
      primaryOperatorIds,
      benchmarkContract.knowledgeSelectionContract.maximumEntries,
    );
    if (selected.length === 0) {
      fail('KNOWLEDGE_SELECTION_EMPTY', 'C2 requires at least one relevant reviewed knowledge entry');
    }
    packet.relevantReviewedKnowledgeEntries = selected;
    packet.knowledgeEntryVersions = selected.map(({ entryId, version }) => ({ entryId, version }));
  }
  if (conditionId === 'C3_UNRELATED_FORMAT_EXAMPLE') {
    packet.oneUnrelatedGraphForOutputFormatting = cloneCanonicalJsonV1(
      benchmarkContract.unrelatedFormatExample,
    );
  }
}

export function selectReviewedKnowledgeV1(
  knowledgeEntries: KnowledgeEntryV1[],
  primaryOperatorIds: string[],
  maximumEntries: number,
): KnowledgeEntryV1[] {
  const primary = new Set(primaryOperatorIds);
  return knowledgeEntries
    .map((entry) => ({
      entry,
      overlap: entry.applicableOperatorIds.filter((operatorId) => primary.has(operatorId)).length,
    }))
    .filter(({ entry, overlap }) =>
      overlap > 0
      && entry.authority === 'EVIDENCE_ONLY'
      && entry.reviewStatus === 'REVIEWED_FOR_SYNTHETIC_BENCHMARK_V1')
    .sort((left, right) =>
      right.overlap - left.overlap
      || compareUtf16(left.entry.entryId, right.entry.entryId))
    .slice(0, maximumEntries)
    .map(({ entry }) => cloneCanonicalJsonV1(entry));
}

function materializeEvidence(
  task: PlannerTaskFixtureV1,
  conditionId: PlannerConditionIdV1,
): { bindings: EvidenceBindingV1[]; missingIds: string[] } {
  const sourceById = new Map<string, EvidenceBindingV1>();
  for (const evidence of task.evidence) {
    if (sourceById.has(evidence.evidenceId)) {
      fail('DUPLICATE_EVIDENCE', `Evidence ${evidence.evidenceId} is duplicated`);
    }
    sourceById.set(evidence.evidenceId, evidence);
  }
  const variant = task.conditionEvidence.C4_NOISY_OR_MISSING_EVIDENCE;
  const omitted = conditionId === 'C4_NOISY_OR_MISSING_EVIDENCE'
    ? new Set(unique(variant.omitEvidenceIds, 'omitted evidence'))
    : new Set<string>();
  const replacements = new Map<string, EvidenceBindingV1>();
  if (conditionId === 'C4_NOISY_OR_MISSING_EVIDENCE') {
    for (const replacement of variant.replaceEvidence) {
      if (replacements.has(replacement.evidenceId)) {
        fail('DUPLICATE_REPLACEMENT', `Replacement ${replacement.evidenceId} is duplicated`);
      }
      if (omitted.has(replacement.evidenceId)) {
        fail('CONTRADICTORY_EVIDENCE_VARIANT', `Evidence ${replacement.evidenceId} is omitted and replaced`);
      }
      replacements.set(replacement.evidenceId, replacement);
    }
  }
  const bindings: EvidenceBindingV1[] = [];
  const missingIds: string[] = [];
  for (const evidenceId of unique(task.plannerEnvelope.boundEvidenceIds, 'bound evidence')) {
    const source = sourceById.get(evidenceId);
    if (!source) fail('BOUND_EVIDENCE_MISSING', `Bound evidence ${evidenceId} has no source record`);
    if (omitted.has(evidenceId)) {
      missingIds.push(evidenceId);
      continue;
    }
    bindings.push(cloneCanonicalJsonV1(replacements.get(evidenceId) ?? source));
  }
  for (const evidenceId of [...omitted, ...replacements.keys()]) {
    if (!task.plannerEnvelope.boundEvidenceIds.includes(evidenceId)) {
      fail('VARIANT_EVIDENCE_UNBOUND', `C4 variant evidence ${evidenceId} is not envelope-bound`);
    }
  }
  return { bindings, missingIds };
}

function buildEnvelope(
  task: PlannerTaskFixtureV1,
  allowedOperatorIds: string[],
  evidence: { bindings: EvidenceBindingV1[]; missingIds: string[] },
): MaterializedPlannerEnvelopeV1 {
  const source = task.plannerEnvelope;
  if (source.networkPolicy !== 'DENY') fail('NETWORK_POLICY_INVALID', 'OE-1 benchmark networkPolicy must be DENY');
  const boundEvidenceIds = evidence.bindings.map(({ evidenceId }) => evidenceId);
  return cloneCanonicalJsonV1({
    projectId: source.projectId,
    projectRevision: source.projectRevision,
    actorScope: source.actorScope,
    tenantScope: source.tenantScope,
    allowedOperatorIds,
    deniedOperatorIds: source.deniedOperatorIds,
    boundEvidenceIds,
    rightsPolicy: source.rightsPolicy,
    privacyPolicy: source.privacyPolicy,
    networkPolicy: source.networkPolicy,
    resourceBudget: source.resourceBudget,
    preservationPredicates: source.preservationPredicates,
    expiresAt: source.expiresAt,
    projectFacts: task.project,
    evidenceBindings: evidence.bindings,
    missingEvidenceIds: evidence.missingIds,
  });
}

function validateTaskRevision(task: PlannerTaskFixtureV1): void {
  const { project, plannerEnvelope: envelope, revisionScenario } = task;
  if (project.projectId !== envelope.projectId) fail('PROJECT_SCOPE_MISMATCH', 'Project and envelope IDs differ');
  if (project.projectRevision === envelope.projectRevision) return;
  if (
    revisionScenario?.type !== 'INTENTIONALLY_STALE'
    || revisionScenario.currentProjectRevision !== project.projectRevision
    || revisionScenario.plannerEnvelopeRevision !== envelope.projectRevision
    || revisionScenario.requiredDisposition !== 'REPLAN_WITH_ZERO_MUTATION'
  ) {
    fail('UNDECLARED_STALE_REVISION', 'Project and envelope revisions differ without the frozen stale declaration');
  }
}

function unique(values: string[], label: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || seen.has(value)) {
      if (seen.has(value)) continue;
      fail('EMPTY_IDENTIFIER', `${label} contains an empty identifier`);
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code: string, message: string): never {
  throw new PlannerPacketMaterializationErrorV1(code, message);
}
