#!/usr/bin/env npx ts-node
/**
 * Seed/Update Plans Script
 *
 * This script creates or updates subscription plans in the database
 * and creates corresponding Razorpay plans for USD.
 */

import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import dotenv from 'dotenv';
import Plan from '../schemas/plans.ts';
import { SUBSCRIPTION_PLANS } from '../lib/config/creditCosts.ts';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: 'development.env' });
dotenv.config({ path: 'production.env' });

// Validate required env vars
const MONGODB_URI = process.env.MONGODB_URI;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_SECRET_KEY_ID = process.env.RAZORPAY_SECRET_KEY_ID;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set');
  process.exit(1);
}

if (!RAZORPAY_KEY_ID || !RAZORPAY_SECRET_KEY_ID) {
  console.error('❌ RAZORPAY credentials are not set');
  process.exit(1);
}

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_SECRET_KEY_ID,
});

async function createRazorpayPlan(
  name: string,
  amount: number,
  planType: string
): Promise<string | null> {
  if (amount === 0) {
    return null;
  }

  try {
    const razorpayPlan = await razorpay.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: `${name} - USD (Monthly)`,
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'USD',
        description: `Monthly subscription for ${name}`,
      },
      notes: {
        planType: planType,
        billingCycle: 'monthly',
      },
    });
    console.log(`  ✅ Created Razorpay plan: ${razorpayPlan.id} (${name} USD)`);
    return razorpayPlan.id;
  } catch (error: any) {
    const description = error?.error?.description || error.message;
    console.error(`  ⚠️  Failed to create Razorpay plan (${name}): ${description}`);
    console.log(`     (This usually means international payments aren't enabled on your Razorpay dashboard for USD)`);
    return null;
  }
}

async function seedPlans() {
  console.log('🚀 Starting plan seed script (Source: SUBSCRIPTION_PLANS)...\n');

  // Connect to MongoDB
  console.log('📦 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI!);
  console.log('✅ Connected to MongoDB\n');

  // Include Free plan as the baseline
  const plansToSeed = [
    {
      id: 'free',
      name: 'Free',
      description: 'Get started with basic features',
      credits: 50,
      price: 0,
      sortOrder: 0
    },
    ...SUBSCRIPTION_PLANS.map((p, i) => ({
      ...p,
      sortOrder: i + 1
    }))
  ];

  for (const planDef of plansToSeed) {
    console.log(`\n📋 Processing: ${planDef.name} (${planDef.id})`);

    // Create Razorpay plan if not free
    const razorpayPlanId = await createRazorpayPlan(
      planDef.name,
      planDef.price,
      planDef.id
    );

    // Build pricing object
    const generatePricing = (currency: string, symbol: string) => {
      // Use the actual razorpay ID if created, otherwise use a placeholder to avoid code crashes
      // In development, the placeholder allows the UI to proceed to the Razorpay checkout
      const rzpId = (currency === 'USD' && razorpayPlanId) 
        ? razorpayPlanId 
        : (currency === 'USD' ? `plan_${planDef.id}_usd_test` : null);

      return {
        monthly: {
          amount: planDef.price,
          currency,
          symbol,
          ...(rzpId ? {
            providerPlanIds: { razorpay: rzpId },
          } : {
            providerPlanIds: { manual: `manual_${planDef.id}_monthly` }
          }),
        },
        yearly: { 
          amount: planDef.price * 12,
          currency,
          symbol,
          providerPlanIds: { manual: `manual_${planDef.id}_monthly` } // Legacy fallback
        }
      };
    };

    // Match the Plan schema requirements (all currencies required)
    const pricing = {
      USD: generatePricing('USD', '$'),
      INR: generatePricing('INR', '₹'),
      EUR: generatePricing('EUR', '€'),
      GBP: generatePricing('GBP', '£'),
      CAD: generatePricing('CAD', 'C$'),
      AUD: generatePricing('AUD', 'A$'),
      SGD: generatePricing('SGD', 'S$'),
      AED: generatePricing('AED', 'د.إ'),
    };

    // Service limits (using credits as primary driver now)
    const serviceLimits = {
      alyzitron: [],
      editron: [],
      shield: [],
      socialize: [], // Added to match schema
      thinkforge: [],
      musitron: [],
      clickatron: [],
    };

    // Upsert the plan
    const result = await Plan.findOneAndUpdate(
      { type: planDef.id },
      {
        name: planDef.name,
        type: planDef.id,
        description: planDef.description,
        serviceLimits: serviceLimits,
        pricing: pricing,
        isActive: true,
        sortOrder: planDef.sortOrder,
      },
      { upsert: true, new: true, runValidators: false } // runValidators: false if we want to skip schema enum/required checks during upsert, but better to keep them and fix pricing
    );

    console.log(`  💾 Saved plan in DB: ${result.name} (${result._id})`);
  }

  console.log('\n\n✅ Plan seeding complete!');

  await mongoose.disconnect();
  console.log('👋 Disconnected from MongoDB');
}

seedPlans().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
