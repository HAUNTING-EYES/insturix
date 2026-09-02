import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from '../../services/canonical-json-v1';
import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildNoSpendSentinelClaimSetV1,
  type NoSpendAttemptAwareResultAxesV1,
  type NoSpendSentinelClaimInputV1,
} from './no-spend-readiness-policy-v1';
import type { ProviderNativeRouteV2R }
  from './provider-native-tool-codecs-v2r';
import {
  compileStage25LongFormPlanProposalV2,
  STAGE25_LONG_FORM_PLAN_COMPILER_VERSION_V2,
} from './stage25-long-form-plan-compiler-v2';
import {
  buildStage25LongFormPlanHoldoutContextV2,
  createStage25LongFormPlanProposalV2,
  STAGE25_LONG_FORM_PLAN_PROPOSAL_VERSION_V2,
  type Stage25LongFormPlanContextV2,
  type Stage25LongFormPlanProposalV2,
} from './stage25-long-form-plan-holdout-v2';
import {
  evaluateStage25LongFormProviderEpisodeV2,
  STAGE25_LONG_FORM_PROVIDER_EVALUATOR_VERSION_V2,
} from './stage25-long-form-plan-provider-evaluator-v2';
import { runStage25LongFormProviderEpisodeV2 }
  from './stage25-long-form-plan-provider-protocol-v2';

type JsonRecord = Record<string, unknown>;
type ProposalMaterial = Omit<Stage25LongFormPlanProposalV2, 'proposalSha256'>;

export const STAGE25_LONG_FORM_SENTINEL_RUNNER_VERSION_V3 =
  'EDITRON_STAGE25_LONG_FORM_SENTINEL_RUNNER_V3_1' as const;
export const STAGE25_LONG_FORM_SENTINEL_RECEIPT_VERSION_V3 =
  'EDITRON_STAGE25_LONG_FORM_SENTINEL_RECEIPT_V3_1' as const;

export interface Stage25LongFormSentinelResultV3 {
  sentinelId: string;
  fixtureSha256: string;
  transformationSha256: string | null;
  evaluatorResultSha256: string;
  axes: Readonly<NoSpendAttemptAwareResultAxesV1>;
  observation: Readonly<JsonRecord>;
}

export interface Stage25LongFormSentinelReceiptV3 {
  version: typeof STAGE25_LONG_FORM_SENTINEL_RECEIPT_VERSION_V3;
  authority: 'INDEPENDENT_ZERO_INFERENCE_LONG_FORM_COMPILER_EVALUATOR_RECOMPUTATION';
  lane: 'STAGE25_LONG_FORM_PROVIDER_V3';
  runnerVersion: typeof STAGE25_LONG_FORM_SENTINEL_RUNNER_VERSION_V3;
  compilerVersion: typeof STAGE25_LONG_FORM_PLAN_COMPILER_VERSION_V2;
  evaluatorVersion: typeof STAGE25_LONG_FORM_PROVIDER_EVALUATOR_VERSION_V2;
  contextSha256: string;
  sentinels: readonly Readonly<Stage25LongFormSentinelResultV3>[];
  claimSetSha256: string;
  expectationValidationSha256: string;
  scriptedProviderInvocations: 1;
  providerInferenceCalls: 0;
  networkCalls: 0;
  canonicalProjectReads: 0;
  canonicalProjectMutations: 0;
  stateEffects: readonly [];
  assessment: 'PASS_ALL_REQUIRED_LONG_FORM_SENTINELS_RECOMPUTED';
  receiptSha256: string;
}

