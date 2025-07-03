import { database } from '@/lib/firebase/config';
import { ref, set, update, remove, get } from 'firebase/database';
import { TaskUpdate, TaskStatus } from '@/types/rtdb';

export class ClickatronRTDBManager {
  private static getUserTaskPath(userId: string, taskId: string): string {
    return `/${userId}/clickatron/${taskId}`;
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

      console.log('Clickatron task created in RTDB', { userId, taskId, status: 'listed' });
    } catch (error) {
      console.error('Failed to create clickatron task in RTDB', {
        userId, taskId, error: error instanceof Error ? error.message : String(error)
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

      console.log('Clickatron task status updated in RTDB', { userId, taskId, status });
    } catch (error) {
      console.error('Failed to update clickatron task status in RTDB', { 
        userId, taskId, status, error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  static async removeTask(userId: string, taskId: string): Promise<void> {
    try {
      const taskRef = ref(database, this.getUserTaskPath(userId, taskId));
      await remove(taskRef);

      console.log('Clickatron task removed from RTDB', { userId, taskId });
    } catch (error) {
      console.error('Failed to remove clickatron task from RTDB', {
        userId, taskId, error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  static async getConcurrentTasksCount(userId: string): Promise<number> {
    try {
      const userTasksRef = ref(database, `/${userId}/clickatron`);
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
      
      console.log('Concurrent clickatron tasks counted from RTDB', {
        userId, concurrentCount
      });
      
      return concurrentCount;
    } catch (error) {
      console.error('Failed to count concurrent clickatron tasks from RTDB', {
        userId, error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}