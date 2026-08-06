import { NextResponse } from 'next/server';
import { handleTaskFailure } from '@/lib/services/tasks/handle-failure';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { getCollections as getAlyzitronCollections } from '@/app/api/services/alyzitron/utils/mongodb';
import { logger } from '@/app/api/services/alyzitron/utils/logger';
import { CreditsService } from '@/lib/services/creditsService';
import { getCreditCost } from '@/lib/config/creditCosts';
import { reconcileExpiredCalosImageClaims } from '@/lib/calos/reconcile-image-claims';
import { Types } from 'mongoose';

export async function GET(request: Request) {
  // 1. Authenticate the request. Vercel Cron sends the vercel-cron user-agent;
  // when CRON_SECRET is configured it may also send Authorization: Bearer <secret>.
  const authHeader = request.headers.get('authorization');
  const userAgent = request.headers.get('user-agent') || '';
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = userAgent.includes('vercel-cron');
  const hasValidSecret = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
  if (!isVercelCron && !hasValidSecret) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const results = {
    processed: 0,
    errors: 0,
    details: [] as string[],
  };

  // 2. Recover CalOS image work before the generic Clickatron sweep. CalOS owns
  // exact billing evidence and card terminal state, so it must not use the legacy
  // guessed-cost refund path below.
  try {
    const calos = await reconcileExpiredCalosImageClaims();
    results.processed += calos.completed + calos.failed + calos.released;
    results.errors += calos.errors;
    results.details.push(
      `CalOS image recovery scanned ${calos.scanned}: ${calos.completed} completed, ${calos.failed} failed, ${calos.released} released, ${calos.pending} pending`,
    );
  } catch (e) {
    results.errors++;
    logger.error('Error reconciling CalOS image claims in timeout cron', { error: e });
    results.details.push(`Error in CalOS image recovery: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3. Handle Clickatron Timeouts
  //
  // Clickatron stuck-ness lives at the VARIATION level, not the task level. The
  // ClickatronTask schema has no top-level `status` field - only each variation in
  // details.canvas.variations carries status ('generating'|'completed'|'failed'|
  // 'blank'). The worker flips 'generating'->'completed'/'failed' and refunds on
  // failure, but if the worker is killed (Vercel maxDuration=300s) or QStash never
  // delivers, the variation is left 'generating' forever with no refund while Fal
  // still bills. This watchdog finds those stale 'generating' variations, fails
  // them, and refunds each one.
  try {
    await getClickatronDb();

    // Timeout must safely exceed the worker's maxDuration (300s) so we never race a
    // still-running generation. 10 min matches the existing Redis job watchdog
    // (failExpiredJobs in lib/clickatron-jobs.ts).
    const variationStuckTimeout = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes

    // Canonical Clickatron generation cost (baseCost 3). The worker refunds the
    // same amount via { service:'clickatron', action:'variation' }.
    const refundPerVariation = getCreditCost('clickatron', 'variation', {});

    const tasksWithStuckVariations = await ClickatronTask.find({
      'metadata.sourceContext.calosDeliverableId': { $exists: false },
      'metadata.clickatronHandoff.contentCardId': { $exists: false },
      'details.canvas.variations': {
        $elemMatch: { status: 'generating', updatedAt: { $lt: variationStuckTimeout } },
      },
    }).lean();

    for (const task of tasksWithStuckVariations) {
      const taskId = (task._id as Types.ObjectId).toString();
      const variations = (task.details?.canvas?.variations ?? []) as Array<{
        id: string;
        status: string;
        updatedAt?: Date;
      }>;

      const stuckVariations = variations.filter(
        (v) =>
          v.status === 'generating' &&
          v.updatedAt != null &&
          new Date(v.updatedAt) < variationStuckTimeout,
      );

      for (const variation of stuckVariations) {
        // Atomically flip THIS variation 'generating' -> 'failed'. The filter
        // requires it to still be 'generating', so if the worker terminal'd it
        // first this matches zero docs (modifiedCount 0) and we skip the refund -
        // this is the per-slide guard that prevents double-refunds.
        const flip = await ClickatronTask.updateOne(
          {
            _id: task._id,
            'details.canvas.variations': {
              $elemMatch: { id: variation.id, status: 'generating' },
            },
          },
          {
            $set: {
              'details.canvas.variations.$.status': 'failed',
              'details.canvas.variations.$.error':
                'Generation timed out and was marked as failed by the system.',
              'details.canvas.variations.$.updatedAt': new Date(),
            },
          },
        );

        if (flip.modifiedCount !== 1) {
          // Lost the race to the worker (already completed/failed). Do not refund.
          continue;
        }

        // We own this failure: refund exactly one variation cost to the task owner.
        if (refundPerVariation > 0) {
          try {
            await CreditsService.refundCredits(
              task.clerkUserId,
              refundPerVariation,
              `Variation timeout - ${taskId} / ${variation.id}`,
              { service: 'clickatron', action: 'variation' },
            );
            results.processed++;
            results.details.push(
              `Refunded ${refundPerVariation} credits for stuck Clickatron variation ${variation.id} (task ${taskId})`,
            );
          } catch (refundError) {
            results.errors++;
            // LOUDFAIL: temporary loud logging for testing - remove (docs/SOFT_FAILURE_AUDIT_2026-06-26.md)
            console.error('[LOUDFAIL][Cron][Clickatron][REFUND-FAILED][MONEY-LOSS] stuck-slide refund threw (slide already failed; no further recovery):', { userId: task.clerkUserId, taskId, variationId: variation.id, amount: refundPerVariation, refundError });
            results.details.push(
              `Failed to refund stuck Clickatron variation ${variation.id} (task ${taskId}): ${refundError instanceof Error ? refundError.message : String(refundError)}`,
            );
          }
        } else {
          // Fail loud: a zero cost means the credit-cost config lost the 'variation'
          // action (regression). The variation is still correctly failed above.
          results.errors++;
          // LOUDFAIL: temporary loud logging for testing - remove (docs/SOFT_FAILURE_AUDIT_2026-06-26.md)
          console.error('[LOUDFAIL][Cron][Clickatron][CONFIG-REGRESSION][MONEY] getCreditCost returned 0 -> stuck slide failed but NOT refunded:', { userId: task.clerkUserId, taskId, variationId: variation.id });
          results.details.push(
            `Clickatron variation ${variation.id} failed but refund skipped: getCreditCost returned ${refundPerVariation}`,
          );
        }
      }
    }
  } catch (e) {
    // LOUDFAIL: temporary loud logging for testing - remove (docs/SOFT_FAILURE_AUDIT_2026-06-26.md).
    // NOTE: the cron still returns 200 even when this fires - the whole Clickatron stuck-slide sweep was skipped this run (no refunds).
    logger.error('[LOUDFAIL][Cron][Clickatron][WATCHDOG-DIED][MONEY] entire stuck-slide sweep failed; no stuck slides refunded this run:', { error: e });
    results.errors++;
    results.details.push(`Error in Clickatron cron: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 4. Handle Alyzitron Timeouts
  try {
    const { analyses } = await getAlyzitronCollections();
    const alyzitronTimeout = new Date(Date.now() - 60 * 15 * 1000); // 15 minutes
    const stuckAlyzitronTasks = await analyses.find({
      status: { $in: ['processing', 'queued', 'listed'] },
      updatedAt: { $lt: alyzitronTimeout },
      refunded: { $ne: true }
    }).toArray();

    for (const task of stuckAlyzitronTasks) {
      // Update status in MongoDB
      await analyses.updateOne(
        { _id: task._id },
        {
          $set: {
            status: 'failed',
            error: {
              code: 'TIMEOUT',
              message: 'Analysis timed out and was marked as failed by the system.',
              action: 'Please try again or contact support if the issue persists.'
            },
            updatedAt: new Date()
          }
        }
      );
      await handleTaskFailure({
        taskId: task._id.toString(),
        serviceName: 'alyzitron',
        userId: task.clerkUserId,
        error: {
          code: 'TIMEOUT',
          message: 'Analysis timed out and was marked as failed by the system.',
        },
        taskType: 'analysis',
        task: task,
      });
      results.processed++;
      results.details.push(`Processed Alyzitron task ${task._id}`);
    }
  } catch (e) {
    logger.error('Error processing Alyzitron timeouts in cron job', { error: e });
    results.errors++;
    results.details.push(`Error in Alyzitron cron: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 5. Handle Editron Video Pipeline Timeouts
  try {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const { reconcileVideoBatchStatus } = await import('@/lib/pipeline/video-queue-service');
    const editronDb = await getDatabase();
    const videoTimeout = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes
    const reconciledBatchCache = new Map<string, { batch: any | null; jobs: any[] }>();

    const hasCompletedVideo = (job: any): boolean =>
      job?.status === 'completed' && typeof job.videoUrl === 'string' && job.videoUrl.trim().length > 0;

    const reconcileBatch = async (
      batchId: unknown,
      userId: unknown,
      force = false,
    ): Promise<{ batch: any | null; jobs: any[] } | null> => {
      const safeBatchId = typeof batchId === 'string' ? batchId.trim() : '';
      const safeUserId = typeof userId === 'string' ? userId.trim() : '';
      if (!safeBatchId || !safeUserId) return null;

      const cacheKey = `${safeUserId}:${safeBatchId}`;
      if (!force && reconciledBatchCache.has(cacheKey)) {
        return reconciledBatchCache.get(cacheKey) ?? null;
      }

      const reconciled = await reconcileVideoBatchStatus(safeBatchId, safeUserId, editronDb);
      reconciledBatchCache.set(cacheKey, reconciled);
      return reconciled;
    };

    // Find stuck video jobs
    const stuckVideoJobs = await editronDb.collection('pipeline_video_jobs').find({
      status: { $in: ['processing', 'queued'] },
      createdAt: { $lt: videoTimeout },
    }).toArray();

    for (const job of stuckVideoJobs) {
      const reconciled = await reconcileBatch(job.batchId, job.userId);
      const reconciledJob = reconciled?.jobs.find((candidate: any) => String(candidate?._id) === String(job._id));

      if (hasCompletedVideo(reconciledJob)) {
        results.processed++;
        results.details.push(`Editron video job ${job._id} reconciled from storyboard evidence; timeout failure skipped`);
        continue;
      }

      const failFilter: Record<string, unknown> = {
        _id: job._id,
        status: { $in: ['processing', 'queued'] },
      };
      if (job.userId) failFilter.userId = job.userId;
      if (job.batchId) failFilter.batchId = job.batchId;

      const failResult = await editronDb.collection('pipeline_video_jobs').updateOne(
        failFilter,
        { $set: { status: 'failed', error: 'Timed out after 15 minutes (watchdog)', completedAt: new Date() } },
      );

      if (failResult.modifiedCount !== 1) {
        await reconcileBatch(job.batchId, job.userId, true);
        continue;
      }

      await reconcileBatch(job.batchId, job.userId, true);
      results.processed++;
      results.details.push(`Editron video job ${job._id} timed out (stuck ${Math.round((Date.now() - new Date(job.createdAt).getTime()) / 60000)}min)`);
    }

    // Find stuck video batches (all jobs done but batch still "processing")
    const stuckBatches = await editronDb.collection('pipeline_video_batches').find({
      status: 'processing',
      createdAt: { $lt: videoTimeout },
    }).toArray();

    for (const batch of stuckBatches as any[]) {
      const reconciled = await reconcileBatch(batch._id, batch.userId, true);
      if (!reconciled?.batch) continue;

      if (reconciled.batch.status !== 'processing') {
        results.processed++;
        results.details.push(`Editron video batch ${batch._id} reconciled from storyboard/job evidence -> ${reconciled.batch.status}`);
      }
    }

    if (stuckVideoJobs.length > 0 || stuckBatches.length > 0) {
      console.log(`[Cron] Editron video watchdog: ${stuckVideoJobs.length} stuck jobs, ${stuckBatches.length} stuck batches`);
    }
  } catch (e) {
    console.error('Error processing Editron video timeouts:', e);
    results.errors++;
    results.details.push(`Error in Editron video cron: ${e instanceof Error ? e.message : String(e)}`);
  }

  logger.info('Cron job for task timeouts completed', results);
  return NextResponse.json(results);
}
