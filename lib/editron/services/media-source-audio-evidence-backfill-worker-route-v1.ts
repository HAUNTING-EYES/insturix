import { NextRequest, NextResponse } from 'next/server';

import { withInternalQStashWorkerAuth }
  from '../security/internal-worker-auth';
import {
  MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_DELIVERY_POLICY_V1,
  MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_WORKER_ROUTE_ID_V1,
  assertMediaSourceAudioEvidenceBackfillWorkerMessageV1,
  dispatchMediaSourceAudioEvidenceBackfillMessageV1,
  type MediaSourceAudioEvidenceBackfillDispatchResultV1,
  type MediaSourceAudioEvidenceBackfillWorkerMessageV1,
} from './media-source-audio-evidence-backfill-dispatch-v1';
import {
  createMediaSourceAudioEvidenceBackfillRuntimeV1,
  type MediaSourceAudioEvidenceBackfillRuntimeNextResultV1,
  type MediaSourceAudioEvidenceBackfillRuntimeV1,
} from './media-source-audio-evidence-backfill-runtime-v1';
import type { MediaSourceAudioEvidenceBackfillRunInitializeResultV1 }
  from './media-source-audio-evidence-backfill-run-owner-v1';
import type { MediaSourceAudioEvidenceBackfillRunRecordV1 }
  from './media-source-audio-evidence-backfill-run-record-v1';

export const MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_WORKER_RESPONSE_VERSION_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_WORKER_RESPONSE_V1' as const;

type WorkerHandlerV1 = (
  request: NextRequest,
  context?: unknown,
) => Response | Promise<Response>;
type DispatcherV1 = typeof dispatchMediaSourceAudioEvidenceBackfillMessageV1;

export function createAuthenticatedMediaSourceAudioEvidenceBackfillWorkerV1(
  input: Readonly<{
    runtime?: MediaSourceAudioEvidenceBackfillRuntimeV1;
    dispatch?: DispatcherV1;
  }> = {},
): WorkerHandlerV1 {
  let runtime: MediaSourceAudioEvidenceBackfillRuntimeV1 | null = null;
  const resolveRuntime = () => {
    runtime ??= input.runtime ?? createMediaSourceAudioEvidenceBackfillRuntimeV1();
    return runtime;
  };
  const dispatch = input.dispatch ?? dispatchMediaSourceAudioEvidenceBackfillMessageV1;
  const handler: WorkerHandlerV1 = async (request) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return failure('WORKER_BODY_INVALID', 400);
    }
    let message: Readonly<MediaSourceAudioEvidenceBackfillWorkerMessageV1>;
    try {
      message = assertMediaSourceAudioEvidenceBackfillWorkerMessageV1(raw);
    } catch {
      return failure('WORKER_MESSAGE_INVALID', 400);
    }
    try {
      if (message.kind === 'INITIALIZE') {
        const result = await resolveRuntime().initialize({
          migrationRunId: message.migrationRunId,
          policyVersion: message.policyVersion,
        });
        return responseWithContinuation(message.batchLimit, result, dispatch);
      }
      const result = await resolveRuntime().runNextBatch({
        migrationRunId: message.migrationRunId,
        expectedRecordSha256: message.expectedRecordSha256,
        limit: message.batchLimit,
      });
      return responseForBatch(message.batchLimit, result, dispatch);
    } catch {
      return failure('WORKER_UNAVAILABLE', 503, 30);
    }
  };
  return withInternalQStashWorkerAuth(
    handler,
    MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_WORKER_ROUTE_ID_V1,
  );
}

async function responseForBatch(
  batchLimit: number,
  result: MediaSourceAudioEvidenceBackfillRuntimeNextResultV1,
  dispatch: DispatcherV1,
): Promise<Response> {
  if (result.disposition === 'RUN_NOT_FOUND') {
    return failure('RUN_NOT_FOUND', 404);
  }
  if (result.disposition === 'RETRY_REQUIRED') {
    return NextResponse.json(successBody(result, null), {
      status: 503,
      headers: { 'Retry-After': '30' },
    });
  }
  if ((result.disposition === 'BATCH_COMMITTED'
      || result.disposition === 'SUPERSEDED')
    && result.record.status === 'RUNNING') {
    return responseWithContinuation(batchLimit, result, dispatch);
  }
  return NextResponse.json(successBody(result, null), { status: 200 });
}

async function responseWithContinuation(
  batchLimit: number,
  result: MediaSourceAudioEvidenceBackfillRunInitializeResultV1
    | MediaSourceAudioEvidenceBackfillRuntimeNextResultV1,
  dispatch: DispatcherV1,
): Promise<Response> {
  const record = resultRecord(result);
  if (record.status !== 'RUNNING') {
    return NextResponse.json(successBody(result, null), { status: 200 });
  }
  const continuation = await dispatch({
    message: {
      schemaVersion: 1,
      kind: 'RUN_NEXT_BATCH',
      migrationRunId: record.migrationRunId,
      expectedRecordSha256: record.recordSha256,
      batchLimit,
    },
    deliveryPolicy: MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_DELIVERY_POLICY_V1,
  });
  const confirmed = continuation.disposition !== 'UNCONFIRMED';
  return NextResponse.json(successBody(result, continuation), {
    status: confirmed ? 200 : 503,
    ...(confirmed ? {} : { headers: { 'Retry-After': '30' } }),
  });
}

function resultRecord(
  result: MediaSourceAudioEvidenceBackfillRunInitializeResultV1
    | MediaSourceAudioEvidenceBackfillRuntimeNextResultV1,
): MediaSourceAudioEvidenceBackfillRunRecordV1 {
  if ('record' in result) return result.record;
  throw new Error('MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_WORKER_RECORD_MISSING');
}

function successBody(
  result: MediaSourceAudioEvidenceBackfillRunInitializeResultV1
    | MediaSourceAudioEvidenceBackfillRuntimeNextResultV1,
  continuation: MediaSourceAudioEvidenceBackfillDispatchResultV1 | null,
) {
  return {
    success: true,
    version: MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_WORKER_RESPONSE_VERSION_V1,
    result,
    continuation,
  };
}

function failure(
  code: string,
  status: number,
  retryAfterSeconds?: number,
): Response {
  return NextResponse.json({
    success: false,
    version: MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_WORKER_RESPONSE_VERSION_V1,
    error: { code: `MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_${code}` },
  }, {
    status,
    ...(retryAfterSeconds === undefined
      ? {}
      : { headers: { 'Retry-After': String(retryAfterSeconds) } }),
  });
}
