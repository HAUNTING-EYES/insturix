import { getCollections as getAlyzitronCollections } from '@/app/api/services/alyzitron/utils/mongodb';
import { TaskService } from '../task-service';
import { serviceLogger } from '../task-service';

export class AlyzitronTaskService implements TaskService {
  async getTask(taskId: string): Promise<any | null> {
    const { analyses } = await getAlyzitronCollections();
    return await analyses.findOne({ _id: taskId });
  }

  async updateTaskFailure(taskId: string, error: { code: string; message: string }): Promise<void> {
    const { analyses } = await getAlyzitronCollections();
    await analyses.updateOne(
      { _id: taskId },
      { 
        $set: { 
          status: 'failed', 
          error, 
          refunded: true, 
          updatedAt: new Date() 
        } 
      }
    );
    serviceLogger.info('Alyzitron task updated as failed', { taskId });
  }

  isTaskRefunded(task: any): boolean {
    return Boolean(task?.refunded);
  }
}