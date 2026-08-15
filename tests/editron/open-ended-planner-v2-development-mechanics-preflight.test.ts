import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import frozenPlan from '@/tests/fixtures/editron/open-ended-planner-v2/development-mechanics-preflight-v2.json';
import { buildDevelopmentMechanicsPreflightV2 } from '@/lib/editron/research/open-ended-planner/development-mechanics-preflight-v2';

const apiSource = 'lib/editron/research/open-ended-planner/generated-composition-api-v1.tsx';

async function buildPlan() {
  const bytes = await readFile(apiSource);
  return buildDevelopmentMechanicsPreflightV2({
    generatedCompositionApiImplementationHash: createHash('sha256').update(bytes).digest('hex'),
  });
}

describe('V2-1 connected development mechanics preflight', () => {
  it('rebuilds the frozen no-spend plan exactly', async () => {
    expect(await buildPlan()).toEqual(frozenPlan);
  });

  it('keeps the exact challenger lanes and all four development task classes', async () => {
    const plan = await buildPlan() as unknown as TestPlan;
    expect(plan.routes.map(({ routeId }) => routeId)).toEqual([
      'OPENAI_LUNA', 'OPENAI_TERRA', 'GOOGLE_FLASH', 'QWEN_3_8_MAX',
    ]);
    expect(plan.tasks.map(({ taskId, expectedExecutionForm }) => [taskId, expectedExecutionForm])).toEqual([
      ['DEV-01', 'NATIVE'], ['DEV-02', 'HYBRID'], ['DEV-03', 'NATIVE'], ['DEV-04', 'CAPABILITY_GAP'],
    ]);
    expect(plan.matrix).toHaveLength(16);
  });

  it('corrects the stale whole-trial ceiling without pretending Qwen has comparable USD telemetry', async () => {
    const plan = await buildPlan() as unknown as TestPlan;
    expect(plan.budgetCorrection).toMatchObject({
      supersededV2ZeroWholeTrialProviderCostUsd: 0.67,
      maximumPlanningUsdPerDirectTask: 0.85,
      maximumDirectPlanningSpendUsd: 10.2,
      maximumGeneratedSourceSpendUsd: 4.5,
      maximumCombinedDirectSpendUsd: 14.7,
      qwenUsdComparison: null,
    });
    expect(plan.budgetCorrection.providerStageBudgets.map(({ stage, maxProviderCostUsd }) => [stage, maxProviderCostUsd]))
      .toEqual([[1, 0.35], [2, 0.3], [3, 0.2]]);
  });

  it('blocks every provider row until task evaluators and executors make the connected run truthful', async () => {
    const plan = await buildPlan() as unknown as TestPlan;
    expect(new Set(plan.matrix.map(({ dispatchStatus }) => dispatchStatus))).toEqual(
      new Set(['BLOCKED_ON_CONNECTED_MECHANICS_PRECONDITIONS']),
    );
    expect(plan.operatorConfirmationGate.status).toBe('NOT_REQUESTABLE_UNTIL_CONNECTED_EVALUATORS_AND_EXECUTORS_PASS');
    expect(plan.stateEffects).toEqual([]);
  });

  it('rejects missing or placeholder implementation identity', async () => {
    await expect(buildDevelopmentMechanicsPreflightV2({ generatedCompositionApiImplementationHash: '0'.repeat(64) }))
      .rejects.toThrow(/HASH_INVALID/);
  });
});

interface TestPlan {
  routes: Array<{ routeId: string }>;
  tasks: Array<{ taskId: string; expectedExecutionForm: string }>;
  matrix: Array<{ dispatchStatus: string }>;
  budgetCorrection: {
    providerStageBudgets: Array<{ stage: number; maxProviderCostUsd: number }>;
    [key: string]: unknown;
  };
  operatorConfirmationGate: { status: string };
  stateEffects: unknown[];
}
