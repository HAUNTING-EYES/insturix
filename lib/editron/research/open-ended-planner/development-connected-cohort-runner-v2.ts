import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  runConnectedDevelopmentStage14V2,
  type ConnectedDevelopmentStage14ReceiptV2,
} from './development-connected-stage14-runner-v2';
import {
  decideConnectedDevelopmentStage5V2,
  type ConnectedProceedOrStopDecisionV2,
} from './development-connected-stage5-gate-v2';
import type { ConnectedDevelopmentStage4OwnerV2 } from './development-connected-stage4-delegator-v2';
import {
  DEVELOPMENT_COHORT_TASK_IDS_V2,
  type DevelopmentCohortTaskIdV2,
  type DevelopmentModelRouteV2,
  type DevelopmentTaskCaseV2,
} from './development-cohort-runner-v2';

export interface ConnectedDevelopmentCohortReceiptV2 {
  receiptVersion: 'EDITRON_OE_CONNECTED_DEVELOPMENT_COHORT_RECEIPT_V2';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  handoffMode: 'CONNECTED_SAME_ROUTE_ACTUAL_PRIOR_ARTIFACT_THROUGH_STAGE5';
  routes: ReadonlyArray<Readonly<{
    routeId: string;
    claimedModelIdentity: string;
    costBasis: DevelopmentModelRouteV2['costBasis'];
    rows: ReadonlyArray<Readonly<{
      taskId: DevelopmentCohortTaskIdV2;
      stage14Receipt: Readonly<ConnectedDevelopmentStage14ReceiptV2>;
      stage5Decision: Readonly<ConnectedProceedOrStopDecisionV2>;
    }>>;
  }>>;
  actualProviderCostUsd: number;
  providerCostCoverage: 'COMPLETE' | 'PARTIAL_UNPRICED_ROUTE';
  unpricedRouteIds: readonly string[];
  stage6Disposition: 'PENDING_CONNECTED_PROXY_EXECUTION';
  stage7Disposition: 'PENDING_REAL_HUMAN_REVIEW';
  stateEffects: readonly [];
  receiptHash: string;
}

export async function runConnectedDevelopmentCohortV2(input: {
  tasks: readonly DevelopmentTaskCaseV2[];
  routes: readonly DevelopmentModelRouteV2[];
  ownerForTask: (task: DevelopmentTaskCaseV2) => ConnectedDevelopmentStage4OwnerV2;
}): Promise<Readonly<ConnectedDevelopmentCohortReceiptV2>> {
  validateCohort(input.tasks, input.routes);
  let actualProviderCostUsd = 0;
  const routeReceipts = [];
  for (const route of input.routes) {
    const rows = [];
    for (const task of input.tasks) {
      const stage14Receipt = await runConnectedDevelopmentStage14V2({
        task,
        route,
        owner: input.ownerForTask(task),
      });
      actualProviderCostUsd = Number((actualProviderCostUsd + stage14Receipt.actualProviderCostUsd).toFixed(12));
      rows.push(deepFreezeV1({
        taskId: task.taskId,
        stage14Receipt,
        stage5Decision: decideConnectedDevelopmentStage5V2(stage14Receipt),
      }));
    }
    routeReceipts.push(deepFreezeV1({
      routeId: route.routeId,
      claimedModelIdentity: route.claimedModelIdentity,
      costBasis: route.costBasis,
      rows,
    }));
  }
  const unpricedRouteIds = input.routes
    .filter(({ costBasis }) => costBasis === 'TOKEN_PLAN_CREDITS_UNPRICED')
    .map(({ routeId }) => routeId);
  const material = {
    receiptVersion: 'EDITRON_OE_CONNECTED_DEVELOPMENT_COHORT_RECEIPT_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    handoffMode: 'CONNECTED_SAME_ROUTE_ACTUAL_PRIOR_ARTIFACT_THROUGH_STAGE5' as const,
    routes: routeReceipts,
    actualProviderCostUsd,
    providerCostCoverage: unpricedRouteIds.length ? 'PARTIAL_UNPRICED_ROUTE' as const : 'COMPLETE' as const,
    unpricedRouteIds,
    stage6Disposition: 'PENDING_CONNECTED_PROXY_EXECUTION' as const,
    stage7Disposition: 'PENDING_REAL_HUMAN_REVIEW' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptHash: hashCanonicalJsonV1(material) });
}

function validateCohort(
  tasks: readonly DevelopmentTaskCaseV2[],
  routes: readonly DevelopmentModelRouteV2[],
): void {
  const taskIds = tasks.map(({ taskId }) => taskId);
  if (taskIds.length !== DEVELOPMENT_COHORT_TASK_IDS_V2.length
    || DEVELOPMENT_COHORT_TASK_IDS_V2.some((taskId) => !taskIds.includes(taskId))
    || new Set(taskIds).size !== taskIds.length) throw new Error('CONNECTED_COHORT_TASK_SET_INCOMPLETE');
  if (!routes.length || routes.some(({ routeId, claimedModelIdentity }) =>
    !routeId.trim() || !claimedModelIdentity.trim())
    || new Set(routes.map(({ routeId }) => routeId)).size !== routes.length) {
    throw new Error('CONNECTED_COHORT_ROUTE_SET_INVALID');
  }
}
