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
      // LOUDFAIL: temporary loud logging for testing — remove (docs/SOFT_FAILURE_AUDIT_2026-06-26.md)
      console.error('[LOUDFAIL][handleTaskFailure][REFUND-FAILED][MONEY-LOSS] Alyzitron refund threw but task is still marked refunded:true below (audit-trail lie):', { taskId, userId, serviceName, refundError });
    }
  }

  // Handle credits refund for Clickatron
  if (serviceName === 'clickatron') {
    try {
      // Clickatron bills every generation under the single 'variation' action
      // (see CREDIT_COSTS.clickatron in lib/config/creditCosts.ts — baseCost 3).
      // Legacy action keys were removed; only 'variation' exists in the config.
      // Refund must be model-aware so it matches what the generation originally charged.
      const metadata = task?.metadata as Record<string, unknown> | undefined;
      const model = typeof task?.modelId === 'string'
        ? task.modelId
        : typeof metadata?.modelId === 'string'
          ? metadata.modelId
          : undefined;
      const action = 'variation';

      // Calculate credits to refund (base cost for the action, model-aware)
      const creditsToRefund = getCreditCost('clickatron', action, { model });

      if (creditsToRefund <= 0) {
        // Fail loud rather than issue a silent no-op refund: a zero here means the
        // credit-cost config no longer has the 'variation' action (regression).
        // LOUDFAIL: temporary loud logging for testing — remove (docs/SOFT_FAILURE_AUDIT_2026-06-26.md)
        console.error(
          `[LOUDFAIL][handleTaskFailure][CONFIG-REGRESSION][MONEY] getCreditCost('clickatron','${action}') returned ${creditsToRefund} -> refund aborted (task ${taskId}, user ${userId})`,
        );
      } else {
        await CreditsService.refundCredits(
          userId,
          creditsToRefund,
          `Task timeout - ${taskId}`,
          { service: 'clickatron', action },
        );

        console.log(`[handleTaskFailure] Refunded ${creditsToRefund} credits to ${userId} for Clickatron task ${taskId}`);
      }
    } catch (refundError) {
      // LOUDFAIL: temporary loud logging for testing — remove (docs/SOFT_FAILURE_AUDIT_2026-06-26.md)
      console.error('[LOUDFAIL][handleTaskFailure][REFUND-FAILED][MONEY-LOSS] Clickatron refund threw but task is still marked refunded:true below (audit-trail lie):', { taskId, userId, refundError });
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