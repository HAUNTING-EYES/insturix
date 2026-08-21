import { buildBrandContextBlock } from '@/lib/shared/brand-context-block';
import type { UnifiedBrand } from '@/lib/shared/brand-registry';
import { brandSignalProfileToUnifiedBrand } from '@/lib/shared/brand-signal-profile-adapter';
import type { BrandSignalProfile } from '@/lib/shared/brand-signal-profile';
import { getDefaultBrandVaultRefineryStore } from '@/lib/shared/brand-vault-refinery-api';
import type { AlyzitronIntentResolution } from '@/app/api/services/alyzitron/types';

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
  getAcceptedProfile?: (filter: { userId: string; brandId: string; orgId: string | null }) => Promise<BrandSignalProfile | null>;
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

const BRAND_CONTEXT_HEADER = 'BRAND-AWARE ANALYSIS CONTEXT:';
const INTENT_CONTEXT_HEADER = 'ALYZITRON CONTENT INTENT:';

function appendContextBlock(existing: string | undefined, header: string, block: string): string {
  if (existing?.includes(header)) return existing;
  return [existing, block].filter(Boolean).join('\n\n');
}

function intentInstruction(intent: AlyzitronIntentResolution): string {
  switch (intent.contentIntent) {
    case 'own_content':
      return 'Analyze this as the user\'s owned content. Use Brand Vault as the standard for fit, then give concrete fixes the user can apply.';
    case 'competitor_content':
      return 'Analyze this as competitor or benchmark content. Use Brand Vault as the user\'s lens: identify transferable tactics, non-transferable risks, and what the user can adapt without copying.';
    case 'reference_content':
      return 'Analyze this as reference or inspiration content. Extract reusable principles and explain how they could be adapted to the user\'s brand context.';
    default:
      return 'Ownership is uncertain. Separate observed media facts from recommendations and avoid assuming whether the content belongs to the user.';
  }
}

function buildIntentDetails(intent: AlyzitronIntentResolution): string {
  const confidence = Math.round(intent.confidence * 100);
  const rationale = intent.rationale.length ? intent.rationale.join(' ') : 'No rationale was supplied.';
  return [
    INTENT_CONTEXT_HEADER,
    `Intent: ${intent.contentIntent}`,
    `Source: ${intent.source}${intent.userConfirmed ? ' (user confirmed)' : ''}`,
    `Confidence: ${confidence}%`,
    `Rationale: ${rationale}`,
    intentInstruction(intent),
  ].join('\n');
}
async function defaultAcceptedProfileGetter(filter: { userId: string; brandId: string; orgId: string | null }) {
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
    orgId?: string | null;
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
  const orgId = cleanString(args.orgId) ?? null;

  let legacy: UnifiedBrand | null = null;
  try {
    legacy = await getLegacyBrand(args.userId, brandId);
  } catch (error) {
    (deps.onVaultFallback ?? warnVaultFallback)('legacy brand read failed; trying accepted Brand Vault profile.', error);
  }

  let profile: BrandSignalProfile | null = null;
  try {
    profile = await getAcceptedProfile({ userId: args.userId, brandId, orgId });
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
  intentResolution?: AlyzitronIntentResolution | null,
): MetadataRecord {
  const context = { ...(asRecord(baseContext) ?? {}) };
  const result: MetadataRecord = { ...context };
  let additionalDetails = cleanString(context.additionalDetails);

  if (brandResolution?.brandContextBlock && brandResolution.brandId) {
    const brandDetails = [
      BRAND_CONTEXT_HEADER,
      brandResolution.brandContextBlock,
      'Use this brand context as alignment criteria when judging visual style, tone, pacing, proof style, audience fit, and recommendations. Do not invent brand facts beyond this block.',
    ].join('\n');

    result.brandId = brandResolution.brandId;
    result.brandContextSource = brandResolution.source;
    result.brandContextBlock = brandResolution.brandContextBlock;
    result.brandName = brandResolution.brand?.name;
    additionalDetails = appendContextBlock(additionalDetails, BRAND_CONTEXT_HEADER, brandDetails);
  }

  if (intentResolution) {
    result.contentIntent = intentResolution.contentIntent;
    result.intentSource = intentResolution.source;
    result.intentConfidence = intentResolution.confidence;
    result.intentRationale = intentResolution.rationale;
    result.userConfirmedIntent = intentResolution.userConfirmed;
    result.intentResolution = intentResolution;
    additionalDetails = appendContextBlock(additionalDetails, INTENT_CONTEXT_HEADER, buildIntentDetails(intentResolution));
  }

  if (additionalDetails) result.additionalDetails = additionalDetails;
  return result;
}
