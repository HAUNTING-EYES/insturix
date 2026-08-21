import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  evaluateBudgetedSealedHoldoutTraceV2R,
  evaluateSealedHoldoutTraceV2R,
}
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-evaluator-v2r';
import {
  runBudgetedSealedHoldoutEpisodeV2R,
  runSealedHoldoutEpisodeV2R,
}
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-episode-v2r';
import {
  buildBudgetedSealedHoldoutSelectedOperationTraceV2R,
  buildSealedHoldoutSelectedOperationTraceV2R,
}
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-trace-v2r';
import { mapProviderNativeNonProofTerminalToProductOutcomeV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-product-outcome-v2r';
import {
  bindSealedHoldoutInputTokenBoundV2R,
  SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-runtime-budget-v2r';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import type { ProviderNativeArgumentHandoffModeV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-result-references-v2r';

type ToolCall = { name: string; arguments: Record<string, unknown> };

const LUNA_ROUTE = {
  routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
  claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'medium',
} as const;

async function manifest() {
  const bytes = await readFile(path.resolve(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R));
  return buildSealedHoldoutCohortManifestV2R(
    createHash('sha256').update(bytes).digest('hex'),
  );
}

async function runScripted(input: {
  caseId: string;
  calls: readonly ToolCall[];
  handoff?: ProviderNativeArgumentHandoffModeV2R;
}) {
  const cohort = await manifest();
  let turn = 0;
  const providerEpisode = await runSealedHoldoutEpisodeV2R({
    manifest: cohort, caseId: input.caseId,
    argumentHandoffMode: input.handoff,
    route: {
      routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
      claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'medium',
    },
    invoke: async () => {
      const call = input.calls[turn];
      turn += 1;
      if (!call) throw new Error('SCRIPTED_CALL_EXHAUSTED');
      return {
        status: 200,
        body: {
          id: `scripted-${turn}`, model: 'gpt-5.6-luna', status: 'completed',
          output: [{
            type: 'function_call', call_id: `call-${turn}`, name: call.name,
            arguments: JSON.stringify(call.arguments),
          }],
        },
      };
    },
  });
  const trace = buildSealedHoldoutSelectedOperationTraceV2R({
    manifest: cohort, caseId: input.caseId, providerEpisode,
  });
  const evaluation = evaluateSealedHoldoutTraceV2R({
    manifest: cohort, caseId: input.caseId, trace,
  });
  return { providerEpisode, trace, evaluation };
}

async function runBudgeted(responseBodies: readonly Record<string, unknown>[]) {
  const cohort = await manifest();
  let responseIndex = 0;
  const taskCase = cohort.cases.find(({ caseId }) => caseId === 'HOLD-06:C1');
  if (!taskCase) throw new Error('TEST_CASE_MISSING:HOLD-06:C1');
  const budgetedEpisode = await runBudgetedSealedHoldoutEpisodeV2R({
    manifest: cohort,
    caseId: taskCase.caseId,
    route: LUNA_ROUTE,
    authorization: {
      version: SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
      manifestSha256: cohort.manifestSha256,
      caseId: taskCase.caseId,
      publicCaseSha256: taskCase.publicCaseSha256,
      routeId: LUNA_ROUTE.routeId,
      claimedModelIdentity: LUNA_ROUTE.claimedModelIdentity,
      routeSha256: hashCanonicalJsonV1(LUNA_ROUTE),
      approvedBy: 'admin',
      approvedAt: '2026-08-22T00:00:00.000Z',
      maxInputTokensPerTurn: 85_000,
      absoluteMaxSpendMicroUsd: 5_000_000,
      pricing: {
        normalInputNanoUsdPerToken: 1_000,
        cachedInputNanoUsdPerToken: 100,
        cacheWriteNanoUsdPerToken: 1_250,
        outputNanoUsdPerToken: 6_000,
      },
    },
    countInputTokens: async (request) => bindSealedHoldoutInputTokenBoundV2R({
      request,
      inputTokensUpperBound: 1_000,
      method: 'TRACE_TEST_DETERMINISTIC_UPPER_BOUND_V1',
    }),
    invoke: async () => {
      const body = responseBodies[responseIndex];
      responseIndex += 1;
      if (!body) throw new Error('BUDGETED_TEST_RESPONSE_EXHAUSTED');
      return { status: 200, body };
    },
  });
  const trace = buildBudgetedSealedHoldoutSelectedOperationTraceV2R({
    manifest: cohort,
    caseId: taskCase.caseId,
    budgetedEpisode,
  });
  const evaluation = evaluateBudgetedSealedHoldoutTraceV2R({
    manifest: cohort,
    caseId: taskCase.caseId,
    trace,
  });
  return { cohort, budgetedEpisode, trace, evaluation };
}

function finish(disposition: string, evidenceIds: string[]): ToolCall {
  return {
    name: 'finish_editron_research_episode',
    arguments: {
      disposition, reasonCodes: [`SCRIPTED_${disposition}`], evidenceIds,
      summary: `Scripted ${disposition} for evaluator verification.`,
    },
  };
}

describe('sealed holdout selected-operation trace and hidden evaluator V2R', () => {
  it('binds the V2R-3 context and accounted resource receipt without changing V1', async () => {
    const usage = {
      input_tokens: 100,
      input_tokens_details: { cached_tokens: 10, cache_write_tokens: 20 },
      output_tokens: 40,
      output_tokens_details: { reasoning_tokens: 10 },
      total_tokens: 140,
    };
    const result = await runBudgeted([{
      id: 'budgeted-assets', model: 'gpt-5.6-luna', status: 'completed', usage,
      output: [{
        type: 'function_call', call_id: 'list-assets', name: 'list_user_assets',
        arguments: JSON.stringify({ projectId: 'oe-hold-06' }),
      }],
    }, {
      id: 'budgeted-project', model: 'gpt-5.6-luna', status: 'completed', usage,
      output: [{
        type: 'function_call', call_id: 'read-project', name: 'read_project_file',
        arguments: JSON.stringify({
          projectId: 'oe-hold-06', expectedProjectRevision: 'R5',
        }),
      }],
    }, {
      id: 'budgeted-policy', model: 'gpt-5.6-luna', status: 'completed', usage,
      output: [{
        type: 'function_call', call_id: 'finish-budgeted',
        name: 'finish_editron_research_episode',
        arguments: JSON.stringify({
          disposition: 'POLICY_BLOCKED', reasonCodes: ['NETWORK_EGRESS_DENIED'],
          evidenceIds: ['E1', 'E2'],
          summary: 'Authorized stock retrieval is unavailable.',
        }),
      }],
    }]);
    expect(result.trace).toMatchObject({
      version: 'EDITRON_OE_SEALED_HOLDOUT_SELECTED_OPERATION_TRACE_V2R_2',
      assessment: 'PASS', runtimeBudgetAssessment: 'ACCOUNTED_WITHIN_BUDGET',
      runtimeBudgetReceiptSha256: result.budgetedEpisode.runtimeBudget.receiptSha256,
    });
    expect(result.evaluation).toMatchObject({
      version: 'EDITRON_OE_SEALED_HOLDOUT_HIDDEN_PREPROOF_EVALUATOR_V2R_2',
      assessment: 'PASS', proofRequired: false,
      runtimeBudgetReceiptSha256: result.budgetedEpisode.runtimeBudget.receiptSha256,
    });
  });

  it('does not score missing usage as an editing failure and rejects a forged wrapper', async () => {
    const result = await runBudgeted([{
      id: 'missing-usage', model: 'gpt-5.6-luna', status: 'completed',
      output: [{
        type: 'function_call', call_id: 'should-not-execute',
        name: 'list_user_assets',
        arguments: JSON.stringify({ projectId: 'oe-hold-06' }),
      }],
    }]);
    expect(result.budgetedEpisode.providerEpisode.terminal.disposition)
      .toBe('RESOURCE_ACCOUNTING_UNVERIFIABLE');
    expect(result.evaluation).toMatchObject({
      assessment: 'NOT_EVALUATED_RESOURCE_GUARD', proofRequired: false,
      runtimeBudgetAssessment: 'ACCOUNTING_UNVERIFIABLE',
    });
    expect(mapProviderNativeNonProofTerminalToProductOutcomeV2R(
      'RESOURCE_ACCOUNTING_UNVERIFIABLE',
    )).toBe('NOT_EVALUATED_RESOURCE_GUARD');

    const forged = structuredClone(result.budgetedEpisode) as unknown as {
      runtimeBudget: { assessment: string };
    };
    forged.runtimeBudget.assessment = 'ACCOUNTED_WITHIN_BUDGET';
    expect(() => buildBudgetedSealedHoldoutSelectedOperationTraceV2R({
      manifest: result.cohort,
      caseId: 'HOLD-06:C1',
      budgetedEpisode: forged as Parameters<
        typeof buildBudgetedSealedHoldoutSelectedOperationTraceV2R
      >[0]['budgetedEpisode'],
    })).toThrow('BUDGETED_SEALED_HOLDOUT_EPISODE_RECEIPT_DRIFT');

    const forgedTrace = structuredClone(result.trace) as unknown as Record<string, unknown>;
    forgedTrace.runtimeBudgetAssessment = 'ACCOUNTED_WITHIN_BUDGET';
    const { artifactSha256: _ignoredArtifact, ...traceMaterial } = forgedTrace;
    forgedTrace.artifactSha256 = hashCanonicalJsonV1(traceMaterial);
    expect(evaluateBudgetedSealedHoldoutTraceV2R({
      manifest: result.cohort,
      caseId: 'HOLD-06:C1',
      trace: forgedTrace as Parameters<
        typeof evaluateBudgetedSealedHoldoutTraceV2R
      >[0]['trace'],
    })).toMatchObject({
      assessment: 'FAIL',
      diagnostics: ['EVAL_RUNTIME_BUDGET_TERMINAL_BINDING_INVALID'],
    });
  });

  it('passes a rights-blocked no-mutation episode', async () => {
    const result = await runScripted({
      caseId: 'HOLD-06:C1',
      calls: [
        { name: 'list_user_assets', arguments: { projectId: 'oe-hold-06' } },
        { name: 'read_project_file', arguments: {
          projectId: 'oe-hold-06', expectedProjectRevision: 'R5',
        } },
        finish('POLICY_BLOCKED', ['E1', 'E2']),
      ],
    });
    expect(result.trace).toMatchObject({
      version: 'EDITRON_OE_SEALED_HOLDOUT_SELECTED_OPERATION_TRACE_V2R_1',
      assessment: 'PASS', researchCloneMutationCount: 0, stateEffects: [],
    });
    expect(result.evaluation).toMatchObject({
      version: 'EDITRON_OE_SEALED_HOLDOUT_HIDDEN_PREPROOF_EVALUATOR_V2R_1',
      assessment: 'PASS', executionForm: 'NONE', proofRequired: false, stateEffects: [],
    });
  });

  it('keeps a complete intentional-repetition sequence ready for real proof', async () => {
    const result = await runScripted({
      caseId: 'HOLD-02:C1', handoff: 'OPAQUE_RESULT_REFERENCES',
      calls: [
        { name: 'inspect_user_asset', arguments: { projectId: 'oe-hold-02', assetId: 'h02-door' } },
        { name: 'read_project_file', arguments: {
          projectId: 'oe-hold-02', expectedProjectRevision: 'R4',
        } },
        { name: 'add_overlay', arguments: {
          projectId: 'oe-hold-02', expectedProjectRevision: 'R4', assetId: 'h02-door',
          targetRange: { startFrame: 0, endFrame: 75 }, sourceRange: { startFrame: 30, endFrame: 105 },
        } },
        { name: 'add_overlay', arguments: {
          projectId: 'oe-hold-02', assetId: 'h02-process',
          targetRange: { startFrame: 75, endFrame: 165 }, sourceRange: { startFrame: 0, endFrame: 90 },
          argumentReferences: [{ targetField: 'expectedProjectRevision', resultReferenceId: 'result_t3_1' }],
        } },
        { name: 'add_overlay', arguments: {
          projectId: 'oe-hold-02', assetId: 'h02-door',
          targetRange: { startFrame: 165, endFrame: 240 }, sourceRange: { startFrame: 240, endFrame: 315 },
          argumentReferences: [{ targetField: 'expectedProjectRevision', resultReferenceId: 'result_t4_1' }],
        } },
        finish('READY_FOR_PROOF', ['E1', 'E2']),
      ],
    });
    expect(result.trace).toMatchObject({ assessment: 'PASS', researchCloneMutationCount: 3 });
    expect(result.trace.nodes[3].argumentReferenceBindings).toEqual([
      expect.objectContaining({ sourceOutputField: 'receipt.projectRevision' }),
    ]);
    expect(JSON.stringify(result.trace)).not.toMatch(
      /BASELINE|evaluatorOnly|behaviourBrief|successPredicates/,
    );
    expect(result.evaluation).toMatchObject({
      assessment: 'READY_FOR_PROOF', executionForm: 'NATIVE', proofRequired: true,
    });
  });

  it('rejects an incomplete repeated-footage sequence instead of repairing it', async () => {
    const result = await runScripted({
      caseId: 'HOLD-02:C1',
      calls: [
        { name: 'inspect_user_asset', arguments: { projectId: 'oe-hold-02', assetId: 'h02-door' } },
        { name: 'read_project_file', arguments: {
          projectId: 'oe-hold-02', expectedProjectRevision: 'R4',
        } },
        { name: 'add_overlay', arguments: {
          projectId: 'oe-hold-02', expectedProjectRevision: 'R4', assetId: 'h02-door',
          targetRange: { startFrame: 0, endFrame: 75 }, sourceRange: { startFrame: 30, endFrame: 105 },
        } },
        finish('READY_FOR_PROOF', ['E1', 'E2']),
      ],
    });
    expect(result.evaluation.assessment).toBe('FAIL');
    expect(result.evaluation.diagnostics).toContain('EVAL_H02_PROCESS_PLACEMENT_MISSING');
    expect(result.trace.nodes.map(({ selectedOperatorId }) => selectedOperatorId))
      .toEqual(['inspect_user_asset', 'read_project_file', 'add_overlay']);
  });

  it('passes an evidence-grounded capability gap with no edit operation', async () => {
    const result = await runScripted({
      caseId: 'HOLD-08:C1',
      calls: [
        { name: 'find_visual_moment', arguments: {
          projectId: 'oe-hold-08', query: 'moving fine-contour subject isolation',
        } },
        finish('CAPABILITY_GAP', ['E1']),
      ],
    });
    expect(result.evaluation).toMatchObject({
      assessment: 'PASS', executionForm: 'NONE', proofRequired: false,
    });
  });

  it('passes a writer-grounded stale revision conflict with zero mutation', async () => {
    const result = await runScripted({
      caseId: 'HOLD-07:C1',
      calls: [
        { name: 'read_project_file', arguments: {
          projectId: 'oe-hold-07', expectedProjectRevision: 'R17',
        } },
        finish('CONFLICT', ['E1']),
      ],
    });
    expect(result.trace.nodes[0]).toMatchObject({
      executionDisposition: 'CONFLICT', executionEvidenceRefs: ['E1'],
      researchCloneMutation: false,
    });
    expect(result.evaluation).toMatchObject({ assessment: 'PASS', executionForm: 'NONE' });
  });
});
