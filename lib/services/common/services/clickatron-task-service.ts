import { getClickatronDb } from '@/lib/clickatron-mongo';
import { TaskService } from '../task-service';
import { serviceLogger } from '../task-service';

export class ClickatronTaskService implements TaskService {
  async getTask(taskId: string): Promise<any | null> {
    await getClickatronDb();
    const { ClickatronTask } = await import('@/schemas/Clickatron');
    return await ClickatronTask.findById(taskId);
  }

  async updateTaskFailure(taskId: string, error: { code: string; message: string }): Promise<void> {
    await getClickatronDb();
    const { ClickatronTask } = await import('@/schemas/Clickatron');
    const task = await ClickatronTask.findById(taskId);
    
    if (task) {
      task.status = 'failed';
      task.error_message = `[${error.code}] ${error.message}`;
      task.refunded = true;
      await task.save();
      serviceLogger.info('Clickatron task updated as failed', { taskId });
    }
  }

  isTaskRefunded(task: any): boolean {
    return Boolean(task?.refunded);
  }
}