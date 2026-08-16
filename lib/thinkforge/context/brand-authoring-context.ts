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
  resolveThinkForgeSessionBrandBinding,
  type ProjectMeta,
  type ThinkForgeSessionBrandBinding,
} from '../state/types';
import {
  ThinkForgeAuthoringRequestSchema,
  type ThinkForgeAuthoringRequest,
} from '../schemas/authoring-request';
import type {
  ContextRetrievalDiagnostic,
  ContextRetrievalDiagnostics,
  RetrievedContext,
} from './fetchContextSources';
import { createHash } from 'crypto';

export type ThinkForgeBrandAuthority = {
  brandId: string;
  brandName: string;
  recordId: string;
  profileUpdatedAt: string;
  profile: BrandSignalProfile;
};

export const THINKFORGE_AUTHORING_CONTEXT_SNAPSHOT_VERSION = 3;

/**
 * Server-only provenance for a generated document. It identifies the accepted
 * Brand Vault revision and the retrieval set without persisting any raw prompt
 * text, Brand Vault values, or DataBank content alongside the artifact.
 */
type ThinkForgeAuthoringContextSnapshotBase = {
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
  writingKnowledgeVersion: string | null;
};

type ThinkForgeAuthoringContextSnapshotRetrieval = {
  projectFactIds: string[];
  globalFactIds: string[];
  interactionPatternTypes: string[];
};

export type ThinkForgeAuthoringContextSnapshotV1 = ThinkForgeAuthoringContextSnapshotBase & {
  version: 1;
  retrieval: ThinkForgeAuthoringContextSnapshotRetrieval;
};

export type ThinkForgeAuthoringContextSnapshotV2 = ThinkForgeAuthoringContextSnapshotBase & {
  version: 2;
  retrieval: ThinkForgeAuthoringContextSnapshotRetrieval & {
    diagnostics: ContextRetrievalDiagnostics;
  };
};

export type ThinkForgeAuthoringContextSnapshotV3 = ThinkForgeAuthoringContextSnapshotBase & {
  version: typeof THINKFORGE_AUTHORING_CONTEXT_SNAPSHOT_VERSION;
  authoringRequest: ThinkForgeAuthoringRequest | null;
  retrieval: ThinkForgeAuthoringContextSnapshotRetrieval & {
    diagnostics: ContextRetrievalDiagnostics;
  };
};

export type ThinkForgeAuthoringContextSnapshot =
  | ThinkForgeAuthoringContextSnapshotV1
  | ThinkForgeAuthoringContextSnapshotV2
  | ThinkForgeAuthoringContextSnapshotV3;

/**
 * The cross-service-safe subset of a document's authoring snapshot. Retrieval
 * IDs and all raw authoring material deliberately remain in ThinkForge.
 */
export {
  projectThinkForgeAuthoringProvenance,
  ThinkForgeAuthoringProvenanceError,
  type ThinkForgeAuthoringProvenance,
} from './authoring-provenance';

export class ThinkForgeBrandAuthorityError extends Error {
  constructor(
    readonly code: 'brand_not_found' | 'brand_scope_unavailable' | 'brand_profile_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'ThinkForgeBrandAuthorityError';
  }
}

