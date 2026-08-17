import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { MongoClient } from 'mongodb';
import {
  resolveThinkForgeBrowserTenantFixture,
  type ThinkForgeBrowserBrandFixture,
  type ThinkForgeBrowserUserFixture,
} from './thinkforge-browser-fixtures';

interface ClerkProvisionedUser {
  id: string;
  username: string;
  created: boolean;
}

interface ClerkTestClient {
  users: {
    getUserList(input: { emailAddress: string[]; limit: number }): Promise<{
      data: Array<{ id: string; username: string | null; externalId: string | null }>;
    }>;
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
  organizations: {
    getOrganizationList(input: { query: string; limit: number }): Promise<{
      data: Array<{
        id: string;
        slug: string;
        privateMetadata: Record<string, unknown>;
      }>;
    }>;
    createOrganization(input: {
      name: string;
      slug: string;
      createdBy: string;
      privateMetadata: Record<string, unknown>;
    }): Promise<{ id: string }>;
    deleteOrganization(organizationId: string): Promise<unknown>;
    getOrganizationMembershipList(input: {
      organizationId: string;
      userId: string[];
      limit: number;
    }): Promise<{ data: Array<{ role: string }> }>;
    createOrganizationMembership(input: {
      organizationId: string;
      userId: string;
      role: 'org:admin' | 'org:member';
    }): Promise<unknown>;
    updateOrganizationMembership(input: {
      organizationId: string;
      userId: string;
      role: 'org:admin' | 'org:member';
    }): Promise<unknown>;
  };
}

async function ensureClerkOrganization(
  client: ClerkTestClient,
  input: {
    name: string;
    slug: string;
    createdBy: string;
    runId: string;
  },
): Promise<{ id: string }> {
  const listed = await client.organizations.getOrganizationList({
    query: input.slug,
    limit: 100,
  });
  const existing = listed.data.find((organization) => organization.slug === input.slug);
  if (existing) {
    if (existing.privateMetadata?.thinkforgeE2ERunId !== input.runId
      || existing.privateMetadata?.disposable !== true) {
      throw new Error(
        `ThinkForge E2E refused to reuse organization slug ${input.slug}: ownership metadata does not match run ${input.runId}.`,
      );
    }
    return { id: existing.id };
  }

  return client.organizations.createOrganization({
    name: input.name,
    slug: input.slug,
    createdBy: input.createdBy,
    privateMetadata: { thinkforgeE2ERunId: input.runId, disposable: true },
  });
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

function resolveE2EDatabaseNames(runId: string): { application: string; brandVault: string } {
  if (!/^[a-z0-9]{1,12}$/i.test(runId)) {
    throw new Error('ThinkForge E2E requires a 1-12 character alphanumeric run ID.');
  }
  return {
    application: `thinkforge_e2e_${runId}`,
    brandVault: `thinkforge_e2e_brandvault_${runId}`,
  };
}

async function disposeE2EDatabases(input: { databaseUri: string; names: { application: string; brandVault: string } }): Promise<void> {
  const client = new MongoClient(input.databaseUri);
  try {
    await client.connect();
    await Promise.all(Object.values(input.names).map((databaseName) => clearE2EDatabase(client, databaseName)));
  } finally {
    await client.close();
  }
}

async function clearE2EDatabase(client: MongoClient, databaseName: string): Promise<void> {
  const database = client.db(databaseName);
  try {
    await database.dropDatabase();
    return;
  } catch (error) {
    // Atlas application credentials normally have readWrite but not dbAdmin.
    // In that least-privilege configuration, erase every test record while
    // preserving the strict run-scoped database boundary above.
    if (!isMongoDropPermissionError(error)) throw error;
  }

  const collections = await database.listCollections({}, { nameOnly: true }).toArray();
  for (const { name } of collections) {
    if (name.startsWith('system.')) continue;
    try {
      await database.dropCollection(name);
    } catch (error) {
      if (isMongoNamespaceMissingError(error)) continue;
      throw new Error(
        `ThinkForge E2E could not release disposable collection ${databaseName}.${name}.`,
        { cause: error },
      );
    }
  }
}

function isMongoDropPermissionError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 8000;
}

function isMongoNamespaceMissingError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && (('code' in error && error.code === 26)
      || ('codeName' in error && error.codeName === 'NamespaceNotFound'));
}

