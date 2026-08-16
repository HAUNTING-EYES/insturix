import { z } from 'zod';
import {
  ThinkForgeDocumentContractSchema,
  type ThinkForgeDocumentContract,
  type ThinkForgeWriterKind,
} from './document-contract';

export const THINKFORGE_AUTHORING_REQUEST_VERSION = 1;
export const THINKFORGE_POST_CONTROLS_VERSION = 1;
export const THINKFORGE_POST_HASHTAG_MAX = 30;
export const THINKFORGE_RESTRAINED_EMOJI_MAX = 2;

export const THINKFORGE_PLATFORM_SURFACE_IDS = [
  'linkedin',
  'instagram',
  'facebook',
  'x',
  'youtube',
  'tiktok',
  'reddit',
  'medium',
  'blog',
  'newsletter',
  'podcast',
  'internal',
  'generic',
  'custom',
] as const;

export const ThinkForgePlatformSurfaceIdSchema = z.enum(THINKFORGE_PLATFORM_SURFACE_IDS);
export type ThinkForgePlatformSurfaceId = z.infer<typeof ThinkForgePlatformSurfaceIdSchema>;

export const ThinkForgePlatformSurfaceSchema = z.object({
  id: ThinkForgePlatformSurfaceIdSchema,
  customLabel: z.string().trim().min(1).max(80).optional(),
}).superRefine((surface, ctx) => {
  if (surface.id === 'custom' && !surface.customLabel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customLabel'],
      message: 'customLabel is required for a custom platform surface',
    });
  }
  if (surface.id !== 'custom' && surface.customLabel !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customLabel'],
      message: 'customLabel is only valid for a custom platform surface',
    });
  }
});

export type ThinkForgePlatformSurface = z.infer<typeof ThinkForgePlatformSurfaceSchema>;

export const THINKFORGE_PUBLISHING_SURFACE_IDS = [
  'linkedin_post',
  'linkedin_document_carousel',
  'x_post',
  'instagram_feed',
  'instagram_carousel',
  'instagram_reels',
  'facebook_post',
  'facebook_carousel',
  'facebook_reels',
  'youtube_community_post',
  'youtube_video',
  'youtube_shorts',
  'tiktok_video',
  'reddit_post',
  'generic_post',
  'generic_carousel',
  'generic_video',
  'custom',
] as const;

export const ThinkForgePublishingSurfaceIdSchema = z.enum(THINKFORGE_PUBLISHING_SURFACE_IDS);
export type ThinkForgePublishingSurfaceId = z.infer<typeof ThinkForgePublishingSurfaceIdSchema>;

interface ThinkForgePublishingSurfaceDefinition {
  label: string;
  platformId: ThinkForgePlatformSurfaceId;
  outputKinds: readonly ThinkForgeWriterKind[];
}

const PUBLISHING_SURFACE_DEFINITIONS: Readonly<Record<
  ThinkForgePublishingSurfaceId,
  ThinkForgePublishingSurfaceDefinition
>> = {
  linkedin_post: { label: 'LinkedIn post', platformId: 'linkedin', outputKinds: ['social_post'] },
  linkedin_document_carousel: { label: 'LinkedIn document carousel', platformId: 'linkedin', outputKinds: ['carousel'] },
  x_post: { label: 'X post', platformId: 'x', outputKinds: ['social_post'] },
  instagram_feed: { label: 'Instagram feed post', platformId: 'instagram', outputKinds: ['social_post'] },
  instagram_carousel: { label: 'Instagram carousel', platformId: 'instagram', outputKinds: ['carousel'] },
  instagram_reels: { label: 'Instagram Reel', platformId: 'instagram', outputKinds: ['video_script'] },
  facebook_post: { label: 'Facebook post', platformId: 'facebook', outputKinds: ['social_post'] },
  facebook_carousel: { label: 'Facebook carousel', platformId: 'facebook', outputKinds: ['carousel'] },
  facebook_reels: { label: 'Facebook Reel', platformId: 'facebook', outputKinds: ['video_script'] },
  youtube_community_post: { label: 'YouTube Community post', platformId: 'youtube', outputKinds: ['social_post'] },
  youtube_video: { label: 'YouTube video', platformId: 'youtube', outputKinds: ['video_script'] },
  youtube_shorts: { label: 'YouTube Short', platformId: 'youtube', outputKinds: ['video_script'] },
  tiktok_video: { label: 'TikTok video', platformId: 'tiktok', outputKinds: ['video_script'] },
  reddit_post: { label: 'Reddit post', platformId: 'reddit', outputKinds: ['social_post'] },
  generic_post: { label: 'General social post', platformId: 'generic', outputKinds: ['social_post'] },
  generic_carousel: { label: 'General carousel', platformId: 'generic', outputKinds: ['carousel'] },
  generic_video: { label: 'General video', platformId: 'generic', outputKinds: ['video_script'] },
  custom: { label: 'Other destination', platformId: 'custom', outputKinds: ['social_post', 'carousel', 'video_script'] },
};

