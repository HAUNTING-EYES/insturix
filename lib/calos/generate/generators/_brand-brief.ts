import { getVersion as getWritingKnowledgeVersion } from '@/lib/thinkforge/data/writing-graph-query';
import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import {
  buildThinkForgeAuthoringContextSnapshot,
} from '@/lib/thinkforge/context/brand-authoring-context';
import {
  resolveThinkForgeAuthoringContext,
  type ThinkForgeResolvedAuthoringContext,
} from '@/lib/thinkforge/context/resolved-authoring-context';
import type { SemanticFact } from '@/lib/thinkforge/context';
import { resolveThinkForgeProductionBrief } from '@/lib/thinkforge/brief/resolve-production-brief';
import {
  buildThinkForgeAuthoringCompatibilityMetadata,
  createDefaultThinkForgePostControls,
  createThinkForgeAuthoringRequest,
  resolveThinkForgePlatformSurfaceFromLabel,
  type ThinkForgeAuthoringRequest,
} from '@/lib/thinkforge/schemas/authoring-request';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import { resolveProjectMetaAuthoringRequest } from '@/lib/thinkforge/state/types';
import {
  buildThinkForgeSourceLedger,
  type SourceLedger,
} from '@/lib/thinkforge/provenance/source-ledger';
import {
  buildThinkForgeSignalTrace,
  formatContentSignalProfileForPrompt,
  resolveContentSignalProfile,
  type ThinkForgeContentSignalProfile,
} from '@/lib/thinkforge/signals';
import {
  resolveCalosGenerationRoute,
  type CalosGenerationRoute,
} from '../route-map';
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

export interface CalosWriterExecutionContext {
  authoringContext: CalosWriterContext;
  route: CalosGenerationRoute;
  authoringRequest: ThinkForgeAuthoringRequest;
  userPrompt: string;
  sourceLedger: SourceLedger;
  productionBrief: ProductionBrief;
}

export type CalosAuthoringContractErrorCode =
  | 'carousel_slide_count_required'
  | 'carousel_slide_count_not_applicable'
  | 'target_duration_not_applicable'
  | 'long_video_duration_required';

export class CalosAuthoringContractError extends Error {
  constructor(
    readonly code: CalosAuthoringContractErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CalosAuthoringContractError';
  }
}

interface CalosAuthoringAuthority {
  route: CalosGenerationRoute;
  authoringRequest: ThinkForgeAuthoringRequest;
}

function resolveCalosAuthoringAuthority(params: GenerateParams): CalosAuthoringAuthority {
  const baseRoute = resolveCalosGenerationRoute(params.format);
  const isCarousel = baseRoute.documentType === 'carousel';
  const isVideo = baseRoute.documentType === 'video_script';
  if (isCarousel && params.carouselSlideCount === undefined) {
    throw new CalosAuthoringContractError(
      'carousel_slide_count_required',
      'Choose the carousel slide count before generating this calendar card.',
    );
  }
  if (!isCarousel && params.carouselSlideCount !== undefined) {
    throw new CalosAuthoringContractError(
      'carousel_slide_count_not_applicable',
      'Carousel slide count is only valid for a carousel deliverable.',
    );
  }
  if (!isVideo && params.targetDurationSeconds !== undefined) {
    throw new CalosAuthoringContractError(
      'target_duration_not_applicable',
      'Target duration is only valid for a video-script deliverable.',
    );
  }
  if (baseRoute.format === 'long_video' && params.targetDurationSeconds === undefined) {
    throw new CalosAuthoringContractError(
      'long_video_duration_required',
      'Choose the long-video runtime before generating this calendar card.',
    );
  }

  const contentContract = isCarousel
    ? createThinkForgeWriterContract('carousel', {
        carouselSlideCount: params.carouselSlideCount,
      })
    : baseRoute.contentContract;
  const authoringRequest = createThinkForgeAuthoringRequest({
    contentContract,
    platformSurface: resolveThinkForgePlatformSurfaceFromLabel(params.platform),
    ...(isVideo && params.targetDurationSeconds !== undefined
      ? { targetDurationSec: params.targetDurationSeconds }
      : {}),
    ...(!isVideo ? { postControls: createDefaultThinkForgePostControls() } : {}),
  });
  return {
    route: { ...baseRoute, contentContract },
    authoringRequest,
  };
}

function canonicalOptional(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function assertPreflightedContextMatchesParams(
  context: CalosWriterContext,
  params: GenerateParams,
  expectedAuthoringRequest: ThinkForgeAuthoringRequest,
): CalosWriterContext {
  const resolvedBrandId = context.projectMeta.brandId?.trim();
  const snapshotBrandId = context.snapshot.brand?.brandId?.trim();
  const resolvedCardId = context.projectMeta.contentCardId?.trim();
  const resolvedCampaignId = canonicalOptional(context.projectMeta.campaignId);
  const expectedScope = params.orgId ? 'organization' : 'personal';
  const actualAuthoringRequest = resolveProjectMetaAuthoringRequest(context.projectMeta);
  if (
    resolvedBrandId !== params.brandId
    || snapshotBrandId !== params.brandId
    || resolvedCardId !== params.deliverableId
    || resolvedCampaignId !== canonicalOptional(params.campaignId)
    || context.snapshot.scope.kind !== expectedScope
    || JSON.stringify(actualAuthoringRequest) !== JSON.stringify(expectedAuthoringRequest)
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
  const { route, authoringRequest } = resolveCalosAuthoringAuthority(params);
  if (params.authoringContext) {
    return assertPreflightedContextMatchesParams(params.authoringContext, params, authoringRequest);
  }

  const userPrompt = buildCalosWriterPrompt(params);
  const writingKnowledgeVersion = getWritingKnowledgeVersion();
  const compatibilityMetadata = buildThinkForgeAuthoringCompatibilityMetadata(authoringRequest);
  const [resolved, referenceFacts] = await Promise.all([
    resolveThinkForgeAuthoringContext({
      userId: params.ownerUserId,
      orgId: params.orgId ?? null,
      providedProject: {
        title: params.title,
        idea: params.angle,
        ...compatibilityMetadata,
        brandId: params.brandId,
        contentCardId: params.deliverableId,
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
    ...compatibilityMetadata,
    contentCardId: params.deliverableId,
  };
  const contentSignalProfile = resolveContentSignalProfile({
    userPrompt,
    authoringRequest,
    contentContract: authoringRequest.contentContract,
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

/** One immutable input bundle shared by every CalOS call into a ThinkForge writer. */
export async function resolveCalosWriterExecutionContext(
  params: CalosWriterParams,
): Promise<CalosWriterExecutionContext> {
  const { route, authoringRequest } = resolveCalosAuthoringAuthority(params);
  const authoringContext = await resolveCalosWriterContext(params);
  const userPrompt = buildCalosWriterPrompt(params);
  const sourceLedger = buildThinkForgeSourceLedger({
    userPrompt,
    retrievedContext: authoringContext.retrievedContext,
    brandId: authoringContext.projectMeta.brandId,
    maxFactEntries: 72,
  });
  const productionBrief = resolveThinkForgeProductionBrief({
    userPrompt,
    project: authoringContext.projectMeta,
    authoringRequest,
    documentType: route.documentType,
    contentPath: route.documentType,
    brandId: authoringContext.projectMeta.brandId,
  });

  return {
    authoringContext,
    route,
    authoringRequest,
    userPrompt,
    sourceLedger,
    productionBrief,
  };
}
