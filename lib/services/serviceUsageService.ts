import connectToDatabase from "@/schemas/ConnectToDatabase";
import { User } from "@/schemas/user";
import { IServiceLimits, IServiceLimit } from "@/schemas/user";

export interface ServiceUsageInfo {
  hasAccess: boolean;
  maxUsage: number;
  currentUsage: number;
  remaining: number;
  resetPeriod: "weekly" | "monthly" | "daily" | "none";
  lastReset?: Date;
  isUnlimited: boolean;
  timeUntilReset?: { days: number; hours: number; minutes: number; totalMs: number } | null;
}

export class ServiceUsageService {
  /**
   * Check if user can use a specific service feature
   */
  static async canUseService(
    userId: string,
    serviceName: keyof IServiceLimits,
    limitType: string
  ): Promise<ServiceUsageInfo> {
    await connectToDatabase();
    
    // Auto-reset services that need to be reset (lazy reset)
    await this.autoResetServices(userId);
    
    const user = await User.findOne({ clerkUserId: userId });
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const serviceLimit = user.currentPlan.serviceLimits[serviceName]?.find(
      (limit: IServiceLimit) => limit.limitType === limitType
    );

    if (!serviceLimit) {
      return {
        hasAccess: false,
        maxUsage: 0,
        currentUsage: 0,
        remaining: 0,
        resetPeriod: "monthly",
        isUnlimited: false,
        timeUntilReset: null,
      };
    }

    const isUnlimited = serviceLimit.maxUsage === -1;
    const remaining = isUnlimited ? -1 : serviceLimit.maxUsage - serviceLimit.currentUsage;
    let hasAccess = isUnlimited || remaining > 0;
    
    // If lastReset is undefined and resetPeriod is not "none", assume user has access
    if (!serviceLimit.lastReset && serviceLimit.resetPeriod !== "none") {
      hasAccess = true;
    }
    
    const timeUntilReset = this.getTimeUntilReset(serviceLimit.lastReset, serviceLimit.resetPeriod);

    return {
      hasAccess,
      maxUsage: serviceLimit.maxUsage,
      currentUsage: serviceLimit.currentUsage,
      remaining,
      resetPeriod: serviceLimit.resetPeriod,
      lastReset: serviceLimit.lastReset,
      isUnlimited,
      timeUntilReset,
    };
  }

  /**
   * Use a service feature (increment usage)
   */
  static async useService(
    userId: string,
    serviceName: keyof IServiceLimits,
    limitType: string,
    amount: number = 1
  ): Promise<ServiceUsageInfo> {
    await connectToDatabase();
    
    // Auto-reset services that need to be reset (lazy reset)
    await this.autoResetServices(userId);
    
    const user = await User.findOne({ clerkUserId: userId });
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const serviceLimit = user.currentPlan.serviceLimits[serviceName]?.find(
      (limit: IServiceLimit) => limit.limitType === limitType
    );

    if (!serviceLimit) {
      throw new Error(`Service limit '${limitType}' not found in '${serviceName}' service`);
    }

    // Check if unlimited
    if (serviceLimit.maxUsage === -1) {
      // If going from 0 to 1, set reset date
      if (serviceLimit.currentUsage === 0 && amount > 0 && serviceLimit.resetPeriod !== "none") {
        serviceLimit.lastReset = new Date();
      }
      
      serviceLimit.currentUsage += amount;
      user.markModified('currentPlan.serviceLimits');
      await user.save();
      
      const timeUntilReset = this.getTimeUntilReset(serviceLimit.lastReset, serviceLimit.resetPeriod);
      
      return {
        hasAccess: true,
        maxUsage: -1,
        currentUsage: serviceLimit.currentUsage,
        remaining: -1,
        resetPeriod: serviceLimit.resetPeriod,
        lastReset: serviceLimit.lastReset,
        isUnlimited: true,
        timeUntilReset,
      };
    }

    // Check if usage would exceed limit
    if (serviceLimit.currentUsage + amount > serviceLimit.maxUsage) {
      throw new Error(`Service usage limit exceeded for '${serviceName}.${limitType}'. Available: ${serviceLimit.maxUsage - serviceLimit.currentUsage}, Requested: ${amount}`);
    }

    // If going from 0 to 1, set reset date
    if (serviceLimit.currentUsage === 0 && amount > 0 && serviceLimit.resetPeriod !== "none") {
      serviceLimit.lastReset = new Date();
    }

    // Increment usage
    serviceLimit.currentUsage += amount;
    user.markModified('currentPlan.serviceLimits');
    await user.save();

    const remaining = serviceLimit.maxUsage - serviceLimit.currentUsage;
    const timeUntilReset = this.getTimeUntilReset(serviceLimit.lastReset, serviceLimit.resetPeriod);

    return {
      hasAccess: remaining > 0,
      maxUsage: serviceLimit.maxUsage,
      currentUsage: serviceLimit.currentUsage,
      remaining,
      resetPeriod: serviceLimit.resetPeriod,
      lastReset: serviceLimit.lastReset,
      isUnlimited: false,
      timeUntilReset,
    };
  }