export async function recomputeStage25LongFormSentinelsV3(): Promise<
Readonly<Stage25LongFormSentinelReceiptV3>> {
  const context = buildStage25LongFormPlanHoldoutContextV2();
  const omitted = compileProposal(goldProposalMaterial(), context);
  const explicitMaterial = goldProposalMaterial();
  proposalNode(explicitMaterial, 'seq-keynote-proof').semanticScopeIds = ['keynote'];
  const explicit = compileProposal(explicitMaterial, context);
  const omittedObservation = scopeObservation(omitted, 'seq-keynote-proof');
  const explicitObservation = scopeObservation(explicit, 'seq-keynote-proof');
  if (omitted.plan.revisionSha256 !== explicit.plan.revisionSha256
    || hashCanonicalJsonV1(record(omittedObservation).effectiveSemanticScopeIds)
      !== hashCanonicalJsonV1(record(explicitObservation).effectiveSemanticScopeIds)
    || hashCanonicalJsonV1(record(omittedObservation).requiredEvidenceRequirementIds)
      !== hashCanonicalJsonV1(record(explicitObservation).requiredEvidenceRequirementIds)) {
    fail('OMITTED_EXPLICIT_SCOPE_NOT_EQUIVALENT');
  }

  const unknownFixture = goldProposalMaterial();
  proposalNode(unknownFixture, 'seq-keynote-open').rangeCandidateIds = ['range-forged'];
  const unknownRejection = captureCompilerRejection(context, unknownFixture);
  if (unknownRejection
    !== 'STAGE25_LONG_FORM_PLAN_RANGE_CANDIDATE_UNKNOWN:range-forged') {
    fail('UNKNOWN_SCOPE_NOT_REJECTED');
  }

  const falseReadyContext = mutableContext(context);
  falseReadyContext.evidenceRequirements.find(({ id }) =>
    id === 'ev-keynote-transcript')!.status = 'MISSING';
  const falseReadyProposal = goldProposalMaterial();
  proposalNode(falseReadyProposal, 'seq-keynote-open').status = 'NEEDS_EVIDENCE';
  const falseReadyRejection = captureCompilerRejection(
    rehashContext(falseReadyContext),
    falseReadyProposal,
  );
  if (falseReadyRejection
    !== 'STAGE25_LONG_FORM_PLAN_LOCAL_READY_EVIDENCE_UNRESOLVED:'
      + 'seq-keynote-proof:ev-keynote-transcript') {
    fail('FALSE_READY_NOT_REJECTED');
  }

  const structuralEvaluation = await structuralOnlyEvaluation(goldProposalMaterial());
  if (structuralEvaluation.structuralDisposition !== 'PASS_STRUCTURAL_ONLY'
    || structuralEvaluation.assessmentScope !== 'STRUCTURE_AND_PROVENANCE_ONLY'
    || record(structuralEvaluation.qualityJudgments).editorialTaste !== 'UNVERIFIABLE'
    || record(structuralEvaluation.qualityJudgments).rangeSemanticAccuracy !== 'UNVERIFIABLE'
    || record(structuralEvaluation.qualityJudgments).renderedAudiovisualQuality
      !== 'UNVERIFIABLE') {
    fail('STRUCTURAL_PROOF_CEILING_VIOLATED');
  }

  const sentinels = [
    result(
      'LF_RANGE_SCOPE_OMITTED_DERIVED_ACCEPT',
      { proposal: goldProposalMaterial(), contextSha256: context.contextSha256 },
      {
        ...omittedObservation,
        equivalentExplicitPlanRevisionSha256: explicit.plan.revisionSha256,
      },
      passStructuralAxes(),
      {
        operation: 'OMIT_RANGE_OWNED_SEMANTIC_SCOPE',
        comparison: 'COMPILED_PLAN_AND_DERIVED_EVIDENCE_EQUIVALENT',
      },
    ),
    result(
      'LF_RANGE_SCOPE_EXPLICIT_EQUIVALENT_ACCEPT',
      { proposal: explicitMaterial, contextSha256: context.contextSha256 },
      explicitObservation,
      passStructuralAxes(),
    ),
    result(
      'LF_RANGE_SCOPE_UNKNOWN_REJECT',
      { proposal: unknownFixture, contextSha256: context.contextSha256 },
      { rejection: unknownRejection },
      failControlAxes(),
    ),
    result(
      'LF_FALSE_READY_UNRESOLVED_EVIDENCE_REJECT',
      {
        proposal: falseReadyProposal,
        contextSha256: rehashContext(falseReadyContext).contextSha256,
      },
      { rejection: falseReadyRejection, evidenceStatus: 'MISSING' },
      failControlAxes(),
    ),
    result(
      'LF_STRUCTURAL_PASS_NOT_PRODUCT_PROOF',
      {
        proposal: goldProposalMaterial(),
        providerTransport: 'SCRIPTED_ZERO_INFERENCE',
      },
      {
        structuralDisposition: structuralEvaluation.structuralDisposition,
        assessmentScope: structuralEvaluation.assessmentScope,
        qualityJudgments: structuralEvaluation.qualityJudgments,
        stateEffects: structuralEvaluation.stateEffects,
      },
      passStructuralAxes(),
    ),
  ];
  const claims = sentinels.map(toClaim);
  const expectationValidation = buildNoSpendSentinelClaimSetV1(
    'STAGE25_LONG_FORM_PROVIDER_V3', claims,
  );
  const material = {
    version: STAGE25_LONG_FORM_SENTINEL_RECEIPT_VERSION_V3,
    authority:
      'INDEPENDENT_ZERO_INFERENCE_LONG_FORM_COMPILER_EVALUATOR_RECOMPUTATION' as const,
    lane: 'STAGE25_LONG_FORM_PROVIDER_V3' as const,
    runnerVersion: STAGE25_LONG_FORM_SENTINEL_RUNNER_VERSION_V3,
    compilerVersion: STAGE25_LONG_FORM_PLAN_COMPILER_VERSION_V2,
    evaluatorVersion: STAGE25_LONG_FORM_PROVIDER_EVALUATOR_VERSION_V2,
    contextSha256: context.contextSha256,
    sentinels,
    claimSetSha256: hashCanonicalJsonV1(claims),
    expectationValidationSha256: expectationValidation.claimSetSha256,
    scriptedProviderInvocations: 1 as const,
    providerInferenceCalls: 0 as const,
    networkCalls: 0 as const,
    canonicalProjectReads: 0 as const,
    canonicalProjectMutations: 0 as const,
    stateEffects: [] as const,
    assessment: 'PASS_ALL_REQUIRED_LONG_FORM_SENTINELS_RECOMPUTED' as const,
  };
  return deepFreezeEditronJsonV1({
    ...material, receiptSha256: hashCanonicalJsonV1(material),
  }) as Readonly<Stage25LongFormSentinelReceiptV3>;
}

