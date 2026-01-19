/**
 * @deprecated This migration service is deprecated. The credits system is now the primary billing method.
 * Use `creditsMigrationService.ts` for migrating users to the credits system.
 * 
 * This file is retained for:
 * - Historical reference
 * - Potential edge-case data migrations
 * 
 * DO NOT use this for new migrations.
 */

import mongoose from 'mongoose';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import { User } from '@/schemas/user';
import Plan from '@/schemas/plans';
import { 
  UNIFIED_SERVICE_LIMITS,
  getPlanLimits,
} from '@/lib/config/serviceLimits';
import { IServiceLimits } from '@/types/userTypes';

export interface MigrationResult {
  migratedUsers: number;
  migratedPlans: number;
  errors: string[];
  plansValid: boolean;
  usersValid: boolean;
}

export class ServiceLimitsMigrationService {
  public migratedUsers = 0;
  public migratedPlans = 0;
  public errors: string[] = [];
  public Plan: any;
  public User: any;

  /**
   * Connect to database
   */
  public async connect() {
    try {
      await connectToDatabase();
      console.log('[MigrationService] Connected to database successfully');
    } catch (error) {
      console.error('[MigrationService] Failed to connect to database:', error);
      throw error;
    }
  }

  /**
   * Disconnect from database
   */
  public async disconnect() {
    try {
      await mongoose.disconnect();
      console.log('[MigrationService] Disconnected from database');
    } catch (error) {
      console.error('[MigrationService] Error disconnecting from database:', error);
    }
  }

