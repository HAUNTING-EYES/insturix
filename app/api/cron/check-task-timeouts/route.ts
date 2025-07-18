import { NextResponse } from 'next/server';
import { handleTaskFailure } from '@/lib/services/tasks/handle-failure';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { getCollections as getAlyzitronCollections } from '@/app/api/services/alyzitron/utils/mongodb';
import { logger } from '@/app/api/services/alyzitron/utils/logger';
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
  try {
    await getClickatronDb();
    const clickatronTimeout = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes
    const stuckClickatronTasks = await ClickatronTask.find({
      status: { $in: ['processing', 'queued', 'listed'] },
      updatedAt: { $lt: clickatronTimeout },
      refunded: { $ne: true } // Ensure we don't re-process
    }).lean();

    for (const task of stuckClickatronTasks) {
      // Update status in MongoDB
      await ClickatronTask.updateOne(
        { _id: task._id },
        {
          $set: {
            status: 'failed',
            error_message: 'Task timed out and was marked as failed by the system.',
            updatedAt: new Date()
          }
        }
      );
      await handleTaskFailure({
        taskId: (task._id as Types.ObjectId).toString(),
        serviceName: 'clickatron',
        userId: task.userId,
        error: {
          code: 'TIMEOUT',
          message: 'Task timed out and was marked as failed by the system.',
        },
        taskType: task.type,
        task: task,
      });
      results.processed++;
      results.details.push(`Processed Clickatron task ${(task._id as Types.ObjectId).toString()}`);
    }
  } catch (e) {
    logger.error('Error processing Clickatron timeouts in cron job', { error: e });
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

  logger.info('Cron job for task timeouts completed', results);
  return NextResponse.json(results);
}