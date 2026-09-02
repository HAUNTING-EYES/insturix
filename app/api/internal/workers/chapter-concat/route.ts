/**
 * POST /api/internal/workers/chapter-concat
 *
 * Durable worker for stitching a strict chapter-render job. The renderer first
 * persists an immutable concat target; this route leases that target before
 * calling Modal and writes the exact returned destination identity. Duplicate
 * QStash deliveries can observe RUNNING or DONE, but cannot start a second
 * concat after DONE.
 *
 * Rows without a target are genuine legacy rows. They are quarantined with a
 * migration-required failure. This worker never reconstructs a destination from
 * chapter URLs and never sends the old raw URL body to Modal.
 */

import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { withInternalQStashWorkerAuth } from '@/lib/editron/security/internal-worker-auth';
import {
  assertProjectChapterConcatCurrentnessV1,
  assertProjectChapterConcatLayoutIdentityV1,
  assertProjectChapterConcatResultV1,
  assertProjectChapterConcatWorkerMessageV1,
  assertProjectChapterConcatTargetV1,
  assertProjectChapterConcatTargetBindingV1,
  projectChapterConcatCurrentnessV1,
  PROJECT_CHAPTER_CONCAT_LAYOUT_STALE_ERROR_V1,
  PROJECT_CHAPTER_CONCAT_PROJECT_REVISION_STALE_ERROR_V1,
  type ProjectChapterConcatTargetV1,
} from '@/lib/editron/services/chapter-concat-contract-v1';

export const runtime = 'nodejs';
export const maxDuration = 300;

const CONCAT_LEASE_MS = 15 * 60_000;
const CHAPTER_JOB_ID = /^chr_[A-Za-z0-9_-]{12}$/;

type ChapterConcatJob = {
  _id: string;
  projectId?: string;
  userId?: string;
  ownerId?: string;
  status?: string;
  artifactLifecycleVersion?: unknown;
  artifactState?: unknown;
  retentionState?: unknown;
  artifactInvalidatedAt?: unknown;
  cleanupMaterialization?: unknown;
  concatStatus?: 'queued' | 'running' | 'done' | 'failed';
  concatTarget?: ProjectChapterConcatTargetV1;
  chapterLayoutManifest?: unknown;
  chapterLayoutManifestHash?: unknown;
  chapters?: readonly unknown[];
  concatLease?: {
    claimToken?: string;
    claimedAt?: Date;
    leaseExpiresAt?: Date;
  };
  concatResult?: {
    generation?: string;
    sourceManifestHash?: string;
    outputBucket?: string;
    outputRegion?: string;
    outputKey?: string;
    url?: string;
    sizeBytes?: number;
    chapters?: number;
    completedAt?: Date;
  };
  outputUrl?: string;
  concatError?: string;
};

const ACTIVE_CHAPTER_ARTIFACT_FILTER = {
  artifactLifecycleVersion: 1,
  artifactState: 'ACTIVE',
  retentionState: 'RETAINED',
  artifactInvalidatedAt: { $exists: false },
  cleanupMaterialization: { $exists: false },
} as const;