  /**
   * Update all existing plans to use unified configuration
   */
  private async updateAllPlans() {
    console.log('[MigrationService] Starting plan updates...');
    
    try {
      // Get all existing plans
      const existingPlans = await Plan.find({});
      console.log(`[MigrationService] Found ${existingPlans.length} existing plans`);

      // Filter plans that actually need updating
      const plansToUpdate = existingPlans.filter(plan => !this.hasUnifiedLimits(plan.serviceLimits, false));
      console.log(`[MigrationService] Plans that need updating: ${plansToUpdate.length}/${existingPlans.length}`);

      for (const plan of plansToUpdate) {
        try {
          // Generate service limits using unified configuration
          const serviceLimits = this.generateServiceLimitsForPlan(plan.name);
          
          // Update the plan
          plan.serviceLimits = serviceLimits;
          plan.markModified('serviceLimits');
          await plan.save();
          
          this.migratedPlans++;
          console.log(`[MigrationService] Updated plan: ${plan.name} (${plan.type})`);
        } catch (error) {
          console.error(`[MigrationService] Failed to update plan ${plan.name}:`, error);
          this.errors.push(`Plan ${plan.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      console.log(`[MigrationService] Plan updates completed. Updated ${this.migratedPlans} plans`);
    } catch (error) {
      console.error('[MigrationService] Error updating plans:', error);
      throw error;
    }
  }

  /**
   * Generate service limits for a plan type using unified configuration
   */
  private generateServiceLimitsForPlan(planName: string): IServiceLimits {
    const serviceLimits: Partial<IServiceLimits> = {};
    
    // Map plan names to plan types
    const planTypeMap: Record<string, "free" | "plus" | "pro" | "premium"> = {
      'free': 'free',
      'plus': 'plus', 
      'pro': 'pro',
      'premium': 'premium',
      'Free Plan': 'free',
      'Plus Plan': 'plus',
      'Pro Plan': 'pro', 
      'Premium Plan': 'premium'
    };
    
    const planType = planTypeMap[planName] || planTypeMap[planName.toLowerCase()] || 'free';
    
    // Get all service names from UNIFIED_SERVICE_LIMITS
    const serviceNames = Object.keys(UNIFIED_SERVICE_LIMITS) as (keyof IServiceLimits)[];
    
    // For each service, get the limits for this plan type
    serviceNames.forEach(serviceName => {
      serviceLimits[serviceName] = getPlanLimits(serviceName, planType, false); // Plans don't need user fields
    });
    
    return serviceLimits as IServiceLimits;
  }

  /**
   * Generate user service limits for a plan type using unified configuration
   */
  private generateUserServiceLimits(planType: string): IServiceLimits {
    const serviceLimits: Partial<IServiceLimits> = {};
    
    // Get all service names from UNIFIED_SERVICE_LIMITS
    const serviceNames = Object.keys(UNIFIED_SERVICE_LIMITS) as (keyof IServiceLimits)[];
    
    // For each service, get the limits for this plan type
    serviceNames.forEach(serviceName => {
      serviceLimits[serviceName] = getPlanLimits(serviceName, planType as "free" | "plus" | "pro" | "premium", true); // Users need currentUsage
    });
    
    return serviceLimits as IServiceLimits;
  }

  /**
   * Migrate existing users to use unified configuration
   */
  private async migrateAllUsers() {
    console.log('[MigrationService] Starting user migrations...');
    
    try {
      // Get all users with service limits
      const allUsers = await User.find({ 
        'currentPlan.serviceLimits': { $exists: true }
      });
      
      // Filter users that actually need migration
      const usersToMigrate = allUsers.filter(user => !this.hasUnifiedLimits(user.currentPlan.serviceLimits, true));
      console.log(`[MigrationService] Users that need migration: ${usersToMigrate.length}/${allUsers.length}`);

      for (const user of usersToMigrate) {
        try {
          await this.migrateUser(user);
          this.migratedUsers++;
          
          if (this.migratedUsers % 100 === 0) {
            console.log(`[MigrationService] Migrated ${this.migratedUsers} users...`);
          }
        } catch (error) {
          console.error(`[MigrationService] Failed to migrate user ${user.clerkUserId}:`, error);
          this.errors.push(`User ${user.clerkUserId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      console.log(`[MigrationService] User migrations completed. Migrated ${this.migratedUsers} users`);
    } catch (error) {
      console.error('[MigrationService] Error migrating users:', error);
      throw error;
    }
  }

  /**
   * Migrate a single user
   */
  private async migrateUser(user: any) {
    const planType = user.currentPlan.name;
    const serviceLimits = user.currentPlan.serviceLimits;

    // Generate unified limits for this plan type (for users)
    const unifiedLimits = this.generateUserServiceLimits(planType);

    // Merge existing usage data with new unified structure
    const mergedLimits = this.mergeUsageData(serviceLimits, unifiedLimits);

    // Update user's service limits
    user.currentPlan.serviceLimits = mergedLimits;
    user.markModified('currentPlan.serviceLimits');
    await user.save();

    console.log(`[MigrationService] Migrated user ${user.clerkUserId} to unified limits`);
  }

  /**
   * Check if service limits already use unified structure
   */
  public hasUnifiedLimits(serviceLimits: any, isUserLimits: boolean = true): boolean {
    if (!serviceLimits || typeof serviceLimits !== 'object') {
      return false;
    }

    // Get all expected services from UNIFIED_SERVICE_LIMITS
    const expectedServices = Object.keys(UNIFIED_SERVICE_LIMITS);
    const actualServices = Object.keys(serviceLimits).filter(key => 
      // Filter out Mongoose internal properties
      !key.startsWith('$') && !key.startsWith('_') && key !== 'isNew'
    );
    
    // Check if there are any unexpected services
    const unexpectedServices = actualServices.filter(service => !expectedServices.includes(service));
    if (unexpectedServices.length > 0) {
      console.log(`[MigrationService] Unexpected services found: ${unexpectedServices.join(', ')}`);
      return false;
    }
    
    // Check if all expected services are present
    for (const serviceName of expectedServices) {
      if (!serviceLimits[serviceName] || !Array.isArray(serviceLimits[serviceName])) {
        console.log(`[MigrationService] Missing or invalid service: ${serviceName}`);
        return false;
      }
      
      // Get expected limit types for this service
      const expectedLimitTypes = Object.keys(UNIFIED_SERVICE_LIMITS[serviceName]);
      const serviceArray = serviceLimits[serviceName];
      
      if (serviceArray.length === 0) {
        console.log(`[MigrationService] Empty service array for: ${serviceName}`);
        return false;
      }
      
      // Check if the service has the correct number of limit types
      if (serviceArray.length !== expectedLimitTypes.length) {
        console.log(`[MigrationService] Service ${serviceName} has ${serviceArray.length} limits, expected ${expectedLimitTypes.length}`);
        return false;
      }
      
      // Check each limit in the service
      for (const limit of serviceArray) {
        if (!limit || 
            typeof limit.limitType !== 'string' ||
            typeof limit.maxUsage !== 'number') {
          console.log(`[MigrationService] Invalid limit structure in service: ${serviceName}`, limit);
          return false;
        }
        
        // Check if this limit type is expected for this service
        if (!expectedLimitTypes.includes(limit.limitType)) {
          console.log(`[MigrationService] Unexpected limit type '${limit.limitType}' in service: ${serviceName}`);
          return false;
        }
        
        // For user limits, also check currentUsage
        if (isUserLimits && typeof limit.currentUsage !== 'number') {
          console.log(`[MigrationService] Missing currentUsage in user service: ${serviceName}, limit: ${limit.limitType}`);
          return false;
        }
      }
      
      // Check if all expected limit types are present
      const actualLimitTypes = serviceArray.map((limit: any) => limit.limitType);
      const missingLimitTypes = expectedLimitTypes.filter(limitType => !actualLimitTypes.includes(limitType));
      if (missingLimitTypes.length > 0) {
        console.log(`[MigrationService] Missing limit types in service ${serviceName}: ${missingLimitTypes.join(', ')}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Merge existing usage data with new unified structure
   */
  private mergeUsageData(oldLimits: any, newLimits: IServiceLimits): IServiceLimits {
    const mergedLimits: Partial<IServiceLimits> = {};

    Object.keys(newLimits).forEach(serviceName => {
      const newServiceLimits = newLimits[serviceName as keyof IServiceLimits];
      const oldServiceLimits = oldLimits[serviceName] || [];

      mergedLimits[serviceName as keyof IServiceLimits] = newServiceLimits.map(newLimit => {
        // Find corresponding old limit to preserve usage data
        const oldLimit = oldServiceLimits.find(
          (old: any) => old.limitType === newLimit.limitType
        );

        return {
          ...newLimit,
          currentUsage: oldLimit ? oldLimit.currentUsage : 0,
          lastReset: oldLimit ? oldLimit.lastReset : new Date()
        };
      });
    });

    return mergedLimits as IServiceLimits;
  }

  /**
   * Validate that all plans have been updated correctly
   */
  private async validatePlans(): Promise<boolean> {
    console.log('[MigrationService] Validating plans...');
    
    try {
      const plans = await Plan.find({});
      let validationErrors = 0;

      for (const plan of plans) {
        const hasValidLimits = this.hasUnifiedLimits(plan.serviceLimits, false); // Plans don't need currentUsage
        
        if (!hasValidLimits) {
          console.error(`[MigrationService] Plan ${plan.name} has invalid limits structure`);
          console.error(`[MigrationService] Plan ${plan.name} serviceLimits:`, JSON.stringify(plan.serviceLimits, null, 2));
          validationErrors++;
        } else {
          console.log(`[MigrationService] Plan ${plan.name} has valid limits structure`);
        }
      }

      if (validationErrors === 0) {
        console.log('[MigrationService] All plans validated successfully');
      } else {
        console.error(`[MigrationService] ${validationErrors} plans failed validation`);
      }

      return validationErrors === 0;
    } catch (error) {
      console.error('[MigrationService] Error validating plans:', error);
      return false;
    }
  }

  /**
   * Validate that all users have been migrated correctly
   */
  private async validateUsers(sampleSize = 100): Promise<boolean> {
    console.log(`[MigrationService] Validating ${sampleSize} users...`);
    
    try {
      // Get a sample of users for validation
      const users = await User.find({}).limit(sampleSize);
      let validationErrors = 0;

      for (const user of users) {
        const hasValidLimits = this.hasUnifiedLimits(user.currentPlan.serviceLimits, true); // Users need currentUsage
        
        if (!hasValidLimits) {
          console.error(`[MigrationService] User ${user.clerkUserId} has invalid limits structure`);
          console.error(`[MigrationService] User ${user.clerkUserId} serviceLimits:`, JSON.stringify(user.currentPlan.serviceLimits, null, 2));
          validationErrors++;
        }
      }

      const successRate = ((users.length - validationErrors) / users.length) * 100;
      console.log(`[MigrationService] User validation: ${successRate.toFixed(1)}% success rate`);

      return validationErrors === 0;
    } catch (error) {
      console.error('[MigrationService] Error validating users:', error);
      return false;
    }
  }

  /**
   * Run the complete migration
   */
  public async runMigration(): Promise<MigrationResult> {
    console.log('==========================================');
    console.log('Service Limits Migration to Unified Config');
    console.log('==========================================');
    
    try {
      // Connect to database
      await this.connect();

      // Update all plans
      await this.updateAllPlans();

      // Migrate all users
      await this.migrateAllUsers();

      // Validate results
      const plansValid = await this.validatePlans();
      const usersValid = await this.validateUsers();

      // Summary
      console.log('==========================================');
      console.log('Migration Summary');
      console.log('==========================================');
      console.log(`Plans updated: ${this.migratedPlans}`);
      console.log(`Users migrated: ${this.migratedUsers}`);
      console.log(`Errors: ${this.errors.length}`);
      console.log(`Plans valid: ${plansValid ? 'Yes' : 'No'}`);
      console.log(`Users valid: ${usersValid ? 'Yes' : 'No'}`);

      if (this.errors.length > 0) {
        console.log('\nErrors encountered:');
        this.errors.forEach((error, index) => {
          console.log(`${index + 1}. ${error}`);
        });
      }

      if (plansValid && usersValid) {
        console.log('\n✅ Migration completed successfully!');
      } else {
        console.log('\n⚠️  Migration completed with validation issues. Please review the errors above.');
      }

      return {
        migratedUsers: this.migratedUsers,
        migratedPlans: this.migratedPlans,
        errors: this.errors,
        plansValid,
        usersValid,
      };
    } catch (error) {
      console.error('[MigrationService] Migration failed:', error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Run a dry run to see what would be migrated
   */
  public async dryRun(): Promise<MigrationResult> {
    console.log('==========================================');
    console.log('Service Limits Migration - Dry Run');
    console.log('==========================================');
    
    const result: MigrationResult = {
      migratedUsers: 0,
      migratedPlans: 0,
      errors: [],
      plansValid: false,
      usersValid: false,
    };

    try {
      await this.connect();

      // Count plans that would be updated
      const plans = await Plan.find({});
      const plansToUpdate = plans.filter(plan => !this.hasUnifiedLimits(plan.serviceLimits, false));
      console.log(`Plans to update: ${plansToUpdate.length}/${plans.length}`);
      result.migratedPlans = plansToUpdate.length;

      // Count users that would be migrated
      const users = await User.find({ 'currentPlan.serviceLimits': { $exists: true } });
      const usersToMigrate = users.filter(user => !this.hasUnifiedLimits(user.currentPlan.serviceLimits, true));
      console.log(`Users to migrate: ${usersToMigrate.length}/${users.length}`);
      result.migratedUsers = usersToMigrate.length;

      console.log('\nDry run completed. No changes were made.');

      result.plansValid = true;
      result.usersValid = true;
    } catch (error) {
      console.error('[MigrationService] Dry run failed:', error);
      result.errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      await this.disconnect();
    }

    return result;
  }
}

/**
 * Main function to run the migration, callable from the API endpoint
 */
export const runServiceLimitsMigration = async ({ dryRun = false }: { dryRun?: boolean }): Promise<MigrationResult> => {
  const migrationService = new ServiceLimitsMigrationService();
  return dryRun ? migrationService.dryRun() : migrationService.runMigration();
};

// Make the models available to the service
ServiceLimitsMigrationService.prototype.Plan = Plan;
ServiceLimitsMigrationService.prototype.User = User;