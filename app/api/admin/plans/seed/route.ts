import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/middleware/withAdmin';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import Plan from '@/schemas/plans';
import { getPlanLimits, SERVICE_PRICING_CONFIGS, UNIFIED_SERVICE_LIMITS } from '@/lib/config/serviceLimits';
import { createPlan } from '@/lib/services/paymentService';

// Define the structure for a plan template, based on the schema
interface PlanTemplate {
  name: string;
  type: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
}

// This is the hardcoded plan data, similar to the old script's PLANS_DATA.
// We keep it here to ensure the database is seeded with the correct initial data.
// This is the plan configuration template.
// The actual plans will be created for all currencies defined in SERVICE_PRICING_CONFIGS.
const PLANS_CONFIG: PlanTemplate[] = [
  {
    name: "Free Plan",
    type: "free",
    description: "Basic features for getting started",
    isActive: true,
    sortOrder: 1,
  },
  {
    name: "Plus Plan",
    type: "plus",
    description: "Enhanced features for growing creators",
    isActive: true,
    sortOrder: 2,
  },
  {
    name: "Pro Plan",
    type: "pro",
    description: "Professional tools for serious creators",
    isActive: true,
    sortOrder: 3,
  },
  {
    name: "Premium Plan",
    type: "premium",
    description: "All-access for power users and teams",
    isActive: true,
    sortOrder: 4,
  },
];

async function handler() {
  await connectToDatabase();
  let createdCount = 0;
  let updatedCount = 0;
  const skippedCount = 0;

  for (const planConfig of PLANS_CONFIG) {
    // Get service limits from the unified configuration for all services
    const allServiceLimits: any = {};

    // Dynamically get all services from UNIFIED_SERVICE_LIMITS
    Object.keys(UNIFIED_SERVICE_LIMITS).forEach(serviceName => {
      const serviceLimits = getPlanLimits(serviceName, planConfig.type as "free" | "plus" | "pro" | "premium", false);
      allServiceLimits[serviceName] = serviceLimits;
    });

    // Create a single plan document with pricing for all currencies
    const pricing = {} as any;

    // Initialize pricing for all currencies
    if (planConfig.type !== 'free') {
      const planPricing = SERVICE_PRICING_CONFIGS[planConfig.type as keyof typeof SERVICE_PRICING_CONFIGS];
      if (planPricing) {
        for (const currency of Object.keys(planPricing)) {
          const currencyPricing = planPricing[currency];
          pricing[currency] = {
            monthly: {
              amount: currencyPricing.monthly.amount,
              currency: currency,
              symbol: currencyPricing.monthly.symbol,
              providerPlanIds: currencyPricing.monthly.providerPlanIds,
            },
            yearly: {
              amount: currencyPricing.yearly.amount,
              currency: currency,
              symbol: currencyPricing.yearly.symbol,
              providerPlanIds: currencyPricing.yearly.providerPlanIds,
            },
          };
        }
      }
    } else {
      // Free plan has zero pricing for all currencies
      const samplePlan = SERVICE_PRICING_CONFIGS.plus; // Use plus plan as template for currencies
      for (const currency of Object.keys(samplePlan)) {
        const currencyInfo = samplePlan[currency];
        pricing[currency] = {
          monthly: {
            amount: 0,
            currency: currency,
            symbol: currencyInfo.monthly.symbol,
          },
          yearly: {
            amount: 0,
            currency: currency,
            symbol: currencyInfo.yearly.symbol,
          },
        };
      }
    }

    // For non-free plans, create plans in Razorpay for each currency
    if (planConfig.type !== 'free') {
      const planPricing = SERVICE_PRICING_CONFIGS[planConfig.type as keyof typeof SERVICE_PRICING_CONFIGS];
      if (planPricing) {
        for (const currency of Object.keys(planPricing)) {
          const currencyPricing = planPricing[currency];
          if (!currencyPricing.monthly.amount && !currencyPricing.yearly.amount) {
            continue;
          }

          try {
            if (currencyPricing.monthly.amount > 0) {
              console.log(`[PlanSeeder] Creating monthly plan for ${planConfig.type} in ${currency}...`);
              const monthlyPlan = await createPlan({
                name: planConfig.name,
                amount: currencyPricing.monthly.amount,
                currency: currency,
                period: 'monthly',
                type: planConfig.type,
              });

              if (monthlyPlan && monthlyPlan.id) {
                if (!pricing[currency].monthly.providerPlanIds) {
                  pricing[currency].monthly.providerPlanIds = new Map();
                }
                pricing[currency].monthly.providerPlanIds.set('razorpay', monthlyPlan.id);
                console.log(`[PlanSeeder] -> Razorpay monthly plan created with ID: ${monthlyPlan.id}`);
              }
            }

            if (currencyPricing.yearly.amount > 0) {
              console.log(`[PlanSeeder] Creating yearly plan for ${planConfig.type} in ${currency}...`);
              const yearlyPlan = await createPlan({
                name: planConfig.name,
                amount: currencyPricing.yearly.amount,
                currency: currency,
                period: 'yearly',
                type: planConfig.type,
              });

              if (yearlyPlan && yearlyPlan.id) {
                if (!pricing[currency].yearly.providerPlanIds) {
                  pricing[currency].yearly.providerPlanIds = new Map();
                }
                pricing[currency].yearly.providerPlanIds.set('razorpay', yearlyPlan.id);
                console.log(`[PlanSeeder] -> Razorpay yearly plan created with ID: ${yearlyPlan.id}`);
              }
            }
          } catch (error: any) {
            console.error(`[PlanSeeder] Failed to create Razorpay plans for ${planConfig.type} (${currency}):`, error);
          }
        }
      }
    }

    // Check if a plan with this type already exists (active or inactive)
    const existingPlan = await Plan.findOne({ type: planConfig.type });

    if (existingPlan) {
      console.log(`[PlanSeeder] Plan already exists, updating: ${planConfig.type}`);
      // Update the existing plan
      existingPlan.serviceLimits = allServiceLimits;
      existingPlan.pricing = pricing;
      existingPlan.isActive = planConfig.isActive;
      existingPlan.sortOrder = planConfig.sortOrder;
      existingPlan.markModified('pricing');
      await existingPlan.save();
      console.log(`[PlanSeeder] Updated plan: ${planConfig.type}`);
      updatedCount++;
      continue;
    }

    // Create the new plan document
    const newPlan = new Plan({
      name: planConfig.name,
      type: planConfig.type,
      description: planConfig.description,
      serviceLimits: allServiceLimits,
      pricing,
      isActive: planConfig.isActive,
      sortOrder: planConfig.sortOrder,
    });

    newPlan.markModified('pricing');
    await newPlan.save();
    console.log(`[PlanSeeder] Created plan: ${planConfig.type}`);
    createdCount++;
  }

  return NextResponse.json({
    message: 'Plan seeding completed.',
    created: createdCount,
    updated: updatedCount,
    skipped: skippedCount,
  }, { status: 201 }); // 201 Created

}

export const POST = withAdmin(handler);