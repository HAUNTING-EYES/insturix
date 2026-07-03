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
    name: "Agency Starter Plan",
    type: "agency_starter",
    description: "Core AI workspace for agencies starting at $100/month",
    isActive: true,
    sortOrder: 2,
  },
  {
    name: "Agency Growth Plan",
    type: "agency_growth",
    description: "Expanded AI workspace for growing agencies at $500/month",
    isActive: true,
    sortOrder: 3,
  },
  {
    name: "Agency Scale Plan",
    type: "agency_scale",
    description: "High-volume AI workspace for scaled agencies at $1000/month",
    isActive: true,
    sortOrder: 4,
  },
];

const SERVICE_LIMIT_PLAN_TYPE: Record<string, "free" | "plus" | "pro" | "premium"> = {
  free: "free",
  plus: "plus",
  pro: "pro",
  premium: "premium",
  agency_starter: "plus",
  agency_growth: "pro",
  agency_scale: "premium",
};

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
      const serviceLimits = getPlanLimits(serviceName, SERVICE_LIMIT_PLAN_TYPE[planConfig.type], false);
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
      const samplePlan = SERVICE_PRICING_CONFIGS.agency_starter; // Use starter plan as template for currencies
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

    // Idempotency anchor: look up the existing local plan BEFORE any remote Razorpay
    // plan creation, so re-running the seed reuses stored provider plan IDs instead of
    // minting duplicate Razorpay plans on every deploy/retry.
    const existingPlan = await Plan.findOne({ type: planConfig.type });

    const readExistingProviderId = (currency: string, cycle: 'monthly' | 'yearly'): string | undefined => {
      const ids = (existingPlan as any)?.pricing?.[currency]?.[cycle]?.providerPlanIds;
      if (!ids) return undefined;
      if (ids instanceof Map) return ids.get('razorpay');
      if (typeof ids.get === 'function') return ids.get('razorpay');
      return ids.razorpay;
    };

    const setProviderId = (currency: string, cycle: 'monthly' | 'yearly', id: string) => {
      if (!pricing[currency][cycle].providerPlanIds) {
        pricing[currency][cycle].providerPlanIds = new Map();
      }
      pricing[currency][cycle].providerPlanIds.set('razorpay', id);
    };

    // For non-free plans, ensure a Razorpay plan exists per currency+cycle.
    // Reuse the stored provider ID when present; only create a remote plan the first time.
    if (planConfig.type !== 'free') {
      const planPricing = SERVICE_PRICING_CONFIGS[planConfig.type as keyof typeof SERVICE_PRICING_CONFIGS];
      if (planPricing) {
        for (const currency of Object.keys(planPricing)) {
          const currencyPricing = planPricing[currency];
          if (!currencyPricing.monthly.amount && !currencyPricing.yearly.amount) {
            continue;
          }

          try {
            for (const cycle of ['monthly', 'yearly'] as const) {
              if (currencyPricing[cycle].amount <= 0) continue;

              const existingId = readExistingProviderId(currency, cycle);
              if (existingId) {
                setProviderId(currency, cycle, existingId);
                console.log(`[PlanSeeder] Reusing Razorpay ${cycle} plan for ${planConfig.type} ${currency}: ${existingId}`);
                continue;
              }

              console.log(`[PlanSeeder] Creating ${cycle} plan for ${planConfig.type} in ${currency}...`);
              const created = await createPlan({
                name: planConfig.name,
                amount: currencyPricing[cycle].amount,
                currency: currency,
                period: cycle,
                type: planConfig.type,
              });
              if (created && created.id) {
                setProviderId(currency, cycle, created.id);
                console.log(`[PlanSeeder] -> Razorpay ${cycle} plan created with ID: ${created.id}`);
              }
            }
          } catch (error: any) {
            console.error(`[PlanSeeder] Failed to ensure Razorpay plans for ${planConfig.type} (${currency}):`, error);
          }
        }
      }
    }

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

  // Step 6: retire legacy public plans so /api/plans never exposes plus/pro/premium.
  // Legacy plan docs are kept for historical user records but must not stay publicly active.
  const legacyDeactivation = await Plan.updateMany(
    { type: { $in: ['plus', 'pro', 'premium'] }, isActive: true },
    { $set: { isActive: false } }
  );
  const deactivatedLegacy = legacyDeactivation.modifiedCount ?? 0;
  if (deactivatedLegacy > 0) {
    console.log(`[PlanSeeder] Deactivated ${deactivatedLegacy} legacy plan(s) (plus/pro/premium).`);
  }

  return NextResponse.json({
    message: 'Plan seeding completed.',
    created: createdCount,
    updated: updatedCount,
    skipped: skippedCount,
    deactivatedLegacy,
  }, { status: 201 }); // 201 Created

}

export const POST = withAdmin(handler);