export function listThinkForgePublishingSurfaces(
  outputKind: ThinkForgeWriterKind,
): Array<{ id: ThinkForgePublishingSurfaceId; label: string; platformId: ThinkForgePlatformSurfaceId }> {
  return THINKFORGE_PUBLISHING_SURFACE_IDS.flatMap((id) => {
    const definition = PUBLISHING_SURFACE_DEFINITIONS[id];
    return definition.outputKinds.includes(outputKind)
      ? [{ id, label: definition.label, platformId: definition.platformId }]
      : [];
  });
}

export function describeThinkForgePublishingSurface(surface: ThinkForgePublishingSurfaceId): string {
  return PUBLISHING_SURFACE_DEFINITIONS[surface].label;
}

export function platformForThinkForgePublishingSurface(
  surface: ThinkForgePublishingSurfaceId,
): ThinkForgePlatformSurfaceId {
  return PUBLISHING_SURFACE_DEFINITIONS[surface].platformId;
}

const ThinkForgeCtaControlSchema = z.object({
  preference: z.enum(['editorial', 'none', 'soft', 'direct']),
  action: z.string().trim().min(1).max(240).optional(),
  destination: z.string().trim().min(1).max(2_048).optional(),
}).superRefine((control, ctx) => {
  if (control.preference === 'none' && (control.action || control.destination)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'a disabled CTA cannot carry an action or destination',
    });
  }
});

const ThinkForgeHashtagControlSchema = z.object({
  preference: z.enum(['editorial', 'none', 'exact']),
  values: z.array(
    z.string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^#[\p{L}\p{M}\p{N}_]+$/u, 'exact hashtags must start with # and contain only letters, marks, numbers, or underscores'),
  ).max(THINKFORGE_POST_HASHTAG_MAX).optional(),
}).superRefine((control, ctx) => {
  if (control.preference === 'exact' && (!control.values || control.values.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['values'],
      message: 'exact hashtag control requires at least one value',
    });
  }
  if (control.preference !== 'exact' && control.values !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['values'],
      message: 'hashtag values are only valid when preference is exact',
    });
  }
  if (control.values) {
    const seen = new Map<string, number>();
    control.values.forEach((value, index) => {
      const normalized = value.toLocaleLowerCase();
      const firstIndex = seen.get(normalized);
      if (firstIndex !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['values', index],
          message: `exact hashtags must be unique; duplicates value at index ${firstIndex}`,
        });
        return;
      }
      seen.set(normalized, index);
    });
  }
});

export const ThinkForgePostControlsSchema = z.object({
  version: z.number().int().default(THINKFORGE_POST_CONTROLS_VERSION),
  cta: ThinkForgeCtaControlSchema,
  hashtags: ThinkForgeHashtagControlSchema,
  emoji: z.object({
    preference: z.enum(['editorial', 'none', 'restrained']),
  }),
  targetLength: z.object({
    unit: z.enum(['characters', 'words']),
    value: z.number().int().positive().safe(),
  }).optional(),
}).superRefine((controls, ctx) => {
  if (controls.version !== THINKFORGE_POST_CONTROLS_VERSION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['version'],
      message: 'unsupported post controls version',
    });
  }
});

export type ThinkForgePostControls = z.infer<typeof ThinkForgePostControlsSchema>;