function activeChapterArtifact(job: ChapterConcatJob | null | undefined): boolean {
  return job?.artifactLifecycleVersion === 1
    && job.artifactState === 'ACTIVE'
    && job.retentionState === 'RETAINED'
    && job.artifactInvalidatedAt === undefined
    && job.cleanupMaterialization === undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Persist only a bounded code/message, never a provider URL or credential. */
function safeErrorCode(error: unknown): string {
  const message = errorMessage(error).trim();
  if (/^[A-Z0-9_:-]{1,180}$/.test(message)) return message;
  if (/returned HTTP 4(?:00|01|03|13|22)/i.test(message)) return 'CHAPTER_CONCAT_PROVIDER_INPUT_REJECTED';
  return 'CHAPTER_CONCAT_TRANSIENT_FAILURE';
}

function isTerminalError(error: unknown): boolean {
  const message = errorMessage(error);
  return message.startsWith('PROJECT_CHAPTER_CONCAT_')
    || message === 'CHAPTER_CONCAT_RESULT_IDENTITY_MISMATCH'
    || message === 'CHAPTER_CONCAT_OUTPUT_DESTINATION_NOT_CONFIGURED'
    || /returned HTTP 4(?:00|01|03|13|22)/i.test(message);
}

function isStaleErrorCode(value: unknown): boolean {
  return value === PROJECT_CHAPTER_CONCAT_PROJECT_REVISION_STALE_ERROR_V1
    || value === PROJECT_CHAPTER_CONCAT_LAYOUT_STALE_ERROR_V1;
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isExactLegacyWorkerMessage(value: unknown): value is { jobId: string } {
  return typeof value === 'object'
    && value !== null
    && Object.keys(value).sort().join(',') === 'jobId'
    && typeof (value as { jobId?: unknown }).jobId === 'string';
}

function targetBindsToJob(
  job: ChapterConcatJob,
  jobId: string,
  target: ProjectChapterConcatTargetV1,
): boolean {
  // userId is the requester and ownerId is the project/billing owner. Both
  // must be present on a strict row; only ownerId is also carried by the full
  // PROJECT_SNAPSHOT binding, so never substitute one identity for the other.
  if (
    typeof job.projectId !== 'string'
    || job.projectId.length === 0
    || typeof job.userId !== 'string'
    || job.userId.length === 0
    || typeof job.ownerId !== 'string'
    || job.ownerId.length === 0
  ) return false;
  try {
    assertProjectChapterConcatTargetBindingV1({
      target,
      jobId,
      ownerId: job.ownerId,
      projectId: job.projectId,
    });
    return true;
  } catch {
    return false;
  }
}

function assertTargetJobIdentity(
  job: ChapterConcatJob,
  jobId: string,
  target: ProjectChapterConcatTargetV1,
): void {
  if (!targetBindsToJob(job, jobId, target)) {
    throw new Error('PROJECT_CHAPTER_CONCAT_JOB_BINDING_MISMATCH');
  }
  assertProjectChapterConcatLayoutIdentityV1(target, {
    layoutManifest: job.chapterLayoutManifest,
    layoutManifestHash: job.chapterLayoutManifestHash,
    chapters: job.chapters,
  });
}

function targetMatchesLiveRevision(
  target: ProjectChapterConcatTargetV1,
  liveRevision: unknown | null,
): boolean {
  if (liveRevision === null) return false;
  try {
    const expected = projectChapterConcatCurrentnessV1(target);
    assertProjectChapterConcatCurrentnessV1({
      ...expected,
      projectRevision: liveRevision,
    }, target);
    return true;
  } catch {
    return false;
  }
}

function isProjectNotFound(error: unknown): boolean {
  return error !== null
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'PROJECT_NOT_FOUND_OR_FORBIDDEN';
}

async function readCurrentProjectRevision(
  target: ProjectChapterConcatTargetV1,
): Promise<unknown | null> {
  const { projectService } = await import('@/lib/editron/services/project-service');
  try {
    return await projectService.getProjectRevision(
      target.projectRenderSnapshotBinding.ownerId,
      target.projectRenderSnapshotBinding.projectId,
    );
  } catch (error) {
    if (isProjectNotFound(error)) return null;
    throw error;
  }
}

type StaleFenceMode = 'unclaimed' | 'claimed' | 'done';

function staleFenceAdmission(
  job: ChapterConcatJob,
  now: Date,
): { mode: StaleFenceMode; claimToken?: string } | null {
  if (job.concatStatus === 'done') return { mode: 'done' };
  if (job.concatStatus === 'queued') return { mode: 'unclaimed' };
  if (job.concatStatus !== 'running') return null;
  if (
    isValidDate(job.concatLease?.leaseExpiresAt)
    && job.concatLease.leaseExpiresAt.getTime() <= now.getTime()
  ) {
    return { mode: 'unclaimed' };
  }
  return typeof job.concatLease?.claimToken === 'string' && job.concatLease.claimToken.length > 0
    ? { mode: 'claimed', claimToken: job.concatLease.claimToken }
    : null;
}

async function fenceStaleChapterConcat(
  collection: {
    updateOne: (...args: any[]) => Promise<any>;
    findOne: (...args: any[]) => Promise<any>;
  },
  input: {
    jobId: string;
    target: ProjectChapterConcatTargetV1;
    mode: StaleFenceMode;
    now: Date;
    claimToken?: string;
    code: string;
  },
): Promise<boolean> {
  const filter: Record<string, unknown> = {
    _id: input.jobId,
    ...ACTIVE_CHAPTER_ARTIFACT_FILTER,
    'concatTarget.generation': input.target.generation,
  };
  if (input.mode === 'claimed') {
    filter.concatStatus = 'running';
    filter['concatLease.claimToken'] = input.claimToken;
  } else if (input.mode === 'done') {
    filter.concatStatus = 'done';
  } else {
    filter.$or = [
      { concatStatus: 'queued' },
      { concatStatus: 'running', 'concatLease.leaseExpiresAt': { $lte: input.now } },
    ];
  }
  const fenced = await collection.updateOne(
    filter,
    {
      $set: {
        status: 'failed',
        concatStatus: 'failed',
        concatError: input.code,
        updatedAt: input.now,
      },
      $unset: {
        concatLease: '',
        concatResult: '',
        outputUrl: '',
      },
    },
  );
  if (fenced?.modifiedCount === 1) return true;
  const latest = await collection.findOne({ _id: input.jobId });
  return !activeChapterArtifact(latest)
    || latest?.concatStatus === 'failed'
    && latest.concatError === input.code;
}

function staleResponse(code: string): NextResponse {
  return NextResponse.json(
    { success: false, status: 'stale', stale: true, error: code },
    { status: 200 },
  );
}

function resultMatchesTarget(
  result: ChapterConcatJob['concatResult'],
  target: ProjectChapterConcatTargetV1,
): result is NonNullable<ChapterConcatJob['concatResult']> {
  if (result === undefined || !isValidDate(result.completedAt)) return false;
  try {
    assertProjectChapterConcatResultV1(resultToContract(result), target);
    return true;
  } catch {
    return false;
  }
}

function resultToContract(result: ChapterConcatJob['concatResult']): unknown {
  if (!result) return null;
  return {
    generation: result.generation,
    sourceManifestHash: result.sourceManifestHash,
    outputBucket: result.outputBucket,
    outputRegion: result.outputRegion,
    outputKey: result.outputKey,
    url: result.url,
    sizeBytes: result.sizeBytes,
    chapters: result.chapters,
  };
}

function invalidDoneResultResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: 'CHAPTER_CONCAT_DONE_RESULT_IDENTITY_INVALID' },
    { status: 500 },
  );
}

