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
      // Update Alyzitron task status directly in MongoDB (RTDB removed)
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

async function refundUsage(userId: string, serviceName: string, usageType: string) {
  await User.updateOne(
    { clerkUserId: userId },
    { $inc: { [`currentPlan.serviceLimits.${serviceName}.$[elem].currentUsage`]: -1 } },
    { arrayFilters: [{ 'elem.limitType': usageType, 'elem.currentUsage': { $gt: 0 } }] }
  );
}