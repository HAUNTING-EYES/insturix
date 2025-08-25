import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/middleware/withAdmin';
import { runServiceLimitsMigration, ServiceLimitsMigrationService } from '@/lib/migrations/serviceLimitsMigration';
import { UNIFIED_SERVICE_LIMITS } from '@/lib/config/serviceLimits';
import mongoose from 'mongoose';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import Plan from '@/schemas/plans';
import { User } from '@/schemas/user';

async function handler(req: Request) {
  if (req.method !== 'POST') {
    return NextResponse.json({ message: 'Method not allowed' }, { status: 405 });
  }

  const { dryRun } = (await req.json()) as { dryRun?: boolean };

  try {
    // Run the migration service to get actual results
    const result = await runServiceLimitsMigration({ dryRun: dryRun ?? true });
    
    // Add detailed logs for dry run based on actual migration service results
    if (dryRun ?? true) {
      console.log('=== DETAILED DRY RUN LOGS ===');
      console.log('Migration Type: Service Limits Migration to Unified Configuration');
      console.log('==========================================');
      
      // Connect to database for detailed analysis using the same migration service logic
      await connectToDatabase();
      
      try {
        // Use the same logic as the migration service to get accurate counts
        const allPlans = await Plan.find({});
        const plansToUpdate = allPlans.filter(plan => {
          try {
            return !hasUnifiedLimits(plan.serviceLimits, false);
          } catch {
            return true; // If we can't validate, assume it needs updating
          }
        });
        
        const allUsers = await User.find({ 'currentPlan.serviceLimits': { $exists: true } });
        const usersToMigrate = allUsers.filter(user => {
          try {
            return !hasUnifiedLimits(user.currentPlan.serviceLimits, true);
          } catch {
            return true; // If we can't validate, assume it needs updating
          }
        });
        
        // Log detailed plan information based on actual migration service results
        if (plansToUpdate.length > 0) {
          console.log(`\n📋 PLANS TO UPDATE: ${plansToUpdate.length}/${allPlans.length}`);
          console.log('Plans missing unified configuration:');
          plansToUpdate.forEach(plan => {
            console.log(`- ${plan.name} (${plan.type}): Will be updated with unified service limits structure`);
          });
          
          console.log('\n🔧 Missing services in plans:');
          const allMissingServices = new Set<string>();
          plansToUpdate.forEach(plan => {
            Object.keys(UNIFIED_SERVICE_LIMITS).forEach(serviceName => {
              if (!plan.serviceLimits?.[serviceName]) {
                allMissingServices.add(serviceName);
              }
            });
          });
          
          if (allMissingServices.size > 0) {
            console.log('Services that will be added to plans:');
            allMissingServices.forEach(serviceName => {
              console.log(`- ${serviceName}: Will be added with proper limit structure`);
            });
          }
        } else {
          console.log('\n✅ All plans already have unified configuration');
        }
        
        // Log detailed user information based on actual migration service results
        if (usersToMigrate.length > 0) {
          console.log(`\n👥 USERS TO MIGRATE: ${usersToMigrate.length}/${allUsers.length}`);
          console.log('Users missing unified configuration:');
          usersToMigrate.slice(0, 10).forEach(user => {
            console.log(`- User ${user.clerkUserId} (Plan: ${user.currentPlan.name}): Will be migrated to unified limits`);
          });
          if (usersToMigrate.length > 10) {
            console.log(`  ... and ${usersToMigrate.length - 10} more users`);
          }
          
          console.log('\n🔄 User migration details:');
          console.log('- User service limits will be updated to unified configuration structure');
          console.log('- Current usage data will be preserved during migration');
          console.log('- Users will retain their existing usage statistics');
        } else {
          console.log('\n✅ All users already have unified configuration');
        }
        
        // Log detailed structure changes
        console.log('\n📊 STRUCTURE CHANGES:');
        console.log('Old structure: Service limits stored in various formats');
        console.log('New structure: Unified configuration with consistent format:');
        console.log('- limitType: string (identifies the specific limit)');
        console.log('- maxUsage: number (maximum allowed usage for the plan)');
        console.log('- currentUsage: number (current usage for users, 0 for plans)');
        console.log('- resetPeriod: "weekly" | "monthly" | "daily" | "none"');
        console.log('- lastReset: Date (when the usage was last reset, for users)');
        console.log('- description: string (human-readable description of the limit)');
        
        console.log('\n📝 SUMMARY (matches migration service results):');
        console.log(`- Plans to update: ${plansToUpdate.length} (migration service: ${result.migratedPlans})`);
        console.log(`- Users to migrate: ${usersToMigrate.length} (migration service: ${result.migratedUsers})`);
        console.log('- Dry run completed. No changes were made.');
        console.log('==========================================');
        console.log('End of detailed dry run logs');
        console.log('==========================================');
      } finally {
        await mongoose.disconnect();
      }
    }
    
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('Service limits migration failed:', error);
    return NextResponse.json({ message: 'Migration failed', error: error.message }, { status: 500 });
  }
}

// Helper function to check if service limits use unified structure (matches migration service logic)
function hasUnifiedLimits(serviceLimits: any, isUserLimits: boolean = true): boolean {
  if (!serviceLimits || typeof serviceLimits !== 'object') {
    console.log(`[DryRun] Invalid service limits: ${typeof serviceLimits}`);
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
    console.log(`[DryRun] Unexpected services found: ${unexpectedServices.join(', ')}`);
    return false;
  }
  
  // Check if all expected services are present
  for (const serviceName of expectedServices) {
    if (!serviceLimits[serviceName] || !Array.isArray(serviceLimits[serviceName])) {
      console.log(`[DryRun] Missing or invalid service: ${serviceName}`);
      return false;
    }
    
    // Get expected limit types for this service
    const expectedLimitTypes = Object.keys(UNIFIED_SERVICE_LIMITS[serviceName]);
    const serviceArray = serviceLimits[serviceName];
    
    if (serviceArray.length === 0) {
      console.log(`[DryRun] Empty service array for: ${serviceName}`);
      return false;
    }
    
    // Check if the service has the correct number of limit types
    if (serviceArray.length !== expectedLimitTypes.length) {
      console.log(`[DryRun] Service ${serviceName} has ${serviceArray.length} limits, expected ${expectedLimitTypes.length}`);
      return false;
    }
    
    // Check each limit in the service
    for (const limit of serviceArray) {
      if (!limit ||
          typeof limit.limitType !== 'string' ||
          typeof limit.maxUsage !== 'number') {
        console.log(`[DryRun] Invalid limit structure in service: ${serviceName}`, limit);
        return false;
      }
      
      // Check if this limit type is expected for this service
      if (!expectedLimitTypes.includes(limit.limitType)) {
        console.log(`[DryRun] Unexpected limit type '${limit.limitType}' in service: ${serviceName}`);
        return false;
      }
      
      // For user limits, also check currentUsage
      if (isUserLimits && typeof limit.currentUsage !== 'number') {
        console.log(`[DryRun] Missing currentUsage in user service: ${serviceName}, limit: ${limit.limitType}`);
        return false;
      }
    }
    
    // Check if all expected limit types are present
    const actualLimitTypes = serviceArray.map((limit: any) => limit.limitType);
    const missingLimitTypes = expectedLimitTypes.filter(limitType => !actualLimitTypes.includes(limitType));
    if (missingLimitTypes.length > 0) {
      console.log(`[DryRun] Missing limit types in service ${serviceName}: ${missingLimitTypes.join(', ')}`);
      return false;
    }
  }

  return true;
}

export const POST = withAdmin(handler);