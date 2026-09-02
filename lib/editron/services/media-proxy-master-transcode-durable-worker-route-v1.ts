import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { withInternalQStashWorkerAuth }
  from '../security/internal-worker-auth';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_ROUTE_ID_V1,
  assertMediaProxyMasterTranscodeDurableWorkerMessageV1,
} from './media-proxy-master-transcode-durable-dispatch-v1';
import {
  runMediaProxyMasterTranscodeProductRuntimeV1,
  type MediaProxyMasterTranscodeProductRuntimeResultV1,
} from './media-proxy-master-transcode-product-runtime-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_RESPONSE_VERSION_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_RESPONSE_V1_1' as const;

type WorkerHandlerV1 = (
  request: NextRequest,
  context?: unknown,
) => Response | Promise<Response>;

type RuntimeRunnerV1 = (
  input: Readonly<{ jobId: string; workerId: string }>,
) => Promise<MediaProxyMasterTranscodeProductRuntimeResultV1>;

/** Signed ingress for the product proxy runtime; the body is exactly jobId. */
export function createAuthenticatedMediaProxyMasterTranscodeWorkerV1(
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
      return failure('MEDIA_PROXY_MASTER_TRANSCODE_WORKER_BODY_INVALID', 400);
    }

    let message: ReturnType<
      typeof assertMediaProxyMasterTranscodeDurableWorkerMessageV1
    >;
    try {
      message = assertMediaProxyMasterTranscodeDurableWorkerMessageV1(raw);
    } catch {
      return failure(
        'MEDIA_PROXY_MASTER_TRANSCODE_WORKER_MESSAGE_INVALID',
        400,
      );
    }

    let result: MediaProxyMasterTranscodeProductRuntimeResultV1;
    try {
      result = await (
        input.run ?? runMediaProxyMasterTranscodeProductRuntimeV1
      )({
        jobId: message.jobId,
        workerId: input.workerId ?? defaultWorkerId(),
      });
    } catch {
      return failure(
        'MEDIA_PROXY_MASTER_TRANSCODE_WORKER_UNAVAILABLE',
        503,
        30,
      );
    }
    return responseFor(message.jobId, result);
  };

  return withInternalQStashWorkerAuth(
    handler,
    MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_ROUTE_ID_V1,
  );
}

function responseFor(
  jobId: string,
  result: MediaProxyMasterTranscodeProductRuntimeResultV1,
): Response {
  if (result.kind === 'skipped' && result.reason === 'not_found') {
    return failure('MEDIA_PROXY_MASTER_TRANSCODE_WORKER_JOB_NOT_FOUND', 404);
  }
  if (result.kind === 'retry_wait'
    || result.kind === 'lease_lost'
    || result.kind === 'skipped' && result.reason === 'retry_not_due') {
    return NextResponse.json(successBody(jobId, result), {
      status: 503,
      headers: { 'Retry-After': '30' },
    });
  }
  return NextResponse.json(successBody(jobId, result), { status: 200 });
}

function successBody(
  jobId: string,
  result: MediaProxyMasterTranscodeProductRuntimeResultV1,
) {
  return {
    success: true,
    version:
      MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_RESPONSE_VERSION_V1,
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
      MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_RESPONSE_VERSION_V1,
    error: { code },
  }, {
    status,
    ...(retryAfterSeconds === undefined
      ? {}
      : { headers: { 'Retry-After': String(retryAfterSeconds) } }),
  });
}

function defaultWorkerId(): string {
  return `media-proxy-master-transcode-${randomUUID().replace(/-/g, '')}`;
}
