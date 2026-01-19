#!/usr/bin/env npx ts-node
/**
 * Seed/Update Plans Script
 * 
 * This script creates or updates subscription plans in the database
 * and creates corresponding Razorpay plans for each currency/billing cycle.
 * 
 * Usage:
 *   npx ts-node scripts/seed-plans.ts
 * 
 * For development with local env vars:
 *   NODE_ENV=development npx ts-node scripts/seed-plans.ts
 */

import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import dotenv from 'dotenv';
import Plan from '../schemas/plans';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: 'development.env' });

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

// Currency symbols
const currencySymbols: Record<string, string> = {
  USD: '$',
  INR: '₹',
  EUR: '€',
  GBP: '£',
  CAD: 'C$',
  AUD: 'A$',
  SGD: 'S$',
  AED: 'د.إ',
};

// Plan definitions with monthly credit allocations
interface PlanDefinition {
  type: string;
  name: string;
  description: string;
  credits: number; // Monthly credit allocation
  sortOrder: number;
  pricing: Record<string, { monthly: number; yearly: number }>; // Currency -> prices
}

const planDefinitions: PlanDefinition[] = [
  {
    type: 'free',
    name: 'Free',
    description: 'Get started with basic features',
    credits: 50,
    sortOrder: 0,
    pricing: {
      USD: { monthly: 0, yearly: 0 },
      INR: { monthly: 0, yearly: 0 },
      EUR: { monthly: 0, yearly: 0 },
      GBP: { monthly: 0, yearly: 0 },
      CAD: { monthly: 0, yearly: 0 },
      AUD: { monthly: 0, yearly: 0 },
      SGD: { monthly: 0, yearly: 0 },
      AED: { monthly: 0, yearly: 0 },
    },
  },
  {
    type: 'plus',
    name: 'Plus',
    description: 'Perfect for growing creators',
    credits: 500,
    sortOrder: 1,
    pricing: {
      USD: { monthly: 9.99, yearly: 99.99 },
      INR: { monthly: 799, yearly: 7999 },
      EUR: { monthly: 8.99, yearly: 89.99 },
      GBP: { monthly: 7.99, yearly: 79.99 },
      CAD: { monthly: 12.99, yearly: 129.99 },
      AUD: { monthly: 14.99, yearly: 149.99 },
      SGD: { monthly: 13.99, yearly: 139.99 },
      AED: { monthly: 36.99, yearly: 369.99 },
    },
  },
  {
    type: 'pro',
    name: 'Pro',
    description: 'For professional content creators',
    credits: 2000,
    sortOrder: 2,
    pricing: {
      USD: { monthly: 29.99, yearly: 299.99 },
      INR: { monthly: 2499, yearly: 24999 },
      EUR: { monthly: 26.99, yearly: 269.99 },
      GBP: { monthly: 23.99, yearly: 239.99 },
      CAD: { monthly: 39.99, yearly: 399.99 },
      AUD: { monthly: 44.99, yearly: 449.99 },
      SGD: { monthly: 41.99, yearly: 419.99 },
      AED: { monthly: 109.99, yearly: 1099.99 },
    },
  },
  {
    type: 'premium',
    name: 'Premium',
    description: 'Ultimate creator experience',
    credits: 5000,
    sortOrder: 3,
    pricing: {
      USD: { monthly: 79.99, yearly: 799.99 },
      INR: { monthly: 6499, yearly: 64999 },
      EUR: { monthly: 71.99, yearly: 719.99 },
      GBP: { monthly: 63.99, yearly: 639.99 },
      CAD: { monthly: 104.99, yearly: 1049.99 },
      AUD: { monthly: 119.99, yearly: 1199.99 },
      SGD: { monthly: 109.99, yearly: 1099.99 },
      AED: { monthly: 293.99, yearly: 2939.99 },
    },
  },
];

// Razorpay subscriptions only support INR on this account
// To enable USD, activate international payments in Razorpay dashboard
const razorpaySubscriptionCurrencies = ['INR'];

async function createRazorpayPlan(
  name: string,
  amount: number,
  currency: string,
  period: 'monthly' | 'yearly',
  planType: string
): Promise<string | null> {
  if (amount === 0) {
    console.log(`  ⏭️  Skipping Razorpay plan for free tier (${currency} ${period})`);
    return null;
  }

  if (!razorpaySubscriptionCurrencies.includes(currency)) {
    console.log(`  ⏭️  Razorpay doesn't support subscriptions in ${currency}`);
    return null;
  }

  try {
    const razorpayPlan = await razorpay.plans.create({
      period: period === 'monthly' ? 'monthly' : 'yearly',
      interval: 1,
      item: {
        name: `${name} - ${currency} (${period})`,
        amount: Math.round(amount * 100), // Convert to smallest currency unit
        currency: currency,
        description: `${period.charAt(0).toUpperCase() + period.slice(1)} subscription for ${name}`,
      },
      notes: {
        planType: planType,
        billingCycle: period,
      },
    });
    console.log(`  ✅ Created Razorpay plan: ${razorpayPlan.id} (${currency} ${period})`);
    return razorpayPlan.id;
  } catch (error: any) {
    const description = error?.error?.description || error.message;
    console.error(`  ❌ Failed to create Razorpay plan (${currency} ${period}): ${description}`);
    return null;
  }
}

async function seedPlans() {
  console.log('🚀 Starting plan seed script...\n');

  // Connect to MongoDB
  console.log('📦 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI!);
  console.log('✅ Connected to MongoDB\n');

  for (const planDef of planDefinitions) {
    console.log(`\n📋 Processing: ${planDef.name} (${planDef.type})`);

    // Build pricing object with Razorpay plan IDs
    const pricing: Record<string, any> = {};

    for (const [currency, prices] of Object.entries(planDef.pricing)) {
      const symbol = currencySymbols[currency] || currency;

      // Create Razorpay plans for supported currencies
      const monthlyPlanId = await createRazorpayPlan(
        planDef.name,
        prices.monthly,
        currency,
        'monthly',
        planDef.type
      );
      const yearlyPlanId = await createRazorpayPlan(
        planDef.name,
        prices.yearly,
        currency,
        'yearly',
        planDef.type
      );

      pricing[currency] = {
        monthly: {
          amount: prices.monthly,
          currency: currency,
          symbol: symbol,
          ...(monthlyPlanId && {
            providerPlanIds: { razorpay: monthlyPlanId },
          }),
        },
        yearly: {
          amount: prices.yearly,
          currency: currency,
          symbol: symbol,
          ...(yearlyPlanId && {
            providerPlanIds: { razorpay: yearlyPlanId },
          }),
        },
      };
    }

    // Create empty service limits (deprecated - using credits now)
    const serviceLimits = {
      alyzitron: [],
      editron: [],
      shield: [],
      socialize: [],
      thinkforge: [],
      musitron: [],
      clickatron: [],
    };

    // Upsert the plan
    const result = await Plan.findOneAndUpdate(
      { type: planDef.type },
      {
        name: planDef.name,
        type: planDef.type,
        description: planDef.description,
        serviceLimits: serviceLimits,
        pricing: pricing,
        isActive: true,
        sortOrder: planDef.sortOrder,
      },
      { upsert: true, new: true }
    );

    console.log(`  💾 Saved plan: ${result.name} (${result._id})`);
  }

  console.log('\n\n✅ Plan seeding complete!');
  console.log('\n📝 Note: Razorpay subscription plans only support INR and USD.');
  console.log('   Other currencies will use one-time payments or need manual setup.\n');

  await mongoose.disconnect();
  console.log('👋 Disconnected from MongoDB');
}

// Run the script
seedPlans().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