function resultResponse(
  job: ChapterConcatJob,
  replayed: boolean,
  target: ProjectChapterConcatTargetV1,
): NextResponse {
  const result = job.concatResult;
  if (!resultMatchesTarget(result, target)) return invalidDoneResultResponse();
  return NextResponse.json({
    success: true,
    replayed,
    generation: result.generation,
    sourceManifestHash: result.sourceManifestHash,
    outputBucket: result.outputBucket,
    outputRegion: result.outputRegion,
    key: result.outputKey,
    url: result.url,
    sizeBytes: result.sizeBytes,
    chapters: result.chapters,
  });
}

function currentStateResponse(job: ChapterConcatJob, now: Date): NextResponse | null {
  if (job.concatStatus === 'done') {
    try {
      if (!job.concatTarget) return invalidDoneResultResponse();
      assertProjectChapterConcatTargetV1(job.concatTarget);
      if (!targetBindsToJob(job, job._id, job.concatTarget)) return invalidDoneResultResponse();
      return resultResponse(job, true, job.concatTarget);
    } catch {
      return invalidDoneResultResponse();
    }
  }
  if (job.concatStatus === 'failed') {
    return NextResponse.json(
      { success: false, error: safeErrorCode(job.concatError || 'CHAPTER_CONCAT_FAILED') },
      { status: 200 },
    );
  }
  if (
    job.concatStatus === 'running'
    && job.concatLease?.leaseExpiresAt instanceof Date
    && job.concatLease.leaseExpiresAt.getTime() > now.getTime()
  ) {
    return NextResponse.json({ success: false, status: 'running' }, { status: 202 });
  }
  return null;
}

