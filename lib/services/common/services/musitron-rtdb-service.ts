import { RTDBService, serviceLogger } from '../task-service';
import { MusitronRTDBManager } from '@/lib/services/rtdb/musitron-rtdb';

export class MusitronRTDBService implements RTDBService {
  async updateTaskStatus(userId: string, taskId: string, status: string): Promise<void> {
    try {
      await MusitronRTDBManager.updateTaskStatus(userId, taskId, status as any);
      serviceLogger.info('Musitron RTDB task status updated', { userId, taskId, status });
    } catch (error) {
      serviceLogger.error('Failed to update Musitron RTDB task status', { 
        userId, 
        taskId, 
        status, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }
}