import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

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
  buildSealedHoldoutRuntimeAccountingBindingV2R,
  SEALED_HOLDOUT_RUNTIME_ROUTE_BINDING_VERSION_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-runtime-route-binding-v2r';
import { SEALED_HOLDOUT_RUNTIME_PRICE_SNAPSHOT_VERSION_V2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-runtime-route-facts-v2r';
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
  bindSealedHoldoutInputTokenBoundV2R,
  SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-runtime-budget-v2r';
import {
  buildBudgetedSealedHoldoutSelectedOperationTraceV2R,
  buildBudgetedSealedHoldoutSelectedOperationTraceV3R2,
}
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-trace-v2r';
import type { ProviderNativeArgumentHandoffModeV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-result-references-v2r';

export type SealedHoldoutScriptedCallV2R = Readonly<{
  name: string; arguments: Readonly<Record<string, unknown>>;
}>;

const ROUTE = {
  routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
  claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'medium',
} as const;
const USAGE = {
  input_tokens: 100, input_tokens_details: { cached_tokens: 10, cache_write_tokens: 20 },
  output_tokens: 40, output_tokens_details: { reasoning_tokens: 10 }, total_tokens: 140,
};

export async function runScriptedBudgetedSealedHoldoutV2R(input: {
  caseId: string;
  calls: readonly SealedHoldoutScriptedCallV2R[];
  argumentHandoffMode?: ProviderNativeArgumentHandoffModeV2R;
}) {
  const contract = await readFile(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R);
  const manifest = buildSealedHoldoutCohortManifestV2R(
    createHash('sha256').update(contract).digest('hex'),
  );
  const taskCase = manifest.cases.find(({ caseId }) => caseId === input.caseId);
  if (!taskCase) throw new Error(`TEST_SEALED_CASE_MISSING:${input.caseId}`);
  const routeBinding = buildSealedHoldoutRuntimeAccountingBindingV2R({
    manifest,
    caseId: input.caseId,
    route: ROUTE,
    approval: {
      version: SEALED_HOLDOUT_RUNTIME_ROUTE_BINDING_VERSION_V2R,
      pricingSnapshotVersion: SEALED_HOLDOUT_RUNTIME_PRICE_SNAPSHOT_VERSION_V2R,
      operatorId: 'admin',
      approvedAt: '2026-08-22T00:00:00.000Z',
      manifestSha256: manifest.manifestSha256,
      caseId: input.caseId,
      publicCaseSha256: taskCase.publicCaseSha256,
      routeSha256: hashCanonicalJsonV1(ROUTE),
      counterAction: 'LOCAL_OPENAI_O200K_ESTIMATE',
      providerContextEgress: 'DENY',
      maxInputTokensPerTurn: 85_000,
      absoluteMaxSpendMicroUsd: 5_000_000,
      inferenceCallsAuthorized: 0,
    },
    now: '2026-08-22T00:00:00.000Z',
  });
  let turn = 0;
  const budgetedEpisode = await runBudgetedSealedHoldoutEpisodeV2R({
    manifest, caseId: input.caseId, route: ROUTE,
    argumentHandoffMode: input.argumentHandoffMode,
    authorization: routeBinding.authorization,
    countInputTokens: routeBinding.countInputTokens,
    // This is a deterministic local transcript, never a provider transport.
    invoke: async () => {
      const call = input.calls[turn++];
      if (!call) throw new Error('TEST_SCRIPTED_CALL_EXHAUSTED');
      return {
        status: 200,
        body: {
          id: `sealed-proof-${input.caseId}-${turn}`, model: ROUTE.model, status: 'completed',
          usage: USAGE,
          output: [{
            type: 'function_call', call_id: `call-${turn}`, name: call.name,
            arguments: JSON.stringify(call.arguments),
          }],
        },
      };
    },
  });
  const trace = buildBudgetedSealedHoldoutSelectedOperationTraceV2R({
    manifest, caseId: input.caseId, budgetedEpisode,
  });
  const evaluation = evaluateBudgetedSealedHoldoutTraceV2R({
    manifest, caseId: input.caseId, trace,
  });
  return {
    manifest,
    routeBindingReceipt: routeBinding.receipt,
    scriptedProviderTurns: turn,
    budgetedEpisode,
    trace,
    evaluation,
  };
}

/** Current resource-bound test path. It shares the production episode/trace/evaluator
 * owners while replacing provider transport with a deterministic local transcript. */
export async function runScriptedBudgetedSealedHoldoutV3R2(input: {
  caseId: string;
  calls: readonly SealedHoldoutScriptedCallV2R[];
  argumentHandoffMode?: ProviderNativeArgumentHandoffModeV2R;
}) {
  const manifest = await buildCurrentManifestV3R2();
  const taskCase = manifest.cases.find(({ caseId }) => caseId === input.caseId);
  if (!taskCase) throw new Error(`TEST_SEALED_CASE_MISSING:${input.caseId}`);
  let turn = 0;
  const budgetedEpisode = await runBudgetedSealedHoldoutEpisodeV3R2({
    manifest,
    caseId: input.caseId,
    route: ROUTE,
    argumentHandoffMode: input.argumentHandoffMode,
    authorization: {
      version: SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
      manifestSha256: manifest.manifestSha256,
      caseId: input.caseId,
      publicCaseSha256: taskCase.publicCaseSha256,
      routeId: ROUTE.routeId,
      claimedModelIdentity: ROUTE.claimedModelIdentity,
      routeSha256: hashCanonicalJsonV1(ROUTE),
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
      method: 'CURRENT_SCRIPTED_PROOF_TEST_BOUND_V1',
    }),
    // This is a deterministic local transcript, never a provider transport.
    invoke: async () => {
      const call = input.calls[turn++];
      if (!call) throw new Error('TEST_SCRIPTED_CALL_EXHAUSTED');
      return {
        status: 200,
        body: {
          id: `sealed-current-proof-${input.caseId}-${turn}`,
          model: ROUTE.model,
          status: 'completed',
          usage: USAGE,
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
  const trace = buildBudgetedSealedHoldoutSelectedOperationTraceV3R2({
    manifest,
    caseId: input.caseId,
    budgetedEpisode,
  });
  const evaluation = evaluateBudgetedSealedHoldoutTraceV3R2({
    manifest,
    caseId: input.caseId,
    trace,
  });
  return { manifest, scriptedProviderTurns: turn, budgetedEpisode, trace, evaluation };
}

export function finishSealedHoldoutScriptV2R(
  disposition: string,
  evidenceIds: readonly string[],
): SealedHoldoutScriptedCallV2R {
  return {
    name: 'finish_editron_research_episode',
    arguments: {
      disposition, reasonCodes: [`SCRIPTED_${disposition}`], evidenceIds,
      summary: `Scripted ${disposition} terminal for rendered proof.`,
    },
  };
}

async function buildCurrentManifestV3R2() {
  const v2 = buildSealedHoldoutCohortManifestV2R(
    await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
  const v3 = buildSealedHoldoutCohortManifestV3R({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R),
    baseManifest: v2,
  });
  return buildSealedHoldoutCohortManifestV3R2({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2),
    baseManifest: v3,
  });
}

async function fileSha(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}