async function ensureClerkUser(
  client: ClerkTestClient,
  input: ThinkForgeBrowserUserFixture,
): Promise<ClerkProvisionedUser> {
  const existing = await client.users.getUserList({ emailAddress: [input.email], limit: 1 });
  const user = existing.data[0];
  if (user) {
    if (user.externalId !== input.externalId) {
      throw new Error(
        `ThinkForge E2E refused to reuse ${input.email}: the Clerk user is not owned by fixture ${input.externalId}.`,
      );
    }
    return {
      id: user.id,
      username: user.username || input.username,
      created: false,
    };
  }

  const created = await client.users.createUser({
    emailAddress: [input.email],
    username: input.username,
    password: `TfE2E-${randomBytes(18).toString('hex')}!`,
    firstName: input.firstName,
    lastName: input.lastName,
    externalId: input.externalId,
  });
  return {
    id: created.id,
    username: created.username || input.username,
    created: true,
  };
}

async function ensureClerkOrganizationMembership(input: {
  client: ClerkTestClient;
  organizationId: string;
  userId: string;
  role: 'org:admin' | 'org:member';
}): Promise<void> {
  const memberships = await input.client.organizations.getOrganizationMembershipList({
    organizationId: input.organizationId,
    userId: [input.userId],
    limit: 1,
  });
  const existing = memberships.data[0];
  if (!existing) {
    await input.client.organizations.createOrganizationMembership({
      organizationId: input.organizationId,
      userId: input.userId,
      role: input.role,
    });
    return;
  }
  if (existing.role !== input.role) {
    await input.client.organizations.updateOrganizationMembership({
      organizationId: input.organizationId,
      userId: input.userId,
      role: input.role,
    });
  }
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

async function seedApplicationOrganization(input: {
  organizationId: string;
  name: string;
  slug: string;
  admin: ClerkProvisionedUser & { email: string };
  restrictedMember: ClerkProvisionedUser & { email: string };
}): Promise<void> {
  const { default: connectToDatabase } = await import('@/schemas/ConnectToDatabase');
  const { Organization } = await import('@/schemas/Organization');
  const { OrgMember } = await import('@/schemas/OrgMember');
  const { User } = await import('@/schemas/user');
  await connectToDatabase();

  const now = new Date();
  await Organization.findOneAndUpdate(
    { clerkOrgId: input.organizationId },
    {
      $set: {
        name: input.name,
        slug: input.slug,
        createdBy: input.admin.id,
        memberCount: 2,
        settings: { allowMemberProjects: true, defaultRole: 'member' },
      },
      $setOnInsert: { clerkOrgId: input.organizationId },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await Promise.all([
    OrgMember.findOneAndUpdate(
      { clerkOrgId: input.organizationId, clerkUserId: input.admin.id },
      {
        $set: { role: 'owner', email: input.admin.email, username: input.admin.username },
        $setOnInsert: { joinedAt: now },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ),
    OrgMember.findOneAndUpdate(
      { clerkOrgId: input.organizationId, clerkUserId: input.restrictedMember.id },
      {
        $set: { role: 'member', email: input.restrictedMember.email, username: input.restrictedMember.username },
        $setOnInsert: { joinedAt: now, invitedBy: input.admin.id },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ),
    User.updateOne(
      { clerkUserId: input.admin.id },
      { $set: { organizations: [{ clerkOrgId: input.organizationId, role: 'owner', joinedAt: now }] } },
    ),
    User.updateOne(
      { clerkUserId: input.restrictedMember.id },
      { $set: { organizations: [{ clerkOrgId: input.organizationId, role: 'member', joinedAt: now }] } },
    ),
  ]);
}

async function seedAcceptedBrandProfile(input: {
  userId: string;
  orgId?: string;
  brand: ThinkForgeBrowserBrandFixture;
  allowedUserIds?: string[];
}): Promise<void> {
  const { deriveBrandSignalProfile } = await import('@/lib/shared/brand-signal-profile');
  const { createBrandSignalProfileDraft } = await import('@/lib/shared/brand-signal-lifecycle');
  const { createBrandVaultMongoRefineryStoreFromEnvironment } = await import('@/lib/shared/brand-vault-mongo-store');

  const store = createBrandVaultMongoRefineryStoreFromEnvironment();
  if (!store) throw new Error('ThinkForge E2E requires Mongo-backed Brand Vault persistence.');

  const profile = deriveBrandSignalProfile({
    brandId: input.brand.brandId,
    userId: input.userId,
    ...(input.orgId ? { orgId: input.orgId } : {}),
    name: input.brand.name,
    voice: input.brand.voice,
    visual: input.brand.visual,
    learning: { banditProjectCount: 0 },
  });
  const draft = createBrandSignalProfileDraft(profile, { actorId: input.userId });
  const saved = await store.saveRecord(draft, { actorId: input.userId });
  const accepted = await store.acceptDraft(saved.id, { actorId: input.userId });
  if (!accepted.ok) throw new Error(`Unable to accept ThinkForge E2E Brand Vault profile: ${accepted.code}`);

  if (input.orgId) {
    if (!store.setBrandAccess || !store.getBrandAccessGrants) {
      throw new Error('ThinkForge E2E requires persistent organization brand grants.');
    }
    const allowedUserIds = input.allowedUserIds ?? [];
    if (allowedUserIds.length === 0) {
      throw new Error('ThinkForge E2E organization brand must be restricted to an explicit user fixture.');
    }
    await store.setBrandAccess({
      orgId: input.orgId,
      brandId: input.brand.brandId,
      userIds: allowedUserIds,
    });
    const grants = await store.getBrandAccessGrants(input.orgId);
    const persistedGrant = grants.get(input.brand.brandId);
    if (!persistedGrant || persistedGrant.length !== allowedUserIds.length
      || allowedUserIds.some((userId) => !persistedGrant.includes(userId))) {
      throw new Error('ThinkForge E2E organization brand grant did not persist exactly.');
    }
  }
}

export default async function setupThinkForgeBrowserGate(): Promise<() => Promise<void>> {
  const runId = requireEnv('THINKFORGE_E2E_RUN_ID');
  const databaseUri = requireEnv('THINKFORGE_E2E_DATABASE_URI');
  const brandVaultDatabaseName = requireEnv('THINKFORGE_E2E_BRAND_VAULT_DATABASE_NAME');
  const fixture = resolveThinkForgeBrowserTenantFixture({
    runId,
    adminEmail: requireEnv('THINKFORGE_E2E_USER_EMAIL'),
    personalBrandId: requireEnv('THINKFORGE_E2E_BRAND_ID'),
  });
  const databaseNames = resolveE2EDatabaseNames(runId);
  if (brandVaultDatabaseName !== databaseNames.brandVault) {
    throw new Error('ThinkForge E2E Brand Vault database must be the run-scoped derived name.');
  }

  process.env.MONGODB_URI = databaseUri;
  process.env.MONGODB_DB_NAME = databaseNames.application;
  process.env.BRAND_VAULT_MONGODB_URI = databaseUri;
  process.env.BRAND_VAULT_MONGODB_DB_NAME = brandVaultDatabaseName;
  process.env.BRAND_VAULT_PERSISTENCE = 'mongo';

  const clerk = getClerkTestClient();
  let admin: ClerkProvisionedUser | null = null;
  let restrictedMember: ClerkProvisionedUser | null = null;
  let organizationId: string | null = null;
  const dispose = async () => {
    const cleanupErrors: unknown[] = [];
    if (organizationId) {
      try {
        await clerk.organizations.deleteOrganization(organizationId);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await disposeE2EDatabases({ databaseUri, names: databaseNames });
    } catch (error) {
      cleanupErrors.push(error);
    }
    for (const user of [restrictedMember, admin]) {
      if (!user?.created) continue;
      try {
        await clerk.users.deleteUser(user.id);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'ThinkForge E2E cleanup did not complete.');
    }
  };

  try {
    admin = await ensureClerkUser(clerk, fixture.admin);
    restrictedMember = await ensureClerkUser(clerk, fixture.restrictedMember);
    const organization = await ensureClerkOrganization(clerk, {
      name: fixture.organization.name,
      slug: fixture.organization.slug,
      createdBy: admin.id,
      runId: fixture.runId,
    });
    organizationId = organization.id;
    await ensureClerkOrganizationMembership({
      client: clerk,
      organizationId,
      userId: admin.id,
      role: 'org:admin',
    });
    await ensureClerkOrganizationMembership({
      client: clerk,
      organizationId,
      userId: restrictedMember.id,
      role: 'org:member',
    });

    await seedPlanAndUser({ userId: admin.id, username: admin.username, email: fixture.admin.email });
    await seedPlanAndUser({
      userId: restrictedMember.id,
      username: restrictedMember.username,
      email: fixture.restrictedMember.email,
    });
    await seedApplicationOrganization({
      organizationId,
      name: fixture.organization.name,
      slug: fixture.organization.slug,
      admin: { ...admin, email: fixture.admin.email },
      restrictedMember: { ...restrictedMember, email: fixture.restrictedMember.email },
    });
    await seedAcceptedBrandProfile({ userId: admin.id, brand: fixture.personalBrand });
    await seedAcceptedBrandProfile({
      userId: admin.id,
      orgId: organizationId,
      brand: fixture.organizationBrand,
      allowedUserIds: [admin.id],
    });
  } catch (error) {
    try {
      await dispose();
    } catch (cleanupError) {
      console.error('[ThinkForge E2E] Failed to clean a setup error:', cleanupError);
    }
    throw error;
  }

  return dispose;
}
