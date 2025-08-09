import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectToDatabaseModule from '../schemas/ConnectToDatabase.ts';
import PlanModule from '../schemas/plans.ts';

dotenv.config({ path: '.env.local' });

const connectToDatabase = connectToDatabaseModule.default || connectToDatabaseModule;
const Plan = PlanModule.default || PlanModule;

// Correct ThinkForge limits for all plans
const THINKFORGE_LIMITS = {
  free: [
    {
      limitType: "maxSessions",
      description: "ThinkForge sessions per week",
      maxUsage: 5,
      resetPeriod: "weekly"
    }
  ],
  plus: [
    {
      limitType: "maxSessions",
      description: "ThinkForge sessions per week",
      maxUsage: 25,
      resetPeriod: "weekly"
    }
  ],
  pro: [
    {
      limitType: "maxSessions",
      description: "ThinkForge sessions per week",
      maxUsage: 100,
      resetPeriod: "weekly"
    }
  ],
  premium: [
    {
      limitType: "maxSessions",
      description: "ThinkForge sessions per week",
      maxUsage: -1, // Unlimited
      resetPeriod: "weekly"
    }
  ]
};

async function updateThinkForgePlans() {
  try {
    await connectToDatabase();
    console.log("Database connected. Starting to update ThinkForge plans...");

    for (const [planType, thinkforgeLimits] of Object.entries(THINKFORGE_LIMITS)) {
      console.log(`Updating ${planType} plan ThinkForge limits...`);

      const result = await Plan.updateOne(
        { type: planType, isActive: true },
        { 
          $set: { 
            'serviceLimits.thinkforge': thinkforgeLimits 
          } 
        }
      );

      if (result.matchedCount === 0) {
        console.log(`⚠️  No ${planType} plan found to update`);
      } else if (result.modifiedCount === 0) {
        console.log(`ℹ️  ${planType} plan already has correct ThinkForge limits`);
      } else {
        console.log(`✅ Updated ${planType} plan ThinkForge limits`);
      }
    }

    // Verify the updates
    console.log("\nVerifying updates...");
    for (const planType of Object.keys(THINKFORGE_LIMITS)) {
      const plan = await Plan.findOne({ type: planType, isActive: true });
      if (plan) {
        console.log(`${planType} plan ThinkForge limits:`, plan.serviceLimits.thinkforge);
      } else {
        console.log(`❌ ${planType} plan not found`);
      }
    }

    console.log("\n✅ ThinkForge plan limits updated successfully!");

  } catch (error) {
    console.error('Error updating ThinkForge plans:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
  }
}

// Load environment variables
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

console.log('Starting ThinkForge plan limits update...');

// Run the update
updateThinkForgePlans()
  .then(() => {
    console.log('Update completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Update failed:', error);
    process.exit(1);
  });

export { updateThinkForgePlans }; 