import { User } from '@/schemas/user';
import { REFUND_MAPPING } from '../refund-config';

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
 * Webhooks should already have updated the task status, so we only handle refunds
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

  // Process standard refunds
  const usageTypes = REFUND_MAPPING[serviceName]?.[taskType];
  if (usageTypes) {
    for (const usageType of usageTypes) {
      await refundUsage(userId, serviceName, usageType);
    }
  }

  // No conditional refunds - taskType determines usage type directly

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
          error_message: 'Task processing failed'
        }
      );
    } else if (serviceName === 'alyzitron') {
      const { AlyzitronRTDBManager } = await import('@/lib/services/rtdb/alyzitron-rtdb');
      await AlyzitronRTDBManager.updateTaskStatus(userId, taskId, 'failed');
    }
  } catch (dbError) {
    console.warn('Failed to update task status', { userId, taskId, serviceName, dbError });
  }
}

async function refundUsage(userId: string, serviceName: string, usageType: string) {
  await User.updateOne(
    { clerkUserId: userId },
    { $inc: { [`currentPlan.serviceLimits.${serviceName}.$[elem].currentUsage`]: -1 } },
    { arrayFilters: [{ 'elem.limitType': usageType, 'elem.currentUsage': { $gt: 0 } }] }
  );
}