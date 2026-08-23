import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { withInternalQStashWorkerAuth }
  from '../security/internal-worker-auth';
import { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import {
  runEditorialPlanDurableWorkerV1,
  type EditorialPlanDurableExecutionOwnerV1,
  type EditorialPlanDurableTerminalSettlementOwnerV1,
  type EditorialPlanDurableWorkerResultV1,
} from './editorial-plan-durable-worker-v1';
import {
  assertEditorialPlanProductWorkerMessageV1,
} from './editorial-plan-product-dispatch-v1';
import { EditorialPlanStoreV1 } from './editorial-plan-store-v1';

export const EDITORIAL_PLAN_PRODUCT_WORKER_RESPONSE_VERSION_V1 =
  'EDITRON_EDITORIAL_PLAN_PRODUCT_WORKER_RESPONSE_V1_1' as const;
export const EDITORIAL_PLAN_PRODUCT_WORKER_ROUTE_ID_V1 =
  'editorial-plan' as const;
export const EDITORIAL_PLAN_EXECUTION_OWNER_NOT_CONFIGURED_V1 =
  'EDITORIAL_PLAN_EXECUTION_OWNER_NOT_CONFIGURED' as const;
export const EDITORIAL_PLAN_TERMINAL_SETTLEMENT_OWNER_NOT_CONFIGURED_V1 =
  'EDITORIAL_PLAN_TERMINAL_SETTLEMENT_OWNER_NOT_CONFIGURED' as const;

type ProductWorkerHandler = (
  request: NextRequest,
  context?: unknown,
) => Response | Promise<Response>;

/**
 * Builds signed product ingress around the sole durable PlanService worker.
 * A route may export this handler only after supplying one explicit execution
 * owner; absent product composition is a 503 and never consumes a job attempt.
 */
export function createAuthenticatedEditorialPlanProductWorkerV1(
  input: Readonly<{
    executionOwner?: Readonly<EditorialPlanDurableExecutionOwnerV1>;
    terminalSettlementOwner?: Readonly<EditorialPlanDurableTerminalSettlementOwnerV1>;
    jobStore?: DurableWorkflowJobStoreV1;
    planStore?: EditorialPlanStoreV1;
    workerId?: string;
    clock?: () => Date;
    retryDelayMs?: number;
  }>,
): ProductWorkerHandler {
  const handler: ProductWorkerHandler = async (request) => {
    if (!input.executionOwner) {
      return failure(
        EDITORIAL_PLAN_EXECUTION_OWNER_NOT_CONFIGURED_V1,
        503,
      );
    }
    if (!input.terminalSettlementOwner) {
      return failure(
        EDITORIAL_PLAN_TERMINAL_SETTLEMENT_OWNER_NOT_CONFIGURED_V1,
        503,
      );
    }
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return failure('EDITORIAL_PLAN_WORKER_BODY_INVALID', 400);
    }
    let message: ReturnType<typeof assertEditorialPlanProductWorkerMessageV1>;
    try {
      message = assertEditorialPlanProductWorkerMessageV1(raw);
    } catch {
      return failure('EDITORIAL_PLAN_WORKER_MESSAGE_INVALID', 400);
    }

    let result: EditorialPlanDurableWorkerResultV1;
    try {
      result = await runEditorialPlanDurableWorkerV1({
        jobStore: input.jobStore ?? new DurableWorkflowJobStoreV1(),
        planStore: input.planStore ?? new EditorialPlanStoreV1(),
        jobId: message.jobId,
        workerId: input.workerId ?? defaultWorkerId(),
        executionOwner: input.executionOwner,
        terminalSettlementOwner: input.terminalSettlementOwner,
        ...(input.clock ? { clock: input.clock } : {}),
        ...(input.retryDelayMs ? { retryDelayMs: input.retryDelayMs } : {}),
      });
    } catch {
      return failure('EDITORIAL_PLAN_WORKER_UNAVAILABLE', 503);
    }
    return responseFor(message.jobId, result);
  };
  return withInternalQStashWorkerAuth(
    handler,
    EDITORIAL_PLAN_PRODUCT_WORKER_ROUTE_ID_V1,
  );
}

function responseFor(
  jobId: string,
  result: EditorialPlanDurableWorkerResultV1,
): Response {
  if (result.kind === 'retry_wait') {
    return NextResponse.json(successBody(jobId, result), {
      status: 503,
      headers: { 'Retry-After': '30' },
    });
  }
  if (result.kind === 'skipped' && result.reason === 'retry_not_due') {
    return NextResponse.json(successBody(jobId, result), {
      status: 503,
      headers: { 'Retry-After': '30' },
    });
  }
  if (result.kind === 'skipped' && result.reason === 'not_found') {
    return failure('EDITORIAL_PLAN_WORKER_JOB_NOT_FOUND', 404);
  }
  return NextResponse.json(successBody(jobId, result), { status: 200 });
}

function successBody(
  jobId: string,
  result: EditorialPlanDurableWorkerResultV1,
) {
  return {
    success: true,
    version: EDITORIAL_PLAN_PRODUCT_WORKER_RESPONSE_VERSION_V1,
    jobId,
    result,
  };
}

function failure(code: string, status: number): Response {
  return NextResponse.json({
    success: false,
    version: EDITORIAL_PLAN_PRODUCT_WORKER_RESPONSE_VERSION_V1,
    error: { code },
  }, { status });
}

function defaultWorkerId(): string {
  return `editorial-plan-worker-${randomUUID().replace(/-/g, '')}`;
}
