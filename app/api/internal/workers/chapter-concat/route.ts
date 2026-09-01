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
  assertProjectChapterConcatTargetV1,
  projectChapterConcatOutputUrlV1,
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
  concatStatus?: 'queued' | 'running' | 'done' | 'failed';
  concatTarget?: ProjectChapterConcatTargetV1;
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

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function targetBindsToJob(
  job: ChapterConcatJob,
  jobId: string,
  target: ProjectChapterConcatTargetV1,
): boolean {
  // userId is the requester and ownerId is the project/billing owner. Both
  // must be present on a strict row; only ownerId is also carried by the full
  // PROJECT_SNAPSHOT binding, so never substitute one identity for the other.
  return target.parentAdmissionId === jobId
    && typeof job.projectId === 'string'
    && job.projectId.length > 0
    && typeof job.userId === 'string'
    && job.userId.length > 0
    && typeof job.ownerId === 'string'
    && job.ownerId.length > 0
    && target.projectRenderSnapshotBinding.projectId === job.projectId
    && target.projectRenderSnapshotBinding.ownerId === job.ownerId;
}

function resultMatchesTarget(
  result: ChapterConcatJob['concatResult'],
  target: ProjectChapterConcatTargetV1,
): result is NonNullable<ChapterConcatJob['concatResult']> {
  return result !== undefined
    && result.generation === target.generation
    && result.sourceManifestHash === target.sourceManifestHash
    && result.outputBucket === target.outputBucket
    && result.outputRegion === target.outputRegion
    && result.outputKey === target.outputKey
    && result.url === projectChapterConcatOutputUrlV1(target)
    && isPositiveSafeInteger(result.sizeBytes)
    && result.chapters === target.sources.length
    && Number.isInteger(result.chapters)
    && result.chapters > 0
    && isValidDate(result.completedAt);
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
    const body = (await request.json()) as { jobId?: unknown };
    const jobId = body?.jobId;
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
    const terminalState = currentStateResponse(job, now);
    if (terminalState) return terminalState;

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

    let target: ProjectChapterConcatTargetV1;
    try {
      assertProjectChapterConcatTargetV1(job.concatTarget);
      if (!targetBindsToJob(job, jobId, job.concatTarget)) {
        throw new Error('PROJECT_CHAPTER_CONCAT_JOB_BINDING_MISMATCH');
      }
      target = job.concatTarget;
    } catch (error: unknown) {
      const code = safeErrorCode(error);
      const failed = await collection.updateOne(
        { _id: jobId, concatStatus: { $in: ['queued', 'running'] } } as any,
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

    const claimToken = randomUUID();
    const claimed = (await collection.findOneAndUpdate(
      {
        _id: jobId,
        'concatTarget.generation': target.generation,
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
      const response = currentStateResponse(current, new Date());
      if (response) return response;
      return NextResponse.json({ success: false, error: 'CHAPTER_CONCAT_CLAIM_NOT_AVAILABLE' }, { status: 500 });
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
      if (!resultMatchesTarget(completion, target)) {
        throw new Error('CHAPTER_CONCAT_RESULT_IDENTITY_MISMATCH');
      }
      const completed = await collection.updateOne(
        {
          _id: jobId,
          concatStatus: 'running',
          'concatLease.claimToken': claimToken,
          'concatTarget.generation': target.generation,
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
      console.log(`[ChapterConcat] Job ${jobId}: stitched ${result.chapters} chapters for generation ${result.generation}`);
      return NextResponse.json({ success: true, ...completion, key: completion.outputKey });
    } catch (error: unknown) {
      const code = safeErrorCode(error);
      if (isTerminalError(error)) {
        const failed = await collection.updateOne(
          {
            _id: jobId,
            concatStatus: 'running',
            'concatLease.claimToken': claimToken,
          } as any,
          {
            $set: { status: 'failed', concatStatus: 'failed', concatError: code, updatedAt: new Date() },
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
      const released = await collection.updateOne(
        {
          _id: jobId,
          concatStatus: 'running',
          'concatLease.claimToken': claimToken,
        } as any,
        {
          $set: { concatStatus: 'queued', concatError: code, updatedAt: new Date() },
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
