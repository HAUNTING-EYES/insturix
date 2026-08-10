import {
  authorizeBrandScope,
  BrandScopeAuthorizationError,
} from '@/lib/shared/brand-scope';
import type { BrandSignalProfile } from '@/lib/shared/brand-signal-profile';
import {
  getDefaultBrandVaultRefineryStore,
  type BrandVaultRefineryStore,
} from '@/lib/shared/brand-vault-refinery-api';
import {
  mergeThinkForgeProjectMetadata,
  resolveProjectMetaBrandId,
  type ProjectMeta,
} from '../state/types';
import type { RetrievedContext } from './fetchContextSources';
import { createHash } from 'crypto';

export type ThinkForgeBrandAuthority = {
  brandId: string;
  brandName: string;
  recordId: string;
  profileUpdatedAt: string;
  profile: BrandSignalProfile;
};

export const THINKFORGE_AUTHORING_CONTEXT_SNAPSHOT_VERSION = 1;

/**
 * Server-only provenance for a generated document. It identifies the accepted
 * Brand Vault revision and the retrieval set without persisting any raw prompt
 * text, Brand Vault values, or DataBank content alongside the artifact.
 */
export type ThinkForgeAuthoringContextSnapshot = {
  version: typeof THINKFORGE_AUTHORING_CONTEXT_SNAPSHOT_VERSION;
  resolvedAt: string;
  scope: {
    kind: 'personal' | 'organization';
    brandId?: string;
  };
  brand?: {
    brandId: string;
    recordId: string;
    profileUpdatedAt: string;
    profileFingerprint: string;
  };
  retrieval: {
    projectFactIds: string[];
    globalFactIds: string[];
    interactionPatternTypes: string[];
  };
  writingKnowledgeVersion: string | null;
};

export class ThinkForgeBrandAuthorityError extends Error {
  constructor(
    readonly code: 'brand_not_found' | 'brand_scope_unavailable' | 'brand_profile_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'ThinkForgeBrandAuthorityError';
  }
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(String(value));
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

export function buildThinkForgeAuthoringContextSnapshot(input: {
  orgId?: string | null;
  retrievedContext?: Pick<
    RetrievedContext,
    'brandAuthority' | 'projectFacts' | 'globalFacts' | 'interactionPatterns'
  > | null;
  writingKnowledgeVersion?: string | null;
  resolvedAt?: Date;
}): ThinkForgeAuthoringContextSnapshot {
  const context = input.retrievedContext;
  const authority = context?.brandAuthority ?? null;
  const brand = authority
    ? {
        brandId: authority.brandId,
        recordId: authority.recordId,
        profileUpdatedAt: authority.profileUpdatedAt,
        profileFingerprint: createHash('sha256')
          .update(stableSerialize(authority.profile))
          .digest('hex'),
      }
    : undefined;

  return {
    version: THINKFORGE_AUTHORING_CONTEXT_SNAPSHOT_VERSION,
    resolvedAt: (input.resolvedAt ?? new Date()).toISOString(),
    scope: {
      kind: input.orgId ? 'organization' : 'personal',
      ...(authority ? { brandId: authority.brandId } : {}),
    },
    ...(brand ? { brand } : {}),
    retrieval: {
      projectFactIds: uniqueSorted(context?.projectFacts.map((fact) => fact.id) ?? []),
      globalFactIds: uniqueSorted(context?.globalFacts.map((fact) => fact.id) ?? []),
      interactionPatternTypes: uniqueSorted(context?.interactionPatterns.map((pattern) => pattern.type) ?? []),
    },
    writingKnowledgeVersion: input.writingKnowledgeVersion ?? null,
  };
}

/**
 * A persisted session brand is the authoring authority. The client may refine
 * the brief, but it may not silently redirect an existing session to another
 * brand or keep a stale free-text Brand Vault summary alongside the profile.
 */
export function resolveThinkForgeAuthoringProjectMetadata(
  sessionProjectMeta?: ProjectMeta | null,
  providedProject?: ProjectMeta | null,
): ProjectMeta {
  const sessionBrandId = resolveProjectMetaBrandId(sessionProjectMeta);
  const providedBrandId = resolveProjectMetaBrandId(providedProject);

  if (sessionBrandId && providedBrandId && sessionBrandId !== providedBrandId) {
    throw new ThinkForgeBrandAuthorityError(
      'brand_not_found',
      'This session is already bound to a different brand. Start a new session to change brands.',
    );
  }

  const merged = mergeThinkForgeProjectMetadata(sessionProjectMeta, providedProject);
  // brandBrief is a legacy browser snapshot, not an authoring source of truth.
  // Original user/source material remains in the separately isolated brief fields.
  const { brandBrief: _legacyBrandBrief, ...authoringMetadata } = merged;
  const brandId = sessionBrandId ?? providedBrandId;
  if (!brandId) return authoringMetadata;
  return { ...authoringMetadata, brandId };
}

export async function resolveThinkForgeBrandAuthority(input: {
  userId: string;
  orgId: string | null;
  isOrgAdmin?: boolean;
  brandId?: string;
  store?: Pick<BrandVaultRefineryStore, 'listAcceptedBrands' | 'getLatestAcceptedRecord'>;
}): Promise<ThinkForgeBrandAuthority | null> {
  const brandId = input.brandId?.trim();
  if (!brandId) return null;

  const store = input.store ?? getDefaultBrandVaultRefineryStore();
  try {
    const scope = await authorizeBrandScope({
      userId: input.userId,
      orgId: input.orgId,
      isOrgAdmin: input.isOrgAdmin,
      brandId,
      store,
    });
    const record = await store.getLatestAcceptedRecord({
      brandId: scope.brandId,
      userId: input.userId,
      orgId: input.orgId,
    });
    if (!record || record.status !== 'accepted' || record.profile.brandId !== scope.brandId) {
      throw new ThinkForgeBrandAuthorityError(
        'brand_profile_unavailable',
        'The selected brand no longer has an accepted Brand Vault profile. Review Brand Vault before generating.',
      );
    }
    if (!input.orgId && record.profile.userId && record.profile.userId !== input.userId) {
      throw new ThinkForgeBrandAuthorityError(
        'brand_not_found',
        'The selected brand is not available to this workspace. Re-select the brand and try again.',
      );
    }

    return {
      brandId: scope.brandId,
      brandName: scope.brandName,
      recordId: record.id,
      profileUpdatedAt: record.updatedAt,
      profile: record.profile,
    };
  } catch (error) {
    if (error instanceof ThinkForgeBrandAuthorityError) throw error;
    if (error instanceof BrandScopeAuthorizationError) {
      throw new ThinkForgeBrandAuthorityError(error.code, error.message);
    }
    throw new ThinkForgeBrandAuthorityError(
      'brand_scope_unavailable',
      'Brand Vault could not verify the selected brand. Please try again before generating.',
    );
  }
}
