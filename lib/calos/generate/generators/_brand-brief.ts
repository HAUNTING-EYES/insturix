import { getVersion as getWritingKnowledgeVersion } from '@/lib/thinkforge/data/writing-graph-query';
import {
  resolveThinkForgeAuthoringContext,
  type ThinkForgeResolvedAuthoringContext,
} from '@/lib/thinkforge/context/resolved-authoring-context';
import {
  buildThinkForgeSignalTrace,
  formatContentSignalProfileForPrompt,
  resolveContentSignalProfile,
  type ThinkForgeContentSignalProfile,
} from '@/lib/thinkforge/signals';
import type { GenerateParams } from '../contract';

export interface CalosWriterContext extends ThinkForgeResolvedAuthoringContext {
  contentSignalProfile: ThinkForgeContentSignalProfile;
  signalTrace: ReturnType<typeof buildThinkForgeSignalTrace>;
}

function buildCalosWriterPrompt(params: GenerateParams): string {
  return [
    params.title,
    params.angle ? `Brief: ${params.angle}` : '',
    `Format: ${params.format}`,
    `Platform: ${params.platform}`,
  ].filter(Boolean).join('\n');
}

/**
 * CalOS writes through ThinkForge's authoritative authoring-context resolver.
 * A selected brand must resolve to its current accepted Brand Vault profile;
 * CalOS may not reduce that failure to a generic, brandless draft.
 */
export async function resolveCalosWriterContext(
  params: GenerateParams,
): Promise<CalosWriterContext> {
  const userPrompt = buildCalosWriterPrompt(params);
  const resolved = await resolveThinkForgeAuthoringContext({
    userId: params.ownerUserId,
    orgId: params.orgId ?? null,
    providedProject: {
      title: params.title,
      idea: params.angle,
      format: params.format,
      platform: params.platform,
      brandId: params.brandId,
      contentCardId: params.deliverableId,
      ...(params.campaignId ? { campaignId: params.campaignId } : {}),
    },
    currentPrompt: userPrompt,
    maxFacts: 5,
    interactionWindowDays: 30,
    writingKnowledgeVersion: getWritingKnowledgeVersion(),
  });
  const contentSignalProfile = resolveContentSignalProfile({
    userPrompt,
    documentType: params.format,
    medium: params.format,
    platform: params.platform,
    brandId: resolved.projectMeta.brandId,
    project: resolved.projectMeta,
    retrievedContext: resolved.retrievedContext,
  });

  return {
    ...resolved,
    systemBrief: [
      resolved.systemBrief,
      formatContentSignalProfileForPrompt(contentSignalProfile),
    ].filter(Boolean).join('\n\n'),
    contentSignalProfile,
    signalTrace: buildThinkForgeSignalTrace(contentSignalProfile),
  };
}
