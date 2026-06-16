import type { AgentInput } from '../agents/types';
import {
  normalizeThinkForgeBlockExportMeta,
  type ClickatronAssetIntent,
  type ClickatronCarouselSlideSpec,
  type ClickatronCreativeCalendarScope,
  type ClickatronCreativeBrandContext,
  type ClickatronCreativeKind,
  type ClickatronPlatform,
  type ClickatronTextLayer,
  type ClickatronTextPolicy,
  type ThinkForgeBlockExportMeta,
} from '../schemas/clickatron-creative-contract';
import { validateThinkForgeBlocks, type ThinkForgeBlock } from '../schemas/thinkforge-block';
import type { ThinkForgeContentSignalProfile } from '../signals';

export const THINKFORGE_CLICKATRON_EXPORT_START = 'THINKFORGE_CLICKATRON_EXPORT';
export const THINKFORGE_CLICKATRON_EXPORT_END = 'END_THINKFORGE_CLICKATRON_EXPORT';

const SIDECAR_RE = /<!--\s*THINKFORGE_CLICKATRON_EXPORT\s*([\s\S]*?)\s*END_THINKFORGE_CLICKATRON_EXPORT\s*-->/i;
const SIDECAR_START_RE = /<!--\s*THINKFORGE_CLICKATRON_EXPORT\b/i;
const NON_VIDEO_CREATIVE_INTENT_RE =
  /\b(post|posts|caption|captions|carousel|carousels|thread|threads|blog|article|newsletter|social|linkedin|instagram|facebook|pinterest|graphic|static creative|ad creative|blog header|x post)\b/;
const VIDEO_PRODUCTION_DELIVERABLE_RE =
  /\b(video script|videos? with scenes?|youtube video|tiktok video|scripted reel|reel script|reels?|shorts?|storyboard|shot list|scene breakdown|b-roll|voiceover|commercial script|ugc script)\b/;
const CALENDAR_FIELDS: Array<keyof ClickatronCreativeCalendarScope> = [
  'contentCardId',
  'campaignId',
  'calendarItemId',
  'seriesId',
];

function compactText(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join('\n').toLowerCase();
}

type SidecarProfileInput = Pick<AgentInput, 'context' | 'userPrompt'>;

export interface ClickatronCreativeSidecarProfile {
  kind: ClickatronCreativeKind;
  assetIntent: ClickatronAssetIntent;
  platform: ClickatronPlatform;
  aspectRatio: string;
  textPolicy: ClickatronTextPolicy;
  creativeBrief: {
    objective: string;
    coreMessage: string;
    audience?: string;
    keyClaims?: string[];
    cta?: string;
    visualMetaphor?: string;
  };
  userIntent: {
    tone?: string;
    wantsCarousel: boolean;
    notes?: string;
  };
  brand?: {
    brandId?: string;
    hardConstraints?: string[];
    softPreferences?: string[];
  };
  calendar?: ClickatronCreativeCalendarScope;
}

export function shouldRequestClickatronCreativeSidecar(
  input: SidecarProfileInput,
  profile?: ThinkForgeContentSignalProfile,
): boolean {
  const userPrompt = compactText([input.userPrompt]);
  const supportingContext = compactText([input.context.projectSummary, input.context.systemBrief]);
  const currentScript = compactText([input.context.currentScript]);

  const promptRequestsCreative = NON_VIDEO_CREATIVE_INTENT_RE.test(userPrompt);
  const contextRequestsCreative = NON_VIDEO_CREATIVE_INTENT_RE.test(supportingContext);
  const currentScriptLooksCreative = NON_VIDEO_CREATIVE_INTENT_RE.test(currentScript);
  const promptRequestsVideoProductionDeliverable = VIDEO_PRODUCTION_DELIVERABLE_RE.test(userPrompt);

  const profileStaticCreative = profile?.intent.clickatron.requested === true
    && profile.intent.clickatron.assetIntent === 'static_image'
    && (profile.intent.outputFormat === 'social_post' || profile.intent.outputFormat === 'caption');

  if (promptRequestsVideoProductionDeliverable && !promptRequestsCreative && !profileStaticCreative) {
    return false;
  }

  return promptRequestsCreative || contextRequestsCreative || currentScriptLooksCreative || profileStaticCreative;
}