export function assertStage25LongFormSentinelReceiptV3(
  value: unknown,
): Readonly<Stage25LongFormSentinelReceiptV3> {
  if (!isRecord(value) || !Array.isArray(value.sentinels)) fail('RECEIPT_MISSING');
  const candidate = value as unknown as Stage25LongFormSentinelReceiptV3;
  const claims = candidate.sentinels.map(toClaim);
  const expectationValidation = buildNoSpendSentinelClaimSetV1(
    'STAGE25_LONG_FORM_PROVIDER_V3', claims,
  );
  const { receiptSha256, ...material } = candidate;
  if (candidate.version !== STAGE25_LONG_FORM_SENTINEL_RECEIPT_VERSION_V3
    || candidate.authority
      !== 'INDEPENDENT_ZERO_INFERENCE_LONG_FORM_COMPILER_EVALUATOR_RECOMPUTATION'
    || candidate.lane !== 'STAGE25_LONG_FORM_PROVIDER_V3'
    || candidate.runnerVersion !== STAGE25_LONG_FORM_SENTINEL_RUNNER_VERSION_V3
    || candidate.compilerVersion !== STAGE25_LONG_FORM_PLAN_COMPILER_VERSION_V2
    || candidate.evaluatorVersion !== STAGE25_LONG_FORM_PROVIDER_EVALUATOR_VERSION_V2
    || !/^[a-f0-9]{64}$/.test(candidate.contextSha256)
    || candidate.sentinels.length !== 5
    || candidate.claimSetSha256 !== hashCanonicalJsonV1(claims)
    || candidate.expectationValidationSha256 !== expectationValidation.claimSetSha256
    || candidate.scriptedProviderInvocations !== 1
    || candidate.providerInferenceCalls !== 0
    || candidate.networkCalls !== 0
    || candidate.canonicalProjectReads !== 0
    || candidate.canonicalProjectMutations !== 0
    || candidate.stateEffects.length
    || candidate.assessment !== 'PASS_ALL_REQUIRED_LONG_FORM_SENTINELS_RECOMPUTED'
    || receiptSha256 !== hashCanonicalJsonV1(material)) fail('RECEIPT_DRIFT');
  return deepFreezeEditronJsonV1(candidate) as Readonly<Stage25LongFormSentinelReceiptV3>;
}

