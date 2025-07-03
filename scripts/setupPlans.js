import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectToDatabaseModule from '../schemas/ConnectToDatabase.ts';
import PlanModule from '../schemas/plans.ts';
import { createPlan } from '../lib/services/paymentService.ts';

dotenv.config();

const connectToDatabase = connectToDatabaseModule.default || connectToDatabaseModule;
const Plan = PlanModule.default || PlanModule;

const PLANS_DATA = [
  {
    name: "Free Plan",
    type: "free",
    description: "Basic features for getting started",
    serviceLimits: {
      alyzitron: [
        {
          limitType: "maxTotalAnalysis",
          description: "Total video analyses per week",
          maxUsage: 10,
          resetPeriod: "weekly"
        },
        {
          limitType: "maxOver20MinuteAnalysis",
          description: "Analyses for videos over 20 minutes",
          maxUsage: 3,
          resetPeriod: "weekly"
        }
      ],
      clickatron: [
        {
          limitType: "maxThumbnailGeneration",
          description: "Thumbnail generations per week",
          maxUsage: 5,
          resetPeriod: "weekly"
        }
      ],
      editron: [
        {
          limitType: "maxVideoEdits",
          description: "Edit videos with Editron",
          maxUsage: 1,
          resetPeriod: "monthly"
        }
      ],
      shield: [
        {
          limitType: "maxScans",
          description: "Security scans with Shield",
          maxUsage: 3,
          resetPeriod: "monthly"
        }
      ],
      socialize: [
        {
          limitType: "maxSocialLinks",
          description: "Social media links",
          maxUsage: 5,
          resetPeriod: "none"
        }
      ],
      thinkforge: [
        {
          limitType: "maxAIChats",
          description: "AI conversations with ThinkForge",
          maxUsage: 10,
          resetPeriod: "monthly"
        }
      ],
      musitron: [
        {
          limitType: "maxMusicGeneration",
          description: "Generate music tracks",
          maxUsage: 3,
          resetPeriod: "monthly"
        }
      ]
    },
    pricing: {
      USD: { monthly: { amount: 0, currency: "USD", symbol: "$" }, yearly: { amount: 0, currency: "USD", symbol: "$" } },
      INR: { monthly: { amount: 0, currency: "INR", symbol: "₹" }, yearly: { amount: 0, currency: "INR", symbol: "₹" } },
      EUR: { monthly: { amount: 0, currency: "EUR", symbol: "€" }, yearly: { amount: 0, currency: "EUR", symbol: "€" } },
      GBP: { monthly: { amount: 0, currency: "GBP", symbol: "£" }, yearly: { amount: 0, currency: "GBP", symbol: "£" } },
      CAD: { monthly: { amount: 0, currency: "CAD", symbol: "C$" }, yearly: { amount: 0, currency: "CAD", symbol: "C$" } },
      AUD: { monthly: { amount: 0, currency: "AUD", symbol: "A$" }, yearly: { amount: 0, currency: "AUD", symbol: "A$" } },
      SGD: { monthly: { amount: 0, currency: "SGD", symbol: "S$" }, yearly: { amount: 0, currency: "SGD", symbol: "S$" } },
      AED: { monthly: { amount: 0, currency: "AED", symbol: "د.إ" }, yearly: { amount: 0, currency: "AED", symbol: "د.إ" } }
    },
    isActive: true,
    sortOrder: 1
  },
  {
    name: "Plus Plan",
    type: "plus",
    description: "Enhanced features for growing creators",
    serviceLimits: {
      alyzitron: [
        {
          limitType: "maxTotalAnalysis",
          description: "Total video analyses per week",
          maxUsage: 40,
          resetPeriod: "weekly"
        },
        {
          limitType: "maxOver20MinuteAnalysis",
          description: "Analyses for videos over 20 minutes",
          maxUsage: 15,
          resetPeriod: "weekly"
        }
      ],
      clickatron: [
        {
          limitType: "maxThumbnailGeneration",
          description: "Thumbnail generations per week",
          maxUsage: 25,
          resetPeriod: "weekly"
        }
      ],
      editron: [
        {
          limitType: "maxVideoEdits",
          description: "Edit videos with Editron",
          maxUsage: 5,
          resetPeriod: "monthly"
        }
      ],
      shield: [
        {
          limitType: "maxScans",
          description: "Security scans with Shield",
          maxUsage: 15,
          resetPeriod: "monthly"
        }
      ],
      socialize: [
        {
          limitType: "maxSocialLinks",
          description: "Social media links",
          maxUsage: 15,
          resetPeriod: "none"
        }
      ],
      thinkforge: [
        {
          limitType: "maxAIChats",
          description: "AI conversations with ThinkForge",
          maxUsage: 50,
          resetPeriod: "monthly"
        }
      ],
      musitron: [
        {
          limitType: "maxMusicGeneration",
          description: "Generate music tracks",
          maxUsage: 15,
          resetPeriod: "monthly"
        }
      ]
    },
    pricing: {
      USD: { monthly: { amount: 9.99, currency: "USD", symbol: "$" }, yearly: { amount: 99.99, currency: "USD", symbol: "$" } },
      INR: { monthly: { amount: 799, currency: "INR", symbol: "₹" }, yearly: { amount: 7999, currency: "INR", symbol: "₹" } },
      EUR: { monthly: { amount: 8.99, currency: "EUR", symbol: "€" }, yearly: { amount: 89.99, currency: "EUR", symbol: "€" } },
      GBP: { monthly: { amount: 7.99, currency: "GBP", symbol: "£" }, yearly: { amount: 79.99, currency: "GBP", symbol: "£" } },
      CAD: { monthly: { amount: 12.99, currency: "CAD", symbol: "C$" }, yearly: { amount: 129.99, currency: "CAD", symbol: "C$" } },
      AUD: { monthly: { amount: 14.99, currency: "AUD", symbol: "A$" }, yearly: { amount: 149.99, currency: "AUD", symbol: "A$" } },
      SGD: { monthly: { amount: 13.99, currency: "SGD", symbol: "S$" }, yearly: { amount: 139.99, currency: "SGD", symbol: "S$" } },
      AED: { monthly: { amount: 36.99, currency: "AED", symbol: "د.إ" }, yearly: { amount: 369.99, currency: "AED", symbol: "د.إ" } }
    },
    isActive: true,
    sortOrder: 2
  },
  {
    name: "Pro Plan",
    type: "pro",
    description: "Professional tools for serious creators",
    serviceLimits: {
      alyzitron: [
        {
          limitType: "maxTotalAnalysis",
          description: "Total video analyses per week",
          maxUsage: 120,
          resetPeriod: "weekly"
        },
        {
          limitType: "maxOver20MinuteAnalysis",
          description: "Analyses for videos over 20 minutes",
          maxUsage: 40,
          resetPeriod: "weekly"
        }
      ],
      clickatron: [
        {
          limitType: "maxThumbnailGeneration",
          description: "Thumbnail generations per week",
          maxUsage: 100,
          resetPeriod: "weekly"
        }
      ],
      editron: [
        {
          limitType: "maxVideoEdits",
          description: "Edit videos with Editron",
          maxUsage: 25,
          resetPeriod: "monthly"
        }
      ],
      shield: [
        {
          limitType: "maxScans",
          description: "Security scans with Shield",
          maxUsage: 50,
          resetPeriod: "monthly"
        }
      ],
      socialize: [
        {
          limitType: "maxSocialLinks",
          description: "Social media links",
          maxUsage: 50,
          resetPeriod: "none"
        }
      ],
      thinkforge: [
        {
          limitType: "maxAIChats",
          description: "AI conversations with ThinkForge",
          maxUsage: 200,
          resetPeriod: "monthly"
        }
      ],
      musitron: [
        {
          limitType: "maxMusicGeneration",
          description: "Generate music tracks",
          maxUsage: 50,
          resetPeriod: "monthly"
        }
      ]
    },
    pricing: {
      USD: { monthly: { amount: 19.99, currency: "USD", symbol: "$" }, yearly: { amount: 199.99, currency: "USD", symbol: "$" } },
      INR: { monthly: { amount: 1599, currency: "INR", symbol: "₹" }, yearly: { amount: 15999, currency: "INR", symbol: "₹" } },
      EUR: { monthly: { amount: 17.99, currency: "EUR", symbol: "€" }, yearly: { amount: 179.99, currency: "EUR", symbol: "€" } },
      GBP: { monthly: { amount: 15.99, currency: "GBP", symbol: "£" }, yearly: { amount: 159.99, currency: "GBP", symbol: "£" } },
      CAD: { monthly: { amount: 25.99, currency: "CAD", symbol: "C$" }, yearly: { amount: 259.99, currency: "CAD", symbol: "C$" } },
      AUD: { monthly: { amount: 29.99, currency: "AUD", symbol: "A$" }, yearly: { amount: 299.99, currency: "AUD", symbol: "A$" } },
      SGD: { monthly: { amount: 26.99, currency: "SGD", symbol: "S$" }, yearly: { amount: 269.99, currency: "SGD", symbol: "S$" } },
      AED: { monthly: { amount: 73.99, currency: "AED", symbol: "د.إ" }, yearly: { amount: 739.99, currency: "AED", symbol: "د.إ" } }
    },
    isActive: true,
    sortOrder: 3
  },
  {
    name: "Premium Plan",
    type: "premium",
    description: "All-access for power users and teams",
    serviceLimits: {
      alyzitron: [
        {
          limitType: "maxTotalAnalysis",
          description: "Total video analyses per week",
          maxUsage: -1, // Unlimited
          resetPeriod: "weekly"
        },
        {
          limitType: "maxOver20MinuteAnalysis",
          description: "Analyses for videos over 20 minutes",
          maxUsage: -1, // Unlimited
          resetPeriod: "weekly"
        }
      ],
      clickatron: [
        {
          limitType: "maxThumbnailGeneration",
          description: "Thumbnail generations per week",
          maxUsage: -1, // Unlimited
          resetPeriod: "weekly"
        }
      ],
      editron: [
        {
          limitType: "maxVideoEdits",
          description: "Edit videos with Editron",
          maxUsage: -1, // Unlimited
          resetPeriod: "monthly"
        }
      ],
      shield: [
        {
          limitType: "maxScans",
          description: "Security scans with Shield",
          maxUsage: -1, // Unlimited
          resetPeriod: "monthly"
        }
      ],
      socialize: [
        {
          limitType: "maxSocialLinks",
          description: "Social media links",
          maxUsage: -1, // Unlimited
          resetPeriod: "none"
        }
      ],
      thinkforge: [
        {
          limitType: "maxAIChats",
          description: "AI conversations with ThinkForge",
          maxUsage: -1, // Unlimited
          resetPeriod: "monthly"
        }
      ],
      musitron: [
        {
          limitType: "maxMusicGeneration",
          description: "Generate music tracks",
          maxUsage: -1, // Unlimited
          resetPeriod: "monthly"
        }
      ]
    },
    pricing: {
      USD: { monthly: { amount: 29.99, currency: "USD", symbol: "$" }, yearly: { amount: 299.99, currency: "USD", symbol: "$" } },
      INR: { monthly: { amount: 2499, currency: "INR", symbol: "₹" }, yearly: { amount: 24999, currency: "INR", symbol: "₹" } },
      EUR: { monthly: { amount: 27.99, currency: "EUR", symbol: "€" }, yearly: { amount: 279.99, currency: "EUR", symbol: "€" } },
      GBP: { monthly: { amount: 24.99, currency: "GBP", symbol: "£" }, yearly: { amount: 249.99, currency: "GBP", symbol: "£" } },
      CAD: { monthly: { amount: 39.99, currency: "CAD", symbol: "C$" }, yearly: { amount: 399.99, currency: "CAD", symbol: "C$" } },
      AUD: { monthly: { amount: 44.99, currency: "AUD", symbol: "A$" }, yearly: { amount: 449.99, currency: "AUD", symbol: "A$" } },
      SGD: { monthly: { amount: 40.99, currency: "SGD", symbol: "S$" }, yearly: { amount: 409.99, currency: "SGD", symbol: "S$" } },
      AED: { monthly: { amount: 109.99, currency: "AED", symbol: "د.إ" }, yearly: { amount: 1099.99, currency: "AED", symbol: "د.إ" } }
    },
    isActive: true,
    sortOrder: 4
  }
];