export function createThinkForgeSessionBrandBinding(input: {
  brandId: string;
  orgId: string | null;
  boundAt?: Date;
}): Extract<ThinkForgeSessionBrandBinding, { version: 2 }> {
  const brandId = input.brandId.trim();
  if (!brandId) {
    throw new ThinkForgeBrandAuthorityError('brand_not_found', 'A valid brand is required to create a ThinkForge session binding.');
  }

  const orgId = input.orgId?.trim() || null;
  if (input.orgId !== null && !orgId) {
    throw new ThinkForgeBrandAuthorityError('brand_scope_unavailable', 'A valid organization is required for an organization brand binding.');
  }

  return {
    version: 2,
    brandId,
    scope: orgId ? 'organization' : 'personal',
    orgId,
    boundAt: (input.boundAt ?? new Date()).toISOString(),
  };
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

function diagnosticsUnavailable(itemCount: number): ContextRetrievalDiagnostic {
  return {
    status: 'unknown',
    itemCount,
    durationMs: 0,
    reason: 'diagnostics_unavailable',
  };
}

function resolveSnapshotRetrievalDiagnostics(
  context: Pick<RetrievedContext, 'projectFacts' | 'globalFacts' | 'interactionPatterns' | 'retrievalDiagnostics'> | null | undefined,
): ContextRetrievalDiagnostics {
  if (context?.retrievalDiagnostics) return context.retrievalDiagnostics;
  return {
    version: 1,
    projectFacts: diagnosticsUnavailable(context?.projectFacts.length ?? 0),
    globalVector: diagnosticsUnavailable(0),
    globalKeyword: diagnosticsUnavailable(0),
    interactionPatterns: diagnosticsUnavailable(context?.interactionPatterns.length ?? 0),
  };
}

export function buildThinkForgeAuthoringContextSnapshot(input: {
  orgId?: string | null;
  retrievedContext?: Pick<
    RetrievedContext,
    'brandAuthority' | 'projectFacts' | 'globalFacts' | 'interactionPatterns' | 'retrievalDiagnostics'
  > | null;
  authoringRequest?: ThinkForgeAuthoringRequest | null;
  writingKnowledgeVersion?: string | null;
  resolvedAt?: Date;
}): ThinkForgeAuthoringContextSnapshotV3 {
  const context = input.retrievedContext;
  const authority = context?.brandAuthority ?? null;
  const authoringRequest = input.authoringRequest
    ? ThinkForgeAuthoringRequestSchema.parse(input.authoringRequest)
    : null;
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
    authoringRequest,
    retrieval: {
      projectFactIds: uniqueSorted(context?.projectFacts.map((fact) => fact.id) ?? []),
      globalFactIds: uniqueSorted(context?.globalFacts.map((fact) => fact.id) ?? []),
      interactionPatternTypes: uniqueSorted(context?.interactionPatterns.map((pattern) => pattern.type) ?? []),
      diagnostics: resolveSnapshotRetrievalDiagnostics(context),
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
  const sessionBinding = resolveThinkForgeSessionBrandBinding(sessionProjectMeta);
  const sessionDirectBrandId = typeof sessionProjectMeta?.brandId === 'string'
    ? sessionProjectMeta.brandId.trim()
    : undefined;
  const providedBrandId = typeof providedProject?.brandId === 'string'
    ? providedProject.brandId.trim()
    : undefined;
  const sessionBrandId = sessionBinding?.brandId ?? resolveProjectMetaBrandId(sessionProjectMeta);

  if (sessionBinding && sessionDirectBrandId && sessionBinding.brandId !== sessionDirectBrandId) {
    throw new ThinkForgeBrandAuthorityError(
      'brand_not_found',
      'This session contains conflicting brand authority. Re-open the session before generating.',
    );
  }

  if (sessionBrandId && providedBrandId && sessionBrandId !== providedBrandId) {
    throw new ThinkForgeBrandAuthorityError(
      'brand_not_found',
      'This session is already bound to a different brand. Start a new session to change brands.',
    );
  }

  // Browser payloads never own a session binding. The session's server-issued
  // binding is preserved while callers may still refine creative metadata.
  const { brandBinding: _providedBinding, ...providedWithoutBinding } = providedProject || {};
  const merged = mergeThinkForgeProjectMetadata(sessionProjectMeta, providedWithoutBinding);
  // brandBrief is a legacy browser snapshot, not an authoring source of truth.
  // Original user/source material remains in the separately isolated brief fields.
  const { brandBrief: _legacyBrandBrief, brandBinding: _mergedBinding, ...authoringMetadata } = merged;
  const brandId = sessionBrandId ?? providedBrandId;
  if (!brandId) return authoringMetadata;
  return {
    ...authoringMetadata,
    brandId,
    ...(sessionBinding ? { brandBinding: sessionBinding } : {}),
  };
}

export async function resolveThinkForgeBrandAuthority(input: {
  userId: string;
  orgId: string | null;
  isOrgAdmin?: boolean;
  brandId?: string;
  store?: Pick<BrandVaultRefineryStore, 'getLatestAcceptedRecord'>
    & Partial<Pick<BrandVaultRefineryStore, 'getBrandAccessGrants'>>;
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
    const record = scope.acceptedRecord;
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
