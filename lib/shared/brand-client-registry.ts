import { normalizeBrandWebsiteUrl } from './brand-website-refinery-utils';

const BRANDS_COLLECTION = 'brands';
const BRAND_DOMAIN_CLAIMS_COLLECTION = 'brand_domain_claims';

export type BrandClientProvisioningSource =
  | 'brand_vault_scan'
  | 'brand_vault_domain_verification';

export type BrandClientDomainAssociation = {
  host: string;
  status: 'observed' | 'verified';
  firstSeenAt: string;
  verifiedAt?: string;
  verificationMethod?: 'dns_txt';
  recordName?: string;
};

export type BrandClientRegistryRecord = {
  brandId: string;
  userId: string;
  orgId?: string;
  name: string;
  industry: string;
  colors: string[];
  voiceDescription: string;
  visualStyle: string;
  typography: string;
  websiteUrl: string;
  domainAssociations: BrandClientDomainAssociation[];
  provisioningSource: BrandClientProvisioningSource;
  createdAt: Date;
  updatedAt: Date;
};

export type EnsureBrandVaultClientInput = {
  brandId: string;
  userId: string;
  orgId: string | null;
  websiteUrl: string;
  companyName?: unknown;
  source: BrandClientProvisioningSource;
  now?: string;
};

export type BrandClientProvisionResult = {
  client: BrandClientRegistryRecord;
  created: boolean;
};

type BrandClientDomainClaim = {
  _id: string;
  userId: string;
  host: string;
  brandId: string;
  createdAt: Date;
};

type BrandClientDomainClaimReservation = {
  id: string;
  created: boolean;
};

export type BindVerifiedBrandVaultDomainInput = Omit<EnsureBrandVaultClientInput, 'source'> & {
  recordName: string;
  verifiedAt?: string;
};

export class BrandClientRegistryError extends Error {
  constructor(
    readonly code: 'invalid_website_url' | 'domain_bound_elsewhere' | 'client_provision_failed',
    message: string,
  ) {
    super(message);
    this.name = 'BrandClientRegistryError';
  }
}

/**
 * Creates the durable platform-client shape used for first Brand Vault scans.
 * It contains only intake facts; the accepted Vault profile remains the source of brand truth.
 */
export function createBrandVaultClientRecord(input: EnsureBrandVaultClientInput): BrandClientRegistryRecord {
  const { normalizedUrl, host } = resolveWebsite(input.websiteUrl);
  const now = asValidDate(input.now);
  const observedAt = now.toISOString();
  const name = cleanString(input.companyName) || host;

  return {
    brandId: input.brandId,
    userId: input.userId,
    ...(input.orgId ? { orgId: input.orgId } : {}),
    name,
    industry: '',
    colors: [],
    voiceDescription: '',
    visualStyle: '',
    typography: '',
    websiteUrl: normalizedUrl,
    domainAssociations: [{ host, status: 'observed', firstSeenAt: observedAt }],
    provisioningSource: input.source,
    createdAt: now,
    updatedAt: now,
  };
}

/** Creates a client record if it does not already exist for this owner and client id. */
export async function ensureBrandVaultClient(input: EnsureBrandVaultClientInput): Promise<BrandClientProvisionResult> {
  const client = createBrandVaultClientRecord(input);
  const collection = await getBrandClientsCollection();
  const result = await collection.updateOne(
    { brandId: client.brandId, userId: client.userId },
    { $setOnInsert: client },
    { upsert: true },
  );
  await invalidateBrandClientCache(client.userId);
  return { client, created: (result.upsertedCount ?? 0) > 0 };
}

/**
 * Persists DNS ownership against the same platform client record. A verified root domain belongs to
 * one client per user, preventing accidental cross-client association through direct API calls.
 */
