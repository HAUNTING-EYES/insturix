import { database } from '@/lib/firebase/config';
import { ref, set, update, remove, get } from 'firebase/database';
import { TaskUpdate, TaskStatus } from '@/types/rtdb';
import { logger } from '@/app/api/services/alyzitron/utils/logger';

export class ClickatronRTDBManager {
  private static getUserTaskPath(userId: string, taskId: string): string {
    return `/${userId}/clickatron/${taskId}`;
  }

  static async createTask(userId: string, taskId: string, title?: string, description?: string): Promise<void> {
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

      const taskRef = ref(database, this.getUserTaskPath(userId, taskId));
      await set(taskRef, taskUpdate);

      logger.info('Clickatron task created in RTDB', { data: { userId, taskId, status: 'listed' } });
    } catch (error) {
      logger.error('Failed to create clickatron task in RTDB', {
        data: { userId, taskId, error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  static async updateTaskStatus(userId: string, taskId: string, status: TaskStatus): Promise<void> {
    try {
      const updates = {
        status,
        updatedAt: new Date().toISOString(),
      };

      const taskRef = ref(database, this.getUserTaskPath(userId, taskId));
      await update(taskRef, updates);

      logger.info('Clickatron task status updated in RTDB', { data: { userId, taskId, status } });
    } catch (error) {
      logger.error('Failed to update clickatron task status in RTDB', { 
        data: { userId, taskId, status, error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  static async removeTask(userId: string, taskId: string): Promise<void> {
    try {
      const taskRef = ref(database, this.getUserTaskPath(userId, taskId));
      await remove(taskRef);

      logger.info('Clickatron task removed from RTDB', { data: { userId, taskId } });
    } catch (error) {
      logger.error('Failed to remove clickatron task from RTDB', {
        data: { userId, taskId, error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }
}