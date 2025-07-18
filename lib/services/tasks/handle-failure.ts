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
  task?: any;
}

/**
 * Simplified function to handle task failures and refunds
 * Webhooks should already have updated the task status, so we only handle refunds
 */
export async function handleTaskFailure({ taskId, serviceName, userId, error, taskType, task }: FailureParams) {
  if (!taskType) {
    // Try to determine taskType from task if available
    taskType = task?.type;
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

  // Update RTDB status (simplified - direct implementation)
  try {
    if (serviceName === 'clickatron') {
      const { ClickatronRTDBManager } = await import('@/lib/services/rtdb/clickatron-rtdb');
      await ClickatronRTDBManager.updateTaskStatus(userId, taskId, 'failed');
    } else if (serviceName === 'alyzitron') {
      const { AlyzitronRTDBManager } = await import('@/lib/services/rtdb/alyzitron-rtdb');
      await AlyzitronRTDBManager.updateTaskStatus(userId, taskId, 'failed');
    }
  } catch (rtdbError) {
    console.warn('Failed to update RTDB task status', { userId, taskId, serviceName, rtdbError });
  }
}

async function refundUsage(userId: string, serviceName: string, usageType: string) {
  await User.updateOne(
    { clerkUserId: userId },
    { $inc: { [`currentPlan.serviceLimits.${serviceName}.$[elem].currentUsage`]: -1 } },
    { arrayFilters: [{ 'elem.limitType': usageType, 'elem.currentUsage': { $gt: 0 } }] }
  );
}