async function setupPlans() {
  const args = process.argv.slice(2);
  const modeArg = args.find(arg => arg.startsWith('--mode='));
  const planArg = args.find(arg => arg.startsWith('--plan='));

  const mode = modeArg ? modeArg.split('=')[1] : null;
  const targetPlanType = planArg ? planArg.split('=')[1] : null;

  if (!mode || (mode !== 'real' && mode !== 'fake')) {
    console.log("Usage: node scripts/setupPlans.js --mode=<real|fake> [--plan=<plan_type>]");
    console.log("  --mode: Specifies whether to use 'real' payment provider plan IDs or 'fake' ones for testing.");
    console.log("          'real': Creates plans with the payment provider and saves the real IDs.");
    console.log("          'fake': Uses placeholder IDs without contacting a payment provider.");
    console.log("  --plan: (Optional) Specifies a single plan type to update (e.g., 'pro', 'plus').");
    return;
  }

  try {
    await connectToDatabase();
    console.log(`Database connected. Starting to set up plans in '${mode}' mode.`);

    const plansToProcess = targetPlanType
      ? PLANS_DATA.filter(p => p.type === targetPlanType)
      : PLANS_DATA;

    if (targetPlanType && plansToProcess.length === 0) {
      console.error(`Error: Plan type '${targetPlanType}' not found in PLANS_DATA.`);
      await mongoose.disconnect();
      return;
    }

    for (const planData of plansToProcess) {
      console.log(`Processing plan: ${planData.name}`);

      const plan = (await Plan.findOne({ type: planData.type })) || new Plan(planData);

      plan.serviceLimits = planData.serviceLimits;

      if (plan.type !== 'free') {
        if (mode === 'fake') {
          console.log('  Generating fake plan IDs...');
          for (const currency of Object.keys(plan.pricing)) {
            const monthlyPrice = plan.pricing[currency].monthly;
            if (monthlyPrice.amount > 0) {
              if (!monthlyPrice.planId) monthlyPrice.planId = {};
              monthlyPrice.planId.fakeProvider = `fake_${plan.type}_monthly_${currency.toLowerCase()}`;
            }
            const yearlyPrice = plan.pricing[currency].yearly;
            if (yearlyPrice.amount > 0) {
              if (!yearlyPrice.planId) yearlyPrice.planId = {};
              yearlyPrice.planId.fakeProvider = `fake_${plan.type}_yearly_${currency.toLowerCase()}`;
            }
          }
        } else { // mode === 'real'
          for (const currency of Object.keys(plan.pricing)) {
            console.log(`  Processing currency: ${currency}`);
            
            const monthlyPrice = plan.pricing[currency].monthly;
            if (monthlyPrice.amount > 0) {
              console.log(`    Creating monthly plan...`);
              const monthlyPlan = await createPlan({
                name: plan.name,
                amount: monthlyPrice.amount,
                currency: currency,
                period: 'monthly',
                type: plan.type,
              });

              if (monthlyPlan) {
                if (!monthlyPrice.planId) monthlyPrice.planId = {};
                monthlyPrice.planId[monthlyPlan.provider] = monthlyPlan.id;
                console.log(`      -> ${monthlyPlan.provider} plan created with ID: ${monthlyPlan.id}`);
              }
            }

            const yearlyPrice = plan.pricing[currency].yearly;
            if (yearlyPrice.amount > 0) {
              console.log(`    Creating yearly plan...`);
              const yearlyPlan = await createPlan({
                name: plan.name,
                amount: yearlyPrice.amount,
                currency: currency,
                period: 'yearly',
                type: plan.type,
              });

              if (yearlyPlan) {
                if (!yearlyPrice.planId) yearlyPrice.planId = {};
                yearlyPrice.planId[yearlyPlan.provider] = yearlyPlan.id;
                console.log(`      -> ${yearlyPlan.provider} plan created with ID: ${yearlyPlan.id}`);
              }
            }
          }
        }
      }

      plan.markModified('pricing');
      await plan.save();
      console.log(`Successfully upserted plan: ${plan.name}`);
    }

    console.log("All plans have been set up successfully.");
  } catch (error) {
    console.error("Error setting up plans:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Database connection closed.");
  }
}

setupPlans();