export async function bindVerifiedBrandVaultDomain(
  input: BindVerifiedBrandVaultDomainInput,
): Promise<BrandClientDomainAssociation> {
  const client = createBrandVaultClientRecord({
    ...input,
    source: 'brand_vault_domain_verification',
  });
  const host = client.domainAssociations[0]?.host;
  if (!host) {
    throw new BrandClientRegistryError('client_provision_failed', 'Brand client has no website domain to verify.');
  }

  const collection = await getBrandClientsCollection();
  const existingOwner = await collection.findOne(
    {
      userId: input.userId,
      brandId: { $ne: input.brandId },
      domainAssociations: { $elemMatch: { host, status: 'verified' } },
    },
    { projection: { brandId: 1 } },
  );
  if (existingOwner) {
    throw new BrandClientRegistryError(
      'domain_bound_elsewhere',
      'This domain is already verified for another client in this workspace.',
    );
  }

  const verifiedAt = asValidDate(input.verifiedAt).toISOString();
  const claim = await reserveBrandClientDomainClaim({
    userId: input.userId,
    brandId: input.brandId,
    host,
    verifiedAt,
  });
  try {
    const provisioned = await ensureBrandVaultClient({
      ...input,
      source: 'brand_vault_domain_verification',
    });
    const verifiedDomain: BrandClientDomainAssociation = {
      host,
      status: 'verified',
      firstSeenAt: provisioned.client.domainAssociations[0].firstSeenAt,
      verifiedAt,
      verificationMethod: 'dns_txt',
      recordName: input.recordName,
    };
    const result = await collection.updateOne(
      { brandId: input.brandId, userId: input.userId },
      [
        {
          $set: {
            domainAssociations: {
              $concatArrays: [
                {
                  $filter: {
                    input: { $ifNull: ['$domainAssociations', []] },
                    as: 'domain',
                    cond: { $ne: ['$$domain.host', host] },
                  },
                },
                [verifiedDomain],
              ],
            },
            updatedAt: new Date(verifiedAt),
          },
        },
      ],
    );
    if ((result.matchedCount ?? 0) !== 1) {
      throw new BrandClientRegistryError('client_provision_failed', 'Could not persist the verified domain for this client.');
    }

    await invalidateBrandClientCache(input.userId);
    return verifiedDomain;
  } catch (error) {
    if (claim.created) await releaseBrandClientDomainClaim(claim.id, input.brandId);
    throw error;
  }
}

async function getBrandClientsCollection() {
  const { getDatabase } = await import('@/lib/editron/db/mongodb');
  const db = await getDatabase();
  return db.collection<BrandClientRegistryRecord>(BRANDS_COLLECTION);
}

async function reserveBrandClientDomainClaim(input: {
  userId: string;
  brandId: string;
  host: string;
  verifiedAt: string;
}): Promise<BrandClientDomainClaimReservation> {
  const id = JSON.stringify([input.userId, input.host]);
  const collection = await getBrandDomainClaimsCollection();
  try {
    await collection.insertOne({
      _id: id,
      userId: input.userId,
      host: input.host,
      brandId: input.brandId,
      createdAt: new Date(input.verifiedAt),
    });
    return { id, created: true };
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw new BrandClientRegistryError('client_provision_failed', 'Could not reserve this verified domain.');
    }
    const existingClaim = await collection.findOne({ _id: id }, { projection: { brandId: 1 } });
    if (existingClaim?.brandId === input.brandId) return { id, created: false };
    throw new BrandClientRegistryError(
      'domain_bound_elsewhere',
      'This domain is already verified for another client in this workspace.',
    );
  }
}

async function releaseBrandClientDomainClaim(id: string, brandId: string): Promise<void> {
  try {
    const collection = await getBrandDomainClaimsCollection();
    await collection.deleteOne({ _id: id, brandId });
  } catch (error) {
    console.error('[BrandVault] verified domain claim cleanup failed:', error);
  }
}

async function getBrandDomainClaimsCollection() {
  const { getDatabase } = await import('@/lib/editron/db/mongodb');
  const db = await getDatabase();
  return db.collection<BrandClientDomainClaim>(BRAND_DOMAIN_CLAIMS_COLLECTION);
}

async function invalidateBrandClientCache(userId: string): Promise<void> {
  try {
    const { invalidateCache } = await import('./brand-registry');
    invalidateCache(userId);
  } catch (error) {
    console.warn('[BrandVault] client registry cache invalidation failed:', error);
  }
}

function resolveWebsite(websiteUrl: string): { normalizedUrl: string; host: string } {
  try {
    const normalizedUrl = normalizeBrandWebsiteUrl(websiteUrl);
    const host = new URL(normalizedUrl).hostname.toLowerCase().replace(/^www\./, '');
    if (!host) throw new Error('Website host is missing.');
    return { normalizedUrl, host };
  } catch {
    throw new BrandClientRegistryError('invalid_website_url', 'A valid client website is required to create a client.');
  }
}

function asValidDate(value: string | undefined): Date {
  const date = value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}