export const ThinkForgeAuthoringRequestSchema = z.object({
  version: z.number().int().default(THINKFORGE_AUTHORING_REQUEST_VERSION),
  contentContract: ThinkForgeDocumentContractSchema,
  platformSurface: ThinkForgePlatformSurfaceSchema,
  publishingSurface: ThinkForgePublishingSurfaceIdSchema.optional(),
  targetDurationSec: z.number().int().positive().safe().optional(),
  postControls: ThinkForgePostControlsSchema.optional(),
}).superRefine((request, ctx) => {
  if (request.version !== THINKFORGE_AUTHORING_REQUEST_VERSION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['version'],
      message: 'unsupported authoring request version',
    });
  }

  const writerKind = request.contentContract.outputKind;
  if (!['social_post', 'carousel', 'video_script'].includes(writerKind)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['contentContract', 'outputKind'],
      message: 'authoring intake currently requires a supported writer output kind',
    });
  }
  if (writerKind === 'carousel' && request.contentContract.carouselSlideCount === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['contentContract', 'carouselSlideCount'],
      message: 'carousel authoring requires an explicit slide count',
    });
  }
  if (writerKind === 'video_script' && request.postControls !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['postControls'],
      message: 'post controls are not valid for a video script',
    });
  }
  if (writerKind !== 'video_script' && request.targetDurationSec !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetDurationSec'],
      message: 'targetDurationSec is only valid for a video script',
    });
  }
  if ((writerKind === 'social_post' || writerKind === 'carousel') && request.postControls === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['postControls'],
      message: 'post authoring requires explicit post controls',
    });
  }
  if (request.publishingSurface) {
    const definition = PUBLISHING_SURFACE_DEFINITIONS[request.publishingSurface];
    if (!definition.outputKinds.includes(writerKind as ThinkForgeWriterKind)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publishingSurface'],
        message: `${request.publishingSurface} is incompatible with ${writerKind}`,
      });
    }
    if (definition.platformId !== request.platformSurface.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publishingSurface'],
        message: `${request.publishingSurface} does not belong to platform ${request.platformSurface.id}`,
      });
    }
  }
});

export type ThinkForgeAuthoringRequest = z.infer<typeof ThinkForgeAuthoringRequestSchema>;

export function inferLegacyThinkForgePublishingSurface(
  requestInput: Pick<ThinkForgeAuthoringRequest, 'contentContract' | 'platformSurface'>,
): ThinkForgePublishingSurfaceId | undefined {
  const outputKind = requestInput.contentContract.outputKind;
  const platformId = requestInput.platformSurface.id;
  const matching = listThinkForgePublishingSurfaces(outputKind as ThinkForgeWriterKind)
    .filter((surface) => surface.platformId === platformId);
  return matching.length === 1 ? matching[0]?.id : undefined;
}

const PLATFORM_LABELS: Record<Exclude<ThinkForgePlatformSurfaceId, 'custom'>, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  reddit: 'Reddit',
  medium: 'Medium',
  blog: 'Blog',
  newsletter: 'Newsletter',
  podcast: 'Podcast',
  internal: 'Internal',
  generic: 'General',
};

const PLATFORM_SURFACE_ALIASES: Readonly<Record<string, Exclude<ThinkForgePlatformSurfaceId, 'custom'>>> = {
  linkedin: 'linkedin',
  'linkedin post': 'linkedin',
  instagram: 'instagram',
  'instagram feed': 'instagram',
  'instagram reel': 'instagram',
  'instagram reels': 'instagram',
  facebook: 'facebook',
  'facebook post': 'facebook',
  'facebook reel': 'facebook',
  'facebook reels': 'facebook',
  x: 'x',
  twitter: 'x',
  'x post': 'x',
  'twitter post': 'x',
  'twitter x': 'x',
  youtube: 'youtube',
  'youtube video': 'youtube',
  'youtube short': 'youtube',
  'youtube shorts': 'youtube',
  tiktok: 'tiktok',
  'tik tok': 'tiktok',
  reddit: 'reddit',
  medium: 'medium',
  blog: 'blog',
  newsletter: 'newsletter',
  podcast: 'podcast',
  internal: 'internal',
  general: 'generic',
  generic: 'generic',
};

