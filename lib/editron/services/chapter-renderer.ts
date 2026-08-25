/**
 * Chapter-Based Rendering Service
 *
 * Phase D W6: For videos longer than 3 minutes, splits the composition
 * into chapters at scene boundaries, renders each chapter independently
 * on separate Lambda invocations, then concatenates the results.
 *
 * This enables rendering of 5-minute, 10-minute, or even 1-hour videos
 * that would timeout on a single Lambda invocation (max 10 minutes).
 *
 * Architecture:
 *   Long video → detect chapter boundaries → N independent renders
 *   → each chapter has its own Vercel timeout → concatenate via FFmpeg
 *   → single output MP4
 */

import { renderMediaOnLambda, getRenderProgress } from '@remotion/lambda/client';
import {
  REMOTION_AUDIO_CODEC,
  REMOTION_COMPOSITION_ID,
  REMOTION_FRAMES_PER_LAMBDA,
} from './remotion-constants';
import { getDatabase } from '@/lib/editron/db/mongodb';
import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import { setAWSCredentials } from '@/lib/editron/utils/aws-credentials';
import { isChapterConcatConfigured, enqueueChapterConcat } from './chapter-concat-client';
import { buildLambdaRenderInputProps } from '@/lib/editron/shared/render-request-payload';
import { assertRemotionSiteFresh } from './remotion-site-version';

// ─── Configuration ────────────────────────────────────────────────

/**
 * Chapter policy is a duration policy, not a 30-fps frame-count policy.  The
 * caller still supplies a numeric render FPS today; rational/VFR source
 * identity belongs to the later canonical-media spine.
 */
const CHAPTER_SPLIT_THRESHOLD_SECONDS = 15 * 60;
const TARGET_CHAPTER_SECONDS = 2.5 * 60;
const MIN_CHAPTER_SECONDS = 30;

/**
 * AWS Lambda concurrent-execution budget to spend on chapter renders at once.
 *
 * Each chapter fans out into ~ceil(durationFrames / REMOTION_FRAMES_PER_LAMBDA) renderer Lambdas.
 * startPendingChapters() admits pending chapters while the estimated in-flight renderer Lambdas stay
 * under this budget; the progress poller admits more as chapters finish. This replaces the old fixed
 * "1 chapter at a time" cap, which was correct only on a ~10-concurrency AWS account. The Insturix
 * account is at the 1000 concurrent-execution quota, so we spend up to 800 and leave ~200 headroom for
 * the per-chapter orchestrator functions, progress polls, and other Lambda traffic.
 */
const LAMBDA_CONCURRENCY_BUDGET = 800;

export const CHAPTERS_COLLECTION = 'editron_render_chapters';

// ─── Types ────────────────────────────────────────────────────────

interface Chapter {
  index: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  /** Render ID from Lambda (set after render starts) */
  renderId?: string;
  /** Real Remotion bucket for this chapter render. */
  bucketName?: string;
  /** Render status */
  status: 'pending' | 'rendering' | 'completed' | 'failed';
  /** Output URL (set after render completes) */
  outputUrl?: string;
  /** Error message if failed */
  error?: string;
}

interface ChapterRenderJob {
  _id: string; // render job ID
  projectId: string;
  userId: string;
  chapters: Chapter[];
  status: 'splitting' | 'rendering' | 'concatenating' | 'completed' | 'failed';
  totalFrames: number;
  /** Full absolute composition overlays. Chapters crop by frameRange instead of rebasing overlay time. */
  overlays: Overlay[];
  fps: number;
  width: number;
  height: number;
  /** Final concatenated video URL */
  outputUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  /** Plan-based auto-expiry (base 7d / mid 30d / top 90d). A TTL index on this field deletes the job. */
  expiresAt?: Date;
}

// ─── Chapter Detection ────────────────────────────────────────────

/**
 * Detect natural chapter boundaries from overlay positions.
 * Splits at scene transitions (gaps between video overlays on row 2)
 * or at transition overlays (row 1).
 */
