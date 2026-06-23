import { buildBrandContextBlock } from '@/lib/shared/brand-context-block';
import type { UnifiedBrand } from '@/lib/shared/brand-registry';
import { brandSignalProfileToUnifiedBrand } from '@/lib/shared/brand-signal-profile-adapter';
import type { BrandSignalProfile } from '@/lib/shared/brand-signal-profile';
import { getDefaultBrandVaultRefineryStore } from '@/lib/shared/brand-vault-refinery-api';

export type AlyzitronBrandContextSource = 'brand_vault' | 'legacy' | 'none';

export interface AlyzitronBrandContextResolution {
  brandId?: string;
  brand: UnifiedBrand | null;
  profile: BrandSignalProfile | null;
  source: AlyzitronBrandContextSource;
  brandContextBlock: string;
}

export interface ResolveAlyzitronBrandContextDeps {
  getLegacyBrand?: (userId: string, brandId: string) => Promise<UnifiedBrand | null>;
  getAcceptedProfile?: (filter: { userId: string; brandId: string }) => Promise<BrandSignalProfile | null>;
  formatBrand?: (brand: UnifiedBrand | null) => string;
  onVaultFallback?: (message: string, error?: unknown) => void;
}

export class AlyzitronBrandContextError extends Error {
  readonly code = 'BRAND_CONTEXT_NOT_FOUND';

  constructor(readonly brandId: string) {
    super(`Alyzitron could not resolve brand context for brandId ${brandId}.`);
  }
}

type MetadataRecord = Record<string, unknown>;

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function asRecord(value: unknown): MetadataRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as MetadataRecord)
    : null;
}

async function defaultAcceptedProfileGetter(filter: { userId: string; brandId: string }) {
  return getDefaultBrandVaultRefineryStore().getLatestAcceptedProfile(filter);
}

async function defaultLegacyBrandGetter(userId: string, brandId: string): Promise<UnifiedBrand | null> {
  const { getUnifiedBrand } = await import('@/lib/shared/brand-registry');
  return getUnifiedBrand(userId, brandId);
}

function warnVaultFallback(message: string, error?: unknown): void {
  console.warn(`[AlyzitronBrandContext] ${message}`, error);
}

export async function resolveAlyzitronBrandContext(
  args: {
    userId: string;
    brandId?: string | null;
  },
  deps: ResolveAlyzitronBrandContextDeps = {},
): Promise<AlyzitronBrandContextResolution> {
  const brandId = cleanString(args.brandId);
  if (!brandId) {
    return { brand: null, profile: null, source: 'none', brandContextBlock: '' };
  }

  const getLegacyBrand = deps.getLegacyBrand ?? defaultLegacyBrandGetter;
  const getAcceptedProfile = deps.getAcceptedProfile ?? defaultAcceptedProfileGetter;
  const formatBrand = deps.formatBrand ?? buildBrandContextBlock;

  let legacy: UnifiedBrand | null = null;
  try {
    legacy = await getLegacyBrand(args.userId, brandId);
  } catch (error) {
    (deps.onVaultFallback ?? warnVaultFallback)('legacy brand read failed; trying accepted Brand Vault profile.', error);
  }

  let profile: BrandSignalProfile | null = null;
  try {
    profile = await getAcceptedProfile({ userId: args.userId, brandId });
  } catch (error) {
    (deps.onVaultFallback ?? warnVaultFallback)('accepted Brand Vault profile read failed; using legacy brand context.', error);
  }

  const brand = profile
    ? brandSignalProfileToUnifiedBrand(profile, legacy)
    : legacy;

  if (!brand) {
    throw new AlyzitronBrandContextError(brandId);
  }

  return {
    brandId,
    brand,
    profile,
    source: profile ? 'brand_vault' : 'legacy',
    brandContextBlock: formatBrand(brand).trim(),
  };
}

export async function resolveAlyzitronTaskBrandId(args: {
  userId: string;
  orgId?: string | null;
  editronProjectId?: unknown;
  bodyBrandId?: unknown;
  context?: unknown;
  metadata?: unknown;
}): Promise<string | undefined> {
  const direct = cleanString(args.bodyBrandId)
    ?? cleanString(asRecord(args.context)?.brandId)
    ?? cleanString(asRecord(args.metadata)?.brandId);
  if (direct) return direct;

  const editronProjectId = cleanString(args.editronProjectId);
  if (!editronProjectId) return undefined;

  try {
    const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    const project = await db.collection(COLLECTIONS.PROJECTS).findOne(
      { projectId: editronProjectId },
      { projection: { brandId: 1, userId: 1, orgId: 1 } },
    ) as { brandId?: unknown; userId?: unknown; orgId?: unknown } | null;

    if (!project) return undefined;
    const canReadProject = project.userId === args.userId
      || (Boolean(args.orgId) && project.orgId === args.orgId);
    return canReadProject ? cleanString(project.brandId) : undefined;
  } catch (error) {
    warnVaultFallback(`could not derive brandId from Editron project ${editronProjectId}.`, error);
    return undefined;
  }
}

export function buildAlyzitronAnalysisContext(
  baseContext: unknown,
  brandResolution: AlyzitronBrandContextResolution | null,
): MetadataRecord {
  const context = { ...(asRecord(baseContext) ?? {}) };
  if (!brandResolution?.brandContextBlock || !brandResolution.brandId) return context;

  const existingAdditionalDetails = cleanString(context.additionalDetails);
  const brandDetails = [
    'BRAND-AWARE ANALYSIS CONTEXT:',
    brandResolution.brandContextBlock,
    'Use this brand context as alignment criteria when judging visual style, tone, pacing, proof style, audience fit, and recommendations. Do not invent brand facts beyond this block.',
  ].join('\n');

  return {
    ...context,
    brandId: brandResolution.brandId,
    brandContextSource: brandResolution.source,
    brandContextBlock: brandResolution.brandContextBlock,
    brandName: brandResolution.brand?.name,
    additionalDetails: [existingAdditionalDetails, brandDetails].filter(Boolean).join('\n\n'),
  };
}