export function resolveThinkForgePlatformSurfaceFromLabel(
  label: string,
): ThinkForgePlatformSurface {
  const customLabel = label.trim();
  const normalized = customLabel
    .toLocaleLowerCase()
    .replace(/[\/_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const id = PLATFORM_SURFACE_ALIASES[normalized];
  return ThinkForgePlatformSurfaceSchema.parse(
    id ? { id } : { id: 'custom', customLabel },
  );
}

export function describeThinkForgePlatformSurface(surface: ThinkForgePlatformSurface): string {
  if (surface.id !== 'custom') return PLATFORM_LABELS[surface.id];
  if (!surface.customLabel) {
    throw new Error('custom platform surface is missing its label');
  }
  return surface.customLabel;
}

function describeDuration(seconds: number): string {
  if (seconds % 3_600 === 0) return `${seconds / 3_600}-hour`;
  if (seconds % 60 === 0) return `${seconds / 60}-minute`;
  return `${seconds}-second`;
}

export function describeThinkForgeAuthoringDeliverable(requestInput: ThinkForgeAuthoringRequest): string {
  const request = ThinkForgeAuthoringRequestSchema.parse(requestInput);
  const platform = request.publishingSurface
    ? describeThinkForgePublishingSurface(request.publishingSurface)
    : describeThinkForgePlatformSurface(request.platformSurface);
  const writerKind = request.contentContract.outputKind;
  if (writerKind === 'social_post') return request.publishingSurface ? platform : `${platform} post`;
  if (writerKind === 'carousel') {
    return request.publishingSurface
      ? `${request.contentContract.carouselSlideCount}-slide ${platform}`
      : `${request.contentContract.carouselSlideCount}-slide ${platform} carousel`;
  }
  if (writerKind === 'video_script') {
    const scriptLabel = request.publishingSurface ? `${platform} script` : `${platform} video script`;
    return request.targetDurationSec
      ? `${describeDuration(request.targetDurationSec)} ${scriptLabel}`
      : scriptLabel;
  }
  throw new Error(`unsupported ThinkForge writer kind: ${writerKind}`);
}

export interface ThinkForgeAuthoringCompatibilityMetadata {
  authoringRequest: ThinkForgeAuthoringRequest;
  contentContract: ThinkForgeDocumentContract;
  format: string;
  platform: string;
  durationSec: number | undefined;
}

/**
 * Legacy display fields remain persisted for older readers, but they are always
 * derived from the validated request and never act as independent authority.
 */
export function buildThinkForgeAuthoringCompatibilityMetadata(
  requestInput: ThinkForgeAuthoringRequest,
): ThinkForgeAuthoringCompatibilityMetadata {
  const authoringRequest = ThinkForgeAuthoringRequestSchema.parse(requestInput);
  return {
    authoringRequest,
    contentContract: authoringRequest.contentContract,
    format: describeThinkForgeAuthoringDeliverable(authoringRequest),
    platform: authoringRequest.publishingSurface
      ? describeThinkForgePublishingSurface(authoringRequest.publishingSurface)
      : describeThinkForgePlatformSurface(authoringRequest.platformSurface),
    durationSec: authoringRequest.targetDurationSec,
  };
}

export function createDefaultThinkForgePostControls(): ThinkForgePostControls {
  return {
    version: THINKFORGE_POST_CONTROLS_VERSION,
    cta: { preference: 'editorial' },
    hashtags: { preference: 'editorial' },
    emoji: { preference: 'editorial' },
  };
}

export function createThinkForgeAuthoringRequest(input: {
  contentContract: ThinkForgeDocumentContract;
  platformSurface: ThinkForgePlatformSurface;
  publishingSurface?: ThinkForgePublishingSurfaceId;
  targetDurationSec?: number;
  postControls?: ThinkForgePostControls;
}): ThinkForgeAuthoringRequest {
  return ThinkForgeAuthoringRequestSchema.parse({
    version: THINKFORGE_AUTHORING_REQUEST_VERSION,
    ...input,
  });
}
