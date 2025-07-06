import { RTDBService, serviceLogger } from '../task-service';

export class ClickatronRTDBService implements RTDBService {
  async updateTaskStatus(userId: string, taskId: string, status: string): Promise<void> {
    try {
      const { ClickatronRTDBManager } = await import('@/lib/services/rtdb/clickatron-rtdb');
      await ClickatronRTDBManager.updateTaskStatus(userId, taskId, status as any);
      serviceLogger.info('Clickatron RTDB task status updated', { userId, taskId, status });
    } catch (error) {
      serviceLogger.error('Failed to update Clickatron RTDB task status', { 
        userId, 
        taskId, 
        status, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }
}