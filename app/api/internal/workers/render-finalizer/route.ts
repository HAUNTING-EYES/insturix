import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';

import {
  RenderJobChapterOrchestrationSchema,
  RenderJobChapterOutputSchema,
  type RenderJobChapterOrchestrationStateV1,
} from '@/lib/editron/schemas/render-job';
import {
  RenderFinalizationJobMessageSchema,
  type RenderFinalizationJobMessage,
} from '@/lib/editron/services/render-finalization-dispatch';
import {
  ProjectArtifactProjectRevisionSchema,
  sameProjectArtifactRevisionV1,
} from '@/lib/editron/services/project-artifact-invalidation-v1';
import { finalizeRenderArtifact } from '@/lib/editron/services/render-finalizer-client';
import { beginChapterParentOrchestrationFinalizingV1 } from '@/lib/editron/services/chapter-parent-orchestration-v1';
import { projectService } from '@/lib/editron/services/project-service';
import {
  completeJobFinalization,
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
  const chapterParent = readChapterParentIdentity(job, strictAuthorization);
  if (
    strictAuthorization
    && isChapterParentAuthorization(strictAuthorization)
    && hasChapterOrchestration(job)
    && !chapterParent
  ) {
    throw new Error('Strict chapter parent identity is not provably current.');
  }
  if (job.status === 'done' || job.status === 'error') {
    if (strictAuthorization && job.artifactCleanup?.state === 'PENDING') {
      const fenced = await requireStaleFinalizationFence({
        authorization: strictAuthorization,
        observedProjectRevision: initialProjectRevision,
        claimToken: message.claimToken,
        error: 'Terminal render retains pending cleanup work.',
      });
      if (
        fenced.status === 'ALREADY_TERMINAL'
        && !strictAuthorization.jobId.startsWith('chr_')
      ) {
        throw new Error('Strict terminal render cleanup handoff was not proved.');
      }
      if (chapterParent && fenced.status !== 'ALREADY_TERMINAL') {
        return NextResponse.json({ success: true, skipped: 'job_already_terminal' });
      }
    }
    if (chapterParent && job.status === 'done') {
      const aggregateOutput = chapterOutputFromFinalizationMessage(message);
      const finalizedOutput = chapterFinalizedOutput(job);
      if (
        !aggregateOutput
        || !finalizedOutput
        || job.finalization?.sourceOutputUrl !== aggregateOutput.url
        || job.finalization.sourceOutputSize !== aggregateOutput.sizeBytes
      ) {
        throw new Error('Strict chapter finalization output identity is not provable.');
      }
      if (chapterParent.state !== 'COMPLETED') {
        throw new Error('Strict chapter parent completion was not durably committed.');
      }
      return NextResponse.json({ success: true, jobId: message.jobId });
    }
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

  const chapterAggregateOutput = chapterParent
    ? chapterOutputFromFinalizationMessage(message)
    : null;
  if (chapterParent) {
    if (!chapterAggregateOutput) {
      throw new Error('Strict chapter finalization source output is not provable.');
    }
    if (!strictAuthorization) {
      throw new Error('Strict chapter authorization is required for parent admission.');
    }
    const chapterProjectRevision = await requireCurrentChapterProjectRevision({
      authorization: strictAuthorization,
      observedProjectRevision: initialProjectRevision,
    });
    await ensureChapterParentFinalizing({
      authorization: strictAuthorization,
      currentProjectRevision: chapterProjectRevision,
      identity: chapterParent,
      aggregateOutput: chapterAggregateOutput,
    });
  }

  const result = await finalizeRenderArtifact({
    inputUrl: message.sourceOutputUrl,
    jobId: message.jobId,
    expectedDurationMs: message.expectedDurationMs,
  });
  const completed = strictAuthorization
    ? await projectService.completeProjectRenderJobFinalizationTransactionV1({
        authorization: strictAuthorization,
        claimToken: message.claimToken,
        result,
      })
    : await completeJobFinalization({
        jobId: message.jobId,
        claimToken: message.claimToken,
        result,
      });
  if (typeof completed === 'boolean') {
    if (!completed) {
      return NextResponse.json({ success: true, skipped: 'claim_changed_during_finalization' });
    }
  } else if (!completed.ok) {
    if (completed.reason === 'JOB_STATE_NOT_ACTIVE') {
      return NextResponse.json({ success: true, skipped: 'claim_changed_during_finalization' });
    }
    throw new Error(
      `Strict render publication state is not provably safe: ${completed.reason}.`,
    );
  } else if (completed.status !== 'CURRENT') {
    return NextResponse.json({ success: true, skipped: 'claim_changed_during_finalization' });
  }
  return NextResponse.json({ success: true, jobId: message.jobId });
}

type ChapterParentIdentity = {
  chapterCount: number;
  chapterLayoutManifestHash: string;
  selectedRegion: string;
  state: RenderJobChapterOrchestrationStateV1;
};

type ChapterOutput = {
  url: string;
  sizeBytes: number;
};

function isChapterParentAuthorization(
  authorization: RenderFinalizationJobMessage['projectRenderAuthorization'] | null | undefined,
): authorization is NonNullable<RenderFinalizationJobMessage['projectRenderAuthorization']> {
  return authorization?.jobId !== undefined
    && /^chr_[A-Za-z0-9_-]{12}$/.test(authorization.jobId);
}

function hasChapterOrchestration(job: unknown): boolean {
  return isRecord(job) && job.chapterOrchestration !== undefined;
}

function readChapterParentIdentity(
  job: unknown,
  authorization: RenderFinalizationJobMessage['projectRenderAuthorization'] | null | undefined,
): ChapterParentIdentity | null {
  if (!isChapterParentAuthorization(authorization) || !isRecord(job)) return null;
  if (job._id !== authorization.jobId) return null;
  const parsed = RenderJobChapterOrchestrationSchema.safeParse(job.chapterOrchestration);
  if (!parsed.success) return null;
  const orchestration = parsed.data;
  if (
    orchestration.aggregateJobId !== authorization.jobId
    || orchestration.bindingHash !== authorization.bindingHash
    || orchestration.chapterCount === undefined
    || orchestration.chapterLayoutManifestHash === undefined
  ) {
    return null;
  }
  if (job.providerRenderId !== undefined || job.bucketName !== undefined) return null;
  const dispatch = isRecord(job.dispatch) ? job.dispatch : null;
  if (
    !dispatch
    || dispatch.phase !== 'NOT_ATTEMPTED'
    || dispatch.providerRenderId !== undefined
    || dispatch.providerBucketName !== undefined
    || dispatch.providerRegion !== undefined
    || dispatch.providerBoundAt !== undefined
  ) {
    return null;
  }
  return {
    chapterCount: orchestration.chapterCount,
    chapterLayoutManifestHash: orchestration.chapterLayoutManifestHash,
    selectedRegion: orchestration.selectedRegion,
    state: orchestration.state,
  };
}

function chapterOutputFromFinalizationMessage(
  message: RenderFinalizationJobMessage,
): ChapterOutput | null {
  const parsed = RenderJobChapterOutputSchema.safeParse({
    url: message.sourceOutputUrl,
    sizeBytes: message.sourceOutputSize,
  });
  return parsed.success ? parsed.data : null;
}

function chapterFinalizedOutput(value: unknown): ChapterOutput | null {
  const record = isRecord(value) ? value : null;
  if (!record) return null;
  const nestedFinalization = isRecord(record.finalization) ? record.finalization : null;
  const state = nestedFinalization?.state ?? record.state;
  if (state !== undefined && state !== 'done') return null;
  const parsed = RenderJobChapterOutputSchema.safeParse({
    url: nestedFinalization?.outputUrl ?? nestedFinalization?.url ?? record.outputUrl ?? record.url,
    sizeBytes: nestedFinalization?.outputSize
      ?? nestedFinalization?.sizeBytes
      ?? record.outputSize
      ?? record.sizeBytes,
  });
  return parsed.success ? parsed.data : null;
}

async function ensureChapterParentFinalizing(input: {
  authorization: NonNullable<RenderFinalizationJobMessage['projectRenderAuthorization']>;
  currentProjectRevision: unknown;
  identity: ChapterParentIdentity;
  aggregateOutput: ChapterOutput;
}): Promise<void> {
  if (input.identity.state === 'COMPLETED') {
    throw new Error('Strict chapter parent completed before render finalization publication.');
  }
  if (
    input.identity.state !== 'READY_FOR_FINALIZATION'
    && input.identity.state !== 'FINALIZING'
  ) {
    throw new Error('Strict chapter parent is not ready for render finalization.');
  }
  const result = await beginChapterParentOrchestrationFinalizingV1({
    authorization: input.authorization,
    currentProjectRevision: input.currentProjectRevision,
    selectedRegion: input.identity.selectedRegion,
    chapterCount: input.identity.chapterCount,
    chapterLayoutManifestHash: input.identity.chapterLayoutManifestHash,
    aggregateOutput: input.aggregateOutput,
  });
  if (!result.ok || result.state !== 'FINALIZING') {
    throw new Error(
      `Strict chapter parent finalization admission was not proved: ${result.ok ? result.state : result.reason}.`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function requireCurrentChapterProjectRevision(input: {
  authorization: NonNullable<RenderFinalizationJobMessage['projectRenderAuthorization']>;
  observedProjectRevision: unknown;
}): Promise<unknown> {
  const current = await readCurrentProjectRevision(
    input.authorization.ownerId,
    input.authorization.projectId,
  );
  const currentRevision = ProjectArtifactProjectRevisionSchema.safeParse(current);
  const observedRevision = ProjectArtifactProjectRevisionSchema.safeParse(
    input.observedProjectRevision,
  );
  if (
    !currentRevision.success
    || !observedRevision.success
    || !sameProjectArtifactRevisionV1(currentRevision.data, observedRevision.data)
  ) {
    throw new Error('Project changed before strict chapter parent reconciliation.');
  }
  return currentRevision.data;
}

async function requireStaleFinalizationFence(input: {
  authorization: NonNullable<RenderFinalizationJobMessage['projectRenderAuthorization']>;
  observedProjectRevision: unknown | null;
  claimToken: string;
  error: string;
}) {
  const fenced = await projectService.fenceStaleProjectRenderJobFinalizationTransactionV1(input);
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