  /**
   * Get usage info for all services
   */
  static async getServiceUsageForAllServices(userId: string): Promise<Record<string, Record<string, ServiceUsageInfo>>> {
    await connectToDatabase();
    
    // Auto-reset services that need to be reset (lazy reset)
    const resetServices = await this.autoResetServices(userId);
    if (resetServices.length > 0) {
      console.log(`[ServiceUsageService] Auto-reset completed. Reset services:`, resetServices);
    }
    
    // Select only needed fields for better performance
    const user = await User.findOne({ clerkUserId: userId }).select('currentPlan.serviceLimits');
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const result: Record<string, Record<string, ServiceUsageInfo>> = {};

    // Fail fast if serviceLimits is not properly structured
    if (!user.currentPlan.serviceLimits || typeof user.currentPlan.serviceLimits !== 'object') {
      console.error(`User ${userId} has invalid serviceLimits:`, user.currentPlan.serviceLimits);
      throw new Error(`User ${userId} has invalid serviceLimits structure. Check user creation process.`);
    }

    // Convert to plain object to avoid Mongoose document properties
    const serviceLimits = user.currentPlan.serviceLimits?.toObject ?
      user.currentPlan.serviceLimits.toObject() :
      user.currentPlan.serviceLimits;

    // Check if serviceLimits are empty and throw meaningful error
    const hasEmptyServiceLimits = Object.values(serviceLimits).every(limits =>
      Array.isArray(limits) ? limits.length === 0 :
      (limits && typeof limits === 'object' && Object.keys(limits).length === 0)
    );

    if (hasEmptyServiceLimits) {
      console.error(`User ${userId} has empty serviceLimits:`, serviceLimits);
      throw new Error(`User ${userId} has empty serviceLimits. This indicates a problem in user initialization.`);
    }

    // Iterate through all services
    Object.entries(serviceLimits).forEach(([serviceName, limits]) => {
      result[serviceName] = {};
      
      if (Array.isArray(limits)) {
        (limits as IServiceLimit[]).forEach((limit: IServiceLimit) => {
          const isUnlimited = limit.maxUsage === -1;
          const remaining = isUnlimited ? -1 : limit.maxUsage - limit.currentUsage;
          // Only calculate timeUntilReset if there's a lastReset date and resetPeriod is not "none"
          const timeUntilReset = (limit.resetPeriod !== "none" && limit.lastReset)
            ? this.getTimeUntilReset(limit.lastReset, limit.resetPeriod)
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

    return result;
  }

  /**
   * Reset service usage (for periodic resets)
   */
  static async resetServiceUsage(
    userId: string, 
    serviceName?: keyof IServiceLimits,
    limitType?: string
  ): Promise<void> {
    await connectToDatabase();
    
    const user = await User.findOne({ clerkUserId: userId });
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const now = new Date();

    if (serviceName && limitType) {
      // Reset specific limit
      const serviceLimit = user.currentPlan.serviceLimits[serviceName]?.find(
        (limit: IServiceLimit) => limit.limitType === limitType
      );
      if (serviceLimit) {
        serviceLimit.currentUsage = 0;
        serviceLimit.lastReset = now;
      }
    } else if (serviceName) {
      // Reset all limits for a service
      user.currentPlan.serviceLimits[serviceName]?.forEach((limit: IServiceLimit) => {
        limit.currentUsage = 0;
        limit.lastReset = now;
      });
    } else {
      // Reset all limits for all services
      Object.keys(user.currentPlan.serviceLimits).forEach(service => {
        user.currentPlan.serviceLimits[service as keyof IServiceLimits].forEach((limit: IServiceLimit) => {
          limit.currentUsage = 0;
          limit.lastReset = now;
        });
      });
    }

    user.markModified('currentPlan.serviceLimits');
    await user.save();
  }

  /**
   * Check if service usage needs to be reset based on reset period
   */
  static shouldResetUsage(
    lastReset: Date | string | undefined,
    resetPeriod: "weekly" | "monthly" | "daily" | "none"
  ): boolean {
    if (!lastReset || resetPeriod === "none") {
      return false;
    }

    // Ensure lastReset is a Date object (handle string dates from MongoDB)
    const lastResetDate = lastReset instanceof Date ? lastReset : new Date(lastReset);
    
    // Validate the date
    if (isNaN(lastResetDate.getTime())) {
      console.warn('[shouldResetUsage] Invalid lastReset date:', lastReset);
      return false;
    }

    const now = new Date();
    const timeDiff = now.getTime() - lastResetDate.getTime();

    switch (resetPeriod) {
      case "daily":
        return timeDiff >= 24 * 60 * 60 * 1000; // 24 hours
      case "weekly":
        return timeDiff >= 7 * 24 * 60 * 60 * 1000; // 7 days
      case "monthly":
        const monthsDiff = (now.getFullYear() - lastResetDate.getFullYear()) * 12 +
                          (now.getMonth() - lastResetDate.getMonth());
        return monthsDiff >= 1;
      default:
        return false;
    }
  }

  /**
   * Calculate time until next reset
   */
  static getTimeUntilReset(
    lastReset: Date | string | undefined,
    resetPeriod: "weekly" | "monthly" | "daily" | "none"
  ): { days: number; hours: number; minutes: number; totalMs: number } | null {
    if (!lastReset || resetPeriod === "none") {
      return null;
    }

    // Ensure lastReset is a Date object (handle string dates from MongoDB)
    const lastResetDate = lastReset instanceof Date ? lastReset : new Date(lastReset);
    
    // Validate the date
    if (isNaN(lastResetDate.getTime())) {
      console.warn('Invalid lastReset date:', lastReset);
      return null;
    }

    const now = new Date();
    
    // Check if reset is due first - if so, return null (should have been reset already)
    if (this.shouldResetUsage(lastResetDate, resetPeriod)) {
      return null;
    }

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
      return null; // Should have been reset already
    }

    const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
    const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

    return { days, hours, minutes, totalMs: timeLeft };
  }

  /**
   * Auto-reset services that need to be reset based on new logic:
   * - Reset if current date exceeds (lastResetDate + resetPeriod) AND limit isn't 0
   * - Only applies to limits with resetPeriod that's not "none"
   */
  static async autoResetServices(userId: string): Promise<string[]> {
    await connectToDatabase();
    
    const user = await User.findOne({ clerkUserId: userId });
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const resetServices: string[] = [];

    // Fail fast if serviceLimits is not properly structured
    if (!user.currentPlan.serviceLimits || typeof user.currentPlan.serviceLimits !== 'object') {
      throw new Error(`User ${userId} has invalid serviceLimits structure. This indicates a data corruption issue.`);
    }

    // Convert Mongoose document to plain object to avoid metadata properties
    const serviceLimits = user.currentPlan.serviceLimits.toObject ?
      user.currentPlan.serviceLimits.toObject() :
      user.currentPlan.serviceLimits._doc || user.currentPlan.serviceLimits;
    
    Object.entries(serviceLimits).forEach(([serviceName, limits]) => {
      if (Array.isArray(limits)) {
        (limits as IServiceLimit[]).forEach((limit: IServiceLimit) => {
          // Only reset if: has lastReset, not "none", currentUsage > 0, and time exceeded
          if (limit.lastReset &&
              limit.resetPeriod !== "none" &&
              limit.currentUsage > 0 &&
              this.shouldResetUsage(limit.lastReset, limit.resetPeriod)) {
            console.log(`[autoResetServices] RESETTING ${serviceName}.${limit.limitType} - was ${limit.currentUsage}, now 0`);
            limit.currentUsage = 0;
            limit.lastReset = undefined; // Clear reset date when limit goes back to 0
            resetServices.push(`${serviceName}.${limit.limitType}`);
          }
        });
      }
    });

    if (resetServices.length > 0) {
      console.log(`[autoResetServices] Saving changes for reset services:`, resetServices);
      
      // Use direct MongoDB update instead of Mongoose save for nested arrays
      const updateOperations: any = {};
      
      // Process each reset service to build the update operations
      resetServices.forEach(resetService => {
        const [serviceName, limitType] = resetService.split('.');
        
        // Find the index of the limit in the array
        const serviceLimits = user.currentPlan.serviceLimits[serviceName as keyof typeof user.currentPlan.serviceLimits];
        if (Array.isArray(serviceLimits)) {
          const limitIndex = serviceLimits.findIndex((limit: IServiceLimit) => limit.limitType === limitType);
          if (limitIndex !== -1) {
            updateOperations[`currentPlan.serviceLimits.${serviceName}.${limitIndex}.currentUsage`] = 0;
            updateOperations[`$unset`] = updateOperations[`$unset`] || {};
            updateOperations[`$unset`][`currentPlan.serviceLimits.${serviceName}.${limitIndex}.lastReset`] = "";
          }
        }
      });
      
      try {
        // Use findOneAndUpdate with $set and $unset operations
        const updateResult = await User.findOneAndUpdate(
          { clerkUserId: userId },
          {
            $set: Object.fromEntries(
              Object.entries(updateOperations).filter(([key]) => key !== '$unset')
            ),
            ...(updateOperations.$unset && { $unset: updateOperations.$unset })
          },
          { new: true }
        );
        
        console.log(`[autoResetServices] Direct DB update successful:`, !!updateResult);
        
        // Verify the save worked by checking the updated value
        const maxTotalAnalysisLimit = updateResult?.currentPlan.serviceLimits.alyzitron?.find(
          (limit: IServiceLimit) => limit.limitType === 'maxTotalAnalysis'
        );
        console.log(`[autoResetServices] DB verification - maxTotalAnalysis currentUsage:`, maxTotalAnalysisLimit?.currentUsage);
        
      } catch (saveError) {
        console.error(`[autoResetServices] Save failed:`, saveError);
        throw saveError;
      }
    }

    return resetServices;
  }
}