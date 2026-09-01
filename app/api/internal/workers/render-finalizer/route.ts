import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';

import {
  RenderFinalizationJobMessageSchema,
  type RenderFinalizationJobMessage,
} from '@/lib/editron/services/render-finalization-dispatch';
import { finalizeRenderArtifact } from '@/lib/editron/services/render-finalizer-client';
import { projectService } from '@/lib/editron/services/project-service';
import {
  completeJobFinalization,
  completeProjectRenderJobFinalizationV1,
  fenceStaleProjectRenderJobFinalizationV1,
  getCurrentProjectRenderJobV1,
  getProjectRenderJobAuthorizationByAdmissionV1,
} from '@/lib/editron/services/render-job-service';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function handler(request: NextRequest) {
  const parsed = RenderFinalizationJobMessageSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid render finalization job message.' },
      { status: 400 },
    );
  }
  const message = parsed.data;
  try {
    return await finalizeMessage(message);
  } catch (error) {
    const detail = boundedError(error);
    console.error(`[RenderFinalizerWorker] ${message.jobId}: ${detail}`);
    return NextResponse.json(
      { success: false, error: detail },
      { status: 500 },
    );
  }
}

async function finalizeMessage(message: RenderFinalizationJobMessage) {
  const strictAuthorization = message.projectRenderAuthorization;
  const initialProjectRevision = strictAuthorization
    ? await readCurrentProjectRevision(strictAuthorization.ownerId, strictAuthorization.projectId)
    : null;
  if (strictAuthorization && !initialProjectRevision) {
    await requireStaleFinalizationFence({
      authorization: strictAuthorization,
      observedProjectRevision: null,
      claimToken: message.claimToken,
      error: 'Project no longer exists before render finalization.',
    });
    return NextResponse.json({ success: true, skipped: 'project_not_current' });
  }
  const currentStrictJob = strictAuthorization
    ? await getCurrentProjectRenderJobV1({
        authorization: strictAuthorization,
        currentProjectRevision: initialProjectRevision,
      })
    : null;
  if (strictAuthorization && currentStrictJob && !currentStrictJob.ok) {
    if (currentStrictJob.reason === 'PROJECT_REVISION_STALE') {
      await requireStaleFinalizationFence({
        authorization: strictAuthorization,
        observedProjectRevision: initialProjectRevision,
        claimToken: message.claimToken,
        error: 'Project changed before render finalization.',
      });
      return NextResponse.json({ success: true, skipped: 'project_render_not_current' });
    }
    throw new Error(
      `Strict render finalization state is not provably current: ${currentStrictJob.reason}.`,
    );
  }
  const legacyAdmission = strictAuthorization
    ? null
    : await getProjectRenderJobAuthorizationByAdmissionV1({ jobId: message.jobId });
  if (legacyAdmission && legacyAdmission.status !== 'NOT_PROJECT_RENDER_JOB') {
    return NextResponse.json(
      { success: false, error: 'Bound render authorization is required.' },
      { status: 400 },
    );
  }
  const job = currentStrictJob?.ok ? currentStrictJob.job : legacyAdmission?.job;
  if (!job) {
    return NextResponse.json(
      { success: false, error: 'Render job not found.' },
      { status: 404 },
    );
  }
  if (job.status === 'done' || job.status === 'error') {
    return NextResponse.json({ success: true, skipped: 'job_already_terminal' });
  }
  if (
    job.status !== 'finalizing'
    || job.expectedDurationMs !== message.expectedDurationMs
    || job.finalization?.state !== 'running'
    || job.finalization.claimToken !== message.claimToken
    || job.finalization.sourceOutputUrl !== message.sourceOutputUrl
    || job.finalization.sourceOutputSize !== message.sourceOutputSize
  ) {
    return NextResponse.json({ success: true, skipped: 'stale_finalization_claim' });
  }

  const result = await finalizeRenderArtifact({
    inputUrl: message.sourceOutputUrl,
    jobId: message.jobId,
    expectedDurationMs: message.expectedDurationMs,
  });
  const completed = strictAuthorization
    ? await completeStrictFinalization({
        authorization: strictAuthorization,
        claimToken: message.claimToken,
        result,
      })
    : await completeJobFinalization({
        jobId: message.jobId,
        claimToken: message.claimToken,
        result,
      });
  if (typeof completed === 'boolean' ? !completed : !completed.ok) {
    return NextResponse.json({ success: true, skipped: 'claim_changed_during_finalization' });
  }
  return NextResponse.json({ success: true, jobId: message.jobId });
}

async function completeStrictFinalization(input: {
  authorization: NonNullable<RenderFinalizationJobMessage['projectRenderAuthorization']>;
  claimToken: string;
  result: unknown;
}) {
  const currentProjectRevision = await readCurrentProjectRevision(
    input.authorization.ownerId,
    input.authorization.projectId,
  );
  if (!currentProjectRevision) {
    await requireStaleFinalizationFence({
      authorization: input.authorization,
      observedProjectRevision: null,
      claimToken: input.claimToken,
      error: 'Project no longer exists during render finalization.',
    });
    return { ok: false as const };
  }
  const completed = await completeProjectRenderJobFinalizationV1({
    authorization: input.authorization,
    currentProjectRevision,
    claimToken: input.claimToken,
    result: input.result,
  });
  if (!completed.ok && completed.reason === 'PROJECT_REVISION_STALE') {
    await requireStaleFinalizationFence({
      authorization: input.authorization,
      observedProjectRevision: currentProjectRevision,
      claimToken: input.claimToken,
      error: 'Project changed during render finalization.',
    });
  }
  return completed;
}

async function requireStaleFinalizationFence(input: {
  authorization: NonNullable<RenderFinalizationJobMessage['projectRenderAuthorization']>;
  observedProjectRevision: unknown | null;
  claimToken: string;
  error: string;
}) {
  const fenced = await fenceStaleProjectRenderJobFinalizationV1(input);
  if (!fenced.ok) {
    throw new Error(`Strict stale finalization claim could not be fenced: ${fenced.reason}.`);
  }
  return fenced;
}

async function readCurrentProjectRevision(ownerId: string, projectId: string) {
  try {
    return await projectService.getProjectRevision(ownerId, projectId);
  } catch (error) {
    if (isProjectNotFound(error)) return null;
    throw error;
  }
}

function isProjectNotFound(error: unknown): boolean {
  return error !== null
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'PROJECT_NOT_FOUND_OR_FORBIDDEN';
}

function boundedError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return (value.trim() || 'Render finalization failed.').slice(0, 500);
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
