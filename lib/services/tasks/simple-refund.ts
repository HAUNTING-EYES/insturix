import { User } from '@/schemas/user';
import { REFUND_MAPPING } from '../refund-config';

export async function processRefund(serviceName: string, taskType: string, userId: string, minutes: number) {
  // Process standard refunds
  const usageTypes = REFUND_MAPPING[serviceName]?.[taskType];
  if (usageTypes) {
    for (const usageType of usageTypes) {
      await refundUsage(userId, serviceName, usageType, minutes);
    }
  }
}

async function refundUsage(userId: string, serviceName: string, usageType: string, minutes: number) {
  // Always decrement by the specified minutes
  await User.updateOne(
    { clerkUserId: userId },
    { $inc: { [`currentPlan.serviceLimits.${serviceName}.$[elem].currentUsage`]: -minutes } },
    { arrayFilters: [{ 'elem.limitType': usageType, 'elem.currentUsage': { $gt: 0 } }] }
  );
}