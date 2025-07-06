import { User } from '@/schemas/user';
import { serviceLogger } from '../task-service';

/**
 * Additional refund logic specific to Alyzitron
 * Refunds maxOver20MinuteAnalysis for videos longer than 20 minutes
 */
export async function alyzitronAdditionalRefund(task: any, userId: string): Promise<void> {
  // Check if video duration is greater than 20 minutes (20 * 60 seconds)
  if (task.metadata && typeof task.metadata.videoDuration === 'number' && task.metadata.videoDuration > 20 * 60) {
    await User.updateOne(
      { clerkId: userId },
      { $inc: { 'serviceLimits.alyzitron.$[elem].currentUsage': -1 } },
      {
        arrayFilters: [
          { 'elem.limitType': 'maxOver20MinuteAnalysis', 'elem.currentUsage': { $gt: 0 } }
        ]
      }
    );
    serviceLogger.info('Successfully refunded maxOver20MinuteAnalysis for user due to video duration', { userId, taskId: task._id });
  }
}