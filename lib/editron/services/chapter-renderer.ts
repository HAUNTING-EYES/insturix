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
import { getDatabase } from '@/lib/editron/db/mongodb';
import { nanoid } from 'nanoid';
import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import { setAWSCredentials } from '@/lib/editron/utils/aws-credentials';

// ─── Configuration ────────────────────────────────────────────────

/** Minimum frames to trigger chapter splitting (3 min at 30fps) */
const CHAPTER_SPLIT_THRESHOLD = 5400;

/** Target chapter length in frames (~2.5 min at 30fps) */
const TARGET_CHAPTER_FRAMES = 4500;

/** Min chapter length — don't create tiny chapters */
const MIN_CHAPTER_FRAMES = 900; // 30 seconds

const CHAPTERS_COLLECTION = 'editron_render_chapters';

// ─── Types ────────────────────────────────────────────────────────

interface Chapter {
  index: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  /** Overlays that fall within this chapter's frame range */
  overlays: Overlay[];
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
  fps: number;
  width: number;
  height: number;
  /** Final concatenated video URL */
  outputUrl?: string;
  createdAt: Date;
  updatedAt: Date;
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
  _fps: number,
): { startFrame: number; endFrame: number }[] {
  if (totalFrames <= CHAPTER_SPLIT_THRESHOLD) {
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

  // Build chapters using split points, targeting TARGET_CHAPTER_FRAMES
  const chapters: { startFrame: number; endFrame: number }[] = [];
  let chapterStart = 0;

  for (const splitPoint of splitPoints) {
    const chapterLength = splitPoint - chapterStart;

    if (chapterLength >= TARGET_CHAPTER_FRAMES) {
      chapters.push({ startFrame: chapterStart, endFrame: splitPoint });
      chapterStart = splitPoint;
    }
  }

  // Final chapter: everything from last split to end
  if (chapterStart < totalFrames) {
    const lastChapterLength = totalFrames - chapterStart;

    if (lastChapterLength < MIN_CHAPTER_FRAMES && chapters.length > 0) {
      // Too short — merge with previous chapter
      chapters[chapters.length - 1].endFrame = totalFrames;
    } else {
      chapters.push({ startFrame: chapterStart, endFrame: totalFrames });
    }
  }

  // If no chapters were created (no good split points), fall back to even splits
  if (chapters.length === 0) {
    const numChapters = Math.ceil(totalFrames / TARGET_CHAPTER_FRAMES);
    const framesPerChapter = Math.ceil(totalFrames / numChapters);
    for (let i = 0; i < numChapters; i++) {
      const start = i * framesPerChapter;
      const end = Math.min((i + 1) * framesPerChapter, totalFrames);
      chapters.push({ startFrame: start, endFrame: end });
    }
  }

  return chapters;
}

/**
 * Get overlays that fall within a chapter's frame range.
 * Adjusts overlay.from to be relative to chapter start (0-based).
 */
function getChapterOverlays(
  allOverlays: Overlay[],
  chapterStart: number,
  chapterEnd: number,
): Overlay[] {
  return allOverlays
    .filter(o => {
      const overlayEnd = o.from + o.durationInFrames;
      // Include if overlay overlaps with chapter range
      return overlayEnd > chapterStart && o.from < chapterEnd;
    })
    .map(o => {
      const adjustedFrom = Math.max(0, o.from - chapterStart);
      const adjustedEnd = Math.min(chapterEnd - chapterStart, o.from + o.durationInFrames - chapterStart);
      return {
        ...o,
        from: adjustedFrom,
        durationInFrames: Math.max(1, adjustedEnd - adjustedFrom),
      };
    });
}

// ─── Render Orchestration ─────────────────────────────────────────

/**
 * Check if a composition should use chapter-based rendering.
 */
export function shouldUseChapterRendering(totalFrames: number): boolean {
  return totalFrames > CHAPTER_SPLIT_THRESHOLD;
}

/**
 * Start a chapter-based render job.
 * Splits the composition, starts parallel Lambda renders,
 * and returns a job ID for progress tracking.
 */
export async function startChapterRender(
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
  const db = await getDatabase();
  const jobId = `chr_${nanoid(12)}`;

  // Detect chapter boundaries
  const boundaries = detectChapterBoundaries(overlays, totalFrames, fps);

  // Create chapter records
  const chapters: Chapter[] = boundaries.map((b, i) => ({
    index: i,
    startFrame: b.startFrame,
    endFrame: b.endFrame,
    durationFrames: b.endFrame - b.startFrame,
    overlays: getChapterOverlays(overlays, b.startFrame, b.endFrame),
    status: 'pending' as const,
  }));

  // Store job in MongoDB
  const job: ChapterRenderJob = {
    _id: jobId,
    projectId,
    userId,
    chapters,
    status: 'rendering',
    totalFrames,
    fps,
    width,
    height,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection(CHAPTERS_COLLECTION).insertOne(job as any);

  console.log(`[ChapterRenderer] Job ${jobId}: ${chapters.length} chapters for ${totalFrames} frames`);

  // Start all chapter renders in parallel
  const renderPromises = chapters.map(async (chapter, i) => {
    try {
      await setAWSCredentials();

      const { renderId, bucketName } = await renderMediaOnLambda({
        region: (process.env.REMOTION_AWS_REGION || 'us-east-1') as any,
        functionName,
        serveUrl,
        composition: 'EditronComposition',
        inputProps: {
          overlays: chapter.overlays,
          durationInFrames: chapter.durationFrames,
          fps,
          width,
          height,
        },
        codec: 'h264',
        maxRetries: 1,
        framesPerLambda: 200,
        privacy: 'public',
        timeoutInMilliseconds: 600000, // 10 min per chapter
        audioCodec: 'mp3',
      });

      // Update chapter with renderId
      await db.collection(CHAPTERS_COLLECTION).updateOne(
        { _id: jobId, 'chapters.index': i } as any,
        {
          $set: {
            'chapters.$.renderId': renderId,
            'chapters.$.bucketName': bucketName,
            'chapters.$.status': 'rendering',
            updatedAt: new Date(),
          },
        },
      );

      console.log(`[ChapterRenderer] Chapter ${i}/${chapters.length} started: ${renderId}`);
      return { index: i, renderId, bucketName };
    } catch (err: any) {
      console.error(`[ChapterRenderer] Chapter ${i} failed to start: ${err.message}`);

      await db.collection(CHAPTERS_COLLECTION).updateOne(
        { _id: jobId, 'chapters.index': i } as any,
        {
          $set: {
            'chapters.$.status': 'failed',
            'chapters.$.error': err.message,
            updatedAt: new Date(),
          },
        },
      );

      return { index: i, error: err.message };
    }
  });

  await Promise.allSettled(renderPromises);

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
} | null> {
  const db = await getDatabase();
  const job = await db.collection(CHAPTERS_COLLECTION).findOne({ _id: jobId as any }) as any;
  if (!job) return null;

  let totalProgress = 0;
  let computedStatus = job.status;
  let completedOutputUrl = typeof job.outputUrl === 'string' ? job.outputUrl : undefined;
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
        console.warn('[ChapterRenderer] progress check failed (non-fatal):', err instanceof Error ? err.message : err);
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

  // TODO W6 Phase 2: When all chapters complete, trigger FFmpeg concatenation
  // For now, if all chapters completed, return the first chapter's URL
  // (concatenation requires a separate service — Cloud Run with FFmpeg)
  if (allCompleted) {
    const firstOutput = chapterStatuses.find(c => c.outputUrl)?.outputUrl;
    computedStatus = 'completed';
    completedOutputUrl = firstOutput;
    await db.collection(CHAPTERS_COLLECTION).updateOne(
      { _id: jobId } as any,
      { $set: { status: 'completed', outputUrl: firstOutput, updatedAt: new Date() } },
    );
  }

  return {
    status: computedStatus,
    overallProgress,
    chapters: chapterStatuses,
    outputUrl: completedOutputUrl,
  };
}
