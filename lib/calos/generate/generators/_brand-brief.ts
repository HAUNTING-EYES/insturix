import { getVersion as getWritingKnowledgeVersion } from '@/lib/thinkforge/data/writing-graph-query';
import {
  buildThinkForgeAuthoringContextSnapshot,
} from '@/lib/thinkforge/context/brand-authoring-context';
import {
  resolveThinkForgeAuthoringContext,
  type ThinkForgeResolvedAuthoringContext,
} from '@/lib/thinkforge/context/resolved-authoring-context';
import type { SemanticFact } from '@/lib/thinkforge/context';
import {
  buildThinkForgeSignalTrace,
  formatContentSignalProfileForPrompt,
  resolveContentSignalProfile,
  type ThinkForgeContentSignalProfile,
} from '@/lib/thinkforge/signals';
import { resolveCalosGenerationRoute } from '../route-map';
import type { GenerateParams } from '../contract';
import { resolveCalosReferenceFacts } from './_campaign-references';

export interface CalosWriterContext extends ThinkForgeResolvedAuthoringContext {
  contentSignalProfile: ThinkForgeContentSignalProfile;
  signalTrace: ReturnType<typeof buildThinkForgeSignalTrace>;
}

export type CalosWriterParams = GenerateParams & {
  /** Server-preflighted only; never accepted from a browser request. */
  authoringContext?: CalosWriterContext;
};

function canonicalOptional(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function assertPreflightedContextMatchesParams(
  context: CalosWriterContext,
  params: GenerateParams,
): CalosWriterContext {
  const resolvedBrandId = context.projectMeta.brandId?.trim();
  const snapshotBrandId = context.snapshot.brand?.brandId?.trim();
  const resolvedCardId = context.projectMeta.contentCardId?.trim();
  const resolvedCampaignId = canonicalOptional(context.projectMeta.campaignId);
  const expectedScope = params.orgId ? 'organization' : 'personal';
  if (
    resolvedBrandId !== params.brandId
    || snapshotBrandId !== params.brandId
    || resolvedCardId !== params.deliverableId
    || resolvedCampaignId !== canonicalOptional(params.campaignId)
    || context.snapshot.scope.kind !== expectedScope
  ) {
    throw new Error('CalOS preflighted authoring context does not match the requested deliverable scope.');
  }
  return context;
}

function buildCalosWriterPrompt(params: GenerateParams): string {
  return [
    params.title,
    params.angle ? `Brief: ${params.angle}` : '',
    `Format: ${params.format}`,
    `Platform: ${params.platform}`,
    params.targetDurationSeconds ? `Target duration: ${params.targetDurationSeconds} seconds` : '',
  ].filter(Boolean).join('\n');
}

function mergeFacts(primary: SemanticFact[], secondary: SemanticFact[]): SemanticFact[] {
  const seen = new Set<string>();
  return [...primary, ...secondary].filter((fact) => {
    if (seen.has(fact.id)) return false;
    seen.add(fact.id);
    return true;
  });
}

/**
 * CalOS writes through ThinkForge's authoritative authoring-context resolver. References are
 * merged before signal resolution, so the signal trace, snapshot, prompts, and source ledger all
 * describe the same exact evidence set.
 */
export async function resolveCalosWriterContext(
  params: CalosWriterParams,
): Promise<CalosWriterContext> {
  if (params.authoringContext) {
    return assertPreflightedContextMatchesParams(params.authoringContext, params);
  }

  const route = resolveCalosGenerationRoute(params.format);
  const userPrompt = buildCalosWriterPrompt(params);
  const writingKnowledgeVersion = getWritingKnowledgeVersion();
  const [resolved, referenceFacts] = await Promise.all([
    resolveThinkForgeAuthoringContext({
      userId: params.ownerUserId,
      orgId: params.orgId ?? null,
      providedProject: {
        title: params.title,
        idea: params.angle,
        format: route.format,
        contentContract: route.contentContract,
        platform: params.platform,
        brandId: params.brandId,
        contentCardId: params.deliverableId,
        ...(params.targetDurationSeconds ? { durationSec: params.targetDurationSeconds } : {}),
        ...(params.campaignId ? { campaignId: params.campaignId } : {}),
      },
      currentPrompt: userPrompt,
      maxFacts: 5,
      interactionWindowDays: 30,
      writingKnowledgeVersion,
    }),
    resolveCalosReferenceFacts({
      campaignId: params.campaignId,
      brandId: params.brandId,
      ownerUserId: params.ownerUserId,
      orgId: params.orgId,
    }),
  ]);

  const projectFacts = mergeFacts(referenceFacts, resolved.retrievedContext.projectFacts ?? []);
  const retrievedContext = {
    ...resolved.retrievedContext,
    projectFacts,
    semanticFacts: mergeFacts(projectFacts, resolved.retrievedContext.globalFacts ?? []),
  };
  const projectMeta = {
    ...resolved.projectMeta,
    format: route.format,
    contentContract: route.contentContract,
    contentCardId: params.deliverableId,
    ...(params.targetDurationSeconds ? { durationSec: params.targetDurationSeconds } : {}),
  };
  const contentSignalProfile = resolveContentSignalProfile({
    userPrompt,
    documentType: route.documentType,
    medium: route.format,
    platform: params.platform,
    brandId: projectMeta.brandId,
    project: projectMeta,
    retrievedContext,
  });

  return {
    ...resolved,
    projectMeta,
    retrievedContext,
    snapshot: buildThinkForgeAuthoringContextSnapshot({
      orgId: params.orgId ?? null,
      retrievedContext,
      writingKnowledgeVersion,
    }),
    systemBrief: [
      resolved.systemBrief,
      formatContentSignalProfileForPrompt(contentSignalProfile),
    ].filter(Boolean).join('\n\n'),
    contentSignalProfile,
    signalTrace: buildThinkForgeSignalTrace(contentSignalProfile),
  };
}