export function detectChapterBoundaries(
  overlays: Overlay[],
  totalFrames: number,
  fps: number,
): { startFrame: number; endFrame: number }[] {
  const chapterPolicy = chapterFramePolicy(fps);
  if (totalFrames <= chapterPolicy.splitThresholdFrames) {
    // Short video — single chapter, no splitting needed
    return [{ startFrame: 0, endFrame: totalFrames }];
  }

  // Find all scene boundaries (where video overlays start/end on row 2)
  const videoOverlays = overlays
    .filter(o => o.type === 'video' && o.row === ROW.VIDEO)
    .sort((a, b) => a.from - b.from);

  if (videoOverlays.length === 0) {
    return [{ startFrame: 0, endFrame: totalFrames }];
  }

  // Collect potential split points (between video overlays)
  const splitPoints: number[] = [];
  for (let i = 1; i < videoOverlays.length; i++) {
    const prevEnd = videoOverlays[i - 1].from + videoOverlays[i - 1].durationInFrames;
    const nextStart = videoOverlays[i].from;
    // Use the midpoint of the gap (or the start of the next clip)
    splitPoints.push(Math.round((prevEnd + nextStart) / 2));
  }

  // Build chapters using split points, targeting the same duration at every numeric render FPS.
  const chapters: { startFrame: number; endFrame: number }[] = [];
  let chapterStart = 0;

  for (const splitPoint of splitPoints) {
    const chapterLength = splitPoint - chapterStart;

    if (chapterLength >= chapterPolicy.targetFrames) {
      chapters.push({ startFrame: chapterStart, endFrame: splitPoint });
      chapterStart = splitPoint;
    }
  }

  // Final chapter: everything from last split to end
  if (chapterStart < totalFrames) {
    const lastChapterLength = totalFrames - chapterStart;

    if (lastChapterLength < chapterPolicy.minimumFrames && chapters.length > 0) {
      // Too short — merge with previous chapter
      chapters[chapters.length - 1].endFrame = totalFrames;
    } else {
      chapters.push({ startFrame: chapterStart, endFrame: totalFrames });
    }
  }

  // If no chapters were created (no good split points), fall back to even splits
  if (chapters.length === 0) {
    const numChapters = Math.ceil(totalFrames / chapterPolicy.targetFrames);
    const framesPerChapter = Math.ceil(totalFrames / numChapters);
    for (let i = 0; i < numChapters; i++) {
      const start = i * framesPerChapter;
      const end = Math.min((i + 1) * framesPerChapter, totalFrames);
      chapters.push({ startFrame: start, endFrame: end });
    }
  }

  return chapters;
}

// ─── Render Orchestration ─────────────────────────────────────────

/**
 * Check if a composition should use chapter-based rendering.
 */
export function shouldUseChapterRendering(totalFrames: number, fps: number): boolean {
  return totalFrames > chapterFramePolicy(fps).splitThresholdFrames;
}

function chapterFramePolicy(fps: number): Readonly<{
  splitThresholdFrames: number;
  targetFrames: number;
  minimumFrames: number;
}> {
  const normalizedFps = assertChapterFps(fps);
  return {
    splitThresholdFrames: framesForDurationSeconds(CHAPTER_SPLIT_THRESHOLD_SECONDS, normalizedFps),
    targetFrames: framesForDurationSeconds(TARGET_CHAPTER_SECONDS, normalizedFps),
    minimumFrames: framesForDurationSeconds(MIN_CHAPTER_SECONDS, normalizedFps),
  };
}

function framesForDurationSeconds(seconds: number, fps: number): number {
  return Math.ceil(seconds * fps);
}

function assertChapterFps(fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error('Chapter rendering requires a positive finite FPS');
  }
  return fps;
}

function chapterProgressErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isTerminalChapterProgressError(message: string): boolean {
  return /specified bucket does not exist|NoSuchBucket/i.test(message);
}

/**
 * Start a chapter-based render job.
 * Splits the composition, starts parallel Lambda renders,
 * and returns a job ID for progress tracking.
 */
/**
 * Start ONE pending chapter on Lambda, atomically claimed so two overlapping progress polls can't
 * double-start it. Flips the chapter pending → rendering first, then triggers the render and records the
 * renderId; a start failure marks it 'failed'.
 */
