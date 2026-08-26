import { afterEach, describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { STAGE25_FINAL_GENERALISATION_COHORT_V1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-cohort-v1';
import { evaluateStage25FinalGeneralisationSubmissionV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-evaluator-v1';
import type { Stage25FinalGeneralisationPublicTaskV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-protocol-v1';
import { finalizeStage25GeneralisationRowV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-generalisation-scorecard-v1';
import { finalizeStage25FinalGeneralisationScorecardRowV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-runner-support-v1';
import type { ProviderNativeEpisodeReceiptV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import { runStage25FinalGeneralisationZeroSpendPreflightV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-zero-spend-preflight-v1';

type JsonRecord = Record<string, unknown>;

afterEach(() => { vi.restoreAllMocks(); });

describe('Stage 2.5 final generalisation cohort V1', () => {
  it('freezes eight unseen tasks across the three configured routes', () => {
    const cohort = STAGE25_FINAL_GENERALISATION_COHORT_V1;
    const { cohortSha256, ...material } = cohort;
    expect(hashCanonicalJsonV1(material)).toBe(cohortSha256);
    expect(cohort.tasks).toHaveLength(8);
    expect(cohort.rows).toHaveLength(24);
    expect(new Set(cohort.rows.map(({ rowId }) => rowId))).toHaveLength(24);
    expect(new Set(cohort.rows.map(({ route }) => route.routeId)))
      .toEqual(new Set(['OPENAI_LUNA', 'OPENAI_TERRA', 'GOOGLE_FLASH']));
    expect(JSON.stringify(cohort)).not.toContain('QWEN');
    expect(cohort.dispatchAuthorized).toBe(false);
    expect(cohort.cohortId).toBe('stage25-final-generalisation-v1-2');
    const policies = cohort.tasks.filter(({ lane }) => lane === 'DEPENDENCY_PLAN')
      .map(({ publicTask }) => record(publicTask.publicMachinePolicy));
    expect(policies.every((policy) => String(policy.precedenceSemantics)
      .includes('predecessorOperatorId'))).toBe(true);
    expect(policies.flatMap((policy) => records(policy.requiredPrecedence))
      .every((rule) => Object.keys(rule).sort().join(',')
        === 'predecessorOperatorId,successorOperatorId')).toBe(true);
  });

  it('captures all initial requests with zero network and no editing tools callable', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('NETWORK_MUST_NOT_RUN'),
    );
    const receipt = await runStage25FinalGeneralisationZeroSpendPreflightV1();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(receipt.captures).toHaveLength(24);
    expect(receipt.counts.providerInferenceCalls).toBe(0);
    expect(receipt.counts.projectMutations).toBe(0);
    expect(receipt.checks.hiddenExpectedAnswersAbsent).toBe(true);
    expect(new Set(receipt.captures.map(({ controlOnlyToolName }) => controlOnlyToolName)))
      .toEqual(new Set(['finish_editron_research_episode']));
    expect(receipt.readiness)
      .toBe('READY_FOR_PROVIDER_ACCESS_AND_OFFICIAL_TOKEN_PREFLIGHT_NOT_INFERENCE');
    expect(receipt.dispatchAuthorized).toBe(false);
  });

  it('accepts equivalent public discovery forms and scorecard-compatible structure', () => {
    const task = getTask('HOLD-DEP-02');
    const list = evaluateStage25FinalGeneralisationSubmissionV1({
      task, submission: dependencySubmission(task, 'list_user_assets'),
    });
    const search = evaluateStage25FinalGeneralisationSubmissionV1({
      task, submission: dependencySubmission(task, 'search_user_assets'),
    });
    expect(list.disposition).toBe('PASS');
    expect(search.disposition).toBe('PASS');
    expect(list.operationSelectionPass).toBe(true);
    expect(list.dependencyAndInvalidationPass).toBe(true);
    expect(toScorecardReceipt(list).assessment).toBe('PASS_STRUCTURAL_ONLY');
  });

  it.each([
    ['unknown operator', (value: JsonRecord) => {
      records(record(value.proposal).planNodes)[0]!.selectedOperatorId = 'apply_filter';
    }, 'OPERATOR_NOT_ELIGIBLE'],
    ['cycle', (value: JsonRecord) => {
      records(record(value.proposal).planNodes)[0]!.dependsOnNodeIds = ['delete-old'];
    }, 'DEPENDENCY_CYCLE'],
    ['missing evidence', (value: JsonRecord) => {
      records(record(value.proposal).planNodes)[0]!.evidenceIds = [];
    }, 'EVIDENCE_BARRIER_INVALID'],
    ['copied revision', (value: JsonRecord) => {
      records(record(value.proposal).planNodes)[4]!.expectedRevisionOrigin =
        'INITIAL_PROJECT_SNAPSHOT';
    }, 'WRITER_RECEIPT_CHAIN_INVALID'],
  ])('rejects %s without a hidden expected topology', (_name, mutate, diagnostic) => {
    const task = getTask('HOLD-DEP-02');
    const submission = structuredClone(dependencySubmission(task, 'list_user_assets'));
    mutate(submission);
    const receipt = evaluateStage25FinalGeneralisationSubmissionV1({ task, submission });
    expect(receipt.disposition).toBe('FAIL');
    expect(receipt.diagnostics.some((entry) => entry.includes(diagnostic))).toBe(true);
  });

  it('accepts honest three-route qualification for the materialized preview task', () => {
    const task = getTask('RHC-01');
    const receipt = evaluateStage25FinalGeneralisationSubmissionV1({
      task, submission: routeSubmission(task, 'HYBRID'),
    });
    expect(receipt.disposition).toBe('PASS');
    expect(receipt.outcomeClass).toBe('EDIT_PLAN');
    expect(receipt.routeQualificationPass).toBe(true);
    expect(toScorecardReceipt(receipt).assessment).toBe('PASS_STRUCTURAL_ONLY');
  });

  it('accepts only an owner-backed zero-write gap for an unmaterialized route task', () => {
    const task = getTask('RHC-02');
    const gap = evaluateStage25FinalGeneralisationSubmissionV1({
      task, submission: routeSubmission(task, null),
    });
    expect(gap.disposition).toBe('PASS');
    expect(gap.outcomeClass).toBe('SAFE_STOP');
    expect(gap.routeQualificationPass).toBeNull();
    expect(toScorecardReceipt(gap).assessment).toBe('PASS_SAFE_STOP');

    const unsafe = evaluateStage25FinalGeneralisationSubmissionV1({
      task, submission: routeSubmission(task, 'NATIVE'),
    });
    expect(unsafe.disposition).toBe('FAIL');
    expect(unsafe.diagnostics).toContain('SELECTED_ROUTE_UNAVAILABLE');
  });

  it('rejects forged task packets before evaluation', () => {
    const task = getTask('RHC-01');
    expect(() => evaluateStage25FinalGeneralisationSubmissionV1({
      task: { ...task, taskPacketSha256: '0'.repeat(64) },
      submission: routeSubmission(task, 'NATIVE'),
    })).toThrow(/TASK_HASH_INVALID/);
  });

  it('never scores a resource-terminal response as a model failure', () => {
    const task = getTask('HOLD-DEP-02');
    const evaluation = evaluateStage25FinalGeneralisationSubmissionV1({
      task, submission: dependencySubmission(task, 'list_user_assets'),
    });
    const scorecard = finalizeStage25FinalGeneralisationScorecardRowV1({
      rowId: 'HOLD-DEP-02:GOOGLE_FLASH', task, routeId: 'GOOGLE_FLASH',
      attempts: [{
        attempt: 1, correction: false, observation: 'RESPONSE_OBSERVED',
        dispatchReceiptSha256: '1'.repeat(64),
        responseReceiptSha256: '2'.repeat(64),
        requestSha256: '3'.repeat(64), responseSha256: '4'.repeat(64),
        episode: { terminal: {
          disposition: 'RESOURCE_ACCOUNTING_UNVERIFIABLE',
          reasonCodes: ['ACTUAL_OUTPUT_EXCEEDS_REQUEST_LIMIT'],
          evidenceIds: [], summary: 'Resource accounting was not verifiable.',
        } } as unknown as ProviderNativeEpisodeReceiptV2R,
        evaluation, latencyMs: 10, spentNanoUsd: 1_000,
      }],
    });

    expect(scorecard.providerOutcome).toBe('PROVIDER_INFRASTRUCTURE');
    expect(scorecard.assessment).toBe('NOT_EVALUATED_PROVIDER_INFRASTRUCTURE');
    expect(scorecard.responseSha256).toBeNull();
    expect(scorecard.modelDecision).toBeNull();
  });
});

function getTask(taskId: string): Readonly<Stage25FinalGeneralisationPublicTaskV1> {
  return STAGE25_FINAL_GENERALISATION_COHORT_V1.tasks
    .find((task) => task.taskId === taskId) ?? fail(`TASK_MISSING:${taskId}`);
}

function dependencySubmission(
  task: Readonly<Stage25FinalGeneralisationPublicTaskV1>,
  discoveryOperatorId: 'list_user_assets' | 'search_user_assets',
): JsonRecord {
  const evidence = [...task.evidenceIds];
  const rules = [...task.publicRuleIds];
  const nodes = [
    node('discover', discoveryOperatorId, 'EVIDENCE', [], evidence, [], ['asset-list'],
      'NOT_APPLICABLE', rules),
    node('inspect', 'inspect_user_asset', 'EVIDENCE', ['discover'], [], ['asset-list'],
      ['asset-proof'], 'NOT_APPLICABLE', rules),
    node('resolve', 'resolve_user_asset_overlay', 'RESOLUTION', ['inspect'], [],
      ['asset-proof'], ['replacement-form'], 'NOT_APPLICABLE', rules),
    node('add-new', 'add_overlay', 'MUTATION', ['resolve'], [], ['replacement-form'],
      ['receipt-add'], 'INITIAL_PROJECT_SNAPSHOT', rules),
    node('delete-old', 'delete_overlay', 'MUTATION', ['add-new'], [], ['receipt-add'],
      ['receipt-delete'], 'PRIOR_WRITER_RECEIPT', rules),
  ];
  return {
    disposition: 'READY_FOR_PROOF', reasonCodes: ['PUBLIC_RULES_SATISFIED'],
    evidenceIds: evidence, summary: 'Resolve the verified form, add it, then delete old state.',
    proposal: {
      taskId: task.taskId, lane: 'DEPENDENCY_PLAN', publicRuleCoverageIds: rules,
      planNodes: nodes, unresolvedRequirements: [],
      whatHasNotBeenChecked: ['RENDERED_VISUAL_QUALITY'],
    },
  };
}

function node(
  nodeId: string, selectedOperatorId: string, role: string,
  dependsOnNodeIds: string[], evidenceIds: string[], consumesOwnerOutputRefs: string[],
  producesOwnerOutputRefs: string[], expectedProjectRevision: string, publicRuleIds: string[],
): JsonRecord {
  const mutation = role === 'MUTATION';
  return {
    nodeId, selectedOperatorId, role, dependsOnNodeIds, publicRuleIds, evidenceIds,
    consumesOwnerOutputRefs, producesOwnerOutputRefs,
    reads: mutation ? ['CURRENT_PROJECT_REVISION'] : ['PUBLIC_TASK_EVIDENCE'],
    writes: mutation ? [`PROJECT_STATE:${nodeId}`] : [],
    invalidates: mutation ? ['DOWNSTREAM_PREVIEW'] : [],
    coordinateDomain: mutation ? 'PROJECT_TIMELINE_FRAME' : 'NON_TEMPORAL',
    expectedRevisionOrigin: expectedProjectRevision,
    proofObligationIds: mutation ? ['CURRENT_EDIT_PROOF'] : [],
    failureDisposition: mutation ? 'ABORT_PLAN' : 'STOP_NO_WRITE',
    reversibility: mutation ? 'CHECKPOINT_REQUIRED' : 'READ_ONLY',
    rationale: `Publicly required ${selectedOperatorId} step.`,
  };
}

function routeSubmission(
  task: Readonly<Stage25FinalGeneralisationPublicTaskV1>,
  selectedRoute: 'NATIVE' | 'GENERATED_COMPOSITION' | 'HYBRID' | null,
): JsonRecord {
  const owner = new Map(records(task.currentOwnerEvidence.routeQualifications)
    .map(({ route, qualification }) => [String(route), String(qualification)]));
  const policy = record(record(task.publicTask).publicMachinePolicy);
  const targets = strings(policy.exactTargetPredicateIds);
  const preservation = strings(policy.exactPreservationPredicateIds);
  const available = [...owner.values()].includes('RESEARCH_PREVIEW_AVAILABLE');
  return {
    disposition: available ? 'READY_FOR_PROOF' : 'CAPABILITY_GAP',
    reasonCodes: [available ? 'OWNER_PREVIEW_AVAILABLE' : 'OWNER_OR_FIXTURE_GAP'],
    evidenceIds: [...task.evidenceIds], summary: 'Qualify every route from current owner evidence.',
    proposal: {
      taskId: task.taskId, lane: 'ROUTE_DECISION',
      publicRuleCoverageIds: [...task.publicRuleIds],
      candidateForms: ['NATIVE', 'GENERATED_COMPOSITION', 'HYBRID'].map((route) => {
        const qualification = owner.get(route);
        return {
          route, qualification,
          targetPredicateIds: qualification === 'RESEARCH_PREVIEW_AVAILABLE' ? targets : [],
          preservationPredicateIds:
            qualification === 'RESEARCH_PREVIEW_AVAILABLE' ? preservation : [],
          ownerRefs: [`CURRENT_OWNER:${route}`], selectedOperatorIds: [],
          blockers: qualification === 'RESEARCH_PREVIEW_AVAILABLE'
            ? [] : [`OWNER_OR_FIXTURE_GAP:${route}`],
          proofCeiling: qualification === 'RESEARCH_PREVIEW_AVAILABLE'
            ? 'CAPTURED_UNJUDGED_RESEARCH_PREVIEW' : 'SAFE_STOP_OWNER_PROOF_ONLY',
        };
      }),
      selectedRoute,
      boundaryHandoffs: selectedRoute === 'GENERATED_COMPOSITION' || selectedRoute === 'HYBRID'
        ? ['TIMEBASE', 'AUDIO', 'BOUNDARY'] : [],
      unresolvedRequirements: [], whatHasNotBeenChecked: ['PRODUCT_EXECUTION'],
    },
  };
}

function toScorecardReceipt(evaluation: ReturnType<typeof evaluateStage25FinalGeneralisationSubmissionV1>) {
  const safe = evaluation.outcomeClass === 'SAFE_STOP';
  return finalizeStage25GeneralisationRowV1({
    rowId: `test:${evaluation.taskId}`, taskId: evaluation.taskId,
    taskLane: evaluation.taskId.startsWith('HOLD-') ? 'DEPENDENCY_PLAN' : 'ROUTE_DECISION',
    providerRouteId: 'SYNTHETIC_TEST', providerOutcome: 'EVALUATED',
    outcomeClass: evaluation.outcomeClass, modelDecision: evaluation.disposition,
    schemaValid: evaluation.schemaValid, firstPassStructuralValid: evaluation.disposition === 'PASS',
    finalStructuralValid: evaluation.disposition === 'PASS', repairCount: 0,
    publicRuleCoveragePass: evaluation.publicRuleCoveragePass,
    evidenceDisciplinePass: evaluation.evidenceDisciplinePass,
    operationSelectionPass: evaluation.operationSelectionPass,
    dependencyAndInvalidationPass: evaluation.dependencyAndInvalidationPass,
    routeQualificationPass: evaluation.routeQualificationPass,
    ownerSafety: evaluation.ownerSafety, proofClass: evaluation.proofClass,
    attemptedMutationCount: 0, forbiddenOperatorAttemptCount: 0,
    unsafeMutationAttemptCount: 0, ownerBlockedUnsafeAttemptCount: 0,
    hardPredicateViolationCount: 0, preservationViolationCount: 0,
    falseSuccessCount: 0, safeStopCredit: safe, fallbackUsed: false,
    fallbackCountedAsModelSuccess: false, latencyMs: 1, modelCostMicroUsd: 1,
    requestSha256: hashCanonicalJsonV1({ taskId: evaluation.taskId, kind: 'request' }),
    responseSha256: evaluation.submissionSha256,
    ownerReceiptSha256: evaluation.receiptSha256,
  });
}

function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value as JsonRecord[] : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function fail(code: string): never { throw new Error(code); }
