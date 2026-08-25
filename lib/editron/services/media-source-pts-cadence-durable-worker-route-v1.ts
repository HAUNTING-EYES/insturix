import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { withInternalQStashWorkerAuth }
  from '../security/internal-worker-auth';
import {
  assertMediaSourcePtsCadenceDurableWorkerMessageV1,
  MEDIA_SOURCE_PTS_CADENCE_DURABLE_WORKER_ROUTE_ID_V1,
} from './media-source-pts-cadence-durable-dispatch-v1';
import {
  runMediaSourcePtsCadenceDurableRuntimeV1,
  type MediaSourcePtsCadenceDurableRuntimeResultV1,
} from './media-source-pts-cadence-durable-runtime-v1';

export const MEDIA_SOURCE_PTS_CADENCE_DURABLE_WORKER_RESPONSE_VERSION_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_DURABLE_WORKER_RESPONSE_V1_1' as const;

type WorkerHandlerV1 = (
  request: NextRequest,
  context?: unknown,
) => Response | Promise<Response>;

type RuntimeRunnerV1 = (
  input: Readonly<{ jobId: string; workerId: string }>,
) => Promise<MediaSourcePtsCadenceDurableRuntimeResultV1>;

/** Signed ingress for the existing durable PTS runtime; the body is jobId only. */
export function createAuthenticatedMediaSourcePtsCadenceDurableWorkerV1(
  input: Readonly<{
    run?: RuntimeRunnerV1;
    workerId?: string;
  }> = {},
): WorkerHandlerV1 {
  const handler: WorkerHandlerV1 = async (request) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return failure('MEDIA_SOURCE_PTS_CADENCE_WORKER_BODY_INVALID', 400);
    }
    let message: ReturnType<
      typeof assertMediaSourcePtsCadenceDurableWorkerMessageV1
    >;
    try {
      message = assertMediaSourcePtsCadenceDurableWorkerMessageV1(raw);
    } catch {
      return failure('MEDIA_SOURCE_PTS_CADENCE_WORKER_MESSAGE_INVALID', 400);
    }

    let result: MediaSourcePtsCadenceDurableRuntimeResultV1;
    try {
      result = await (input.run ?? runMediaSourcePtsCadenceDurableRuntimeV1)({
        jobId: message.jobId,
        workerId: input.workerId ?? defaultWorkerId(),
      });
    } catch {
      return failure('MEDIA_SOURCE_PTS_CADENCE_WORKER_UNAVAILABLE', 503, 30);
    }
    return responseFor(message.jobId, result);
  };
  return withInternalQStashWorkerAuth(
    handler,
    MEDIA_SOURCE_PTS_CADENCE_DURABLE_WORKER_ROUTE_ID_V1,
  );
}

function responseFor(
  jobId: string,
  result: MediaSourcePtsCadenceDurableRuntimeResultV1,
): Response {
  if (result.kind === 'runtime_unavailable') {
    return failure(
      `MEDIA_SOURCE_PTS_CADENCE_WORKER_${result.reason}`,
      503,
      30,
    );
  }
  if (result.kind === 'retry_wait' || result.kind === 'deferred'
    || result.kind === 'lease_lost'
    || result.kind === 'skipped' && result.reason === 'retry_not_due') {
    return NextResponse.json(successBody(jobId, result), {
      status: 503,
      headers: { 'Retry-After': '30' },
    });
  }
  if (result.kind === 'skipped' && result.reason === 'not_found') {
    return failure('MEDIA_SOURCE_PTS_CADENCE_WORKER_JOB_NOT_FOUND', 404);
  }
  return NextResponse.json(successBody(jobId, result), { status: 200 });
}

function successBody(
  jobId: string,
  result: MediaSourcePtsCadenceDurableRuntimeResultV1,
) {
  return {
    success: true,
    version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_WORKER_RESPONSE_VERSION_V1,
    jobId,
    result,
  };
}

function failure(code: string, status: number, retryAfterSeconds?: number): Response {
  return NextResponse.json({
    success: false,
    version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_WORKER_RESPONSE_VERSION_V1,
    error: { code },
  }, {
    status,
    ...(retryAfterSeconds === undefined
      ? {}
      : { headers: { 'Retry-After': String(retryAfterSeconds) } }),
  });
}

function defaultWorkerId(): string {
  return `media-pts-worker-${randomUUID().replace(/-/g, '')}`;
}