async function handler(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid chapter concat message' }, { status: 400 });
    }
    let jobId: unknown;
    let requestedGeneration: string | undefined;
    if (isExactLegacyWorkerMessage(body)) {
      jobId = body.jobId;
    } else {
      try {
        assertProjectChapterConcatWorkerMessageV1(body);
        jobId = body.jobId;
        requestedGeneration = body.generation;
      } catch {
        return NextResponse.json({ error: 'Invalid chapter concat message' }, { status: 400 });
      }
    }
    if (typeof jobId !== 'string' || !CHAPTER_JOB_ID.test(jobId)) {
      return NextResponse.json({ error: 'Invalid jobId' }, { status: 400 });
    }

    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const { CHAPTERS_COLLECTION } = await import('@/lib/editron/services/chapter-renderer');
    const { concatenateChapters } = await import('@/lib/editron/services/chapter-concat-client');

    const db = await getDatabase();
    const collection = db.collection(CHAPTERS_COLLECTION);
    const job = (await collection.findOne({ _id: jobId } as any)) as ChapterConcatJob | null;
    if (!job) return NextResponse.json({ error: 'Chapter render job not found' }, { status: 404 });

    const now = new Date();
    if (
      requestedGeneration !== undefined
      && typeof job.concatTarget?.generation === 'string'
      && job.concatTarget.generation !== requestedGeneration
    ) {
      return NextResponse.json(
        { success: false, error: 'CHAPTER_CONCAT_MESSAGE_TARGET_MISMATCH' },
        { status: 409 },
      );
    }
    if (job.concatStatus === 'failed') {
      return currentStateResponse(job, now)!;
    }

    if (!job.concatTarget) {
      const error = 'CHAPTER_CONCAT_LEGACY_REQUIRES_PROJECT_SNAPSHOT_MIGRATION';
      const quarantined = await collection.updateOne(
        {
          _id: jobId,
          concatStatus: { $in: ['queued', 'running'] },
          concatTarget: { $exists: false },
        } as any,
        {
          $set: {
            status: 'failed',
            concatStatus: 'failed',
            concatError: error,
            updatedAt: now,
          },
          $unset: { concatLease: '' },
        },
      );
      if (quarantined.modifiedCount !== 1) {
        return NextResponse.json(
          { success: false, error: 'CHAPTER_CONCAT_LEGACY_QUARANTINE_NOT_PROVED' },
          { status: 500 },
        );
      }
      return NextResponse.json({ success: false, error }, { status: 200 });
    }
    if (!activeChapterArtifact(job)) {
      const error = job.artifactLifecycleVersion === 1
        ? 'CHAPTER_CONCAT_ARTIFACT_NOT_ACTIVE'
        : 'CHAPTER_CONCAT_ARTIFACT_LIFECYCLE_MIGRATION_REQUIRED';
      return NextResponse.json(
        { success: false, status: 'stale', stale: true, error },
        { status: 200 },
      );
    }

    let target: ProjectChapterConcatTargetV1;
    try {
      assertProjectChapterConcatTargetV1(job.concatTarget);
      assertTargetJobIdentity(job, jobId, job.concatTarget);
      if (requestedGeneration !== undefined && job.concatTarget.generation !== requestedGeneration) {
        throw new Error('CHAPTER_CONCAT_MESSAGE_TARGET_MISMATCH');
      }
      target = job.concatTarget;
    } catch (error: unknown) {
      const code = safeErrorCode(error);
      const failed = await collection.updateOne(
        {
          _id: jobId,
          ...ACTIVE_CHAPTER_ARTIFACT_FILTER,
          concatStatus: { $in: ['queued', 'running'] },
        } as any,
        {
          $set: { status: 'failed', concatStatus: 'failed', concatError: code, updatedAt: now },
          $unset: { concatLease: '' },
        },
      );
      if (failed.modifiedCount !== 1) {
        return NextResponse.json(
          { success: false, error: 'CHAPTER_CONCAT_TERMINAL_WRITE_UNPROVED' },
          { status: 500 },
        );
      }
      return NextResponse.json({ success: false, error: code }, { status: 200 });
    }

    const initialLiveRevision = await readCurrentProjectRevision(target);
    if (!targetMatchesLiveRevision(target, initialLiveRevision)) {
      const admission = staleFenceAdmission(job, now);
      if (!admission || !await fenceStaleChapterConcat(collection, {
        jobId,
        target,
        mode: admission.mode,
        claimToken: admission.claimToken,
        now,
        code: PROJECT_CHAPTER_CONCAT_PROJECT_REVISION_STALE_ERROR_V1,
      })) {
        return NextResponse.json(
          { success: false, error: 'CHAPTER_CONCAT_STALE_FENCE_NOT_PROVED' },
          { status: 500 },
        );
      }
      return staleResponse(PROJECT_CHAPTER_CONCAT_PROJECT_REVISION_STALE_ERROR_V1);
    }

    const terminalState = currentStateResponse(job, now);
    if (terminalState) return terminalState;

    const claimToken = randomUUID();
    const claimed = (await collection.findOneAndUpdate(
      {
        _id: jobId,
        ...ACTIVE_CHAPTER_ARTIFACT_FILTER,
        'concatTarget.generation': requestedGeneration ?? target.generation,
        $or: [
          { concatStatus: 'queued' },
          { concatStatus: 'running', 'concatLease.leaseExpiresAt': { $lte: now } },
        ],
      } as any,
      {
        $set: {
          concatStatus: 'running',
          concatLease: {
            claimToken,
            claimedAt: now,
            leaseExpiresAt: new Date(now.getTime() + CONCAT_LEASE_MS),
          },
          updatedAt: now,
        },
        $inc: { concatAttempts: 1 },
        $unset: { concatError: '' },
      },
      { returnDocument: 'after' },
    )) as ChapterConcatJob | null;

    if (!claimed) {
      const current = (await collection.findOne({ _id: jobId } as any)) as ChapterConcatJob | null;
      if (!current) return NextResponse.json({ error: 'Chapter render job not found' }, { status: 404 });
      if (!activeChapterArtifact(current)) {
        return NextResponse.json(
          { success: false, status: 'stale', stale: true, error: 'CHAPTER_CONCAT_ARTIFACT_NOT_ACTIVE' },
          { status: 200 },
        );
      }
      const response = currentStateResponse(current, new Date());
      if (response) return response;
      return NextResponse.json({ success: false, error: 'CHAPTER_CONCAT_CLAIM_NOT_AVAILABLE' }, { status: 500 });
    }

    if (
      claimed.concatStatus !== 'running'
      || !activeChapterArtifact(claimed)
      || claimed.concatTarget?.generation !== target.generation
      || !targetBindsToJob(claimed, jobId, target)
      || claimed.concatLease?.claimToken !== claimToken
      || !isValidDate(claimed.concatLease.leaseExpiresAt)
      || claimed.concatLease.leaseExpiresAt.getTime() <= now.getTime()
    ) {
      return NextResponse.json(
        { success: false, error: 'CHAPTER_CONCAT_CLAIM_NOT_PROVED' },
        { status: 500 },
      );
    }

    try {
      assertTargetJobIdentity(claimed, jobId, target);
    } catch (error: unknown) {
      const code = safeErrorCode(error);
      const fenced = await fenceStaleChapterConcat(collection, {
        jobId,
        target,
        mode: 'claimed',
        claimToken,
        now: new Date(),
        code,
      });
      if (!fenced) {
        return NextResponse.json(
          { success: false, error: 'CHAPTER_CONCAT_TERMINAL_WRITE_UNPROVED' },
          { status: 500 },
        );
      }
      return isStaleErrorCode(code)
        ? staleResponse(code)
        : NextResponse.json({ success: false, error: code }, { status: 200 });
    }
    const claimedLiveRevision = await readCurrentProjectRevision(target);
    if (!targetMatchesLiveRevision(target, claimedLiveRevision)) {
      const fenced = await fenceStaleChapterConcat(collection, {
        jobId,
        target,
        mode: 'claimed',
        claimToken,
        now: new Date(),
        code: PROJECT_CHAPTER_CONCAT_PROJECT_REVISION_STALE_ERROR_V1,
      });
      if (!fenced) {
        return NextResponse.json(
          { success: false, error: 'CHAPTER_CONCAT_STALE_FENCE_NOT_PROVED' },
          { status: 500 },
        );
      }
      return staleResponse(PROJECT_CHAPTER_CONCAT_PROJECT_REVISION_STALE_ERROR_V1);
    }

    try {
      const result = await concatenateChapters(target);
      const completedAt = new Date();
      const completion = {
        generation: result.generation,
        sourceManifestHash: result.sourceManifestHash,
        outputBucket: result.outputBucket,
        outputRegion: result.outputRegion,
        outputKey: result.outputKey,
        url: result.url,
        sizeBytes: result.sizeBytes,
        chapters: result.chapters,
        completedAt,
      };
      try {
        assertProjectChapterConcatResultV1(resultToContract(completion), target);
      } catch {
        throw new Error('CHAPTER_CONCAT_RESULT_IDENTITY_MISMATCH');
      }
      const publicationJob = (await collection.findOne({ _id: jobId } as any)) as ChapterConcatJob | null;
      if (
        !publicationJob
        || !activeChapterArtifact(publicationJob)
        || publicationJob.concatStatus !== 'running'
        || publicationJob.concatTarget?.generation !== target.generation
        || publicationJob.concatLease?.claimToken !== claimToken
      ) {
        throw new Error('CHAPTER_CONCAT_COMPLETION_WRITE_UNPROVED');
      }
      assertTargetJobIdentity(publicationJob, jobId, target);
      const publicationLiveRevision = await readCurrentProjectRevision(target);
      if (!targetMatchesLiveRevision(target, publicationLiveRevision)) {
        const fenced = await fenceStaleChapterConcat(collection, {
          jobId,
          target,
          mode: 'claimed',
          claimToken,
          now: completedAt,
          code: PROJECT_CHAPTER_CONCAT_PROJECT_REVISION_STALE_ERROR_V1,
        });
        if (!fenced) {
          return NextResponse.json(
            { success: false, error: 'CHAPTER_CONCAT_STALE_FENCE_NOT_PROVED' },
            { status: 500 },
          );
        }
        return staleResponse(PROJECT_CHAPTER_CONCAT_PROJECT_REVISION_STALE_ERROR_V1);
      }
      const completed = await collection.updateOne(
        {
          _id: jobId,
          ...ACTIVE_CHAPTER_ARTIFACT_FILTER,
          concatStatus: 'running',
          'concatLease.claimToken': claimToken,
          'concatTarget.generation': target.generation,
          'concatLease.leaseExpiresAt': { $gt: completedAt },
          ...(typeof publicationJob.chapterLayoutManifestHash === 'string'
            ? { chapterLayoutManifestHash: publicationJob.chapterLayoutManifestHash }
            : {}),
        } as any,
        {
          $set: {
            status: 'completed',
            outputUrl: result.url,
            concatStatus: 'done',
            concatResult: completion,
            updatedAt: completedAt,
          },
          $unset: { concatLease: '', concatError: '' },
        },
      );
      if (completed.modifiedCount !== 1) {
        throw new Error('CHAPTER_CONCAT_COMPLETION_WRITE_UNPROVED');
      }
      return NextResponse.json({ success: true, ...completion, key: completion.outputKey });
    } catch (error: unknown) {
      const code = safeErrorCode(error);
      if (isTerminalError(error)) {
        const failedAt = new Date();
        const failed = await collection.updateOne(
          {
            _id: jobId,
            ...ACTIVE_CHAPTER_ARTIFACT_FILTER,
            concatStatus: 'running',
            'concatLease.claimToken': claimToken,
            'concatTarget.generation': target.generation,
            'concatLease.leaseExpiresAt': { $gt: failedAt },
          } as any,
          {
            $set: { status: 'failed', concatStatus: 'failed', concatError: code, updatedAt: failedAt },
            $unset: { concatLease: '' },
          },
        );
        if (failed.modifiedCount !== 1) {
          return NextResponse.json(
            { success: false, error: 'CHAPTER_CONCAT_TERMINAL_WRITE_UNPROVED' },
            { status: 500 },
          );
        }
        console.error(`[ChapterConcat] Job ${jobId}: terminal failure ${code}`);
        return NextResponse.json({ success: false, error: code }, { status: 200 });
      }

      // Release the lease for QStash retry. If Modal completed but the response
      // was lost, the next delivery uses the same deterministic key; once the
      // completion write is observed, the DONE guard prevents another call.
      const releasedAt = new Date();
      const released = await collection.updateOne(
        {
          _id: jobId,
          ...ACTIVE_CHAPTER_ARTIFACT_FILTER,
          concatStatus: 'running',
          'concatLease.claimToken': claimToken,
          'concatTarget.generation': target.generation,
          'concatLease.leaseExpiresAt': { $gt: releasedAt },
        } as any,
        {
          $set: { concatStatus: 'queued', concatError: code, updatedAt: releasedAt },
          $unset: { concatLease: '' },
        },
      );
      if (released.modifiedCount !== 1) {
        return NextResponse.json(
          { success: false, error: 'CHAPTER_CONCAT_LEASE_RELEASE_UNPROVED' },
          { status: 500 },
        );
      }
      console.error(`[ChapterConcat] Job ${jobId}: retryable failure ${code}`);
      return NextResponse.json({ success: false, error: code }, { status: 500 });
    }
  } catch (error: unknown) {
    const msg = errorMessage(error);
    console.error('[ChapterConcat] Worker error:', msg);
    return NextResponse.json({ success: false, error: 'CHAPTER_CONCAT_WORKER_FAILURE' }, { status: 500 });
  }
}

export const POST = withInternalQStashWorkerAuth(handler, 'chapter-concat');
