import { database } from '@/lib/firebase/config';
import { ref, set, update, remove, get } from 'firebase/database';
import { TaskUpdate, TaskStatus } from '@/types/rtdb';
import { logger } from '@/app/api/services/alyzitron/utils/logger';

export class AlyzitronRTDBManager {
  private static getUserTaskPath(userId: string, analysisId: string): string {
    return `/${userId}/alyzitron/${analysisId}`;
  }

  static async createTask(userId: string, analysisId: string, title?: string, description?: string): Promise<void> {
    try {
      const taskUpdate: TaskUpdate = {
        status: 'listed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Only add optional fields if they have values (Firebase RTDB doesn't allow undefined)
      if (title) {
        taskUpdate.title = title;
      }
      if (description) {
        taskUpdate.description = description;
      }

      const taskRef = ref(database, this.getUserTaskPath(userId, analysisId));
      await set(taskRef, taskUpdate);

      logger.info('Task created in RTDB', { data: { userId, analysisId, status: 'listed' } });
    } catch (error) {
      logger.error('Failed to create task in RTDB', {
        data: { userId, analysisId, error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  static async updateTaskStatus(userId: string, analysisId: string, status: TaskStatus): Promise<void> {
    try {
      const updates = {
        status,
        updatedAt: new Date().toISOString(),
      };

      const taskRef = ref(database, this.getUserTaskPath(userId, analysisId));
      await update(taskRef, updates);

      logger.info('Task status updated in RTDB', { data: { userId, analysisId, status } });
    } catch (error) {
      logger.error('Failed to update task status in RTDB', {
        data: { userId, analysisId, status, error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  static async removeTask(userId: string, analysisId: string): Promise<void> {
    try {
      const taskRef = ref(database, this.getUserTaskPath(userId, analysisId));
      await remove(taskRef);

      logger.info('Task removed from RTDB', { data: { userId, analysisId } });
    } catch (error) {
      logger.error('Failed to remove task from RTDB', {
        data: { userId, analysisId, error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }
}