export function appendClickatronCreativeSidecarInstruction(
  input: AgentInput,
  profile?: ThinkForgeContentSignalProfile,
): AgentInput {
  const sidecarProfile = buildClickatronCreativeSidecarProfile(input, profile);
  const profileBlock = sidecarProfile
    ? `\nResolved profile for the hidden Clickatron JSON:\n<clickatron_resolved_profile>\n${JSON.stringify(sidecarProfile, null, 2)}\n</clickatron_resolved_profile>\n`
    : '';

  return {
    ...input,
    userPrompt: `${input.userPrompt}

Hidden Clickatron export requirement:
After the visible draft, append exactly one HTML comment in this shape:
<!-- THINKFORGE_CLICKATRON_EXPORT
{ "clickatron": { "...": "valid ClickatronCreativeSpec JSON" } }
END_THINKFORGE_CLICKATRON_EXPORT -->

Required JSON skeleton. Preserve these exact field names and nesting:
{
  "clickatron": {
    "schemaVersion": 1,
    "kind": "single_post_visual",
    "assetIntent": "post_graphic",
    "platform": "instagram",
    "aspectRatio": "4:5",
    "source": {
      "sourceService": "thinkforge",
      "sourceBlockIds": ["AUTO"]
    },
    "userIntent": {
      "visualMode": "text_forward_graphic",
      "wantsCarousel": false
    },
    "creativeBrief": {
      "objective": "grounded objective",
      "coreMessage": "grounded message",
      "audience": "grounded audience",
      "keyClaims": ["only claims supplied by the brief or resolved profile"]
    },
    "brand": {
      "brandId": "grounded brand id if supplied",
      "hardConstraints": ["grounded visible-text restrictions"],
      "softPreferences": ["grounded style preferences"]
    },
    "calendar": {
      "contentCardId": "grounded content card id if supplied",
      "campaignId": "grounded campaign id if supplied",
      "calendarItemId": "grounded calendar item id if supplied",
      "seriesId": "grounded series id if supplied"
    },
    "renderPlan": {
      "textPolicy": "editable_text_layers",
      "imagePrompt": "visual-only scene, composition, objects, style, mood, layout, aspect ratio, and shared visual system",
      "textLayers": [
        {
          "id": "headline",
          "text": "exact readable words",
          "role": "headline",
          "priority": 90
        }
      ],
      "slides": [
        {
          "id": "slide_1",
          "index": 0,
          "imagePrompt": "slide-specific visual scene, composition, objects, style, mood, and layout",
          "sourceBlockIds": ["AUTO"],
          "textLayers": [
            {
              "id": "slide_1_headline",
              "text": "exact slide words",
              "role": "headline",
              "priority": 90
            }
          ]
        }
      ]
    },
    "validation": {
      "status": "ready"
    }
  }
}

Rules for the hidden JSON:
- Do not mention this export in the visible copy.
- This hidden JSON is mandatory. If you must shorten something, shorten visible copy before shortening or omitting the hidden JSON.
- Use schemaVersion 1.
- Use kind "single_post_visual" for one visual, thread visual, blog header, newsletter graphic, or ad creative.
- Use kind "carousel" only when the requested output is a carousel; include renderPlan.slides for every slide.
- For carousel requests, keep the visible post compact enough to leave room for the complete hidden JSON: one hook, 2-4 short paragraphs, one CTA, then the sidecar.
- Use source.sourceService "thinkforge" and source.sourceBlockIds ["AUTO"]. The backend replaces AUTO with real block IDs.
- Include userIntent.visualMode using one of: auto, photo, illustration, product_mockup, text_forward_graphic, diagram, or mixed.
- Choose platform from generic, instagram, linkedin, x, facebook, youtube, tiktok, or pinterest.
- Use editable_text_layers unless the user explicitly asks for no text in the image.
- Put textPolicy only at renderPlan.textPolicy. Never emit clickatron.textPolicy.
- Put exact readable words in renderPlan.textLayers, not inside renderPlan.imagePrompt.
- Every renderPlan.textLayers item must use id, text, role, and priority. Never use content, position, or style as substitutes.
- Text layer role must be one of: hook, headline, subheadline, body, cta, badge, label. Use "subheadline", never "subhead".
- If using renderPlan.slides, every slide must include id, index, imagePrompt, and sourceBlockIds ["AUTO"]. Slide textLayers follow the same id/text/role/priority shape.
- renderPlan.imagePrompt is always required, even for carousels. For a carousel, make it an overview prompt describing the shared visual system, layout, aspect ratio, and art direction across all slides.
- Keep renderPlan.imagePrompt focused on scene, composition, objects, metaphor, style, mood, and layout.
- Do not invent visible-copy or sidecar claims. A claim is grounded only if it appears in the user request, project summary, brand context, retrieved context, or clickatron_resolved_profile.creativeBrief.keyClaims.
- Grounded means exact. Do not infer ingredient subtype, mechanism, absorption speed, compatibility, outcome, timeline, client result, or performance guarantee from a broader supplied claim.
- Use brand.hardConstraints only for constraints grounded in the prompt or retrieved brand context. Do not invent logo placement, claims, colors, or legal promises.
- If <clickatron_resolved_profile> is present, copy its kind, assetIntent, platform, aspectRatio, textPolicy, audience, keyClaims, brand constraints, and visual needs exactly unless the user's latest request explicitly overrides them.
- Treat clickatron_resolved_profile as a lock file for platform, aspectRatio, textPolicy, and text layer policy. The hidden JSON and imagePrompt must not contradict those values.
- If clickatron_resolved_profile.aspectRatio is "4:5", the aspectRatio field and imagePrompt must both stay 4:5. Do not describe the composition as 9:16, vertical story, Reels, or full-screen mobile unless the resolved profile says 9:16.
- Copy grounded proof points from clickatron_resolved_profile.creativeBrief.keyClaims into creativeBrief.keyClaims when they are relevant to the image.
- Use clickatron_resolved_profile.brand.hardConstraints for visible text restrictions. Never put forbidden brand terms in renderPlan.textLayers.
- Put campaignId, contentCardId, calendarItemId, and seriesId only under clickatron.calendar. Never put these fields at clickatron top level, in clickatron.metadata, renderPlan, or creativeBrief.
- If calendar identifiers are supplied in the user request, project/session context, or clickatron_resolved_profile.calendar, copy the exact values into clickatron.calendar.
- If the user's visual preference is unclear, set validation.status to "needs_user_input" and add one concise question in validation.needsUserInput.
- If enough visual direction is present, set validation.status to "ready".
- Do not wrap the hidden JSON in a code fence.${profileBlock}`,
  };
}

