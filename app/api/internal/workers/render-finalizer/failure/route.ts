import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';

import { parseRenderFinalizationFailureEnvelope } from '@/lib/editron/services/render-finalization-dispatch';
import { projectService } from '@/lib/editron/services/project-service';
import {
  failJobFinalization,
  failProjectRenderJobFinalizationV1,
} from '@/lib/editron/services/render-job-service';

export const runtime = 'nodejs';
export const maxDuration = 30;

async function handler(request: NextRequest) {
  let failure: ReturnType<typeof parseRenderFinalizationFailureEnvelope>;
  try {
    failure = parseRenderFinalizationFailureEnvelope(
      await request.json().catch(() => null),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[RenderFinalizerFailure] Invalid callback: ${detail.slice(0, 500)}`);
    return NextResponse.json(
      { success: false, error: 'Invalid render finalization failure callback.' },
      { status: 400 },
    );
  }

  try {
    const strictAuthorization = failure.message.projectRenderAuthorization;
    let failed: boolean;
    if (strictAuthorization) {
      let currentProjectRevision;
      try {
        currentProjectRevision = await projectService.getProjectRevision(
          strictAuthorization.ownerId,
          strictAuthorization.projectId,
        );
      } catch (error) {
        if (isProjectNotFound(error)) {
          return NextResponse.json({ success: true, skipped: 'project_not_current' });
        }
        throw error;
      }
      const strictFailure = await failProjectRenderJobFinalizationV1({
        authorization: strictAuthorization,
        currentProjectRevision,
        claimToken: failure.message.claimToken,
        error: failure.error,
      });
      failed = strictFailure.ok;
    } else {
      failed = await failJobFinalization({
        jobId: failure.message.jobId,
        claimToken: failure.message.claimToken,
        error: failure.error,
      });
    }
    if (!failed) {
      return NextResponse.json({ success: true, skipped: 'stale_finalization_claim' });
    }
    console.error(`[RenderFinalizerFailure] ${failure.message.jobId}: ${failure.error}`);
    return NextResponse.json({ success: true, jobId: failure.message.jobId });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[RenderFinalizerFailure] Reconciliation failed: ${detail.slice(0, 500)}`);
    return NextResponse.json(
      { success: false, error: 'Render finalization failure reconciliation failed.' },
      { status: 500 },
    );
  }
}

function isProjectNotFound(error: unknown): boolean {
  return error !== null
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'PROJECT_NOT_FOUND_OR_FORBIDDEN';
}

const hasSigningKeys = Boolean(
  process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY,
);
const signingUnavailable = async () => NextResponse.json(
  { success: false, error: 'QStash signature verification is not configured.' },
  { status: 503 },
);

export const POST = process.env.NODE_ENV === 'production'
  ? hasSigningKeys
    ? verifySignatureAppRouter(handler)
    : signingUnavailable
  : handler;
