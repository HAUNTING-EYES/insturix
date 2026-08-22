import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  evaluateBudgetedSealedHoldoutTraceV2R,
  evaluateBudgetedSealedHoldoutTraceV3R2,
}
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-evaluator-v2r';
import { runBudgetedSealedHoldoutEpisodeV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-episode-v2r';
import { runBudgetedSealedHoldoutEpisodeV3R2 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-episode-v3r';
import {
  proveSealedHoldoutGeneralNoEditOutcomeV2R,
  proveSealedHoldoutGeneralNoEditOutcomeV3R2,
  proveSealedHoldoutNoEditOutcomeV2R,
}
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-no-edit-proof-v2r';
import {
  bindSealedHoldoutInputTokenBoundV2R,
  SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-runtime-budget-v2r';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  buildSealedHoldoutCohortManifestV3R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r';
import {
  buildSealedHoldoutCohortManifestV3R2,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r2';
import {
  buildBudgetedSealedHoldoutSelectedOperationTraceV2R,
  buildBudgetedSealedHoldoutSelectedOperationTraceV3R2,
}
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-trace-v2r';

type ToolCall = { name: string; arguments: Record<string, unknown> };

const LUNA_ROUTE = {
  routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
  claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'medium',
} as const;
const USAGE = {
  input_tokens: 100,
  input_tokens_details: { cached_tokens: 10, cache_write_tokens: 20 },
  output_tokens: 40,
  output_tokens_details: { reasoning_tokens: 10 },
  total_tokens: 140,
};

async function manifest() {
  const bytes = await readFile(path.resolve(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R));
  return buildSealedHoldoutCohortManifestV2R(
    createHash('sha256').update(bytes).digest('hex'),
  );
}

async function runCase(
  caseId: string,
  calls: readonly ToolCall[],
  includeUsage = true,
) {
  const cohort = await manifest();
  const taskCase = cohort.cases.find((entry) => entry.caseId === caseId);
  if (!taskCase) throw new Error(`TEST_CASE_MISSING:${caseId}`);
  let turn = 0;
  const budgetedEpisode = await runBudgetedSealedHoldoutEpisodeV2R({
    manifest: cohort,
    caseId,
    route: LUNA_ROUTE,
    authorization: {
      version: SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
      manifestSha256: cohort.manifestSha256,
      caseId,
      publicCaseSha256: taskCase.publicCaseSha256,
      routeId: LUNA_ROUTE.routeId,
      claimedModelIdentity: LUNA_ROUTE.claimedModelIdentity,
      routeSha256: hashCanonicalJsonV1(LUNA_ROUTE),
      approvedBy: 'admin',
      approvedAt: '2026-08-22T00:00:00.000Z',
      maxInputTokensPerTurn: 85_000,
      absoluteMaxSpendMicroUsd: 5_000_000,
      pricing: {
        normalInputNanoUsdPerToken: 200,
        cachedInputNanoUsdPerToken: 20,
        cacheWriteNanoUsdPerToken: 250,
        outputNanoUsdPerToken: 1_200,
      },
    },
    countInputTokens: async (request) => bindSealedHoldoutInputTokenBoundV2R({
      request,
      inputTokensUpperBound: 1_000,
      method: 'NO_EDIT_PROOF_TEST_BOUND_V1',
    }),
    invoke: async () => {
      const call = calls[turn];
      turn += 1;
      if (!call) throw new Error('SCRIPTED_CALL_EXHAUSTED');
      return {
        status: 200,
        body: {
          id: `no-edit-${caseId}-${turn}`,
          model: LUNA_ROUTE.model,
          status: 'completed',
          ...(includeUsage ? { usage: USAGE } : {}),
          output: [{
            type: 'function_call',
            call_id: `call-${turn}`,
            name: call.name,
            arguments: JSON.stringify(call.arguments),
          }],
        },
      };
    },
  });
  const trace = buildBudgetedSealedHoldoutSelectedOperationTraceV2R({
    manifest: cohort,
    caseId,
    budgetedEpisode,
  });
  const evaluation = evaluateBudgetedSealedHoldoutTraceV2R({
    manifest: cohort,
    caseId,
    trace,
  });
  return { cohort, trace, evaluation };
}

function finish(disposition: string, evidenceIds: string[]): ToolCall {
  return {
    name: 'finish_editron_research_episode',
    arguments: {
      disposition,
      reasonCodes: [`SCRIPTED_${disposition}`],
      evidenceIds,
      summary: `Scripted ${disposition} no-edit terminal.`,
    },
  };
}

describe('sealed holdout research no-edit proof V2R', () => {
  it.each([
    {
      caseId: 'HOLD-06:C1',
      calls: [
        { name: 'list_user_assets', arguments: { projectId: 'oe-hold-06' } },
        { name: 'read_project_file', arguments: {
          projectId: 'oe-hold-06', expectedProjectRevision: 'R5',
        } },
        finish('POLICY_BLOCKED', ['E1', 'E2']),
      ],
      claim: 'RIGHTS_OR_AUTHORIZATION_STOP_WITHOUT_EDIT',
    },
    {
      caseId: 'HOLD-07:C1',
      calls: [
        { name: 'read_project_file', arguments: {
          projectId: 'oe-hold-07', expectedProjectRevision: 'R17',
        } },
        finish('CONFLICT', ['E1']),
      ],
      claim: 'STALE_REVISION_STOP_WITHOUT_EDIT',
    },
    {
      caseId: 'HOLD-08:C1',
      calls: [
        { name: 'find_visual_moment', arguments: {
          projectId: 'oe-hold-08', query: 'moving fine-contour subject isolation',
        } },
        finish('CAPABILITY_GAP', ['E1']),
      ],
      claim: 'CAPABILITY_OR_EVIDENCE_GAP_WITHOUT_EDIT',
    },
  ])('proves $caseId without pretending to prove project state or render quality', async ({
    caseId, calls, claim,
  }) => {
    const result = await runCase(caseId, calls);
    const proof = proveSealedHoldoutNoEditOutcomeV2R({
      manifest: result.cohort,
      caseId,
      trace: result.trace,
      evaluation: result.evaluation,
    });
    expect(proof).toMatchObject({
      authority: 'RESEARCH_NO_EDIT_SAFETY_PROOF_NO_PROJECT_MUTATION',
      caseId,
      claim,
      assessment: 'PASS_RESEARCH_NO_EDIT_SAFETY',
      renderDisposition: 'NOT_REQUIRED_FOR_NO_EDIT_SAFETY_CLAIM',
      projectStateProof: 'NOT_CLAIMED_RESEARCH_ISOLATION_ONLY',
      stateEffects: [],
    });
  });

  it.each([
    {
      caseId: 'HOLD-01:C2', terminal: 'UNVERIFIABLE', evidenceIds: ['E1', 'E2'],
      calls: [
        { name: 'read_project_file', arguments: { projectId: 'oe-hold-01', expectedProjectRevision: 'R9' } },
        { name: 'find_visual_moment', arguments: { projectId: 'oe-hold-01', query: 'inspect geometric alignment candidates' } },
        { name: 'get_timeline_view', arguments: { projectId: 'oe-hold-01', expectedProjectRevision: 'R9' } },
      ],
    },
    {
      caseId: 'HOLD-02:C2', terminal: 'CLARIFICATION_REQUIRED', evidenceIds: ['E1', 'E2'],
      calls: [
        { name: 'inspect_user_asset', arguments: { projectId: 'oe-hold-02', assetId: 'h02-door' } },
        { name: 'read_project_file', arguments: { projectId: 'oe-hold-02', expectedProjectRevision: 'R4' } },
      ],
    },
    {
      caseId: 'HOLD-03:C2', terminal: 'UNVERIFIABLE', evidenceIds: ['E1', 'E3'],
      calls: [
        { name: 'find_visual_moment', arguments: { projectId: 'oe-hold-03', query: 'inspect reference layout without face evidence' } },
        { name: 'get_timeline_view', arguments: { projectId: 'oe-hold-03', expectedProjectRevision: 'R12' } },
      ],
    },
    {
      caseId: 'HOLD-04:C2', terminal: 'CLARIFICATION_REQUIRED', evidenceIds: ['E1', 'E2'],
      calls: [
        { name: 'get_video_transcription', arguments: { projectId: 'oe-hold-04', assetId: 'h04-host' } },
        { name: 'get_timeline_view', arguments: { projectId: 'oe-hold-04', expectedProjectRevision: 'R6' } },
      ],
    },
    {
      caseId: 'HOLD-05:C2', terminal: 'UNVERIFIABLE', evidenceIds: ['E2'],
      calls: [
        { name: 'find_visual_moment', arguments: { projectId: 'oe-hold-05', query: 'inspect moving subject evidence availability' } },
        { name: 'get_timeline_view', arguments: { projectId: 'oe-hold-05', expectedProjectRevision: 'R14' } },
      ],
    },
    {
      caseId: 'HOLD-06:C2', terminal: 'CLARIFICATION_REQUIRED', evidenceIds: ['E1'],
      calls: [
        { name: 'list_user_assets', arguments: { projectId: 'oe-hold-06' } },
        { name: 'read_project_file', arguments: { projectId: 'oe-hold-06', expectedProjectRevision: 'R5' } },
      ],
    },
    {
      caseId: 'HOLD-07:C2', terminal: 'UNVERIFIABLE', evidenceIds: ['E1', 'E2'],
      calls: [
        { name: 'read_project_file', arguments: { projectId: 'oe-hold-07', expectedProjectRevision: 'R17' } },
      ],
    },
    { caseId: 'HOLD-08:C2', terminal: 'UNVERIFIABLE', evidenceIds: [], calls: [] },
  ])('proves legal hidden-arm no-edit outcome for $caseId', async ({
    caseId, terminal, evidenceIds, calls,
  }) => {
    const result = await runCase(caseId, [...calls, finish(terminal, evidenceIds)]);
    expect(result.evaluation).toMatchObject({
      assessment: 'PASS', executionForm: 'NONE', proofRequired: false,
    });
    const proof = proveSealedHoldoutGeneralNoEditOutcomeV2R({
      manifest: result.cohort,
      caseId,
      trace: result.trace,
      evaluation: result.evaluation,
    });
    expect(proof).toMatchObject({
      authority: 'RESEARCH_GENERAL_NO_EDIT_SAFETY_PROOF_NO_PROJECT_MUTATION',
      caseId,
      assessment: 'PASS_RESEARCH_GENERAL_NO_EDIT_SAFETY',
      renderDisposition: 'NOT_REQUIRED_FOR_NO_EDIT_SAFETY_CLAIM',
      projectStateProof: 'NOT_CLAIMED_RESEARCH_ISOLATION_ONLY',
      stateEffects: [],
    });
  });

  it('rejects a no-edit terminal after a successful mutation', async () => {
    const result = await runCase('HOLD-02:C2', [
      { name: 'inspect_user_asset', arguments: { projectId: 'oe-hold-02', assetId: 'h02-door' } },
      { name: 'read_project_file', arguments: { projectId: 'oe-hold-02', expectedProjectRevision: 'R4' } },
      { name: 'add_overlay', arguments: {
        projectId: 'oe-hold-02', expectedProjectRevision: 'R4', assetId: 'h02-door',
        targetRange: { startFrame: 0, endFrame: 75 },
        sourceRange: { startFrame: 30, endFrame: 105 },
      } },
      finish('CLARIFICATION_REQUIRED', ['E1', 'E2']),
    ]);
    expect(result.evaluation.diagnostics).toContain('EVAL_SAFE_STOP_AFTER_SUCCESSFUL_EDIT_OPERATION');
    expect(() => proveSealedHoldoutGeneralNoEditOutcomeV2R({
      manifest: result.cohort, caseId: 'HOLD-02:C2',
      trace: result.trace, evaluation: result.evaluation,
    })).toThrow('SEALED_PROOF_INPUT_PRECONDITION_FAILED');
  });

  it('rejects a forged evaluation even when its receipt is rehashed', async () => {
    const result = await runCase('HOLD-08:C1', [
      { name: 'find_visual_moment', arguments: {
        projectId: 'oe-hold-08', query: 'moving fine-contour subject isolation',
      } },
      finish('CAPABILITY_GAP', ['E1']),
    ]);
    const forged = structuredClone(result.evaluation) as unknown as Record<string, unknown>;
    forged.assessment = 'READY_FOR_PROOF';
    const { receiptSha256: _receipt, ...material } = forged;
    forged.receiptSha256 = hashCanonicalJsonV1(material);
    expect(() => proveSealedHoldoutNoEditOutcomeV2R({
      manifest: result.cohort,
      caseId: 'HOLD-08:C1',
      trace: result.trace,
      evaluation: forged as Parameters<typeof proveSealedHoldoutNoEditOutcomeV2R>[0]['evaluation'],
    })).toThrow('SEALED_PROOF_INPUT_EVALUATION_DRIFT');
  });

  it('does not turn missing resource accounting into a no-edit pass', async () => {
    const result = await runCase('HOLD-06:C1', [
      { name: 'list_user_assets', arguments: { projectId: 'oe-hold-06' } },
    ], false);
    expect(result.evaluation.assessment).toBe('NOT_EVALUATED_RESOURCE_GUARD');
    expect(() => proveSealedHoldoutNoEditOutcomeV2R({
      manifest: result.cohort,
      caseId: 'HOLD-06:C1',
      trace: result.trace,
      evaluation: result.evaluation,
    })).toThrow('SEALED_PROOF_INPUT_PRECONDITION_FAILED');
  });

  it('proves the current V3R2 no-edit path without translating it back to V2', async () => {
    const v2 = await manifest();
    const v3 = buildSealedHoldoutCohortManifestV3R({
      contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R),
      baseManifest: v2,
    });
    const cohort = buildSealedHoldoutCohortManifestV3R2({
      contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2),
      baseManifest: v3,
    });
    const caseId = 'HOLD-06:C1';
    const taskCase = cohort.cases.find((entry) => entry.caseId === caseId)!;
    let turn = 0;
    const calls = [
      { name: 'list_user_assets', arguments: { projectId: 'oe-hold-06' } },
      { name: 'read_project_file', arguments: {
        projectId: 'oe-hold-06', expectedProjectRevision: 'R5',
      } },
      finish('POLICY_BLOCKED', ['E1', 'E2']),
    ];
    const episode = await runBudgetedSealedHoldoutEpisodeV3R2({
      manifest: cohort,
      caseId,
      route: LUNA_ROUTE,
      authorization: {
        version: SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
        manifestSha256: cohort.manifestSha256,
        caseId,
        publicCaseSha256: taskCase.publicCaseSha256,
        routeId: LUNA_ROUTE.routeId,
        claimedModelIdentity: LUNA_ROUTE.claimedModelIdentity,
        routeSha256: hashCanonicalJsonV1(LUNA_ROUTE),
        approvedBy: 'admin', approvedAt: '2026-08-22T00:00:00.000Z',
        maxInputTokensPerTurn: 85_000, absoluteMaxSpendMicroUsd: 5_000_000,
        pricing: {
          normalInputNanoUsdPerToken: 200, cachedInputNanoUsdPerToken: 20,
          cacheWriteNanoUsdPerToken: 250, outputNanoUsdPerToken: 1_200,
        },
      },
      countInputTokens: async (request) => bindSealedHoldoutInputTokenBoundV2R({
        request, inputTokensUpperBound: 1_000,
        method: 'CURRENT_NO_EDIT_PROOF_TEST_BOUND_V1',
      }),
      invoke: async () => {
        const call = calls[turn++];
        return {
          status: 200,
          body: {
            id: `current-no-edit-${turn}`, model: LUNA_ROUTE.model,
            status: 'completed', usage: USAGE,
            output: [{ type: 'function_call', call_id: `call-${turn}`,
              name: call.name, arguments: JSON.stringify(call.arguments) }],
          },
        };
      },
    });
    const trace = buildBudgetedSealedHoldoutSelectedOperationTraceV3R2({
      manifest: cohort, caseId, budgetedEpisode: episode,
    });
    const evaluation = evaluateBudgetedSealedHoldoutTraceV3R2({
      manifest: cohort, caseId, trace,
    });
    const proof = proveSealedHoldoutGeneralNoEditOutcomeV3R2({
      manifest: cohort, caseId, trace, evaluation,
    });
    expect(proof).toMatchObject({
      version: 'EDITRON_OE_SEALED_HOLDOUT_GENERAL_NO_EDIT_SAFETY_PROOF_V3R_2_1',
      assessment: 'PASS_RESEARCH_GENERAL_NO_EDIT_SAFETY',
      manifestSha256: cohort.manifestSha256,
      runtimeBudgetReceiptSha256: trace.runtimeBudgetReceiptSha256,
      stateEffects: [],
    });
  });
});

async function fileSha(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}