async function startSingleChapterRender(
  db: Awaited<ReturnType<typeof getDatabase>>,
  jobId: string,
  chapter: Chapter,
  ctx: { serveUrl: string; functionName: string; fps: number; width: number; height: number; totalFrames: number; overlays: Overlay[] },
): Promise<void> {
  // Atomic claim: only proceed if this chapter is still pending (prevents a racing poll double-starting it).
  const claim = await db.collection(CHAPTERS_COLLECTION).updateOne(
    { _id: jobId, chapters: { $elemMatch: { index: chapter.index, status: 'pending' } } } as any,
    { $set: { 'chapters.$.status': 'rendering', updatedAt: new Date() } },
  );
  if (claim.modifiedCount === 0) return; // a concurrent poll already claimed it

  try {
    await setAWSCredentials();
    const inputProps = buildLambdaRenderInputProps({
      overlays: ctx.overlays,
      durationInFrames: ctx.totalFrames,
      fps: ctx.fps,
      width: ctx.width,
      height: ctx.height,
      // Use OffthreadVideo (ffmpeg, robust) not Html5Video for server render -- without this flag the
      // composition defaults isRendering=false and a large/slow-proxied clip hangs delayRender -> timeout.
      isRendering: true,
    });
    const { renderId, bucketName } = await renderMediaOnLambda({
      region: (process.env.REMOTION_AWS_REGION || 'us-east-1') as any,
      functionName: ctx.functionName,
      serveUrl: ctx.serveUrl,
      composition: REMOTION_COMPOSITION_ID,
      inputProps,
      codec: 'h264',
      maxRetries: 1,
      framesPerLambda: REMOTION_FRAMES_PER_LAMBDA,
      privacy: 'public',
      timeoutInMilliseconds: 600000, // 10 min per chapter
      audioCodec: REMOTION_AUDIO_CODEC,
      frameRange: [chapter.startFrame, Math.max(chapter.startFrame, chapter.endFrame - 1)],
    });
    await db.collection(CHAPTERS_COLLECTION).updateOne(
      { _id: jobId, 'chapters.index': chapter.index } as any,
      { $set: { 'chapters.$.renderId': renderId, 'chapters.$.bucketName': bucketName, updatedAt: new Date() } },
    );
    console.log(`[ChapterRenderer] Chapter ${chapter.index} started: ${renderId}`);
  } catch (err: any) {
    console.error(`[ChapterRenderer] Chapter ${chapter.index} failed to start: ${err.message}`);
    await db.collection(CHAPTERS_COLLECTION).updateOne(
      { _id: jobId, 'chapters.index': chapter.index } as any,
      { $set: { 'chapters.$.status': 'failed', 'chapters.$.error': err.message, updatedAt: new Date() } },
    );
  }
}

/**
 * Start pending chapters while their estimated renderer Lambdas fit under LAMBDA_CONCURRENCY_BUDGET,
 * keeping total renderer Lambdas under the AWS account quota. Called once when the job starts and again on
 * every progress poll, so the next chapter begins as soon as a running one finishes. Idempotent; safe to
 * call repeatedly.
 */
export async function startPendingChapters(
  jobId: string,
  opts?: { serveUrl?: string; functionName?: string },
): Promise<void> {
  const db = await getDatabase();
  const job = await db.collection(CHAPTERS_COLLECTION).findOne({ _id: jobId as any }) as any;
  if (!job || !Array.isArray(job.chapters)) return;

  // Admit pending chapters while the estimated in-flight renderer Lambdas stay under the budget. Each
  // chapter needs ~ceil(durationFrames / REMOTION_FRAMES_PER_LAMBDA) renderer Lambdas; the per-chapter
  // atomic claim in startSingleChapterRender() makes a momentary over-admit from racing polls harmless.
  const lambdasForChapter = (c: Chapter) =>
    Math.max(1, Math.ceil(c.durationFrames / REMOTION_FRAMES_PER_LAMBDA));
  let remaining =
    LAMBDA_CONCURRENCY_BUDGET -
    (job.chapters as Chapter[])
      .filter((c) => c.status === 'rendering')
      .reduce((sum, c) => sum + lambdasForChapter(c), 0);

  const pending: Chapter[] = [];
  for (const chapter of (job.chapters as Chapter[]).filter((c) => c.status === 'pending')) {
    const need = lambdasForChapter(chapter);
    // Always admit at least one chapter even if it alone exceeds the budget, else the job deadlocks.
    if (pending.length > 0 && need > remaining) break;
    pending.push(chapter);
    remaining -= need;
  }
  if (pending.length === 0) return;

  const serveUrl = opts?.serveUrl || process.env.REMOTION_LAMBDA_SERVE_URL;
  const functionName = opts?.functionName || process.env.REMOTION_LAMBDA_FUNCTION_NAME;
  if (!serveUrl || !functionName) {
    console.warn('[ChapterRenderer] cannot start pending chapters: REMOTION_LAMBDA_SERVE_URL / FUNCTION_NAME unset');
    return;
  }
  const freshness = assertRemotionSiteFresh({ serveUrl, env: process.env });
  if (freshness.reason === 'unverified_no_app_commit') {
    console.warn('[ChapterRenderer] Remotion site version could not be verified because app commit metadata is missing');
  }

  const ctx = {
    serveUrl,
    functionName,
    fps: job.fps,
    width: job.width,
    height: job.height,
    totalFrames: job.totalFrames,
    overlays: (job.overlays ?? []) as Overlay[],
  };
  for (const chapter of pending) {
    await startSingleChapterRender(db, jobId, chapter, ctx);
  }
}

