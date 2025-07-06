import { RTDBService, serviceLogger } from '../task-service';

export class AlyzitronRTDBService implements RTDBService {
  async updateTaskStatus(userId: string, taskId: string, status: string): Promise<void> {
    try {
      const { AlyzitronRTDBManager } = await import('@/lib/services/rtdb/alyzitron-rtdb');
      await AlyzitronRTDBManager.updateTaskStatus(userId, taskId, status as any);
      serviceLogger.info('Alyzitron RTDB task status updated', { userId, taskId, status });
    } catch (error) {
      serviceLogger.error('Failed to update Alyzitron RTDB task status', { 
        userId, 
        taskId, 
        status, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }
}