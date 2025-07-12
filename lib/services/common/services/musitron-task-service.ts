import { getMusitronDb } from '@/lib/musitron-mongo';
import { TaskService } from '../task-service';
import { serviceLogger } from '../task-service';
import { MusitronTask } from '@/schemas/Musitron';

export class MusitronTaskService implements TaskService {
  async getTask(taskId: string): Promise<any | null> {
    await getMusitronDb();
    return await MusitronTask.findById(taskId);
  }

  async updateTaskFailure(taskId: string, error: { code: string; message: string }): Promise<void> {
    await getMusitronDb();
    const task = await MusitronTask.findById(taskId);
    
    if (task) {
      task.status = 'failed';
      task.error = error;
      task.refunded = true;
      await task.save();
      serviceLogger.info('Musitron task updated as failed', { taskId });
    }
  }

  isTaskRefunded(task: any): boolean {
    return Boolean(task?.refunded);
  }
}