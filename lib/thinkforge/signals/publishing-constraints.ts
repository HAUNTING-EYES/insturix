import type { OutputFormat } from '@/lib/shared/signals';
import {
  ThinkForgeAuthoringRequestSchema,
  describeThinkForgePlatformSurface,
  type ThinkForgeAuthoringRequest,
} from '@/lib/thinkforge/schemas/authoring-request';

export const THINKFORGE_PUBLISHING_CONSTRAINTS_VERSION = 2;
export const THINKFORGE_PUBLISHING_POLICY_VERIFIED_AT = '2026-08-16';

export type ThinkForgePublishingSurface =
  | 'linkedin_post'
  | 'x_post'
  | 'instagram_feed'
  | 'instagram_reels'
  | 'youtube_video'
  | 'youtube_shorts'
  | 'tiktok_video'
  | 'facebook_post'
  | 'unknown';

export interface ThinkForgePublishingConstraints extends Record<string, unknown> {
  platform: string;
  surface: ThinkForgePublishingSurface;
  policyVersion: number;
  verifiedAt: string;
  sourceId?: 'linkedin_ugc_api' | 'x_counting_characters';
  characterCounting?: 'utf16_code_units_conservative' | 'x_weighted';
  maxCharacters?: number;
  standardMaxCharacters?: number;
  extendedPostsRequireCapability?: boolean;
  maxDurationSeconds?: number;
}

function normalizePlatformLabel(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function resolveTypedPublishingSurface(
  request: ThinkForgeAuthoringRequest,
): ThinkForgePublishingSurface {
  const isVideoScript = request.contentContract.outputKind === 'video_script';
  switch (request.platformSurface.id) {
    case 'linkedin':
      return 'linkedin_post';
    case 'x':
      return 'x_post';
    case 'instagram':
      return isVideoScript ? 'instagram_reels' : 'instagram_feed';
    case 'youtube':
      // The current authoring contract says YouTube, not YouTube Shorts.
      // A duration alone must never silently change the publishing product.
      return 'youtube_video';
    case 'tiktok':
      return 'tiktok_video';
    case 'facebook':
      return 'facebook_post';
    default:
      return 'unknown';
  }
}

function constraintsForSurface(
  platform: string,
  surface: ThinkForgePublishingSurface,
  outputFormat: OutputFormat,
): ThinkForgePublishingConstraints {
  const base: ThinkForgePublishingConstraints = {
    platform,
    surface,
    policyVersion: THINKFORGE_PUBLISHING_CONSTRAINTS_VERSION,
    verifiedAt: THINKFORGE_PUBLISHING_POLICY_VERIFIED_AT,
  };

  if (outputFormat === 'social_post' && surface === 'linkedin_post') {
    return {
      ...base,
      sourceId: 'linkedin_ugc_api',
      characterCounting: 'utf16_code_units_conservative',
      maxCharacters: 3_000,
    };
  }

  if (outputFormat === 'social_post' && surface === 'x_post') {
    return {
      ...base,
      sourceId: 'x_counting_characters',
      characterCounting: 'x_weighted',
      standardMaxCharacters: 280,
      extendedPostsRequireCapability: true,
    };
  }

  if (outputFormat === 'video_script' && surface === 'youtube_shorts') {
    return { ...base, maxDurationSeconds: 180 };
  }

  return base;
}

export function resolveThinkForgePublishingSurface(platform: string): ThinkForgePublishingSurface {
  const normalized = normalizePlatformLabel(platform);
  if (/\byoutube\b/.test(normalized) && /\bshorts?\b/.test(normalized)) return 'youtube_shorts';
  if (/\byoutube\b/.test(normalized)) return 'youtube_video';
  if (/\binstagram\b/.test(normalized) && /\breels?\b/.test(normalized)) return 'instagram_reels';
  if (/\binstagram\b/.test(normalized)) return 'instagram_feed';
  if (/\btiktok\b/.test(normalized)) return 'tiktok_video';
  if (/\blinkedin\b/.test(normalized)) return 'linkedin_post';
  if (normalized === 'x' || normalized === 'twitter' || normalized === 'x post' || normalized === 'twitter post') {
    return 'x_post';
  }
  if (/\bfacebook\b/.test(normalized)) return 'facebook_post';
  return 'unknown';
}

/**
 * Publishing policy only. ProductionBrief remains the owner of aspect ratio,
 * visual shape, and editable duration defaults.
 */
export function resolveThinkForgePublishingConstraints(
  platform: string,
  outputFormat: OutputFormat,
): ThinkForgePublishingConstraints {
  const surface = resolveThinkForgePublishingSurface(platform);
  return constraintsForSurface(platform, surface, outputFormat);
}

export function resolveThinkForgePublishingConstraintsForAuthoringRequest(
  requestInput: ThinkForgeAuthoringRequest,
): ThinkForgePublishingConstraints {
  const request = ThinkForgeAuthoringRequestSchema.parse(requestInput);
  const outputFormat: OutputFormat = request.contentContract.outputKind === 'video_script'
    ? 'video_script'
    : 'social_post';
  return constraintsForSurface(
    describeThinkForgePlatformSurface(request.platformSurface),
    resolveTypedPublishingSurface(request),
    outputFormat,
  );
}
