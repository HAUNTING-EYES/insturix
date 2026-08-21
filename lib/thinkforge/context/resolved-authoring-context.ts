import {
  fetchContextSources,
  formatSystemBrief,
  type FetchContextOptions,
  type RetrievedContext,
  type SemanticFact,
} from '@/lib/thinkforge/context/fetchContextSources';
import {
  buildThinkForgeAuthoringContextSnapshot,
  resolveThinkForgeAuthoringProjectMetadata,
  ThinkForgeBrandAuthorityError,
  type ThinkForgeAuthoringContextSnapshot,
} from '@/lib/thinkforge/context/brand-authoring-context';
import {
  resolveCreativeReferenceContext,
  type ResolvedCreativeReferenceContext,
} from '@/lib/thinkforge/context/creative-reference-context';
import {
  matchesThinkForgeSessionBrandBindingPrincipal,
  resolveProjectMetaAuthoringRequest,
  resolveProjectMetaBrandId,
  resolveThinkForgeSessionBrandBinding,
  type ProjectMeta,
} from '@/lib/thinkforge/state/types';

export type ThinkForgeResolvedAuthoringContext = {
  projectMeta: ProjectMeta;
  retrievedContext: RetrievedContext;
  /** Visual influence provenance, deliberately separate from factual Source Ledger evidence. */
  creativeReferenceContext: ResolvedCreativeReferenceContext;
  systemBrief: string;
  snapshot: ThinkForgeAuthoringContextSnapshot;
};

export interface ResolveThinkForgeAuthoringContextInput {
  userId: string;
  orgId?: string | null;
  isOrgAdmin?: boolean;
  sessionProjectMeta?: ProjectMeta | null;
  providedProject?: ProjectMeta | null;
  projectId?: string;
  sessionId?: string;
  currentPrompt?: string;
  currentScript?: string;
  maxFacts?: number;
  interactionWindowDays?: number;
  /** Trusted server-side facts that must participate in the same brief and immutable snapshot. */
  additionalProjectFacts?: readonly SemanticFact[];
  /** Optional structured references; a non-empty set must carry a matching server-owned scope. */
  creativeReferenceSet?: unknown | null;
  creativeReferenceScope?: unknown | null;
  writingKnowledgeVersion?: string | null;
  resolvedAt?: Date;
}

/**
 * The server-owned context for one authoring operation. A session fixes the
 * brand identity; every operation resolves the latest accepted Brand Vault
 * profile and records the exact revision in its immutable output snapshot.
 */
export async function resolveThinkForgeAuthoringContext(
  input: ResolveThinkForgeAuthoringContextInput,
): Promise<ThinkForgeResolvedAuthoringContext> {
  const rawSessionBinding = input.sessionProjectMeta?.brandBinding;
  const sessionBinding = resolveThinkForgeSessionBrandBinding(input.sessionProjectMeta);
  if (rawSessionBinding && !sessionBinding) {
    throw new ThinkForgeBrandAuthorityError(
      'brand_scope_unavailable',
      'This session contains an invalid brand binding. Re-open the session before generating.',
    );
  }
  if (
    sessionBinding
    && !matchesThinkForgeSessionBrandBindingPrincipal(sessionBinding, input.orgId)
  ) {
    throw new ThinkForgeBrandAuthorityError(
      'brand_scope_unavailable',
      'This session is bound to a different workspace. Re-open it from the correct workspace before generating.',
    );
  }

  const projectMeta = resolveThinkForgeAuthoringProjectMetadata(
    input.sessionProjectMeta,
    input.providedProject,
  );
  const brandId = resolveProjectMetaBrandId(projectMeta);
  const retrievalOptions: FetchContextOptions = {
    userId: input.userId,
    orgId: input.orgId ?? null,
    isOrgAdmin: input.isOrgAdmin,
    projectId: input.projectId,
    sessionId: input.sessionId,
    brandId,
    currentPrompt: input.currentPrompt,
    currentScript: input.currentScript,
    maxFacts: input.maxFacts,
    interactionWindowDays: input.interactionWindowDays,
  };
  const fetchedContext = await fetchContextSources(retrievalOptions);
  const retrievedContext = mergeAdditionalProjectFacts(
    fetchedContext,
    input.additionalProjectFacts ?? [],
  );
  const creativeReferenceContext = resolveCreativeReferenceContext({
    userId: input.userId,
    orgId: input.orgId ?? null,
    brandAuthority: retrievedContext.brandAuthority,
    // Never resolve a trend reference from the browser-merged project object.
    persistedSelectedTrend: input.sessionProjectMeta?.selectedTrend,
    explicitReferenceSet: input.creativeReferenceSet,
    explicitReferenceScope: input.creativeReferenceScope,
  });

  return {
    projectMeta,
    retrievedContext,
    creativeReferenceContext,
    systemBrief: formatSystemBrief(retrievedContext),
    snapshot: buildThinkForgeAuthoringContextSnapshot({
      orgId: input.orgId ?? null,
      retrievedContext,
      authoringRequest: resolveProjectMetaAuthoringRequest(projectMeta),
      writingKnowledgeVersion: input.writingKnowledgeVersion,
      resolvedAt: input.resolvedAt,
    }),
  };
}

function mergeAdditionalProjectFacts(
  context: RetrievedContext,
  additionalProjectFacts: readonly SemanticFact[],
): RetrievedContext {
  if (additionalProjectFacts.length === 0) return context;
  const projectFacts = mergeSemanticFacts(additionalProjectFacts, context.projectFacts ?? []);
  return {
    ...context,
    projectFacts,
    semanticFacts: mergeSemanticFacts(
      projectFacts,
      context.semanticFacts ?? [],
      context.globalFacts ?? [],
    ),
  };
}

function mergeSemanticFacts(...groups: ReadonlyArray<readonly SemanticFact[]>): SemanticFact[] {
  const seen = new Set<string>();
  return groups.flatMap((group) => group).filter((fact) => {
    if (seen.has(fact.id)) return false;
    seen.add(fact.id);
    return true;
  });
}
