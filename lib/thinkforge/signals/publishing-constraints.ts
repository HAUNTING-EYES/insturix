import type { OutputFormat } from '@/lib/shared/signals';

export const THINKFORGE_PUBLISHING_CONSTRAINTS_VERSION = 1;

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
  maxCharacters?: number;
  standardMaxCharacters?: number;
  extendedPostsRequireCapability?: boolean;
  maxDurationSeconds?: number;
}

function normalizePlatformLabel(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
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
  const base: ThinkForgePublishingConstraints = {
    platform,
    surface,
    policyVersion: THINKFORGE_PUBLISHING_CONSTRAINTS_VERSION,
  };

  if (outputFormat === 'social_post' && surface === 'linkedin_post') {
    // LinkedIn Help: ordinary posts accept at most 3,000 characters.
    return { ...base, maxCharacters: 3_000 };
  }

  if (outputFormat === 'social_post' && surface === 'x_post') {
    // X supports longer posts only when the connected account has that capability.
    return {
      ...base,
      standardMaxCharacters: 280,
      extendedPostsRequireCapability: true,
    };
  }

  if (outputFormat === 'video_script' && surface === 'youtube_shorts') {
    // YouTube Help: square or vertical Shorts may be up to three minutes.
    return { ...base, maxDurationSeconds: 180 };
  }

  return base;
}
