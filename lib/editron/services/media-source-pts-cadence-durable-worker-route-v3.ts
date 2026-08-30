import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { withInternalQStashWorkerAuth }
  from '../security/internal-worker-auth';
import {
  MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_WORKER_ROUTE_ID_V3,
  assertMediaSourcePtsCadenceDurableEpochWorkerMessageV3,
} from './media-source-pts-cadence-durable-dispatch-v3';
import {
  runMediaSourcePtsCadenceDurableEpochRuntimeV3,
  type MediaSourcePtsCadenceDurableEpochRuntimeResultV3,
} from './media-source-pts-cadence-durable-runtime-v3';

export const MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_WORKER_RESPONSE_VERSION_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_WORKER_RESPONSE_V3_1' as const;

type WorkerHandlerV3 = (
  request: NextRequest,
  context?: unknown,
) => Response | Promise<Response>;

type RuntimeRunnerV3 = (
  input: Readonly<{ jobId: string; workerId: string }>,
) => Promise<MediaSourcePtsCadenceDurableEpochRuntimeResultV3>;

/** Signed ingress for the V3 epoch runtime; the body is exactly jobId. */
export function createAuthenticatedMediaSourcePtsCadenceDurableEpochWorkerV3(
  input: Readonly<{
    run?: RuntimeRunnerV3;
    workerId?: string;
  }> = {},
): WorkerHandlerV3 {
  const handler: WorkerHandlerV3 = async (request) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return failure('MEDIA_SOURCE_PTS_CADENCE_EPOCH_WORKER_BODY_INVALID', 400);
    }
    let message: ReturnType<
      typeof assertMediaSourcePtsCadenceDurableEpochWorkerMessageV3
    >;
    try {
      message = assertMediaSourcePtsCadenceDurableEpochWorkerMessageV3(raw);
    } catch {
      return failure(
        'MEDIA_SOURCE_PTS_CADENCE_EPOCH_WORKER_MESSAGE_INVALID',
        400,
      );
    }

    let result: MediaSourcePtsCadenceDurableEpochRuntimeResultV3;
    try {
      result = await (
        input.run ?? runMediaSourcePtsCadenceDurableEpochRuntimeV3
      )({
        jobId: message.jobId,
        workerId: input.workerId ?? defaultWorkerId(),
      });
    } catch {
      return failure(
        'MEDIA_SOURCE_PTS_CADENCE_EPOCH_WORKER_UNAVAILABLE',
        503,
        30,
      );
    }
    return responseFor(message.jobId, result);
  };
  return withInternalQStashWorkerAuth(
    handler,
    MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_WORKER_ROUTE_ID_V3,
  );
}

function responseFor(
  jobId: string,
  result: MediaSourcePtsCadenceDurableEpochRuntimeResultV3,
): Response {
  if (result.kind === 'runtime_unavailable') {
    return failure(
      `MEDIA_SOURCE_PTS_CADENCE_EPOCH_WORKER_${result.reason}`,
      503,
      30,
    );
  }
  if (result.kind === 'retry_wait'
    || result.kind === 'deferred'
    || result.kind === 'lease_lost'
    || result.kind === 'skipped' && result.reason === 'retry_not_due') {
    return NextResponse.json(successBody(jobId, result), {
      status: 503,
      headers: { 'Retry-After': '30' },
    });
  }
  if (result.kind === 'skipped' && result.reason === 'not_found') {
    return failure(
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_WORKER_JOB_NOT_FOUND',
      404,
    );
  }
  return NextResponse.json(successBody(jobId, result), { status: 200 });
}

function successBody(
  jobId: string,
  result: MediaSourcePtsCadenceDurableEpochRuntimeResultV3,
) {
  return {
    success: true,
    version:
      MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_WORKER_RESPONSE_VERSION_V3,
    jobId,
    result,
  };
}

function failure(
  code: string,
  status: number,
  retryAfterSeconds?: number,
): Response {
  return NextResponse.json({
    success: false,
    version:
      MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_WORKER_RESPONSE_VERSION_V3,
    error: { code },
  }, {
    status,
    ...(retryAfterSeconds === undefined
      ? {}
      : { headers: { 'Retry-After': String(retryAfterSeconds) } }),
  });
}

function defaultWorkerId(): string {
  return `media-pts-epoch-worker-${randomUUID().replace(/-/g, '')}`;
}
