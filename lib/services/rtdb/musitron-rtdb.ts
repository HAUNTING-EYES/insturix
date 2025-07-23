import { database } from '@/lib/firebase/config';
import { ref, set } from 'firebase/database';
import { logger } from '@/app/api/services/alyzitron/utils/logger';

type MusitronTaskStatus = 'queued' | 'processing' | 'complete' | 'failed';

export class MusitronRTDBManager {
  private static getTaskRef(userId: string, taskId: string) {
    return ref(database, `musitron-tasks/${userId}/${taskId}/status`);
  }

  static async updateTaskStatus(userId: string, taskId: string, status: MusitronTaskStatus): Promise<void> {
    try {
      await set(this.getTaskRef(userId, taskId), status);
      logger.info('Musitron RTDB task status updated', { userId, taskId, status });
    } catch (error) {
      logger.error('Failed to update Musitron RTDB task status', { 
        userId, 
        taskId, 
        status, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }
}