export function buildClickatronCreativeSidecarProfile(
  input: SidecarProfileInput,
  profile?: ThinkForgeContentSignalProfile,
): ClickatronCreativeSidecarProfile | undefined {
  if (!profile) return undefined;
  const rawText = [input.userPrompt, input.context.projectSummary, input.context.systemBrief].filter(Boolean).join('\n');
  const text = rawText.toLowerCase();
  const wantsCarousel = /\bcarousel|slides?\b/.test(text);
  const platform = normalizeClickatronPlatform(profile.intent.platform);
  const hardConstraints = profile.intent.forbiddenTerms.map((term) => `Do not use visible text "${term}".`);
  const softPreferences = uniqueStrings([
    profile.intent.tone,
    ...profile.intent.structuralHints,
    ...profile.intent.visualNeeds,
  ]);
  const keyClaims = uniqueStrings(profile.intent.proofPoints.map(normalizeProofPoint)).slice(0, 6);
  const cta = profile.profile.constraints.cta_type === 'none'
    ? undefined
    : `${profile.profile.constraints.cta_type} CTA`;
  const calendar = extractCalendarScope(rawText);

  return {
    kind: wantsCarousel ? 'carousel' : 'single_post_visual',
    assetIntent: resolveClickatronAssetIntent(input, profile, wantsCarousel),
    platform,
    aspectRatio: resolveClickatronAspectRatio(profile, platform),
    textPolicy: /\b(no text|without text|image only|visual only)\b/.test(text) ? 'no_generated_text' : 'editable_text_layers',
    creativeBrief: {
      objective: profile.intent.goal,
      coreMessage: profile.intent.angle,
      ...(profile.intent.audience ? { audience: profile.intent.audience } : {}),
      ...(keyClaims.length > 0 ? { keyClaims } : {}),
      ...(cta ? { cta } : {}),
      ...(profile.intent.visualNeeds.length > 0 ? { visualMetaphor: profile.intent.visualNeeds.join('; ') } : {}),
    },
    userIntent: {
      ...(profile.intent.tone ? { tone: profile.intent.tone } : {}),
      wantsCarousel,
      ...(profile.intent.visualNeeds.length > 0 ? { notes: `Visual needs: ${profile.intent.visualNeeds.join('; ')}` } : {}),
    },
    ...(profile.sources.brandId || hardConstraints.length > 0 || softPreferences.length > 0
      ? {
          brand: {
            ...(profile.sources.brandId ? { brandId: profile.sources.brandId } : {}),
            ...(hardConstraints.length > 0 ? { hardConstraints } : {}),
            ...(softPreferences.length > 0 ? { softPreferences } : {}),
          },
        }
      : {}),
    ...(calendar ? { calendar } : {}),
  };
}

