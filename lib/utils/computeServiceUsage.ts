import { User } from "@/types/userTypes";
import { IServiceLimits, IServiceLimit } from "@/schemas/user";
import type { ServiceUsageInfo } from "@/lib/services/serviceUsageService";

export type ServiceUsageData = Record<string, Record<string, ServiceUsageInfo>>;

export function computeServiceUsageFromUser(user: User): ServiceUsageData {
  if (!user || !user.currentPlan?.serviceLimits) {
    console.warn("[computeServiceUsage] No user or serviceLimits provided");
    return {};
  }

  const serviceLimits: IServiceLimits = user.currentPlan.serviceLimits;

  // Check for empty limits and log, but don't throw - return {} for display
  const hasEmptyServiceLimits = Object.values(serviceLimits).every(limits =>
    Array.isArray(limits) ? limits.length === 0 :
    (limits && typeof limits === 'object' && Object.keys(limits).length === 0)
  );

  if (hasEmptyServiceLimits) {
    console.warn(`[computeServiceUsage] User ${user.clerkUserId} has empty serviceLimits:`, serviceLimits);
    console.log(`[computeServiceUsage] User currentPlan structure:`, user.currentPlan);
    console.log(`[computeServiceUsage] Service limits breakdown:`, Object.entries(serviceLimits).reduce((acc, [service, limits]) => ({...acc, [service]: Array.isArray(limits) ? limits.length : Object.keys(limits || {}).length }), {}));
    return {};
  }

  const result: ServiceUsageData = {};

  // Iterate through all services
  Object.entries(serviceLimits).forEach(([serviceName, limits]) => {
    result[serviceName] = {};

    if (Array.isArray(limits)) {
      (limits as IServiceLimit[]).forEach((limit: IServiceLimit) => {
        const isUnlimited = limit.maxUsage === -1;
        const remaining = isUnlimited ? -1 : limit.maxUsage - limit.currentUsage;
        // For display, if no lastReset, set timeUntilReset to null (matches server if no reset needed)
        const timeUntilReset = (limit.resetPeriod !== "none" && limit.lastReset)
          ? getTimeUntilReset(limit.lastReset, limit.resetPeriod)
          : null;

        result[serviceName][limit.limitType] = {
          hasAccess: isUnlimited || remaining > 0,
          maxUsage: limit.maxUsage,
          currentUsage: limit.currentUsage,
          remaining,
          resetPeriod: limit.resetPeriod,
          lastReset: limit.lastReset,
          isUnlimited,
          timeUntilReset,
        };
      });
    } else {
      console.error(`Service ${serviceName} limits are not an array:`, limits);
    }
  });

  console.log(`[computeServiceUsage] Computed usage for user ${user.clerkUserId}:`, result);
  return result;
}

function getTimeUntilReset(
  lastReset: Date | string | undefined,
  resetPeriod: "weekly" | "monthly" | "daily" | "none"
): { days: number; hours: number; minutes: number; totalMs: number } | null {
  if (!lastReset || resetPeriod === "none") {
    return null;
  }

  const lastResetDate = lastReset instanceof Date ? lastReset : new Date(lastReset);
  
  if (isNaN(lastResetDate.getTime())) {
    console.warn('Invalid lastReset date:', lastReset);
    return null;
  }

  const now = new Date();
  
  // For client-side display, assume no auto-reset needed; calculate next if valid
  let nextReset: Date;

  switch (resetPeriod) {
    case "daily":
      nextReset = new Date(lastResetDate.getTime() + 24 * 60 * 60 * 1000);
      break;
    case "weekly":
      nextReset = new Date(lastResetDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case "monthly":
      nextReset = new Date(lastResetDate);
      nextReset.setMonth(nextReset.getMonth() + 1);
      break;
    default:
      return null;
  }

  const timeLeft = nextReset.getTime() - now.getTime();
  
  if (timeLeft <= 0) {
    return null;
  }

  const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
  const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

  return { days, hours, minutes, totalMs: timeLeft };
}