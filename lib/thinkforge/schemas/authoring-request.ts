import { z } from 'zod';
import {
  ThinkForgeDocumentContractSchema,
  type ThinkForgeDocumentContract,
} from './document-contract';

export const THINKFORGE_AUTHORING_REQUEST_VERSION = 1;
export const THINKFORGE_POST_CONTROLS_VERSION = 1;

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
  values: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
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
});

export type ThinkForgeAuthoringRequest = z.infer<typeof ThinkForgeAuthoringRequestSchema>;

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
  const platform = describeThinkForgePlatformSurface(request.platformSurface);
  const writerKind = request.contentContract.outputKind;
  if (writerKind === 'social_post') return `${platform} post`;
  if (writerKind === 'carousel') {
    return `${request.contentContract.carouselSlideCount}-slide ${platform} carousel`;
  }
  if (writerKind === 'video_script') {
    return request.targetDurationSec
      ? `${describeDuration(request.targetDurationSec)} ${platform} video script`
      : `${platform} video script`;
  }
  throw new Error(`unsupported ThinkForge writer kind: ${writerKind}`);
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
  targetDurationSec?: number;
  postControls?: ThinkForgePostControls;
}): ThinkForgeAuthoringRequest {
  return ThinkForgeAuthoringRequestSchema.parse({
    version: THINKFORGE_AUTHORING_REQUEST_VERSION,
    ...input,
  });
}
