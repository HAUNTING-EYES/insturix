import { NextResponse } from 'next/server';
import { handleTaskFailure } from '@/lib/services/tasks/handle-failure';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { getCollections as getAlyzitronCollections } from '@/app/api/services/alyzitron/utils/mongodb';
import { logger } from '@/app/api/services/alyzitron/utils/logger';
import { CreditsService } from '@/lib/services/creditsService';
import { getCreditCost } from '@/lib/config/creditCosts';
import { Types } from 'mongoose';

export async function GET(request: Request) {
  // 1. Authenticate the request
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const results = {
    processed: 0,
    errors: 0,
    details: [] as string[],
  };

  // 2. Handle Clickatron Timeouts
  //
  // Clickatron stuck-ness lives at the VARIATION level, not the task level. The
  // ClickatronTask schema has no top-level `status` field — only each variation in
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
        // first this matches zero docs (modifiedCount 0) and we skip the refund —
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
            // LOUDFAIL: temporary loud logging for testing — remove (docs/SOFT_FAILURE_AUDIT_2026-06-26.md)
            console.error('[LOUDFAIL][Cron][Clickatron][REFUND-FAILED][MONEY-LOSS] stuck-slide refund threw (slide already failed; no further recovery):', { userId: task.clerkUserId, taskId, variationId: variation.id, amount: refundPerVariation, refundError });
            results.details.push(
              `Failed to refund stuck Clickatron variation ${variation.id} (task ${taskId}): ${refundError instanceof Error ? refundError.message : String(refundError)}`,
            );
          }
        } else {
          // Fail loud: a zero cost means the credit-cost config lost the 'variation'
          // action (regression). The variation is still correctly failed above.
          results.errors++;
          // LOUDFAIL: temporary loud logging for testing — remove (docs/SOFT_FAILURE_AUDIT_2026-06-26.md)
          console.error('[LOUDFAIL][Cron][Clickatron][CONFIG-REGRESSION][MONEY] getCreditCost returned 0 -> stuck slide failed but NOT refunded:', { userId: task.clerkUserId, taskId, variationId: variation.id });
          results.details.push(
            `Clickatron variation ${variation.id} failed but refund skipped: getCreditCost returned ${refundPerVariation}`,
          );
        }
      }
    }
  } catch (e) {
    // LOUDFAIL: temporary loud logging for testing — remove (docs/SOFT_FAILURE_AUDIT_2026-06-26.md).
    // NOTE: the cron still returns 200 even when this fires — the whole Clickatron stuck-slide sweep was skipped this run (no refunds).
    logger.error('[LOUDFAIL][Cron][Clickatron][WATCHDOG-DIED][MONEY] entire stuck-slide sweep failed; no stuck slides refunded this run:', { error: e });
    results.errors++;
    results.details.push(`Error in Clickatron cron: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3. Handle Alyzitron Timeouts
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

  // 4. Handle Editron Video Pipeline Timeouts
  try {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const editronDb = await getDatabase();
    const videoTimeout = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes

    // Find stuck video jobs
    const stuckVideoJobs = await editronDb.collection('pipeline_video_jobs').find({
      status: { $in: ['processing', 'queued'] },
      createdAt: { $lt: videoTimeout },
    }).toArray();

    for (const job of stuckVideoJobs) {
      await editronDb.collection('pipeline_video_jobs').updateOne(
        { _id: job._id },
        { $set: { status: 'failed', error: 'Timed out after 15 minutes (watchdog)', completedAt: new Date() } },
      );

      // Update batch counters
      if (job.batchId) {
        await editronDb.collection('pipeline_video_batches').updateOne(
          { _id: job.batchId },
          { $inc: { failed: 1 }, $set: { updatedAt: new Date() } },
        );
      }

      results.processed++;
      results.details.push(`Editron video job ${job._id} timed out (stuck ${Math.round((Date.now() - new Date(job.createdAt).getTime()) / 60000)}min)`);
    }

    // Find stuck video batches (all jobs done but batch still "processing")
    const stuckBatches = await editronDb.collection('pipeline_video_batches').find({
      status: 'processing',
      createdAt: { $lt: videoTimeout },
    }).toArray();

    for (const batch of stuckBatches as any[]) {
      const done = (batch.completed || 0) + (batch.failed || 0);
      if (done >= (batch.totalScenes || 0)) {
        const newStatus = batch.failed === 0 ? 'completed' : batch.completed === 0 ? 'failed' : 'partial';
        await editronDb.collection('pipeline_video_batches').updateOne(
          { _id: batch._id },
          { $set: { status: newStatus, updatedAt: new Date() } },
        );
        results.processed++;
        results.details.push(`Editron video batch ${batch._id} stuck at "processing" → ${newStatus}`);
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