function compileProposal(
  material: ProposalMaterial,
  context: Readonly<Stage25LongFormPlanContextV2>,
) {
  return compileStage25LongFormPlanProposalV2({
    context, proposal: createStage25LongFormPlanProposalV2(material),
  });
}

function scopeObservation(
  compiled: ReturnType<typeof compileStage25LongFormPlanProposalV2>,
  nodeId: string,
): JsonRecord {
  const binding = records(record(compiled.receipt).derivedRangeScopeBindings)
    .find((entry) => entry.nodeId === nodeId);
  const derivation = records(record(compiled.receipt).nodeDerivations)
    .find((entry) => entry.nodeId === nodeId);
  const node = compiled.plan.nodes.find((entry) => entry.nodeId === nodeId);
  if (!binding || !derivation || !node) fail('SCOPE_OBSERVATION_MISSING');
  return {
    planRevisionSha256: compiled.plan.revisionSha256,
    semanticScopes: node.scope.semanticScopes,
    rangeCandidateId: binding.rangeCandidateId,
    suppliedExplicitly: binding.suppliedExplicitly,
    effectiveSemanticScopeIds: derivation.effectiveSemanticScopeIds,
    requiredEvidenceRequirementIds: derivation.requiredEvidenceRequirementIds,
    modelReadiness: derivation.modelReadiness,
    canonicalStatus: derivation.canonicalStatus,
  };
}

function captureCompilerRejection(
  context: Readonly<Stage25LongFormPlanContextV2>,
  proposal: ProposalMaterial,
): string {
  try {
    compileProposal(proposal, context);
    return 'ACCEPTED_UNEXPECTEDLY';
  } catch (error) {
    return errorMessage(error);
  }
}

async function structuralOnlyEvaluation(
  proposal: ProposalMaterial,
): Promise<JsonRecord> {
  const providerRoute = route();
  const episode = await runStage25LongFormProviderEpisodeV2({
    route: providerRoute,
    presentationOrdinal: 1,
    invoke: async () => ({
      status: 200,
      body: {
        id: 'zero-inference-long-form-sentinel', model: providerRoute.model,
        status: 'completed',
        output: [{
          type: 'function_call', call_id: 'finish-long-form-sentinel',
          name: 'finish_editron_research_episode',
          arguments: JSON.stringify({
            disposition: 'READY_FOR_PROOF', reasonCodes: ['PLAN_SUBMITTED'],
            evidenceIds: [], summary: 'Ready for structural evaluation.', proposal,
          }),
        }],
      },
    }),
  });
  return evaluateStage25LongFormProviderEpisodeV2(episode) as JsonRecord;
}