export function applyContentSignalProfileToClickatronExportMeta(
  exportMeta: ThinkForgeBlockExportMeta,
  input: SidecarProfileInput,
  profile?: ThinkForgeContentSignalProfile,
): ThinkForgeBlockExportMeta {
  const sidecarProfile = buildClickatronCreativeSidecarProfile(input, profile);
  const clickatron = exportMeta.clickatron;
  if (!sidecarProfile || !clickatron) return exportMeta;
  const calendar = mergeCalendarScopes(clickatron.calendar, sidecarProfile.calendar);

  const normalized = normalizeThinkForgeBlockExportMeta({
    clickatron: {
      ...clickatron,
      kind: sidecarProfile.kind,
      assetIntent: sidecarProfile.assetIntent,
      platform: sidecarProfile.platform === 'generic' ? clickatron.platform : sidecarProfile.platform,
      aspectRatio: sidecarProfile.aspectRatio,
      userIntent: {
        ...clickatron.userIntent,
        ...(sidecarProfile.userIntent.tone && !clickatron.userIntent.tone ? { tone: sidecarProfile.userIntent.tone } : {}),
        wantsCarousel: sidecarProfile.userIntent.wantsCarousel || clickatron.userIntent.wantsCarousel,
        ...(clickatron.userIntent.notes ? {} : { notes: sidecarProfile.userIntent.notes }),
      },
      creativeBrief: {
        ...clickatron.creativeBrief,
        ...(clickatron.creativeBrief.audience ? {} : { audience: sidecarProfile.creativeBrief.audience }),
        keyClaims: uniqueStrings([...(clickatron.creativeBrief.keyClaims ?? []), ...(sidecarProfile.creativeBrief.keyClaims ?? [])]).slice(0, 6),
        ...(clickatron.creativeBrief.cta ? {} : { cta: sidecarProfile.creativeBrief.cta }),
        ...(clickatron.creativeBrief.visualMetaphor ? {} : { visualMetaphor: sidecarProfile.creativeBrief.visualMetaphor }),
      },
      brand: mergeSidecarBrand(clickatron.brand, sidecarProfile.brand),
      ...(calendar ? { calendar } : {}),
      renderPlan: {
        ...clickatron.renderPlan,
        textPolicy: sidecarProfile.textPolicy,
      },
    },
  });

  if (!normalized?.clickatron) {
    throw new Error('Profile-enriched Clickatron export metadata is invalid');
  }
  return normalized;
}

function normalizeClickatronPlatform(platform?: string): ClickatronPlatform {
  const lower = platform?.toLowerCase() ?? '';
  if (lower.includes('instagram')) return 'instagram';
  if (lower.includes('linkedin')) return 'linkedin';
  if (lower === 'x' || lower.includes('twitter')) return 'x';
  if (lower.includes('facebook')) return 'facebook';
  if (lower.includes('youtube')) return 'youtube';
  if (lower.includes('tiktok')) return 'tiktok';
  if (lower.includes('pinterest')) return 'pinterest';
  return 'generic';
}

function resolveClickatronAssetIntent(
  input: SidecarProfileInput,
  profile: ThinkForgeContentSignalProfile,
  wantsCarousel: boolean,
): ClickatronAssetIntent {
  if (wantsCarousel) return 'carousel';
  const text = compactText([input.userPrompt, input.context.projectSummary, profile.intent.outputFormat]);
  if (/\bblog|article|newsletter|header\b/.test(text)) return 'blog_header';
  if (/\bad|advert|creative\b/.test(text)) return 'ad_creative';
  if (/\bthread\b/.test(text)) return 'thread_visual';
  return 'post_graphic';
}

function resolveClickatronAspectRatio(
  profile: ThinkForgeContentSignalProfile,
  platform: ClickatronPlatform,
): string {
  const constraints = profile.profile.constraints.platform_constraints;
  const preferred = constraints?.preferredAspectRatio;
  const aspect = constraints?.aspectRatio;
  if (typeof preferred === 'string' && preferred.trim()) return preferred.trim();
  if (typeof aspect === 'string' && aspect.trim()) return aspect.trim();
  if (platform === 'instagram') return '4:5';
  if (platform === 'pinterest') return '2:3';
  if (platform === 'youtube') return '16:9';
  if (platform === 'linkedin' || platform === 'facebook' || platform === 'x') return '1.91:1';
  return '1:1';
}

