import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectToDatabaseModule from '../schemas/ConnectToDatabase.ts';
import PlanModule from '../schemas/plans.ts';

dotenv.config();

// Import schemas
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
        },
        {
          limitType: "maxConcurrentTasks",
          description: "Maximum concurrent analyses",
          maxUsage: 2,
          resetPeriod: "none"
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
      USD: { amount: 0, currency: "USD", symbol: "$" },
      INR: { amount: 0, currency: "INR", symbol: "₹" },
      EUR: { amount: 0, currency: "EUR", symbol: "€" },
      GBP: { amount: 0, currency: "GBP", symbol: "£" },
      CAD: { amount: 0, currency: "CAD", symbol: "C$" },
      AUD: { amount: 0, currency: "AUD", symbol: "A$" },
      SGD: { amount: 0, currency: "SGD", symbol: "S$" },
      AED: { amount: 0, currency: "AED", symbol: "د.إ" }
    },
    billingPeriod: "monthly",
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
        },
        {
          limitType: "maxConcurrentTasks",
          description: "Maximum concurrent analyses",
          maxUsage: 3,
          resetPeriod: "none"
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
      USD: { amount: 9.99, currency: "USD", symbol: "$" },
      INR: { amount: 799, currency: "INR", symbol: "₹" },
      EUR: { amount: 8.99, currency: "EUR", symbol: "€" },
      GBP: { amount: 7.99, currency: "GBP", symbol: "£" },
      CAD: { amount: 12.99, currency: "CAD", symbol: "C$" },
      AUD: { amount: 14.99, currency: "AUD", symbol: "A$" },
      SGD: { amount: 13.99, currency: "SGD", symbol: "S$" },
      AED: { amount: 36.99, currency: "AED", symbol: "د.إ" }
    },
    billingPeriod: "monthly",
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
        },
        {
          limitType: "maxConcurrentTasks",
          description: "Maximum concurrent analyses",
          maxUsage: 5,
          resetPeriod: "none"
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
      USD: { amount: 19.99, currency: "USD", symbol: "$" },
      INR: { amount: 1599, currency: "INR", symbol: "₹" },
      EUR: { amount: 17.99, currency: "EUR", symbol: "€" },
      GBP: { amount: 15.99, currency: "GBP", symbol: "£" },
      CAD: { amount: 25.99, currency: "CAD", symbol: "C$" },
      AUD: { amount: 29.99, currency: "AUD", symbol: "A$" },
      SGD: { amount: 26.99, currency: "SGD", symbol: "S$" },
      AED: { amount: 73.99, currency: "AED", symbol: "د.إ" }
    },
    billingPeriod: "monthly",
    isActive: true,
    sortOrder: 3
  },
  {
    name: "Premium Plan",
    type: "premium",
    description: "Unlimited access for power users",
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
        },
        {
          limitType: "maxConcurrentTasks",
          description: "Maximum concurrent analyses",
          maxUsage: 10, // Even unlimited plans have some concurrent limit
          resetPeriod: "none"
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
      USD: { amount: 49.99, currency: "USD", symbol: "$" },
      INR: { amount: 3999, currency: "INR", symbol: "₹" },
      EUR: { amount: 44.99, currency: "EUR", symbol: "€" },
      GBP: { amount: 39.99, currency: "GBP", symbol: "£" },
      CAD: { amount: 64.99, currency: "CAD", symbol: "C$" },
      AUD: { amount: 74.99, currency: "AUD", symbol: "A$" },
      SGD: { amount: 67.99, currency: "SGD", symbol: "S$" },
      AED: { amount: 183.99, currency: "AED", symbol: "د.إ" }
    },
    billingPeriod: "monthly",
    isActive: true,
    sortOrder: 4
  }
];

async function setupPlans() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await connectToDatabase();
    console.log('✅ Connected to MongoDB');

    console.log('🗑️  Clearing existing plans...');
    await Plan.deleteMany({});
    console.log('✅ Cleared existing plans');

    console.log('📝 Creating new plans...');
    const createdPlans = await Plan.insertMany(PLANS_DATA);
    console.log(`✅ Created ${createdPlans.length} plans`);

    console.log('\n📊 Plans Summary:');
    for (const plan of createdPlans) {
      // Convert Mongoose document to plain object to avoid internal properties
      const planObj = plan.toObject();
      const serviceLimits = planObj.serviceLimits || {};
      
      // Calculate total limits properly
      const serviceNames = Object.keys(serviceLimits);
      const totalLimits = serviceNames.reduce((sum, serviceName) => {
        const limits = serviceLimits[serviceName];
        return sum + (Array.isArray(limits) ? limits.length : 0);
      }, 0);
      
      console.log(`  - ${plan.name} (${plan.type}): ${totalLimits} service limits`);
      console.log(`    ID: ${plan._id}`);
      console.log(`    Services: ${serviceNames.join(', ')}`);
      
      // Show limit breakdown for each service
      serviceNames.forEach(serviceName => {
        const limits = serviceLimits[serviceName];
        if (Array.isArray(limits)) {
          console.log(`      ${serviceName}: ${limits.map(l => l.limitType).join(', ')}`);
        }
      });
    }

    console.log('\n🎉 Plans setup completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Existing users with old structure will get errors (this is expected)');
    console.log('2. New users will be created with proper service limits');
    console.log('3. You can manually delete old users or they will be recreated correctly');

  } catch (error) {
    console.error('❌ Error setting up plans:', error);
  } finally {
    mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the setup
setupPlans();