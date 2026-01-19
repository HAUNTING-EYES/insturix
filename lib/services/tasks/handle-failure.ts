import { CreditsService } from '@/lib/services/creditsService';
import { getCreditCost } from '@/lib/config/creditCosts';

interface FailureParams {
  taskId: string;
  serviceName: 'alyzitron' | 'clickatron';
  userId: string;
  error: {
    code: string;
    message: string;
  };
  taskType?: string;
  task?: Record<string, unknown>;
}

/**
 * Simplified function to handle task failures and refunds
 * Uses the new credits system for all services
 */
export async function handleTaskFailure({ taskId, serviceName, userId, taskType, task }: FailureParams): Promise<void> {
  if (!taskType) {
    // Try to determine taskType from task if available
    const inferredType = (task && typeof (task as Record<string, unknown>).type === 'string')
      ? String((task as Record<string, unknown>).type)
      : undefined;
    taskType = inferredType;
  }

  if (!taskType) {
    console.warn('Cannot process refund: taskType not provided and cannot be determined');
    return;
  }

  // Handle credits refund for Alyzitron
  if (serviceName === 'alyzitron') {
    try {
      // Get video duration from task to calculate credits to refund
      const metadata = task?.metadata as Record<string, unknown> | undefined;
      const videoDuration = task?.videoDuration || metadata?.videoDuration || metadata?.duration;
      const durationMinutes = typeof videoDuration === 'number' ? Math.ceil(videoDuration / 60) : 1;

      // Calculate credits to refund (same formula as deduction)
      const creditsToRefund = getCreditCost('alyzitron', 'video_analysis', {
        durationMinutes
      });

      await CreditsService.refundCredits(
        userId,
        creditsToRefund,
        `Task timeout - ${taskId}`,
        { service: 'alyzitron', action: 'video_analysis' }
      );

      console.log(`[handleTaskFailure] Refunded ${creditsToRefund} credits to ${userId} for Alyzitron task ${taskId}`);
    } catch (refundError) {
      console.error('[handleTaskFailure] Failed to refund Alyzitron credits:', refundError);
    }
  }

  // Handle credits refund for Clickatron
  if (serviceName === 'clickatron') {
    try {
      // Determine the action from taskType
      const action = taskType === 'variation' ? 'generate_variation' : 'generate_ad';
      
      // Calculate credits to refund (base cost for the action)
      const creditsToRefund = getCreditCost('clickatron', action, {});

      await CreditsService.refundCredits(
        userId,
        creditsToRefund,
        `Task timeout - ${taskId}`,
        { service: 'clickatron', action }
      );

      console.log(`[handleTaskFailure] Refunded ${creditsToRefund} credits to ${userId} for Clickatron task ${taskId}`);
    } catch (refundError) {
      console.error('[handleTaskFailure] Failed to refund Clickatron credits:', refundError);
    }
  }

  // Update database status
  try {
    if (serviceName === 'clickatron') {
      // Update Clickatron task status in MongoDB
      const { ClickatronTask } = await import('@/schemas/Clickatron');
      const { getClickatronDb } = await import('@/lib/clickatron-mongo');
      const { Types } = await import('mongoose');

      await getClickatronDb();
      const objectId = new Types.ObjectId(taskId);

      await ClickatronTask.findOneAndUpdate(
        { _id: objectId, clerkUserId: userId },
        {
          status: 'failed',
          updatedAt: new Date(),
          refunded: true,
          error_message: 'Task processing failed'
        }
      );
    } else if (serviceName === 'alyzitron') {
      // Update Alyzitron task status directly in MongoDB
      try {
        const { getCollections } = await import('@/app/api/services/alyzitron/utils/mongodb');
        const { ObjectId } = await import('mongodb');
        const { analyses } = await getCollections();

        if (ObjectId.isValid(taskId)) {
          await analyses.updateOne(
            { _id: new ObjectId(taskId), clerkUserId: userId },
            {
              $set: {
                status: 'failed',
                updatedAt: new Date(),
                refunded: true,
                error: { code: 'processing_failed', message: 'Task processing failed' },
              },
            }
          );
        } else {
          // Fallback: update by taskId field if stored differently
          await analyses.updateOne(
            { taskId: taskId, clerkUserId: userId },
            {
              $set: {
                status: 'failed',
                updatedAt: new Date(),
                refunded: true,
                error: { code: 'processing_failed', message: 'Task processing failed' },
              },
            }
          );
        }
      } catch (e) {
        console.warn('Failed to update Alyzitron task in MongoDB', { e });
      }
    }
  } catch (dbError) {
    console.warn('Failed to update task status', { userId, taskId, serviceName, dbError });
  }
}