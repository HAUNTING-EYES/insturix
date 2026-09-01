import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enqueueRenderFinalization } from '@/lib/editron/services/render-finalization-dispatch';
import {
  claimFailedProjectRenderJobFinalizationRetryV1,
  claimFailedJobFinalizationRetry,
  getCurrentProjectRenderJobV1,
  getProjectRenderJobAuthorizationByAdmissionV1,
  releaseFailedProjectRenderJobFinalizationRetryClaimV1,
  releaseFailedJobFinalizationRetryClaim,
} from '@/lib/editron/services/render-job-service';
import { projectService } from '@/lib/editron/services/project-service';
import { sameProjectArtifactRevisionV1 } from '@/lib/editron/services/project-artifact-invalidation-v1';

const RetryFinalizationRequestSchema = z.object({
  jobId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
}).strict();

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ type: 'error', message: 'Unauthorized' }, { status: 401 });
  }

  const parsed = RetryFinalizationRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { type: 'error', code: 'INVALID_RETRY_REQUEST', message: 'A valid render job ID is required.' },
      { status: 400 },
    );
  }

  const lookup = await getProjectRenderJobAuthorizationByAdmissionV1({
    jobId: parsed.data.jobId,
  });
  if (!lookup.ok && lookup.status !== 'NOT_PROJECT_RENDER_JOB') {
    return NextResponse.json({ type: 'error', message: 'Render job not found' }, { status: 404 });
  }
  if (lookup.ok) {
    const projectSnapshot = await projectService.loadProjectForRenderSnapshot(
      userId,
      lookup.authorization.projectId,
    );
    if (
      !projectSnapshot
      || projectSnapshot.ownerId !== lookup.authorization.ownerId
      || projectSnapshot.project.projectId !== lookup.authorization.projectId
    ) {
      return NextResponse.json({ type: 'error', message: 'Render job not found' }, { status: 404 });
    }
    const current = await getCurrentProjectRenderJobV1({
      authorization: lookup.authorization,
      currentProjectRevision: projectSnapshot.revision,
    });
    if (!current.ok) return projectRenderNotCurrent();
    const job = current.job;
    if (job.status === 'done') {
      return NextResponse.json({ type: 'success', data: { state: 'already_done', jobId: job._id } });
    }
    if (job.status === 'finalizing') {
      return NextResponse.json(
        { type: 'success', data: { state: 'already_finalizing', jobId: job._id } },
        { status: 202 },
      );
    }
    if (job.status !== 'error' || job.finalization?.state !== 'failed') {
      return notRetryable();
    }

    const refreshedProjectSnapshot = await projectService.loadProjectForRenderSnapshot(
      userId,
      lookup.authorization.projectId,
    );
    if (
      !refreshedProjectSnapshot
      || refreshedProjectSnapshot.ownerId !== lookup.authorization.ownerId
      || refreshedProjectSnapshot.project.projectId !== lookup.authorization.projectId
    ) {
      return NextResponse.json({ type: 'error', message: 'Render job not found' }, { status: 404 });
    }
    if (!sameProjectArtifactRevisionV1(projectSnapshot.revision, refreshedProjectSnapshot.revision)) {
      return projectRenderNotCurrent();
    }

    const claim = await claimFailedProjectRenderJobFinalizationRetryV1({
      authorization: lookup.authorization,
      currentProjectRevision: refreshedProjectSnapshot.revision,
    });
    if (!claim.ok) return notRetryable();

    try {
      const dispatch = await enqueueRenderFinalization(claim);
      return NextResponse.json(
        {
          type: 'success',
          data: {
            state: 'enqueued',
            jobId: claim.jobId,
            messageId: dispatch.messageId,
          },
        },
        { status: 202 },
      );
    } catch (error) {
      const released = await releaseFailedProjectRenderJobFinalizationRetryClaimV1({
        authorization: claim.authorization,
        currentProjectRevision: refreshedProjectSnapshot.revision,
        claimToken: claim.claimToken,
        error,
      }).catch(() => null);
      if (!released?.ok) {
        console.error(`[RenderFinalizationRetry] Failed to restore strict claim ${claim.claimToken}.`);
      }
      return retryDispatchFailed();
    }
  }

  const job = lookup.job;
  if (job.userId !== userId) {
    return NextResponse.json({ type: 'error', message: 'Render job not found' }, { status: 404 });
  }
  if (job.status === 'done') {
    return NextResponse.json({ type: 'success', data: { state: 'already_done', jobId: job._id } });
  }
  if (job.status === 'finalizing') {
    return NextResponse.json(
      { type: 'success', data: { state: 'already_finalizing', jobId: job._id } },
      { status: 202 },
    );
  }
  if (job.status !== 'error' || job.finalization?.state !== 'failed') {
    return notRetryable();
  }

  const claim = await claimFailedJobFinalizationRetry({ jobId: job._id, userId });
  if (!claim) return notRetryable();

  try {
    const dispatch = await enqueueRenderFinalization(claim);
    return NextResponse.json(
      {
        type: 'success',
        data: {
          state: 'enqueued',
          jobId: claim.jobId,
          messageId: dispatch.messageId,
        },
      },
      { status: 202 },
    );
  } catch (error) {
    const released = await releaseFailedJobFinalizationRetryClaim({
      jobId: claim.jobId,
      claimToken: claim.claimToken,
      error,
    }).catch(() => false);
    if (!released) {
      console.error(`[RenderFinalizationRetry] Failed to restore claim ${claim.claimToken}.`);
    }
    return retryDispatchFailed();
  }
}

function notRetryable() {
  return NextResponse.json(
    {
      type: 'error',
      code: 'FINALIZATION_NOT_RETRYABLE',
      message: 'This render has no retryable preserved finalization artifact.',
    },
    { status: 409 },
  );
}

function retryDispatchFailed() {
  return NextResponse.json(
    {
      type: 'error',
      code: 'FINALIZATION_RETRY_DISPATCH_FAILED',
      message: 'Render finalization could not be queued. The original render was preserved.',
    },
    { status: 503 },
  );
}

function projectRenderNotCurrent() {
  return NextResponse.json(
    {
      type: 'error',
      code: 'PROJECT_ARTIFACT_NOT_CURRENT',
      message: 'Project render admission is no longer current.',
    },
    { status: 409 },
  );
}
