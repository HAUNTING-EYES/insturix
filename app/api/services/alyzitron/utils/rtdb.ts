import { database } from '@/lib/firebase/config';
import { ref, set, update, remove, get } from 'firebase/database';
import { TaskUpdate, TaskStatus } from '@/types/rtdb';
import { logger } from './logger';

export class RTDBManager {
  private static getUserTaskPath(userId: string, taskId: string): string {
    return `/${userId}/alyzitron/${taskId}`;
  }

  static async createTask(userId: string, taskId: string, title?: string, description?: string): Promise<void> {
    try {
      const taskUpdate: TaskUpdate = {
        taskId,
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

      logger.info('Task created in RTDB', { data: { userId, taskId, status: 'listed' } });
    } catch (error) {
      logger.error('Failed to create task in RTDB', {
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

      logger.info('Task status updated in RTDB', { data: { userId, taskId, status } });
    } catch (error) {
      logger.error('Failed to update task status in RTDB', { 
        data: { userId, taskId, status, error: error instanceof Error ? error.message : String(error) } 
      });
      throw error;
    }
  }

  static async removeTask(userId: string, taskId: string): Promise<void> {
    try {
      const taskRef = ref(database, this.getUserTaskPath(userId, taskId));
      await remove(taskRef);

      logger.info('Task removed from RTDB', { data: { userId, taskId } });
    } catch (error) {
      logger.error('Failed to remove task from RTDB', {
        data: { userId, taskId, error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  static async getConcurrentTasksCount(userId: string): Promise<number> {
    try {
      const userTasksRef = ref(database, `/${userId}/alyzitron`);
      const snapshot = await get(userTasksRef);
      
      if (!snapshot.exists()) {
        return 0;
      }
      
      const tasks = snapshot.val();
      let concurrentCount = 0;
      
      // Count tasks with status 'queued' or 'processing'
      for (const taskId in tasks) {
        const task = tasks[taskId];
        if (task.status === 'queued' || task.status === 'processing') {
          concurrentCount++;
        }
      }
      
      logger.info('Concurrent tasks counted from RTDB', {
        data: { userId, concurrentCount }
      });
      
      return concurrentCount;
    } catch (error) {
      logger.error('Failed to count concurrent tasks from RTDB', {
        data: { userId, error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }
}