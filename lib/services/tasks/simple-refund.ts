import { User } from '@/schemas/user';
import { REFUND_MAPPING } from '../refund-config';

export async function processRefund(serviceName: string, taskType: string, userId: string) {
  // Process standard refunds
  const usageTypes = REFUND_MAPPING[serviceName]?.[taskType];
  if (usageTypes) {
    for (const usageType of usageTypes) {
      await refundUsage(userId, serviceName, usageType);
    }
  }
}

async function refundUsage(userId: string, serviceName: string, usageType: string) {
  await User.updateOne(
    { clerkUserId: userId },
    { $inc: { [`currentPlan.serviceLimits.${serviceName}.$[elem].currentUsage`]: -1 } },
    { arrayFilters: [{ 'elem.limitType': usageType, 'elem.currentUsage': { $gt: 0 } }] }
  );
}