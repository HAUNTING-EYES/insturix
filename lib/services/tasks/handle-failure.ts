import { User } from '@/schemas/user';
import { getServiceConfig, serviceLogger } from '../common/task-service';

interface FailureParams {
  taskId: string; // This taskId refers to the _id of the document in MongoDB
  serviceName: 'alyzitron' | 'clickatron';
  userId: string;
  error: {
    code: string;
    message: string;
  };
}

/**
 * A centralized, idempotent function to handle task failures.
 * It marks the task as failed in the database and refunds the user's usage credit.
 * Uses unified service architecture for scalability across all services.
 *
 * @param params - The parameters for the failure handling.
 */
export async function handleTaskFailure({ taskId, serviceName, userId, error }: FailureParams) {
  serviceLogger.info('Processing task failure', { taskId, serviceName, userId });

  try {
    // Get unified service configuration
    const serviceConfig = await getServiceConfig(serviceName);
    
    // Get task using unified service
    const task = await serviceConfig.taskService.getTask(taskId);
    
    if (!task) {
      serviceLogger.warn(`${serviceName} task not found for failure handling`, { taskId });
      return;
    }
    
    if (serviceConfig.taskService.isTaskRefunded(task)) {
      serviceLogger.warn(`${serviceName} task already refunded`, { taskId });
      return;
    }

    // Update task status using unified service
    await serviceConfig.taskService.updateTaskFailure(taskId, error);

    // Apply additional refund logic if available (e.g., Alyzitron's video duration logic)
    if (serviceConfig.additionalRefundLogic) {
      await serviceConfig.additionalRefundLogic(task, userId);
    }

    // Update RTDB task status using unified service
    try {
      await serviceConfig.rtdbService.updateTaskStatus(userId, taskId, 'failed');
    } catch (rtdbError) {
      serviceLogger.warn('Failed to update RTDB task status', { userId, taskId, serviceName, rtdbError });
    }

    // Common logic: Refund the main usage credit for the user
    const { usageConfig } = serviceConfig;
    await User.updateOne(
      { clerkId: userId },
      { $inc: { [`${usageConfig.array}.$[elem].currentUsage`]: -1 } },
      {
        arrayFilters: [
          { 'elem.limitType': usageConfig.limitType, 'elem.currentUsage': { $gt: 0 } }
        ]
      }
    );
    
    serviceLogger.info('Successfully refunded main usage for user', { 
      userId, 
      serviceName, 
      taskId, 
      limitType: usageConfig.limitType 
    });

  } catch (e) {
    serviceLogger.error('Critical error in handleTaskFailure', {
      errorMessage: e instanceof Error ? e.message : String(e),
      taskId,
      serviceName,
    });
    // Re-throw the error to be handled by the caller (e.g., webhook response)
    throw e;
  }
}