function normalizeProofPoint(point: string): string {
  return point.replace(/^Metric mentioned in brief:\s*/i, '').trim();
}

function mergeSidecarBrand(
  current: ClickatronCreativeBrandContext | undefined,
  profileBrand: ClickatronCreativeSidecarProfile['brand'],
): ClickatronCreativeBrandContext | undefined {
  if (!current && !profileBrand) return undefined;
  return {
    ...(current ?? {}),
    ...(current?.brandId || !profileBrand?.brandId ? {} : { brandId: profileBrand.brandId }),
    hardConstraints: uniqueStrings([...(current?.hardConstraints ?? []), ...(profileBrand?.hardConstraints ?? [])]),
    softPreferences: uniqueStrings([...(current?.softPreferences ?? []), ...(profileBrand?.softPreferences ?? [])]),
  };
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export function stripClickatronCreativeSidecarText(markdown: string): string {
  const complete = SIDECAR_RE.exec(markdown);
  if (complete?.index !== undefined) {
    return `${markdown.slice(0, complete.index)}${markdown.slice(complete.index + complete[0].length)}`.trimEnd();
  }

  const start = markdown.search(SIDECAR_START_RE);
  if (start === -1) return markdown;
  return markdown.slice(0, start).trimEnd();
}

export function extractRequiredClickatronCreativeSidecar(markdown: string): {
  visibleMarkdown: string;
  exportMeta: ThinkForgeBlockExportMeta;
} {
  const match = SIDECAR_RE.exec(markdown);
  if (!match) {
    throw new Error('ThinkForge Clickatron export sidecar was requested but missing');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch (error) {
    throw new Error(`ThinkForge Clickatron export sidecar JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }

  const exportMeta = normalizeThinkForgeBlockExportMeta(repairRecoverableClickatronCreativeSidecar(parsed));
  if (!exportMeta?.clickatron) {
    throw new Error('ThinkForge Clickatron export sidecar must include exportMeta.clickatron');
  }

  return {
    visibleMarkdown: stripClickatronCreativeSidecarText(markdown),
    exportMeta,
  };
}

function repairRecoverableClickatronCreativeSidecar(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const clickatron = isRecord(input.clickatron) ? input.clickatron : undefined;
  const metadata = clickatron && isRecord(clickatron.metadata) ? clickatron.metadata : undefined;
  const calendar = clickatron
    ? mergeCalendarScopes(
      readCalendarScopeFromRecord(isRecord(clickatron.calendar) ? clickatron.calendar : undefined),
      readCalendarScopeFromRecord(clickatron),
      readCalendarScopeFromRecord(metadata),
    )
    : undefined;
  const repairedClickatron = clickatron && calendar ? { ...clickatron, calendar } : clickatron;
  const renderPlan = repairedClickatron && isRecord(repairedClickatron.renderPlan) ? repairedClickatron.renderPlan : undefined;
  if (!clickatron || !renderPlan) return input;

  const imagePrompt = typeof renderPlan.imagePrompt === 'string' ? renderPlan.imagePrompt.trim() : '';
  if (imagePrompt) {
    return {
      ...input,
      clickatron: repairedClickatron,
    };
  }

  const slidePrompts = Array.isArray(renderPlan.slides)
    ? renderPlan.slides
      .map((slide) => (isRecord(slide) && typeof slide.imagePrompt === 'string' ? slide.imagePrompt.trim() : ''))
      .filter(Boolean)
    : [];

  if (slidePrompts.length === 0) return input;

  return {
    ...input,
    clickatron: {
      ...repairedClickatron,
      renderPlan: {
        ...renderPlan,
        imagePrompt: buildCarouselOverviewImagePrompt(slidePrompts),
      },
    },
  };
}

function buildCarouselOverviewImagePrompt(slidePrompts: string[]): string {
  const overview = slidePrompts
    .slice(0, 6)
    .map((prompt, index) => `Slide ${index + 1}: ${prompt}`)
    .join(' ');
  return `Carousel overview for Clickatron. Preserve the shared aspect ratio, visual system, composition language, typography-safe negative space, and brand mood across all slides. ${overview}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function extractCalendarScope(text: string): ClickatronCreativeCalendarScope | undefined {
  const result: Partial<ClickatronCreativeCalendarScope> = {};

  for (const field of CALENDAR_FIELDS) {
    const pattern = new RegExp(`\\b${field}\\b\\s*[:=]?\\s*["']?([a-zA-Z0-9_.:-]+)`, 'i');
    const value = pattern.exec(text)?.[1]?.trim();
    if (value) result[field] = value;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function readCalendarScopeFromRecord(record: Record<string, unknown> | undefined): ClickatronCreativeCalendarScope | undefined {
  if (!record) return undefined;
  const result: Partial<ClickatronCreativeCalendarScope> = {};

  for (const field of CALENDAR_FIELDS) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) {
      result[field] = value.trim();
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function mergeCalendarScopes(
  ...scopes: Array<ClickatronCreativeCalendarScope | undefined>
): ClickatronCreativeCalendarScope | undefined {
  const merged: Partial<ClickatronCreativeCalendarScope> = {};

  for (const scope of scopes) {
    for (const field of CALENDAR_FIELDS) {
      const value = scope?.[field];
      if (value && !merged[field]) {
        merged[field] = value;
      }
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function resolveTextLayers(layers: ClickatronTextLayer[] | undefined, fallbackBlockId: string): ClickatronTextLayer[] | undefined {
  if (!layers || layers.length === 0) return undefined;
  return layers.map((layer) => ({
    ...layer,
    sourceBlockId: !layer.sourceBlockId || layer.sourceBlockId === 'AUTO' ? fallbackBlockId : layer.sourceBlockId,
  }));
}

function resolveSlides(slides: ClickatronCarouselSlideSpec[] | undefined, blockIds: string[]): ClickatronCarouselSlideSpec[] | undefined {
  if (!slides || slides.length === 0) return undefined;
  const firstBlockId = blockIds[0];
  return slides.map((slide, index) => {
    const fallbackBlockId = blockIds[Math.min(index, blockIds.length - 1)] ?? firstBlockId;
    const explicitBlockIds = slide.sourceBlockIds?.map((id) => (id === 'AUTO' ? fallbackBlockId : id)).filter(Boolean);
    return {
      ...slide,
      sourceBlockIds: explicitBlockIds && explicitBlockIds.length > 0 ? explicitBlockIds : [fallbackBlockId],
      textLayers: resolveTextLayers(slide.textLayers, fallbackBlockId),
    };
  });
}

export function finalizeClickatronCreativeExportMeta(
  exportMeta: ThinkForgeBlockExportMeta,
  blocks: ThinkForgeBlock[],
  options?: { staleReason?: string },
): ThinkForgeBlockExportMeta {
  if (!exportMeta.clickatron) {
    throw new Error('Cannot finalize Clickatron export metadata without a clickatron spec');
  }
  const blockIds = blocks.map((block) => block.id).filter(Boolean);
  if (blockIds.length === 0) {
    throw new Error('Cannot finalize Clickatron export metadata without ThinkForge block IDs');
  }

  const firstBlockId = blockIds[0];
  const existingIssues = exportMeta.clickatron.validation.issues ?? [];
  const staleIssue = options?.staleReason
    ? [{
        code: options.staleReason,
        message: 'Visible content changed after the Clickatron visual plan was authored; review or regenerate before publishing.',
        severity: 'warning' as const,
      }]
    : [];

  const finalized = normalizeThinkForgeBlockExportMeta({
    clickatron: {
      ...exportMeta.clickatron,
      source: {
        ...exportMeta.clickatron.source,
        sourceService: 'thinkforge',
        sourceBlockIds: blockIds,
      },
      renderPlan: {
        ...exportMeta.clickatron.renderPlan,
        textLayers: resolveTextLayers(exportMeta.clickatron.renderPlan.textLayers, firstBlockId),
        slides: resolveSlides(exportMeta.clickatron.renderPlan.slides, blockIds),
      },
      validation: {
        ...exportMeta.clickatron.validation,
        status: options?.staleReason ? 'stale' : exportMeta.clickatron.validation.status,
        issues: [...existingIssues, ...staleIssue],
      },
    },
  });

  if (!finalized?.clickatron) {
    throw new Error('Finalized Clickatron export metadata is invalid');
  }
  return finalized;
}

export function attachClickatronCreativeExportMeta(
  blocks: ThinkForgeBlock[],
  exportMeta: ThinkForgeBlockExportMeta,
  options?: { staleReason?: string },
): ThinkForgeBlock[] {
  const finalized = finalizeClickatronCreativeExportMeta(exportMeta, blocks, options);
  return validateThinkForgeBlocks(
    blocks.map((block, index) => index === 0 ? { ...block, exportMeta: finalized } : block),
  );
}
