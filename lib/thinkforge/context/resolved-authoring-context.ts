import {
  fetchContextSources,
  formatSystemBrief,
  type FetchContextOptions,
  type RetrievedContext,
} from '@/lib/thinkforge/context/fetchContextSources';
import {
  buildThinkForgeAuthoringContextSnapshot,
  resolveThinkForgeAuthoringProjectMetadata,
  ThinkForgeBrandAuthorityError,
  type ThinkForgeAuthoringContextSnapshot,
} from '@/lib/thinkforge/context/brand-authoring-context';
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
  const retrievedContext = await fetchContextSources(retrievalOptions);

  return {
    projectMeta,
    retrievedContext,
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