export async function startChapterRender(
  jobId: string,
  projectId: string,
  userId: string,
  overlays: Overlay[],
  totalFrames: number,
  fps: number,
  width: number,
  height: number,
  serveUrl: string,
  functionName: string,
): Promise<{ jobId: string; chapters: number }> {
  if (!/^chr_[A-Za-z0-9_-]{12}$/.test(jobId)) {
    throw new Error('Chapter rendering requires a caller-owned chr_ admission ID');
  }
  const normalizedFps = assertChapterFps(fps);
  const db = await getDatabase();

  // Detect chapter boundaries
  const boundaries = detectChapterBoundaries(overlays, totalFrames, normalizedFps);

  const compactRenderProps = buildLambdaRenderInputProps({
    overlays,
    durationInFrames: totalFrames,
    fps: normalizedFps,
    width,
    height,
    isRendering: true,
  });
  const renderOverlays = Array.isArray(compactRenderProps.overlays)
    ? compactRenderProps.overlays as Overlay[]
    : [];
  // Create chapter records
  const chapters: Chapter[] = boundaries.map((b, i) => ({
    index: i,
    startFrame: b.startFrame,
    endFrame: b.endFrame,
    durationFrames: b.endFrame - b.startFrame,
    status: 'pending' as const,
  }));

  // Plan-based retention: stamp when this render's transient chapter records auto-expire, so a TTL index
  // on `expiresAt` (expireAfterSeconds: 0) deletes them after the owner's plan window (base 7d/mid 30d/top 90d).
  // The plan read fails safe to the base tier.
  let planType: string | undefined;
  try {
    const { getUserPlanWithServiceLimits } = await import('@/lib/services/planService');
    const plan: any = await getUserPlanWithServiceLimits(userId);
    planType = plan?.type ?? plan?.planType ?? plan?.name; // currentPlan stores the key in `name`
  } catch { /* plan not resolvable → base retention */ }
  const { renderChapterExpiresAt } = await import('@/lib/editron/services/render-chapter-retention');
  const createdAt = new Date();

  // Store job in MongoDB
  const job: ChapterRenderJob = {
    _id: jobId,
    projectId,
    userId,
    chapters,
    status: 'rendering',
    totalFrames,
    overlays: renderOverlays,
    fps: normalizedFps,
    width,
    height,
    createdAt,
    updatedAt: createdAt,
    expiresAt: renderChapterExpiresAt(createdAt, planType),
  };

  await db.collection(CHAPTERS_COLLECTION).insertOne(job as any);

  console.log(`[ChapterRenderer] Job ${jobId}: ${chapters.length} chapters for ${totalFrames} frames`);

  // Start chapters under a concurrency cap. The rest stay 'pending' and are started by
  // getChapterRenderProgress() as each running chapter finishes — keeping total renderer Lambdas under
  // the AWS account limit instead of firing every chapter at once (which throttled the chunks and timed
  // out the per-chapter main function after 600s).
  await startPendingChapters(jobId, { serveUrl, functionName });

  return { jobId, chapters: chapters.length };
}