function goldProposalMaterial(): ProposalMaterial {
  const base = (input: Partial<ProposalMaterial['nodes'][number]> & {
    nodeId: string; workKind: ProposalMaterial['nodes'][number]['workKind'];
  }): ProposalMaterial['nodes'][number] => ({
    parentNodeId: 'root-direction', dependsOnNodeIds: [], narrativeOrder: null,
    targetClaims: [`Plan ${input.nodeId}`], preservationClaims: [],
    successConditions: [`Complete ${input.nodeId}`],
    stopConditions: [`Stop if ${input.nodeId} evidence is insufficient`],
    semanticScopeIds: ['brand'], rangeCandidateIds: [], deliverableIds: [],
    directionRequirementIds: [], evidenceRequirementIds: [],
    approvalRequirementIds: [], budgetClassId: 'budget-planning',
    status: 'READY', whatHasNotBeenChecked: ['Editorial and render quality'],
    ...input,
  });
  return {
    version: STAGE25_LONG_FORM_PLAN_PROPOSAL_VERSION_V2,
    proposalId: 'long-form-sentinel-v3',
    nodes: [
      base({ nodeId: 'root-direction', workKind: 'DIRECTION', parentNodeId: null,
        semanticScopeIds: ['brand', 'main-deliverable', 'social-deliverable'],
        deliverableIds: ['main-film', 'social-cut'],
        directionRequirementIds: ['req-brand', 'req-no-literal-copy'] }),
      base({ nodeId: 'node-source', workKind: 'SOURCE_ORGANIZATION',
        semanticScopeIds: ['all-sources'], directionRequirementIds: ['req-audience-value'] }),
      base({ nodeId: 'node-music', workKind: 'MUSIC_STRUCTURE',
        semanticScopeIds: ['music'] }),
      base({ nodeId: 'node-story', workKind: 'STORY_ASSEMBLY',
        dependsOnNodeIds: ['node-source', 'node-music'],
        approvalRequirementIds: ['approval-hero-design'] }),
      base({ nodeId: 'seq-keynote-open', workKind: 'SEQUENCE', parentNodeId: 'node-story',
        dependsOnNodeIds: ['node-story'], narrativeOrder: 0, semanticScopeIds: [],
        rangeCandidateIds: ['keynote-open'] }),
      base({ nodeId: 'seq-keynote-proof', workKind: 'SEQUENCE', parentNodeId: 'node-story',
        dependsOnNodeIds: ['node-story'], narrativeOrder: 1, semanticScopeIds: [],
        rangeCandidateIds: ['keynote-proof'],
        directionRequirementIds: ['req-keynote-proof'] }),
      base({ nodeId: 'seq-participant', workKind: 'SEQUENCE', parentNodeId: 'node-story',
        dependsOnNodeIds: ['node-story'], narrativeOrder: 2, semanticScopeIds: [],
        status: 'NEEDS_EVIDENCE', rangeCandidateIds: ['workshop-rise', 'interview-outcomes'],
        directionRequirementIds: ['req-participant-outcomes'] }),
      base({ nodeId: 'seq-closing', workKind: 'SEQUENCE', parentNodeId: 'node-story',
        dependsOnNodeIds: ['node-story'], narrativeOrder: 3, semanticScopeIds: [],
        status: 'NEEDS_EVIDENCE', rangeCandidateIds: ['event-broll', 'closing-reaction'] }),
      base({ nodeId: 'node-picture', workKind: 'PICTURE_STABILITY', dependsOnNodeIds: [
        'seq-keynote-open', 'seq-keynote-proof', 'seq-participant', 'seq-closing',
      ] }),
      base({ nodeId: 'node-audio', workKind: 'FINAL_AUDIO', parentNodeId: 'node-picture',
        dependsOnNodeIds: ['node-picture'], semanticScopeIds: ['music'],
        budgetClassId: 'budget-final' }),
      base({ nodeId: 'node-captions', workKind: 'CAPTIONS', parentNodeId: 'node-picture',
        dependsOnNodeIds: ['node-picture'], semanticScopeIds: ['all-sources'],
        budgetClassId: 'budget-final' }),
      base({ nodeId: 'node-qc', workKind: 'QUALITY_CONTROL', parentNodeId: 'node-picture',
        dependsOnNodeIds: ['node-picture'], semanticScopeIds: ['all-sources'],
        budgetClassId: 'budget-final' }),
      base({ nodeId: 'node-delivery', workKind: 'DELIVERY', parentNodeId: 'node-picture',
        dependsOnNodeIds: ['node-audio', 'node-captions', 'node-qc'],
        semanticScopeIds: ['main-deliverable', 'social-deliverable'],
        approvalRequirementIds: ['approval-final-delivery'], budgetClassId: 'budget-final' }),
    ],
  };
}

