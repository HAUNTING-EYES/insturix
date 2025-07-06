import { logger } from '@/app/api/services/alyzitron/utils/logger';

/**
 * Common interface for task operations across all services
 */
export interface TaskService {
  /**
   * Get a task by ID
   */
  getTask(taskId: string): Promise<any | null>;
  
  /**
   * Update task status and mark as refunded
   */
  updateTaskFailure(taskId: string, error: { code: string; message: string }): Promise<void>;
  
  /**
   * Check if task is already refunded
   */
  isTaskRefunded(task: any): boolean;
}

/**
 * Common interface for RTDB operations across all services
 */
export interface RTDBService {
  /**
   * Update task status in RTDB
   */
  updateTaskStatus(userId: string, taskId: string, status: string): Promise<void>;
}

/**
 * Service configuration for unified handling
 */
export interface ServiceConfig {
  name: 'alyzitron' | 'clickatron';
  taskService: TaskService;
  rtdbService: RTDBService;
  usageConfig: {
    array: string;
    limitType: string;
  };
  additionalRefundLogic?: (task: any, userId: string) => Promise<void>;
}

/**
 * Factory function to get service configuration
 */
export async function getServiceConfig(serviceName: 'alyzitron' | 'clickatron'): Promise<ServiceConfig> {
  if (serviceName === 'alyzitron') {
    const { AlyzitronTaskService } = await import('./services/alyzitron-task-service');
    const { AlyzitronRTDBService } = await import('./services/alyzitron-rtdb-service');
    const { alyzitronAdditionalRefund } = await import('./services/alyzitron-additional-refund');
    
    return {
      name: 'alyzitron',
      taskService: new AlyzitronTaskService(),
      rtdbService: new AlyzitronRTDBService(),
      usageConfig: {
        array: 'serviceLimits.alyzitron',
        limitType: 'maxTotalAnalysis'
      },
      additionalRefundLogic: alyzitronAdditionalRefund
    };
  } else {
    const { ClickatronTaskService } = await import('./services/clickatron-task-service');
    const { ClickatronRTDBService } = await import('./services/clickatron-rtdb-service');

    return {
      name: 'clickatron',
      taskService: new ClickatronTaskService(),
      rtdbService: new ClickatronRTDBService(),
      usageConfig: {
        array: 'serviceLimits.clickatron',
        limitType: 'maxThumbnailGeneration'
      }
    };
  }
}

/**
 * Common logger interface
 */
export const serviceLogger = {
  info: (message: string, data?: any) => logger.info(message, data),
  warn: (message: string, data?: any) => logger.warn(message, data),
  error: (message: string, data?: any) => logger.error(message, data),
};