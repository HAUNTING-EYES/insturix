import { NextRequest, NextResponse } from 'next/server';

import { withInternalQStashWorkerAuth } from '@/lib/editron/security/internal-worker-auth';
import {
  assertMediaSourceQualificationWorkerMessageV1,
  MEDIA_SOURCE_QUALIFICATION_WORKER_ROUTE_ID_V1,
  runMediaSourceQualificationWorkerV1,
} from '@/lib/editron/services/media-source-qualification-runtime-v1';
import { triggerQualifiedMediaSourcePtsCadenceV3 }
  from '@/lib/editron/services/media-source-pts-cadence-product-trigger-v3';

export const runtime = 'nodejs';
export const maxDuration = 180;

async function handler(request: NextRequest): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return failure('MEDIA_SOURCE_QUALIFICATION_BODY_INVALID', 400);
  }

  let message: ReturnType<typeof assertMediaSourceQualificationWorkerMessageV1>;
  try {
    message = assertMediaSourceQualificationWorkerMessageV1(raw);
  } catch {
    return failure('MEDIA_SOURCE_QUALIFICATION_MESSAGE_INVALID', 400);
  }

  try {
    const result = await runMediaSourceQualificationWorkerV1(message);
    const cadenceDispatch = await triggerQualifiedMediaSourcePtsCadenceV3(message);
    if (cadenceDispatch.disposition === 'DELIVERY_DEFERRED') {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MEDIA_SOURCE_PTS_CADENCE_DELIVERY_DEFERRED' },
          result,
          cadenceDispatch,
        },
        { status: 503, headers: { 'Retry-After': '30' } },
      );
    }
    return NextResponse.json({ success: true, result, cadenceDispatch });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'MEDIA_SOURCE_QUALIFICATION_WORKER_UNAVAILABLE' } },
      { status: 503, headers: { 'Retry-After': '30' } },
    );
  }
}

function failure(code: string, status: number): Response {
  return NextResponse.json({ success: false, error: { code } }, { status });
}

export const POST = withInternalQStashWorkerAuth(handler, MEDIA_SOURCE_QUALIFICATION_WORKER_ROUTE_ID_V1);