function proposalNode(material: ProposalMaterial, nodeId: string) {
  return material.nodes.find((candidate) => candidate.nodeId === nodeId)
    ?? fail(`PROPOSAL_NODE_MISSING:${nodeId}`);
}

function mutableContext(
  context: Readonly<Stage25LongFormPlanContextV2>,
): Stage25LongFormPlanContextV2 {
  return structuredClone(context) as Stage25LongFormPlanContextV2;
}

function rehashContext(
  context: Stage25LongFormPlanContextV2,
): Stage25LongFormPlanContextV2 {
  const { contextSha256: _old, ...material } = context;
  return { ...material, contextSha256: hashEditronCanonicalJsonV1(material) };
}

function result(
  sentinelId: string,
  fixture: Readonly<JsonRecord>,
  observation: Readonly<JsonRecord>,
  resultAxes: Readonly<NoSpendAttemptAwareResultAxesV1>,
  transformation: Readonly<JsonRecord> | null = null,
): Stage25LongFormSentinelResultV3 {
  return deepFreezeEditronJsonV1({
    sentinelId,
    fixtureSha256: hashCanonicalJsonV1(fixture),
    transformationSha256: transformation ? hashCanonicalJsonV1(transformation) : null,
    evaluatorResultSha256: hashCanonicalJsonV1(observation),
    axes: resultAxes,
    observation,
  }) as Stage25LongFormSentinelResultV3;
}

function passStructuralAxes(): Readonly<NoSpendAttemptAwareResultAxesV1> {
  return axes('PASS', 'PASS', 'PASS', 'STRUCTURAL_ONLY');
}
function failControlAxes(): Readonly<NoSpendAttemptAwareResultAxesV1> {
  return axes('FAIL', 'PASS', 'FAIL', 'NO_PROOF');
}
function axes(
  modelDecision: NoSpendAttemptAwareResultAxesV1['modelDecision'],
  ownerSafety: NoSpendAttemptAwareResultAxesV1['ownerSafety'],
  taskOutcome: NoSpendAttemptAwareResultAxesV1['taskOutcome'],
  proofClass: NoSpendAttemptAwareResultAxesV1['proofClass'],
): Readonly<NoSpendAttemptAwareResultAxesV1> {
  return deepFreezeEditronJsonV1({
    modelDecision, ownerSafety, taskOutcome, proofClass,
    attemptedMutationCount: 0, unsafeAttemptCount: 0,
    ownerBlockedUnsafeAttemptCount: 0, safeStopCredit: false,
    fallbackUsed: false, fallbackCountedAsModelSuccess: false as const,
  }) as Readonly<NoSpendAttemptAwareResultAxesV1>;
}

function toClaim(
  sentinel: Readonly<Stage25LongFormSentinelResultV3>,
): Readonly<NoSpendSentinelClaimInputV1> {
  return {
    sentinelId: sentinel.sentinelId,
    fixtureSha256: sentinel.fixtureSha256,
    transformationSha256: sentinel.transformationSha256,
    evaluatorResultSha256: sentinel.evaluatorResultSha256,
    axes: sentinel.axes,
  };
}

function route(): ProviderNativeRouteV2R {
  return {
    routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
    claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'medium',
  };
}
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function fail(code: string): never {
  throw new Error(`STAGE25_LONG_FORM_SENTINEL_${code}`);
}
