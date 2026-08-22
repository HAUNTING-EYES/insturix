import { beforeAll, describe, expect, it, vi } from 'vitest';

import { SEALED_H03_GENERATED_SOURCE_V2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-generated-program-v2r';
import { runSealedH03ProviderCohortV3R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-cohort-runner-v3r3';
import { buildSealedH03ProviderOperatorInputV3R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-operator-input-v3r3';
import { createBudgetedH03SourceGeneratorV3R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-row-runner-v3r3';

type OperatorInput = Awaited<ReturnType<typeof buildSealedH03ProviderOperatorInputV3R3>>;
let operatorInput: OperatorInput;

beforeAll(async () => {
  operatorInput = await buildSealedH03ProviderOperatorInputV3R3();
});

describe('sealed H03 provider row/cohort runner V3R3', () => {
  it('records one accepted production candidate from the exact owner-bound request', async () => {
    const runProviderCall = vi.fn(async () => acceptedCall());
    const budgeted = budget('PRODUCTION_BUDGET', runProviderCall);
    const result = await budgeted.generateSource(initialRequest());
    expect(result).toMatchObject({
      source: SEALED_H03_GENERATED_SOURCE_V2R,
      modelId: 'gpt-5.6-luna',
      orchestratorSpecSha256: operatorInput.sourceRequest.orchestratorSpecSha256,
    });
    expect(runProviderCall).toHaveBeenCalledTimes(1);
    expect(budgeted.snapshot()).toMatchObject({
      providerGeneratedCandidates: 1,
      providerHttpAttempts: 1,
      actualSpendUsd: 0.001,
      accountingDisposition: 'EXACT_FROM_PROVIDER_RECEIPTS',
      indeterminateProviderFailures: [],
    });
  });

  it('blocks a production repair before dispatch and reserves failed transport attempts', async () => {
    const forbiddenProviderCall = vi.fn();
    const production = budget('PRODUCTION_BUDGET', forbiddenProviderCall);
    await expect(production.generateSource({
      candidateOrdinal: 1,
      repair: { repairOrdinal: 1 },
    } as never)).rejects.toThrow('SEALED_H03_ARM_BUDGET_EXHAUSTED_BEFORE_PROVIDER');
    expect(forbiddenProviderCall).not.toHaveBeenCalled();

    const transportFailure = vi.fn(async () => {
      throw new Error('provider connection failed');
    });
    const capability = budget('CAPABILITY_CEILING', transportFailure);
    await expect(capability.generateSource(initialRequest())).rejects.toThrow(
      'provider connection failed',
    );
    expect(capability.snapshot()).toMatchObject({
      providerGeneratedCandidates: 1,
      providerHttpAttempts: 2,
      actualSpendUsd: 0,
      accountingDisposition: 'MAXIMUM_HTTP_ATTEMPTS_RESERVED_FOR_INDETERMINATE_PROVIDER_FAILURE',
    });
  });

  it('rejects missing paid authorization before creating a cohort run', async () => {
    await expect(runSealedH03ProviderCohortV3R3({
      ...operatorInput,
      authorization: {} as never,
      environment: {},
      mediaManifest: { manifestSha256: 'f'.repeat(64) } as never,
      outputRoot: 'must-not-be-created',
      executionCommitSha: 'a'.repeat(40),
      runnerSourceSha256: 'b'.repeat(64),
      sandboxEnvironment: { snapshotId: 'snapshot', snapshotCommit: 'commit' },
      repoRoot: process.cwd(),
    })).rejects.toThrow('SEALED_H03_PAID_AUTHORIZATION_DRIFT');
  });
});

function budget(
  armId: 'PRODUCTION_BUDGET' | 'CAPABILITY_CEILING',
  runProviderCall: unknown,
) {
  const arm = operatorInput.cohortManifest.budgetArms.find((entry) => entry.armId === armId);
  if (!arm) throw new Error(`test arm missing: ${armId}`);
  return createBudgetedH03SourceGeneratorV3R3({
    arm,
    routeEntry: operatorInput.providerManifest.routes[0],
    environment: { OPENAI_API_KEY: 'test-key' },
    runProviderCall: runProviderCall as never,
  });
}

function initialRequest() {
  const routeEntry = operatorInput.providerManifest.routes[0];
  return {
    route: routeEntry.route,
    packet: operatorInput.sourceRequest.packet,
    arguments: operatorInput.sourceRequest.arguments,
    orchestratorSpecSha256: operatorInput.sourceRequest.orchestratorSpecSha256,
    candidateOrdinal: 0 as const,
  };
}

function acceptedCall() {
  return {
    run: {
      disposition: 'ARTIFACT_ACCEPTED',
      artifact: { source: SEALED_H03_GENERATED_SOURCE_V2R },
      attempts: [{
        disposition: 'ARTIFACT_ACCEPTED',
        promptHash: 'b'.repeat(64),
        providerModel: 'gpt-5.6-luna',
        providerCostUsd: 0.001,
      }],
    },
    preflightCounts: [],
  };
}