/**
 * Get chapter render job progress.
 * Returns per-chapter progress + overall aggregated progress.
 */
export async function getChapterRenderProgress(jobId: string): Promise<{
  status: string;
  overallProgress: number;
  chapters: Array<{
    index: number;
    status: string;
    progress: number;
    outputUrl?: string;
    error?: string;
  }>;
  outputUrl?: string;
  error?: string;
} | null> {
  const db = await getDatabase();
  const job = await db.collection(CHAPTERS_COLLECTION).findOne({ _id: jobId as any }) as any;
  if (!job) return null;

  let totalProgress = 0;
  let computedStatus = job.status;
  let completedOutputUrl = typeof job.outputUrl === 'string' ? job.outputUrl : undefined;
  let completedError: string | undefined;
  const chapterStatuses = [];

  for (const chapter of job.chapters) {
    let progress = 0;
    let chapterStatus = chapter.status;
    let chapterOutputUrl = chapter.outputUrl;
    let chapterError = chapter.error;

    if (chapter.status === 'completed') {
      progress = 1;
    } else if (chapter.status === 'failed') {
      progress = 0;
    } else if (chapter.renderId) {
      // Poll Lambda for this chapter's progress
      try {
        await setAWSCredentials();
        const chapterBucketName = typeof chapter.bucketName === 'string' && chapter.bucketName.trim()
          ? chapter.bucketName
          : `remotionlambda-${process.env.REMOTION_AWS_REGION || 'us-east-1'}-vqv91tlyik`;

        const renderProgress = await getRenderProgress({
          renderId: chapter.renderId,
          bucketName: chapterBucketName,
          region: (process.env.REMOTION_AWS_REGION || 'us-east-1') as any,
          functionName: process.env.REMOTION_LAMBDA_FUNCTION_NAME || '',
          skipLambdaInvocation: true,
        });

        progress = renderProgress.overallProgress || 0;

        if (renderProgress.done) {
          // Chapter completed — update DB
          await db.collection(CHAPTERS_COLLECTION).updateOne(
            { _id: jobId, 'chapters.index': chapter.index } as any,
            {
              $set: {
                'chapters.$.status': 'completed',
                'chapters.$.outputUrl': renderProgress.outputFile,
                updatedAt: new Date(),
              },
            },
          );
          chapterStatus = 'completed';
          chapterOutputUrl = renderProgress.outputFile;
          progress = 1;
        } else if (renderProgress.fatalErrorEncountered) {
          chapterStatus = 'failed';
          chapterError = renderProgress.errors?.[0]?.message || 'Render failed';
          await db.collection(CHAPTERS_COLLECTION).updateOne(
            { _id: jobId, 'chapters.index': chapter.index } as any,
            {
              $set: {
                'chapters.$.status': 'failed',
                'chapters.$.error': chapterError,
                updatedAt: new Date(),
              },
            },
          );
        }
      } catch (err: unknown) {
        const message = chapterProgressErrorMessage(err);
        if (isTerminalChapterProgressError(message)) {
          console.warn('[ChapterRenderer] progress check failed (terminal):', message);
          chapterStatus = 'failed';
          chapterError = message;
          await db.collection(CHAPTERS_COLLECTION).updateOne(
            { _id: jobId, 'chapters.index': chapter.index } as any,
            {
              $set: {
                'chapters.$.status': 'failed',
                'chapters.$.error': message,
                updatedAt: new Date(),
              },
            },
          );
        } else {
          console.warn('[ChapterRenderer] progress check failed (non-fatal):', message);
        }
      }
    }

    totalProgress += progress;
    chapterStatuses.push({
      index: chapter.index,
      status: chapterStatus,
      progress,
      outputUrl: chapterOutputUrl,
      error: chapterError,
    });
  }

  // Advance the chapter queue: finished chapters have freed slots, so start the next pending one(s).
  // This is what carries the bounded-concurrency render past the first chapter.
  await startPendingChapters(jobId);

  const overallProgress = job.chapters.length > 0
    ? totalProgress / job.chapters.length
    : 0;

  // Check if all chapters are done
  const allDone = chapterStatuses.every(c => c.status === 'completed' || c.status === 'failed');
  const allCompleted = chapterStatuses.every(c => c.status === 'completed');

  if (allDone && !allCompleted) {
    // Some chapters failed
    computedStatus = 'failed';
    await db.collection(CHAPTERS_COLLECTION).updateOne(
      { _id: jobId } as any,
      { $set: { status: 'failed', updatedAt: new Date() } },
    );
  }

  // When all chapters complete, the per-chapter MP4s must be stitched into one file:
  //  - single chapter → its one output IS the whole video; completes as-is.
  //  - multi-chapter  → reassemble (in chapter order) via the async concat worker when configured;
  //                     otherwise FAIL LOUD — never ship a truncated chapter 0 reported as "done".
  if (allCompleted) {
    if (chapterStatuses.length <= 1) {
      const onlyOutput = chapterStatuses.find(c => c.outputUrl)?.outputUrl;
      computedStatus = 'completed';
      completedOutputUrl = onlyOutput;
      await db.collection(CHAPTERS_COLLECTION).updateOne(
        { _id: jobId } as any,
        { $set: { status: 'completed', outputUrl: onlyOutput, updatedAt: new Date() } },
      );
    } else if (job.concatStatus === 'done' && typeof job.outputUrl === 'string') {
      // Concat worker finished and wrote the assembled URL.
      computedStatus = 'completed';
      completedOutputUrl = job.outputUrl;
    } else if (job.concatStatus === 'failed') {
      computedStatus = 'failed';
      completedError =
        typeof job.concatError === 'string' && job.concatError ? job.concatError : 'Chapter concatenation failed.';
      completedOutputUrl = undefined;
    } else if (
      (job.concatStatus === 'queued' || job.concatStatus === 'running') &&
      job.updatedAt &&
      Date.now() - new Date(job.updatedAt).getTime() > 20 * 60 * 1000 // 20 min ← Modal 900s timeout + QStash retries
    ) {
      // Concat was dispatched but the worker never reported back (bad QStash signature, Modal down
      // past retries, …). Fail loud instead of hanging in-progress forever.
      computedStatus = 'failed';
      completedError = 'Chapter concatenation timed out — the stitching worker did not report back.';
      completedOutputUrl = undefined;
      await db.collection(CHAPTERS_COLLECTION).updateOne(
        { _id: jobId } as any,
        { $set: { status: 'failed', concatStatus: 'failed', error: completedError, updatedAt: new Date() } },
      );
    } else if (isChapterConcatConfigured()) {
      // Claim the concat atomically so only ONE poll enqueues the durable (QStash-retried) job,
      // then keep reporting in-progress until the worker writes status/outputUrl back.
      const claim = await db.collection(CHAPTERS_COLLECTION).updateOne(
        { _id: jobId, concatStatus: { $exists: false } } as any,
        { $set: { concatStatus: 'queued', updatedAt: new Date() } },
      );
      if (claim.modifiedCount === 1) {
        try {
          await enqueueChapterConcat(jobId);
          console.log(`[ChapterRenderer] Job ${jobId}: enqueued concat of ${chapterStatuses.length} chapters`);
        } catch (err: unknown) {
          // Release the claim so a later poll retries instead of hanging in 'queued' forever.
          await db.collection(CHAPTERS_COLLECTION).updateOne(
            { _id: jobId } as any,
            { $unset: { concatStatus: '' }, $set: { updatedAt: new Date() } },
          );
          console.warn(
            `[ChapterRenderer] Job ${jobId}: concat enqueue failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      // computedStatus stays in-progress (job.status) → the client keeps polling.
    } else {
      // No concat worker configured → fail loud rather than ship a truncated chapter 0.
      computedStatus = 'failed';
      completedError =
        `This video was split into ${chapterStatuses.length} render chapters that cannot yet be ` +
        `stitched into a single file (multi-chapter assembly is not available). The full video ` +
        `could not be produced — re-render at a shorter length for now.`;
      completedOutputUrl = undefined;
      await db.collection(CHAPTERS_COLLECTION).updateOne(
        { _id: jobId } as any,
        { $set: { status: 'failed', error: completedError, updatedAt: new Date() } },
      );
    }
  }

  return {
    status: computedStatus,
    overallProgress,
    chapters: chapterStatuses,
    outputUrl: completedOutputUrl,
    error: completedError,
  };
}
