import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { withInternalQStashWorkerAuth } from '../security/internal-worker-auth';
import {
  assertNativeMediaFinalRenderPreparationWorkerMessageV1,
} from './native-media-final-render-preparation-durable-dispatch-v1';
import { runNativeMediaFinalRenderPreparationWorkerV1 }
  from './native-media-final-render-preparation-worker-v1';

export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RESPONSE_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RESPONSE_V1' as const;
export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_ROUTE_ID_V1 =
  'native-media-final-render-preparation' as const;
export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RUNNER_NOT_CONFIGURED_V1 =
  'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RUNNER_NOT_CONFIGURED' as const;

type WorkerHandlerV1 = (
  request: NextRequest,
  context?: unknown,
) => Response | Promise<Response>;
type WorkerResultV1 = Awaited<ReturnType<
  typeof runNativeMediaFinalRenderPreparationWorkerV1
>>;
type ProductRunnerV1 = (
  input: Readonly<{ jobId: string; workerId: string }>,
) => Promise<WorkerResultV1>;

/** Signed ingress only. Product composition must supply the complete runner. */
export function createAuthenticatedNativeMediaFinalRenderPreparationWorkerV1(
  input: Readonly<{
    run?: ProductRunnerV1;
    workerId?: string;
  }> = {},
): WorkerHandlerV1 {
  const handler: WorkerHandlerV1 = async (request) => {
    if (!input.run) {
      return failure(NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RUNNER_NOT_CONFIGURED_V1, 503);
    }
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return failure('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_BODY_INVALID', 400);
    }
    let message: ReturnType<
      typeof assertNativeMediaFinalRenderPreparationWorkerMessageV1
    >;
    try {
      message = assertNativeMediaFinalRenderPreparationWorkerMessageV1(raw);
    } catch {
      return failure('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_MESSAGE_INVALID', 400);
    }

    let result: WorkerResultV1;
    try {
      result = await input.run({
        jobId: message.jobId,
        workerId: input.workerId ?? defaultWorkerId(),
      });
    } catch {
      return failure('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_UNAVAILABLE', 503);
    }
    return responseFor(message.jobId, result);
  };
  return withInternalQStashWorkerAuth(
    handler,
    NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_ROUTE_ID_V1,
  );
}

function responseFor(jobId: string, result: WorkerResultV1): Response {
  if (result.kind === 'retry_wait' || result.kind === 'lease_lost'
    || result.kind === 'skipped' && (
      result.reason === 'retry_not_due'
      || result.reason === 'lease_held'
      || result.reason === 'cancel_requested'
      || result.reason === 'attempts_exhausted'
    )) {
    return NextResponse.json(successBody(jobId, result), { status: 503 });
  }
  if (result.kind === 'skipped' && result.reason === 'not_found') {
    return failure('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_JOB_NOT_FOUND', 404);
  }
  return NextResponse.json(successBody(jobId, result), { status: 200 });
}

function successBody(jobId: string, result: WorkerResultV1) {
  return {
    success: true,
    version: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RESPONSE_VERSION_V1,
    jobId,
    result,
  };
}

function failure(code: string, status: number): Response {
  return NextResponse.json({
    success: false,
    version: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RESPONSE_VERSION_V1,
    error: { code },
  }, { status });
}

function defaultWorkerId(): string {
  return `native-final-render-preparation-${randomUUID().replace(/-/g, '')}`;
}
