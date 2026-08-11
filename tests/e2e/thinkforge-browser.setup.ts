import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

interface ClerkTestClient {
  users: {
    getUserList(input: { emailAddress: string[]; limit: number }): Promise<{ data: Array<{ id: string; username: string | null }> }>;
    createUser(input: {
      emailAddress: string[];
      username: string;
      password: string;
      firstName: string;
      lastName: string;
      externalId: string;
    }): Promise<{ id: string; username: string | null }>;
    deleteUser(userId: string): Promise<void>;
  };
}

const requireFromProject = createRequire(import.meta.url);
const requireFromClerk = createRequire(requireFromProject.resolve('@clerk/nextjs/server'));

function getClerkTestClient(): ClerkTestClient {
  const { createClerkClient } = requireFromClerk('@clerk/backend') as {
    createClerkClient: (input: { secretKey: string }) => ClerkTestClient;
  };
  return createClerkClient({ secretKey: requireEnv('CLERK_SECRET_KEY') });
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required ThinkForge E2E environment variable: ${name}`);
  return value;
}

function testUsername(runId: string): string {
  return `tf_e2e_${runId.replace(/[^a-z0-9]/gi, '').slice(-30).toLowerCase()}`;
}

async function ensureClerkUser(input: { email: string; runId: string }): Promise<{ id: string; username: string; created: boolean }> {
  const client = getClerkTestClient();
  const existing = await client.users.getUserList({ emailAddress: [input.email], limit: 1 });
  const user = existing.data[0];
  if (user) {
    return {
      id: user.id,
      username: user.username || testUsername(input.runId),
      created: false,
    };
  }

  const created = await client.users.createUser({
    emailAddress: [input.email],
    username: testUsername(input.runId),
    password: `TfE2E-${randomBytes(18).toString('hex')}!`,
    firstName: 'ThinkForge',
    lastName: 'QA',
    externalId: `thinkforge-e2e-${input.runId}`,
  });
  return {
    id: created.id,
    username: created.username || testUsername(input.runId),
    created: true,
  };
}

async function seedPlanAndUser(input: { userId: string; username: string; email: string }): Promise<void> {
  const { default: connectToDatabase } = await import('@/schemas/ConnectToDatabase');
  const { default: Plan } = await import('@/schemas/plans');
  const { User } = await import('@/schemas/user');
  const { UserType } = await import('@/types/userTypes');
  const { CreditsService } = await import('@/lib/services/creditsService');
  const { getPlanLimits, SERVICE_PRICING_CONFIGS, UNIFIED_SERVICE_LIMITS } = await import('@/lib/config/serviceLimits');

  await connectToDatabase();
  const planServiceLimits = Object.fromEntries(
    Object.keys(UNIFIED_SERVICE_LIMITS).map((service) => [service, getPlanLimits(service, 'free', false)]),
  );
  const userServiceLimits = Object.fromEntries(
    Object.keys(UNIFIED_SERVICE_LIMITS).map((service) => [service, getPlanLimits(service, 'free', true)]),
  );
  const pricing = Object.fromEntries(
    Object.entries(SERVICE_PRICING_CONFIGS.agency_starter).map(([currency, details]) => [currency, {
      monthly: { amount: 0, currency, symbol: details.monthly.symbol },
      yearly: { amount: 0, currency, symbol: details.yearly.symbol },
    }]),
  );

  const plan = await Plan.findOneAndUpdate(
    { type: 'free' },
    {
      $set: {
        name: 'ThinkForge E2E Free Plan',
        description: 'Disposable browser-gate plan.',
        serviceLimits: planServiceLimits,
        pricing,
        isActive: true,
        sortOrder: 1,
      },
      $setOnInsert: { type: 'free' },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  if (!plan) throw new Error('Unable to seed the ThinkForge E2E free plan.');

  const now = new Date();
  await User.findOneAndUpdate(
    { clerkUserId: input.userId },
    {
      $setOnInsert: {
        clerkUserId: input.userId,
        email: input.email.toLowerCase(),
        username: input.username,
        signUpDate: now,
        currentPlan: {
          planId: plan._id.toString(),
          name: UserType.Free,
          startDate: now,
          endDate: null,
          price: 0,
          currency: 'USD',
          status: 'active',
          serviceLimits: userServiceLimits,
        },
        planHistory: [],
        subscriptions: [],
        uiMessages: [],
        trialUsed: false,
        preferences: {
          currency: 'USD',
          notifications: { planExpiry: true, paymentReminders: true },
        },
        organizations: [],
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const creditGrant = await CreditsService.grantSubscriptionCredits(
    input.userId,
    'free',
    'monthly',
    { idempotencyKey: `thinkforge-e2e:${input.userId}:free` },
  );
  if (!creditGrant.success) {
    throw new Error(`Unable to grant disposable ThinkForge credits: ${creditGrant.error || 'unknown error'}`);
  }
}

async function seedAcceptedBrandProfile(input: { userId: string; brandId: string }): Promise<void> {
  const { deriveBrandSignalProfile } = await import('@/lib/shared/brand-signal-profile');
  const { createBrandSignalProfileDraft } = await import('@/lib/shared/brand-signal-lifecycle');
  const { createBrandVaultMongoRefineryStoreFromEnvironment } = await import('@/lib/shared/brand-vault-mongo-store');

  const store = createBrandVaultMongoRefineryStoreFromEnvironment();
  if (!store) throw new Error('ThinkForge E2E requires Mongo-backed Brand Vault persistence.');

  const profile = deriveBrandSignalProfile({
    brandId: input.brandId,
    userId: input.userId,
    name: 'ThinkForge QA Operations',
    voice: {
      voiceLock: 'Direct, calm, evidence-led operations voice.',
      nicheMap: 'B2B content operations leaders',
      killList: ['cheap', 'guaranteed'],
      hookArchetypes: ['Start with a concrete workflow cost'],
      structuralHabits: ['Use one specific operational proof point'],
    },
    visual: {
      industry: 'B2B workflow software',
      colors: ['#0F172A', '#14B8A6', '#F8FAFC'],
      visualStyle: 'restrained editorial operations photography',
      typography: 'Inter, sans-serif',
    },
    learning: { banditProjectCount: 0 },
  });
  const draft = createBrandSignalProfileDraft(profile, { actorId: input.userId });
  const saved = await store.saveRecord(draft, { actorId: input.userId });
  const accepted = await store.acceptDraft(saved.id, { actorId: input.userId });
  if (!accepted.ok) throw new Error(`Unable to accept ThinkForge E2E Brand Vault profile: ${accepted.code}`);
}

export default async function setupThinkForgeBrowserGate(): Promise<() => Promise<void>> {
  const runId = requireEnv('THINKFORGE_E2E_RUN_ID');
  const databaseUri = requireEnv('THINKFORGE_E2E_DATABASE_URI');
  const brandVaultDatabaseName = requireEnv('THINKFORGE_E2E_BRAND_VAULT_DATABASE_NAME');
  const email = requireEnv('THINKFORGE_E2E_USER_EMAIL');
  const brandId = requireEnv('THINKFORGE_E2E_BRAND_ID');

  process.env.MONGODB_URI = databaseUri;
  process.env.MONGODB_DB_NAME = `thinkforge_e2e_${runId}`;
  process.env.BRAND_VAULT_MONGODB_URI = databaseUri;
  process.env.BRAND_VAULT_MONGODB_DB_NAME = brandVaultDatabaseName;
  process.env.BRAND_VAULT_PERSISTENCE = 'mongo';

  const user = await ensureClerkUser({ email, runId });
  await seedPlanAndUser({ userId: user.id, username: user.username, email });
  await seedAcceptedBrandProfile({ userId: user.id, brandId });

  return async () => {
    if (user.created) {
      const client = getClerkTestClient();
      await client.users.deleteUser(user.id);
    }
  };
}
